import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Settings2, CloudOff, RefreshCw, Layers, Users, Building2, ShieldAlert,
  LayoutGrid, CalendarClock, Hospital, Route, ShieldCheck, Home, Network, Activity,
  Search, Briefcase,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MODULE_TEMPLATES, normalizeConfig } from "@/lib/programmeModule/defaults";
import { bindQueueAutoFlush, flushQueue, queueCount } from "@/lib/programmeModule/offlineQueue";
import type { BeneficiaryRow, ProgrammeModuleRow } from "@/lib/programmeModule/types";
import { useBeneficiaries, useProgrammeModules } from "./useProgrammeModule";
import BeneficiaryList from "./BeneficiaryList";
import BeneficiaryRecord from "./BeneficiaryRecord";
import BeneficiaryFormDialog from "./BeneficiaryFormDialog";
import ProjectTeamPanel from "./ProjectTeamPanel";
import { useMyTeamPermissions } from "@/lib/programmeModule/projectTeam";
import ModuleConfigurator from "./ModuleConfigurator";
import ModuleProjectsDialog from "./ModuleProjectsDialog";
import FacilityFocalPersons from "./FacilityFocalPersons";
import FacilityRegistry from "./FacilityRegistry";
import FacilityDashboard from "./FacilityDashboard";
import FollowUpsPanel from "./FollowUpsPanel";
import DeleteRequestsPanel from "./DeleteRequestsPanel";
import JourneyDashboard from "./JourneyDashboard";
import SafeguardingPanel from "./SafeguardingPanel";
import SafeguardingDashboard from "./SafeguardingDashboard";
import SafeguardingOfficers from "./SafeguardingOfficers";
import HouseholdsPanel from "./HouseholdsPanel";
import KinshipGraphPanel from "./KinshipGraphPanel";
import LtfuRiskPanel from "./LtfuRiskPanel";
import ClusterDashboard from "./ClusterDashboard";
import CddCaseSearchPanel from "./CddCaseSearchPanel";
import LivelihoodPanel from "./LivelihoodPanel";
import { useIsSafeguardingOfficer } from "@/lib/programmeModule/safeguarding";
import { useMyFacilityAccess } from "@/lib/programmeModule/facilities";


interface Props {
  projectId?: string;
  /** Only administrators may add or configure modules. */
  canConfigure?: boolean;
  isOwner?: boolean;
  /** Super Admin: may add the records to, or remove them from, any project. */
  isSuperAdmin?: boolean;
}

/**
 * Longitudinal Beneficiary Record workspace.
 *
 * One reusable, fully configurable case/beneficiary management system that can
 * be added to any project with the "+" button. Everything on screen — the
 * programme components, sections, questions, workflow, layout, branding and
 * Case ID format — comes from `programme_modules.config`, never from this code.
 */
