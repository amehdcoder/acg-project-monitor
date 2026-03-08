import { useState, useMemo } from "react";
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
} from "@/components/DataAnalytics";

const DataView = () => {
  const [filters, setFilters] = useState<AnalyticsFilters>({});
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [selectedFormId, setSelectedFormId] = useState<string | undefined>();

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

  // Show project/form selector if not fully selected
  if (!selectedProjectId || !selectedFormId) {
    return (
      <div className="space-y-6 p-4 lg:p-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground lg:text-3xl">
            Data & Analytics
          </h1>
          <p className="text-muted-foreground">
            Select a project and form to view analytics
          </p>
        </div>

        {/* Cross-project Registration vs Follow-Up Trends */}
        <RegistrationVsFollowUpChart />

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
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground lg:text-3xl">
              {selectedForm?.name || "Data & Analytics"}
            </h1>
            <p className="text-muted-foreground">
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

      {/* KPI Cards */}
      <AnalyticsKPICards kpis={kpis} loading={loading} />

      {/* Data Visualizations */}
      <DataVisualizations
        submissions={submissions}
        selectedForm={selectedForm}
        loading={loading}
      />

      {/* Submissions Table */}
      <SubmissionsTable submissions={submissions} loading={loading} />

      {/* AI Data Quality & Reports */}
      {selectedFormId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DataQualityPanel formId={selectedFormId} formName={selectedForm?.name || ""} />
          <ReportGenerator formId={selectedFormId} formName={selectedForm?.name || ""} />
        </div>
      )}

      {/* Form & Location Charts */}
      <SubmissionCharts
        formAnalytics={formAnalytics}
        locationAnalytics={locationAnalytics}
        loading={loading}
      />

      {/* Text Analysis */}
      <TextAnalysis
        submissions={submissions}
        selectedForm={selectedForm}
        loading={loading}
      />
    </div>
  );
};

export default DataView;
