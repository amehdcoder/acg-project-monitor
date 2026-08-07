/**
 * MDA Lens configuration dialog (User Management).
 *
 * Lets an admin grant a user scoped access to the two MDA field-operations
 * pages, choose exactly which tabs they may open on each, and lock the data
 * they see to specific States / LGAs.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { invalidateMdaLensCache } from "@/hooks/useMdaLens";
import {
  Check, Compass, Database, Globe2, Layers, Loader2, MapPin, Search, Sparkles, Trash2,
} from "lucide-react";
import { MICROPLAN_TABS, SUPERVISORY_TABS, type MdaLensGrant } from "@/lib/mdaLens/config";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  userName: string;
  userEmail?: string | null;
  onSaved?: () => void;
}

const emptyDraft = (userId: string): MdaLensGrant => ({
  user_id: userId,
  enabled: true,
  microplan_tabs: [],
  supervisory_tabs: [],
  states: [],
  lgas: [],
  wards: [],
  project_ids: [],
  campaign_types: [],
  can_export: true,
});

export default function MdaLensDialog({ open, onOpenChange, userId, userName, userEmail, onSaved }: Props) {
  const { user } = useAuth();
  const [draft, setDraft] = useState<MdaLensGrant>(() => emptyDraft(userId));
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stateQuery, setStateQuery] = useState("");
  const [lgaQuery, setLgaQuery] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("mda_lens_grants")
      .select("user_id, enabled, microplan_tabs, supervisory_tabs, states, lgas, wards, project_ids, campaign_types, can_export")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) { setDraft({ wards: [], project_ids: [], campaign_types: [], ...data } as MdaLensGrant); setExists(true); }
    else { setDraft(emptyDraft(userId)); setExists(false); }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    void load();
    void supabase.from("projects").select("id,name").order("name").then(({ data }) => setProjects(data || []));
    // Campaign types must mirror the values actually stored on submissions —
    // a hard-coded disease list silently filters every row out of scope.
    void supabase
      .from("microplan_entries")
      .select("campaign_type")
      .not("campaign_type", "is", null)
      .limit(5000)
      .then(({ data }) => {
        const found = [...new Set((data || []).map((r: any) => String(r.campaign_type || "").trim()).filter(Boolean))].sort();
        setCampaignOptions(found);
      });
  }, [open, load]);

  const campaignChoices = useMemo(
    () => [...new Set([...campaignOptions, ...draft.campaign_types])].sort(),
    [campaignOptions, draft.campaign_types],
  );
  const prettyCampaign = (v: string) =>
    v.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());


  const allStates = useMemo(() => getAllStates(), []);
  const visibleStates = useMemo(
    () => allStates.filter((s) => s.toLowerCase().includes(stateQuery.toLowerCase())),
    [allStates, stateQuery],
  );
  const availableLgas = useMemo(() => {
    const src = draft.states.length ? draft.states : [];
    const out = new Set<string>();
    src.forEach((s) => getLGAsForState(s).forEach((l) => out.add(l)));
    return [...out].sort();
  }, [draft.states]);
  const visibleLgas = useMemo(
    () => availableLgas.filter((l) => l.toLowerCase().includes(lgaQuery.toLowerCase())),
    [availableLgas, lgaQuery],
  );
  const availableWards = useMemo(() => {
    const out = new Set<string>();
    draft.states.forEach((state) => draft.lgas.forEach((lga) =>
      getWardsForLGA(state, lga).forEach((ward) => out.add(ward))
    ));
    return [...out].sort();
  }, [draft.states, draft.lgas]);

  const toggle = (key: "microplan_tabs" | "supervisory_tabs" | "states" | "lgas" | "wards" | "project_ids" | "campaign_types", value: string) =>
    setDraft((d) => {
      const list = d[key];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      if (key === "states") {
        const allowed = new Set(next.flatMap((s) => getLGAsForState(s)));
        return { ...d, states: next, lgas: d.lgas.filter((l) => allowed.has(l)), wards: [] };
      }
      if (key === "lgas") return { ...d, lgas: next, wards: [] };
      return { ...d, [key]: next };
    });

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...draft, user_id: userId, granted_by: user?.id ?? null };
      const { error } = await supabase.from("mda_lens_grants").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      invalidateMdaLensCache(userId);
      toast({ title: "MDA Lens saved", description: `Scoped access updated for ${userName}.` });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const revoke = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("mda_lens_grants").delete().eq("user_id", userId);
      if (error) throw error;
      invalidateMdaLensCache(userId);
      toast({ title: "MDA Lens removed", description: `${userName} no longer has scoped MDA access.` });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Could not remove", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const chipCount = (n: number, all: number) => (n === 0 ? `All ${all}` : `${n} selected`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col p-0">
        <div className="bg-gradient-to-r from-primary/15 via-primary/5 to-transparent border-b p-5">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Compass className="h-4 w-4" />
              </span>
              MDA Lens · {userName}
            </DialogTitle>
            <DialogDescription>
              {userEmail || "Grant scoped, real-time filtered access to Geo Microplanning and the Integrated Supervisory Checklist."}
            </DialogDescription>
          </DialogHeader>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="p-5 space-y-5">
              {/* Master switch */}
              <div className="rounded-xl border p-4 flex items-center justify-between gap-4 bg-card">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> Enable MDA Lens
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Unlocks Geo Microplanning and the Integrated Supervisory Checklist for this user.
                  </p>
                </div>
                <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4 space-y-3">
                  <p className="text-sm font-semibold">Geo Microplanning projects</p>
                  <p className="text-xs text-muted-foreground">Empty includes all assigned project dashboards.</p>
                  <div className="max-h-44 overflow-y-auto space-y-1">
                    {projects.map((project) => (
                      <label key={project.id} className="flex items-center gap-2 text-xs rounded-md p-1.5 hover:bg-muted/60 cursor-pointer">
                        <Checkbox checked={draft.project_ids.includes(project.id)} onCheckedChange={() => toggle("project_ids", project.id)} />
                        {project.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border p-4 space-y-3">
                  <p className="text-sm font-semibold">MDA campaign types</p>
                  <p className="text-xs text-muted-foreground">
                    Read from live submissions. Leave empty to include every campaign type.
                  </p>
                  <div className="max-h-44 overflow-y-auto space-y-1">
                    {campaignChoices.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        No campaign types recorded yet — all campaigns will be visible.
                      </p>
                    ) : campaignChoices.map((campaign) => (
                      <label key={campaign} className="flex items-center gap-2 text-xs rounded-md p-1.5 hover:bg-muted/60 cursor-pointer">
                        <Checkbox checked={draft.campaign_types.includes(campaign)} onCheckedChange={() => toggle("campaign_types", campaign)} />
                        {prettyCampaign(campaign)}
                      </label>
                    ))}
                  </div>
                </div>

              </div>

              {/* Geography scope */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <Globe2 className="h-4 w-4 text-indigo-500" /> States
                    </p>
                    <Badge variant="secondary" className="text-[10px]">
                      {chipCount(draft.states.length, allStates.length)}
                    </Badge>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={stateQuery}
                      onChange={(e) => setStateQuery(e.target.value)}
                      placeholder="Search states"
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto pr-1 space-y-1">
                    {visibleStates.map((s) => (
                      <label key={s} className="flex items-center gap-2 text-xs rounded-md p-1.5 hover:bg-muted/60 cursor-pointer">
                        <Checkbox checked={draft.states.includes(s)} onCheckedChange={() => toggle("states", s)} />
                        {s}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-amber-500" /> LGAs
                    </p>
                    <Badge variant="secondary" className="text-[10px]">
                      {draft.lgas.length === 0 ? "All in states" : `${draft.lgas.length} selected`}
                    </Badge>
                  </div>
                  {draft.states.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">
                      Select one or more States first to narrow down LGAs.
                    </p>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={lgaQuery}
                          onChange={(e) => setLgaQuery(e.target.value)}
                          placeholder="Search LGAs"
                          className="h-8 pl-7 text-xs"
                        />
                      </div>
                      <div className="max-h-52 overflow-y-auto pr-1 space-y-1">
                        {visibleLgas.map((l) => (
                          <label key={l} className="flex items-center gap-2 text-xs rounded-md p-1.5 hover:bg-muted/60 cursor-pointer">
                            <Checkbox checked={draft.lgas.includes(l)} onCheckedChange={() => toggle("lgas", l)} />
                            {l}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {draft.lgas.length > 0 && (
                <div className="rounded-xl border p-4 space-y-3">
                  <p className="text-sm font-semibold">Wards</p>
                  <p className="text-xs text-muted-foreground">Optional; empty includes all Wards in the selected LGAs.</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1 max-h-44 overflow-y-auto">
                    {availableWards.map((ward) => (
                      <label key={ward} className="flex items-center gap-2 text-xs rounded-md p-1.5 hover:bg-muted/60 cursor-pointer">
                        <Checkbox checked={draft.wards.includes(ward)} onCheckedChange={() => toggle("wards", ward)} />
                        {ward}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-emerald-500" /> Geo Microplanning tabs
                    </p>
                    <Badge variant="secondary" className="text-[10px]">
                      {chipCount(draft.microplan_tabs.length, MICROPLAN_TABS.length)}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {MICROPLAN_TABS.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-xs rounded-md p-1.5 hover:bg-muted/60 cursor-pointer">
                        <Checkbox
                          checked={draft.microplan_tabs.includes(t.id)}
                          onCheckedChange={() => toggle("microplan_tabs", t.id)}
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <Layers className="h-4 w-4 text-sky-500" /> Supervisory Checklist tabs
                    </p>
                    <Badge variant="secondary" className="text-[10px]">
                      {chipCount(draft.supervisory_tabs.length, SUPERVISORY_TABS.length)}
                    </Badge>
                  </div>
                  <div className="grid gap-1.5">
                    {SUPERVISORY_TABS.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-xs rounded-md p-1.5 hover:bg-muted/60 cursor-pointer">
                        <Checkbox
                          checked={draft.supervisory_tabs.includes(t.id)}
                          onCheckedChange={() => toggle("supervisory_tabs", t.id)}
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>


              <div className="rounded-xl border p-4 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" /> Allow scoped data export
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Shows a formatted Excel export of only the States / LGAs granted above.
                  </p>
                </div>
                <Switch checked={draft.can_export} onCheckedChange={(v) => setDraft((d) => ({ ...d, can_export: v }))} />
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="border-t p-4 gap-2 sm:justify-between">
          <Button variant="ghost" onClick={revoke} disabled={!exists || saving} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-1" /> Remove lens
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || loading}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Save MDA Lens
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
