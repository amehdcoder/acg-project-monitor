import { useMemo, useState } from 'react';
import { Copy, WandSparkles, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { listQueued } from '@/lib/programmeModule/offlineQueue';
import { analyzeSettlementDuplicates, type SettlementDuplicateRow } from '@/lib/microplanning/settlementDuplicates';

interface Props {
  rows: SettlementDuplicateRow[];
  projectId: string;
  readOnly: boolean;
  loading: boolean;
  onRemoved: (ids: string[]) => Promise<void>;
}

export default function SettlementDuplicateKpi({ rows, projectId, readOnly, loading, onRemoved }: Props) {
  const analysis = useMemo(() => analyzeSettlementDuplicates(rows), [rows]);
  const [preview, setPreview] = useState<typeof analysis.pairs | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(rows.map(row => [row.id, row])), [rows]);
  const remove = async () => {
    if (!preview?.length || !ack || busy || readOnly) return;
    if (!navigator.onLine) { toast({ title: 'Connect before removing duplicates', description: 'The count is available offline; removal requires a fresh permission and record check.' }); return; }
    const pending = new Set(listQueued().filter(q => q.kind === 'op' && q.payload.table === 'microplan_entries').map(q => q.payload.id));
    if (preview.some(pair => pending.has(pair.keepId) || pending.has(pair.removeId))) {
      toast({ title: 'Sync pending changes first', description: 'A selected settlement has unsent changes.', variant: 'destructive' }); return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('remove_duplicate_settlements', { _project_id: projectId, _pairs: preview });
      if (error) throw error;
      if (!Array.isArray(data) || data.length !== preview.length) throw new Error('Removal was not confirmed. Refresh and review again.');
      await onRemoved(data);
      setPreview(null); setAck(false);
      toast({ title: `${data.length} duplicate settlement ${data.length === 1 ? 'copy removed' : 'copies removed'}`, description: 'Original records retained; project figures refreshed.' });
    } catch (error) {
      toast({ title: 'Cleanup could not be completed', description: error instanceof Error ? error.message : String((error as {message?: string})?.message ?? 'Refresh and review the records again.'), variant: 'destructive' });
    } finally { setBusy(false); }
  };
  return <>
    <div className={`geo-metric ${analysis.extraCopies ? 'geo-metric-amber' : 'geo-metric-teal'}`}>
      <div className="geo-metric-heading"><span className="geo-metric-icon"><Copy className="h-5 w-5" /></span><p className="geo-metric-label">Duplicate settlements</p></div>
      <p className="geo-metric-value">{analysis.extraCopies.toLocaleString()}</p>
      <p className="geo-metric-detail">Extra named copies within the same FLHF · {analysis.groups.toLocaleString()} repeated settlement names</p>
      {!readOnly && <Button variant="outline" size="sm" className="mt-2 h-auto min-h-9 w-full whitespace-normal gap-2" disabled={loading || !analysis.pairs.length} onClick={() => { setPreview(analysis.pairs.slice(0, 500)); setAck(false); }}><WandSparkles className="h-4 w-4 shrink-0" />Clean duplicate settlements ({analysis.pairs.length.toLocaleString()})</Button>}
      {analysis.reviewCopies > 0 && <p className="geo-metric-detail mt-2">{analysis.reviewCopies.toLocaleString()} need review: different communities or evidence.</p>}
    </div>
    <Dialog open={preview !== null} onOpenChange={open => { if (!open && !busy) { setPreview(null); setAck(false); } }}>
      <DialogContent className="max-w-2xl" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Review settlement cleanup</DialogTitle><DialogDescription>{preview?.length} extra copies will be permanently removed. One original stays in each matching group. Different evidence, communities, facilities, years and campaigns are preserved.</DialogDescription></DialogHeader>
        <div className="max-h-[40dvh] overflow-auto divide-y divide-border rounded-md border border-border">
          {preview?.map(pair => { const row = byId.get(pair.removeId); return <div key={pair.removeId} className="p-3 text-sm"><p className="font-semibold text-foreground">{row?.settlement_name} · {row?.community_name}</p><p className="text-muted-foreground">{[row?.state, row?.lga, row?.ward, row?.flhf_name].filter(Boolean).join(' → ')}</p><p className="text-xs text-muted-foreground mt-1">Keep {pair.keepId.slice(0, 8)} · remove {pair.removeId.slice(0, 8)}</p></div>; })}
        </div>
        {analysis.pairs.length > 500 && <p className="text-sm text-muted-foreground">First 500 copies selected. Review the remaining copies after this cleanup.</p>}
        <label className="flex items-start gap-3 text-sm"><Checkbox checked={ack} disabled={busy} onCheckedChange={value => setAck(value === true)} /><span>I approve permanently removing these duplicate copies while retaining their original records.</span></label>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setPreview(null)}>Cancel</Button><Button variant="destructive" disabled={!ack || busy || readOnly} onClick={() => void remove()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}{busy ? 'Checking and removing…' : 'Confirm cleanup'}</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}