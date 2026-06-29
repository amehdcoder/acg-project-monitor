import { useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { IrfWatermark } from "./IRFFormFiller";
import IRFCategoryFormFiller from "./IRFCategoryFormFiller";
import { IRF_CATEGORY_FORMS, type IrfCategoryForm } from "@/lib/irf/categoryForms";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

/**
 * Entry point for the LGA ACSM Focal Person activity forms. Presents the
 * category-based forms (Advocacy Supervision, Town Announcers Supervision,
 * Compound Meeting, Community Dialogue) and opens the chosen one for filling.
 */
export default function IRFCategoryLauncher({ projectId, onClose }: Props) {
  const [active, setActive] = useState<IrfCategoryForm | null>(null);

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
      <div className="relative z-20 flex shrink-0 items-center gap-3 border-b border-white/10 bg-gradient-to-r from-[#0c2340] to-[#1a4a6e] px-4 py-3 shadow-sm">
        <Button variant="ghost" size="icon" aria-label="Back to forms" onClick={onClose} className="text-white hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-white sm:text-lg">LGA ACSM Focal Person — Activity Forms</h1>
          <p className="truncate text-xs text-white/70">Choose the activity you want to report on this visit.</p>
        </div>
      </div>

      {/* Cards */}
      <div className="relative z-10 flex-1 overflow-y-auto overscroll-contain pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-6">
        <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-6 sm:grid-cols-2 sm:px-6">
          {IRF_CATEGORY_FORMS.map((form) => {
            const Icon = (Icons as any)[form.icon] || Icons.ClipboardList;
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
      </div>
    </div>
  );
}
