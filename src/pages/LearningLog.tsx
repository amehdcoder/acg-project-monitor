import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Search, BookOpen, CheckCircle2, AlertTriangle, Wrench, CircleDot, ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  LEARNING_LOG, LEARNING_LOG_CATEGORIES, STATUS_STYLES, type FeatureStatus,
} from "@/lib/learningLog/catalog";

const STATUS_ICON: Record<FeatureStatus, any> = {
  Operational: CheckCircle2,
  Monitoring: AlertTriangle,
  Resolved: Wrench,
  "In Progress": CircleDot,
};

export default function LearningLog() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return LEARNING_LOG.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (status !== "all" && e.status !== status) return false;
      if (!s) return true;
      return [e.feature, e.description, e.fieldIssue, e.resolution, e.category]
        .filter(Boolean).some((t) => String(t).toLowerCase().includes(s));
    });
  }, [search, category, status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { Operational: 0, Monitoring: 0, Resolved: 0, "In Progress": 0 };
    LEARNING_LOG.forEach((e) => { c[e.status] += 1; });
    return c;
  }, []);

  const statuses: FeatureStatus[] = ["Operational", "Monitoring", "Resolved", "In Progress"];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-20 border-b bg-gradient-to-r from-[#0c2340] to-[#1a4a6e] px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back" className="text-white hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <BookOpen className="h-6 w-6 text-white" />
          <div className="min-w-0">
            <h1 className="text-base font-bold text-white sm:text-lg">Learning Log</h1>
            <p className="truncate text-xs text-white/70">Feature reliability journey — field issues, resolutions & current status</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-5 p-4 pb-16">
        {/* Status summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statuses.map((st) => {
            const Icon = STATUS_ICON[st];
            const style = STATUS_STYLES[st];
            return (
              <Card key={st} className={`p-4 ${style.bg}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-medium ${style.text}`}>{st}</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{counts[st]}</p>
                  </div>
                  <Icon className={`h-6 w-6 ${style.text}`} />
                </div>
              </Card>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search features, issues, resolutions…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All categories</option>
            {LEARNING_LOG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Entries */}
        {filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <ClipboardList className="h-8 w-8 opacity-40" />
            <p className="text-sm">No matching features.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((e) => {
              const style = STATUS_STYLES[e.status];
              const Icon = STATUS_ICON[e.status];
              return (
                <Card key={e.id} className="overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b bg-muted/30 px-4 py-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-foreground">{e.feature}</h3>
                      <p className="text-xs text-muted-foreground">{e.category}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${style.bg} ${style.text} ${style.ring}`}>
                      <Icon className="h-3.5 w-3.5" /> {e.status}
                    </span>
                  </div>
                  <div className="space-y-2.5 p-4 text-sm">
                    <p className="text-muted-foreground">{e.description}</p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
                        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5" /> Field issue identified
                        </p>
                        <p className="text-xs text-foreground/80">{e.fieldIssue || "None reported."}</p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
                        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          <Wrench className="h-3.5 w-3.5" /> How it was resolved
                        </p>
                        <p className="text-xs text-foreground/80">{e.resolution || "—"}</p>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
