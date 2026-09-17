// Household & community cluster grouping.
//
// Registers households, attaches beneficiaries to them, links each household to
// the community water point it uses, and tracks mass drug administration (MDA)
// rounds at household level.

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Home, Plus, Droplets, Pill, Users, Search, Loader2, MapPin, UserPlus,
  Download, Pencil, Trash2, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import MdaRoundDialog from "./MdaRoundDialog";
import GeoCascadeFields from "./GeoCascadeFields";
import HouseholdMemberDialog from "./HouseholdMemberDialog";
import PersonNtdPassport from "./PersonNtdPassport";
import {
  deleteHouseholdMember, relationshipLabel, saveHouseholdMember, useHouseholdMembers,
  type HouseholdMemberRow, type RosterPerson,
} from "@/lib/programmeModule/householdMembers";
import {
  saveMorbidityRecord, useMorbidityRecords, type MorbidityRow,
} from "@/lib/programmeModule/morbidity";
import { downloadCsv } from "@/lib/mda/csvExport";
import {
  HOUSEHOLD_ROLES, NTD_DISEASES, SANITATION_TYPES, WASH_SOURCE_TYPES,
  deleteMdaRound, diseaseLabel, householdCoverage, nextHouseholdCode, outcomeLabel,
  roleLabel, roundIsIncomplete, roundsCsv, saveHousehold, saveMdaRoundWithTreatments,
  saveWashSource, setBeneficiaryHousehold, tallyTreatments, useHouseholds, washTypeLabel,
  type HouseholdRow, type MdaRoundRow, type MdaTreatmentRow,
} from "@/lib/programmeModule/households";


interface Props {
  projectId: string;
  moduleId?: string;
  beneficiaries: BeneficiaryRow[];
  canManage?: boolean;
  onOpenBeneficiary?: (b: BeneficiaryRow) => void;
  onChanged?: () => void;
}

const householdOf = (b: BeneficiaryRow) =>
  (b as unknown as { household_id?: string | null }).household_id || "";
const roleOf = (b: BeneficiaryRow) =>
  (b as unknown as { household_role?: string | null }).household_role || "";

