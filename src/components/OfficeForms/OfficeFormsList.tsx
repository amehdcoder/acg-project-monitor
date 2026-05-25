import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { OFFICE_FORMS } from "./types";
import ApprovalStatusCard from "./ApprovalStatusCard";

export default function OfficeFormsList({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("office_form_submissions" as any)
        .select("*")
        .eq("submitted_by", user.id)
        .order("created_at", { ascending: false })
        .limit(500);
      setRows((data as any[]) || []);
    })();
  }, [user?.id]);

  const labelFor = (code: string) => OFFICE_FORMS.find(f => f.code === code)?.title || code;
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
      <div className="p-3 sm:p-6 max-w-3xl mx-auto space-y-4">
        {filtered.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground border border-border/60">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No submissions yet.
          </Card>
        ) : filtered.map(r => (
          <ApprovalStatusCard key={r.id} submission={r} />
        ))}
      </div>
    </div>
  );
}
