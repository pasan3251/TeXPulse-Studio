import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import { lintGutter, lintKeymap, linter, setDiagnostics } from "@codemirror/lint";
import { EditorSelection, EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { Tree } from "@lezer/common";
import type {
  ActiveMathBlock,
  AssistantStatusPayload,
  DiagnosticItem,
  EditorDiagnostic,
  OutlineHeading,
  ProjectSymbolIndex,
} from "@texpulse/shared";
import { latex } from "codemirror-lang-latex";
import { useEffect, useRef, useState } from "react";
import { computeMergedCodeMirrorDiagnostics } from "../editor/ast-linter.js";
import {
  autoCloseBraceInputHandler,
  autoCloseEnterKeymap,
  ensureEnvironmentAutoClose,
} from "../editor/auto-close-env.js";
import { createTexpulseCompletionSource } from "../editor/completions.js";
import { createOverleafKeymap } from "../editor/keymaps.js";
import { detectActiveMathBlock } from "../editor/math-detector.js";
import { extractOutlineFromTree } from "../editor/outline.js";
import { InlineCommandBar } from "./InlineCommandBar.js";
import { MathPreviewPopover } from "./MathPreviewPopover.js";

export interface EditorNavigationTarget {
  filePath: string;
  offset?: number | undefined;
  line?: number | undefined;
  column?: number | undefined;
  nonce: number;
}

export interface InlineInsertionPayload {
  filePath: string;
  text: string;
  nonce: number;
}

export interface EditorSnapshotPayload {
  docText: string;
  cursorOffset: number;
  selectedText: string;
  syntaxTree: Tree;
  outline: OutlineHeading[];
  activeMathBlock: ActiveMathBlock | null;
}

interface LatexEditorPaneProps {
  filePath: string;
  content: string;
  symbolIndex: ProjectSymbolIndex;
  compilerDiagnostics: readonly DiagnosticItem[];
  navigationTarget: EditorNavigationTarget | null;
  inlineInsertion?: InlineInsertionPayload | null | undefined;
  commandBarOpen: boolean;
  aiStatus: AssistantStatusPayload | null;
  aiCommandBusy: boolean;
  aiCommandError: string | null;
  onContentChange: (filePath: string, nextContent: string) => void;
  onSnapshotUpdate: (payload: EditorSnapshotPayload) => void;
  onDiagnosticsUpdate: (diagnostics: EditorDiagnostic[]) => void;
  onCompileTrigger: () => void;
  onOpenCommandBar: () => void;
  onCloseCommandBar: () => void;
  onSubmitInlineCommand: (instruction: string) => void;
  onGoToDefinition?: ((offset: number) => boolean) | undefined;
}

const texpulseHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--tp-cm-keyword)", fontWeight: "600" },
  { tag: tags.definitionKeyword, color: "var(--tp-cm-keyword)", fontWeight: "600" },
  { tag: tags.controlKeyword, color: "var(--tp-cm-keyword)", fontWeight: "600" },
  { tag: tags.heading, color: "var(--tp-cm-command)", fontWeight: "700" },
  { tag: tags.macroName, color: "var(--tp-cm-command)" },
  { tag: tags.function(tags.name), color: "var(--tp-cm-command)" },
  { tag: tags.labelName, color: "var(--tp-cm-string)" },
  { tag: tags.quote, color: "var(--tp-cm-string)" },
  { tag: tags.comment, color: "var(--tp-cm-comment)", fontStyle: "italic" },
  { tag: tags.special(tags.string), color: "var(--tp-cm-math)" },
  { tag: tags.bracket, color: "var(--tp-text-secondary)" },
]);

