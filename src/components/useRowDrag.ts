import { useCallback, useState, type DragEvent } from "react";

/** The drag data type for a reminder; the board, the calendar and the sidebar lists accept it. */
export const TASK_DRAG = "text/task-id";

/** Whether a drag carries a reminder (its id can only be read on drop). */
export function carriesTask(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(TASK_DRAG);
}

/**
 * Drag to reorder: each row gets drag props (with `enabled` false, rows can only be dragged
 * out, to a list in the sidebar or another board column), and a dropped reminder lands before or after the
 * row under the pointer (by which half it is over), shown with a line while dragging.
 * `onMove` gets the dragged id, the row it was dropped on and whether it goes after that row.
 */
export function useRowDrag(onMove: (id: string, targetId: string, after: boolean) => void, enabled = true) {
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);

  const rowProps = useCallback(
    (id: string) => {
      const source = {
        draggable: true,
        onDragStart: (e: DragEvent<HTMLElement>) => {
          e.dataTransfer.setData(TASK_DRAG, id);
          e.dataTransfer.effectAllowed = "move";
        },
      };
      if (!enabled) return source;
      return {
        ...source,
        "data-drop": over?.id === id ? (over.after ? "after" : "before") : undefined,
        onDragOver: (e: DragEvent<HTMLElement>) => {
          if (!carriesTask(e)) return;
          e.preventDefault();
          e.stopPropagation();
          const box = e.currentTarget.getBoundingClientRect();
          const after = e.clientY > box.top + box.height / 2;
          setOver((o) => (o?.id === id && o.after === after ? o : { id, after }));
        },
        onDragLeave: (e: DragEvent<HTMLElement>) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o?.id === id ? null : o));
        },
        onDrop: (e: DragEvent<HTMLElement>) => {
          if (!carriesTask(e)) return;
          e.preventDefault();
          e.stopPropagation();
          const dragged = e.dataTransfer.getData(TASK_DRAG);
          const box = e.currentTarget.getBoundingClientRect();
          setOver(null);
          if (dragged && dragged !== id) onMove(dragged, id, e.clientY > box.top + box.height / 2);
        },
        onDragEnd: () => setOver(null),
      };
    },
    [enabled, over, onMove],
  );

  return rowProps;
}
