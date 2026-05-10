import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, CheckCircle2, Loader2, Boxes } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface FencedCommunity {
  id: string;
  community_name: string;
  settlement_name: string | null;
  flhf_name: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  center_lat: number | null;
  center_lng: number | null;
  area_m2: number | null;
  created_by: string;
  created_at: string;
}

interface Props {
  projectId: string;
  state?: string;
  lga?: string;
  ward?: string;
  onUse?: (c: FencedCommunity) => void;
  className?: string;
}

/**
 * Lists CES-fenced communities matching the current geo scope.
 * Auto-refreshes via Supabase realtime so a freshly fenced community appears
 * the moment a Locator commits Step 1, without page reload.
 */
export default function LinkedFencedCommunitiesPanel({ projectId, state, lga, ward, onUse, className }: Props) {
  const [items, setItems] = useState<FencedCommunity[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!projectId) return;
    setLoading(true);
    let q = supabase.from("ces_fenced_communities" as any)
      .select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(50);
    if (state) q = q.eq("state", state);
    if (lga) q = q.eq("lga", lga);
    if (ward) q = q.eq("ward", ward);
    const { data } = await q;
    setItems((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [projectId, state, lga, ward]);

  useEffect(() => {
    if (!projectId) return;
    const ch = supabase.channel(`fenced-${projectId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "ces_fenced_communities", filter: `project_id=eq.${projectId}` },
        () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [projectId, state, lga, ward]);

  if (!projectId) return null;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Boxes className="h-4 w-4 text-primary" /> Fenced Communities
          {items.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px]">{items.length}</Badge>}
        </CardTitle>
        <CardDescription className="text-xs">
          Communities already located &amp; fenced by your CES Locators in this {ward ? "ward" : lga ? "LGA" : state ? "state" : "project"}.
          Click <em>Use</em> to autofill this entry.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5 max-h-64 overflow-y-auto">
        {loading && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin" /></div>}
        {!loading && items.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            No fenced communities yet for this scope. They appear here as soon as a Locator finishes Step 1 in Coverage Evaluation.
          </p>
        )}
        {items.map(c => (
          <div key={c.id} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border bg-card hover:bg-muted/40">
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate flex items-center gap-1">
                <MapPin className="h-3 w-3 text-primary flex-shrink-0" />
                {c.community_name}
                {c.settlement_name && <span className="text-muted-foreground font-normal"> • {c.settlement_name}</span>}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {[c.ward, c.lga, c.state].filter(Boolean).join(" • ")}
                {c.area_m2 ? ` • ${(c.area_m2 / 10000).toFixed(2)} ha` : ""}
                {" • "}{new Date(c.created_at).toLocaleDateString()}
              </div>
            </div>
            {onUse && (
              <Button size="sm" variant="outline" className="h-7 text-[11px] flex-shrink-0" onClick={() => onUse(c)}>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Use
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
