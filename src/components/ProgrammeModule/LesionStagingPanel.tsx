// Computer-vision pathology & lesion staging.
//
// The clinician photographs the visible manifestation, the phone segments and
// measures it on the spot, suggests a stage, and compares it with every
// previous visit — all offline. The suggestion is decision support only.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ScanEye, Loader2, TrendingDown, TrendingUp, Minus, Info, Ruler, Camera,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { toneClasses } from "@/lib/programmeModule/defaults";
import { resolveMediaUrl } from "@/lib/programmeModule/media";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CLINICAL_CRITERIA, LESION_CONDITIONS, MEASUREMENT_FIELDS, SCALE_REFERENCES,
  analyseLesion, compareLesions, conditionLabel, stageFromEvidence, TREND_TONE,
  type LesionCondition, type LesionMetrics,
} from "@/lib/programmeModule/lesionVision";
import PhotoCaptureField from "./PhotoCaptureField";

interface Props {
  beneficiaryId: string;
  projectId: string;
  moduleId: string;
  componentKey?: string;
  canRecord?: boolean;
}

interface AssessmentRow {
  id: string;
  condition: string;
  body_site: string | null;
  assessed_on: string;
  image_path: string | null;
  area_fraction: number | null;
  area_mm2: number | null;
  redness_index: number | null;
  stage: number | null;
  stage_label: string | null;
  percent_change: number | null;
  notes: string | null;
}

const db = supabase as unknown as { from: (t: string) => any };

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

const sizeText = (r: AssessmentRow) =>
  r.area_mm2 != null && r.area_mm2 > 0
    ? `${(r.area_mm2 / 100).toFixed(1)} cm²`
    : r.area_fraction != null
      ? `${(r.area_fraction * 100).toFixed(1)}% of frame`
      : "—";

const Thumb = ({ path, alt }: { path: string | null; alt: string }) => {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let off = false;
    void (async () => { const u = await resolveMediaUrl(path); if (!off) setUrl(u); })();
    return () => { off = true; };
  }, [path]);
  if (!url) return <div className="h-12 w-12 rounded bg-muted" />;
  return <img src={url} alt={alt} className="h-12 w-12 rounded object-cover" />;
};

