import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import shp from "shpjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  MapPin,
  Trash2,
  Save,
  Plus,
  Upload,
  Pencil,
  FileUp,
  Users,
  Shield,
  Loader2,
  Search,
  Info,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface UserProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  state: string | null;
  lga: string | null;
  ward: string | null;
}

interface UserGeofenceAssignment {
  id: string;
  user_id: string;
  form_id: string;
  geofence: any;
  source: string;
  profile?: UserProfile;
}

interface UserGeofenceManagerProps {
  formId: string;
  formName: string;
  onClose: () => void;
}

// Nigeria State boundary approximations for auto-assignment
const NIGERIA_STATE_BOUNDARIES: Record<string, [number, number][]> = {
  "Plateau": [
    [10.05, 8.40], [10.05, 9.85], [9.85, 10.10], [9.40, 10.10],
    [8.80, 9.90], [8.60, 9.60], [8.50, 9.20], [8.60, 8.80],
    [8.85, 8.50], [9.20, 8.30], [9.60, 8.25], [9.90, 8.30],
  ],
  "Kano": [
    [12.60, 8.00], [12.60, 9.00], [12.00, 9.20], [11.40, 9.10],
    [11.20, 8.80], [11.10, 8.40], [11.20, 8.00], [11.60, 7.80],
    [12.10, 7.80], [12.40, 7.90],
  ],
  "Lagos": [
    [6.70, 3.00], [6.70, 3.70], [6.60, 4.00], [6.40, 4.10],
    [6.35, 3.90], [6.38, 3.50], [6.40, 3.20], [6.45, 3.00],
  ],
  "Abuja": [
    [9.30, 6.70], [9.30, 7.60], [8.80, 7.60], [8.75, 7.30],
    [8.70, 6.90], [8.85, 6.70], [9.10, 6.65],
  ],
  "Kaduna": [
    [11.30, 6.20], [11.30, 8.20], [10.80, 8.50], [10.20, 8.40],
    [9.70, 8.20], [9.60, 7.60], [9.80, 7.00], [10.10, 6.50],
    [10.60, 6.20], [11.00, 6.10],
  ],
};

