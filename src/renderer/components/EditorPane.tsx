import { StreamLanguage } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { Decoration, EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

import type { BuildDiagnostic } from "../../ipc/build-contracts.js";
import type { DiagnosticTarget, EditorBuffer } from "../workspace-state.js";

interface EditorPaneProps {
  buffer: EditorBuffer;
  diagnostics: readonly BuildDiagnostic[];
  navigationTarget: DiagnosticTarget | null;
  onChange: (path: string, content: string) => void;
  onViewStateChange: (path: string, cursor: number, scrollTop: number) => void;
}

const setDiagnosticsEffect = StateEffect.define<readonly BuildDiagnostic[]>();
const setSyncTargetEffect = StateEffect.define<number | null>();

const diagnosticField = StateField.define({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    let updated = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setDiagnosticsEffect)) {
        updated = diagnosticDecorations(transaction.state, effect.value);
      }
    }
    return updated;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const syncTargetField = StateField.define({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    let updated = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setSyncTargetEffect)) {
        updated =
          effect.value === null
            ? Decoration.none
            : Decoration.set([
                Decoration.line({
                  attributes: {
                    class: "cm-synctex-target",
                    title: "Inverse search target",
                  },
                }).range(transaction.state.doc.line(effect.value).from),
              ]);
      }
    }
    return updated;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function EditorPane({
  buffer,
  diagnostics,
  navigationTarget,
  onChange,
  onViewStateChange,
}: EditorPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacksRef = useRef({ onChange, onViewStateChange });
  callbacksRef.current = { onChange, onViewStateChange };

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }

    const path = buffer.path;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: buffer.content,
        selection: EditorSelection.cursor(
          Math.min(buffer.cursor, buffer.content.length),
        ),
        extensions: [
          basicSetup,
          StreamLanguage.define(stex),
          EditorView.lineWrapping,
          diagnosticField,
          syncTargetField,
          EditorView.contentAttributes.of({
            "aria-label": `Editor for ${path}`,
            "data-testid": "code-editor",
          }),
          EditorView.theme(
            {
              "&": {
                height: "100%",
                backgroundColor: "#111827",
                color: "#e5e7eb",
                fontSize: "15px",
              },
              ".cm-content": {
                caretColor: "#f59e0b",
                fontFamily:
                  '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
                padding: "20px 0 80px",
              },
              ".cm-cursor": { borderLeftColor: "#f59e0b" },
              ".cm-gutters": {
                backgroundColor: "#111827",
                border: "none",
                color: "#64748b",
                paddingInlineEnd: "8px",
              },
              ".cm-activeLine, .cm-activeLineGutter": {
                backgroundColor: "rgba(255, 255, 255, 0.035)",
              },
              ".cm-selectionBackground, ::selection": {
                backgroundColor: "#334155 !important",
              },
              ".cm-scroller": { overflow: "auto" },
            },
            { dark: true },
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              callbacksRef.current.onChange(path, update.state.doc.toString());
            }
            if (update.docChanged || update.selectionSet) {
              callbacksRef.current.onViewStateChange(
                path,
                update.state.selection.main.head,
                update.view.scrollDOM.scrollTop,
              );
            }
          }),
        ],
      }),
    });
    viewRef.current = view;

    view.scrollDOM.scrollTop = buffer.scrollTop;
    const handleScroll = () => {
      callbacksRef.current.onViewStateChange(
        path,
        view.state.selection.main.head,
        view.scrollDOM.scrollTop,
      );
    };
    view.scrollDOM.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      handleScroll();
      viewRef.current = null;
      view.scrollDOM.removeEventListener("scroll", handleScroll);
      view.destroy();
    };
  }, [buffer.path]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: setDiagnosticsEffect.of(diagnostics),
    });
  }, [diagnostics]);

  useEffect(() => {
    const view = viewRef.current;
    if (view === null) {
      return;
    }
    if (navigationTarget === null || navigationTarget.path !== buffer.path) {
      view.dispatch({ effects: setSyncTargetEffect.of(null) });
      return;
    }
    const line = view.state.doc.line(
      Math.min(navigationTarget.line, view.state.doc.lines),
    );
    const position = Math.min(
      line.to,
      line.from + Math.max((navigationTarget.column ?? 1) - 1, 0),
    );
    view.dispatch({
      selection: EditorSelection.cursor(position),
      effects: [
        EditorView.scrollIntoView(position, { y: "center" }),
        setSyncTargetEffect.of(
          navigationTarget.kind === "synctex" ? line.number : null,
        ),
      ],
    });
    view.focus();
  }, [buffer.path, navigationTarget]);

  return <div className="editor-host" ref={hostRef} />;
}

function diagnosticDecorations(
  state: EditorState,
  diagnostics: readonly BuildDiagnostic[],
) {
  const byLine = new Map<
    number,
    { severity: BuildDiagnostic["severity"]; messages: string[] }
  >();
  for (const diagnostic of diagnostics) {
    if (diagnostic.line === null || diagnostic.line > state.doc.lines) {
      continue;
    }
    const existing = byLine.get(diagnostic.line);
    if (existing === undefined) {
      byLine.set(diagnostic.line, {
        severity: diagnostic.severity,
        messages: [diagnostic.message],
      });
    } else {
      existing.messages.push(diagnostic.message);
      if (severityRank(diagnostic.severity) > severityRank(existing.severity)) {
        existing.severity = diagnostic.severity;
      }
    }
  }
  return Decoration.set(
    [...byLine.entries()].map(([lineNumber, value]) =>
      Decoration.line({
        attributes: {
          class: `cm-diagnostic-line cm-diagnostic-${value.severity}`,
          title: value.messages.join("\n"),
        },
      }).range(state.doc.line(lineNumber).from),
    ),
    true,
  );
}

function severityRank(severity: BuildDiagnostic["severity"]): number {
  switch (severity) {
    case "error":
      return 3;
    case "warning":
      return 2;
    case "info":
      return 1;
  }
}