const HouseholdsPanel = ({
  projectId, moduleId, beneficiaries, canManage = true, onOpenBeneficiary, onChanged,
}: Props) => {
  const { toast } = useToast();
  const { households, washSources, rounds, treatments, loading, reload } = useHouseholds(projectId, moduleId);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [hhOpen, setHhOpen] = useState(false);
  const [hhDraft, setHhDraft] = useState<Partial<HouseholdRow>>({});
  const [washOpen, setWashOpen] = useState(false);
  const [washDraft, setWashDraft] = useState<Record<string, string | boolean>>({
    name: "", source_type: "borehole", sanitation_type: "pit_slab", is_improved: true, village: "",
  });
  const [mdaOpen, setMdaOpen] = useState(false);
  const [editingRound, setEditingRound] = useState<MdaRoundRow | null>(null);
  const [deleteRound, setDeleteRound] = useState<MdaRoundRow | null>(null);
  const [detailRound, setDetailRound] = useState<MdaRoundRow | null>(null);
  const [roundFilters, setRoundFilters] = useState({ disease: "all", community: "all", from: "", to: "" });

  const [memberOpen, setMemberOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] = useState("head");

  const { members: memberRows, reload: reloadMembers } = useHouseholdMembers(projectId);
  const { records: morbidityRows, reload: reloadMorbidity } = useMorbidityRecords(projectId);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<HouseholdMemberRow | null>(null);
  const [passportPerson, setPassportPerson] = useState<RosterPerson | null>(null);

  const membersByHousehold = useMemo(() => {
    const map = new Map<string, BeneficiaryRow[]>();
    for (const b of beneficiaries) {
      const hid = householdOf(b);
      if (!hid) continue;
      map.set(hid, [...(map.get(hid) || []), b]);
    }
    return map;
  }, [beneficiaries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return households;
    return households.filter((h) =>
      [h.household_code, h.name, h.head_name, h.village, h.ward, h.lga]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [households, search]);

  const selected = households.find((h) => h.id === selectedId) || filtered[0];
  const selectedMembers = selected ? membersByHousehold.get(selected.id) || [] : [];
  const selectedRounds = selected ? rounds.filter((r) => r.household_id === selected.id) : [];
  const coverage = householdCoverage(selectedRounds);
  const unassigned = beneficiaries.filter((b) => !householdOf(b));

  const rosterMembers = useMemo(
    () => (selected ? memberRows.filter((m) => m.household_id === selected.id) : []),
    [memberRows, selected],
  );

  /** Everyone who sleeps here — registered beneficiaries and other members. */
  const roster = useMemo<RosterPerson[]>(() => {
    const out: RosterPerson[] = [];
    const claimed = new Set<string>();
    const ageFrom = (b?: BeneficiaryRow) => {
      const p = (b?.profile || {}) as Record<string, unknown>;
      const n = Number(p.age ?? p.age_years);
      if (Number.isFinite(n) && n > 0) return n;
      const dob = String(p.date_of_birth || "");
      if (dob) {
        const d = new Date(dob);
        if (!Number.isNaN(d.getTime())) return Math.floor((Date.now() - d.getTime()) / 31557600000);
      }
      return null;
    };
    const sexFrom = (b?: BeneficiaryRow) => {
      const p = (b?.profile || {}) as Record<string, unknown>;
      const v = p.sex ?? p.gender;
      return v ? String(v) : null;
    };

    for (const m of rosterMembers) {
      const b = m.beneficiary_id ? beneficiaries.find((x) => x.id === m.beneficiary_id) : undefined;
      if (b) claimed.add(b.id);
      out.push({
        key: `m:${m.id}`,
        memberId: m.id,
        beneficiaryId: m.beneficiary_id,
        name: b?.full_name || m.full_name,
        sex: m.sex || sexFrom(b),
        age: m.age_years ?? ageFrom(b),
        heightCm: m.height_cm,
        relationship: m.relationship || (b ? roleOf(b) : null),
        isPregnant: m.is_pregnant,
        isBreastfeeding: m.is_breastfeeding,
        registered: !!b,
      });
    }
    for (const b of selectedMembers) {
      if (claimed.has(b.id)) continue;
      out.push({
        key: `b:${b.id}`,
        memberId: null,
        beneficiaryId: b.id,
        name: b.full_name,
        sex: sexFrom(b),
        age: ageFrom(b),
        heightCm: null,
        relationship: roleOf(b),
        isPregnant: false,
        isBreastfeeding: false,
        registered: true,
      });
    }
    return out;
  }, [rosterMembers, selectedMembers, beneficiaries]);

  const morbidityFor = (p: RosterPerson): MorbidityRow[] =>
    morbidityRows.filter((m) =>
      (p.beneficiaryId && m.beneficiary_id === p.beneficiaryId) ||
      (p.memberId && m.member_id === p.memberId));

  const submitMember = async (draft: Partial<HouseholdMemberRow>) => {
    if (!selected) return;
    setBusy(true);
    try {
      await saveHouseholdMember({
        ...draft,
        project_id: projectId,
        module_id: moduleId || null,
        household_id: selected.id,
        full_name: String(draft.full_name || "").trim(),
      });
      toast({ title: draft.id ? "Member updated" : "Member added to the household" });
      setRosterOpen(false);
      setEditingMember(null);
      await reloadMembers();
    } catch (e) {
      toast({ title: "Could not save the member", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const removeMember = async (id: string) => {
    setBusy(true);
    try {
      await deleteHouseholdMember(id);
      await reloadMembers();
    } catch (e) {
      toast({ title: "Could not remove the member", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const submitMorbidity = async (draft: Partial<MorbidityRow>) => {
    if (!passportPerson || !selected) return;
    setBusy(true);
    try {
      await saveMorbidityRecord({
        ...draft,
        project_id: projectId,
        module_id: moduleId || null,
        household_id: selected.id,
        beneficiary_id: passportPerson.beneficiaryId,
        member_id: passportPerson.memberId,
        condition: String(draft.condition || "lymphoedema"),
      });
      toast({ title: "Morbidity care recorded" });
      await reloadMorbidity();
    } catch (e) {
      toast({ title: "Could not save the care record", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };


  const totals = useMemo(() => {
    const cov = householdCoverage(rounds);
    const unimproved = households.filter((h) => {
      const w = washSources.find((s) => s.id === h.wash_source_id);
      return w && !w.is_improved;
    }).length;
    return {
      households: households.length,
      people: beneficiaries.filter((b) => householdOf(b)).length,
      coverage: cov.percent,
      unimproved,
    };
  }, [households, rounds, washSources, beneficiaries]);

  const communities = useMemo(() => {
    const set = new Set<string>();
    for (const r of rounds) {
      const h = households.find((x) => x.id === r.household_id);
      const c = r.community || h?.village;
      if (c) set.add(c);
    }
    return Array.from(set).sort();
  }, [rounds, households]);

  const filteredRounds = useMemo(() => rounds.filter((r) => {
    const h = households.find((x) => x.id === r.household_id);
    if (roundFilters.disease !== "all" && r.disease !== roundFilters.disease) return false;
    if (roundFilters.community !== "all" && (r.community || h?.village) !== roundFilters.community) return false;
    if (roundFilters.from && r.round_date < roundFilters.from) return false;
    if (roundFilters.to && r.round_date > roundFilters.to) return false;
    return true;
  }), [rounds, households, roundFilters]);


  const openNewHousehold = () => {
    setHhDraft({
      household_code: nextHouseholdCode(households),
      household_size: 1,
      name: "", head_name: "", village: "", ward: "", lga: "", state: "",
    });
    setHhOpen(true);
  };

  const submitHousehold = async () => {
    if (!hhDraft.household_code) return;
    setBusy(true);
    try {
      const id = await saveHousehold({
        ...hhDraft,
        household_size: Number(hhDraft.household_size) || 1,
        project_id: projectId,
        module_id: moduleId || null,
      } as never);
      toast({ title: hhDraft.id ? "Household updated" : "Household registered" });
      setHhOpen(false);
      await reload();
      setSelectedId(id);
    } catch (e) {
      toast({ title: "Could not save the household", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const submitWash = async () => {
    if (!String(washDraft.name || "").trim()) return;
    setBusy(true);
    try {
      await saveWashSource({
        project_id: projectId,
        name: String(washDraft.name),
        source_type: String(washDraft.source_type),
        sanitation_type: String(washDraft.sanitation_type),
        is_improved: Boolean(washDraft.is_improved),
        village: String(washDraft.village || "") || null,
      } as never);
      toast({ title: "Water point added" });
      setWashOpen(false);
      setWashDraft({ name: "", source_type: "borehole", sanitation_type: "pit_slab", is_improved: true, village: "" });
      await reload();
    } catch (e) {
      toast({ title: "Could not save the water point", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const submitMda = async (draft: Partial<MdaRoundRow>, rows: MdaTreatmentRow[]) => {
    if (!selected) return;
    setBusy(true);
    try {
      await saveMdaRoundWithTreatments({
        ...draft,
        project_id: projectId,
        module_id: moduleId || null,
        household_id: selected.id,
        round_name: String(draft.round_name || ""),
      } as never, rows);
      toast({ title: editingRound ? "Treatment round updated" : "Treatment round recorded" });
      setMdaOpen(false);
      setEditingRound(null);
      await reload();
    } catch (e) {
      toast({ title: "Could not save the round", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const confirmDeleteRound = async () => {
    if (!deleteRound) return;
    setBusy(true);
    try {
      await deleteMdaRound(deleteRound.id);
      toast({ title: "Treatment round deleted" });
      setDeleteRound(null);
      if (detailRound?.id === deleteRound.id) setDetailRound(null);
      await reload();
    } catch (e) {
      toast({ title: "Could not delete the round", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const exportRounds = () => {
    downloadCsv(
      `mda-rounds-${new Date().toISOString().slice(0, 10)}.csv`,
      roundsCsv(filteredRounds, households, treatments),
    );
  };


  const attachMember = async () => {
    if (!selected || !memberId) return;
    setBusy(true);
    try {
      await setBeneficiaryHousehold(memberId, selected.id, memberRole);
      toast({ title: "Added to the household" });
      setMemberOpen(false);
      setMemberId("");
      onChanged?.();
    } catch (e) {
      toast({ title: "Could not add the person", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const detach = async (b: BeneficiaryRow) => {
    setBusy(true);
    try {
      await setBeneficiaryHousehold(b.id, null, null);
      onChanged?.();
    } catch (e) {
      toast({ title: "Could not remove the person", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const Metric = ({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) => (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold" style={{ color: `hsl(${tone})` }}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Households" value={String(totals.households)} hint="Registered clusters on this project" tone="var(--health-blue, 209 100% 36%)" />
        <Metric label="People grouped" value={String(totals.people)} hint="Beneficiaries attached to a household" tone="var(--health-teal, 176 100% 31%)" />
        <Metric label="MDA coverage" value={`${totals.coverage}%`} hint="Treated against eligible, all rounds" tone="var(--health-blue, 209 100% 36%)" />
        <Metric label="Unimproved water" value={String(totals.unimproved)} hint="Households on an unimproved source" tone="var(--health-red, 356 63% 56%)" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Home className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-foreground">Household register</h3>
            <div className="flex-1" />
            {canManage && (
              <Button size="sm" className="gap-1" onClick={openNewHousehold}>
                <Plus className="h-4 w-4" /> New
              </Button>
            )}
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8" placeholder="Search households, heads or villages"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {canManage && (
            <Button variant="outline" size="sm" className="mb-2 w-full gap-1" onClick={() => setWashOpen(true)}>
              <Droplets className="h-4 w-4" /> Add a community water point
            </Button>
          )}
          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {loading && <p className="text-sm text-muted-foreground">Loading households…</p>}
            {!loading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">No households registered yet.</p>
            )}
            {filtered.map((h) => {
              const members = membersByHousehold.get(h.id) || [];
              const w = washSources.find((s) => s.id === h.wash_source_id);
              return (
                <button
                  key={h.id}
                  onClick={() => setSelectedId(h.id)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors",
                    selected?.id === h.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{h.name || h.household_code}</span>
                    <Badge variant="outline">{h.household_code}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {h.head_name ? `Head: ${h.head_name} · ` : ""}{members.length} registered of {h.household_size}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {h.village && <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" />{h.village}</Badge>}
                    {w && (
                      <Badge variant="outline" className={cn("gap-1", !w.is_improved && "border-destructive/40 text-destructive")}>
                        <Droplets className="h-3 w-3" />{w.name}
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <div className="space-y-4">
          {!selected && (
            <Card className="p-8 text-center text-muted-foreground">
              Select or register a household to group beneficiaries, record treatment rounds and link a water point.
            </Card>
          )}

          {selected && (
            <>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-bold text-foreground">
                      {selected.name || selected.household_code}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {[selected.head_name && `Head: ${selected.head_name}`, selected.village, selected.ward, selected.lga]
                        .filter(Boolean).join(" · ") || "No location recorded"}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setHhDraft(selected); setHhOpen(true); }}>
                        Edit household
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setMemberOpen(true)}>
                        <UserPlus className="h-4 w-4" /> Add member
                      </Button>
                      <Button size="sm" className="gap-1" onClick={() => { setEditingRound(null); setMdaOpen(true); }}>
                        <Pill className="h-4 w-4" /> Record MDA round
                      </Button>
                    </div>
                  )}
                </div>
                <Separator className="my-3" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Household size</p>
                    <p className="text-lg font-semibold text-foreground">{selected.household_size}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">MDA coverage</p>
                    <p className="text-lg font-semibold text-foreground">
                      {coverage.percent}% <span className="text-xs font-normal text-muted-foreground">({coverage.treated}/{coverage.eligible})</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Water point</p>
                    <p className="text-sm font-medium text-foreground">
                      {washSources.find((w) => w.id === selected.wash_source_id)?.name || "Not linked"}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold text-foreground">Everyone in this household ({roster.length})</h4>
                  <div className="flex-1" />
                  {canManage && (
                    <Button
                      size="sm" variant="outline" className="gap-1"
                      onClick={() => { setEditingMember(null); setRosterOpen(true); }}
                    >
                      <UserPlus className="h-4 w-4" /> Add household member
                    </Button>
                  )}
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Tap a name to open their treatment passport — every round of the five
                  preventive-chemotherapy diseases, plus their morbidity care.
                </p>
                <div className="overflow-x-auto">
                  <Table className="min-w-[680px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Relationship</TableHead>
                        <TableHead>Sex / age</TableHead>
                        <TableHead>On the register</TableHead>
                        <TableHead>Flags</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roster.map((p) => {
                        const b = p.beneficiaryId
                          ? beneficiaries.find((x) => x.id === p.beneficiaryId)
                          : undefined;
                        const care = morbidityFor(p);
                        return (
                          <TableRow key={p.key}>
                            <TableCell>
                              <button
                                className="font-medium text-primary hover:underline"
                                onClick={() => setPassportPerson(p)}
                              >
                                {p.name}
                              </button>
                              {b && <p className="text-xs text-muted-foreground">{b.case_id}</p>}
                            </TableCell>
                            <TableCell>{relationshipLabel(p.relationship)}</TableCell>
                            <TableCell>
                              {[p.sex, p.age != null ? `${p.age} yrs` : null].filter(Boolean).join(" · ") || "—"}
                            </TableCell>
                            <TableCell>
                              {p.registered
                                ? <Badge variant="outline" className="border-primary/40 text-primary">Beneficiary</Badge>
                                : <Badge variant="outline">Member only</Badge>}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {p.isPregnant && <Badge variant="outline">Pregnant</Badge>}
                                {p.isBreastfeeding && <Badge variant="outline">Breastfeeding</Badge>}
                                {care.length > 0 && (
                                  <Badge variant="outline" className="border-amber-500/40 text-amber-700">
                                    {care.length} morbidity record{care.length > 1 ? "s" : ""}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {canManage && (
                                <div className="flex justify-end gap-1">
                                  {p.memberId && (
                                    <Button
                                      size="sm" variant="ghost"
                                      onClick={() => {
                                        const row = rosterMembers.find((m) => m.id === p.memberId) || null;
                                        setEditingMember(row);
                                        setRosterOpen(true);
                                      }}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {p.memberId && !p.registered && (
                                    <Button
                                      size="sm" variant="ghost" className="text-destructive" disabled={busy}
                                      onClick={() => void removeMember(p.memberId as string)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {b && (
                                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void detach(b)}>
                                      Remove
                                    </Button>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {roster.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            Nobody listed in this household yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>


              <Card className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Pill className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold text-foreground">Mass drug administration rounds</h4>
                </div>
                <div className="overflow-x-auto">
                  <Table className="min-w-[760px]">

                    <TableHeader>
                      <TableRow>
                        <TableHead>Round</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Disease</TableHead>
                        <TableHead>Medicine</TableHead>
                        <TableHead>Treated / eligible</TableHead>
                        <TableHead>Coverage</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedRounds.map((r) => {
                        const pct = r.persons_eligible ? Math.round((r.persons_treated / r.persons_eligible) * 100) : 0;
                        const t = tallyTreatments(treatments.filter((x) => x.round_id === r.id), r);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium text-foreground">
                              <button className="text-primary hover:underline" onClick={() => setDetailRound(r)}>
                                {r.round_name}
                              </button>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {roundIsIncomplete(r) && (
                                  <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700">
                                    <AlertTriangle className="h-3 w-3" /> Incomplete
                                  </Badge>
                                )}
                                {t.serious > 0 && (
                                  <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                                    <AlertTriangle className="h-3 w-3" /> {t.serious} serious
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{new Date(r.round_date).toLocaleDateString()}</TableCell>
                            <TableCell>{diseaseLabel(r.disease)}</TableCell>
                            <TableCell>{r.drug || "—"}</TableCell>
                            <TableCell>{r.persons_treated} / {r.persons_eligible}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn(pct >= 80 ? "border-emerald-500/40 text-emerald-700" : "border-amber-500/40 text-amber-700")}>
                                {pct}%
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {canManage && (
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="ghost" className="gap-1"
                                    onClick={() => { setEditingRound(r); setMdaOpen(true); }}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="gap-1 text-destructive"
                                    onClick={() => setDeleteRound(r)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {selectedRounds.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            No treatment round recorded for this household yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </>
          )}

          {/* Project-wide rounds */}
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Pill className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-foreground">All treatment rounds on this project</h4>
              <Badge variant="outline">{filteredRounds.length}</Badge>
              <div className="flex-1" />
              <Button size="sm" variant="outline" className="gap-1" disabled={!filteredRounds.length} onClick={exportRounds}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
            <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Select value={roundFilters.disease} onValueChange={(v) => setRoundFilters({ ...roundFilters, disease: v })}>
                <SelectTrigger><SelectValue placeholder="All diseases" /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  <SelectItem value="all">All diseases</SelectItem>
                  {NTD_DISEASES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={roundFilters.community} onValueChange={(v) => setRoundFilters({ ...roundFilters, community: v })}>
                <SelectTrigger><SelectValue placeholder="All communities" /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  <SelectItem value="all">All communities</SelectItem>
                  {communities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" value={roundFilters.from} onChange={(e) => setRoundFilters({ ...roundFilters, from: e.target.value })} />
              <Input type="date" value={roundFilters.to} onChange={(e) => setRoundFilters({ ...roundFilters, to: e.target.value })} />
            </div>
            <div className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Round</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Household</TableHead>
                    <TableHead>Community</TableHead>
                    <TableHead>Disease</TableHead>
                    <TableHead>Coverage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRounds.map((r) => {
                    const h = households.find((x) => x.id === r.household_id);
                    const pct = r.persons_eligible ? Math.round((r.persons_treated / r.persons_eligible) * 100) : 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium text-foreground">
                          <button className="text-primary hover:underline" onClick={() => setDetailRound(r)}>
                            {r.round_name}
                          </button>
                        </TableCell>
                        <TableCell>{new Date(r.round_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <button className="hover:underline" onClick={() => setSelectedId(r.household_id)}>
                            {h?.household_code || "—"}
                          </button>
                        </TableCell>
                        <TableCell>{r.community || h?.village || "—"}</TableCell>
                        <TableCell>{diseaseLabel(r.disease)}</TableCell>
                        <TableCell>{r.persons_treated}/{r.persons_eligible} ({pct}%)</TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredRounds.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No rounds match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

        </div>
      </div>

      {/* Household editor */}
      <Dialog open={hhOpen} onOpenChange={setHhOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{hhDraft.id ? "Edit household" : "Register a household"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm">Household code</Label>
              <Input
                className="mt-1" value={hhDraft.household_code || ""}
                onChange={(e) => setHhDraft({ ...hhDraft, household_code: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm">Household name</Label>
              <Input
                className="mt-1" placeholder="e.g. Compound of Malam Sani"
                value={hhDraft.name || ""}
                onChange={(e) => setHhDraft({ ...hhDraft, name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm">Head of household</Label>
              <Input
                className="mt-1" value={hhDraft.head_name || ""}
                onChange={(e) => setHhDraft({ ...hhDraft, head_name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm">People living here</Label>
              <Input
                type="number" min={1} className="mt-1" value={String(hhDraft.household_size ?? 1)}
                onChange={(e) => setHhDraft({ ...hhDraft, household_size: Number(e.target.value) })}
              />
            </div>
            <div className="sm:col-span-2">
              <GeoCascadeFields
                value={{
                  state: hhDraft.state || "", lga: hhDraft.lga || "",
                  ward: hhDraft.ward || "", community: hhDraft.village || "",
                }}
                communityLabel="Village / settlement"
                onChange={(p) => setHhDraft({
                  ...hhDraft,
                  state: p.state ?? "", lga: p.lga ?? "",
                  ward: p.ward ?? "", village: p.community ?? "",
                })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-sm">Community water point</Label>
              <Select
                value={hhDraft.wash_source_id || "none"}
                onValueChange={(v) => setHhDraft({ ...hhDraft, wash_source_id: v === "none" ? null : v })}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Not linked" /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  <SelectItem value="none">Not linked</SelectItem>
                  {washSources.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} — {washTypeLabel(w.source_type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-sm">Notes</Label>
              <Textarea
                className="mt-1" rows={2} value={hhDraft.notes || ""}
                onChange={(e) => setHhDraft({ ...hhDraft, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHhOpen(false)}>Cancel</Button>
            <Button disabled={busy} onClick={() => void submitHousehold()}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save household
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Water point */}
      <Dialog open={washOpen} onOpenChange={setWashOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add a community water point</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Name</Label>
              <Input
                className="mt-1" placeholder="e.g. Kofar Gabas borehole"
                value={String(washDraft.name)} onChange={(e) => setWashDraft({ ...washDraft, name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm">Water source type</Label>
              <Select
                value={String(washDraft.source_type)}
                onValueChange={(v) => {
                  const t = WASH_SOURCE_TYPES.find((x) => x.value === v);
                  setWashDraft({ ...washDraft, source_type: v, is_improved: !!t?.improved });
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {WASH_SOURCE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Sanitation at the households it serves</Label>
              <Select
                value={String(washDraft.sanitation_type)}
                onValueChange={(v) => setWashDraft({ ...washDraft, sanitation_type: v })}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {SANITATION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Village / settlement</Label>
              <Input className="mt-1" value={String(washDraft.village)} onChange={(e) => setWashDraft({ ...washDraft, village: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Improved source</p>
                <p className="text-xs text-muted-foreground">Protected from outside contamination.</p>
              </div>
              <Switch
                checked={Boolean(washDraft.is_improved)}
                onCheckedChange={(v) => setWashDraft({ ...washDraft, is_improved: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWashOpen(false)}>Cancel</Button>
            <Button disabled={busy} onClick={() => void submitWash()}>Save water point</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MDA round — person-level register */}
      {selected && (
        <MdaRoundDialog
          open={mdaOpen}
          onOpenChange={(v) => { setMdaOpen(v); if (!v) setEditingRound(null); }}
          projectId={projectId}
          moduleId={moduleId}
          household={selected}
          members={selectedMembers}
          otherMembers={roster.filter((p) => !p.registered && p.memberId).map((p) => ({
            id: p.memberId as string, name: p.name, sex: p.sex, age: p.age,
          }))}
          existingRounds={rounds}
          round={editingRound}
          roundTreatments={editingRound ? treatments.filter((t) => t.round_id === editingRound.id) : []}
          saving={busy}
          onSave={submitMda}
        />
      )}

      {/* Round detail */}
      <Dialog open={!!detailRound} onOpenChange={(v) => !v && setDetailRound(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailRound?.round_name} — who was treated</DialogTitle>
          </DialogHeader>
          {detailRound && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {new Date(detailRound.round_date).toLocaleDateString()} · {diseaseLabel(detailRound.disease)} ·{" "}
                {detailRound.drug || "Medicine not recorded"}
                {detailRound.drug_batch ? ` · Batch ${detailRound.drug_batch}` : ""}
                {detailRound.distributor_name ? ` · Distributor ${detailRound.distributor_name}` : ""}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Tablets</TableHead>
                    <TableHead>Observed</TableHead>
                    <TableHead>Side effect</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {treatments.filter((t) => t.round_id === detailRound.id).map((t, i) => (
                    <TableRow key={t.id || i}>
                      <TableCell className="font-medium text-foreground">{t.person_name}</TableCell>
                      <TableCell>{t.age_years ?? "—"}</TableCell>
                      <TableCell>{outcomeLabel(t.outcome)}</TableCell>
                      <TableCell>{t.tablets ?? "—"}</TableCell>
                      <TableCell>{t.outcome === "treated" ? (t.directly_observed ? "Yes" : "No") : "—"}</TableCell>
                      <TableCell className={cn(t.adverse_event_serious && "font-semibold text-destructive")}>
                        {t.adverse_event || "None"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {treatments.filter((t) => t.round_id === detailRound.id).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        This round has no person-level entries.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete a round */}
      <AlertDialog open={!!deleteRound} onOpenChange={(v) => !v && setDeleteRound(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this treatment round?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteRound?.round_name}” and every person entry recorded under it will be removed.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void confirmDeleteRound()}>Delete round</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Attach member */}
      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add a beneficiary to this household</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Beneficiary</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a beneficiary" /></SelectTrigger>
                <SelectContent className="z-[1200] max-h-72 bg-popover">
                  {unassigned.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.full_name} — {b.case_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {unassigned.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Everyone on this register already belongs to a household.</p>
              )}
            </div>
            <div>
              <Label className="text-sm">Relationship to the head</Label>
              <Select value={memberRole} onValueChange={setMemberRole}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {HOUSEHOLD_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberOpen(false)}>Cancel</Button>
            <Button disabled={busy || !memberId} onClick={() => void attachMember()}>Add to household</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Household member (not a registered beneficiary) */}
      <HouseholdMemberDialog
        open={rosterOpen}
        onOpenChange={(v) => { setRosterOpen(v); if (!v) setEditingMember(null); }}
        member={editingMember}
        saving={busy}
        onSave={submitMember}
      />

      {/* One person's NTD treatment passport */}
      {passportPerson && selected && (
        <PersonNtdPassport
          open={!!passportPerson}
          onOpenChange={(v) => !v && setPassportPerson(null)}
          person={passportPerson}
          householdLabel={selected.name || selected.household_code}
          rounds={selectedRounds}
          treatments={treatments}
          morbidity={morbidityFor(passportPerson)}
          canManage={canManage}
          saving={busy}
          onSaveMorbidity={submitMorbidity}
          onOpenRecord={() => {
            const b = beneficiaries.find((x) => x.id === passportPerson.beneficiaryId);
            if (b) { setPassportPerson(null); onOpenBeneficiary?.(b); }
          }}
        />
      )}
    </div>
  );
};

export default HouseholdsPanel;
