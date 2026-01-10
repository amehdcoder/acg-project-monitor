import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User,
  Calendar,
  Clock,
  MapPin,
  FileText,
  History,
  Briefcase,
  UserPlus,
  RefreshCw,
  XCircle,
  Tag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface CaseActivity {
  id: string;
  activityType: string;
  performedAt: string;
  performedBy: string;
  performerName?: string;
  formSubmissionId?: string;
  changes: Record<string, any>;
  notes?: string;
}

interface CaseDetailsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId?: string;
}

const CaseDetails = ({ open, onOpenChange, caseId }: CaseDetailsProps) => {
  const [caseData, setCaseData] = useState<any>(null);
  const [activities, setActivities] = useState<CaseActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && caseId) {
      fetchCaseDetails();
      fetchCaseActivities();
    }
  }, [open, caseId]);

  const fetchCaseDetails = async () => {
    if (!caseId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cases")
        .select(`
          *,
          case_types(name, label, properties)
        `)
        .eq("id", caseId)
        .single();

      if (error) throw error;
      setCaseData(data);
    } catch (error) {
      console.error("Error fetching case details:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCaseActivities = async () => {
    if (!caseId) return;

    try {
      const { data, error } = await supabase
        .from("case_activities")
        .select("*")
        .eq("case_id", caseId)
        .order("performed_at", { ascending: false });

      if (error) throw error;

      setActivities(
        (data || []).map((a) => ({
          id: a.id,
          activityType: a.activity_type,
          performedAt: a.performed_at,
          performedBy: a.performed_by,
          formSubmissionId: a.form_submission_id,
          changes: a.changes as Record<string, any>,
          notes: a.notes,
        }))
      );
    } catch (error) {
      console.error("Error fetching case activities:", error);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "registration":
        return <UserPlus className="h-4 w-4 text-green-500" />;
      case "follow_up":
        return <RefreshCw className="h-4 w-4 text-blue-500" />;
      case "update":
        return <FileText className="h-4 w-4 text-yellow-500" />;
      case "close":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "reopen":
        return <RefreshCw className="h-4 w-4 text-green-500" />;
      default:
        return <History className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActivityLabel = (type: string) => {
    switch (type) {
      case "registration":
        return "Case Registered";
      case "follow_up":
        return "Follow-up Visit";
      case "update":
        return "Case Updated";
      case "close":
        return "Case Closed";
      case "reopen":
        return "Case Reopened";
      default:
        return type;
    }
  };

  if (!caseData) return null;

  const properties = caseData.properties || {};
  const caseType = caseData.case_types;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            {caseData.name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-3">
            <Badge variant="outline">{caseType?.label}</Badge>
            <Badge variant={caseData.status === "open" ? "default" : "secondary"}>
              {caseData.status === "open" ? "Open" : "Closed"}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="properties" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="properties">
              <Tag className="h-4 w-4 mr-2" />
              Properties
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-2" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="properties">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {/* Case Metadata */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Case Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Opened
                      </span>
                      <span className="text-sm font-medium">
                        {format(new Date(caseData.opened_at), "MMM d, yyyy 'at' h:mm a")}
                      </span>
                    </div>
                    {caseData.closed_at && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <XCircle className="h-4 w-4" />
                          Closed
                        </span>
                        <span className="text-sm font-medium">
                          {format(new Date(caseData.closed_at), "MMM d, yyyy 'at' h:mm a")}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Last Modified
                      </span>
                      <span className="text-sm font-medium">
                        {format(new Date(caseData.last_modified_at), "MMM d, yyyy 'at' h:mm a")}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Case Properties */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Case Properties</CardTitle>
                    <CardDescription>Saved data from form submissions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(properties).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No properties saved yet
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(properties).map(([key, value]) => (
                          <div
                            key={key}
                            className="flex items-center justify-between py-2 border-b border-border last:border-0"
                          >
                            <span className="text-sm text-muted-foreground capitalize">
                              {key.replace(/_/g, " ")}
                            </span>
                            <span className="text-sm font-medium">
                              {String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="history">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {activities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-center">
                    <History className="h-12 w-12 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No activity history</p>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                    {activities.map((activity, index) => (
                      <div
                        key={activity.id}
                        className="relative pl-10 pb-6 last:pb-0"
                      >
                        <div className="absolute left-2 top-1 w-5 h-5 rounded-full bg-background border-2 border-border flex items-center justify-center">
                          {getActivityIcon(activity.activityType)}
                        </div>
                        <Card>
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm">
                                {getActivityLabel(activity.activityType)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(
                                  new Date(activity.performedAt),
                                  "MMM d, yyyy 'at' h:mm a"
                                )}
                              </span>
                            </div>
                            {activity.notes && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {activity.notes}
                              </p>
                            )}
                            {activity.formSubmissionId && (
                              <Badge variant="outline" className="mt-2 text-xs">
                                <FileText className="h-3 w-3 mr-1" />
                                Form Submission
                              </Badge>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default CaseDetails;
