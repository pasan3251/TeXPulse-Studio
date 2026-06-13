import { StreamLanguage } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

import type { EditorBuffer } from "../workspace-state.js";

interface EditorPaneProps {
  buffer: EditorBuffer;
  onChange: (path: string, content: string) => void;
  onViewStateChange: (path: string, cursor: number, scrollTop: number) => void;
}

export function EditorPane({
  buffer,
  onChange,
  onViewStateChange,
}: EditorPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
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
      view.scrollDOM.removeEventListener("scroll", handleScroll);
      view.destroy();
    };
  }, [buffer.path]);

  return <div className="editor-host" ref={hostRef} />;
}
