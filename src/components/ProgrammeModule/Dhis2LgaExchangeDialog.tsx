import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Database, Loader2, MapPin, Send, Server, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  browseDhis2, dhis2SearchUnits, listConnections, listMappings, pushScopedMonthly, scopedMonthlyValues,
  type Dhis2Catalog, type Dhis2OrgUnit, type ExchangeConnection, type ExchangeMapping,
} from "@/lib/programmeModule/healthExchange";

interface Props {
  projectId: string;
  geography: { state: string; lga: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const currentPeriod = () => {
  const date = new Date();
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const rankDhis2LgaMatches = (units: Dhis2OrgUnit[], state: string, lga: string) => [...units].sort((left, right) => {
  const score = (unit: Dhis2OrgUnit) => {
    const name = norm(unit.name);
    const target = norm(lga);
    const stateMatch = unit.ancestors?.some((ancestor) => norm(ancestor.name) === norm(state)) ? 30 : 0;
    return (name === target ? 100 : name.includes(target) || target.includes(name) ? 50 : 0) + stateMatch - Math.abs((unit.level ?? 3) - 3);
  };
  return score(right) - score(left);
});

export default function Dhis2LgaExchangeDialog({ projectId, geography, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [connections, setConnections] = useState<ExchangeConnection[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [catalog, setCatalog] = useState<Dhis2Catalog | null>(null);
  const [mappings, setMappings] = useState<ExchangeMapping[]>([]);
  const [units, setUnits] = useState<Dhis2OrgUnit[]>([]);
  const [orgUnitId, setOrgUnitId] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  const [values, setValues] = useState<{ indicator_key: string; value: number }[]>([]);
  const [beneficiaryCount, setBeneficiaryCount] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [validated, setValidated] = useState(false);
  const connection = connections.find((item) => item.id === connectionId);
  const dataSet = catalog?.dataSets.find((item) => item.id === connection?.dataset_id);
  const mapped = useMemo(() => values.map((value) => ({
    ...value,
    mapping: mappings.find((item) => item.indicator_key === value.indicator_key),
  })), [values, mappings]);
  const sendable = mapped.filter((item) => item.mapping?.remote_id && item.mapping.remote_id !== "UNMAPPED");

  useEffect(() => {
    if (!open || !geography) return;
    setValidated(false); setUnits([]); setOrgUnitId(""); setValues([]);
    void (async () => {
      setBusy("load");
      try {
        const rows = (await listConnections(projectId)).filter((item) => item.kind === "dhis2" && item.is_active);
        setConnections(rows);
        setConnectionId((current) => rows.some((item) => item.id === current) ? current : rows[0]?.id || "");
      } catch (error) {
        toast({ title: "Could not load DHIS2", description: (error as Error).message, variant: "destructive" });
      } finally { setBusy(null); }
    })();
  }, [open, geography, projectId, toast]);

  useEffect(() => {
    if (!open || !geography || !connectionId) return;
    setValidated(false); setOrgUnitId("");
    void (async () => {
      setBusy("prepare");
      try {
        const [live, links, found, aggregate] = await Promise.all([
          browseDhis2(connectionId), listMappings(connectionId), dhis2SearchUnits(connectionId, geography.lga),
          scopedMonthlyValues(connectionId, period, geography.state, geography.lga),
        ]);
        const ranked = rankDhis2LgaMatches(found.orgUnits, geography.state, geography.lga);
        setCatalog(live); setMappings(links); setUnits(ranked); setOrgUnitId(ranked.length === 1 ? ranked[0].id : "");
        setValues(aggregate.values); setBeneficiaryCount(aggregate.geography.beneficiaryCount);
      } catch (error) {
        toast({ title: "Could not prepare the LGA report", description: (error as Error).message, variant: "destructive" });
      } finally { setBusy(null); }
    })();
  }, [open, geography, connectionId, period, toast]);

  const transmit = async (dryRun: boolean) => {
    if (!geography || !connectionId || !orgUnitId) return;
    setBusy(dryRun ? "validate" : "send");
    try {
      const result = await pushScopedMonthly(connectionId, period, geography.state, geography.lga, orgUnitId, dryRun);
      if (dryRun) setValidated(true);
      toast({ title: dryRun ? "DHIS2 validation passed" : "LGA totals sent to DHIS2", description: result.message });
    } catch (error) {
      setValidated(false);
      toast({ title: dryRun ? "DHIS2 validation failed" : "DHIS2 did not accept the report", description: (error as Error).message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> DHIS2 report · {geography?.lga}, {geography?.state}</DialogTitle></DialogHeader>
        {busy === "load" ? <p className="py-12 text-center text-sm text-muted-foreground">Loading DHIS2 connections…</p> : connections.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center"><Server className="mx-auto mb-2 h-8 w-8 text-muted-foreground" /><p className="font-semibold">No active DHIS2 connection</p><p className="text-sm text-muted-foreground">Add and test a DHIS2 server in Data Exchange first.</p></div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1"><Label>Live DHIS2 server</Label><Select value={connectionId} onValueChange={setConnectionId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{connections.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Reporting month</Label><Input value={period} onChange={(event) => { setValidated(false); setPeriod(event.target.value.replace(/\D/g, "").slice(0, 6)); }} /></div>
              <div className="space-y-1"><Label>DHIS2 organisation unit</Label><Select value={orgUnitId} onValueChange={(value) => { setValidated(false); setOrgUnitId(value); }}><SelectTrigger><SelectValue placeholder={busy === "prepare" ? "Matching LGA…" : "Confirm matching LGA"} /></SelectTrigger><SelectContent>{units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name}{unit.ancestors?.length ? ` · ${unit.ancestors.map((item) => item.name).join(" / ")}` : ""}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {units.length !== 1 && !busy && <p className="text-xs text-muted-foreground">{units.length ? "Confirm the correct DHIS2 location before validation." : "No matching DHIS2 location was found. Check that this LGA is available to your DHIS2 account."}</p>}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border bg-muted/20 p-3"><p className="text-xl font-bold">{beneficiaryCount}</p><p className="text-xs text-muted-foreground">Beneficiaries in LGA</p></div>
              <div className="rounded-md border bg-muted/20 p-3"><p className="text-xl font-bold">{sendable.length}</p><p className="text-xs text-muted-foreground">Mapped indicators</p></div>
              <div className="rounded-md border bg-muted/20 p-3"><p className="text-xl font-bold">{mapped.length - sendable.length}</p><p className="text-xs text-muted-foreground">Need mapping</p></div>
            </div>
            <div className="overflow-hidden rounded-md border">
              <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2"><Database className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">{dataSet?.name || "No DHIS2 data set selected"}</p>{catalog && <Badge variant="secondary" className="ml-auto">Live</Badge>}</div>
              <div className="max-h-72 overflow-y-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="p-2">App indicator</th><th className="p-2">LGA total</th><th className="p-2">DHIS2 data element</th><th className="p-2">Breakdown</th></tr></thead><tbody>{mapped.map((item) => <tr key={item.indicator_key} className="border-t"><td className="p-2 font-medium">{item.indicator_key.replace(/_/g, " ")}</td><td className="p-2 font-bold">{item.value}</td><td className="p-2">{item.mapping?.remote_name || dataSet?.dataElements.find((element) => element.id === item.mapping?.remote_id)?.name || <span className="text-destructive">Not mapped</span>}</td><td className="p-2 text-muted-foreground">{item.mapping?.category_option_combo || "Default"}</td></tr>)}</tbody></table></div>
            </div>
            {validated && <div className="flex items-center gap-2 rounded-md border border-records-green/30 bg-records-green/10 p-3 text-sm text-records-green"><CheckCircle2 className="h-4 w-4" /> Validation passed. Review the totals, then send.</div>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" disabled={!orgUnitId || !sendable.length || !!busy} onClick={() => void transmit(true)}>{busy === "validate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Validate</Button>
          <Button disabled={!validated || !orgUnitId || !!busy} onClick={() => void transmit(false)}>{busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to DHIS2</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}