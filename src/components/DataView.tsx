import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useDataAnalytics, type AnalyticsFilters } from "@/hooks/useDataAnalytics";
import { buildLabelMap } from "@/lib/formLabelUtils";
import {
  AnalyticsKPICards,
  AnalyticsFilters as FilterBar,
  SubmissionsTable,
  SubmissionCharts,
  ProjectFormSelector,
  DataVisualizations,
  TextAnalysis,
  RegistrationVsFollowUpChart,
  DataQualityPanel,
  ReportGenerator,
  CrossTabulation,
  ScheduledReports,
} from "@/components/DataAnalytics";
import ProjectSubmissionsBrowser, {
  type ProjectSubmissionsBrowserHandle,
} from "@/components/DataAnalytics/ProjectSubmissionsBrowser";
import PullToRefresh from "@/components/PullToRefresh";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MdaSupervisoryMap, SupervisoryGapAnalysisDashboard, MdaAdaptiveDashboard, MdaSupervisoryChecklistDashboard } from "@/components/MdaChecklist";
import FormDataKnowledgeGraph from "@/components/KnowledgeGraph/FormDataKnowledgeGraph";
import { useAuth } from "@/hooks/useAuth";
import { generateMdaSimulation } from "@/lib/mda/simulation";
import { Switch } from "@/components/ui/switch";
import { FlaskConical, AlertTriangle } from "lucide-react";

