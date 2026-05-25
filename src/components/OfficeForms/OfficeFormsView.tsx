import { useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck, AlertTriangle, CalendarDays, Package, ChevronRight, FileText, Inbox, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OFFICE_FORMS, OfficeFormCode } from "./types";
import SrfForm from "./forms/SrfForm";
import IncidentForm from "./forms/IncidentForm";
import LeaveForm from "./forms/LeaveForm";
import StationeryForm from "./forms/StationeryForm";
import OfficeFormsList from "./OfficeFormsList";
import ApproverInbox from "./ApproverInbox";
import ApproverAssignments from "./ApproverAssignments";
import { fetchMyApproverRoles, type ApproverRole } from "./approvals";
import { useAuth } from "@/hooks/useAuth";

const ICONS: Record<string, any> = { ShieldCheck, AlertTriangle, CalendarDays, Package };

interface Props {
  projectId?: string | null;
  onClose: () => void;
  filterCodes?: OfficeFormCode[];
  title?: string;
}

export default function OfficeFormsView({ projectId, onClose, filterCodes, title }: Props) {
  const { user, isSuperAdmin } = useAuth();
  const [active, setActive] = useState<OfficeFormCode | null>(null);
  const [showList, setShowList] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [myRoles, setMyRoles] = useState<ApproverRole[]>([]);

  useEffect(() => {
    if (user?.id) fetchMyApproverRoles(user.id).then(setMyRoles);
  }, [user?.id]);

  const visibleForms = filterCodes ? OFFICE_FORMS.filter(f => filterCodes.includes(f.code)) : OFFICE_FORMS;

  if (active) {
    const common = { projectId, onBack: () => setActive(null) };
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
        <div className="bg-white border-b border-border/60 sticky top-0 z-30 px-3 sm:px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setActive(null)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <h1 className="text-base sm:text-lg font-bold truncate">{OFFICE_FORMS.find(f => f.code === active)?.title}</h1>
        </div>
        <div className="p-3 sm:p-6 max-w-4xl mx-auto">
          {active === "srf" && <SrfForm {...common} />}
          {active === "incident" && <IncidentForm {...common} />}
          {active === "leave" && <LeaveForm {...common} />}
          {active === "stationery" && <StationeryForm {...common} />}
        </div>
      </div>
    );
  }

  if (showList) return <OfficeFormsList onBack={() => setShowList(false)} />;
  if (showInbox) return <ApproverInbox roles={myRoles} onBack={() => setShowInbox(false)} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <div className="bg-white border-b border-border/60 sticky top-0 z-30 px-3 sm:px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-bold truncate">{title || "Office & Safeguarding Forms"}</h1>
        </div>
        {isSuperAdmin && (
          <Button variant="outline" size="sm" onClick={() => setShowAssign(true)}>
            <Users className="h-4 w-4 mr-1.5" /> Approvers
          </Button>
        )}
        {myRoles.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowInbox(true)}>
            <Inbox className="h-4 w-4 mr-1.5" /> Inbox
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setShowList(true)}>
          <FileText className="h-4 w-4 mr-1.5" /> My Submissions
        </Button>
      </div>

      <div className="p-3 sm:p-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {visibleForms.map(f => {
            const Icon = ICONS[f.icon];
            return (
              <button
                key={f.code}
                onClick={() => setActive(f.code)}
                className="text-left bg-white rounded-xl border border-border/60 hover:border-foreground/20 hover:shadow-md transition-all p-5 group"
              >
                <div className="flex items-start gap-3">
                  <div className={`h-12 w-12 rounded-lg flex items-center justify-center shrink-0 ${f.tintBg}`}>
                    <Icon className={`h-6 w-6 ${f.tintFg}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm sm:text-base text-foreground">{f.title}</h3>
                      <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${f.tintBg} ${f.tintFg}`}>{f.badge}</span>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">{f.subtitle}</p>
                    <div className="mt-3 flex items-center gap-1 text-xs font-medium" style={{ color: f.accent }}>
                      Start form <ChevronRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <ApproverAssignments open={showAssign} onOpenChange={setShowAssign} />
    </div>
  );
}
