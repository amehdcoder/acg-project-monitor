import BeneficiaryCaseCard from "./BeneficiaryCaseCard";
import { HEALTH_FIELDS, healthValue } from "@/lib/programmeModule/healthFields";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft, MoreHorizontal, Pencil, CloudOff, Cloud, AlertTriangle,
  CalendarClock, ArrowLeftRight, History, MapPin, Printer, Check, Accessibility,
} from "lucide-react";
import { readWgResult } from "@/lib/programmeModule/washingtonGroup";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { BeneficiaryRow, ProgrammeModuleConfig } from "@/lib/programmeModule/types";
import {
  ageFromDob, computeProgress, evaluateDataQuality, labelFor, latestServiceFor,
  statusChoices, toneClasses, toneFor, visibleComponents,
} from "@/lib/programmeModule/defaults";
import { useMediaUrl } from "@/lib/programmeModule/media";
import { isMmdpVisit } from "@/lib/programmeModule/mmdp";
import { resolveIcon } from "./icons";
import { useBeneficiaryRecord } from "./useProgrammeModule";
import ServiceEntryDialog from "./ServiceEntryDialog";
import GraduationPathwayPanel from "./GraduationPathwayPanel";
import ComponentJourneyProgress from "./ComponentJourneyProgress";
import WashingtonGroupDialog from "./WashingtonGroupDialog";
import { componentKind } from "@/lib/programmeModule/componentOutcomes";
import { buildWgRecord, WG_DOMAINS } from "@/lib/programmeModule/washingtonGroup";
import ReferralDialog from "./ReferralDialog";
import BeneficiaryFormDialog from "./BeneficiaryFormDialog";
import LongitudinalOutcome from "./LongitudinalOutcome";
import CareNetworkPanel from "./CareNetworkPanel";
import LimbProgressPanel from "./LimbProgressPanel";
import BeneficiaryMdaPanel from "./BeneficiaryMdaPanel";
import LesionStagingPanel from "./LesionStagingPanel";
import BeneficiaryRiskCard from "./BeneficiaryRiskCard";
import { recordAudit } from "./useProgrammeModule";
import { requestBeneficiaryDeletion } from "@/lib/programmeModule/facilityOps";
import { useCddSource } from "@/lib/programmeModule/cddCaseSearch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { offlineMutate, currentUserId } from "@/lib/programmeModule/offlineWrite";

interface Props {
  beneficiary: BeneficiaryRow;
  config: ProgrammeModuleConfig;
  moduleId: string;
  projectId: string;
  onBack: () => void;
  onChanged: () => void;
  /** Administrators can change the beneficiary's status from the record. */
  canManage?: boolean;
  /**
   * Programme components (MMDP/NTD, Eye Health, Mental Health & Psychosocial
   * Support ...) are only shown to facility focal persons for beneficiaries in
   * a facility they have been granted access to.
   */
  componentsVisible?: boolean;
  /** Limits which programme components this person may see (health workers). */
  componentFilter?: (c: { key: string; label?: string }) => boolean;
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

const ProgressRing = ({ percent, accent }: { percent: number; accent: string }) => {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24">
      <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
      <circle
        cx="50" cy="50" r={r} fill="none" stroke={`hsl(${accent})`} strokeWidth="10"
        strokeDasharray={c} strokeDashoffset={c - (c * percent) / 100}
        strokeLinecap="round" transform="rotate(-90 50 50)"
      />
      <text x="50" y="56" textAnchor="middle" className="fill-foreground text-[20px] font-semibold">
        {percent}%
      </text>
    </svg>
  );
};

const FieldRow = ({ label, value }: { label: string; value: string }) => (
  <div className="grid grid-cols-[minmax(7.5rem,40%)_1fr] items-baseline gap-4 py-1.5">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="min-w-0 break-words text-right text-sm font-medium text-foreground">{value || "—"}</span>
  </div>
);

