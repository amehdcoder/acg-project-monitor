import { useState, useMemo, useRef, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
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
import { MdaSupervisoryMap } from "@/components/MdaChecklist";

const DataView = () => {
  const browserRef = useRef<ProjectSubmissionsBrowserHandle>(null);
  const [filters, setFilters] = useState<AnalyticsFilters>({});
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [selectedFormId, setSelectedFormId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState("submissions");

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
