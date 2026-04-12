import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Construction, CarFront, Ban } from "lucide-react";
import type { TrafficIncident } from "./types";

interface Props {
  incidents: TrafficIncident[];
}

const typeIcon: Record<string, React.ReactNode> = {
  congestion: <CarFront className="h-4 w-4 text-yellow-500" />,
  closure: <Ban className="h-4 w-4 text-red-500" />,
  accident: <AlertTriangle className="h-4 w-4 text-orange-500" />,
  construction: <Construction className="h-4 w-4 text-blue-500" />,
};

const severityVariant: Record<string, "default" | "secondary" | "destructive"> = {
  low: "secondary",
  moderate: "default",
  high: "destructive",
};

const TrafficPanel = ({ incidents }: Props) => {
  if (incidents.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary" />Traffic Alerts
          <Badge variant="secondary" className="ml-auto">{incidents.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-32">
          <div className="space-y-2 pr-2">
            {incidents.map(inc => (
              <div key={inc.id} className="flex items-start gap-2 text-xs">
                {typeIcon[inc.type] || <AlertTriangle className="h-4 w-4" />}
                <div className="flex-1">
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{inc.title}</span>
                    <Badge variant={severityVariant[inc.severity]} className="text-[10px] px-1 py-0">{inc.severity}</Badge>
                  </div>
                  <p className="text-muted-foreground">{inc.description}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default TrafficPanel;
