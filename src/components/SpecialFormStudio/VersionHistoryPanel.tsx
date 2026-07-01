import { GitBranch, RotateCcw, UploadCloud, CheckCircle2, Clock, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import type { TemplateVersion } from "@/lib/specialStudio/versioning";

export default function VersionHistoryPanel({
  open,
  onOpenChange,
  versions,
  publishedVersion,
  onRestore,
  onRepublish,
  onPreview,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  versions: TemplateVersion[];
  publishedVersion: number | null;
  onRestore: (v: TemplateVersion) => void;
  onRepublish: (v: TemplateVersion) => void;
  onPreview: (v: TemplateVersion) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-indigo-500" /> Template versions
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-2 pr-2">
            {versions.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No versions yet. Publishing this template cuts version 1.
              </p>
            )}
            {versions.map((v) => {
              const isPublished = publishedVersion === v.v && v.status === "published";
              const secs = v.snapshot.sections?.reduce((n, s) => n + (s.questions?.length || 0), 0) || 0;
              return (
                <div
                  key={v.v}
                  className={`rounded-lg border p-3 ${isPublished ? "border-emerald-500/50 bg-emerald-500/5" : "border-border bg-card"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{v.label}</span>
                    {isPublished ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Live
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Archived
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" /> {new Date(v.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {secs} field{secs === 1 ? "" : "s"}
                    {v.createdByName ? ` • by ${v.createdByName}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => onPreview(v)}>
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => onRestore(v)}>
                      <RotateCcw className="h-3.5 w-3.5" /> Restore to editor
                    </Button>
                    {!isPublished && (
                      <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => onRepublish(v)}>
                        <UploadCloud className="h-3.5 w-3.5" /> Re-publish
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
