import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Plus,
  ArrowLeft,
  MoreVertical,
  Eye,
  EyeOff,
  Trash2,
  LayoutDashboard,
  Loader2,
} from "lucide-react";
import { useDashboardBuilder, CustomDashboard, DashboardWidget, FormQuestion } from "@/hooks/useDashboardBuilder";
import { useDataAnalytics } from "@/hooks/useDataAnalytics";
import { useAuth } from "@/hooks/useAuth";
import AddWidgetDialog from "./AddWidgetDialog";
import DashboardExport from "./DashboardExport";
import DraggableWidgetGrid from "./DraggableWidgetGrid";
import DashboardFilters, { DashboardFilterValues } from "./DashboardFilters";
import DashboardActions from "./DashboardActions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DashboardBuilderProps {
  formId: string;
  formName: string;
  isAdmin: boolean;
  onBack: () => void;
}

const DashboardBuilder = ({ formId, formName, isAdmin, onBack }: DashboardBuilderProps) => {
  const { user } = useAuth();
  const {
    dashboards,
    currentDashboard,
    widgets,
    loading,
    saving,
    createDashboard,
    updateDashboard,
    deleteDashboard,
    addWidget,
    updateWidget,
    deleteWidget,
    togglePublish,
    selectDashboard,
  } = useDashboardBuilder(formId);

  const { submissions, refresh } = useDataAnalytics({ formId });

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddWidgetDialog, setShowAddWidgetDialog] = useState(false);
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);
  const [newDashboardName, setNewDashboardName] = useState("");
  const [newDashboardDescription, setNewDashboardDescription] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [filters, setFilters] = useState<DashboardFilterValues>({
    dateRange: undefined,
    location: "",
  });

  // Fetch form questions
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const { data, error } = await supabase
          .from("forms")
          .select("questions")
          .eq("id", formId)
          .single();

        if (error) throw error;

        const flatQuestions: FormQuestion[] = [];
        const processQuestions = (qs: any[]) => {
          qs?.forEach((q) => {
            if (q.questions) {
              processQuestions(q.questions);
            } else {
              flatQuestions.push({
                id: q.id,
                label: q.label || q.id,
                type: q.type,
                options: q.options,
              });
            }
          });
        };
        
        processQuestions(data?.questions as any[] || []);
        setQuestions(flatQuestions);
      } catch (error) {
        console.error("Error fetching form questions:", error);
      }
    };

    fetchQuestions();
    refresh();
  }, [formId, refresh]);

  // Filter submissions based on filter state
  const filteredSubmissions = submissions.filter((s) => {
    if (filters.dateRange?.from) {
      const submittedDate = new Date(s.submitted_at);
      if (submittedDate < filters.dateRange.from) return false;
      if (filters.dateRange.to && submittedDate > filters.dateRange.to) return false;
    }
    if (filters.location && s.state !== filters.location && s.location !== filters.location) {
      return false;
    }
    if (filters.customField && filters.customValue && filters.customValue !== "__all__") {
      const fieldValue = s.data?.[filters.customField];
      if (fieldValue !== filters.customValue) return false;
    }
    return true;
  });

  // Get unique locations for filter dropdown
  const locations = [...new Set(submissions.map((s) => s.state || s.location).filter(Boolean))] as string[];

  const handleCreateDashboard = async () => {
    if (!newDashboardName.trim()) return;
    
    const dashboard = await createDashboard(newDashboardName, newDashboardDescription);
    if (dashboard) {
      selectDashboard(dashboard);
      setShowCreateDialog(false);
      setNewDashboardName("");
      setNewDashboardDescription("");
    }
  };

  const handleAddWidget = async (
    widgetType: DashboardWidget["widget_type"],
    title: string,
    config: any
  ) => {
    if (!currentDashboard) return;
    
    if (editingWidget) {
      await updateWidget(editingWidget.id, { widget_type: widgetType, title, config });
      setEditingWidget(null);
    } else {
      await addWidget(currentDashboard.id, widgetType, title, config);
    }
    setShowAddWidgetDialog(false);
  };

  const handleDeleteDashboard = async () => {
    if (deleteConfirmId) {
      await deleteDashboard(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const dashboardContainerRef = useRef<HTMLDivElement>(null);

  const handleReorder = async (reorderedWidgets: DashboardWidget[]) => {
    // Update positions based on new order
    for (let i = 0; i < reorderedWidgets.length; i++) {
      const widget = reorderedWidgets[i];
      if (widget.position.y !== i * 4) {
        await updateWidget(widget.id, {
          position: { ...widget.position, y: i * 4 },
        });
      }
    }
  };

  const handleResize = async (widgetId: string, width: number, height: number) => {
    const widget = widgets.find((w) => w.id === widgetId);
    if (widget) {
      await updateWidget(widgetId, {
        position: { ...widget.position, w: width, h: height },
      });
    }
  };

  // If viewing a dashboard
  if (currentDashboard) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => selectDashboard(null)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="font-display text-lg font-semibold">{currentDashboard.name}</h1>
                <p className="text-sm text-muted-foreground">{formName}</p>
              </div>
              {currentDashboard.is_published ? (
                <Badge variant="default" className="bg-green-600">Published</Badge>
              ) : (
                <Badge variant="secondary">Draft</Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <DashboardExport
                dashboardName={currentDashboard.name}
                containerRef={dashboardContainerRef}
              />
              {isAdmin && user && (
                <>
                  <DashboardActions
                    dashboard={currentDashboard}
                    widgets={widgets}
                    currentFormId={formId}
                    userId={user.id}
                    onDuplicated={() => fetchDashboards()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => togglePublish(currentDashboard.id, !currentDashboard.is_published)}
                    disabled={saving}
                  >
                    {currentDashboard.is_published ? (
                      <>
                        <EyeOff className="h-4 w-4 mr-2" />
                        Unpublish
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-2" />
                        Publish
                      </>
                    )}
                  </Button>
                  <Button size="sm" onClick={() => setShowAddWidgetDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Widget
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Widgets Grid */}
        <div className="container mx-auto px-4 py-6" ref={dashboardContainerRef}>
          {widgets.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <LayoutDashboard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No widgets yet</h3>
                <p className="text-muted-foreground mb-4">
                  {isAdmin
                    ? "Start building your dashboard by adding widgets"
                    : "This dashboard has no widgets yet"}
                </p>
                {isAdmin && (
                  <Button onClick={() => setShowAddWidgetDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Widget
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <DraggableWidgetGrid
              widgets={widgets}
              submissions={submissions}
              questions={questions}
              isEditing={isAdmin}
              onEdit={(w) => {
                setEditingWidget(w);
                setShowAddWidgetDialog(true);
              }}
              onDelete={deleteWidget}
              onReorder={handleReorder}
              onResize={handleResize}
            />
          )}
        </div>

        {/* Add Widget Dialog */}
        <AddWidgetDialog
          open={showAddWidgetDialog}
          onClose={() => {
            setShowAddWidgetDialog(false);
            setEditingWidget(null);
          }}
          onAdd={handleAddWidget}
          questions={questions}
          editingWidget={editingWidget}
        />
      </div>
    );
  }

  // Dashboard list view
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-display text-lg font-semibold">Custom Dashboards</h1>
              <p className="text-sm text-muted-foreground">{formName}</p>
            </div>
          </div>

          {isAdmin && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Dashboard
            </Button>
          )}
        </div>
      </div>

      {/* Dashboard List */}
      <div className="container mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : dashboards.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <LayoutDashboard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No dashboards yet</h3>
              <p className="text-muted-foreground mb-4">
                {isAdmin
                  ? "Create your first custom dashboard to visualize form data"
                  : "No dashboards have been published for this form"}
              </p>
              {isAdmin && (
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Dashboard
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {dashboards.map((dashboard) => (
              <Card
                key={dashboard.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => selectDashboard(dashboard)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{dashboard.name}</CardTitle>
                      {dashboard.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {dashboard.description}
                        </p>
                      )}
                    </div>
                    {isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            togglePublish(dashboard.id, !dashboard.is_published);
                          }}>
                            {dashboard.is_published ? (
                              <>
                                <EyeOff className="h-4 w-4 mr-2" />
                                Unpublish
                              </>
                            ) : (
                              <>
                                <Eye className="h-4 w-4 mr-2" />
                                Publish
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(dashboard.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Updated {new Date(dashboard.updated_at).toLocaleDateString()}
                    </span>
                    {dashboard.is_published ? (
                      <Badge variant="default" className="bg-green-600 text-xs">Published</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Draft</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Dashboard Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Dashboard</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Dashboard Name</label>
              <Input
                value={newDashboardName}
                onChange={(e) => setNewDashboardName(e.target.value)}
                placeholder="e.g., Weekly Overview"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                value={newDashboardDescription}
                onChange={(e) => setNewDashboardDescription(e.target.value)}
                placeholder="Brief description..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateDashboard} disabled={!newDashboardName.trim() || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Dashboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All widgets in this dashboard will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDashboard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DashboardBuilder;
