import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  AlertTriangle,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
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
  BarChart3,
  Sparkles,
  Database,
  Settings2,
  RotateCcw,
} from "lucide-react";
import { generateSimulatedSubmissions } from "@/lib/dashboardSimulation";
import { useDashboardBuilder, CustomDashboard, DashboardWidget, FormQuestion } from "@/hooks/useDashboardBuilder";
import { useDataAnalytics } from "@/hooks/useDataAnalytics";
import { useAuth } from "@/hooks/useAuth";
import AddWidgetDialog from "./AddWidgetDialog";
import DashboardExport from "./DashboardExport";
import DraggableWidgetGrid from "./DraggableWidgetGrid";
import DashboardFilters, { DashboardFilterValues } from "./DashboardFilters";
import DashboardActions from "./DashboardActions";
import AutoInsightsDashboard from "./AutoInsightsDashboard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DashboardBuilderProps {
  formId: string;
  formName: string;
  isAdmin: boolean;
  onBack: () => void;
}

const DashboardBuilder = ({ formId, formName, isAdmin, onBack }: DashboardBuilderProps) => {
  const { user, isOwner } = useAuth();
  const [simulate, setSimulate] = useState(false);
  // Owner-only simulation controls — reproducible via deterministic seed.
  const SIM_DEFAULTS = { count: 2500, days: 90, seed: 1337 };
  const [simCount, setSimCount] = useState(SIM_DEFAULTS.count);
  const [simDays, setSimDays] = useState(SIM_DEFAULTS.days);
  const [simSeed, setSimSeed] = useState(SIM_DEFAULTS.seed);
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
  const [lookerUrl, setLookerUrl] = useState<string | null>(null);
  const [resolvedLookerUrl, setResolvedLookerUrl] = useState<string | null>(null);
  const [useEmbedLookerUrl, setUseEmbedLookerUrl] = useState(true);

  // Fetch form questions and Looker URL
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const { data, error } = await supabase
          .from("forms")
          .select("questions, looker_dashboard_url")
          .eq("id", formId)
          .single();

        if (error) throw error;

        // Fetch Looker Studio URL for this form
        if ((data as any)?.looker_dashboard_url) {
          setLookerUrl((data as any).looker_dashboard_url);
          const resolvedUrl = await resolveLookerUrlForEmbed((data as any).looker_dashboard_url);
          setResolvedLookerUrl(resolvedUrl);
        } else {
          setLookerUrl(null);
          setResolvedLookerUrl(null);
        }

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

  // Real-time: refresh insights whenever submissions for this form change
  useEffect(() => {
    const topic = `dashboard-insights-${formId}`;
    supabase.getChannels().filter((c) => c.topic === `realtime:${topic}`).forEach((c) => supabase.removeChannel(c));
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "form_submissions", filter: `form_id=eq.${formId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [formId, refresh]);

  useEffect(() => {
    setUseEmbedLookerUrl(true);
  }, [lookerUrl]);


  // Filter submissions based on filter state
  // Owner-only synthetic dataset to showcase the dashboard's full potential
  // at scale. Generated locally — never persisted, never costs AI credits.
  const simulatedSubmissions = useMemo(() => {
    if (!simulate) return [];
    return generateSimulatedSubmissions({ formId, formName, questions, count: simCount, days: simDays, seed: simSeed });
  }, [simulate, formId, formName, questions, simCount, simDays, simSeed]);

  const baseSubmissions = simulate ? simulatedSubmissions : submissions;

  const filteredSubmissions = baseSubmissions.filter((s) => {
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
  const locations = [...new Set(baseSubmissions.map((s) => s.state || s.location).filter(Boolean))] as string[];

  // Reusable Owner-only simulation toggle + reproducibility controls.
  const SimulationToggle = isOwner ? (
    <div className="flex items-center gap-1.5">
      <Button
        variant={simulate ? "default" : "outline"}
        size="sm"
        onClick={() => setSimulate((v) => !v)}
        className={simulate ? "bg-violet-600 hover:bg-violet-700" : ""}
        title="Owner-only: preview this dashboard with large simulated data"
      >
        {simulate ? <Sparkles className="h-4 w-4 mr-2" /> : <Database className="h-4 w-4 mr-2" />}
        {simulate ? "Simulating Data" : "Simulate Data"}
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-9" title="Simulation controls">
            <Settings2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold">Simulation controls</p>
              <p className="text-xs text-muted-foreground">
                Deterministic — the same seed reproduces the exact dataset.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Number of submissions: {simCount.toLocaleString()}</Label>
              <Input
                type="number"
                min={50}
                max={50000}
                step={50}
                value={simCount}
                onChange={(e) => setSimCount(Math.max(1, Math.min(50000, Number(e.target.value) || 0)))}
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date range (days back): {simDays}</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={simDays}
                onChange={(e) => setSimDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Seed</Label>
              <Input
                type="number"
                value={simSeed}
                onChange={(e) => setSimSeed(Number(e.target.value) || 0)}
                className="h-8"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                setSimCount(SIM_DEFAULTS.count);
                setSimDays(SIM_DEFAULTS.days);
                setSimSeed(SIM_DEFAULTS.seed);
              }}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset to defaults
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  ) : null;

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

  const resolveLookerUrlForEmbed = async (url: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("resolve-looker-url", {
        body: { url },
      });

      if (!error && data?.embedUrl) {
        return data.embedUrl as string;
      }

      return url;
    } catch {
      return url;
    }
  };

  const getLookerDisplayUrl = (url: string, useEmbedPath: boolean) => {
    const normalizedUrl = url.trim().replace("datastudio.google.com", "lookerstudio.google.com");

    // Short links (/s/...) should remain raw because /embed/s/... can fail for some dashboards.
    if (normalizedUrl.includes("/s/")) {
      return normalizedUrl;
    }

    if (!useEmbedPath) {
      return normalizedUrl;
    }

    if (normalizedUrl.includes("/embed/")) {
      return normalizedUrl;
    }

    if (normalizedUrl.includes("/reporting/")) {
      return normalizedUrl.replace("/reporting/", "/embed/reporting/");
    }

    return normalizedUrl;
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
              {SimulationToggle}
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
                    onDuplicated={() => selectDashboard(null)}
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

        {simulate && (
          <div className="container mx-auto px-4 pt-4">
            <div className="flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-4 py-2.5 text-sm text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span><strong>Simulation mode (Owner preview):</strong> showing {filteredSubmissions.length.toLocaleString()} synthetic submissions. This data is not real and is never saved.</span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="container mx-auto px-4 pt-4">
          <DashboardFilters
            filters={filters}
            onFiltersChange={setFilters}
            locations={locations}
            questions={questions}
          />
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
              submissions={filteredSubmissions}
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

          <div className="flex items-center gap-2">
            {SimulationToggle}
            {isAdmin && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Dashboard
              </Button>
            )}
          </div>
        </div>
      </div>

      {simulate && (
        <div className="container mx-auto px-4 pt-6">
          <div className="flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-4 py-2.5 text-sm text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span><strong>Simulation mode (Owner preview):</strong> showing {filteredSubmissions.length.toLocaleString()} synthetic submissions. This data is not real and is never saved.</span>
          </div>
        </div>
      )}

      {/* Auto-Generated Insights — always on, real-time */}
      <div className="container mx-auto px-4 pt-6">
        <AutoInsightsDashboard
          formName={formName}
          submissions={filteredSubmissions}
          questions={questions}
        />
      </div>

      {/* Looker Studio Dashboard — rendered as the DEFAULT view */}
      {lookerUrl && (
        <div className="container mx-auto px-4 pt-6">
          <Card className="border-0 shadow-card overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-3 bg-gradient-to-r from-primary/5 to-transparent">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <BarChart3 className="h-5 w-5 text-primary" />
                </div>
                Google Looker Studio Dashboard
                <Badge variant="secondary" className="text-[10px] ml-2">Default</Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setUseEmbedLookerUrl(!useEmbedLookerUrl);
                    toast.info(useEmbedLookerUrl ? "Switched to direct URL mode" : "Switched to embed URL mode");
                  }}
                >
                  {useEmbedLookerUrl ? "Try Direct URL" : "Try Embed URL"}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => window.open(lookerUrl, "_blank")}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open in Looker Studio
                </Button>
              </div>
            </CardHeader>

            {/* Embedding instructions banner */}
            <div className="mx-6 mb-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800 dark:text-amber-300">
                  <p className="font-medium mb-1">If the dashboard shows "Can't access report":</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-xs text-amber-700 dark:text-amber-400">
                    <li>Open the report in Google Looker Studio (button above)</li>
                    <li>Go to <strong>File → Share → Embed report</strong></li>
                    <li>Toggle <strong>"Enable embedding"</strong> on</li>
                    <li>Also ensure the report sharing is set to <strong>"Anyone with the link can view"</strong></li>
                    <li>Reload this page (or click "Try Direct URL" above)</li>
                  </ol>
                </div>
              </div>
            </div>

            <CardContent className="p-0">
              <div className="relative w-full" style={{ paddingBottom: "56.25%", minHeight: "600px" }}>
                <iframe
                  src={resolvedLookerUrl || getLookerDisplayUrl(lookerUrl, useEmbedLookerUrl)}
                  key={`${resolvedLookerUrl || lookerUrl}-${useEmbedLookerUrl ? "embed" : "raw"}`}
                  className="absolute inset-0 w-full h-full border-0 rounded-b-lg"
                  allowFullScreen
                  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-storage-access-by-user-activation"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allow="fullscreen"
                  onError={() => {
                    if (useEmbedLookerUrl) {
                      setUseEmbedLookerUrl(false);
                      toast.warning("Switched to direct Looker URL for compatibility.");
                    }
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
