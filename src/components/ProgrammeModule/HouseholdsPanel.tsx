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
  Home, Plus, Droplets, Pill, Users, Search, Loader2, MapPin, UserPlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import {
  HOUSEHOLD_ROLES, NTD_DISEASES, SANITATION_TYPES, WASH_SOURCE_TYPES,
  diseaseLabel, householdCoverage, nextHouseholdCode, roleLabel, saveHousehold,
  saveMdaRound, saveWashSource, setBeneficiaryHousehold, useHouseholds, washTypeLabel,
  type HouseholdRow,
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
  const { households, washSources, rounds, loading, reload } = useHouseholds(projectId, moduleId);
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
  const [mdaDraft, setMdaDraft] = useState<Record<string, string>>({
    round_name: "", disease: "lymphatic_filariasis", drug: "Ivermectin + Albendazole",
    round_date: new Date().toISOString().slice(0, 10),
    persons_eligible: "", persons_treated: "", persons_absent: "", persons_refused: "", notes: "",
  });
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] = useState("head");

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

  const submitMda = async () => {
    if (!selected || !mdaDraft.round_name.trim()) return;
    setBusy(true);
    try {
      await saveMdaRound({
        project_id: projectId,
        module_id: moduleId || null,
        household_id: selected.id,
        round_name: mdaDraft.round_name,
        round_date: mdaDraft.round_date,
        disease: mdaDraft.disease,
        drug: mdaDraft.drug || null,
        persons_eligible: Number(mdaDraft.persons_eligible) || 0,
        persons_treated: Number(mdaDraft.persons_treated) || 0,
        persons_absent: Number(mdaDraft.persons_absent) || 0,
        persons_refused: Number(mdaDraft.persons_refused) || 0,
      } as never);
      toast({ title: "Treatment round recorded" });
      setMdaOpen(false);
      await reload();
    } catch (e) {
      toast({ title: "Could not save the round", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
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
                      <Button size="sm" className="gap-1" onClick={() => setMdaOpen(true)}>
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
                <div className="mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold text-foreground">Members ({selectedMembers.length})</h4>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Case ID</TableHead>
                        <TableHead>Relationship</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedMembers.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell>
                            <button className="font-medium text-primary hover:underline" onClick={() => onOpenBeneficiary?.(b)}>
                              {b.full_name}
                            </button>
                          </TableCell>
                          <TableCell>{b.case_id}</TableCell>
                          <TableCell>{roleLabel(roleOf(b))}</TableCell>
                          <TableCell><Badge variant="outline">{b.status}</Badge></TableCell>
                          <TableCell className="text-right">
                            {canManage && (
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void detach(b)}>
                                Remove
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {selectedMembers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No beneficiaries attached to this household yet.
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Round</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Disease</TableHead>
                        <TableHead>Medicine</TableHead>
                        <TableHead>Treated / eligible</TableHead>
                        <TableHead>Coverage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedRounds.map((r) => {
                        const pct = r.persons_eligible ? Math.round((r.persons_treated / r.persons_eligible) * 100) : 0;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium text-foreground">{r.round_name}</TableCell>
                            <TableCell>{new Date(r.round_date).toLocaleDateString()}</TableCell>
                            <TableCell>{diseaseLabel(r.disease)}</TableCell>
                            <TableCell>{r.drug || "—"}</TableCell>
                            <TableCell>{r.persons_treated} / {r.persons_eligible}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn(pct >= 80 ? "border-emerald-500/40 text-emerald-700" : "border-amber-500/40 text-amber-700")}>
                                {pct}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {selectedRounds.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
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
            <div>
              <Label className="text-sm">Village / settlement</Label>
              <Input className="mt-1" value={hhDraft.village || ""} onChange={(e) => setHhDraft({ ...hhDraft, village: e.target.value })} />
            </div>
            <div>
              <Label className="text-sm">Ward</Label>
              <Input className="mt-1" value={hhDraft.ward || ""} onChange={(e) => setHhDraft({ ...hhDraft, ward: e.target.value })} />
            </div>
            <div>
              <Label className="text-sm">LGA</Label>
              <Input className="mt-1" value={hhDraft.lga || ""} onChange={(e) => setHhDraft({ ...hhDraft, lga: e.target.value })} />
            </div>
            <div>
              <Label className="text-sm">State</Label>
              <Input className="mt-1" value={hhDraft.state || ""} onChange={(e) => setHhDraft({ ...hhDraft, state: e.target.value })} />
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

      {/* MDA round */}
      <Dialog open={mdaOpen} onOpenChange={setMdaOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>Record a treatment round</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-sm">Round name</Label>
              <Input
                className="mt-1" placeholder="e.g. 2026 Round 1"
                value={mdaDraft.round_name} onChange={(e) => setMdaDraft({ ...mdaDraft, round_name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm">Date</Label>
              <Input
                type="date" className="mt-1" value={mdaDraft.round_date}
                onChange={(e) => setMdaDraft({ ...mdaDraft, round_date: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm">Disease</Label>
              <Select
                value={mdaDraft.disease}
                onValueChange={(v) => {
                  const d = NTD_DISEASES.find((x) => x.value === v);
                  setMdaDraft({ ...mdaDraft, disease: v, drug: d?.drug || mdaDraft.drug });
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {NTD_DISEASES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-sm">Medicine given</Label>
              <Input className="mt-1" value={mdaDraft.drug} onChange={(e) => setMdaDraft({ ...mdaDraft, drug: e.target.value })} />
            </div>
            {([
              ["persons_eligible", "People eligible"],
              ["persons_treated", "People treated"],
              ["persons_absent", "Absent"],
              ["persons_refused", "Refused"],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <Label className="text-sm">{label}</Label>
                <Input
                  type="number" min={0} className="mt-1" value={mdaDraft[key]}
                  onChange={(e) => setMdaDraft({ ...mdaDraft, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMdaOpen(false)}>Cancel</Button>
            <Button disabled={busy} onClick={() => void submitMda()}>Save round</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
};

export default HouseholdsPanel;
