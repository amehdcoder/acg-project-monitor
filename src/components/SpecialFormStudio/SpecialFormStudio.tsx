import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Plus,
  Trash2,
  Type,
  Hash,
  ListChecks,
  CircleDot,
  Calendar,
  Image as ImageIcon,
  PenLine,
  MapPin,
  StickyNote,
  Palette,
  LayoutList,
  Save,
  X,
  Eye,
  Layers,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import ThemeEditor from "@/components/FormBuilder/ThemeEditor";
import type { FormGroup, Question, QuestionType } from "@/components/FormBuilder/types";
import {
  DEFAULT_FORM_THEME,
  buildFormThemeStyle,
  hexToHslChannels,
  normalizeFormTheme,
  type FormTheme,
} from "@/lib/formTheme";
import PresetPicker from "./PresetPicker";
import FieldLogicEditor from "./FieldLogicEditor";
import StudioHistoryPanel from "./StudioHistoryPanel";
import { type StudioPreset, type DashboardConfig } from "@/lib/specialStudio/presets";
import { diffForms, recordStudioAudit } from "@/lib/specialStudio/audit";
import {
  reconcileDashboardConfig,
  configNeedsSync,
  applyConfigToForm,
  flatQuestions,
  isNumeric,
  isCategorical,
  isGeoLike,
} from "@/lib/specialStudio/dashboardSync";
import { History as HistoryIcon, LayoutDashboard, GitBranch, Gauge } from "lucide-react";

const uid = () => Math.random().toString(36).slice(2, 10);

interface PaletteItem {
  type: QuestionType;
  label: string;
  icon: typeof Type;
}

const PALETTE: PaletteItem[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "number", label: "Number", icon: Hash },
  { type: "select_one", label: "Single choice", icon: CircleDot },
  { type: "select_multiple", label: "Multi choice", icon: ListChecks },
  { type: "date", label: "Date", icon: Calendar },
  { type: "image", label: "Photo", icon: ImageIcon },
  { type: "signature", label: "Signature", icon: PenLine },
  { type: "geopoint", label: "GPS point", icon: MapPin },
  { type: "note", label: "Note / label", icon: StickyNote },
];

function newQuestion(type: QuestionType): Question {
  const q: Question = {
    id: uid(),
    type,
    label: PALETTE.find((p) => p.type === type)?.label || "Question",
    name: `q_${uid()}`,
    required: false,
  };
  if (type === "select_one" || type === "select_multiple") {
    q.options = [
      { id: uid(), label: "Option 1", value: "opt1" },
      { id: uid(), label: "Option 2", value: "opt2" },
    ];
  }
  return q;
}

function newSection(label = "New section"): FormGroup {
  return { id: uid(), name: `sec_${uid()}`, label, questions: [] };
}

const PRESET_THEME: FormTheme = {
  ...DEFAULT_FORM_THEME,
  enabled: true,
  cardStyle: "elevated",
  density: "comfortable",
  light: { ...DEFAULT_FORM_THEME.light, primary: "#0c2340", accent: "#c8102e", headerBg: "#0c2340" },
};

