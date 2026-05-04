import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type KPIPrimaryKind =
  | "totalSubmissions"
  | "syncRate"
  | "dataCollectors"
  | "activeProjects"
  | "coverage"
  | "geofenceCompliance";

export interface KPIPrimaryRequest {
  kind: KPIPrimaryKind;
  title: string;
  selectedProjectId?: string | null;
}

interface Props {
  request: KPIPrimaryRequest | null;
  onClose: () => void;
}

interface Row {
  id: string;
  form_id: string;
  form_name: string;
  user_id: string | null;
  collector_name: string;
  collector_email: string;
  project_id: string | null;
  project_name: string;
  status: string;
  within_geofence: boolean | null;
  state: string | null;
  lga: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  synced_at: string | null;
  data: any;
}

const PAGE_SIZE = 1000;

const fetchAllSubmissions = async (formIdFilter?: Set<string>) => {
  let allData: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("form_submissions")
      .select(
        "id, form_id, user_id, status, within_geofence, location, data, created_at, synced_at",
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  if (formIdFilter) {
    allData = allData.filter((s) => formIdFilter.has(s.form_id));
  }
  return allData;
};

const guessLocation = (data: any) => {
  let state: string | null = null;
  let lga: string | null = null;
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) {
      if (typeof v !== "string" || !v.trim()) continue;
      const lk = k.toLowerCase();
      if (!state && /state|province|region/.test(lk)) state = v.trim();
      if (!lga && /lga|local.?gov|district|council|county|municipal/.test(lk))
        lga = v.trim();
      if (state && lga) break;
    }
  }
  return { state, lga };
};

