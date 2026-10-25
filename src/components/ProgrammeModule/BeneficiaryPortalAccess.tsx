import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, RotateCcw, ShieldCheck } from "lucide-react";
import type { PortalSubmission } from "@/lib/programmeModule/beneficiaryPortal";

export default function BeneficiaryPortalAccess({ beneficiaryId, onChanged }: { beneficiaryId: string; onChanged: () => void }) {
  const [allowed, setAllowed] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [active, setActive] = useState(false);
  const [email, setEmail] = useState("");
  const [rows, setRows] = useState<PortalSubmission[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("beneficiary_progress_reviews", { _beneficiary: beneficiaryId });
    if (error) { setAllowed(false); return; }
    setAllowed(true);
    const result = data as unknown as { account?: { active: boolean }; submissions: PortalSubmission[] };
    setActive(Boolean(result.account?.active)); setRows(result.submissions || []);
    const auth = await supabase.auth.getUser();
    if (auth.data.user) { const r = await supabase.rpc("is_admin", { _user_id: auth.data.user.id }); setAdmin(r.data === true); }
  }, [beneficiaryId]);
  useEffect(() => { void load(); }, [load]);
  const link = async () => {
    setBusy(true); setError(""); setNotice("");
    const r = await supabase.rpc("link_beneficiary_portal", { _beneficiary: beneficiaryId, _email: email, _active: true });
    setBusy(false);
    if (r.error) { setError(r.error.message); return; }
    setNotice("Verified account linked."); await load();
  };
  const review = async (id: string, approve: boolean) => {
    setBusy(true); setError("");
    const r = await supabase.rpc("review_beneficiary_progress", { _submission: id, _approve: approve, _notes: notes[id] || "" });
    setBusy(false);
    if (r.error) { setError(r.error.message); return; }
    setNotice(approve ? "Progress approved and recorded as a Graduation service." : "Progress returned for revision."); await load(); onChanged();
  };
  if (!allowed) return null;
  return <section className="space-y-4 border-t border-border p-4"><h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-health-teal" />Beneficiary portal</h3>
    <p className="text-sm text-muted-foreground">{active ? "A verified personal account is linked." : "No verified personal account linked."}</p>
    {admin && <div className="space-y-3"><Label htmlFor={`account-${beneficiaryId}`}>Confirmed account email</Label><div className="flex flex-wrap gap-2"><Input id={`account-${beneficiaryId}`} type="email" className="min-w-0 flex-1" value={email} onChange={e => setEmail(e.target.value)} /><Button disabled={busy || !email.trim()} onClick={() => void link()}>Verify & link account</Button></div><a href="/beneficiary" target="_blank" rel="noreferrer" className="text-sm text-primary underline">Open beneficiary sign-in</a></div>}
    {rows.map(row => <div key={row.id} className="space-y-2 border-b border-border py-3"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{row.stage}</strong><span className="text-xs text-muted-foreground">{row.status} · {row.activity_date}</span></div><p className="break-words text-sm">{row.notes}</p>{row.status === "pending" && <><Textarea aria-label={`Review notes for ${row.stage}`} placeholder="Review notes; required when returning" value={notes[row.id] || ""} onChange={e => setNotes(p => ({ ...p, [row.id]: e.target.value }))} /><div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void review(row.id, true)}><Check className="mr-1 h-4 w-4" />Approve</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void review(row.id, false)}><RotateCcw className="mr-1 h-4 w-4" />Return</Button></div></>}</div>)}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-status-success">{notice}</p>}
  </section>;
}