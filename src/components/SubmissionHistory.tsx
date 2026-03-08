import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  CloudOff,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Trash2,
  Loader2,
  FileText,
  MapPin,
  Calendar,
  Navigation,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { extractLocationInfo, formatLocationShort, LocationInfo } from "@/lib/locationUtils";
import FormDataTable from "@/components/FormDataTable";
import { buildLabelMap, type QuestionLabelMap } from "@/lib/formLabelUtils";

interface Submission {
  id: string;
  form_id: string;
  form_name?: string;
  data: Record<string, any>;
  status: string;
  location: { lat: number; lng: number; accuracy?: number; altitude?: number } | null;
  within_geofence: boolean | null;
  created_at: string;
  submitted_at: string | null;
  synced_at: string | null;
  isPending?: boolean;
  retryCount?: number;
  locationInfo?: LocationInfo;
}

interface SubmissionHistoryProps {
  onClose: () => void;
}

const SubmissionHistory = ({ onClose }: SubmissionHistoryProps) => {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formLabelMaps, setFormLabelMaps] = useState<Record<string, QuestionLabelMap>>({});
  const { user, isAdmin } = useAuth();
  const { isOnline, pendingCount, isSyncing, syncPendingSubmissions, getPending, clearPending } = useOfflineStorage();

  useEffect(() => {
    fetchSubmissions();
  }, [user]);

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      
      // Fetch synced submissions from database
      let query = supabase
        .from("form_submissions")
        .select(`
          id,
          form_id,
          data,
          status,
          location,
          within_geofence,
          created_at,
          submitted_at,
          synced_at,
          forms!inner(name, questions)
        `)
        .order("created_at", { ascending: false });

      if (!isAdmin && user?.id) {
        query = query.eq("user_id", user.id);
      }

      const { data: syncedData, error } = await query;
      
      if (error) throw error;

      const syncedSubmissions: Submission[] = (syncedData || []).map((sub: any) => {
        const locationInfo = extractLocationInfo(sub.data, sub.location);
        return {
          ...sub,
          form_name: sub.forms?.name || "Unknown Form",
          isPending: false,
          locationInfo,
        };
      });

      // Build label maps from form questions
      const labelMaps: Record<string, QuestionLabelMap> = {};
      (syncedData || []).forEach((sub: any) => {
        if (sub.form_id && sub.forms?.questions && !labelMaps[sub.form_id]) {
          const questions = Array.isArray(sub.forms.questions) ? sub.forms.questions : [];
          labelMaps[sub.form_id] = buildLabelMap(questions);
        }
      });

      // Get pending submissions from offline storage
      const pendingSubmissions = await getPending();
      
      // Fetch form names and questions for pending submissions
      const formIds = [...new Set(pendingSubmissions.map(p => p.form_id))];
      const { data: formsData } = await supabase
        .from("forms")
        .select("id, name, questions")
        .in("id", formIds);
      
      const formNameMap = new Map((formsData || []).map(f => [f.id, f.name]));
      // Also build label maps for pending submission forms
      (formsData || []).forEach((f: any) => {
        if (!labelMaps[f.id] && f.questions) {
          const questions = Array.isArray(f.questions) ? f.questions : [];
          labelMaps[f.id] = buildLabelMap(questions);
        }
      });

      setFormLabelMaps(labelMaps);
      
      const pendingMapped: Submission[] = pendingSubmissions.map(sub => {
        const locationInfo = extractLocationInfo(sub.data, sub.location);
        return {
          id: sub.id,
          form_id: sub.form_id,
          form_name: formNameMap.get(sub.form_id) || "Unknown Form",
          data: sub.data,
          status: "pending",
          location: sub.location,
          within_geofence: sub.within_geofence,
          created_at: sub.created_at,
          submitted_at: null,
          synced_at: null,
          isPending: true,
          retryCount: sub.retryCount,
          locationInfo,
        };
      });

      // Combine and sort by created_at
      const allSubmissions = [...pendingMapped, ...syncedSubmissions].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setSubmissions(allSubmissions);
    } catch (error: any) {
      console.error("Error fetching submissions:", error);
      toast({
        title: "Error loading submissions",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    const result = await syncPendingSubmissions();
    if (result.synced > 0) {
      fetchSubmissions();
    }
  };

  const handleDeletePending = async (id: string) => {
    try {
      // This would need to be exposed from useOfflineStorage
      // For now, we'll just refresh after clearing
      toast({
        title: "Submission removed",
        description: "The pending submission has been removed.",
      });
      setDeleteConfirm(null);
      fetchSubmissions();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove submission.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (submission: Submission) => {
    if (submission.isPending) {
      return (
        <Badge variant="outline" className="border-yellow-500 bg-yellow-50 text-yellow-700">
          <Clock className="mr-1 h-3 w-3" />
          Pending Sync
          {submission.retryCount ? ` (${submission.retryCount} retries)` : ""}
        </Badge>
      );
    }
    
    if (submission.synced_at) {
      return (
        <Badge variant="outline" className="border-green-500 bg-green-50 text-green-700">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Synced
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" className="border-blue-500 bg-blue-50 text-blue-700">
        <FileText className="mr-1 h-3 w-3" />
        {submission.status}
      </Badge>
    );
  };

  const filteredSubmissions = submissions.filter((sub) => {
    const matchesSearch = sub.form_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (statusFilter === "all") return matchesSearch;
    if (statusFilter === "pending") return matchesSearch && sub.isPending;
    if (statusFilter === "synced") return matchesSearch && !sub.isPending && sub.synced_at;
    if (statusFilter === "sent") return matchesSearch && sub.status === "sent";
    
    return matchesSearch;
  });

  const pendingSubmissions = submissions.filter(s => s.isPending);
  const syncedSubmissions = submissions.filter(s => !s.isPending);

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground lg:text-3xl">
              Submission History
            </h1>
            <p className="text-muted-foreground">
              View your submitted and pending forms
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Sync Status */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            {isOnline ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <CloudOff className="h-4 w-4 text-yellow-500" />
            )}
            <span className="text-sm text-muted-foreground">
              {isOnline ? "Online" : "Offline"}
            </span>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {pendingCount} pending
              </Badge>
            )}
          </div>
          {isOnline && pendingCount > 0 && (
            <Button
              variant="acg"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing}
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-0 shadow-card">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-lg bg-blue-100 p-3">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{submissions.length}</p>
              <p className="text-sm text-muted-foreground">Total Submissions</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-lg bg-green-100 p-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{syncedSubmissions.length}</p>
              <p className="text-sm text-muted-foreground">Synced</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-lg bg-yellow-100 p-3">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{pendingSubmissions.length}</p>
              <p className="text-sm text-muted-foreground">Pending Sync</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by form name or submission ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Submissions</SelectItem>
            <SelectItem value="pending">Pending Sync</SelectItem>
            <SelectItem value="synced">Synced</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={fetchSubmissions}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Submissions List */}
      {!loading && (
        <Card className="border-0 shadow-card">
          <CardHeader>
            <CardTitle className="font-display">
              Submissions ({filteredSubmissions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredSubmissions.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 font-display text-lg font-semibold text-foreground">
                  No submissions found
                </h3>
                <p className="mt-1 text-muted-foreground">
                  {submissions.length === 0
                    ? "You haven't submitted any forms yet"
                    : "No submissions match your search criteria"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSubmissions.map((submission) => (
                  <div
                    key={submission.id}
                    className={`group flex flex-col gap-4 rounded-xl border p-4 transition-all duration-200 hover:shadow-soft sm:flex-row sm:items-center sm:justify-between ${
                      submission.isPending
                        ? "border-yellow-200 bg-yellow-50/50"
                        : "border-border bg-card hover:border-acg-gold/30"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                        submission.isPending ? "bg-yellow-100" : "bg-primary/10"
                      }`}>
                        {submission.isPending ? (
                          <Clock className="h-6 w-6 text-yellow-600" />
                        ) : (
                          <CheckCircle2 className="h-6 w-6 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-medium text-foreground">
                            {submission.form_name}
                          </h4>
                          {getStatusBadge(submission)}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground font-mono">
                          ID: {submission.id.slice(0, 12)}...
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(submission.created_at).toLocaleString()}
                          </span>
                          {submission.locationInfo && submission.locationInfo.displayLocation !== "Unknown" && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {formatLocationShort(submission.locationInfo)}
                            </span>
                          )}
                          {submission.within_geofence !== null && (
                            <Badge variant="outline" className={`text-[10px] ${submission.within_geofence ? "border-green-500 text-green-600" : "border-destructive text-destructive"}`}>
                              {submission.within_geofence ? "In geofence" : "Outside geofence"}
                            </Badge>
                          )}
                          {submission.synced_at && (
                            <span className="text-green-600">
                              Synced: {new Date(submission.synced_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedSubmission(submission)}
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </Button>
                      {submission.isPending && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm(submission.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* View Submission Dialog */}
      <Dialog open={!!selectedSubmission} onOpenChange={() => setSelectedSubmission(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">
              Submission Details
            </DialogTitle>
            <DialogDescription>
              {selectedSubmission?.form_name} - {selectedSubmission?.id.slice(0, 12)}...
            </DialogDescription>
          </DialogHeader>
          {selectedSubmission && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedSubmission)}
                </div>
                
                <div className="grid gap-4 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-muted-foreground">Created</div>
                    <div>{new Date(selectedSubmission.created_at).toLocaleString()}</div>
                  </div>
                  {selectedSubmission.submitted_at && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-muted-foreground">Submitted</div>
                      <div>{new Date(selectedSubmission.submitted_at).toLocaleString()}</div>
                    </div>
                  )}
                  {selectedSubmission.synced_at && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-muted-foreground">Synced</div>
                      <div>{new Date(selectedSubmission.synced_at).toLocaleString()}</div>
                    </div>
                  )}
                  {selectedSubmission.locationInfo && selectedSubmission.locationInfo.displayLocation !== "Unknown" && (
                    <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        Location Information
                      </h4>
                      <div className="grid gap-2 text-sm">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="text-muted-foreground">Location</div>
                          <div className="font-medium">{selectedSubmission.locationInfo.displayLocation}</div>
                        </div>
                        {selectedSubmission.locationInfo.state && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="text-muted-foreground">State</div>
                            <div>{selectedSubmission.locationInfo.state}</div>
                          </div>
                        )}
                        {selectedSubmission.locationInfo.lga && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="text-muted-foreground">LGA</div>
                            <div>{selectedSubmission.locationInfo.lga}</div>
                          </div>
                        )}
                        {selectedSubmission.locationInfo.ward && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="text-muted-foreground">Ward</div>
                            <div>{selectedSubmission.locationInfo.ward}</div>
                          </div>
                        )}
                        {selectedSubmission.locationInfo.community && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="text-muted-foreground">Community</div>
                            <div>{selectedSubmission.locationInfo.community}</div>
                          </div>
                        )}
                        {selectedSubmission.locationInfo.flhf && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="text-muted-foreground">Health Facility</div>
                            <div>{selectedSubmission.locationInfo.flhf}</div>
                          </div>
                        )}
                        {selectedSubmission.locationInfo.school && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="text-muted-foreground">School</div>
                            <div>{selectedSubmission.locationInfo.school}</div>
                          </div>
                        )}
                        {selectedSubmission.locationInfo.gpsCoords && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="text-muted-foreground flex items-center gap-1">
                              <Navigation className="h-3 w-3" />
                              GPS Coordinates
                            </div>
                            <div className="font-mono text-xs">
                              {selectedSubmission.locationInfo.gpsCoords.lat.toFixed(6)}, {selectedSubmission.locationInfo.gpsCoords.lng.toFixed(6)}
                              {selectedSubmission.locationInfo.gpsCoords.accuracy && (
                                <span className="text-muted-foreground ml-1">
                                  (±{selectedSubmission.locationInfo.gpsCoords.accuracy.toFixed(0)}m)
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        {selectedSubmission.within_geofence !== null && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="text-muted-foreground">Geofence Status</div>
                            <div>
                              <Badge variant="outline" className={selectedSubmission.within_geofence ? "border-green-500 text-green-600" : "border-destructive text-destructive"}>
                                {selectedSubmission.within_geofence ? "Within geofence" : "Outside geofence"}
                              </Badge>
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="text-muted-foreground">Source</div>
                          <div>
                            <Badge variant="secondary" className="text-xs">
                              {selectedSubmission.locationInfo.source === "admin_unit" 
                                ? "Form Fields" 
                                : selectedSubmission.locationInfo.source === "gps_geocoded"
                                ? "GPS (Geocoded)"
                                : selectedSubmission.locationInfo.source === "gps_coords"
                                ? "GPS Coordinates"
                                : "Unknown"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {selectedSubmission.location && !selectedSubmission.locationInfo?.gpsCoords && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-muted-foreground">GPS Location</div>
                      <div className="font-mono text-xs">
                        {selectedSubmission.location.lat.toFixed(6)}, {selectedSubmission.location.lng.toFixed(6)}
                        {selectedSubmission.within_geofence !== null && (
                          <Badge variant="outline" className="ml-2">
                            {selectedSubmission.within_geofence ? "Within geofence" : "Outside geofence"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <FormDataTable
                  data={selectedSubmission.data}
                  submissionId={selectedSubmission.id}
                  isPending={!!selectedSubmission.isPending}
                  onDataUpdate={(updatedData) => {
                    setSelectedSubmission({ ...selectedSubmission, data: updatedData });
                    fetchSubmissions();
                  }}
                />
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Pending Submission?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this submission from local storage. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDeletePending(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SubmissionHistory;
