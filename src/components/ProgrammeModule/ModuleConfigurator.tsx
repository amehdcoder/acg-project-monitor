import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown, ArrowUp, Download, Plus, Trash2, Upload, Eye, EyeOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Question, QuestionType } from "@/components/FormBuilder/types";
import type {
  ProfileSection, ProgrammeComponent, ProgrammeModuleConfig,
} from "@/lib/programmeModule/types";
import {
  COMPONENT_COLOR_CHOICES, COMPONENT_ICON_CHOICES, previewCaseId, uid, normalizeConfig,
} from "@/lib/programmeModule/defaults";
import { resolveIcon } from "./icons";
import { saveModuleConfig } from "./useProgrammeModule";

const QUESTION_TYPES: QuestionType[] = [
  "text", "number", "select_one", "select_multiple", "date", "datetime",
  "geopoint", "image", "file", "note", "calculate",
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  moduleId: string;
  moduleName: string;
  config: ProgrammeModuleConfig;
  onSaved: () => void;
}

const ModuleConfigurator = ({ open, onOpenChange, moduleId, moduleName, config, onSaved }: Props) => {
  const { toast } = useToast();
  const [draft, setDraft] = useState<ProgrammeModuleConfig>(() => JSON.parse(JSON.stringify(config)));
  const [name, setName] = useState(moduleName);
  const [saving, setSaving] = useState(false);

  const patch = (p: Partial<ProgrammeModuleConfig>) => setDraft((d) => ({ ...d, ...p }));

  /* ----------------------------- components ---------------------------- */
  const setComponents = (components: ProgrammeComponent[]) =>
    patch({ components: components.map((c, i) => ({ ...c, order: i + 1 })) });

  const moveComponent = (index: number, dir: -1 | 1) => {
    const next = [...draft.components];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setComponents(next);
  };

  const addComponent = () =>
    setComponents([
      ...draft.components,
      {
        key: `component_${uid()}`,
        label: "New component",
        icon: "HeartPulse",
        color: COMPONENT_COLOR_CHOICES[draft.components.length % COMPONENT_COLOR_CHOICES.length],
        order: draft.components.length + 1,
        services: [],
        questions: [],
        countsTowardsProgress: true,
      },
    ]);

  /* ------------------------------ sections ----------------------------- */
  const setSections = (sections: ProfileSection[]) =>
    patch({ sections: sections.map((s, i) => ({ ...s, order: i + 1 })) });

  const addSection = () =>
    setSections([
      ...draft.sections,
      { id: uid(), label: "New section", placement: "personal", order: draft.sections.length + 1, questions: [] },
    ]);

  const updateSection = (id: string, p: Partial<ProfileSection>) =>
    setSections(draft.sections.map((s) => (s.id === id ? { ...s, ...p } : s)));

  const addQuestion = (sectionId: string) =>
    updateSection(sectionId, {
      questions: [
        ...(draft.sections.find((s) => s.id === sectionId)?.questions || []),
        { id: uid(), name: `field_${uid()}`, label: "New question", type: "text", required: false },
      ],
    });

  const updateQuestion = (sectionId: string, qid: string, p: Partial<Question>) => {
    const section = draft.sections.find((s) => s.id === sectionId);
    if (!section) return;
    updateSection(sectionId, {
      questions: (section.questions || []).map((q) => (q.id === qid ? { ...q, ...p } : q)),
    });
  };

  const moveQuestion = (sectionId: string, index: number, dir: -1 | 1) => {
    const section = draft.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const qs = [...(section.questions || [])];
    const t = index + dir;
    if (t < 0 || t >= qs.length) return;
    [qs[index], qs[t]] = [qs[t], qs[index]];
    updateSection(sectionId, { questions: qs });
  };

  const allFieldNames = useMemo(
    () => draft.sections.flatMap((s) => (s.questions || []).map((q) => ({ name: q.name || "", label: q.label }))),
    [draft.sections],
  );

  /* ------------------------------- saving ------------------------------ */
  const save = async () => {
    setSaving(true);
    try {
      await saveModuleConfig(moduleId, draft, name.trim() || moduleName);
      toast({ title: "Configuration saved" });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify({ name, config: draft }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.module.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      setDraft(normalizeConfig(parsed.config ?? parsed));
      if (parsed.name) setName(String(parsed.name));
      toast({ title: "Configuration imported", description: "Review and save to apply it." });
    } catch (e) {
      toast({ title: "Import failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] w-[96vw] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>Configure programme module</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="components" className="flex h-full flex-col">
          <div className="overflow-x-auto px-5 pt-3">
            <TabsList className="w-max">
              <TabsTrigger value="components">Components</TabsTrigger>
              <TabsTrigger value="sections">Sections & questions</TabsTrigger>
              <TabsTrigger value="workflow">Workflow</TabsTrigger>
              <TabsTrigger value="layout">Layout & quality</TabsTrigger>
              <TabsTrigger value="branding">Branding & Case ID</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="max-h-[64dvh] px-5 py-4">
            {/* ------------------------- components ------------------------- */}
            <TabsContent value="components" className="mt-0 space-y-3">
              {draft.components.map((c, i) => {
                const Icon = resolveIcon(c.icon);
                return (
                  <Card key={c.key} className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: `hsl(${c.color})` }}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <Input
                        className="min-w-[160px] flex-1" value={c.label}
                        onChange={(e) => setComponents(draft.components.map((x) => x.key === c.key ? { ...x, label: e.target.value } : x))}
                      />
                      <Select value={c.icon} onValueChange={(v) => setComponents(draft.components.map((x) => x.key === c.key ? { ...x, icon: v } : x))}>
                        <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                        <SelectContent className="z-[130] bg-popover">
                          {COMPONENT_ICON_CHOICES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={c.color} onValueChange={(v) => setComponents(draft.components.map((x) => x.key === c.key ? { ...x, color: v } : x))}>
                        <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                        <SelectContent className="z-[130] bg-popover">
                          {COMPONENT_COLOR_CHOICES.map((col) => (
                            <SelectItem key={col} value={col}>
                              <span className="flex items-center gap-2">
                                <span className="inline-block h-3 w-3 rounded-full" style={{ background: `hsl(${col})` }} />
                                {col.split(" ")[0]}°
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => moveComponent(i, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => moveComponent(i, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                      <Button
                        variant="ghost" size="icon" aria-label={c.hidden ? "Show" : "Hide"}
                        onClick={() => setComponents(draft.components.map((x) => x.key === c.key ? { ...x, hidden: !x.hidden } : x))}
                      >
                        {c.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost" size="icon" aria-label="Remove component"
                        onClick={() => setComponents(draft.components.filter((x) => x.key !== c.key))}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Services offered (one per line)</Label>
                        <Textarea
                          rows={2} value={(c.services || []).join("\n")}
                          onChange={(e) => setComponents(draft.components.map((x) => x.key === c.key
                            ? { ...x, services: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) } : x))}
                        />
                      </div>
                      <label className="mt-5 flex items-center gap-2 text-sm">
                        <Switch
                          checked={c.countsTowardsProgress !== false}
                          onCheckedChange={(v) => setComponents(draft.components.map((x) => x.key === c.key ? { ...x, countsTowardsProgress: v } : x))}
                        />
                        Counts towards overall progress
                      </label>
                    </div>
                  </Card>
                );
              })}
              <Button variant="outline" onClick={addComponent} className="gap-1"><Plus className="h-4 w-4" /> Add component</Button>
            </TabsContent>

            {/* -------------------------- sections -------------------------- */}
            <TabsContent value="sections" className="mt-0 space-y-4">
              {draft.sections.map((s) => (
                <Card key={s.id} className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input className="min-w-[180px] flex-1" value={s.label} onChange={(e) => updateSection(s.id, { label: e.target.value })} />
                    <Select value={s.placement} onValueChange={(v) => updateSection(s.id, { placement: v as ProfileSection["placement"] })}>
                      <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                      <SelectContent className="z-[130] bg-popover">
                        <SelectItem value="personal">Personal card</SelectItem>
                        <SelectItem value="clinical">Clinical card</SelectItem>
                        <SelectItem value="location">Location card</SelectItem>
                        <SelectItem value="header">Header</SelectItem>
                        <SelectItem value="hidden">Hidden</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" aria-label="Remove section"
                      onClick={() => setSections(draft.sections.filter((x) => x.id !== s.id))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <Separator className="my-3" />
                  <div className="space-y-2">
                    {(s.questions || []).map((q, qi) => (
                      <div key={q.id} className="rounded-lg border border-border p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Input className="min-w-[160px] flex-1" value={q.label} onChange={(e) => updateQuestion(s.id, q.id, { label: e.target.value })} />
                          <Input className="w-[150px]" value={q.name || ""} placeholder="field name"
                            onChange={(e) => updateQuestion(s.id, q.id, { name: e.target.value })} />
                          <Select value={q.type} onValueChange={(v) => updateQuestion(s.id, q.id, { type: v as QuestionType })}>
                            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                            <SelectContent className="z-[130] bg-popover">
                              {QUESTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <label className="flex items-center gap-1 text-xs">
                            <Switch checked={q.required} onCheckedChange={(v) => updateQuestion(s.id, q.id, { required: v })} />
                            Required
                          </label>
                          <Button variant="ghost" size="icon" onClick={() => moveQuestion(s.id, qi, -1)} aria-label="Move question up"><ArrowUp className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => moveQuestion(s.id, qi, 1)} aria-label="Move question down"><ArrowDown className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" aria-label="Remove question"
                            onClick={() => updateSection(s.id, { questions: (s.questions || []).filter((x) => x.id !== q.id) })}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          {(q.type === "select_one" || q.type === "select_multiple") && (
                            <div className="sm:col-span-3">
                              <Label className="text-xs">Options (one per line)</Label>
                              <Textarea
                                rows={2}
                                value={(q.options || []).map((o) => o.label).join("\n")}
                                onChange={(e) => updateQuestion(s.id, q.id, {
                                  options: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean)
                                    .map((l) => ({ id: uid(), label: l, value: l })),
                                })}
                              />
                            </div>
                          )}
                          <div>
                            <Label className="text-xs">Show only when (skip logic)</Label>
                            <Input placeholder="${disability} = 'Yes'" value={q.relevant || ""}
                              onChange={(e) => updateQuestion(s.id, q.id, { relevant: e.target.value })} />
                          </div>
                          <div>
                            <Label className="text-xs">Calculation</Label>
                            <Input placeholder="${a} + ${b}" value={q.calculation || ""}
                              onChange={(e) => updateQuestion(s.id, q.id, { calculation: e.target.value })} />
                          </div>
                          <div>
                            <Label className="text-xs">Hint</Label>
                            <Input value={q.hint || ""} onChange={(e) => updateQuestion(s.id, q.id, { hint: e.target.value })} />
                          </div>
                        </div>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => addQuestion(s.id)} className="gap-1">
                      <Plus className="h-4 w-4" /> Add question
                    </Button>
                  </div>
                </Card>
              ))}
              <Button variant="outline" onClick={addSection} className="gap-1"><Plus className="h-4 w-4" /> Add section</Button>
            </TabsContent>

            {/* -------------------------- workflow -------------------------- */}
            <TabsContent value="workflow" className="mt-0 space-y-4">
              {([
                ["statuses", "Beneficiary statuses"],
                ["riskLevels", "Risk levels"],
                ["serviceStatuses", "Service statuses"],
                ["referralStatuses", "Referral statuses"],
              ] as const).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label} — one per line as <code>value|Label|tone</code></Label>
                  <Textarea
                    rows={3}
                    value={draft.workflow[key].map((s) => `${s.value}|${s.label}|${s.tone}`).join("\n")}
                    onChange={(e) => patch({
                      workflow: {
                        ...draft.workflow,
                        [key]: e.target.value.split("\n").map((l) => l.split("|")).filter((p) => p[0]?.trim())
                          .map((p) => ({
                            value: p[0].trim(),
                            label: (p[1] || p[0]).trim(),
                            tone: ((p[2] || "neutral").trim() as "success" | "warning" | "danger" | "neutral" | "info"),
                          })),
                      },
                    })}
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label>Referral reasons (one per line)</Label>
                <Textarea
                  rows={3} value={draft.workflow.referralReasons.join("\n")}
                  onChange={(e) => patch({
                    workflow: { ...draft.workflow, referralReasons: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) },
                  })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Follow-up interval (days)</Label>
                <Input
                  type="number" className="w-32" value={draft.workflow.followUpIntervalDays}
                  onChange={(e) => patch({ workflow: { ...draft.workflow, followUpIntervalDays: parseInt(e.target.value, 10) || 30 } })}
                />
              </div>
            </TabsContent>

            {/* --------------------------- layout --------------------------- */}
            <TabsContent value="layout" className="mt-0 space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  ["showProgressRing", "Show progress ring"],
                  ["showTimeline", "Show care timeline"],
                  ["showReferrals", "Show referrals panel"],
                  ["showNextFollowUp", "Show next follow-up"],
                  ["showLocationMap", "Show location card"],
                  ["showDataQuality", "Show data-quality flags"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <Switch
                      checked={draft.layout[key]}
                      onCheckedChange={(v) => patch({ layout: { ...draft.layout, [key]: v } })}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>Header fields (field names, one per line)</Label>
                <Textarea
                  rows={3} value={draft.layout.headerFields.join("\n")}
                  onChange={(e) => patch({ layout: { ...draft.layout, headerFields: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) } })}
                />
                <p className="text-xs text-muted-foreground">
                  Available: {allFieldNames.map((f) => f.name).filter(Boolean).join(", ")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Clinical card fields (one per line)</Label>
                <Textarea
                  rows={3} value={draft.layout.clinicalFields.join("\n")}
                  onChange={(e) => patch({ layout: { ...draft.layout, clinicalFields: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) } })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data-quality rules — <code>field|Message|critical or warning</code></Label>
                <Textarea
                  rows={3}
                  value={draft.dataQuality.map((r) => `${r.field}|${r.label}|${r.severity}`).join("\n")}
                  onChange={(e) => patch({
                    dataQuality: e.target.value.split("\n").map((l) => l.split("|")).filter((p) => p[0]?.trim())
                      .map((p) => ({
                        id: uid(), field: p[0].trim(), label: (p[1] || `${p[0]} missing`).trim(),
                        severity: (p[2]?.trim() === "critical" ? "critical" : "warning") as "critical" | "warning",
                      })),
                  })}
                />
              </div>
            </TabsContent>

            {/* -------------------------- branding -------------------------- */}
            <TabsContent value="branding" className="mt-0 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Module name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input value={draft.branding.title} onChange={(e) => patch({ branding: { ...draft.branding, title: e.target.value } })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Subtitle</Label>
                  <Input value={draft.branding.subtitle || ""} onChange={(e) => patch({ branding: { ...draft.branding, subtitle: e.target.value } })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tagline</Label>
                  <Input value={draft.branding.tagline || ""} onChange={(e) => patch({ branding: { ...draft.branding, tagline: e.target.value } })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Accent colour (HSL triple)</Label>
                  <Input value={draft.branding.accent} onChange={(e) => patch({ branding: { ...draft.branding, accent: e.target.value } })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Footer note</Label>
                  <Input value={draft.branding.footerNote || ""} onChange={(e) => patch({ branding: { ...draft.branding, footerNote: e.target.value } })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Header strap lines (one per line)</Label>
                <Textarea
                  rows={3} value={(draft.branding.navItems || []).join("\n")}
                  onChange={(e) => patch({ branding: { ...draft.branding, navItems: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) } })}
                />
              </div>
              <Separator />
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Case ID prefix</Label>
                  <Input value={draft.caseId.prefix} onChange={(e) => patch({ caseId: { ...draft.caseId, prefix: e.target.value.toUpperCase() } })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Number width</Label>
                  <Input type="number" value={draft.caseId.width}
                    onChange={(e) => patch({ caseId: { ...draft.caseId, width: parseInt(e.target.value, 10) || 6 } })} />
                </div>
                <label className="mt-6 flex items-center gap-2 text-sm">
                  <Switch checked={draft.caseId.includeYear}
                    onCheckedChange={(v) => patch({ caseId: { ...draft.caseId, includeYear: v } })} />
                  Include year
                </label>
              </div>
              <Badge variant="outline">Example Case ID: {previewCaseId(draft)}</Badge>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="flex-wrap gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={exportConfig} className="gap-1"><Download className="h-4 w-4" /> Export</Button>
          <Button variant="outline" asChild className="gap-1">
            <label>
              <Upload className="h-4 w-4" /> Import
              <input type="file" accept="application/json" className="hidden"
                onChange={(e) => importConfig(e.target.files?.[0])} />
            </label>
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save configuration"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModuleConfigurator;
