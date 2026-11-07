import { lazy, memo, Suspense, useState } from "react";
import { ChevronDown, Globe2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { IntelEntry } from "@/lib/microplanning/osiris";
const SatelliteMap = lazy(() => import("./OsirisSatelliteMap"));
function OsirisPlanningAnalysis({ entries, demo, projectName }: { entries: IntelEntry[]; demo: boolean; projectName?: string }) {
  const [open,setOpen]=useState(false);
  return <section className="py-3" aria-label="OSIRIS satellite planning intelligence"><Collapsible open={open} onOpenChange={setOpen}>
    <CollapsibleTrigger asChild><Button variant="outline" className="h-auto min-h-14 w-full justify-start gap-3 px-3 py-3 text-left"><Globe2 className="h-5 w-5 shrink-0 text-primary"/><span className="flex-1 whitespace-normal font-semibold">OSIRIS · 3D satellite planning intelligence</span><Badge variant="secondary" className="hidden sm:inline-flex">Live public context</Badge><ChevronDown className={`h-4 w-4 shrink-0 ${open?"rotate-180":""}`}/></Button></CollapsibleTrigger>
    <CollapsibleContent>{open && (demo || !entries.length ? <p className="py-6 text-sm text-muted-foreground">No real microplanning records in this scope. Demonstration locations are not sent to this analysis.</p> : <Suspense fallback={<div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/>Opening satellite workspace…</div>}><SatelliteMap entries={entries} projectName={projectName}/></Suspense>)}</CollapsibleContent>
  </Collapsible></section>;
}
export default memo(OsirisPlanningAnalysis);