import { useEffect, useRef, useState } from "react";

export type ProjectActionKind =
  | "create-file"
  | "create-folder"
  | "delete"
  | "rename";

interface ProjectActionDialogProps {
  action: ProjectActionKind;
  busy: boolean;
  initialPath: string;
  onCancel: () => void;
  onConfirm: (path: string) => void;
}

export function ProjectActionDialog({
  action,
  busy,
  initialPath,
  onCancel,
  onConfirm,
}: ProjectActionDialogProps) {
  const [path, setPath] = useState(initialPath);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const deleting = action === "delete";
  useEffect(() => {
    if (deleting) {
      confirmRef.current?.focus();
    } else {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [deleting]);

  const title =
    action === "create-file"
      ? "Create file"
      : action === "create-folder"
        ? "Create folder"
        : action === "rename"
          ? "Rename or move entry"
          : "Delete project entry";
  const confirmLabel =
    action === "create-file"
      ? "Create file"
      : action === "create-folder"
        ? "Create folder"
        : action === "rename"
          ? "Apply change"
          : "Delete permanently";

  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        className="project-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-action-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) {
            event.preventDefault();
            onCancel();
            return;
          }
          if (event.key === "Tab") {
            const controls = [
              ...(dialogRef.current?.querySelectorAll<
                HTMLButtonElement | HTMLInputElement
              >("button:not(:disabled), input:not(:disabled)") ?? []),
            ];
            const first = controls[0];
            const last = controls.at(-1);
            if (
              first !== undefined &&
              last !== undefined &&
              event.shiftKey &&
              document.activeElement === first
            ) {
              event.preventDefault();
              last.focus();
            } else if (
              first !== undefined &&
              last !== undefined &&
              !event.shiftKey &&
              document.activeElement === last
            ) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <p className="eyebrow">Project files</p>
        <h2 id="project-action-title">{title}</h2>
        {deleting ? (
          <p>
            Delete <strong>{initialPath}</strong>? Folders and all nested
            content will be removed. This action cannot be undone.
          </p>
        ) : (
          <label>
            Project-relative path
            <input
              ref={inputRef}
              value={path}
              maxLength={4096}
              disabled={busy}
              onChange={(event) => {
                setPath(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && path.trim() !== "") {
                  event.preventDefault();
                  onConfirm(path.trim());
                }
              }}
            />
          </label>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={deleting ? "button danger" : "button"}
            disabled={busy || (!deleting && path.trim() === "")}
            onClick={() => {
              onConfirm(deleting ? initialPath : path.trim());
            }}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