const UserGeofenceManager = ({ formId, formName, onClose }: UserGeofenceManagerProps) => {
  const [assignments, setAssignments] = useState<UserGeofenceAssignment[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDrawDialog, setShowDrawDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [drawingCoordinates, setDrawingCoordinates] = useState<[number, number][]>([]);
  const [geofenceName, setGeofenceName] = useState("");
  const [saving, setSaving] = useState(false);
  const [isLoadingShapefile, setIsLoadingShapefile] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, [formId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch existing assignments with profiles
      const { data: assignmentData, error: assignError } = await supabase
        .from("user_geofence_assignments")
        .select("*")
        .eq("form_id", formId);

      if (assignError) throw assignError;

      // Fetch profiles for assigned users
      const userIds = (assignmentData || []).map((a) => a.user_id);
      let profilesMap: Record<string, UserProfile> = {};

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, user_id, first_name, last_name, email, state, lga, ward")
          .in("user_id", userIds);
        profiles?.forEach((p) => {
          profilesMap[p.user_id] = p;
        });
      }

      const enrichedAssignments = (assignmentData || []).map((a) => ({
        ...a,
        profile: profilesMap[a.user_id],
      }));

      setAssignments(enrichedAssignments);

      // Fetch all users assigned to this form
      const { data: formAssignments } = await supabase
        .from("user_form_assignments")
        .select("user_id")
        .eq("form_id", formId);

      const assignedUserIds = formAssignments?.map((a) => a.user_id) || [];

      if (assignedUserIds.length > 0) {
        const { data: allProfiles } = await supabase
          .from("profiles")
          .select("id, user_id, first_name, last_name, email, state, lga, ward")
          .in("user_id", assignedUserIds);
        setAvailableUsers(allProfiles || []);
      } else {
        // Fallback: fetch all active profiles
        const { data: allProfiles } = await supabase
          .from("profiles")
          .select("id, user_id, first_name, last_name, email, state, lga, ward")
          .eq("is_active", true)
          .order("first_name");
        setAvailableUsers(allProfiles || []);
      }
    } catch (error: any) {
      console.error("Error fetching geofence data:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAutoAssignFromProfile = async (user: UserProfile) => {
    if (!user.state) {
      toast({
        title: "No State in Profile",
        description: `${user.first_name} ${user.last_name} has no state set in their profile. Please set their state first or draw a custom boundary.`,
        variant: "destructive",
      });
      return;
    }

    const stateCoords = NIGERIA_STATE_BOUNDARIES[user.state];
    if (!stateCoords) {
      toast({
        title: "State Boundary Not Available",
        description: `Predefined boundary for "${user.state}" is not available. Please draw a custom boundary.`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const geofence = {
        id: `user-geo-${user.user_id}`,
        name: `${user.state}${user.lga ? ` - ${user.lga}` : ""}${user.ward ? ` - ${user.ward}` : ""} Boundary`,
        coordinates: stateCoords,
        enabled: true,
      };

      const { error } = await supabase
        .from("user_geofence_assignments")
        .upsert({
          user_id: user.user_id,
          form_id: formId,
          geofence,
          source: "profile",
          assigned_by: (await supabase.auth.getUser()).data.user?.id || "",
        }, { onConflict: "user_id,form_id" });

      if (error) throw error;

      toast({
        title: "Geofence Assigned",
        description: `${user.state} boundary assigned to ${user.first_name} ${user.last_name}.`,
      });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDrawDialog = (userId: string) => {
    setSelectedUserId(userId);
    setDrawingCoordinates([]);
    setGeofenceName("");
    setShowDrawDialog(true);
  };

  const handleShapefileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validExtensions = [".zip", ".shp"];
    const fileExtension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!validExtensions.includes(fileExtension)) {
      toast({ title: "Invalid File", description: "Upload a .zip or .shp file.", variant: "destructive" });
      return;
    }

    setIsLoadingShapefile(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const geojson = await shp(arrayBuffer);

      let features: GeoJSON.Feature[] = [];
      if (geojson.type === "FeatureCollection") features = geojson.features;
      else if (geojson.type === "Feature") features = [geojson];
      else if (Array.isArray(geojson)) features = geojson.flatMap((fc: any) => fc.features || []);

      let polygonCoords: [number, number][] = [];
      for (const feature of features) {
        const geometry = feature.geometry;
        if (geometry.type === "Polygon") {
          polygonCoords = (geometry.coordinates[0] as [number, number][]).map((c) => [c[1], c[0]] as [number, number]);
          break;
        } else if (geometry.type === "MultiPolygon") {
          polygonCoords = (geometry.coordinates[0][0] as [number, number][]).map((c) => [c[1], c[0]] as [number, number]);
          break;
        }
      }

      if (polygonCoords.length < 3) throw new Error("No valid polygon in shapefile");

      if (drawnItemsRef.current && mapInstanceRef.current) {
        drawnItemsRef.current.clearLayers();
        const polygon = L.polygon(polygonCoords, { color: "#d4a843", fillColor: "#d4a843", fillOpacity: 0.3 });
        drawnItemsRef.current.addLayer(polygon);
        mapInstanceRef.current.fitBounds(polygon.getBounds());
      }

      setDrawingCoordinates(polygonCoords);
      if (!geofenceName) setGeofenceName(file.name.replace(/\.(zip|shp)$/i, ""));

      toast({ title: "Shapefile Loaded", description: `Imported polygon with ${polygonCoords.length} points.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsLoadingShapefile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [geofenceName]);

  const handleSaveDrawnGeofence = async () => {
    if (!selectedUserId || drawingCoordinates.length < 3 || !geofenceName.trim()) {
      toast({ title: "Incomplete", description: "Draw a polygon and enter a name.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const geofence = {
        id: `user-geo-${selectedUserId}`,
        name: geofenceName,
        coordinates: drawingCoordinates,
        enabled: true,
      };

      const { error } = await supabase
        .from("user_geofence_assignments")
        .upsert({
          user_id: selectedUserId,
          form_id: formId,
          geofence,
          source: "manual",
          assigned_by: (await supabase.auth.getUser()).data.user?.id || "",
        }, { onConflict: "user_id,form_id" });

      if (error) throw error;

      toast({ title: "Geofence Saved", description: `Custom boundary assigned to user.` });
      setShowDrawDialog(false);
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from("user_geofence_assignments")
        .delete()
        .eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "Geofence Removed" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Initialize map for draw dialog
  useEffect(() => {
    if (!showDrawDialog || !mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView([9.082, 8.6753], 6);
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    drawnItemsRef.current = drawnItems;
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      position: "topright",
      draw: {
        polygon: {
          allowIntersection: false,
          shapeOptions: { color: "#d4a843", fillColor: "#d4a843", fillOpacity: 0.3 },
        },
        polyline: false,
        circle: false,
        rectangle: {
          shapeOptions: { color: "#d4a843", fillColor: "#d4a843", fillOpacity: 0.3 },
        },
        marker: false,
        circlemarker: false,
      },
      edit: { featureGroup: drawnItems, remove: true },
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (e: any) => {
      drawnItems.clearLayers();
      drawnItems.addLayer(e.layer);
      const latLngs = e.layer.getLatLngs()[0];
      const coords: [number, number][] = latLngs.map((ll: L.LatLng) => [ll.lat, ll.lng]);
      setDrawingCoordinates(coords);
    });

    map.on(L.Draw.Event.EDITED, (e: any) => {
      e.layers.eachLayer((layer: any) => {
        const latLngs = layer.getLatLngs()[0];
        const coords: [number, number][] = latLngs.map((ll: L.LatLng) => [ll.lat, ll.lng]);
        setDrawingCoordinates(coords);
      });
    });

    map.on(L.Draw.Event.DELETED, () => setDrawingCoordinates([]));

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [showDrawDialog]);

  const usersWithoutAssignment = availableUsers.filter(
    (u) => !assignments.some((a) => a.user_id === u.user_id)
  );

  const filteredUnassigned = usersWithoutAssignment.filter(
    (u) =>
      `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            User Geofence Assignments
          </h1>
          <p className="text-muted-foreground">
            Manage per-user geofence boundaries for <strong>{formName}</strong>
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 rounded-lg bg-primary/5 border border-primary/20 p-4">
        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">How it works</p>
          <p>
            Assign specific geofence boundaries to individual users. Users with an assignment will be
            restricted to their designated area when filling this form. Users without an assignment
            will have no geofence restriction.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Existing Assignments */}
          <Card className="border-0 shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display">
                <Shield className="h-5 w-5 text-primary" />
                Active Assignments ({assignments.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {assignments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p>No user-specific geofences assigned yet.</p>
                  <p className="text-xs mt-1">Add assignments below to restrict users to specific areas.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {assignments.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {a.profile
                              ? `${a.profile.first_name} ${a.profile.last_name}`
                              : a.user_id.slice(0, 8)}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-xs">
                              {a.geofence?.name || "Unnamed"}
                            </Badge>
                            <Badge
                              variant={a.source === "profile" ? "secondary" : "outline"}
                              className="text-xs"
                            >
                              {a.source === "profile" ? "Auto (Profile)" : "Manual"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteAssignment(a.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add New Assignment */}
          <Card className="border-0 shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display">
                <Plus className="h-5 w-5 text-primary" />
                Add Geofence Assignment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2">
                  {filteredUnassigned.length === 0 ? (
                    <p className="text-center py-6 text-sm text-muted-foreground">
                      {usersWithoutAssignment.length === 0
                        ? "All assigned users have geofences."
                        : "No users match your search."}
                    </p>
                  ) : (
                    filteredUnassigned.map((user) => (
                      <div
                        key={user.user_id}
                        className="flex items-center justify-between rounded-lg border border-border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                            <Users className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground text-sm">
                              {user.first_name} {user.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                            {user.state && (
                              <p className="text-xs text-muted-foreground">
                                📍 {user.state}
                                {user.lga ? ` › ${user.lga}` : ""}
                                {user.ward ? ` › ${user.ward}` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {user.state && NIGERIA_STATE_BOUNDARIES[user.state] && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAutoAssignFromProfile(user)}
                              disabled={saving}
                            >
                              <MapPin className="h-3.5 w-3.5 mr-1" />
                              Auto ({user.state})
                            </Button>
                          )}
                          <Button
                            variant="acg"
                            size="sm"
                            onClick={() => handleOpenDrawDialog(user.user_id)}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Draw
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}

      {/* Draw Geofence Dialog */}
      <Dialog
        open={showDrawDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowDrawDialog(false);
            mapInstanceRef.current?.remove();
            mapInstanceRef.current = null;
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Draw Custom Geofence
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Instructions */}
            <div className="flex items-start gap-3 rounded-lg bg-primary/5 border border-primary/20 p-3">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Option 1:</strong> Use the polygon or rectangle tool on the map to draw a boundary.{" "}
                <strong className="text-foreground">Option 2:</strong> Upload a shapefile (.zip) to import an existing boundary.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Geofence Name</Label>
                <Input
                  value={geofenceName}
                  onChange={(e) => setGeofenceName(e.target.value)}
                  placeholder="e.g., Kano LGA Boundary"
                />
              </div>
              <div className="space-y-2">
                <Label>Upload Shapefile (optional)</Label>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,.shp"
                    onChange={handleShapefileUpload}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoadingShapefile}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {isLoadingShapefile ? "Loading..." : "Choose File"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="relative">
              <p className="text-xs text-muted-foreground mb-2">
                👆 Use the draw tools (top-right of map) to create a polygon or rectangle boundary
              </p>
              <div
                ref={mapRef}
                className="h-[400px] w-full rounded-lg border border-border"
                style={{ zIndex: 1 }}
              />
            </div>

            {drawingCoordinates.length > 0 && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm font-medium text-foreground">
                  Polygon: {drawingCoordinates.length} points
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDrawDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="acg"
                onClick={handleSaveDrawnGeofence}
                disabled={saving || drawingCoordinates.length < 3 || !geofenceName.trim()}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Geofence
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserGeofenceManager;
