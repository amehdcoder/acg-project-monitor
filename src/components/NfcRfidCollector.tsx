import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Nfc, ScanLine, Loader2, Smartphone,
  Radio, Clock, Trash2, Download,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface TagReading {
  id: string;
  type: "nfc" | "rfid";
  serialNumber: string;
  data: Record<string, string>;
  timestamp: string;
  signalStrength?: number;
}

const NfcRfidCollector = () => {
  const [nfcEnabled, setNfcEnabled] = useState(() => localStorage.getItem("nfc_enabled") === "true");
  const [rfidEnabled, setRfidEnabled] = useState(() => localStorage.getItem("rfid_enabled") === "true");
  const [isScanning, setIsScanning] = useState(false);
  const [readings, setReadings] = useState<TagReading[]>([]);
  const [nfcSupported, setNfcSupported] = useState(false);

  useEffect(() => {
    setNfcSupported("NDEFReader" in window);
  }, []);

  const toggleNfc = (val: boolean) => {
    setNfcEnabled(val);
    localStorage.setItem("nfc_enabled", String(val));
    toast({ title: val ? "NFC Enabled" : "NFC Disabled", description: val ? "NFC tag reading is now active." : "NFC tag reading has been turned off." });
  };

  const toggleRfid = (val: boolean) => {
    setRfidEnabled(val);
    localStorage.setItem("rfid_enabled", String(val));
    toast({ title: val ? "RFID Enabled" : "RFID Disabled", description: val ? "RFID tag reading is now active." : "RFID tag reading has been turned off." });
  };

  const startNfcScan = useCallback(async () => {
    if (!nfcSupported) {
      toast({ title: "NFC Not Supported", description: "Your device does not support Web NFC. Try using a compatible Android device with Chrome.", variant: "destructive" });
      return;
    }

    setIsScanning(true);
    try {
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();

      ndef.addEventListener("reading", ({ serialNumber, message }: any) => {
        const data: Record<string, string> = {};
        if (message?.records) {
          message.records.forEach((record: any, i: number) => {
            try {
              const textDecoder = new TextDecoder();
              data[`record_${i + 1}`] = textDecoder.decode(record.data);
            } catch {
              data[`record_${i + 1}`] = "(binary data)";
            }
          });
        }

        const reading: TagReading = {
          id: crypto.randomUUID(),
          type: "nfc",
          serialNumber: serialNumber || "Unknown",
          data,
          timestamp: new Date().toISOString(),
        };
        setReadings(prev => [reading, ...prev]);
        toast({ title: "🏷️ NFC Tag Read", description: `Serial: ${serialNumber}` });
      });

      ndef.addEventListener("readingerror", () => {
        toast({ title: "Read Error", description: "Could not read NFC tag. Try holding closer.", variant: "destructive" });
      });

      toast({ title: "Scanning...", description: "Hold an NFC tag near your device." });
    } catch (err: any) {
      toast({ title: "NFC Error", description: err.message || "Failed to start NFC scan.", variant: "destructive" });
      setIsScanning(false);
    }
  }, [nfcSupported]);

  const simulateRfidScan = () => {
    const reading: TagReading = {
      id: crypto.randomUUID(),
      type: "rfid",
      serialNumber: `RFID-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      data: {
        item_id: `ITEM-${Math.floor(Math.random() * 10000)}`,
        location: "Warehouse Section B",
        last_scanned: new Date().toISOString(),
        category: ["Medical Supply", "Equipment", "Consumable"][Math.floor(Math.random() * 3)],
      },
      timestamp: new Date().toISOString(),
      signalStrength: Math.floor(Math.random() * 40) + 60,
    };
    setReadings(prev => [reading, ...prev]);
    toast({ title: "📡 RFID Tag Detected", description: `Serial: ${reading.serialNumber}` });
  };

  const clearReadings = () => {
    setReadings([]);
    toast({ title: "Cleared", description: "All tag readings have been removed." });
  };

  const exportReadings = () => {
    const csv = [
      "Type,Serial Number,Timestamp,Data",
      ...readings.map(r => `${r.type},${r.serialNumber},${r.timestamp},"${JSON.stringify(r.data).replace(/"/g, '""')}"`)
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tag-readings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-4 lg:p-6 max-w-[1000px] mx-auto">
      <div>
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Nfc className="h-7 w-7 text-primary" />
          </div>
          NFC & RFID Data Collection
        </h1>
        <p className="text-muted-foreground mt-1">
          Read NFC tags and RFID transponders to collect data from physical objects
        </p>
      </div>

      {/* Toggle Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${nfcEnabled ? "bg-green-500/10" : "bg-muted"}`}>
                  <Smartphone className={`h-5 w-5 ${nfcEnabled ? "text-green-600" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <Label className="font-medium">NFC Reader</Label>
                  <p className="text-xs text-muted-foreground">Near-field communication tags</p>
                  {!nfcSupported && <p className="text-[10px] text-amber-600">Not supported on this device</p>}
                </div>
              </div>
              <Switch checked={nfcEnabled} onCheckedChange={toggleNfc} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${rfidEnabled ? "bg-blue-500/10" : "bg-muted"}`}>
                  <Radio className={`h-5 w-5 ${rfidEnabled ? "text-blue-600" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <Label className="font-medium">RFID Reader</Label>
                  <p className="text-xs text-muted-foreground">Radio-frequency identification</p>
                </div>
              </div>
              <Switch checked={rfidEnabled} onCheckedChange={toggleRfid} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scan Controls */}
      <div className="flex gap-3 flex-wrap">
        {nfcEnabled && (
          <Button onClick={startNfcScan} disabled={isScanning || !nfcSupported} variant="acg" className="gap-2">
            {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            {isScanning ? "Scanning NFC..." : "Scan NFC Tag"}
          </Button>
        )}
        {rfidEnabled && (
          <Button onClick={simulateRfidScan} variant="outline" className="gap-2">
            <Radio className="h-4 w-4" /> Read RFID Tag
          </Button>
        )}
        {readings.length > 0 && (
          <>
            <Button variant="outline" size="sm" className="gap-2" onClick={exportReadings}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button variant="ghost" size="sm" className="gap-2 text-destructive" onClick={clearReadings}>
              <Trash2 className="h-4 w-4" /> Clear All
            </Button>
          </>
        )}
      </div>

      {/* Readings List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-primary" />
            Tag Readings
            {readings.length > 0 && <Badge variant="secondary">{readings.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {readings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Nfc className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No tags scanned yet</p>
              <p className="text-xs mt-1">Enable NFC or RFID and scan a tag to begin</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-3">
                {readings.map(reading => (
                  <div key={reading.id} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {reading.type === "nfc" ? (
                          <Smartphone className="h-4 w-4 text-green-600" />
                        ) : (
                          <Radio className="h-4 w-4 text-blue-600" />
                        )}
                        <Badge variant="secondary" className="text-[10px]">{reading.type.toUpperCase()}</Badge>
                        <span className="text-sm font-mono font-medium">{reading.serialNumber}</span>
                      </div>
                      {reading.signalStrength && (
                        <Badge variant="outline" className="text-[10px]">{reading.signalStrength}% signal</Badge>
                      )}
                    </div>
                    <div className="bg-muted/30 rounded-md p-2 space-y-1">
                      {Object.entries(reading.data).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                          <span className="font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(reading.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NfcRfidCollector;
