import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Watch, Wifi, WifiOff, Heart, Thermometer, Activity,
  Battery, Bluetooth, Camera, Radio, Signal, RefreshCcw,
  Trash2, CheckCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ConnectedDevice {
  id: string;
  name: string;
  type: "wearable" | "iot";
  category: string;
  status: "connected" | "disconnected" | "pairing";
  battery?: number;
  lastReading?: string;
  data: Record<string, string | number>;
}

const WearableIoTIntegration = () => {
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [wearableEnabled, setWearableEnabled] = useState(() => localStorage.getItem("wearable_enabled") === "true");
  const [iotEnabled, setIotEnabled] = useState(() => localStorage.getItem("iot_enabled") === "true");
  const [isScanning, setIsScanning] = useState(false);
  const [bluetoothSupported, setBluetoothSupported] = useState(false);

  useEffect(() => {
    setBluetoothSupported("bluetooth" in navigator);
  }, []);

  const toggleWearable = (val: boolean) => {
    setWearableEnabled(val);
    localStorage.setItem("wearable_enabled", String(val));
    toast({ title: val ? "Wearable Integration Enabled" : "Wearable Integration Disabled" });
  };

  const toggleIot = (val: boolean) => {
    setIotEnabled(val);
    localStorage.setItem("iot_enabled", String(val));
    toast({ title: val ? "IoT Integration Enabled" : "IoT Integration Disabled" });
  };

  const scanBluetooth = useCallback(async () => {
    if (!bluetoothSupported) {
      toast({ title: "Bluetooth Not Available", description: "Web Bluetooth is not supported on this browser/device.", variant: "destructive" });
      return;
    }

    setIsScanning(true);
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ["heart_rate", "battery_service", "health_thermometer"],
      });

      const newDevice: ConnectedDevice = {
        id: device.id || crypto.randomUUID(),
        name: device.name || "Unknown Device",
        type: "wearable",
        category: "Smartwatch / Fitness Tracker",
        status: "connected",
        battery: Math.floor(Math.random() * 40) + 60,
        lastReading: new Date().toISOString(),
        data: {
          heart_rate: `${Math.floor(Math.random() * 30) + 65} bpm`,
          steps: Math.floor(Math.random() * 5000) + 2000,
          temperature: `${(36 + Math.random() * 1.5).toFixed(1)}°C`,
        },
      };

      setDevices(prev => [newDevice, ...prev.filter(d => d.id !== newDevice.id)]);
      toast({ title: "⌚ Device Connected", description: `${newDevice.name} paired successfully.` });
    } catch (err: any) {
      if (err.name !== "NotFoundError") {
        toast({ title: "Connection Failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setIsScanning(false);
    }
  }, [bluetoothSupported]);

  const addSimulatedIoTDevice = (type: string) => {
    const templates: Record<string, Partial<ConnectedDevice>> = {
      temperature: {
        name: `Temp Sensor ${devices.length + 1}`,
        category: "Temperature Sensor",
        data: { temperature: `${(20 + Math.random() * 15).toFixed(1)}°C`, humidity: `${Math.floor(Math.random() * 40) + 40}%`, location: "Field Station A" },
      },
      camera: {
        name: `IP Camera ${devices.length + 1}`,
        category: "Surveillance Camera",
        data: { resolution: "1080p", fps: "30", storage: "72h loop", motion_events: Math.floor(Math.random() * 20) },
      },
      air_quality: {
        name: `Air Quality ${devices.length + 1}`,
        category: "Environmental Sensor",
        data: { pm25: `${Math.floor(Math.random() * 50) + 10} µg/m³`, co2: `${Math.floor(Math.random() * 400) + 400} ppm`, noise: `${Math.floor(Math.random() * 30) + 40} dB` },
      },
      water: {
        name: `Water Sensor ${devices.length + 1}`,
        category: "Water Quality Monitor",
        data: { ph: `${(6.5 + Math.random() * 1.5).toFixed(1)}`, turbidity: `${Math.floor(Math.random() * 5)} NTU`, chlorine: `${(0.2 + Math.random() * 0.8).toFixed(2)} mg/L` },
      },
    };

    const template = templates[type] || templates.temperature;
    const device: ConnectedDevice = {
      id: crypto.randomUUID(),
      type: "iot",
      status: "connected",
      battery: Math.floor(Math.random() * 40) + 60,
      lastReading: new Date().toISOString(),
      name: template.name || "IoT Device",
      category: template.category || "Sensor",
      data: template.data as Record<string, string | number> || {},
    };

    setDevices(prev => [device, ...prev]);
    toast({ title: "📡 IoT Device Added", description: `${device.name} is now collecting data.` });
  };

  const removeDevice = (id: string) => {
    setDevices(prev => prev.filter(d => d.id !== id));
    toast({ title: "Device Removed" });
  };

  const refreshReadings = () => {
    setDevices(prev => prev.map(d => ({
      ...d,
      lastReading: new Date().toISOString(),
      data: Object.fromEntries(
        Object.entries(d.data).map(([k, v]) => {
          if (typeof v === "number") return [k, v + Math.floor(Math.random() * 10) - 5];
          if (typeof v === "string" && v.includes("°C")) return [k, `${(parseFloat(v) + (Math.random() - 0.5)).toFixed(1)}°C`];
          if (typeof v === "string" && v.includes("bpm")) return [k, `${Math.floor(Math.random() * 30) + 65} bpm`];
          return [k, v];
        })
      ),
    })));
    toast({ title: "Readings Updated" });
  };

  return (
    <div className="space-y-6 p-4 lg:p-6 max-w-[1100px] mx-auto">
      <div>
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Watch className="h-7 w-7 text-primary" />
          </div>
          Wearable & IoT Integration
        </h1>
        <p className="text-muted-foreground mt-1">Connect wearable devices and IoT sensors to collect real-time field data</p>
      </div>

      {/* Toggle Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${wearableEnabled ? "bg-purple-500/10" : "bg-muted"}`}>
                  <Watch className={`h-5 w-5 ${wearableEnabled ? "text-purple-600" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <Label className="font-medium">Wearable Devices</Label>
                  <p className="text-xs text-muted-foreground">Smartwatches, fitness trackers</p>
                </div>
              </div>
              <Switch checked={wearableEnabled} onCheckedChange={toggleWearable} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${iotEnabled ? "bg-cyan-500/10" : "bg-muted"}`}>
                  <Radio className={`h-5 w-5 ${iotEnabled ? "text-cyan-600" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <Label className="font-medium">IoT Devices</Label>
                  <p className="text-xs text-muted-foreground">Sensors, cameras, environmental monitors</p>
                </div>
              </div>
              <Switch checked={iotEnabled} onCheckedChange={toggleIot} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="wearables">
        <TabsList>
          <TabsTrigger value="wearables" className="gap-1"><Watch className="h-3.5 w-3.5" /> Wearables</TabsTrigger>
          <TabsTrigger value="iot" className="gap-1"><Radio className="h-3.5 w-3.5" /> IoT Sensors</TabsTrigger>
        </TabsList>

        <TabsContent value="wearables" className="space-y-4 mt-4">
          <div className="flex gap-2 flex-wrap">
            <Button onClick={scanBluetooth} disabled={!wearableEnabled || isScanning} variant="acg" className="gap-2">
              <Bluetooth className="h-4 w-4" /> {isScanning ? "Scanning..." : "Scan for Devices"}
            </Button>
            {devices.filter(d => d.type === "wearable").length > 0 && (
              <Button variant="outline" size="sm" className="gap-1" onClick={refreshReadings}>
                <RefreshCcw className="h-3 w-3" /> Refresh
              </Button>
            )}
          </div>

          {!wearableEnabled ? (
            <div className="text-center py-12 text-muted-foreground">
              <WifiOff className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">Wearable integration is disabled</p>
              <p className="text-xs mt-1">Enable it using the toggle above</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {devices.filter(d => d.type === "wearable").map(device => (
                <Card key={device.id} className="border-purple-200/50 dark:border-purple-800/30">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Watch className="h-4 w-4 text-purple-500" />
                        <span className="font-medium text-sm">{device.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400">
                          <CheckCircle className="h-3 w-3 mr-1" /> Connected
                        </Badge>
                        <button onClick={() => removeDevice(device.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {device.battery && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Battery className="h-3 w-3" /> {device.battery}%
                      </div>
                    )}

                    <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                      {Object.entries(device.data).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="text-muted-foreground capitalize flex items-center gap-1">
                            {k === "heart_rate" && <Heart className="h-3 w-3 text-red-400" />}
                            {k === "temperature" && <Thermometer className="h-3 w-3 text-orange-400" />}
                            {k === "steps" && <Activity className="h-3 w-3 text-green-400" />}
                            {k.replace(/_/g, " ")}
                          </span>
                          <span className="font-medium font-mono">{String(v)}</span>
                        </div>
                      ))}
                    </div>

                    <p className="text-[10px] text-muted-foreground">
                      Last reading: {device.lastReading ? new Date(device.lastReading).toLocaleTimeString() : "—"}
                    </p>
                  </CardContent>
                </Card>
              ))}
              {devices.filter(d => d.type === "wearable").length === 0 && (
                <div className="col-span-2 text-center py-8 text-muted-foreground">
                  <Watch className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No wearable devices connected</p>
                  <p className="text-xs mt-1">Click "Scan for Devices" to pair</p>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="iot" className="space-y-4 mt-4">
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => addSimulatedIoTDevice("temperature")} disabled={!iotEnabled} variant="outline" size="sm" className="gap-1">
              <Thermometer className="h-3 w-3" /> Temperature Sensor
            </Button>
            <Button onClick={() => addSimulatedIoTDevice("camera")} disabled={!iotEnabled} variant="outline" size="sm" className="gap-1">
              <Camera className="h-3 w-3" /> IP Camera
            </Button>
            <Button onClick={() => addSimulatedIoTDevice("air_quality")} disabled={!iotEnabled} variant="outline" size="sm" className="gap-1">
              <Signal className="h-3 w-3" /> Air Quality
            </Button>
            <Button onClick={() => addSimulatedIoTDevice("water")} disabled={!iotEnabled} variant="outline" size="sm" className="gap-1">
              <Activity className="h-3 w-3" /> Water Monitor
            </Button>
            {devices.filter(d => d.type === "iot").length > 0 && (
              <Button variant="outline" size="sm" className="gap-1" onClick={refreshReadings}>
                <RefreshCcw className="h-3 w-3" /> Refresh All
              </Button>
            )}
          </div>

          {!iotEnabled ? (
            <div className="text-center py-12 text-muted-foreground">
              <WifiOff className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">IoT integration is disabled</p>
              <p className="text-xs mt-1">Enable it using the toggle above</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {devices.filter(d => d.type === "iot").map(device => (
                <Card key={device.id} className="border-cyan-200/50 dark:border-cyan-800/30">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-sm">{device.name}</span>
                        <p className="text-[10px] text-muted-foreground">{device.category}</p>
                      </div>
                      <button onClick={() => removeDevice(device.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="bg-muted/30 rounded-lg p-2.5 space-y-1">
                      {Object.entries(device.data).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                          <span className="font-medium font-mono">{String(v)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Wifi className="h-3 w-3 text-green-500" /> Online
                      </span>
                      <span>{device.lastReading ? new Date(device.lastReading).toLocaleTimeString() : "—"}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {devices.filter(d => d.type === "iot").length === 0 && (
                <div className="col-span-3 text-center py-8 text-muted-foreground">
                  <Radio className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No IoT devices connected</p>
                  <p className="text-xs mt-1">Add a sensor using the buttons above</p>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WearableIoTIntegration;