const LesionStagingPanel = ({
  beneficiaryId, projectId, moduleId, componentKey, canRecord = true,
}: Props) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<AssessmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [condition, setCondition] = useState<LesionCondition>("lymphoedema");
  const [bodySite, setBodySite] = useState("");
  const [reference, setReference] = useState("0");
  const [assessedOn, setAssessedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<LesionMetrics | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await db.from("beneficiary_lesion_assessments")
      .select("id,condition,body_site,assessed_on,image_path,area_fraction,area_mm2,redness_index,stage,stage_label,percent_change,notes")
      .eq("beneficiary_id", beneficiaryId)
      .order("assessed_on", { ascending: false })
      .limit(200);
    setRows((data as AssessmentRow[]) || []);
    setLoading(false);
  }, [beneficiaryId]);

  useEffect(() => { void load(); }, [load]);

  const meta = LESION_CONDITIONS.find((c) => c.value === condition);
  const sameCondition = useMemo(
    () => rows.filter((r) => r.condition === condition), [rows, condition],
  );
  const comparison = useMemo(() => compareLesions(sameCondition), [sameCondition]);

  const analyse = useCallback(async (src: string) => {
    setAnalysing(true);
    try {
      const m = await analyseLesion(src, Number(reference) || 0);
      setMetrics(m);
    } catch (e) {
      toast({ title: "Could not analyse the picture", description: (e as Error).message, variant: "destructive" });
    } finally {
      setAnalysing(false);
    }
  }, [reference, toast]);

  // Re-measure when the clinician changes the reference object.
  useEffect(() => {
    if (dataUrl) void analyse(dataUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  const staged = metrics ? stageLesion(condition, metrics) : null;

  const save = async () => {
    if (!metrics) {
      toast({ title: "Take a picture first", description: "The measurement comes from the photograph." });
      return;
    }
    setSaving(true);
    try {
      const previous = sameCondition[0];
      const prevValue = Number(previous?.area_mm2 ?? previous?.area_fraction ?? 0);
      const newValue = Number(metrics.areaMm2 ?? metrics.areaFraction);
      const percentChange = prevValue > 0 ? +(((newValue - prevValue) / prevValue) * 100).toFixed(1) : null;

      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from("beneficiary_lesion_assessments").insert({
        project_id: projectId,
        module_id: moduleId,
        beneficiary_id: beneficiaryId,
        component_key: componentKey || null,
        condition,
        body_site: bodySite || null,
        assessed_on: assessedOn,
        image_path: imagePath,
        reference_mm: Number(reference) || null,
        area_fraction: metrics.areaFraction,
        area_mm2: metrics.areaMm2,
        width_fraction: metrics.widthFraction,
        redness_index: metrics.rednessIndex,
        stage: staged?.stage ?? null,
        stage_label: staged?.label ?? null,
        percent_change: percentChange,
        analysis: {
          edgeIrregularity: metrics.edgeIrregularity,
          segmentationQuality: metrics.segmentationQuality,
          box: metrics.box,
          rationale: staged?.rationale,
        },
        notes: notes || null,
        created_by: auth.user?.id,
      });
      if (error) throw error;
      toast({ title: "Assessment saved", description: staged?.label });
      setImagePath(null); setDataUrl(null); setMetrics(null); setNotes("");
      await load();
    } catch (e) {
      toast({ title: "Could not save the assessment", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const TrendIcon = comparison.trend === "improving" ? TrendingDown
    : comparison.trend === "deteriorating" ? TrendingUp : Minus;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ScanEye className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">Lesion staging & progression</h3>
            <p className="text-xs text-muted-foreground">
              Measured on this device from the photograph — works with no connection.
            </p>
          </div>
          <div className="flex-1" />
          <Badge variant="outline" className={cn("border", toneClasses[TREND_TONE[comparison.trend]])}>
            <TrendIcon className="mr-1 h-3.5 w-3.5" /> {comparison.headline}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{comparison.detail}</p>
      </Card>

      {canRecord && (
        <Card className="space-y-4 p-4">
          <h4 className="font-semibold text-foreground">New visual assessment</h4>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-sm">Condition</Label>
              <Select value={condition} onValueChange={(v) => { setCondition(v as LesionCondition); setMetrics(null); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {LESION_CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Body site</Label>
              <Input
                className="mt-1" value={bodySite} placeholder="e.g. Right lower limb"
                onChange={(e) => setBodySite(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-sm">Reference object in the picture</Label>
              <Select value={reference} onValueChange={setReference}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {SCALE_REFERENCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Assessment date</Label>
              <Input
                type="date" className="mt-1" value={assessedOn}
                onChange={(e) => setAssessedOn(e.target.value)}
              />
            </div>
          </div>

          {meta && (
            <p className="flex items-start gap-2 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
              <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {meta.capture}
            </p>
          )}

          <PhotoCaptureField
            label="Photograph of the affected area"
            hint="Same site, same distance and same lighting at every visit gives the most reliable comparison."
            value={imagePath}
            projectId={projectId}
            beneficiaryId={beneficiaryId}
            onChange={(path, url) => {
              setImagePath(path);
              setDataUrl(url);
              setMetrics(null);
              if (url) void analyse(url);
            }}
          />

          {analysing && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Measuring the lesion on this device…
            </p>
          )}

          {metrics && staged && (
            <div className="grid gap-4 rounded-lg border border-border p-3 md:grid-cols-[200px_minmax(0,1fr)]">
              {metrics.overlay && (
                <div>
                  <img src={metrics.overlay} alt="Detected lesion region" className="w-full rounded-md" />
                  <p className="mt-1 text-center text-[11px] text-muted-foreground">Highlighted = measured region</p>
                </div>
              )}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground">{staged.label}</Badge>
                  <Badge variant="outline">
                    <Ruler className="mr-1 h-3 w-3" />
                    {metrics.areaMm2 != null
                      ? `${(metrics.areaMm2 / 100).toFixed(1)} cm²`
                      : `${(metrics.areaFraction * 100).toFixed(1)}% of frame`}
                  </Badge>
                  <Badge variant="outline">Confidence {Math.round(metrics.segmentationQuality * 100)}%</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{staged.rationale}</p>
                <div className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <span>Redness index: {(metrics.rednessIndex * 100).toFixed(0)}%</span>
                  <span>Edge irregularity: {(metrics.edgeIrregularity * 100).toFixed(0)}%</span>
                  <span>Width across frame: {(metrics.widthFraction * 100).toFixed(0)}%</span>
                  <span>Height across frame: {(metrics.heightFraction * 100).toFixed(0)}%</span>
                </div>
                <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  A measurement aid for a trained clinician — it does not diagnose and never replaces examination.
                </p>
              </div>
            </div>
          )}

          <div>
            <Label className="text-sm">Clinical notes</Label>
            <Textarea
              className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Acute attack, wound care given, surgery date, anything the next visit should know."
            />
          </div>

          <Button disabled={saving || analysing || !metrics} onClick={() => void save()}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save assessment
          </Button>
        </Card>
      )}

      <Card className="p-4">
        <h4 className="mb-2 font-semibold text-foreground">Assessment history</h4>
        <Separator className="mb-2" />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Picture</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Condition / site</TableHead>
                <TableHead>Measured size</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Thumb path={r.image_path} alt={`${conditionLabel(r.condition)} picture`} /></TableCell>
                  <TableCell>{fmtDate(r.assessed_on)}</TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground">{conditionLabel(r.condition)}</div>
                    <div className="text-xs text-muted-foreground">{r.body_site || "—"}</div>
                  </TableCell>
                  <TableCell>{sizeText(r)}</TableCell>
                  <TableCell>{r.stage_label || "—"}</TableCell>
                  <TableCell>
                    {r.percent_change == null ? (
                      <span className="text-muted-foreground">Baseline</span>
                    ) : (
                      <Badge
                        variant="outline"
                        className={cn("border", toneClasses[r.percent_change <= -8 ? "success" : r.percent_change >= 8 ? "danger" : "neutral"])}
                      >
                        {r.percent_change > 0 ? "+" : ""}{r.percent_change}%
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No visual assessment recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default LesionStagingPanel;
