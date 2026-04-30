import { useEffect, useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Trash2, Save, ShieldCheck, UserPlus } from "lucide-react";

const DESIGNATIONS = [
  { value: "state_supervisor", label: "State Supervisor" },
  { value: "lga_supervisor", label: "LGA Supervisor" },
  { value: "ward_supervisor", label: "Ward Supervisor" },
  { value: "flhf", label: "FLHF" },
  { value: "cdd", label: "Community Directed Distributor (CDD)" },
  { value: "partner", label: "Implementing Partner" },
  { value: "other", label: "Other" },
] as const;

type Designation = typeof DESIGNATIONS[number]["value"];

interface MicroplanEntryLite {
  state: string;
  lga: string;
  ward: string;
  flhf_name: string;
  community_name: string;
  settlement_name: string | null;
}

interface UserOpt {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

interface Assignment {
  id: string;
  user_id: string;
  designation: Designation;
  label: string | null;
  states: string[];
  lgas: string[];
  wards: string[];
  flhfs: string[];
  communities: string[];
  settlements: string[];
  notes: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  entries: MicroplanEntryLite[];
}

const MultiSelectChips = ({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) => {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => options.filter(o => o.toLowerCase().includes(q.toLowerCase())),
    [options, q]
  );
  const toggle = (o: string) =>
    onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold text-foreground">
          {label}{" "}
          <span className="text-muted-foreground font-normal">
            ({selected.length === 0 ? "ALL" : selected.length})
          </span>
        </label>
        {selected.length > 0 && (
          <button onClick={() => onChange([])} className="text-[10px] text-muted-foreground hover:text-foreground">
            Clear
          </button>
        )}
      </div>
      <Input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={`Search ${label.toLowerCase()}…`}
        className="h-7 text-xs"
      />
      <div className="border border-border rounded-md max-h-32 overflow-y-auto bg-muted/20">
        {filtered.length === 0 ? (
          <div className="text-[10px] text-muted-foreground p-2 text-center">No options</div>
        ) : (
          filtered.map(o => (
            <label key={o} className="flex items-center gap-2 px-2 py-1 hover:bg-muted cursor-pointer text-[11px]">
              <Checkbox checked={selected.includes(o)} onCheckedChange={() => toggle(o)} />
              <span className="flex-1 truncate">{o}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
};

const DesignationManagerDialog = ({ open, onClose, entries }: Props) => {
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchUser, setSearchUser] = useState("");

  const [selectedUser, setSelectedUser] = useState<string>("");
  const [designation, setDesignation] = useState<Designation>("lga_supervisor");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [states, setStates] = useState<string[]>([]);
  const [lgas, setLgas] = useState<string[]>([]);
  const [wards, setWards] = useState<string[]>([]);
  const [flhfs, setFlhfs] = useState<string[]>([]);
  const [communities, setCommunities] = useState<string[]>([]);
  const [settlements, setSettlements] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const allStates = useMemo(() => [...new Set(entries.map(e => e.state).filter(Boolean))].sort(), [entries]);
  const filteredEntries = useMemo(() => {
    let e = entries;
    if (states.length) e = e.filter(x => states.includes(x.state));
    if (lgas.length) e = e.filter(x => lgas.includes(x.lga));
    if (wards.length) e = e.filter(x => wards.includes(x.ward));
    if (flhfs.length) e = e.filter(x => flhfs.includes(x.flhf_name));
    if (communities.length) e = e.filter(x => communities.includes(x.community_name));
    return e;
  }, [entries, states, lgas, wards, flhfs, communities]);

  const lgaOptions = useMemo(
    () => [...new Set((states.length ? entries.filter(e => states.includes(e.state)) : entries).map(e => e.lga))].sort(),
    [entries, states]
  );
  const wardOptions = useMemo(
    () => [...new Set(filteredEntries.map(e => e.ward))].sort(),
    [filteredEntries]
  );
  const flhfOptions = useMemo(
    () => [...new Set(filteredEntries.map(e => e.flhf_name))].sort(),
    [filteredEntries]
  );
  const communityOptions = useMemo(
    () => [...new Set(filteredEntries.map(e => e.community_name))].sort(),
    [filteredEntries]
  );
  const settlementOptions = useMemo(
    () => [...new Set(filteredEntries.map(e => e.settlement_name).filter(Boolean) as string[])].sort(),
    [filteredEntries]
  );

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, email, first_name, last_name")
      .order("first_name", { ascending: true });
    setUsers(data || []);
  }, []);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("microplan_designation_assignments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Could not load assignments", description: error.message, variant: "destructive" });
    } else {
      setAssignments((data as Assignment[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      fetchUsers();
      fetchAssignments();
    }
  }, [open, fetchUsers, fetchAssignments]);

  const reset = () => {
    setSelectedUser("");
    setLabel("");
    setNotes("");
    setStates([]);
    setLgas([]);
    setWards([]);
    setFlhfs([]);
    setCommunities([]);
    setSettlements([]);
  };

  const handleSave = async () => {
    if (!selectedUser) {
      toast({ title: "Select a user", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("microplan_designation_assignments").insert({
      user_id: selectedUser,
      designation,
      label: label || null,
      states, lgas, wards, flhfs, communities, settlements,
      notes: notes || null,
      granted_by: auth.user?.id!,
    });
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Designation assigned" });
      reset();
      fetchAssignments();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("microplan_designation_assignments").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Assignment removed" });
      fetchAssignments();
    }
  };

  const userLookup = useMemo(() => {
    const m = new Map<string, UserOpt>();
    users.forEach(u => m.set(u.user_id, u));
    return m;
  }, [users]);

  const filteredUsers = useMemo(() => {
    if (!searchUser) return users;
    const q = searchUser.toLowerCase();
    return users.filter(u =>
      [u.email, u.first_name, u.last_name].some(v => v?.toLowerCase().includes(q))
    );
  }, [users, searchUser]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Microplanning Designations & Scope
          </DialogTitle>
          <DialogDescription className="text-xs">
            Assign designations to users and restrict their scope. Leave a level empty to mean ALL within parent scope.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-4 flex-1 overflow-hidden">
          <Card className="border-border/50 overflow-hidden flex flex-col">
            <CardContent className="p-3 space-y-3 overflow-y-auto">
              <div className="flex items-center gap-2 mb-1">
                <UserPlus className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold">New Assignment</h3>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold">User</label>
                <Input
                  value={searchUser}
                  onChange={e => setSearchUser(e.target.value)}
                  placeholder="Search user by name or email…"
                  className="h-8 text-xs"
                />
                <div className="border border-border rounded-md max-h-28 overflow-y-auto bg-muted/20">
                  {filteredUsers.slice(0, 50).map(u => (
                    <button
                      key={u.user_id}
                      onClick={() => setSelectedUser(u.user_id)}
                      className={`w-full text-left px-2 py-1.5 text-[11px] hover:bg-muted ${
                        selectedUser === u.user_id ? "bg-primary/15 font-semibold" : ""
                      }`}
                    >
                      {u.first_name || ""} {u.last_name || ""}
                      <span className="text-muted-foreground">· {u.email}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold">Designation</label>
                  <Select value={designation} onValueChange={v => setDesignation(v as Designation)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DESIGNATIONS.map(d => (
                        <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold">Custom label (optional)</label>
                  <Input
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder="e.g. Northern Zone Lead"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <MultiSelectChips label="States" options={allStates} selected={states} onChange={setStates} />
              <MultiSelectChips label="LGAs" options={lgaOptions} selected={lgas} onChange={setLgas} />
              <MultiSelectChips label="Wards" options={wardOptions} selected={wards} onChange={setWards} />
              <MultiSelectChips label="FLHFs" options={flhfOptions} selected={flhfs} onChange={setFlhfs} />
              <MultiSelectChips label="Communities" options={communityOptions} selected={communities} onChange={setCommunities} />
              <MultiSelectChips label="Settlements" options={settlementOptions} selected={settlements} onChange={setSettlements} />

              <div className="space-y-1">
                <label className="text-[11px] font-semibold">Notes (optional)</label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-8 text-xs" />
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full h-8 text-xs gap-1">
                <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save Assignment"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/50 overflow-hidden flex flex-col">
            <CardContent className="p-3 overflow-y-auto">
              <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Active Assignments ({assignments.length})
              </h3>
              {loading ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
              ) : assignments.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No designation assignments yet.</p>
              ) : (
                <div className="space-y-2">
                  {assignments.map(a => {
                    const u = userLookup.get(a.user_id);
                    const desigLabel = DESIGNATIONS.find(d => d.value === a.designation)?.label || a.designation;
                    const scopeChip = (k: string, arr: string[]) =>
                      arr.length === 0 ? null : (
                        <Badge key={k} variant="outline" className="text-[9px] px-1 py-0">
                          {k}: {arr.length}
                        </Badge>
                      );
                    return (
                      <div key={a.id} className="border border-border rounded-md p-2 bg-muted/10">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold truncate">
                              {u ? `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email : a.user_id}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">{u?.email}</p>
                            <div className="mt-1 flex items-center gap-1 flex-wrap">
                              <Badge className="text-[9px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30">
                                {desigLabel}
                              </Badge>
                              {a.label && <Badge variant="outline" className="text-[9px]">{a.label}</Badge>}
                            </div>
                            <div className="mt-1 flex items-center gap-1 flex-wrap">
                              {scopeChip("States", a.states)}
                              {scopeChip("LGAs", a.lgas)}
                              {scopeChip("Wards", a.wards)}
                              {scopeChip("FLHFs", a.flhfs)}
                              {scopeChip("Comms", a.communities)}
                              {scopeChip("Setts", a.settlements)}
                              {[a.states, a.lgas, a.wards, a.flhfs, a.communities, a.settlements].every(x => x.length === 0) && (
                                <Badge variant="outline" className="text-[9px]">All scope</Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive shrink-0"
                            onClick={() => handleDelete(a.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DesignationManagerDialog;