const csvEscape = (val: any): string => {
  if (val === null || val === undefined) return "";
  const s = typeof val === "string" ? val : JSON.stringify(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const KPIPrimaryDataDialog = ({ request, onClose }: Props) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!request) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // Build form/project lookup tables
        const [formsRes, profilesRes, projectsRes] = await Promise.all([
          supabase.from("forms").select("id, name, project_id, geofence"),
          supabase
            .from("profiles")
            .select("user_id, first_name, last_name, email, state, lga"),
          supabase.from("projects").select("id, name, status"),
        ]);

        const forms = formsRes.data || [];
        const profiles = profilesRes.data || [];
        const projects = projectsRes.data || [];

        const formMap = new Map(
          forms.map((f: any) => [
            f.id,
            { name: f.name, project_id: f.project_id, geofence: f.geofence },
          ]),
        );
        const profileMap = new Map(
          profiles.map((p: any) => [
            p.user_id,
            {
              name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
              email: p.email ?? "",
              state: p.state ?? null,
              lga: p.lga ?? null,
            },
          ]),
        );
        const projectMap = new Map(
          projects.map((p: any) => [p.id, { name: p.name, status: p.status }]),
        );

        const formIdFilter = request.selectedProjectId
          ? new Set(
              forms
                .filter((f: any) => f.project_id === request.selectedProjectId)
                .map((f: any) => f.id),
            )
          : undefined;

        const subs = await fetchAllSubmissions(formIdFilter);

        // Map to enriched rows
        let enriched: Row[] = subs.map((s: any) => {
          const f = formMap.get(s.form_id);
          const p = profileMap.get(s.user_id);
          const proj = f?.project_id ? projectMap.get(f.project_id) : null;
          const locGuess = guessLocation(s.data);
          const loc = s.location || {};
          return {
            id: s.id,
            form_id: s.form_id,
            form_name: f?.name || "Unknown",
            user_id: s.user_id,
            collector_name: p?.name || (s.user_id?.slice(0, 8) ?? ""),
            collector_email: p?.email || "",
            project_id: f?.project_id || null,
            project_name: proj?.name || "—",
            status: s.status,
            within_geofence: s.within_geofence,
            state: locGuess.state || p?.state || null,
            lga: locGuess.lga || p?.lga || null,
            lat: Number(loc.lat || loc.latitude) || null,
            lng: Number(loc.lng || loc.longitude || loc.lon) || null,
            created_at: s.created_at,
            synced_at: s.synced_at,
            data: s.data,
          };
        });

        // Apply KPI-specific filter
        switch (request.kind) {
          case "totalSubmissions":
            // all
            break;
          case "syncRate":
            enriched = enriched.filter(
              (r) => r.status === "sent" && r.synced_at,
            );
            break;
          case "dataCollectors":
            // all submissions, collectors are derived
            break;
          case "activeProjects":
            enriched = enriched.filter((r) => {
              const proj = r.project_id ? projectMap.get(r.project_id) : null;
              return proj?.status === "active";
            });
            break;
          case "coverage":
            enriched = enriched.filter((r) => r.state || r.lga);
            break;
          case "geofenceCompliance": {
            const geofencedFormIds = new Set(
              forms
                .filter((f: any) => {
                  const gf = f.geofence;
                  return (
                    gf &&
                    (gf.enabled === true ||
                      gf.type === "Polygon" ||
                      (Array.isArray(gf.coordinates) &&
                        gf.coordinates.length >= 3))
                  );
                })
                .map((f: any) => f.id),
            );
            enriched = enriched.filter(
              (r) =>
                geofencedFormIds.has(r.form_id) && r.within_geofence !== null,
            );
            break;
          }
        }

        if (!cancelled) setRows(enriched);
      } catch (err: any) {
        console.error("Primary data fetch error:", err);
        toast({
          title: "Error loading data",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    // Realtime updates
    const channel = supabase
      .channel(`kpi-primary-${request.kind}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "form_submissions" },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [request]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      [
        r.form_name,
        r.collector_name,
        r.collector_email,
        r.project_name,
        r.status,
        r.state,
        r.lga,
        r.id,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const downloadCSV = () => {
    if (!filteredRows.length) return;
    const headers = [
      "Submission ID",
      "Form",
      "Project",
      "Collector",
      "Email",
      "Status",
      "State",
      "LGA",
      "Latitude",
      "Longitude",
      "Within Geofence",
      "Created At",
      "Synced At",
      "Data (JSON)",
    ];
    const lines = [headers.join(",")];
    filteredRows.forEach((r) => {
      lines.push(
        [
          r.id,
          r.form_name,
          r.project_name,
          r.collector_name,
          r.collector_email,
          r.status,
          r.state ?? "",
          r.lga ?? "",
          r.lat ?? "",
          r.lng ?? "",
          r.within_geofence === null
            ? ""
            : r.within_geofence
              ? "Yes"
              : "No",
          r.created_at,
          r.synced_at ?? "",
          r.data,
        ]
          .map(csvEscape)
          .join(","),
      );
    });
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeTitle = (request?.title || "kpi-data").replace(/[^a-z0-9]+/gi, "-");
    a.download = `${safeTitle}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    if (!filteredRows.length) return;
    const blob = new Blob([JSON.stringify(filteredRows, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeTitle = (request?.title || "kpi-data").replace(/[^a-z0-9]+/gi, "-");
    a.download = `${safeTitle}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="font-display text-base sm:text-lg flex items-center gap-2">
                {request?.title}
                <Badge variant="secondary" className="text-[10px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />
                  Live
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Primary data aggregated to compute this KPI ({filteredRows.length.toLocaleString()} of {rows.length.toLocaleString()} rows)
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={downloadCSV}
                disabled={!filteredRows.length || loading}
                className="h-8 text-xs gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadJSON}
                disabled={!filteredRows.length || loading}
                className="h-8 text-xs gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> JSON
              </Button>
            </div>
          </div>
          <div className="relative mt-2">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by form, collector, project, state, LGA, status…"
              className="h-8 pl-8 text-xs"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          {loading && rows.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="p-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase tracking-wide">Created</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide">Form</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide">Project</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide">Collector</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide">Status</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide">State</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide">LGA</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide">GPS</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide">Geofence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-10 text-sm">
                          No data matches the current filters.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-[11px] whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{r.form_name}</TableCell>
                        <TableCell className="text-xs">{r.project_name}</TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{r.collector_name}</div>
                          {r.collector_email && (
                            <div className="text-[10px] text-muted-foreground">{r.collector_email}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={r.status === "sent" ? "default" : "secondary"}
                            className="text-[10px] capitalize"
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{r.state || "—"}</TableCell>
                        <TableCell className="text-xs">{r.lga || "—"}</TableCell>
                        <TableCell className="text-[10px] font-mono">
                          {r.lat && r.lng ? `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}` : "—"}
                        </TableCell>
                        <TableCell>
                          {r.within_geofence === null ? (
                            <span className="text-[10px] text-muted-foreground">N/A</span>
                          ) : r.within_geofence ? (
                            <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20">In</Badge>
                          ) : (
                            <Badge className="text-[10px] bg-red-500/15 text-red-700 hover:bg-red-500/20">Out</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default KPIPrimaryDataDialog;
