import React, { Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { PublicShare } from "@/lib/dashboardShare";

const IRFDashboard = React.lazy(() => import("@/components/IRF/IRFDashboard"));
const MdaDashboardView = React.lazy(() => import("@/components/MdaChecklist/MdaDashboardView"));
const SarmaanLearningDashboard = React.lazy(() => import("@/components/Sarmaan/SarmaanLearningDashboard"));
const SarmaanAcsmDashboard = React.lazy(() => import("@/components/Sarmaan/SarmaanAcsmDashboard"));

const Fallback = () => (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

function snapshotForm(share: PublicShare) {
  const snap = (share.form_snapshot as any) ?? {};
  return {
    id: (share.form_id as string) ?? snap.id ?? "",
    name: (share.form_name as string) ?? snap.name ?? share.label ?? "Dashboard",
    questions: snap.questions ?? snap.groups ?? [],
    groups: snap.groups ?? [],
    settings: snap.settings ?? {},
    project_id: share.project_id ?? null,
    status: snap.status ?? "published",
  };
}

const noop = () => {};

export default function SharedDashboardRenderer({ share }: { share: PublicShare }) {
  const { dashboard_id, project_id } = share;

  const content = (() => {
    switch (dashboard_id) {
      case "sairf":
        return <IRFDashboard projectId={project_id ?? undefined} onClose={noop} />;
      case "mda_supervisory":
        return <MdaDashboardView form={snapshotForm(share)} onClose={noop} embedded />;
      case "sarmaan_supervisory":
        return <SarmaanLearningDashboard form={snapshotForm(share)} onClose={noop} />;
      case "sarmaan_acsm":
        return <SarmaanAcsmDashboard form={snapshotForm(share)} onClose={noop} />;
      default:
        return (
          <div className="p-8 text-center text-muted-foreground">
            This dashboard type is not available for sharing.
          </div>
        );
    }
  })();

  return <Suspense fallback={<Fallback />}>{content}</Suspense>;
}
