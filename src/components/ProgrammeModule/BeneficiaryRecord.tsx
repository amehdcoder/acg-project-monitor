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
  CalendarClock, ArrowLeftRight, History, MapPin, Printer, Check,
} from "lucide-react";
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
import ReferralDialog from "./ReferralDialog";
import BeneficiaryFormDialog from "./BeneficiaryFormDialog";
import LongitudinalOutcome from "./LongitudinalOutcome";
import CareNetworkPanel from "./CareNetworkPanel";
import LimbProgressPanel from "./LimbProgressPanel";
import { recordAudit } from "./useProgrammeModule";

interface Props {
  beneficiary: BeneficiaryRow;
  config: ProgrammeModuleConfig;
  moduleId: string;
  projectId: string;
  onBack: () => void;
  onChanged: () => void;
  /** Administrators can change the beneficiary's status from the record. */
  canManage?: boolean;
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
  <div className="flex items-start justify-between gap-4 py-1.5">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-right text-sm font-medium text-foreground">{value || "—"}</span>
  </div>
);

const BeneficiaryRecord = ({
  beneficiary, config, moduleId, projectId, onBack, onChanged, canManage = false,
}: Props) => {
  const { services, referrals, audit, reload } = useBeneficiaryRecord(beneficiary.id);
  const { toast } = useToast();
  const portrait = useMediaUrl(beneficiary.photo_url);
  const [statusSaving, setStatusSaving] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [serviceComponent, setServiceComponent] = useState<string | undefined>();
  const [tab, setTab] = useState("overview");

  const components = useMemo(() => visibleComponents(config), [config]);
  const progress = useMemo(() => computeProgress(config, services), [config, services]);
  const flags = useMemo(() => evaluateDataQuality(config, beneficiary), [config, beneficiary]);
  const accent = config.branding.accent;
  const profile = beneficiary.profile || {};

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
      const { error } = await supabase.from("beneficiaries")
        .update({ status: value } as never).eq("id", beneficiary.id);
      if (error) throw error;
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
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <Card className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div
                  className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-2xl font-semibold text-muted-foreground"
                >
                  {portrait
                    ? <img src={portrait} alt={`${beneficiary.full_name} portrait`} className="h-full w-full object-cover" />
                    : beneficiary.full_name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
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
                  <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    {headerFacts.map((f) => (
                      <div key={f.label} className="flex gap-2 text-sm">
                        <span className="text-muted-foreground">{f.label}:</span>
                        <span className="font-medium text-foreground">{f.value}</span>
                      </div>
                    ))}
                  </div>
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
                <TabsTrigger value="outcomes">Outcomes</TabsTrigger>
                <TabsTrigger value="care">Care network</TabsTrigger>
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
                      <Button size="sm" onClick={() => { setServiceComponent(c.key); setServiceOpen(true); }}>
                        Record service
                      </Button>
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
        open={serviceOpen} onOpenChange={setServiceOpen} config={config}
        beneficiary={beneficiary} moduleId={moduleId} projectId={projectId}
        defaultComponent={serviceComponent} priorServices={services}
        onSaved={() => { void reload(); onChanged(); }}
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
    </div>
  );
};

export default BeneficiaryRecord;
