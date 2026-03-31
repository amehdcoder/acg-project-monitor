import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Navigation, MapPin, Compass, Users, Loader2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  projectId: string;
  formId: string;
}

interface POI {
  lat: number;
  lng: number;
  name: string;
  userId: string;
  distance: number;
  bearing: number;
  lastSeen: string;
  type: "collector" | "geofence" | "submission";
}

const ARCameraOverlay = ({ projectId, formId }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [deviceHeading, setDeviceHeading] = useState(0);
  const [pois, setPois] = useState<POI[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [maxDistance, setMaxDistance] = useState("5"); // km

  const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const calculateBearing = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
      Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  };

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      streamRef.current = stream;
      setCameraActive(true);
    } catch (e) {
      toast({ title: "Camera Error", description: "Could not access camera. Check permissions.", variant: "destructive" });
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setCameraActive(false);
  }, []);

  // Watch user position
  useEffect(() => {
    if (!cameraActive) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setUserPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [cameraActive]);

  // Watch device orientation for compass heading
  useEffect(() => {
    if (!cameraActive) return;
    const handler = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null) setDeviceHeading(360 - e.alpha);
    };
    window.addEventListener("deviceorientation", handler);
    return () => window.removeEventListener("deviceorientation", handler);
  }, [cameraActive]);

  // Fetch POIs from database
  const fetchPOIs = useCallback(async () => {
    if (!userPosition) return;
    setLoading(true);
    try {
      const maxDistKm = parseInt(maxDistance);
      let userIds: string[];
      if (projectId) {
        const { data: assignments } = await supabase
          .from("user_project_assignments")
          .select("user_id")
          .eq("project_id", projectId);
        if (!assignments?.length) { setLoading(false); return; }
        userIds = assignments.map(a => a.user_id);
      } else {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("is_active", true)
          .limit(500);
        if (!profiles?.length) { setLoading(false); return; }
        userIds = profiles.map(p => p.user_id);
      }

      // Get recent device sessions with locations
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: recentSubs } = await supabase
        .from("form_submissions")
        .select("user_id, location, submitted_at, form_id")
        .in("user_id", userIds)
        .gte("submitted_at", twoHoursAgo)
        .not("location", "is", null)
        .order("submitted_at", { ascending: false });

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", userIds);
      const profileMap = new Map(profiles?.map(p => [p.user_id, `${p.first_name} ${p.last_name}`]) || []);

      const poiList: POI[] = [];
      const seenUsers = new Set<string>();

      recentSubs?.forEach(sub => {
        const loc = sub.location as any;
        if (!loc?.lat || !loc?.lng) return;
        const dist = haversine(userPosition.lat, userPosition.lng, loc.lat, loc.lng);
        if (dist > maxDistKm) return;

        if (!seenUsers.has(sub.user_id)) {
          seenUsers.add(sub.user_id);
          poiList.push({
            lat: loc.lat,
            lng: loc.lng,
            name: profileMap.get(sub.user_id) || "Unknown Collector",
            userId: sub.user_id,
            distance: Math.round(dist * 1000), // meters
            bearing: calculateBearing(userPosition.lat, userPosition.lng, loc.lat, loc.lng),
            lastSeen: sub.submitted_at || "",
            type: "collector",
          });
        }
      });

      // Add geofence centers as POIs
      if (formId) {
        const { data: forms } = await supabase
          .from("forms")
          .select("name, geofence")
          .eq("id", formId);
        forms?.forEach(f => {
          if (f.geofence && (f.geofence as any).coordinates?.length >= 3) {
            const coords = (f.geofence as any).coordinates;
            const centroid = coords.reduce(
              (acc: number[], c: number[]) => [acc[0] + c[0] / coords.length, acc[1] + c[1] / coords.length],
              [0, 0]
            );
            const dist = haversine(userPosition.lat, userPosition.lng, centroid[0], centroid[1]);
            if (dist <= maxDistKm) {
              poiList.push({
                lat: centroid[0], lng: centroid[1],
                name: f.name, userId: "", distance: Math.round(dist * 1000),
                bearing: calculateBearing(userPosition.lat, userPosition.lng, centroid[0], centroid[1]),
                lastSeen: "", type: "geofence",
              });
            }
          }
        });
      }

      setPois(poiList.sort((a, b) => a.distance - b.distance));
    } catch (e) {
      console.error("POI fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, formId, userPosition, maxDistance]);

  useEffect(() => {
    if (cameraActive && userPosition) fetchPOIs();
  }, [cameraActive, userPosition, fetchPOIs]);

  // Draw AR overlays on canvas
  useEffect(() => {
    if (!cameraActive || !canvasRef.current || !videoRef.current) return;

    const draw = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Compass
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(canvas.width / 2 - 40, 10, 80, 30);
      ctx.fillStyle = "#fff";
      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(deviceHeading)}° ${getCardinal(deviceHeading)}`, canvas.width / 2, 32);
      ctx.restore();

      // Draw POIs
      const fov = 60; // degrees field of view
      pois.forEach(poi => {
        let relBearing = poi.bearing - deviceHeading;
        if (relBearing > 180) relBearing -= 360;
        if (relBearing < -180) relBearing += 360;

        // Only show POIs within FOV
        if (Math.abs(relBearing) > fov / 2) return;

        const x = canvas.width / 2 + (relBearing / (fov / 2)) * (canvas.width / 2);
        const y = canvas.height * 0.4 + Math.min(poi.distance / 50, canvas.height * 0.3);

        const color = poi.type === "collector" ? "#3b82f6" : poi.type === "geofence" ? "#22c55e" : "#f59e0b";

        // Marker dot
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner icon
        ctx.fillStyle = "#fff";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(poi.type === "collector" ? "👤" : "📍", x, y + 4);

        if (showLabels) {
          // Label background
          const label = `${poi.name} (${poi.distance}m)`;
          const textWidth = ctx.measureText(label).width + 16;
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.roundRect(x - textWidth / 2, y - 32, textWidth, 20, 4);
          ctx.fill();

          // Label text
          ctx.fillStyle = "#fff";
          ctx.font = "11px sans-serif";
          ctx.fillText(label, x, y - 18);
        }

        // Direction line from center
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, canvas.height - 20);
        ctx.lineTo(x, y + 12);
        ctx.strokeStyle = `${color}40`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [cameraActive, pois, deviceHeading, showLabels]);

  const getCardinal = (deg: number) => {
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return dirs[Math.round(deg / 45) % 8];
  };

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="p-3 bg-gradient-to-br from-primary/5 to-transparent">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10"><MapPin className="h-4 w-4 text-primary" /></div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Nearby POIs</p>
                <p className="text-xl font-bold text-foreground">{pois.length}</p>
              </div>
            </div>
          </div>
        </Card>
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="p-3 bg-gradient-to-br from-blue-500/5 to-transparent">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-500/10"><Users className="h-4 w-4 text-blue-500" /></div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Collectors</p>
                <p className="text-xl font-bold text-foreground">{pois.filter(p => p.type === "collector").length}</p>
              </div>
            </div>
          </div>
        </Card>
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="p-3 bg-gradient-to-br from-emerald-500/5 to-transparent">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/10"><Compass className="h-4 w-4 text-emerald-500" /></div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Heading</p>
                <p className="text-xl font-bold text-foreground">{Math.round(deviceHeading)}°</p>
              </div>
            </div>
          </div>
        </Card>
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="p-3 bg-gradient-to-br from-amber-500/5 to-transparent">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10"><Navigation className="h-4 w-4 text-amber-500" /></div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Closest</p>
                <p className="text-xl font-bold text-foreground">{pois[0] ? `${pois[0].distance}m` : "—"}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Camera viewport */}
        <div className="lg:col-span-3">
          <Card className="border-0 shadow-lg overflow-hidden">
            <div className="relative rounded-xl overflow-hidden" style={{ height: "500px" }}>
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                playsInline
                muted
                style={{ display: cameraActive ? "block" : "none" }}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ display: cameraActive ? "block" : "none" }}
              />
              {!cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted/60 to-muted/30">
                  <div className="text-center space-y-4 max-w-sm">
                    <div className="p-6 rounded-2xl bg-primary/5 mx-auto w-fit">
                      <Camera className="h-14 w-14 text-primary/60" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">AR Camera View</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Start the camera to overlay GPS points of interest and collector locations on your live camera feed for intuitive field navigation.
                    </p>
                    <Button onClick={startCamera} className="gap-2 h-11 px-6 shadow-md" disabled={!projectId}>
                      <Camera className="h-4 w-4" />Start AR View
                    </Button>
                  </div>
                </div>
              )}
              {/* HUD overlay when active */}
              {cameraActive && (
                <div className="absolute top-3 left-3">
                  <div className="flex items-center gap-1.5 bg-emerald-500/90 text-white rounded-full px-2.5 py-1 text-[10px] font-bold backdrop-blur-sm shadow-lg">
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    AR ACTIVE
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Controls sidebar */}
        <div className="space-y-4">
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />AR Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cameraActive ? (
                <Button onClick={stopCamera} variant="destructive" className="w-full gap-2 h-10 shadow-sm" size="sm">
                  <EyeOff className="h-4 w-4" />Stop Camera
                </Button>
              ) : (
                <Button onClick={startCamera} className="w-full gap-2 h-10 shadow-sm" size="sm" disabled={!projectId}>
                  <Camera className="h-4 w-4" />Start AR View
                </Button>
              )}
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Max Distance</p>
                <Select value={maxDistance} onValueChange={setMaxDistance}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 km</SelectItem>
                    <SelectItem value="5">5 km</SelectItem>
                    <SelectItem value="10">10 km</SelectItem>
                    <SelectItem value="50">50 km</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={fetchPOIs} variant="outline" size="sm" className="w-full gap-2 h-9" disabled={loading || !cameraActive}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                Refresh POIs
              </Button>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Nearby Points</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[300px] overflow-y-auto">
                {pois.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-4 text-center">
                    {cameraActive ? "No POIs in range" : "Start camera to detect nearby points"}
                  </p>
                ) : pois.map((poi, i) => (
                  <div key={i} className="px-4 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{poi.name}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0 ml-2 font-mono">
                        {poi.distance}m
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground flex gap-2 mt-0.5">
                      <span>{Math.round(poi.bearing)}° {getCardinal(poi.bearing)}</span>
                      <span>•</span>
                      <span className="capitalize">{poi.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ARCameraOverlay;
