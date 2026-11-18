import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";

function hasFollowingMatchingEnd(
  docText: string,
  envName: string,
  afterPos: number,
): boolean {
  const escaped = envName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const tokenRe = new RegExp(`\\\\(begin|end)\\{${escaped}\\}`, "gu");
  const tail = docText.slice(afterPos);
  let depth = 1;
  for (const match of tail.matchAll(tokenRe)) {
    if (match[1] === "begin") {
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) return true;
    }
  }
  return false;
}

/**
 * Handles `\begin{env}` + `}` at text-input level (`EditorView.inputHandler`)
 * instead of `keydown` so `closeBrackets()` and browser/CDP `beforeinput`
 * events never insert a stray `}` inside the newly opened environment.
 */
export const autoCloseBraceInputHandler = EditorView.inputHandler.of(
  (view: EditorView, from: number, to: number, insert: string): boolean => {
    if (insert !== "}" || from !== to) return false;

    const { state } = view;
    const line = state.doc.lineAt(from);
    const beforeCursor = state.sliceDoc(line.from, from);
    const match = /^(?<indent>\s*)\\begin\{(?<env>[a-zA-Z0-9*+@]+)$/u.exec(
      beforeCursor,
    );
    if (match === null) return false;

    const envName = match.groups?.env;
    if (!envName) return false;

    const nextChar = state.sliceDoc(from, from + 1);
    const hasExistingCloseBrace = nextChar === "}";
    const afterBracePos = hasExistingCloseBrace ? from + 1 : from;
    const afterBraceOnLine = state.sliceDoc(afterBracePos, line.to);

    if (afterBraceOnLine.trim().length > 0) return false;
    if (hasFollowingMatchingEnd(state.doc.toString(), envName, afterBracePos)) {
      return false;
    }

    const indent = match.groups?.indent ?? "";
    const innerIndent = `${indent}  `;
    const suffix = `${hasExistingCloseBrace ? "" : "}"}\n${innerIndent}\n${indent}\\end{${envName}}`;
    const targetCursor = from + 1 + 1 + innerIndent.length;

    view.dispatch({
      changes: { from: afterBracePos, to: afterBracePos, insert: suffix },
      selection: EditorSelection.cursor(targetCursor),
      userEvent: "input.auto-close",
    });
    return true;
  },
);

/**
 * Pressing Enter immediately after `\begin{env}` inserts an indented body line
 * and `\end{env}` when not already closed.
 */
export const autoCloseEnterKeymap: readonly KeyBinding[] = [
  {
    key: "Enter",
    run: (view: EditorView): boolean => {
      const { state } = view;
      const { main } = state.selection;
      if (main.from !== main.to) return false;

      const line = state.doc.lineAt(main.from);
      const beforeCursor = state.sliceDoc(line.from, main.from);
      const afterCursor = state.sliceDoc(main.from, line.to);
      if (afterCursor.trim().length > 0) return false;

      const match = /^(?<indent>\s*)\\begin\{(?<env>[a-zA-Z0-9*+@]+)\}[ \t]*$/u.exec(
        beforeCursor,
      );
      if (match === null) return false;
      const envName = match.groups?.env;
      if (!envName) return false;
      if (hasFollowingMatchingEnd(state.doc.toString(), envName, main.from)) {
        return false;
      }

      const indent = match.groups?.indent ?? "";
      const innerIndent = `${indent}  `;
      const suffix = `\n${innerIndent}\n${indent}\\end{${envName}}`;
      view.dispatch({
        changes: { from: main.from, to: main.from, insert: suffix },
        selection: EditorSelection.cursor(main.from + 1 + innerIndent.length),
        userEvent: "input.auto-close",
      });
      return true;
    },
  },
];

/**
 * Fallback transaction filter for pasted/completed `\begin{env}` or
 * programmatic `state.update` edits (with `sequential: true`).
 */
export const ensureEnvironmentAutoClose = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  if (!tr.isUserEvent("input")) return tr;
  if (tr.isUserEvent("input.auto-close")) return tr;

  let alreadyContainsEnd = false;
  tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    if (inserted.sliceString(0).includes("\\end{")) {
      alreadyContainsEnd = true;
    }
  });
  if (alreadyContainsEnd) return tr;

  const nextDoc = tr.newDoc;
  const head = tr.newSelection.main.head;
  const line = nextDoc.lineAt(head);
  const beforeOnLine = nextDoc.sliceString(line.from, head);
  const afterOnLine = nextDoc.sliceString(head, line.to);

  const beginMatch = /^(?<indent>\s*)\\begin\{(?<env>[a-zA-Z0-9*+@]+)\}$/u.exec(
    beforeOnLine,
  );
  if (beginMatch === null) return tr;
  if (afterOnLine.trim().length > 0) return tr;

  const envName = beginMatch.groups?.env;
  if (!envName) return tr;

  const nextText = nextDoc.toString();
  if (hasFollowingMatchingEnd(nextText, envName, head)) {
    return tr;
  }

  const indent = beginMatch.groups?.indent ?? "";
  const innerIndent = `${indent}  `;
  const suffix = `\n${innerIndent}\n${indent}\\end{${envName}}`;

  return [
    tr,
    {
      changes: { from: head, insert: suffix },
      selection: EditorSelection.cursor(head + 1 + innerIndent.length),
      sequential: true,
      userEvent: "input.auto-close",
    },
  ];
});
