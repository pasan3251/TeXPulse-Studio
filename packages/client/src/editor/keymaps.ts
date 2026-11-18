import { toggleComment } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import type { EditorView, KeyBinding } from "@codemirror/view";

function wrapSelectionWithCommand(view: EditorView, commandName: string): boolean {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const selected = state.sliceDoc(range.from, range.to);
    const prefix = `\\${commandName}{`;
    const inserted = `${prefix}${selected}}`;
    const cursorPos =
      selected.length === 0
        ? range.from + prefix.length
        : range.from + inserted.length;
    return {
      changes: { from: range.from, to: range.to, insert: inserted },
      range: EditorSelection.cursor(cursorPos),
    };
  });
  view.dispatch(tr);
  return true;
}

/**
 * Standard Overleaf keyboard shortcuts:
 * - Mod-s / Mod-Enter: Trigger compile event
 * - Mod-/: Toggle `%` line comment
 * - Mod-b: Wrap selection in `\textbf{}`
 * - Mod-i: Wrap selection in `\textit{}`
 */
export function createOverleafKeymap(onCompileTrigger: () => void): readonly KeyBinding[] {
  return [
    {
      key: "Mod-s",
      preventDefault: true,
      run: () => {
        onCompileTrigger();
        return true;
      },
    },
    {
      key: "Mod-Enter",
      preventDefault: true,
      run: () => {
        onCompileTrigger();
        return true;
      },
    },
    {
      key: "Mod-/",
      preventDefault: true,
      run: toggleComment,
    },
    {
      key: "Mod-b",
      preventDefault: true,
      run: (view) => wrapSelectionWithCommand(view, "textbf"),
    },
    {
      key: "Mod-i",
      preventDefault: true,
      run: (view) => wrapSelectionWithCommand(view, "textit"),
    },
  ];
}
