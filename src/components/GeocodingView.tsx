import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  MapPin, Navigation, Globe, Plus, Trash2, Loader2, Locate, Copy, Download, Network, Upload,
} from "lucide-react";

interface GeoRow {
  id: string;
  address: string;
  lat: number | null;
  lng: number | null;
  resolved: string | null;
  source: string | null;
  status: "idle" | "loading" | "done" | "error";
}

const uid = () => Math.random().toString(36).slice(2);

async function callGeo(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("geo-tools", { body: payload });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function copy(text: string) {
  navigator.clipboard.writeText(text);
  toast.success("Copied to clipboard");
}

export default function GeocodingView() {
  // ---- Forward geocoding (batch table) ----
  const [rows, setRows] = useState<GeoRow[]>([
    { id: uid(), address: "", lat: null, lng: null, resolved: null, source: null, status: "idle" },
  ]);
  const [batchRunning, setBatchRunning] = useState(false);
  const csvRef = useRef<HTMLInputElement | null>(null);

  const updateRow = (id: string, patch: Partial<GeoRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((prev) => [...prev, { id: uid(), address: "", lat: null, lng: null, resolved: null, source: null, status: "idle" }]);

  const removeRow = (id: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  // Minimal RFC-4180-ish CSV line splitter (handles quoted fields & commas).
  const splitCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };

  const importCsv = async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) { toast.error("The CSV file is empty"); return; }

      // Detect an optional header row and locate address / lat / lng columns.
      const first = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
      const headerHas = (...names: string[]) => first.findIndex((h) => names.includes(h));
      let addrIdx = headerHas("address", "addresses", "location", "street", "place");
      let latIdx = headerHas("lat", "latitude");
      let lngIdx = headerHas("lng", "lon", "long", "longitude");
      const hasHeader = addrIdx !== -1 || latIdx !== -1 || lngIdx !== -1;
      if (addrIdx === -1) addrIdx = 0; // default to first column
      const dataLines = hasHeader ? lines.slice(1) : lines;

      const newRows: GeoRow[] = [];
      for (const line of dataLines) {
        const cols = splitCsvLine(line);
        const address = (cols[addrIdx] ?? "").trim();
        if (!address) continue;
        const lat = latIdx !== -1 ? Number(cols[latIdx]) : NaN;
        const lng = lngIdx !== -1 ? Number(cols[lngIdx]) : NaN;
        const hasCoords = isFinite(lat) && isFinite(lng);
        newRows.push({
          id: uid(),
          address,
          lat: hasCoords ? lat : null,
          lng: hasCoords ? lng : null,
          resolved: hasCoords ? "Imported coordinates" : null,
          source: hasCoords ? "CSV" : null,
          status: hasCoords ? "done" : "idle",
        });
      }

      if (newRows.length === 0) { toast.error("No addresses found in the CSV"); return; }
      setRows((prev) => {
        const existing = prev.filter((r) => r.address.trim().length > 0);
        return [...existing, ...newRows];
      });
      toast.success(`Imported ${newRows.length} address${newRows.length === 1 ? "" : "es"} from CSV`);
    } catch (e) {
      toast.error(`Could not read CSV: ${(e as Error).message}`);
    }
  };


  const geocodeRow = async (row: GeoRow) => {
    if (!row.address.trim()) return;
    updateRow(row.id, { status: "loading" });
    try {
      const d = await callGeo({ action: "geocode", address: row.address });
      if (d.found) {
        updateRow(row.id, { status: "done", lat: d.lat, lng: d.lng, resolved: d.display_name, source: d.source });
      } else {
        updateRow(row.id, { status: "error", resolved: "No match found", lat: null, lng: null });
      }
    } catch (e) {
      updateRow(row.id, { status: "error", resolved: (e as Error).message });
    }
  };

  const runBatch = async () => {
    setBatchRunning(true);
    for (const row of rows) {
      if (row.address.trim()) {
        await geocodeRow(row);
        await new Promise((r) => setTimeout(r, 1100)); // respect Nominatim rate limit
      }
    }
    setBatchRunning(false);
    toast.success("Batch geocoding complete");
  };

  const exportCsv = () => {
    const header = "address,latitude,longitude,resolved_address,source\n";
    const body = rows
      .filter((r) => r.lat != null)
      .map((r) => `"${r.address}",${r.lat},${r.lng},"${r.resolved ?? ""}","${r.source ?? ""}"`)
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "geocoded-addresses.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Reverse geocoding ----
  const [revLat, setRevLat] = useState("");
  const [revLng, setRevLng] = useState("");
  const [revResult, setRevResult] = useState<any>(null);
  const [revLoading, setRevLoading] = useState(false);

  const runReverse = async () => {
    const la = Number(revLat), lo = Number(revLng);
    if (!isFinite(la) || !isFinite(lo)) {
      toast.error("Enter valid latitude and longitude");
      return;
    }
    setRevLoading(true);
    setRevResult(null);
    try {
      const d = await callGeo({ action: "reverse", lat: la, lng: lo });
      setRevResult(d.found ? d : { error: "No address found for these coordinates" });
    } catch (e) {
      setRevResult({ error: (e as Error).message });
    } finally {
      setRevLoading(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRevLat(pos.coords.latitude.toFixed(6));
        setRevLng(pos.coords.longitude.toFixed(6));
      },
      () => toast.error("Could not get your location"),
    );
  };

  // ---- IP lookup ----
  const [ip, setIp] = useState("");
  const [ipResult, setIpResult] = useState<any>(null);
  const [ipLoading, setIpLoading] = useState(false);

  const runIp = async () => {
    setIpLoading(true);
    setIpResult(null);
    try {
      const d = await callGeo({ action: "ip", ip: ip.trim() || undefined });
      setIpResult(d);
    } catch (e) {
      setIpResult({ error: (e as Error).message });
    } finally {
      setIpLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
          <Globe className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-display font-semibold">Geocoding &amp; IP Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Convert addresses to GPS, GPS to addresses, and locate IP addresses — powered by OpenStreetMap and ipfind.
          </p>
        </div>
      </div>

      <Tabs defaultValue="forward" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="forward"><MapPin className="h-4 w-4 mr-1.5" />Address → GPS</TabsTrigger>
          <TabsTrigger value="reverse"><Navigation className="h-4 w-4 mr-1.5" />GPS → Address</TabsTrigger>
          <TabsTrigger value="ip"><Network className="h-4 w-4 mr-1.5" />IP Lookup</TabsTrigger>
        </TabsList>

        {/* FORWARD */}
        <TabsContent value="forward" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Batch address geocoding</CardTitle>
              <CardDescription>
                Enter addresses in the table below and extract real GPS coordinates. Data source: OpenStreetMap (Nominatim),
                cross-usable with Google Maps, Bolt and GRID3 coordinate systems (WGS-84).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Address</span><span className="w-24 text-center">Latitude</span>
                  <span className="w-24 text-center">Longitude</span><span className="w-16 text-center">Action</span>
                </div>
                <ScrollArea className="max-h-[360px]">
                  {rows.map((r) => (
                    <div key={r.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-3 py-1.5 border-t border-border">
                      <Input
                        value={r.address}
                        placeholder="e.g. 12 Marina Road, Lagos Island, Lagos"
                        onChange={(e) => updateRow(r.id, { address: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && geocodeRow(r)}
                        className="h-9"
                      />
                      <div className="w-24 text-center text-xs font-mono">{r.lat != null ? r.lat.toFixed(5) : "—"}</div>
                      <div className="w-24 text-center text-xs font-mono">{r.lng != null ? r.lng.toFixed(5) : "—"}</div>
                      <div className="w-16 flex items-center justify-center gap-1">
                        {r.status === "loading" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => geocodeRow(r)} title="Geocode">
                            <Locate className="h-4 w-4 text-primary" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      {r.resolved && (
                        <div className="col-span-4 text-xs text-muted-foreground pl-1 pb-1 flex items-center gap-2">
                          {r.status === "error" ? (
                            <Badge variant="destructive" className="text-[10px]">{r.resolved}</Badge>
                          ) : (
                            <>
                              <Badge variant="secondary" className="text-[10px]">{r.source}</Badge>
                              <span className="truncate">{r.resolved}</span>
                              {r.lat != null && (
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copy(`${r.lat}, ${r.lng}`)}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </ScrollArea>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={addRow}><Plus className="h-4 w-4 mr-1.5" />Add row</Button>
                <Button size="sm" onClick={runBatch} disabled={batchRunning}>
                  {batchRunning ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Locate className="h-4 w-4 mr-1.5" />}
                  Geocode all
                </Button>
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.some((r) => r.lat != null)}>
                  <Download className="h-4 w-4 mr-1.5" />Export CSV
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* REVERSE */}
        <TabsContent value="reverse" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reverse geocoding</CardTitle>
              <CardDescription>Enter GPS coordinates to fetch the real-world address.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Latitude</label>
                  <Input value={revLat} onChange={(e) => setRevLat(e.target.value)} placeholder="6.5120" className="w-36" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Longitude</label>
                  <Input value={revLng} onChange={(e) => setRevLng(e.target.value)} placeholder="3.3935" className="w-36" />
                </div>
                <Button variant="outline" size="sm" onClick={useMyLocation}><Locate className="h-4 w-4 mr-1.5" />Use my location</Button>
                <Button size="sm" onClick={runReverse} disabled={revLoading}>
                  {revLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Navigation className="h-4 w-4 mr-1.5" />}
                  Resolve address
                </Button>
              </div>
              {revResult && (
                <div className="rounded-lg border border-border p-3 text-sm">
                  {revResult.error ? (
                    <Badge variant="destructive">{revResult.error}</Badge>
                  ) : (
                    <>
                      <p className="font-medium">{revResult.display_name}</p>
                      <Badge variant="secondary" className="mt-2 text-[10px]">{revResult.source}</Badge>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* IP */}
        <TabsContent value="ip" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">IP address geolocation</CardTitle>
              <CardDescription>Leave blank to locate your own connection, or enter any IP address.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1 flex-1 min-w-48">
                  <label className="text-xs text-muted-foreground">IP address (optional)</label>
                  <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="8.8.8.8" />
                </div>
                <Button size="sm" onClick={runIp} disabled={ipLoading}>
                  {ipLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Network className="h-4 w-4 mr-1.5" />}
                  Locate IP
                </Button>
              </div>
              {ipResult && (
                <div className="rounded-lg border border-border p-3 text-sm">
                  {ipResult.error ? (
                    <Badge variant="destructive">{ipResult.error}</Badge>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {[
                        ["IP", ipResult.ip_address],
                        ["Country", `${ipResult.country ?? "—"} ${ipResult.country_flag ?? ""}`],
                        ["City", ipResult.city],
                        ["Region", ipResult.region],
                        ["Coordinates", ipResult.latitude != null ? `${ipResult.latitude}, ${ipResult.longitude}` : "—"],
                        ["Timezone", ipResult.timezone],
                        ["ISP / Owner", ipResult.owner],
                      ].map(([k, v]) => (
                        <div key={k as string} className="flex flex-col">
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</span>
                          <span className="font-medium">{(v as string) || "—"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
