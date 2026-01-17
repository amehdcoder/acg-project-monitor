import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Settings2, GripVertical, Maximize2, Minimize2 } from "lucide-react";
import WidgetRenderer from "./WidgetRenderer";
import type { DashboardWidget } from "@/hooks/useDashboardBuilder";
import type { SubmissionRecord } from "@/hooks/useDataAnalytics";

interface SortableWidgetProps {
  widget: DashboardWidget;
  submissions: SubmissionRecord[];
  questions: any[];
  isEditing: boolean;
  onEdit: (widget: DashboardWidget) => void;
  onDelete: (widgetId: string) => void;
  onResize: (widgetId: string, width: number, height: number) => void;
}

const SortableWidget = ({
  widget,
  submissions,
  questions,
  isEditing,
  onEdit,
  onDelete,
  onResize,
}: SortableWidgetProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const getColSpan = () => {
    if (widget.position.w >= 12) return "md:col-span-2 lg:col-span-3";
    if (widget.position.w >= 6) return "lg:col-span-2";
    return "";
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${getColSpan()}`}
    >
      {isEditing && (
        <div className="absolute -top-2 -left-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background rounded-md shadow-md border p-1">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="start">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Width</label>
                    <span className="text-xs text-muted-foreground">{widget.position.w} cols</span>
                  </div>
                  <Slider
                    value={[widget.position.w]}
                    onValueChange={([value]) => onResize(widget.id, value, widget.position.h)}
                    min={4}
                    max={12}
                    step={2}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Small</span>
                    <span>Full</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Height</label>
                    <span className="text-xs text-muted-foreground">{widget.position.h} rows</span>
                  </div>
                  <Slider
                    value={[widget.position.h]}
                    onValueChange={([value]) => onResize(widget.id, widget.position.w, value)}
                    min={3}
                    max={8}
                    step={1}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Compact</span>
                    <span>Tall</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onResize(widget.id, 4, 4)}
                  >
                    <Minimize2 className="h-3 w-3 mr-1" />
                    Small
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onResize(widget.id, 12, 6)}
                  >
                    <Maximize2 className="h-3 w-3 mr-1" />
                    Full
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
      <div style={{ minHeight: `${widget.position.h * 60}px` }}>
        <WidgetRenderer
          widget={widget}
          submissions={submissions}
          questions={questions}
          isEditing={isEditing}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
};

interface DraggableWidgetGridProps {
  widgets: DashboardWidget[];
  submissions: SubmissionRecord[];
  questions: any[];
  isEditing: boolean;
  onEdit: (widget: DashboardWidget) => void;
  onDelete: (widgetId: string) => void;
  onReorder: (widgets: DashboardWidget[]) => void;
  onResize: (widgetId: string, width: number, height: number) => void;
}

const DraggableWidgetGrid = ({
  widgets,
  submissions,
  questions,
  isEditing,
  onEdit,
  onDelete,
  onReorder,
  onResize,
}: DraggableWidgetGridProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = widgets.findIndex((w) => w.id === active.id);
        const newIndex = widgets.findIndex((w) => w.id === over.id);
        const newOrder = arrayMove(widgets, oldIndex, newIndex);
        onReorder(newOrder);
      }
    },
    [widgets, onReorder]
  );

  if (!isEditing) {
    return (
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {widgets.map((widget) => (
          <div
            key={widget.id}
            className={`${
              widget.position.w >= 12
                ? "md:col-span-2 lg:col-span-3"
                : widget.position.w >= 6
                ? "lg:col-span-2"
                : ""
            }`}
            style={{ minHeight: `${widget.position.h * 60}px` }}
          >
            <WidgetRenderer
              widget={widget}
              submissions={submissions}
              questions={questions}
              isEditing={false}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {widgets.map((widget) => (
            <SortableWidget
              key={widget.id}
              widget={widget}
              submissions={submissions}
              questions={questions}
              isEditing={isEditing}
              onEdit={onEdit}
              onDelete={onDelete}
              onResize={onResize}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default DraggableWidgetGrid;