/* ---------------- Sortable field row ---------------- */
function SortableField({
  q,
  active,
  onSelect,
  onDelete,
}: {
  q: Question;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: q.id,
  });
  const Icon = PALETTE.find((p) => p.type === q.type)?.icon || Type;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`flex items-center gap-2 rounded-lg border bg-card px-2 py-2 text-sm shadow-sm ${
        active ? "border-primary ring-1 ring-primary" : "border-border"
      }`}
      onClick={onSelect}
    >
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground touch-none">
        <GripVertical className="h-4 w-4" />
      </button>
      <Icon className="h-4 w-4 text-indigo-500 shrink-0" />
      <span className="flex-1 truncate">{q.label || "(untitled)"}</span>
      {q.required && <span className="text-[10px] font-semibold text-red-500">REQ</span>}
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-muted-foreground hover:text-destructive">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ---------------- Sortable section ---------------- */
function SortableSection({
  section,
  selectedFieldId,
  onSelectField,
  onDeleteField,
  onReorderFields,
  onRename,
  onDeleteSection,
  onAddField,
}: {
  section: FormGroup;
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
  onDeleteField: (id: string) => void;
  onReorderFields: (ids: string[]) => void;
  onRename: (label: string) => void;
  onDeleteSection: () => void;
  onAddField: (t: QuestionType) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `section:${section.id}`,
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleFieldDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = section.questions.map((q) => q.id);
    const oldI = ids.indexOf(active.id as string);
    const newI = ids.indexOf(over.id as string);
    if (oldI < 0 || newI < 0) return;
    onReorderFields(arrayMove(ids, oldI, newI));
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="rounded-xl border border-border bg-muted/30 p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground touch-none">
          <GripVertical className="h-4 w-4" />
        </button>
        <Layers className="h-4 w-4 text-primary" />
        <Input
          value={section.label}
          onChange={(e) => onRename(e.target.value)}
          className="h-8 flex-1 font-semibold"
        />
        <button onClick={onDeleteSection} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFieldDragEnd}>
        <SortableContext items={section.questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {section.questions.length === 0 && (
              <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                Add fields from the palette →
              </p>
            )}
            {section.questions.map((q) => (
              <SortableField
                key={q.id}
                q={q}
                active={selectedFieldId === q.id}
                onSelect={() => onSelectField(q.id)}
                onDelete={() => onDeleteField(q.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="mt-2 flex flex-wrap gap-1">
        {PALETTE.slice(0, 5).map((p) => (
          <button
            key={p.type}
            onClick={() => onAddField(p.type)}
            className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-accent hover:text-accent-foreground"
          >
            <Plus className="h-3 w-3" /> {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Live preview ---------------- */
function LivePreview({ sections, theme, isDark, name }: { sections: FormGroup[]; theme: FormTheme; isDark: boolean; name: string }) {
  const style = buildFormThemeStyle(theme, isDark);
  return (
    <div style={style} className="min-h-full rounded-xl bg-background p-4 text-foreground">
      <div
        className="mb-4 rounded-xl px-4 py-4"
        style={{
          background: `hsl(${hexToHslChannels(isDark ? theme.dark.headerBg : theme.light.headerBg)})`,
          color: `hsl(${hexToHslChannels(isDark ? theme.dark.headerText : theme.light.headerText)})`,
        }}
      >
        <h2 className="text-lg font-bold">{name || "Untitled special form"}</h2>
      </div>
      <div className="space-y-4" style={{ gap: "var(--form-field-gap)" }}>
        {sections.map((s) => (
          <div
            key={s.id}
            className={
              theme.cardStyle === "elevated"
                ? "rounded-xl bg-card p-4 shadow-lg"
                : theme.cardStyle === "bordered"
                ? "rounded-xl border border-border bg-card p-4"
                : "rounded-xl bg-card p-4"
            }
          >
            <h3 className="mb-3 font-semibold text-primary">{s.label}</h3>
            <div className={theme.columns === 2 ? "grid grid-cols-2 gap-3" : "space-y-3"}>
              {s.questions.map((q) => (
                <div key={q.id}>
                  <label className="mb-1 block text-sm font-medium">
                    {q.label} {q.required && <span className="text-red-500">*</span>}
                  </label>
                  {q.type === "note" ? (
                    <p className="text-xs text-muted-foreground">{q.hint || "Informational note"}</p>
                  ) : q.type === "select_one" || q.type === "select_multiple" ? (
                    <div className="space-y-1">
                      {(q.options || []).map((o) => (
                        <div key={o.id} className="flex items-center gap-2 text-sm">
                          <span className={`h-3.5 w-3.5 border border-border ${q.type === "select_one" ? "rounded-full" : "rounded"}`} />
                          {o.label}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-9 rounded-md border border-input bg-background px-3 text-sm leading-9 text-muted-foreground">
                      {q.type === "date" ? "Select date" : q.type === "geopoint" ? "Capture GPS" : q.type === "image" ? "Take photo" : q.type === "signature" ? "Sign here" : "Enter value"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= Main studio ================= */
interface Props {
  onClose: () => void;
  projectId?: string | null;
  editForm?: { id: string; name: string; description?: string | null; questions: any; settings: any };
}

export default function SpecialFormStudio({ onClose, projectId, editForm }: Props) {
  const { profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const initialSections: FormGroup[] = useMemo(() => {
    const raw = editForm?.questions;
    if (Array.isArray(raw) && raw.length) {
      const groups = raw.filter((r: any) => Array.isArray(r?.questions));
      if (groups.length) return groups as FormGroup[];
    }
    return [newSection("Section 1")];
  }, [editForm]);

  const [name, setName] = useState(editForm?.name || "");
  const [description, setDescription] = useState(editForm?.description || "");
  const [sections, setSections] = useState<FormGroup[]>(initialSections);
  const [theme, setTheme] = useState<FormTheme>(
    editForm?.settings?.theme ? normalizeFormTheme(editForm.settings.theme) : PRESET_THEME,
  );
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string>(initialSections[0]?.id || "");
  const [rightTab, setRightTab] = useState("field");
  const [saving, setSaving] = useState(false);

  // Starter presets: show the picker for brand-new forms only.
  const [presetKey, setPresetKey] = useState<string | null>(
    editForm?.id ? (editForm.settings?.presetKey ?? "custom") : null,
  );
  // Linked dashboard config, pre-wired by presets.
  const [dashboardEnabled, setDashboardEnabled] = useState<boolean>(!!editForm?.settings?.dashboardEnabled);
  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(
    (editForm?.settings?.dashboardConfig as DashboardConfig | undefined) ?? null,
  );
  const [showHistory, setShowHistory] = useState(false);

  // Snapshot of the last-saved state, used to compute the edit-history diff.
  const prevSnapshotRef = useRef<{ sections: FormGroup[]; name: string; theme: FormTheme } | null>(
    editForm?.id ? { sections: initialSections, name: editForm.name || "", theme: editForm?.settings?.theme ? normalizeFormTheme(editForm.settings.theme) : PRESET_THEME } : null,
  );

  // Keep the linked dashboard structure in sync as the form is edited:
  // stale field references are dropped and empty slots auto-suggested.
  useEffect(() => {
    if (!dashboardEnabled) return;
    setDashboardConfig((prev) => {
      if (prev && !configNeedsSync(sections, prev)) return prev;
      return reconcileDashboardConfig(sections, prev);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, dashboardEnabled]);


  const applyPreset = (preset: StudioPreset) => {
    if (preset.key !== "blank") {
      if (!name.trim()) setName(preset.title);
      const secs = preset.sections();
      setSections(secs);
      setActiveSectionId(secs[0]?.id || "");
      setTheme(preset.theme);
      setDashboardEnabled(true);
      setDashboardConfig(preset.dashboard());
    }
    setPresetKey(preset.key);
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const selectedField = useMemo(() => {
    for (const s of sections) {
      const q = s.questions.find((x) => x.id === selectedFieldId);
      if (q) return { section: s, q };
    }
    return null;
  }, [sections, selectedFieldId]);

  const patchField = (patch: Partial<Question>) => {
    if (!selectedField) return;
    setSections((prev) =>
      prev.map((s) =>
        s.id === selectedField.section.id
          ? { ...s, questions: s.questions.map((q) => (q.id === selectedField.q.id ? { ...q, ...patch } : q)) }
          : s,
      ),
    );
  };

  const addField = (sectionId: string, type: QuestionType) => {
    const q = newQuestion(type);
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, questions: [...s.questions, q] } : s)));
    setSelectedFieldId(q.id);
    setActiveSectionId(sectionId);
    setRightTab("field");
  };

  const handleSectionDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = sections.map((s) => `section:${s.id}`);
    const oldI = ids.indexOf(active.id as string);
    const newI = ids.indexOf(over.id as string);
    if (oldI < 0 || newI < 0) return;
    setSections((prev) => arrayMove(prev, oldI, newI));
  };

  const save = async (publish: boolean) => {
    if (!name.trim()) return toast.error("Give your form a name first.");
    if (!projectId) return toast.error("Select a project before saving.");
    setSaving(true);
    try {
      const payload: any = {
        name: name.trim(),
        description: description.trim() || null,
        questions: sections as any,
        settings: {
          theme,
          studio: true,
          presetKey: presetKey && presetKey !== "custom" ? presetKey : (presetKey ?? "custom"),
          dashboardEnabled,
          dashboardConfig: dashboardEnabled ? dashboardConfig : null,
        } as any,
        project_id: projectId,
        created_by: profile?.user_id,
        status: publish ? "active" : "draft",
      };

      const changes = diffForms(prevSnapshotRef.current, { sections, name: name.trim(), theme });
      let savedId = editForm?.id || null;

      if (editForm?.id) {
        const { error } = await supabase.from("forms").update(payload).eq("id", editForm.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("forms").insert(payload).select("id").single();
        if (error) throw error;
        savedId = (data as { id: string } | null)?.id || null;
      }

      await recordStudioAudit({
        formId: savedId,
        projectId,
        formName: name.trim(),
        action: editForm?.id ? (publish ? "published" : "updated") : "created",
        changes,
        userId: profile?.user_id,
        userName: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null,
        userEmail: profile?.email || null,
      });
      prevSnapshotRef.current = { sections, name: name.trim(), theme };

      toast.success(publish ? "Special form published." : "Draft saved.");
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  // Brand-new form: choose a starter (with dashboard pre-wired) first.
  if (presetKey === null) {
    return <PresetPicker onPick={applyPreset} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {editForm?.id && (
        <StudioHistoryPanel formId={editForm.id} open={showHistory} onOpenChange={setShowHistory} />
      )}
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Exit
        </Button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-purple-700 text-white">
            <Palette className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">Special Form Studio</div>
            <div className="text-[11px] text-muted-foreground">Drag &amp; drop builder</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {editForm?.id && (
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)} className="gap-1">
              <HistoryIcon className="h-4 w-4" /> History
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={saving} onClick={() => save(false)}>
            Save draft
          </Button>
          <Button size="sm" disabled={saving} onClick={() => save(true)} className="gap-1">
            <Save className="h-4 w-4" /> Publish
          </Button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[240px_1fr_320px]">
        {/* Left: palette + form meta */}
        <ScrollArea className="hidden border-r border-border lg:block">
          <div className="space-y-4 p-4">
            <div>
              <Label className="text-xs">Form name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. School Validation" className="mt-1 h-8" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 min-h-[60px] resize-none text-sm" />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
                <LayoutList className="h-3.5 w-3.5" /> Field palette
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {PALETTE.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.type}
                      onClick={() => activeSectionId && addField(activeSectionId, p.type)}
                      className="flex flex-col items-center gap-1 rounded-lg border border-border bg-card px-2 py-2.5 text-[11px] hover:border-primary hover:bg-accent"
                    >
                      <Icon className="h-4 w-4 text-indigo-500" />
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">Adds to the active section.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1"
              onClick={() => {
                const s = newSection(`Section ${sections.length + 1}`);
                setSections((prev) => [...prev, s]);
                setActiveSectionId(s.id);
              }}
            >
              <Plus className="h-4 w-4" /> Add section
            </Button>

            {/* Linked dashboard */}
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <LayoutDashboard className="h-3.5 w-3.5 text-indigo-500" /> Linked dashboard
                </div>
                <Switch
                  checked={dashboardEnabled}
                  onCheckedChange={(v) => {
                    setDashboardEnabled(v);
                    if (v && !dashboardConfig) {
                      setDashboardConfig({
                        enabled: true,
                        kpiFields: sections
                          .flatMap((s) => s.questions)
                          .filter((q) => q.type === "number" && q.name)
                          .slice(0, 2)
                          .map((q) => q.name!),
                        accent: theme.light.primary,
                      });
                    }
                  }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Monitor submissions instantly in a live dashboard for this form.
              </p>
            </div>
          </div>
        </ScrollArea>

        {/* Center: canvas */}
        <ScrollArea className="bg-muted/20">
          <div className="mx-auto max-w-2xl space-y-3 p-4" onClick={() => {}}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
              <SortableContext items={sections.map((s) => `section:${s.id}`)} strategy={verticalListSortingStrategy}>
                {sections.map((s) => (
                  <div key={s.id} onClick={() => setActiveSectionId(s.id)} className={activeSectionId === s.id ? "ring-2 ring-primary/40 rounded-xl" : ""}>
                    <SortableSection
                      section={s}
                      selectedFieldId={selectedFieldId}
                      onSelectField={(id) => { setSelectedFieldId(id); setRightTab("field"); }}
                      onDeleteField={(id) =>
                        setSections((prev) => prev.map((x) => (x.id === s.id ? { ...x, questions: x.questions.filter((q) => q.id !== id) } : x)))
                      }
                      onReorderFields={(ids) =>
                        setSections((prev) =>
                          prev.map((x) =>
                            x.id === s.id
                              ? { ...x, questions: ids.map((qid) => x.questions.find((q) => q.id === qid)!).filter(Boolean) }
                              : x,
                          ),
                        )
                      }
                      onRename={(label) => setSections((prev) => prev.map((x) => (x.id === s.id ? { ...x, label } : x)))}
                      onDeleteSection={() => setSections((prev) => prev.filter((x) => x.id !== s.id))}
                      onAddField={(t) => addField(s.id, t)}
                    />
                  </div>
                ))}
              </SortableContext>
            </DndContext>
            <div className="lg:hidden">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1"
                onClick={() => {
                  const s = newSection(`Section ${sections.length + 1}`);
                  setSections((prev) => [...prev, s]);
                  setActiveSectionId(s.id);
                }}
              >
                <Plus className="h-4 w-4" /> Add section
              </Button>
            </div>
          </div>
        </ScrollArea>

        {/* Right: inspector */}
        <div className="hidden flex-col border-l border-border lg:flex">
          <Tabs value={rightTab} onValueChange={setRightTab} className="flex flex-1 flex-col overflow-hidden">
            <TabsList className="mx-3 mt-3 grid grid-cols-5">
              <TabsTrigger value="field">Field</TabsTrigger>
              <TabsTrigger value="logic" className="gap-1"><GitBranch className="h-3.5 w-3.5" /> Logic</TabsTrigger>
              <TabsTrigger value="dashboard" className="gap-1"><Gauge className="h-3.5 w-3.5" /> Dashboard</TabsTrigger>
              <TabsTrigger value="style" className="gap-1"><Palette className="h-3.5 w-3.5" /> Style</TabsTrigger>
              <TabsTrigger value="preview" className="gap-1"><Eye className="h-3.5 w-3.5" /> Preview</TabsTrigger>
            </TabsList>

            <TabsContent value="field" className="mt-0 flex-1 overflow-auto p-4">
              {!selectedField ? (
                <p className="pt-10 text-center text-sm text-muted-foreground">Select a field to edit its settings.</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Question label</Label>
                    <Input value={selectedField.q.label} onChange={(e) => patchField({ label: e.target.value })} className="mt-1 h-8" />
                  </div>
                  <div>
                    <Label className="text-xs">Hint / help text</Label>
                    <Input value={selectedField.q.hint || ""} onChange={(e) => patchField({ hint: e.target.value })} className="mt-1 h-8" />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <Label className="text-sm">Required</Label>
                    <Switch checked={selectedField.q.required} onCheckedChange={(v) => patchField({ required: v })} />
                  </div>
                  {(selectedField.q.type === "select_one" || selectedField.q.type === "select_multiple") && (
                    <div>
                      <Label className="text-xs">Options</Label>
                      <div className="mt-1 space-y-1.5">
                        {(selectedField.q.options || []).map((o, i) => (
                          <div key={o.id} className="flex items-center gap-1">
                            <Input
                              value={o.label}
                              onChange={(e) => {
                                const opts = [...(selectedField.q.options || [])];
                                opts[i] = { ...o, label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, "_") };
                                patchField({ options: opts });
                              }}
                              className="h-8"
                            />
                            <button
                              onClick={() => patchField({ options: (selectedField.q.options || []).filter((x) => x.id !== o.id) })}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1"
                          onClick={() =>
                            patchField({
                              options: [
                                ...(selectedField.q.options || []),
                                { id: uid(), label: `Option ${(selectedField.q.options?.length || 0) + 1}`, value: `opt${(selectedField.q.options?.length || 0) + 1}` },
                              ],
                            })
                          }
                        >
                          <Plus className="h-4 w-4" /> Add option
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="logic" className="mt-0 flex-1 overflow-auto p-4">
              {!selectedField ? (
                <p className="pt-10 text-center text-sm text-muted-foreground">
                  Select a field to add visibility &amp; validation rules.
                </p>
              ) : (
                <FieldLogicEditor field={selectedField.q} sections={sections} onPatch={patchField} />
              )}
            </TabsContent>


            <TabsContent value="style" className="mt-0 flex-1 overflow-auto">
              <ThemeEditor theme={theme} onChange={setTheme} />
            </TabsContent>

            <TabsContent value="preview" className="mt-0 flex-1 overflow-auto bg-muted/20 p-2">
              <LivePreview sections={sections} theme={theme} isDark={isDark} name={name} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
