// Household transmission & social kinship graph.
//
// An interactive network of people, the households they belong to and the
// community water points those households share — the picture a programme
// needs to decide whether to treat an individual or a whole compound.

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Network, Droplets, Home, User, Search, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import { useHouseholds } from "@/lib/programmeModule/households";
import { buildKinshipGraph, type GraphNode } from "@/lib/programmeModule/kinship";

interface Props {
  projectId: string;
  moduleId?: string;
  beneficiaries: BeneficiaryRow[];
  onOpenBeneficiary?: (b: BeneficiaryRow) => void;
}

const KIND_COLOR: Record<GraphNode["kind"], string> = {
  beneficiary: "hsl(var(--health-blue, 209 100% 36%))",
  household: "hsl(var(--health-teal, 176 100% 31%))",
  wash: "hsl(var(--health-amber, 45 87% 61%))",
};

const KinshipGraphPanel = ({ projectId, moduleId, beneficiaries, onOpenBeneficiary }: Props) => {
  const { households, washSources, loading } = useHouseholds(projectId, moduleId);
  const [zoom, setZoom] = useState(1);
  const [focus, setFocus] = useState<GraphNode | null>(null);
  const [search, setSearch] = useState("");

  const graph = useMemo(
    () => buildKinshipGraph(beneficiaries, households, washSources),
    [beneficiaries, households, washSources],
  );

  const highlighted = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set(graph.nodes.filter((n) => n.label.toLowerCase().includes(q)
      || (n.sub || "").toLowerCase().includes(q)).map((n) => n.id));
  }, [graph.nodes, search]);

  const neighbours = useMemo(() => {
    if (!focus) return new Set<string>();
    const s = new Set<string>([focus.id]);
    for (const e of graph.edges) {
      if (e.source === focus.id) s.add(e.target);
      if (e.target === focus.id) s.add(e.source);
    }
    return s;
  }, [focus, graph.edges]);

  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  const openFocus = (n: GraphNode) => {
    setFocus(n);
    if (n.kind === "beneficiary") {
      const b = beneficiaries.find((x) => `b:${x.id}` === n.id);
      if (b && onOpenBeneficiary) return; // opened via the button in the side panel
    }
  };

  const focusBeneficiary = focus?.kind === "beneficiary"
    ? beneficiaries.find((b) => `b:${b.id}` === focus.id)
    : undefined;

  const counts = {
    people: graph.nodes.filter((n) => n.kind === "beneficiary").length,
    households: graph.nodes.filter((n) => n.kind === "household").length,
    water: graph.nodes.filter((n) => n.kind === "wash").length,
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <Network className="h-5 w-5 text-primary" />
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">Household transmission & kinship network</h3>
          <p className="text-xs text-muted-foreground">
            {counts.people} people · {counts.households} households · {counts.water} shared water points
          </p>
        </div>
        <div className="flex-1" />
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8" placeholder="Find a person, household or water point"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))} aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </Button>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR.beneficiary }} /> Person</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR.household }} /> Household</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR.wash }} /> Water point</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-5 bg-muted-foreground/60" /> Lives in</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-5 border-t border-dashed border-muted-foreground/60" /> Shares water</span>
          </div>
          <div className="h-[560px] overflow-auto bg-muted/20">
            {loading && <p className="p-6 text-sm text-muted-foreground">Building the network…</p>}
            {!loading && graph.nodes.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground">
                No households have members yet. Group beneficiaries into households first and the network will appear here.
              </p>
            )}
            {graph.nodes.length > 0 && (
              <svg viewBox="0 0 1000 700" className="block" style={{ width: `${100 * zoom}%`, minWidth: "100%" }}>
                {graph.edges.map((e, i) => {
                  const a = nodeById.get(e.source); const b = nodeById.get(e.target);
                  if (!a || !b) return null;
                  const dim = focus && !(neighbours.has(a.id) && neighbours.has(b.id));
                  return (
                    <line
                      key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke="currentColor"
                      className={cn("text-muted-foreground", dim ? "opacity-10" : "opacity-40")}
                      strokeWidth={e.kind === "water" ? 1.4 : 1.8}
                      strokeDasharray={e.kind === "water" ? "5 4" : undefined}
                    />
                  );
                })}
                {graph.nodes.map((n) => {
                  const r = n.kind === "beneficiary" ? 9 : n.kind === "household" ? 13 + Math.min(8, n.weight) : 12;
                  const dim = (focus && !neighbours.has(n.id)) || (highlighted.size > 0 && !highlighted.has(n.id));
                  return (
                    <g
                      key={n.id}
                      className="cursor-pointer"
                      opacity={dim ? 0.18 : 1}
                      onClick={() => openFocus(n)}
                    >
                      <circle
                        cx={n.x} cy={n.y} r={r}
                        fill={KIND_COLOR[n.kind]}
                        stroke={n.affected ? "hsl(var(--health-red, 356 63% 56%))" : "white"}
                        strokeWidth={n.affected ? 3 : 1.5}
                      />
                      <text
                        x={n.x} y={n.y + r + 12} textAnchor="middle"
                        className="fill-foreground text-[11px]"
                      >
                        {n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h4 className="mb-2 font-semibold text-foreground">Selected</h4>
            <Separator className="mb-2" />
            {!focus && <p className="text-sm text-muted-foreground">Tap any circle in the network to see who and what it connects to.</p>}
            {focus && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {focus.kind === "beneficiary" ? <User className="h-4 w-4" />
                    : focus.kind === "household" ? <Home className="h-4 w-4" /> : <Droplets className="h-4 w-4" />}
                  <span className="font-semibold text-foreground">{focus.label}</span>
                </div>
                <p className="text-sm text-muted-foreground">{focus.sub}</p>
                <p className="text-xs text-muted-foreground">
                  Connected to {Math.max(0, neighbours.size - 1)} other node{neighbours.size === 2 ? "" : "s"}.
                </p>
                {focusBeneficiary && onOpenBeneficiary && (
                  <Button size="sm" className="w-full" onClick={() => onOpenBeneficiary(focusBeneficiary)}>
                    Open beneficiary record
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="w-full" onClick={() => setFocus(null)}>Clear selection</Button>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h4 className="mb-1 font-semibold text-foreground">Household clusters</h4>
            <p className="mb-2 text-xs text-muted-foreground">
              Households with more than one affected member — the strongest signal of transmission inside a compound.
            </p>
            <Separator className="mb-2" />
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Household</TableHead>
                    <TableHead>Affected</TableHead>
                    <TableHead>Water</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {graph.clusters.map((c) => (
                    <TableRow key={c.householdId}>
                      <TableCell className="font-medium text-foreground">{c.label}</TableCell>
                      <TableCell>{c.affected} of {c.members}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(c.unimprovedWater && "border-destructive/40 text-destructive")}
                        >
                          {c.unimprovedWater ? "Unimproved" : "OK"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {graph.clusters.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No household has more than one affected member.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default KinshipGraphPanel;