export function LatexEditorPane({
  filePath,
  content,
  symbolIndex,
  compilerDiagnostics,
  navigationTarget,
  inlineInsertion,
  commandBarOpen,
  aiStatus,
  aiCommandBusy,
  aiCommandError,
  onContentChange,
  onSnapshotUpdate,
  onDiagnosticsUpdate,
  onCompileTrigger,
  onOpenCommandBar,
  onCloseCommandBar,
  onSubmitInlineCommand,
  onGoToDefinition,
}: LatexEditorPaneProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const applyingExternalRef = useRef(false);

  const symbolIndexRef = useRef(symbolIndex);
  symbolIndexRef.current = symbolIndex;

  const compilerDiagnosticsRef = useRef(compilerDiagnostics);
  compilerDiagnosticsRef.current = compilerDiagnostics;

  const callbacksRef = useRef({
    onContentChange,
    onSnapshotUpdate,
    onDiagnosticsUpdate,
    onCompileTrigger,
    onOpenCommandBar,
    onGoToDefinition,
  });
  callbacksRef.current = {
    onContentChange,
    onSnapshotUpdate,
    onDiagnosticsUpdate,
    onCompileTrigger,
    onOpenCommandBar,
    onGoToDefinition,
  };

  const [activeMath, setActiveMath] = useState<ActiveMathBlock | null>(null);
  const [popoverTopPx, setPopoverTopPx] = useState(16);

  const syncMathAndSnapshot = (view: EditorView): void => {
    const docText = view.state.doc.toString();
    const sel = view.state.selection.main;
    const selectedText = docText.slice(sel.from, sel.to);
    const tree = syntaxTree(view.state);
    const outline = extractOutlineFromTree(docText, tree);
    const mathBlock = detectActiveMathBlock(view.state);

    setActiveMath(mathBlock);
    if (mathBlock !== null && stageRef.current !== null) {
      const coords = view.coordsAtPos(sel.head);
      const stageRect = stageRef.current.getBoundingClientRect();
      if (coords !== null) {
        const relativeBottom = coords.bottom - stageRect.top + 8;
        const maxTop = Math.max(16, stageRect.height - 140);
        const clampedTop = Math.min(Math.max(12, relativeBottom), maxTop);
        setPopoverTopPx(clampedTop);
      }
    }

    callbacksRef.current.onSnapshotUpdate({
      docText,
      cursorOffset: sel.head,
      selectedText,
      syntaxTree: tree,
      outline,
      activeMathBlock: mathBlock,
    });
  };

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      foldGutter(),
      bracketMatching(),
      EditorView.lineWrapping,
      syntaxHighlighting(texpulseHighlightStyle),
      Prec.highest(autoCloseBraceInputHandler),
      latex({
        autoCloseTags: false,
        autoCloseBrackets: true,
        enableLinting: false,
        enableTooltips: true,
        enableAutocomplete: false,
        fileName: filePath,
      }),
      ensureEnvironmentAutoClose,
      autocompletion({
        override: [createTexpulseCompletionSource(() => symbolIndexRef.current)],
        activateOnTyping: true,
        defaultKeymap: true,
        icons: false,
      }),
      lintGutter(),
      linter(
        (view) =>
          computeMergedCodeMirrorDiagnostics(
            view,
            filePath,
            symbolIndexRef.current,
            compilerDiagnosticsRef.current,
            (diags) => callbacksRef.current.onDiagnosticsUpdate(diags),
          ),
        { delay: 120 },
      ),
      Prec.highest(
        keymap.of([
          ...autoCloseEnterKeymap,
          ...createOverleafKeymap(
            () => callbacksRef.current.onCompileTrigger(),
            () => callbacksRef.current.onOpenCommandBar(),
            (offset) => callbacksRef.current.onGoToDefinition?.(offset) ?? false,
          ),
        ]),
      ),
      EditorView.domEventHandlers({
        mousedown: (event, view) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            !event.altKey &&
            !event.shiftKey &&
            event.button === 0
          ) {
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos !== null && callbacksRef.current.onGoToDefinition?.(pos)) {
              event.preventDefault();
              return true;
            }
          }
          return false;
        },
      }),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
      ]),
      EditorView.contentAttributes.of({
        "aria-label": `LaTeX source editor for ${filePath}`,
        "data-testid": "cm-latex-editor",
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !applyingExternalRef.current) {
          callbacksRef.current.onContentChange(
            filePath,
            update.state.doc.toString(),
          );
        }
        if (update.docChanged || update.selectionSet) {
          syncMathAndSnapshot(update.view);
        }
      }),
    ];

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: host,
    });

    viewRef.current = view;
    (window as unknown as { __TEXPULSE_EDITOR_VIEW__?: EditorView }).__TEXPULSE_EDITOR_VIEW__ =
      view;
    syncMathAndSnapshot(view);

    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [filePath]);

  // Synchronize external content changes cleanly
  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    if (view.state.doc.toString() === content) return;

    applyingExternalRef.current = true;
    try {
      const clampedHead = Math.min(view.state.selection.main.head, content.length);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
        selection: EditorSelection.cursor(clampedHead),
      });
      syncMathAndSnapshot(view);
    } finally {
      applyingExternalRef.current = false;
    }
  }, [content]);

  // Immediately push settled compiler diagnostics into CodeMirror 6 lint state
  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    const merged = computeMergedCodeMirrorDiagnostics(
      view,
      filePath,
      symbolIndexRef.current,
      compilerDiagnostics,
    );
    view.dispatch(setDiagnostics(view.state, merged));
  }, [compilerDiagnostics, filePath]);

  // Jump to outline heading, diagnostic offset, or inverse SyncTeX line/col
  useEffect(() => {
    const view = viewRef.current;
    if (view === null || navigationTarget === null || navigationTarget.filePath !== filePath) {
      return;
    }

    let clamped = 0;
    if (navigationTarget.line !== undefined) {
      const targetLine = Math.max(
        1,
        Math.min(navigationTarget.line, view.state.doc.lines),
      );
      const lineObj = view.state.doc.line(targetLine);
      const colOffset = Math.max(0, (navigationTarget.column ?? 1) - 1);
      clamped = Math.min(lineObj.to, lineObj.from + colOffset);
    } else {
      clamped = Math.max(
        0,
        Math.min(navigationTarget.offset ?? 0, view.state.doc.length),
      );
    }

    view.dispatch({
      selection: EditorSelection.cursor(clamped),
      effects: EditorView.scrollIntoView(clamped, { y: "center" }),
    });
    view.focus();
  }, [filePath, navigationTarget]);

  // Insert generated LaTeX or citation from Mod-K InlineCommandBar at current cursor
  useEffect(() => {
    const view = viewRef.current;
    if (view === null || !inlineInsertion || inlineInsertion.filePath !== filePath) {
      return;
    }
    const sel = view.state.selection.main;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: inlineInsertion.text },
      selection: EditorSelection.cursor(sel.from + inlineInsertion.text.length),
      effects: EditorView.scrollIntoView(sel.from + inlineInsertion.text.length, { y: "center" }),
    });
    view.focus();
  }, [filePath, inlineInsertion]);

  return (
    <div className="tp-editor-stage" ref={stageRef}>
      <div className="tp-cm-host" ref={hostRef} />
      {commandBarOpen ? (
        <InlineCommandBar
          status={aiStatus}
          busy={aiCommandBusy}
          errorMessage={aiCommandError}
          onSubmit={onSubmitInlineCommand}
          onClose={() => {
            onCloseCommandBar();
            viewRef.current?.focus();
          }}
        />
      ) : null}
      {activeMath !== null ? (
        <MathPreviewPopover mathBlock={activeMath} topPx={popoverTopPx} />
      ) : null}
    </div>
  );
}
