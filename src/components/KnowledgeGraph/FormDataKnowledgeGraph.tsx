import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Network, RefreshCw, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { extractLocationInfo } from "@/lib/locationUtils";
import { getFieldLabel, type QuestionLabelMap } from "@/lib/formLabelUtils";

type NodeType = "project" | "form" | "location" | "contributor" | "answer";

interface GNode {
  id: string;
  label: string;
  type: NodeType;
  weight: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GLink {
  source: string;
  target: string;
  value: number;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface FormDataKnowledgeGraphProps {
  /** Restrict the graph to a single project (controlled). */
  projectId?: string;
  /** Restrict the graph to a single form. */
  formId?: string;
  /** Show an internal project filter (for supervisors with multiple projects). */
  showProjectFilter?: boolean;
  /** Optional pre-supplied projects for the internal filter. */
  projects?: ProjectOption[];
  title?: string;
  description?: string;
}

const TYPE_COLORS: Record<NodeType, string> = {
  project: "hsl(var(--primary))",
  form: "hsl(var(--chart-2, var(--accent)))",
  location: "hsl(var(--chart-4, var(--secondary)))",
  contributor: "hsl(var(--chart-5, var(--muted-foreground)))",
  answer: "hsl(var(--chart-1, var(--primary)))",
};

const TYPE_FILL: Record<NodeType, string> = {
  project: "hsl(var(--primary) / 0.18)",
  form: "hsl(var(--accent) / 0.18)",
  location: "hsl(var(--secondary) / 0.25)",
  contributor: "hsl(var(--muted) / 0.6)",
  answer: "hsl(var(--chart-1, var(--primary)) / 0.16)",
};

const MAX_LOCATIONS = 10;
const MAX_CONTRIBUTORS = 12;
const MAX_ANSWER_QUESTIONS = 6; // top categorical questions to surface
const MAX_ANSWERS_PER_QUESTION = 4; // top responses per question
const CATEGORICAL_TYPES = new Set([
  "select_one",
  "select_multiple",
  "select",
  "radio",
  "checkbox",
  "dropdown",
  "yesno",
  "boolean",
]);

const FormDataKnowledgeGraph = ({
  projectId,
  formId,
  showProjectFilter = false,
  projects: projectsProp,
  title = "Knowledge Graph",
  description = "Relationships between projects, forms, locations and contributors",
}: FormDataKnowledgeGraphProps) => {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [internalProjectId, setInternalProjectId] = useState<string>("all");
  const [projects, setProjects] = useState<ProjectOption[]>(projectsProp || []);
  const [rawNodes, setRawNodes] = useState<GNode[]>([]);
  const [links, setLinks] = useState<GLink[]>([]);
  const [scale, setScale] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  const effectiveProjectId =
    projectId || (internalProjectId !== "all" ? internalProjectId : undefined);

  // Load projects for the internal filter
  useEffect(() => {
    if (!showProjectFilter || projectsProp || !isAdmin) return;
    (async () => {
      const { data } = await supabase.from("projects").select("id, name").order("name");
      setProjects(data || []);
    })();
  }, [showProjectFilter, projectsProp, isAdmin]);

  useEffect(() => {
    if (projectsProp) setProjects(projectsProp);
  }, [projectsProp]);

  const buildGraph = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Forms in scope
      let formQuery = supabase.from("forms").select("id, name, project_id, questions");
      if (formId) formQuery = formQuery.eq("id", formId);
      else if (effectiveProjectId) formQuery = formQuery.eq("project_id", effectiveProjectId);
      const { data: formsData } = await formQuery;
      const forms = formsData || [];
      if (forms.length === 0) {
        setRawNodes([]);
        setLinks([]);
        return;
      }

      // 2. Project names
      const projectIds = [...new Set(forms.map((f) => f.project_id).filter(Boolean))];
      const { data: projData } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", projectIds.length ? projectIds : ["00000000-0000-0000-0000-000000000000"]);
      const projectName = new Map((projData || []).map((p) => [p.id, p.name]));

      // 3. Submissions (capped for graph performance)
      const formIds = forms.map((f) => f.id);
      const { data: subsData } = await supabase
        .from("form_submissions")
        .select("id, form_id, user_id, data, location, status, submitted_at")
        .in("form_id", formIds)
        .order("submitted_at", { ascending: false })
        .range(0, 4999);
      const subs = subsData || [];

      // 4. Submitter names
      const userIds = [...new Set(subs.map((s) => s.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
      const profileName = new Map(
        (profiles || []).map((p) => [
          p.user_id,
          `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown",
        ])
      );

      // 5. Categorical question metadata per form (for answer nodes)
      const formCategoricalQs = new Map<string, Map<string, string>>(); // fid -> (qid -> qLabel)
      const collectCategorical = (items: any[], out: Map<string, string>, labelMap: QuestionLabelMap) => {
        if (!Array.isArray(items)) return;
        for (const item of items) {
          if (item?.questions && Array.isArray(item.questions)) {
            collectCategorical(item.questions, out, labelMap);
          } else if (item?.id) {
            const type = String(item.type || item.questionType || "").toLowerCase();
            if (CATEGORICAL_TYPES.has(type)) {
              out.set(item.id, item.label || getFieldLabel(item.id, labelMap));
            }
          }
        }
      };
      for (const f of forms) {
        const qs = (f as any).questions;
        const out = new Map<string, string>();
        collectCategorical(Array.isArray(qs) ? qs : [], out, {});
        if (out.size) formCategoricalQs.set(f.id, out);
      }

      // ---- Aggregate ----
      const formCount = new Map<string, number>();
      const locCount = new Map<string, number>();
      const contribCount = new Map<string, number>();
      const formLoc = new Map<string, number>(); // key: form|loc
      const formContrib = new Map<string, number>(); // key: form|user
      const answerCount = new Map<string, number>(); // key: fid|qid|value
      const questionTotal = new Map<string, number>(); // key: fid|qid

      const pushAnswer = (fid: string, qid: string, raw: any) => {
        if (raw === null || raw === undefined) return;
        const values = Array.isArray(raw) ? raw : [raw];
        for (const val of values) {
          const v = String(val).trim();
          if (!v || v.length > 40) continue;
          answerCount.set(`${fid}|${qid}|${v}`, (answerCount.get(`${fid}|${qid}|${v}`) || 0) + 1);
          questionTotal.set(`${fid}|${qid}`, (questionTotal.get(`${fid}|${qid}`) || 0) + 1);
        }
      };

      for (const s of subs) {
        const fid = s.form_id;
        formCount.set(fid, (formCount.get(fid) || 0) + 1);

        const info = extractLocationInfo(
          (s.data as Record<string, any>) || {},
          (s.location as any) || null
        );
        const loc =
          info?.state || info?.lga || info?.community || info?.displayLocation || null;
        if (loc && loc !== "Unknown") {
          locCount.set(loc, (locCount.get(loc) || 0) + 1);
          const k = `${fid}|${loc}`;
          formLoc.set(k, (formLoc.get(k) || 0) + 1);
        }

        if (s.user_id) {
          contribCount.set(s.user_id, (contribCount.get(s.user_id) || 0) + 1);
          const k = `${fid}|${s.user_id}`;
          formContrib.set(k, (formContrib.get(k) || 0) + 1);
        }

        const catQs = formCategoricalQs.get(fid);
        if (catQs) {
          const data = (s.data as Record<string, any>) || {};
          for (const qid of catQs.keys()) {
            pushAnswer(fid, qid, data[qid]);
          }
        }
      }

      const topLocations = new Set(
        [...locCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_LOCATIONS)
          .map(([k]) => k)
      );
      const topContributors = new Set(
        [...contribCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_CONTRIBUTORS)
          .map(([k]) => k)
      );

      const nodes: GNode[] = [];
      const linkList: GLink[] = [];
      const seen = new Set<string>();
      const addNode = (id: string, label: string, type: NodeType, weight: number) => {
        if (seen.has(id)) return;
        seen.add(id);
        nodes.push({
          id,
          label,
          type,
          weight,
          x: (Math.random() - 0.5) * 600,
          y: (Math.random() - 0.5) * 600,
          vx: 0,
          vy: 0,
        });
      };

      // Projects + forms
      for (const f of forms) {
        const fid = f.id;
        if ((formCount.get(fid) || 0) === 0) continue;
        const pid = f.project_id ? `p:${f.project_id}` : null;
        if (pid && f.project_id) {
          addNode(pid, projectName.get(f.project_id) || "Project", "project", 1);
        }
        addNode(`f:${fid}`, f.name || "Form", "form", formCount.get(fid) || 1);
        if (pid) linkList.push({ source: pid, target: `f:${fid}`, value: formCount.get(fid) || 1 });
      }

      // Form -> location
      for (const [k, v] of formLoc.entries()) {
        const [fid, loc] = k.split("|");
        if (!topLocations.has(loc)) continue;
        if (!seen.has(`f:${fid}`)) continue;
        addNode(`l:${loc}`, loc, "location", locCount.get(loc) || v);
        linkList.push({ source: `f:${fid}`, target: `l:${loc}`, value: v });
      }

      // Form -> contributor
      for (const [k, v] of formContrib.entries()) {
        const [fid, uid] = k.split("|");
        if (!topContributors.has(uid)) continue;
        if (!seen.has(`f:${fid}`)) continue;
        addNode(`c:${uid}`, profileName.get(uid) || "Unknown", "contributor", contribCount.get(uid) || v);
        linkList.push({ source: `f:${fid}`, target: `c:${uid}`, value: v });
      }

      setRawNodes(nodes);
      setLinks(linkList);
    } catch (e) {
      console.error("Knowledge graph build error", e);
      setRawNodes([]);
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [user, formId, effectiveProjectId]);

  useEffect(() => {
    buildGraph();
  }, [buildGraph]);

  // ---- Force-directed layout (deterministic, runs once per data change) ----
  const layout = useMemo(() => {
    const nodes = rawNodes.map((n) => ({ ...n }));
    if (nodes.length === 0) return { nodes, width: 800, height: 500 };

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const linkPairs = links
      .map((l) => ({ s: byId.get(l.source), t: byId.get(l.target) }))
      .filter((l) => l.s && l.t) as { s: GNode; t: GNode }[];

    const iterations = 350;
    const repulsion = 9000;
    const springLen = 110;
    const springK = 0.02;
    const center = 0.01;

    for (let it = 0; it < iterations; it++) {
      // repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dist2 = dx * dx + dy * dy;
          if (dist2 < 0.01) {
            dx = Math.random();
            dy = Math.random();
            dist2 = 1;
          }
          const dist = Math.sqrt(dist2);
          const force = repulsion / dist2;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }
      // springs
      for (const { s, t } of linkPairs) {
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - springLen) * springK;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        s.vx += fx;
        s.vy += fy;
        t.vx -= fx;
        t.vy -= fy;
      }
      // centering + integrate
      const damping = 0.85;
      for (const n of nodes) {
        n.vx -= n.x * center;
        n.vy -= n.y * center;
        n.vx *= damping;
        n.vy *= damping;
        n.x += Math.max(-30, Math.min(30, n.vx));
        n.y += Math.max(-30, Math.min(30, n.vy));
      }
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    }
    const pad = 80;
    const width = Math.max(400, maxX - minX + pad * 2);
    const height = Math.max(300, maxY - minY + pad * 2);
    for (const n of nodes) {
      n.x = n.x - minX + pad;
      n.y = n.y - minY + pad;
    }
    return { nodes, width, height };
  }, [rawNodes, links]);

  const nodePos = useMemo(
    () => new Map(layout.nodes.map((n) => [n.id, n])),
    [layout]
  );

  const radiusFor = (n: GNode) => {
    if (n.type === "project") return 22;
    const base = n.type === "form" ? 10 : 6;
    return base + Math.min(16, Math.sqrt(n.weight) * 1.4);
  };

  const counts = useMemo(() => {
    const c: Record<NodeType, number> = { project: 0, form: 0, location: 0, contributor: 0, answer: 0 };
    layout.nodes.forEach((n) => (c[n.type] += 1));
    return c;
  }, [layout]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Network className="h-4 w-4 text-primary shrink-0" />
            {title}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showProjectFilter && !projectId && projects.length > 1 && (
            <Select value={internalProjectId} onValueChange={setInternalProjectId}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setScale((s) => Math.max(0.4, s - 0.2))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setScale(1)}>
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={buildGraph} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          {(["project", "form", "location", "contributor"] as NodeType[]).map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full border"
                style={{ background: TYPE_FILL[t], borderColor: TYPE_COLORS[t] }}
              />
              <span className="capitalize text-muted-foreground">
                {t} ({counts[t]})
              </span>
            </span>
          ))}
        </div>

        {loading ? (
          <div className="flex h-[420px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : layout.nodes.length === 0 ? (
          <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
            No form data available to build a knowledge graph yet.
          </div>
        ) : (
          <div className="w-full overflow-auto rounded-lg border bg-muted/20">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              width={layout.width * scale}
              height={layout.height * scale}
              className="block max-w-none"
              style={{ minHeight: 420 }}
            >
              {/* links */}
              {links.map((l, i) => {
                const s = nodePos.get(l.source);
                const t = nodePos.get(l.target);
                if (!s || !t) return null;
                return (
                  <line
                    key={i}
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke="hsl(var(--border))"
                    strokeWidth={Math.min(3, 0.6 + Math.log2(l.value + 1) * 0.5)}
                    strokeOpacity={0.55}
                  />
                );
              })}
              {/* nodes */}
              {layout.nodes.map((n) => {
                const r = radiusFor(n);
                return (
                  <g key={n.id}>
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={r}
                      fill={TYPE_FILL[n.type]}
                      stroke={TYPE_COLORS[n.type]}
                      strokeWidth={n.type === "project" ? 2.5 : 1.5}
                    />
                    <title>{`${n.label} — ${n.weight} submission(s)`}</title>
                    <text
                      x={n.x}
                      y={n.y + r + 11}
                      textAnchor="middle"
                      fontSize={n.type === "project" || n.type === "form" ? 11 : 9}
                      fill="hsl(var(--foreground))"
                      style={{ pointerEvents: "none" }}
                    >
                      {n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FormDataKnowledgeGraph;
