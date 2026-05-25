import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { OFFICE_FORMS } from "./types";

export default function OfficeFormsList({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("office_form_submissions" as any).select("*").order("created_at", { ascending: false }).limit(500);
      setRows((data as any[]) || []);
    })();
  }, []);

  const labelFor = (code: string) => OFFICE_FORMS.find(f => f.code === code)?.title || code;
  const tintFor = (code: string) => OFFICE_FORMS.find(f => f.code === code);

  const filtered = rows.filter(r => !q.trim() || (r.reference_code || "").toLowerCase().includes(q.toLowerCase()) || labelFor(r.form_code).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <div className="bg-white border-b border-border/60 sticky top-0 z-30 px-3 sm:px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h1 className="text-base sm:text-lg font-bold truncate flex-1">My Submissions</h1>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className="pl-9 h-9" />
        </div>
      </div>
      <div className="p-3 sm:p-6 max-w-5xl mx-auto">
        <Card className="border border-border/60 shadow-sm divide-y divide-border/60">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              No submissions yet.
            </div>
          ) : filtered.map(r => {
            const t = tintFor(r.form_code);
            return (
              <div key={r.id} className="px-4 sm:px-5 py-3.5 flex items-center gap-4">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${t?.tintBg}`}>
                  <FileText className={`h-4 w-4 ${t?.tintFg}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] font-semibold uppercase bg-muted px-1.5 py-0.5 rounded">{r.reference_code}</span>
                    <span className="text-sm font-medium">{labelFor(r.form_code)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Submitted {format(new Date(r.created_at), "dd MMM yyyy, HH:mm")} · Status: {r.status}</p>
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
