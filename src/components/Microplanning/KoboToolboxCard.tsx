import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Lock, Settings2 } from "lucide-react";
import KoboSyncStatusChip from "./KoboSyncStatusChip";

export default function KoboToolboxCard({ projectId, canUse, onOpen, onNewSuccess }: {
  projectId: string; canUse: boolean; onOpen: () => void; onNewSuccess?: () => void;
}) {
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="h-5 w-5 text-primary mt-0.5" strokeWidth={1.5} />
        <div>
          <h3 className="text-sm font-semibold text-foreground">KoboToolbox</h3>
          <p className="text-xs text-muted-foreground">Field submissions flow into microplanning in real time.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <KoboSyncStatusChip projectId={projectId || null} onNewSuccess={onNewSuccess} />
        <Button size="sm" variant="outline" disabled={!canUse} onClick={onOpen}>
          <Settings2 className="h-3.5 w-3.5 mr-1" /> Sync settings
        </Button>
      </div>
      {!canUse && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> Only Admins can manage KoboToolbox</p>}
    </Card>
  );
}
