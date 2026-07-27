/**
 * react-grid-layout wrapper for the Looker-style dashboard canvas.
 * Freeform drag & drop with resize; edit/view mode toggle disables both.
 */
import RGL, { WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import type { ReactNode } from "react";

const ReactGridLayout = WidthProvider(RGL);

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
  onLayoutChange: (layout: Layout[]) => void;
  rowHeight?: number;
}

export default function CanvasGridLayout({ items, editMode, onLayoutChange, rowHeight = 60 }: Props) {
  const layout: Layout[] = items.map((it) => ({ i: it.id, x: it.x, y: it.y, w: it.w, h: it.h }));
  return (
    <ReactGridLayout
      className="layout"
      layout={layout}
      cols={12}
      rowHeight={rowHeight}
      margin={[16, 16]}
      containerPadding={[0, 0]}
      isDraggable={editMode}
      isResizable={editMode}
      compactType={null}
      preventCollision={false}
      onLayoutChange={onLayoutChange}
      draggableCancel=".no-drag"
    >
      {items.map((it) => (
        <div key={it.id} className="bg-white rounded-lg border border-[#DADCE0] shadow-sm overflow-hidden">
          {it.content}
        </div>
      ))}
    </ReactGridLayout>
  );
}
