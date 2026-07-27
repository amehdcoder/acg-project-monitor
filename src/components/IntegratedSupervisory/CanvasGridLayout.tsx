/**
 * react-grid-layout wrapper for the Looker-style dashboard canvas.
 * Freeform drag & drop with resize; edit/view mode disables both.
 * Drag handle = `.widget-drag-handle`; cancel zone = `.widget-no-drag`.
 */
import GridLayout, { WidthProvider } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import type { ReactNode } from "react";

const ReactGridLayout = WidthProvider(GridLayout);

export interface CanvasItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  content: ReactNode;
}

interface Props {
  items: CanvasItem[];
  editMode: boolean;
  onLayoutChange: (layout: { i: string; x: number; y: number; w: number; h: number }[]) => void;
  rowHeight?: number;
}

export default function CanvasGridLayout({ items, editMode, onLayoutChange, rowHeight = 140 }: Props) {
  const layout = items.map((it) => ({ i: it.id, x: it.x, y: it.y, w: it.w, h: it.h }));
  return (
    <ReactGridLayout
      className="layout"
      layout={layout as any}
      cols={12}
      rowHeight={rowHeight}
      margin={[16, 16]}
      containerPadding={[0, 0]}
      isDraggable={editMode}
      isResizable={editMode}
      compactType={null}
      preventCollision={false}
      onLayoutChange={(l: any) => onLayoutChange(l.map((x: any) => ({ i: x.i, x: x.x, y: x.y, w: x.w, h: x.h })))}
      draggableHandle=".widget-drag-handle"
      draggableCancel=".widget-no-drag"
    >
      {items.map((it) => (
        <div key={it.id} className="overflow-hidden">{it.content}</div>
      ))}
    </ReactGridLayout>
  );
}
