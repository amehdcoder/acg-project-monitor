import { FormGroup } from "@/components/FormBuilder/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Repeat, Layers, ArrowUpRight } from "lucide-react";
import { getFollowUpIcon } from "./followUpIcons";

interface FollowUpModulesProps {
  groups: FormGroup[];
  caseTypeLabel?: string;
}

/**
 * Presents the follow-up question groups of a case-management registration form
 * as a beautiful, artistic catalogue. These modules are NOT filled during
 * registration — they are completed later as longitudinal follow-up visits
 * (CommCare-style). Each module gets a contextually appropriate dynamic icon.
 */
const FollowUpModules = ({ groups, caseTypeLabel }: FollowUpModulesProps) => {
  if (!groups || groups.length === 0) return null;

  return (
    <Card className="relative overflow-hidden border-0 shadow-card">
      {/* Artistic backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-foreground">
              Follow-up Modules
            </h3>
            <p className="text-sm text-muted-foreground">
              These visits become available after this {caseTypeLabel || "case"} is
              registered. Complete them later from the case record.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {groups.map((group, idx) => {
            const Icon = getFollowUpIcon(group.label, group.name);
            const count = group.questions?.length ?? 0;
            return (
              <div
                key={group.id}
                className="group relative flex items-start gap-3 overflow-hidden rounded-xl border border-border/60 bg-card/70 p-4 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-soft"
              >
                <span className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-primary to-accent opacity-70" />
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4
                      className="truncate font-medium text-foreground"
                      dangerouslySetInnerHTML={{ __html: group.label || group.name || `Module ${idx + 1}` }}
                    />
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {count} question{count !== 1 ? "s" : ""}
                    </Badge>
                    {group.repeat && (
                      <Badge variant="outline" className="gap-1 text-[10px] font-normal text-primary">
                        <Repeat className="h-3 w-3" />
                        Repeatable
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};

export default FollowUpModules;