const BeneficiaryRecord = ({
  beneficiary, config, moduleId, projectId, onBack, onChanged, canManage = false,
  componentsVisible = true, componentFilter,
}: Props) => {
  const { services, referrals, audit, reload } = useBeneficiaryRecord(beneficiary.id);
  const { toast } = useToast();
  const portrait = useMediaUrl(beneficiary.photo_url);
  const [statusSaving, setStatusSaving] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [serviceComponent, setServiceComponent] = useState<string | undefined>();
  const [serviceDefault, setServiceDefault] = useState<string | undefined>();
  const [wgOpen, setWgOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const submitDeleteRequest = async () => {
    setDeleteBusy(true);
    try {
      await requestBeneficiaryDeletion({ beneficiary, reason: deleteReason });
      toast({
        title: "Deletion request sent",
        description: "A Super Admin on this project must approve it.",
      });
      setDeleteOpen(false);
      setDeleteReason("");
    } catch (e) {
      toast({ title: "Could not send request", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDeleteBusy(false);
    }
  };

  // Facility focal persons only see the programme components (MMDP/NTD, Eye
  // Health, Mental Health & Psychosocial Support …) for beneficiaries inside a
  // facility they have been granted access to.
  const components = useMemo(
    () => (componentsVisible ? visibleComponents(config).filter((c) => !componentFilter || componentFilter(c)) : []),
    [config, componentsVisible, componentFilter],
  );
  const progress = useMemo(() => computeProgress(config, services), [config, services]);
  const flags = useMemo(() => evaluateDataQuality(config, beneficiary), [config, beneficiary]);
  const accent = config.branding.accent;
  const profile = beneficiary.profile || {};
  // Who found this person during community case search, and from where.
  const cddSource = useCddSource(
    beneficiary.cdd_id || (profile.identified_by_cdd as string | undefined) || null,
    beneficiary.referring_facility_id || null,
  );

  const questionLabel = (name: string) =>
    config.sections.flatMap((s) => s.questions || []).find((q) => q.name === name)?.label || name;

  const headerFacts = config.layout.headerFields.map((f) => ({
    label: questionLabel(f),
    value: f === "date_of_birth" ? ageFromDob(profile[f]) : String(profile[f] ?? "—"),
  }));

  const timeline = [
    ...services.map((s) => ({
      key: `s-${s.id}`,
      date: s.service_date,
      componentKey: s.component_key,
      title: components.find((c) => c.key === s.component_key)?.label || s.component_key,
      detail: [s.service_name, s.result].filter(Boolean).join(" — "),
      pending: !!s.__pending,
    })),
    ...referrals.map((r) => ({
      key: `r-${r.id}`,
      date: r.referral_date,
      componentKey: r.component_key || "",
      title: `Referral: ${r.referred_to}`,
      detail: r.reason || "",
      pending: !!r.__pending,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const nextReferral = referrals[0];
  const onlineDot = navigator.onLine;

  const printRecord = () => window.print();

  const statuses = useMemo(() => statusChoices(config.workflow.statuses), [config.workflow.statuses]);

  const changeStatus = async (value: string) => {
    if (value === beneficiary.status) return;
    setStatusSaving(true);
    try {
      await offlineMutate({ table: "beneficiaries", action: "update", values: { status: value }, id: beneficiary.id });
      await recordAudit({
        beneficiary_id: beneficiary.id, project_id: projectId, action: "status_changed",
        field_name: "status", old_value: beneficiary.status, new_value: value,
      });
      toast({ title: `Status set to ${labelFor(statuses, value)}` });
      void reload();
      onChanged();
    } catch (e) {
      toast({ title: "Could not update status", description: (e as Error).message, variant: "destructive" });
    } finally {
      setStatusSaving(false);
    }
  };

  /** Latest follow-up appointment captured on a service. */
  const nextFollowUp = useMemo(() => {
    for (const s of services) {
      const d = (s.data || {}) as Record<string, unknown>;
      if (d.follow_up_date) {
        return {
          date: String(d.follow_up_date),
          time: String(d.follow_up_time || ""),
          location: String(d.follow_up_location || ""),
        };
      }
    }
    return null;
  }, [services]);

  return (
    <div className="space-y-4">
      {/* Module masthead */}
      <div
        className="rounded-xl px-4 py-3 text-primary-foreground sm:px-6"
        style={{ background: `linear-gradient(90deg, hsl(${accent}), hsl(${accent} / 0.82))` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold leading-tight">{config.branding.title}</h1>
            <p className="text-xs opacity-90">{config.branding.subtitle}</p>
          </div>
          <div className="hidden flex-wrap gap-x-6 gap-y-1 text-xs font-medium opacity-95 md:flex">
            {(config.branding.navItems || []).map((n) => <span key={n}>{n}</span>)}
          </div>
        </div>
      </div>

      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 px-1">
        <ChevronLeft className="h-4 w-4" /> Back to beneficiaries
      </Button>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {/* Header + progress */}
          <div className="grid gap-4 xl:grid-cols-[minmax(340px,1fr)_260px]">
            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start gap-4">
                <div
                  className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-2xl font-semibold text-muted-foreground"
                >
                  {portrait
                    ? <img src={portrait} alt={`${beneficiary.full_name} portrait`} className="h-full w-full object-cover" />
                    : beneficiary.full_name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-[200px] flex-1">

                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-2xl font-bold text-foreground">{beneficiary.full_name}</h2>
                    <Badge variant="outline" className={cn("border", toneClasses[toneFor(statuses, beneficiary.status)])}>
                      {labelFor(statuses, beneficiary.status)}
                    </Badge>
                    {beneficiary.__pending && (
                      <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700">
                        <CloudOff className="h-3 w-3" /> Queued offline
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm font-medium" style={{ color: `hsl(${accent})` }}>
                    Case ID: {beneficiary.case_id}
                  </p>
                  {!beneficiary.__pending && <BeneficiaryCaseCard beneficiary={beneficiary} />}
                  {(cddSource.cdd || cddSource.facility) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Found by CDD:{" "}
                      <span className="font-medium text-foreground">
                        {cddSource.cdd?.full_name || "—"}
                      </span>
                      {cddSource.cdd?.cdd_code ? ` (${cddSource.cdd.cdd_code})` : ""}
                      {cddSource.facility ? ` · Referred from ${cddSource.facility}` : ""}
                    </p>
                  )}
                  <dl className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-6 gap-y-2.5">
                    {headerFacts.map((f) => (
                      <div key={f.label} className="min-w-0">
                        <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground" title={f.label}>{f.label}</dt>
                        <dd className="break-words text-sm font-semibold text-foreground">{f.value || "—"}</dd>
                      </div>
                    ))}
                    {(() => {
                      const wg = readWgResult(profile);
                      const palette = ["from-health-blue to-health-teal", "from-status-warning to-destructive", "from-health-teal to-status-success", "from-primary to-health-blue", "from-destructive to-status-warning", "from-status-success to-health-blue"];
                      return (
                        <div className="col-span-full min-w-0">
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Disability domain (Washington Group)</dt>
                          <dd className="mt-1 flex flex-wrap gap-1.5">
                            {!wg && <span className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground">Screening not completed</span>}
                            {wg && !wg.hasDisability && <span className="rounded-full bg-status-success/15 px-2.5 py-0.5 text-xs font-semibold text-status-success">No functional difficulty identified</span>}
                            {wg?.hasDisability && wg.disabilityDomains.map((d, i) => (
                              <span key={d} className={`rounded-full bg-gradient-to-r ${palette[i % palette.length]} px-3 py-1 text-xs font-bold text-primary-foreground shadow-sm`}>{d}</span>
                            ))}
                          </dd>
                        </div>
                      );
                    })()}
                  </dl>
                </div>
                <div className="flex shrink-0 items-start gap-2">
                  <Button size="sm" onClick={() => setEditOpen(true)} className="gap-1">
                    <Pencil className="h-3.5 w-3.5" /> Edit Profile
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" aria-label="More actions" disabled={statusSaving}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-[1200] w-56 bg-popover">
                      {canManage ? (
                        <>
                          <DropdownMenuLabel>Set beneficiary status</DropdownMenuLabel>
                          {statuses.map((s) => (
                            <DropdownMenuItem key={s.value} onSelect={() => void changeStatus(s.value)}>
                              <span className="flex-1">{s.label}</span>
                              {beneficiary.status === s.value && <Check className="h-4 w-4" />}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                        </>
                      ) : (
                        <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
                          Only administrators can change the status.
                        </DropdownMenuLabel>
                      )}
                      <DropdownMenuItem onSelect={() => setEditOpen(true)}>Edit profile</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => printRecord()}>Print / export record</DropdownMenuItem>
                      {canManage && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setDeleteOpen(true)}
                          >
                            Request deletion
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </Card>

            {config.layout.showProgressRing && (
              <Card className="flex items-center gap-4 p-4">
                <ProgressRing percent={progress.percent} accent={accent} />
                <div>
                  <p className="text-sm font-semibold text-foreground">Overall Progress</p>
                  <p className="text-sm text-muted-foreground">
                    {progress.completed} of {progress.total} components
                  </p>
                  <Badge variant="outline" className={cn("mt-2 border", toneClasses[progress.onTrack ? "success" : "warning"])}>
                    {progress.onTrack ? "On track" : "Needs attention"}
                  </Badge>
                </div>
              </Card>
            )}
          </div>

          {config.layout.showProgressRing && components.length > 0 && (
            <ComponentJourneyProgress
              key={beneficiary.id}
              beneficiary={beneficiary}
              components={components}
              services={services}
              referrals={referrals}
            />
          )}

          {config.layout.showDataQuality && flags.length > 0 && (
            <Card className="flex flex-wrap items-center gap-2 border-amber-500/30 bg-amber-500/5 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-foreground">Data quality:</span>
              {flags.map((f) => (
                <Badge key={f.id} variant="outline" className={cn("border", toneClasses[f.severity === "critical" ? "danger" : "warning"])}>
                  {f.label}
                </Badge>
              ))}
            </Card>
          )}

          {/* Component tabs */}
          <Tabs value={tab} onValueChange={setTab}>
            <div className="overflow-x-auto">
              <TabsList className="w-max">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                {components.map((c) => (
                  <TabsTrigger key={c.key} value={c.key}>{c.label}</TabsTrigger>
                ))}
                {componentsVisible && <TabsTrigger value="lesions">Lesion staging</TabsTrigger>}
                <TabsTrigger value="outcomes">Outcomes</TabsTrigger>
                <TabsTrigger value="care">Care network</TabsTrigger>
                <TabsTrigger value="mda">MDA rounds</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {components.map((c) => {
                  const last = latestServiceFor(services, c.key);
                  const Icon = resolveIcon(c.icon);
                  return (
                    <button
                      key={c.key}
                      onClick={() => setTab(c.key)}
                      className="overflow-hidden rounded-xl border border-border text-left transition-shadow hover:shadow-md"
                    >
                      <div className="p-4 text-white" style={{ background: `hsl(${c.color})` }}>
                        <Icon className="mb-2 h-6 w-6" />
                        <p className="font-semibold leading-snug">{c.label}</p>
                      </div>
                      <div className="space-y-1.5 bg-card p-3">
                        <p className="text-xs text-muted-foreground">
                          Last service: <span className="font-medium text-foreground">{fmtDate(last?.service_date)}</span>
                        </p>
                        <p className="text-sm text-foreground">{last?.result || last?.service_name || "No service yet"}</p>
                        <Badge variant="outline" className={cn("border", toneClasses[last ? toneFor(config.workflow.serviceStatuses, last.status) : "neutral"])}>
                          {last ? labelFor(config.workflow.serviceStatuses, last.status) : "Not started"}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>

              {(() => {
                const lv = components.find((c) => componentKind(c.key, c.label) === "livelihood");
                return lv ? (
                  <GraduationPathwayPanel
                    projectId={projectId} moduleId={moduleId}
                    beneficiary={beneficiary} componentKey={lv.key} services={services}
                    onRecord={(k, name) => { setServiceComponent(k); setServiceDefault(name); setServiceOpen(true); }}
                    onChanged={() => { void reload(); onChanged(); }}
                  />
                ) : null;
              })()}

              <div className="grid gap-4 lg:grid-cols-3">
                {config.sections
                  .filter((s) => !s.hidden && s.placement === "personal")
                  .map((s) => (
                    <Card key={s.id} className="p-4">
                      <h3 className="mb-2 font-semibold text-foreground">{s.label}</h3>
                      <Separator className="mb-2" />
                      {(s.questions || []).map((q) => (
                        <FieldRow key={q.id} label={q.label} value={String(profile[q.name || ""] ?? "")} />
                      ))}
                    </Card>
                  ))}

                <Card className="p-4">
                  <h3 className="mb-2 font-semibold text-foreground">Health & Next of Kin</h3>
                  <Separator className="mb-2" />
                  {HEALTH_FIELDS.map((f) => (
                    <FieldRow key={f.key} label={f.label} value={healthValue(profile, f.key)} />
                  ))}
                  {HEALTH_FIELDS.some((f) => !healthValue(profile, f.key)) && (
                    <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setEditOpen(true)}>
                      Fill in missing details
                    </Button>
                  )}
                </Card>

                <Card className="p-4">
                  <h3 className="mb-2 flex items-center gap-2 font-semibold text-foreground">
                    <Accessibility className="h-4 w-4 text-primary" /> Disability (Washington Group)
                  </h3>
                  <Separator className="mb-2" />
                  {(() => {
                    const wg = readWgResult(profile);
                    if (!wg) {
                      return (
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            The six-question disability screening has not been completed for this beneficiary.
                          </p>
                          <Button size="sm" className="gap-1" onClick={() => setWgOpen(true)}>
                            <Accessibility className="h-4 w-4" /> Open WG-SS questionnaire
                          </Button>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-2">
                        <FieldRow
                          label="Classification"
                          value={wg.hasDisability ? "Person with a disability" : "No disability identified"}
                        />
                        {wg.hasDisability && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {wg.disabilityDomains.map((d) => (
                              <span key={d}
                                className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                                {d}
                              </span>
                            ))}
                          </div>
                        )}
                        <ul className="grid grid-cols-2 gap-1.5 pt-1">
                          {WG_DOMAINS.map((d) => {
                            const lvl = wg.answers[d.key];
                            const tone = lvl === "cannot" ? "border-destructive/40 bg-destructive/10 text-destructive"
                              : lvl === "a_lot" ? "border-status-warning/50 bg-status-warning/10 text-status-warning"
                              : lvl === "some" ? "border-health-blue/30 bg-health-blue/10 text-health-blue"
                              : "border-status-success/30 bg-status-success/10 text-status-success";
                            const label = { none: "No difficulty", some: "Some difficulty", a_lot: "A lot of difficulty", cannot: "Cannot do at all" }[lvl as string] || "Not answered";
                            return (
                              <li key={d.key} className={cn("rounded-lg border px-2 py-1.5", tone)}>
                                <p className="text-[11px] font-bold uppercase tracking-wide">{d.label}</p>
                                <p className="text-xs">{label}</p>
                              </li>
                            );
                          })}
                        </ul>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">
                            Screened {new Date(wg.completed_at).toLocaleDateString()}
                          </p>
                          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setWgOpen(true)}>Re-screen</Button>
                        </div>
                      </div>
                    );
                  })()}
                </Card>

                {!!config.layout.clinicalFields.length && (
                  <Card className="p-4">
                    <h3 className="mb-2 font-semibold text-foreground">Key Clinical & Social Information</h3>
                    <Separator className="mb-2" />
                    {config.layout.clinicalFields.map((f) => (
                      <FieldRow key={f} label={questionLabel(f)} value={String(profile[f] ?? "")} />
                    ))}
                  </Card>
                )}

                {config.layout.showLocationMap && (
                  <Card className="p-4">
                    <h3 className="mb-2 font-semibold text-foreground">Location</h3>
                    <Separator className="mb-2" />
                    <div className="space-y-1">
                      <FieldRow label="Village" value={beneficiary.village || ""} />
                      <FieldRow label="Ward" value={beneficiary.ward || ""} />
                      <FieldRow label="LGA" value={beneficiary.lga || ""} />
                      <FieldRow label="State" value={beneficiary.state || ""} />
                      <FieldRow
                        label="Coordinates"
                        value={beneficiary.latitude != null ? `${beneficiary.latitude.toFixed(5)}, ${beneficiary.longitude?.toFixed(5)}` : ""}
                      />
                    </div>
                    {beneficiary.latitude != null && beneficiary.longitude != null && (
                      <Button
                        variant="outline" size="sm" className="mt-3 w-full gap-1"
                        onClick={() => window.open(`https://www.google.com/maps?q=${beneficiary.latitude},${beneficiary.longitude}`, "_blank", "noopener")}
                      >
                        <MapPin className="h-3.5 w-3.5" /> View on Map
                      </Button>
                    )}
                  </Card>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Card className="p-4">
                  <h3 className="mb-2 font-semibold text-foreground">Latest Assessments</h3>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Component</TableHead>
                          <TableHead>Assessment / Service</TableHead>
                          <TableHead>Result</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {services.slice(0, 8).map((s) => (
                          <TableRow key={s.id}>
                            <TableCell>{fmtDate(s.service_date)}</TableCell>
                            <TableCell>{components.find((c) => c.key === s.component_key)?.label || s.component_key}</TableCell>
                            <TableCell>{s.service_name || "—"}</TableCell>
                            <TableCell>{s.result || "—"}</TableCell>
                          </TableRow>
                        ))}
                        {services.length === 0 && (
                          <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No services recorded yet</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </Card>

                <Card className="space-y-2 p-4">
                  <h3 className="font-semibold text-foreground">Quick Actions</h3>
                  {config.layout.quickActions.map((a) => {
                    const Icon = resolveIcon(a.icon);
                    const run = () => {
                      if (a.key === "add_service") { setServiceComponent(undefined); setServiceOpen(true); }
                      else if (a.key === "create_referral") setReferralOpen(true);
                      else if (a.key === "schedule_follow_up") setEditOpen(true);
                      else printRecord();
                    };
                    return (
                      <Button key={a.key} onClick={run} className="w-full justify-start gap-2" variant="secondary">
                        <Icon className="h-4 w-4" /> {a.label}
                      </Button>
                    );
                  })}
                </Card>
              </div>
            </TabsContent>

            {components.map((c) => {
              const rows = services.filter((s) => s.component_key === c.key);
              const Icon = resolveIcon(c.icon);
              return (
                <TabsContent key={c.key} value={c.key} className="mt-4">
                  <Card className="p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: `hsl(${c.color})` }}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <div>
                          <h3 className="font-semibold text-foreground">{c.label}</h3>
                          <p className="text-xs text-muted-foreground">{rows.length} service{rows.length === 1 ? "" : "s"} recorded</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {/mental|mhpss|psycho/i.test(`${c.key} ${c.label}`) && (
                          <Button size="sm" variant="outline" asChild>
                            <a href="/mhgap-guide" target="_blank" rel="noopener noreferrer">mhGAP guide</a>
                          </Button>
                        )}
                        <Button size="sm" onClick={() => { setServiceComponent(c.key); setServiceOpen(true); }}>
                          Record service
                        </Button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead><TableHead>Service</TableHead>
                            <TableHead>Result</TableHead><TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((s) => (
                            <TableRow key={s.id}>
                              <TableCell>{fmtDate(s.service_date)}</TableCell>
                              <TableCell>{s.service_name || "—"}</TableCell>
                              <TableCell>{s.result || "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn("border", toneClasses[toneFor(config.workflow.serviceStatuses, s.status)])}>
                                  {labelFor(config.workflow.serviceStatuses, s.status)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          {rows.length === 0 && (
                            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nothing recorded for this component yet</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    {rows.some(isMmdpVisit) && (
                      <div className="mt-4">
                        <LimbProgressPanel services={rows} />
                      </div>
                    )}
                  </Card>
                </TabsContent>
              );
            })}

            {componentsVisible && (
              <TabsContent value="lesions" className="mt-4">
                <LesionStagingPanel
                  beneficiaryId={beneficiary.id}
                  projectId={projectId}
                  moduleId={moduleId}
                  canRecord
                />
              </TabsContent>
            )}

            <TabsContent value="outcomes" className="mt-4 space-y-4">
              <LongitudinalOutcome services={services} />
              {services.some(isMmdpVisit) && <LimbProgressPanel services={services} />}
            </TabsContent>

            <TabsContent value="care" className="mt-4">
              <CareNetworkPanel
                beneficiary={beneficiary}
                projectId={projectId}
                referrals={referrals}
                onRefer={() => setReferralOpen(true)}
                onChanged={() => { void reload(); onChanged(); }}
              />
            </TabsContent>

            <TabsContent value="mda" className="mt-4">
              <BeneficiaryMdaPanel
                beneficiaryId={beneficiary.id}
                householdId={beneficiary.household_id}
              />
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <Card className="p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                  <History className="h-4 w-4" /> Audit trail
                </h3>
                <div className="space-y-2">
                  {audit.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-2 text-sm">
                      <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                      <span className="font-medium text-foreground">{a.action.replace(/_/g, " ")}</span>
                      {a.field_name && <span className="text-muted-foreground">· {a.field_name}</span>}
                      {a.new_value && <span className="text-muted-foreground">→ {a.new_value}</span>}
                    </div>
                  ))}
                  {audit.length === 0 && <p className="text-sm text-muted-foreground">No changes recorded yet.</p>}
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          {config.layout.showTimeline && (
            <Card className="p-4">
              <h3 className="mb-3 font-semibold text-foreground">Longitudinal Care Timeline</h3>
              <div className="space-y-3">
                {timeline.map((t) => {
                  const comp = components.find((c) => c.key === t.componentKey);
                  const Icon = resolveIcon(comp?.icon || "ArrowLeftRight");
                  return (
                    <div key={t.key} className="flex gap-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                        style={{ background: `hsl(${comp?.color || config.branding.accent})` }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1 border-b border-border pb-2">
                        <p className="text-xs text-muted-foreground">{fmtDate(t.date)}</p>
                        <p className="truncate text-sm font-medium text-foreground">{t.title}</p>
                        {t.detail && <p className="truncate text-xs text-muted-foreground">{t.detail}</p>}
                      </div>
                    </div>
                  );
                })}
                {timeline.length === 0 && <p className="text-sm text-muted-foreground">The timeline fills up as services are delivered.</p>}
              </div>
            </Card>
          )}

          <BeneficiaryRiskCard
            beneficiary={beneficiary}
            services={services}
            referrals={referrals}
            projectId={projectId}
            canDispatch={canManage}
          />

          {config.layout.showNextFollowUp && (
            <Card className="p-4">
              <h3 className="mb-2 flex items-center gap-2 font-semibold text-foreground">
                <CalendarClock className="h-4 w-4" /> Next Follow-up
              </h3>
              <FieldRow label="Date" value={fmtDate(nextFollowUp?.date || beneficiary.next_follow_up_date)} />
              <FieldRow label="Time" value={nextFollowUp?.time || ""} />
              <FieldRow
                label="Location"
                value={nextFollowUp?.location || beneficiary.village || beneficiary.lga || ""}
              />
            </Card>
          )}

          {config.layout.showReferrals && (
            <Card className="p-4">
              <h3 className="mb-2 flex items-center gap-2 font-semibold text-foreground">
                <ArrowLeftRight className="h-4 w-4" /> Referrals
              </h3>
              {nextReferral ? (
                <>
                  <FieldRow label="Referred to" value={nextReferral.referred_to} />
                  <FieldRow label="Reason" value={nextReferral.reason || ""} />
                  <FieldRow label="Date" value={fmtDate(nextReferral.referral_date)} />
                  <div className="mt-1">
                    <Badge variant="outline" className={cn("border", toneClasses[toneFor(config.workflow.referralStatuses, nextReferral.status)])}>
                      {labelFor(config.workflow.referralStatuses, nextReferral.status)}
                    </Badge>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No referrals yet.</p>
              )}
              <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setReferralOpen(true)}>
                Create referral
              </Button>
            </Card>
          )}
        </div>
      </div>

      {/* Footer strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-foreground">{config.branding.title}</span>
          {components.map((c) => <span key={c.key}>· {c.label}</span>)}
        </div>
        <div className="flex items-center gap-3">
          <span>{config.branding.footerNote}</span>
          <span className="flex items-center gap-1">
            {onlineDot ? <Cloud className="h-3.5 w-3.5 text-emerald-600" /> : <CloudOff className="h-3.5 w-3.5 text-amber-600" />}
            {onlineDot ? "Online" : "Offline"}
          </span>
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-1" onClick={printRecord}>
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
        </div>
      </div>

      <ServiceEntryDialog
        open={serviceOpen} onOpenChange={(v) => { setServiceOpen(v); if (!v) setServiceDefault(undefined); }} config={config}
        beneficiary={beneficiary} moduleId={moduleId} projectId={projectId}
        defaultComponent={serviceComponent} defaultService={serviceDefault} priorServices={services} componentFilter={componentFilter}
        onSaved={() => { void reload(); onChanged(); }}
      />
      <WashingtonGroupDialog
        open={wgOpen}
        beneficiaryName={beneficiary.full_name}
        initial={readWgResult(beneficiary.profile as Record<string, unknown>)?.answers}
        onSkip={() => setWgOpen(false)}
        onSave={async (answers) => {
          const profile = { ...((beneficiary.profile || {}) as Record<string, unknown>), wg_ss: buildWgRecord(answers) };
          try { await offlineMutate({ table: "beneficiaries", action: "update", values: { profile }, id: beneficiary.id }); }
          catch (error) { toast({ title: "Screening save failed", description: (error as Error).message, variant: "destructive" }); return; }
          toast({ title: "Disability screening saved" });
          setWgOpen(false);
          void reload(); onChanged();
        }}
      />
      <ReferralDialog
        open={referralOpen} onOpenChange={setReferralOpen} config={config}
        beneficiaryId={beneficiary.id} projectId={projectId}
        fromFacilityId={(beneficiary as unknown as { facility_id?: string | null }).facility_id || null}
        onSaved={() => { void reload(); onChanged(); }}
      />
      <BeneficiaryFormDialog
        open={editOpen} onOpenChange={setEditOpen} moduleId={moduleId} projectId={projectId}
        config={config} existing={beneficiary} onSaved={() => { void reload(); onChanged(); }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request deletion of {beneficiary.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The record is only removed after a Super Admin assigned to this project
              approves the request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Why should this record be removed?"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              onClick={(e) => { e.preventDefault(); void submitDeleteRequest(); }}
            >
              Send request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BeneficiaryRecord;