const DataView = () => {
  const browserRef = useRef<ProjectSubmissionsBrowserHandle>(null);
  const { isOwner } = useAuth();
  const [filters, setFilters] = useState<AnalyticsFilters>({});
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [selectedFormId, setSelectedFormId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState("submissions");
  const [mdaSimulate, setMdaSimulate] = useState(false);

  const handlePullRefresh = useCallback(async () => {
    await browserRef.current?.refresh();
  }, []);

  const {
    loading,
    projects,
    forms,
    submissions,
    kpis,
    formAnalytics,
    locationAnalytics,
    availableStates,
    refresh,
  } = useDataAnalytics({ ...filters, projectId: selectedProjectId, formId: selectedFormId });

  const selectedForm = formAnalytics.find((f) => f.id === selectedFormId) || null;
  const isMdaChecklist = Boolean((selectedForm as any)?.settings?.isMdaChecklist);

  // Reset simulation whenever the form changes so it never lingers.
  useEffect(() => { setMdaSimulate(false); }, [selectedFormId]);

  // Real submissions mapped to the MDA dashboard shape. NEVER mutated.
  const realMdaSubs = useMemo(
    () =>
      submissions.map((s: any) => {
        let lat: number | undefined;
        let lng: number | undefined;
        const m = typeof s.location === "string" ? s.location.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/) : null;
        if (m) { lat = parseFloat(m[1]); lng = parseFloat(m[2]); }
        const d = s.data || {};
        const lga = d.lga || d.LGA || d.local_government || d.local_government_area || null;
        const ward = d.ward || d.Ward || d.ward_name || null;
        return {
          id: s.id,
          projectId: (selectedForm as any)?.project_id ?? selectedProjectId ?? null,
          state: s.state,
          lga,
          ward,
          submitter: s.submitter_name,
          submittedAt: s.submitted_at,
          status: s.status,
          location: lat != null && lng != null ? { latitude: lat, longitude: lng } : null,
          data: d,
        };
      }),
    [submissions, selectedForm, selectedProjectId],
  );

  // Owner-only synthetic submissions — generated purely in memory, never saved.
  const simulatedMdaSubs = useMemo(() => {
    if (!mdaSimulate || !isMdaChecklist) return [];
    const restrictState = /jigawa/i.test(selectedForm?.name || "") ? "Jigawa" : null;
    return generateMdaSimulation(((selectedForm as any)?.questions ?? []) as any, {
      projectId: (selectedForm as any)?.project_id ?? selectedProjectId ?? null,
      restrictState,
    });
  }, [mdaSimulate, isMdaChecklist, selectedForm, selectedProjectId]);

  // What the dashboards render: simulation when toggled, otherwise real data.
  const mdaSubs = mdaSimulate ? (simulatedMdaSubs as any[]) : realMdaSubs;

  // Live updates: refresh analytics whenever submissions change for the open form.
  useEffect(() => {
    if (!selectedFormId) return;
    const channel = supabase
      .channel(`dataview-submissions-${selectedFormId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "form_submissions", filter: `form_id=eq.${selectedFormId}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selectedFormId, refresh]);



  const handleBack = () => {
    if (selectedFormId) {
      setSelectedFormId(undefined);
    } else {
      setSelectedProjectId(undefined);
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 lg:p-6 max-w-full overflow-x-hidden">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground lg:text-3xl">
          Data & Analytics
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Browse submissions by project and form
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Tab 1: Hierarchical Project → Form → Table browser */}
        <TabsContent value="submissions" className="mt-0">
          <PullToRefresh onRefresh={handlePullRefresh} className="pt-4">
            <ProjectSubmissionsBrowser ref={browserRef} />
          </PullToRefresh>
        </TabsContent>

        {/* Tab 2: Original analytics with project/form selection */}
        <TabsContent value="analytics" className="mt-4 space-y-6">
          {/* Knowledge graph of collected form data */}
          <FormDataKnowledgeGraph
            projectId={selectedProjectId}
            formId={selectedFormId}
            title="Form Data Knowledge Graph"
            description="How projects, forms, locations and contributors connect across collected data"
          />

          {/* Cross-project chart */}
          <RegistrationVsFollowUpChart />

          {!selectedProjectId || !selectedFormId ? (
            <ProjectFormSelector
              projects={projects}
              forms={forms}
              selectedProjectId={selectedProjectId}
              selectedFormId={selectedFormId}
              onSelectProject={setSelectedProjectId}
              onSelectForm={setSelectedFormId}
              onBack={handleBack}
              loading={loading}
            />
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" onClick={handleBack}>
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <div>
                    <h2 className="font-display text-xl font-bold text-foreground">
                      {selectedForm?.name || "Analytics"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      View and analyze your collected data
                    </p>
                  </div>
                </div>
                <FilterBar
                  projects={projects}
                  forms={forms}
                  availableStates={availableStates}
                  filters={filters}
                  onFilterChange={setFilters}
                  onRefresh={refresh}
                  submissions={submissions}
                  loading={loading}
                />
              </div>

              <AnalyticsKPICards kpis={kpis} loading={loading} />
              {isMdaChecklist && (
                <>
                  {isOwner && (
                    <div className="flex flex-col gap-2 rounded-xl border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-2">
                        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <div>
                          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Owner simulation mode</p>
                          <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                            Preview the dashboards with synthetic submissions. This data is generated in your browser only — it is never saved and never touches real submissions.
                          </p>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                        {mdaSimulate ? "Simulating" : "Live data"}
                        <Switch checked={mdaSimulate} onCheckedChange={setMdaSimulate} aria-label="Toggle simulation mode" />
                      </label>
                    </div>
                  )}
                  {mdaSimulate && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-900/40 dark:text-amber-100">
                      <AlertTriangle className="h-4 w-4" />
                      SIMULATION MODE — dashboards below show synthetic data ({simulatedMdaSubs.length} records). Nothing is saved.
                    </div>
                  )}
                  <MdaSupervisoryChecklistDashboard
                    submissions={mdaSubs as any}
                    questions={((selectedForm as any)?.questions ?? []) as any}
                    formName={selectedForm?.name}
                  />
                  <MdaAdaptiveDashboard
                    submissions={mdaSubs as any}
                    questions={((selectedForm as any)?.questions ?? []) as any}
                    formName={selectedForm?.name}
                    formId={selectedFormId}
                    projectId={(selectedForm as any)?.project_id ?? selectedProjectId}
                    projects={projects}
                  />
                  <SupervisoryGapAnalysisDashboard
                    submissions={mdaSubs as any}
                    questions={((selectedForm as any)?.questions ?? []) as any}
                    formName={selectedForm?.name}
                  />
                  <MdaSupervisoryMap
                    submissions={mdaSubs as any}
                    formName={selectedForm?.name}
                  />
                </>
              )}
              <DataVisualizations submissions={submissions} selectedForm={selectedForm} loading={loading} />
              <SubmissionsTable
                submissions={submissions}
                loading={loading}
                questionLabels={selectedForm?.questions ? buildLabelMap(selectedForm.questions) : undefined}
              />

              {selectedFormId && (
                <>
                  {/* Cross-Tabulation */}
                  <CrossTabulation
                    submissions={submissions}
                    questions={selectedForm?.questions || []}
                    formName={selectedForm?.name || ""}
                  />

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <DataQualityPanel formId={selectedFormId} formName={selectedForm?.name || ""} />
                    <ReportGenerator formId={selectedFormId} formName={selectedForm?.name || ""} />
                  </div>

                  {/* Scheduled Reports */}
                  <ScheduledReports formId={selectedFormId} formName={selectedForm?.name || ""} />
                </>
              )}

              <SubmissionCharts formAnalytics={formAnalytics} locationAnalytics={locationAnalytics} loading={loading} />
              <TextAnalysis submissions={submissions} selectedForm={selectedForm} loading={loading} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DataView;
