import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, ShieldCheck, Lock, Loader2, ClipboardList } from "lucide-react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { IrfWatermark } from "./IRFFormFiller";
import IRFCategoryFormFiller from "./IRFCategoryFormFiller";
import IrfAccessManager from "./IrfAccessManager";
import { IRF_CATEGORY_FORMS, type IrfCategoryForm } from "@/lib/irf/categoryForms";
import { IRF_FORM_NAME } from "@/lib/irf/definition";
import { useIrfFormAccess } from "@/hooks/useIrfFormAccess";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

/**
 * Entry point for the LGA ACSM Focal Person standalone activity forms. Each form
 * (Advocacy Supervision, Town Announcers, Compound Meeting, Community Dialogue)
 * is independently access-gated: a member only sees the forms they have been
 * granted. Owners / admins see every form plus an access manager.
 */
export default function IRFCategoryLauncher({ projectId, onClose }: Props) {
  const [active, setActive] = useState<IrfCategoryForm | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const { loading, isAdmin, canAccess, grants, reloadGrants } = useIrfFormAccess(projectId);

  const visibleForms = useMemo(
    () => IRF_CATEGORY_FORMS.filter((f) => isAdmin || canAccess(f.id)),
    [isAdmin, canAccess],
  );

  if (active) {
    return (
      <IRFCategoryFormFiller
        form={active}
        projectId={projectId}
        onBack={() => setActive(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="dark fixed inset-0 z-40 isolate flex h-[100dvh] min-h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <IrfWatermark />
      {/* Header */}
      <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 bg-gradient-to-r from-[#0c2340] to-[#1a4a6e] px-4 py-3 shadow-sm">
        <Button variant="ghost" size="icon" aria-label="Back to forms" onClick={onClose} className="text-white hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="min-w-0 flex-[1_1_220px]">
          <h1 className="whitespace-normal break-words text-sm font-bold leading-tight text-white sm:text-lg">{IRF_FORM_NAME}</h1>
          <p className="truncate text-xs text-white/70">Choose the activity you want to report on this visit.</p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}
            className="gap-1.5 border-white/30 bg-white/10 text-white hover:bg-white/20">
            <ShieldCheck className="h-4 w-4" /> <span className="hidden sm:inline">Manage access</span>
          </Button>
        )}
      </div>

      {/* Cards */}
      <div className="relative z-10 flex-1 overflow-y-auto overscroll-contain pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-white/70"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : visibleForms.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 px-6 py-20 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10"><Lock className="h-7 w-7 text-white/70" /></span>
            <h2 className="text-lg font-bold text-white">No forms assigned to you yet</h2>
            <p className="text-sm text-white/70">Your project Owner needs to grant you access to one or more activity forms. Please check back shortly.</p>
          </div>
        ) : (
          <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-6 sm:grid-cols-2 sm:px-6">
            {visibleForms.map((form) => {
              const Icon = (Icons as any)[form.icon] || ClipboardList;
              const granted = isAdmin || canAccess(form.id);
              return (
                <button
                  key={form.id}
                  type="button"
                  onClick={() => setActive(form)}
                  className="group flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-card/90 p-5 text-left shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  style={{ borderTopWidth: 3, borderTopColor: form.color }}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: `${form.color}1f` }}>
                    <Icon className="h-6 w-6" style={{ color: form.color }} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-foreground">{form.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{form.description}</p>
                  </div>
                  <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold" style={{ color: form.color }}>
                    Open form <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {isAdmin && (
        <IrfAccessManager
          open={manageOpen}
          onOpenChange={setManageOpen}
          projectId={projectId}
          grants={grants}
          onChanged={reloadGrants}
        />
      )}
    </div>
  );
}
