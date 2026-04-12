import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import {
  History, ChevronRight, ArrowLeft, Clock, User, FileText,
  ArrowUpDown, Diff, Eye,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface VersionEntry {
  id: string;
  submission_id: string;
  version_number: number;
  data: Record<string, any>;
  changed_by: string;
  change_type: string;
  change_summary: string | null;
  changed_at: string;
  changer_name?: string;
}

interface SubmissionWithVersions {
  id: string;
  form_id: string;
  form_name: string;
  user_id: string;
  user_name: string;
  current_data: Record<string, any>;
  version_count: number;
  last_updated: string;
}

const VersionHistoryViewer = () => {
  const [submissions, setSubmissions] = useState<SubmissionWithVersions[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  const [viewVersion, setViewVersion] = useState<VersionEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubmissionsWithVersions = useCallback(async () => {
    setLoading(true);
    try {
      const { data: versionData } = await supabase
        .from("submission_versions")
        .select("submission_id")
        .order("changed_at", { ascending: false });

      if (!versionData || versionData.length === 0) {
        setSubmissions([]);
        setLoading(false);
        return;
      }

      const subIds = [...new Set(versionData.map(v => v.submission_id))];
      const versionCounts = new Map<string, number>();
      versionData.forEach(v => {
        versionCounts.set(v.submission_id, (versionCounts.get(v.submission_id) || 0) + 1);
      });

      const { data: subs } = await supabase
        .from("form_submissions")
        .select("id, form_id, user_id, data, updated_at")
        .in("id", subIds.slice(0, 50));

      if (!subs) { setSubmissions([]); setLoading(false); return; }

      const formIds = [...new Set(subs.map(s => s.form_id))];
      const userIds = [...new Set(subs.map(s => s.user_id))];

      const [formsRes, profilesRes] = await Promise.all([
        supabase.from("forms").select("id, name").in("id", formIds),
        supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds),
      ]);

      const formMap = new Map((formsRes.data || []).map(f => [f.id, f.name]));
      const profileMap = new Map((profilesRes.data || []).map(p => [p.user_id, `${p.first_name} ${p.last_name}`]));

      const results: SubmissionWithVersions[] = subs.map(s => ({
        id: s.id,
        form_id: s.form_id,
        form_name: formMap.get(s.form_id) || "Unknown Form",
        user_id: s.user_id,
        user_name: profileMap.get(s.user_id) || "Unknown User",
        current_data: s.data as Record<string, any>,
        version_count: versionCounts.get(s.id) || 0,
        last_updated: s.updated_at,
      }));

      setSubmissions(results.sort((a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime()));
    } catch (err) {
      console.error("Error fetching version history:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchVersions = useCallback(async (submissionId: string) => {
    const { data } = await supabase
      .from("submission_versions")
      .select("*")
      .eq("submission_id", submissionId)
      .order("version_number", { ascending: false });

    if (!data) return;

    const changerIds = [...new Set(data.map(v => v.changed_by))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name")
      .in("user_id", changerIds);

    const profileMap = new Map((profiles || []).map(p => [p.user_id, `${p.first_name} ${p.last_name}`]));

    setVersions(data.map(v => ({
      ...v,
      data: v.data as Record<string, any>,
      changer_name: profileMap.get(v.changed_by) || "System",
    })));
  }, []);

  useEffect(() => { fetchSubmissionsWithVersions(); }, [fetchSubmissionsWithVersions]);

  useEffect(() => {
    if (selectedSubmission) fetchVersions(selectedSubmission);
  }, [selectedSubmission, fetchVersions]);

  const getDiff = (oldData: Record<string, any>, newData: Record<string, any>) => {
    const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
    const changes: { key: string; oldVal: any; newVal: any; type: "added" | "removed" | "changed" }[] = [];

    allKeys.forEach(key => {
      const oldVal = oldData?.[key];
      const newVal = newData?.[key];
      if (oldVal === undefined && newVal !== undefined) {
        changes.push({ key, oldVal: null, newVal, type: "added" });
      } else if (oldVal !== undefined && newVal === undefined) {
        changes.push({ key, oldVal, newVal: null, type: "removed" });
      } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ key, oldVal, newVal, type: "changed" });
      }
    });
    return changes;
  };

  const renderValue = (val: any) => {
    if (val === null || val === undefined) return <span className="text-muted-foreground italic">empty</span>;
    if (typeof val === "object") return <code className="text-xs bg-muted px-1 rounded">{JSON.stringify(val).substring(0, 100)}</code>;
    return <span>{String(val).substring(0, 100)}</span>;
  };

  if (selectedSubmission) {
    const sub = submissions.find(s => s.id === selectedSubmission);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedSubmission(null); setCompareMode(false); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h3 className="font-semibold text-sm">{sub?.form_name} — Version History</h3>
          <Badge variant="outline" className="ml-auto">{versions.length} versions</Badge>
        </div>

        {!compareMode ? (
          <div className="flex gap-2 mb-2">
            <Button variant="outline" size="sm" onClick={() => setCompareMode(true)} disabled={versions.length < 2}>
              <Diff className="h-3.5 w-3.5 mr-1" /> Compare Versions
            </Button>
          </div>
        ) : (
          <Card className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={compareA} onValueChange={setCompareA}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Version A" /></SelectTrigger>
                <SelectContent>
                  {versions.map(v => (
                    <SelectItem key={v.id} value={v.id}>v{v.version_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <Select value={compareB} onValueChange={setCompareB}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Version B" /></SelectTrigger>
                <SelectContent>
                  {versions.map(v => (
                    <SelectItem key={v.id} value={v.id}>v{v.version_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setCompareMode(false)}>Cancel</Button>
            </div>

            {compareA && compareB && compareA !== compareB && (() => {
              const vA = versions.find(v => v.id === compareA);
              const vB = versions.find(v => v.id === compareB);
              if (!vA || !vB) return null;
              const diff = getDiff(vA.data, vB.data);
              return (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Comparing v{vA.version_number} → v{vB.version_number} ({diff.length} changes)
                  </p>
                  {diff.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No differences found</p>
                  ) : (
                    diff.map(d => (
                      <div key={d.key} className="text-xs border rounded p-2 bg-muted/30">
                        <span className="font-medium">{d.key}</span>
                        <span className={`ml-2 px-1 rounded text-[10px] font-bold ${
                          d.type === "added" ? "bg-emerald-500/20 text-emerald-600" :
                          d.type === "removed" ? "bg-red-500/20 text-red-600" :
                          "bg-amber-500/20 text-amber-600"
                        }`}>{d.type}</span>
                        <div className="mt-1 flex gap-4">
                          {d.oldVal !== null && <div className="text-red-500 line-through">{renderValue(d.oldVal)}</div>}
                          {d.newVal !== null && <div className="text-emerald-600">{renderValue(d.newVal)}</div>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              );
            })()}
          </Card>
        )}

        <ScrollArea className="h-[500px]">
          <div className="space-y-2">
            {versions.map((v, i) => {
              const prevVersion = versions[i + 1];
              const diff = prevVersion ? getDiff(prevVersion.data, v.data) : [];

              return (
                <Card key={v.id} className="border border-border/50">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={v.version_number === versions[0]?.version_number ? "default" : "outline"} className="text-[10px]">
                          v{v.version_number}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(v.changed_at), "MMM d, yyyy HH:mm")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" /> {v.changer_name}
                        </span>
                        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setViewVersion(v)}>
                          <Eye className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    {prevVersion && (
                      <div className="text-[10px] text-muted-foreground">
                        {diff.length === 0 ? "No changes" : `${diff.length} field${diff.length > 1 ? "s" : ""} changed`}
                        {diff.slice(0, 3).map(d => (
                          <span key={d.key} className="ml-1 inline-flex items-center gap-0.5">
                            <span className={`px-1 rounded ${
                              d.type === "changed" ? "bg-amber-500/10" : d.type === "added" ? "bg-emerald-500/10" : "bg-red-500/10"
                            }`}>{d.key}</span>
                          </span>
                        ))}
                        {diff.length > 3 && <span className="ml-1">+{diff.length - 3} more</span>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>

        <Dialog open={!!viewVersion} onOpenChange={() => setViewVersion(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle className="text-sm">Version {viewVersion?.version_number} — Full Data</DialogTitle>
            </DialogHeader>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[60vh]">
              {JSON.stringify(viewVersion?.data, null, 2)}
            </pre>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Version History</h2>
        </div>
        <Badge variant="outline">{submissions.length} tracked submissions</Badge>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading version history...</div>
      ) : submissions.length === 0 ? (
        <Card className="p-8 text-center">
          <History className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium">No version history yet</p>
          <p className="text-xs text-muted-foreground mt-1">Changes to submissions will be tracked automatically</p>
        </Card>
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="space-y-2">
            {submissions.map(sub => (
              <Card
                key={sub.id}
                className="cursor-pointer hover:bg-muted/30 transition-colors border border-border/50"
                onClick={() => setSelectedSubmission(sub.id)}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium text-sm truncate">{sub.form_name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" /> {sub.user_name}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {format(new Date(sub.last_updated), "MMM d, HH:mm")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="secondary" className="text-[10px]">{sub.version_count} versions</Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default VersionHistoryViewer;