const ProgrammeModuleWorkspace = ({
  projectId, canConfigure = false, isOwner = false, isSuperAdmin = false,
}: Props) => {
  const { toast } = useToast();
  const { modules, loading, reload } = useProgrammeModules(projectId);
  const [activeId, setActiveId] = useState<string>("");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [focalOpen, setFocalOpen] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);
  const { levels: facilityLevels } = useMyFacilityAccess();
  const [focalFacilityId, setFocalFacilityId] = useState<string | undefined>(undefined);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selected, setSelected] = useState<BeneficiaryRow | null>(null);
  /** Record created from a confirmed case-search case, awaiting full details. */
  const [completing, setCompleting] = useState<BeneficiaryRow | null>(null);
  const [pending, setPending] = useState(queueCount());
  const [creating, setCreating] = useState(false);
  const [deleteRequestsOpen, setDeleteRequestsOpen] = useState(false);
  const [officersOpen, setOfficersOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const { isOfficer, reload: reloadOfficerAccess } = useIsSafeguardingOfficer(projectId);
  const [view, setView] = useState<
    | "records" | "journey" | "facility" | "followups" | "households" | "clusters" | "network"
    | "risk" | "casesearch" | "livelihood" | "safeguarding" | "safeguarding_dashboard" | "team"
  >("records");

  // What this person is allowed to see and do, from the project team register.
  // People who are not listed keep the access they already had.
  const { can, listed: onTeamRegister } = useMyTeamPermissions(projectId, canConfigure);


  const active: ProgrammeModuleRow | undefined = useMemo(
    () => modules.find((m) => m.id === activeId) || modules[0],
    [modules, activeId],
  );

  const {
    beneficiaries, loading: loadingBeneficiaries, reload: reloadBeneficiaries,
    upsert: upsertBeneficiary,
  } = useBeneficiaries(active?.id);

  /**
   * A facility focal person is a non-administrator who has been granted access
   * to one or more registered health facilities. They only work with the
   * records — and programme components — of those facilities. Everyone else
   * keeps the full view.
   */
  const isFocalPerson = !canConfigure && Object.keys(facilityLevels).length > 0;

  const scopedBeneficiaries = useMemo(() => {
    if (!isFocalPerson) return beneficiaries;
    return beneficiaries.filter((b) =>
      Boolean(facilityLevels[(b as unknown as { facility_id?: string }).facility_id || ""]));
  }, [beneficiaries, facilityLevels, isFocalPerson]);

  useEffect(() => {
    bindQueueAutoFlush();
    const onQueue = () => setPending(queueCount());
    window.addEventListener("programme-module-queue", onQueue);
    return () => window.removeEventListener("programme-module-queue", onQueue);
  }, []);

  const createModule = async (templateKey: string) => {
    if (!projectId) return;
    const template = MODULE_TEMPLATES.find((t) => t.key === templateKey);
    if (!template) return;
    setCreating(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("programme_modules")
        .insert({
          project_id: projectId,
          name: template.name,
          description: template.description,
          config: template.config as unknown as Record<string, unknown>,
          created_by: auth.user?.id,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      toast({ title: "Programme module added", description: template.name });
      setGalleryOpen(false);
      await reload();
      setActiveId((data as { id: string }).id);
    } catch (e) {
      toast({ title: "Could not add module", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const sync = async () => {
    const { sent, failed } = await flushQueue();
    setPending(queueCount());
    void reloadBeneficiaries();
    toast({
      title: failed ? "Some records could not be sent" : "Sync complete",
      description: `${sent} sent${failed ? `, ${failed} still queued` : ""}`,
      variant: failed ? "destructive" : undefined,
    });
  };

  if (!projectId) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Select a project to open its longitudinal beneficiary records.
      </Card>
    );
  }

  if (selected && active) {
    const selectedFacility = (selected as unknown as { facility_id?: string }).facility_id || "";
    return (
      <BeneficiaryRecord
        beneficiary={selected}
        config={normalizeConfig(active.config)}
        moduleId={active.id}
        projectId={projectId}
        onBack={() => setSelected(null)}
        canManage={canConfigure || facilityLevels[selectedFacility] === "manage"}
        componentsVisible={!isFocalPerson || Boolean(facilityLevels[selectedFacility])}
        onChanged={() => void reloadBeneficiaries()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Layers className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-semibold text-foreground">Longitudinal Beneficiary Records</h2>
        {modules.length > 0 && (
          <Select value={active?.id || ""} onValueChange={setActiveId}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select module" /></SelectTrigger>
            <SelectContent className="z-[1200] bg-popover">
              {modules.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="flex-1" />
        {pending > 0 && (
          <Button variant="outline" size="sm" className="gap-1" onClick={sync}>
            <CloudOff className="h-4 w-4" /> {pending} queued — sync now
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => void reload()} aria-label="Reload modules">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setRegistryOpen(true)}>
          <Building2 className="h-4 w-4" /> Health facilities
        </Button>
        {canConfigure && (
          <Button
            variant="outline" size="sm" className="gap-1"
            onClick={() => { setFocalFacilityId(undefined); setFocalOpen(true); }}
          >
            <Users className="h-4 w-4" /> Facility teams
          </Button>
        )}
        {canConfigure && active && (
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setConfigOpen(true)}>
            <Settings2 className="h-4 w-4" /> Configure
          </Button>
        )}
        {isSuperAdmin && (
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setProjectsOpen(true)}>
            <Layers className="h-4 w-4" /> Records on projects
          </Button>
        )}
        {canConfigure && (
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setDeleteRequestsOpen(true)}>
            <ShieldAlert className="h-4 w-4" /> Deletion requests
          </Button>
        )}
        {canConfigure && (
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setOfficersOpen(true)}>
            <ShieldCheck className="h-4 w-4" /> Safeguarding officers
          </Button>
        )}
        {canConfigure && (
          <Button size="sm" className="gap-1" onClick={() => setGalleryOpen(true)} aria-label="Add programme module">
            <Plus className="h-4 w-4" /> Add module
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          { key: "records", label: "Beneficiary records", icon: LayoutGrid, show: can("view_records") },
          { key: "journey", label: "Beneficiary journey", icon: Route, show: can("view_dashboards") },
          { key: "facility", label: "Facility dashboard", icon: Hospital, show: can("view_dashboards") },
          { key: "followups", label: "Follow-ups & referrals", icon: CalendarClock, show: can("view_records") },
          { key: "households", label: "Households & MDA", icon: Home, show: can("manage_households") || can("view_dashboards") },
          { key: "clusters", label: "Community clusters", icon: Layers, show: can("view_dashboards") },
          { key: "network", label: "Transmission network", icon: Network, show: can("view_dashboards") },
          { key: "risk", label: "Follow-up risk & CHEW visits", icon: Activity, show: can("view_dashboards") },
          {
            key: "casesearch", label: "CDD case search (MMDP)", icon: Search,
            show: can("manage_cdds") || can("confirm_cases") || can("view_records"),
          },
          {
            key: "livelihood", label: "Livelihood & empowerment", icon: Briefcase,
            show: can("view_records") || can("view_dashboards"),
          },
          {
            key: "team", label: "Project team", icon: Users,
            show: canConfigure || can("manage_team") || onTeamRegister,
          },
          { key: "safeguarding", label: "Safeguarding", icon: ShieldCheck, show: isOfficer && can("view_safeguarding") },
          {
            key: "safeguarding_dashboard", label: "Safeguarding dashboard",
            icon: ShieldAlert, show: isOfficer && can("view_safeguarding"),
          },
        ] as const).filter((t) => t.show).map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={view === t.key ? "default" : "outline"}
            className="gap-1"
            onClick={() => setView(t.key)}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </Button>
        ))}
      </div>



      {!loading && modules.length === 0 && (
        <Card className="space-y-3 p-10 text-center">
          <p className="text-muted-foreground">
            No longitudinal record module on this project yet.
          </p>
          {canConfigure ? (
            <Button className="gap-1" onClick={() => setGalleryOpen(true)}>
              <Plus className="h-4 w-4" /> Add programme module
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Ask an administrator to add one.</p>
          )}
        </Card>
      )}

      {active && view === "records" && (
        <BeneficiaryList
          beneficiaries={scopedBeneficiaries}
          config={normalizeConfig(active.config)}
          loading={loadingBeneficiaries}
          projectId={projectId}
          onOpen={setSelected}
          onRegister={() => setRegisterOpen(true)}
          canRegister={can("edit_records")}
          onRefresh={() => void reloadBeneficiaries()}
        />
      )}

      {view === "team" && (
        <ProjectTeamPanel
          projectId={projectId}
          moduleId={active?.id}
          canManage={canConfigure || can("manage_team")}
        />
      )}

      {view === "journey" && (
        <JourneyDashboard
          projectId={projectId}
          moduleId={active?.id}
          config={active ? normalizeConfig(active.config) : undefined}
          allowedFacilityIds={isFocalPerson ? Object.keys(facilityLevels) : []}
          onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }}
        />
      )}

      {view === "facility" && (
        <FacilityDashboard
          projectId={projectId}
          canSeeAllFacilities={canConfigure}
          onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }}
        />
      )}

      {view === "followups" && (
        <FollowUpsPanel
          projectId={projectId}
          onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }}
        />
      )}

      {view === "households" && (
        <HouseholdsPanel
          projectId={projectId}
          moduleId={active?.id}
          beneficiaries={scopedBeneficiaries}
          canManage={canConfigure || Object.values(facilityLevels).includes("manage") || Object.values(facilityLevels).includes("record")}
          onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }}
          onChanged={() => void reloadBeneficiaries()}
        />
      )}

      {view === "clusters" && (
        <ClusterDashboard
          projectId={projectId}
          moduleId={active?.id}
          beneficiaries={scopedBeneficiaries}
          allowedFacilityIds={isFocalPerson ? Object.keys(facilityLevels) : null}
        />
      )}

      {view === "network" && (
        <KinshipGraphPanel
          projectId={projectId}
          moduleId={active?.id}
          beneficiaries={scopedBeneficiaries}
          onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }}
        />
      )}

      {view === "risk" && (
        <LtfuRiskPanel
          projectId={projectId}
          moduleId={active?.id}
          beneficiaries={scopedBeneficiaries}
          canDispatch={canConfigure || can("dispatch_visits")
            || (!onTeamRegister && Object.values(facilityLevels).some((l) => l !== "view"))}
          canReportVisits={canConfigure || can("home_visits")
            || (!onTeamRegister && Object.values(facilityLevels).some((l) => l !== "view"))}
          onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }}
        />
      )}

      {view === "casesearch" && (
        <CddCaseSearchPanel
          projectId={projectId}
          moduleId={active?.id}
          canRecord={canConfigure || can("manage_cdds")
            || (!onTeamRegister && Object.values(facilityLevels).some((l) => l !== "view"))}
          canConfirm={canConfigure || can("confirm_cases")}
          allowedFacilityIds={isFocalPerson ? Object.keys(facilityLevels) : null}
          onBeneficiaryRegistered={() => void reloadBeneficiaries()}
          onCompleteRecord={(row) => setCompleting(row)}
        />
      )}

      {view === "livelihood" && projectId && (
        <LivelihoodPanel
          projectId={projectId}
          moduleId={active?.id}
          beneficiaries={scopedBeneficiaries}
          canManage={canConfigure || can("manage_livelihood")}
          canAssess={canConfigure || can("assess_livelihood") || can("manage_livelihood")}
          canVerify={canConfigure || can("verify_livelihood") || can("manage_livelihood")}
          onOpenBeneficiary={(b) => { setSelected(b); setView("records"); }}
        />
      )}

      {view === "safeguarding" && (
        <SafeguardingPanel
          projectId={projectId}
          moduleId={active?.id}
          beneficiaries={scopedBeneficiaries}
          isOfficer={isOfficer}
        />
      )}

      {view === "safeguarding_dashboard" && (
        <SafeguardingDashboard
          projectId={projectId}
          isOfficer={isOfficer}
          allowedFacilityIds={isFocalPerson ? Object.keys(facilityLevels) : []}
        />
      )}

      <DeleteRequestsPanel
        open={deleteRequestsOpen}
        onOpenChange={setDeleteRequestsOpen}
        projectId={projectId}
        onDecided={() => void reloadBeneficiaries()}
      />

      <ModuleProjectsDialog
        open={projectsOpen}
        onOpenChange={setProjectsOpen}
        allowed={isSuperAdmin}
        onChanged={() => void reload()}
      />

      <SafeguardingOfficers
        open={officersOpen}
        onOpenChange={setOfficersOpen}
        projectId={projectId}
        isOwner={isOwner}
        onChanged={reloadOfficerAccess}
      />




      <FacilityFocalPersons
        open={focalOpen}
        onOpenChange={setFocalOpen}
        projectId={projectId}
        initialFacilityId={focalFacilityId}
      />
      <FacilityRegistry
        open={registryOpen}
        onOpenChange={setRegistryOpen}
        projectId={projectId}
        canManage={canConfigure}
        onManageTeam={(id) => { setFocalFacilityId(id); setFocalOpen(true); }}
      />

      {/* Template gallery */}
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add a programme module</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {MODULE_TEMPLATES.map((t) => (
              <Card key={t.key} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground">{t.name}</h3>
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                  <Badge variant="outline" className="mt-2">
                    {t.config.components.length} component{t.config.components.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <Button disabled={creating} onClick={() => createModule(t.key)}>Use template</Button>
              </Card>
            ))}
            <p className="text-xs text-muted-foreground">
              Every template is fully editable afterwards — components, sections, questions, validation,
              skip logic, workflow, Case ID format and branding.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {active && (
        <>
          <BeneficiaryFormDialog
            open={registerOpen} onOpenChange={setRegisterOpen}
            moduleId={active.id} projectId={projectId}
            config={normalizeConfig(active.config)}
            onSaved={(row) => {
              if (row) upsertBeneficiary(row);
              else void reloadBeneficiaries();
            }}
          />
          {completing && (
            <BeneficiaryFormDialog
              key={completing.id}
              open onOpenChange={(v) => { if (!v) setCompleting(null); }}
              moduleId={active.id} projectId={projectId}
              config={normalizeConfig(active.config)}
              existing={completing}
              title="Complete this beneficiary's record"
              notice={`${completing.full_name} now has a Case ID. What the CDD and clinician recorded has been carried over — finish the rest of the registration so this person's data matches every other beneficiary.`}
              onSaved={(row) => {
                setCompleting(null);
                if (row) upsertBeneficiary(row);
                else void reloadBeneficiaries();
              }}
            />
          )}
          <ModuleConfigurator
            open={configOpen} onOpenChange={setConfigOpen}
            moduleId={active.id} moduleName={active.name}
            config={normalizeConfig(active.config)}
            onSaved={() => void reload()}
          />
        </>
      )}
    </div>
  );
};

export default ProgrammeModuleWorkspace;
