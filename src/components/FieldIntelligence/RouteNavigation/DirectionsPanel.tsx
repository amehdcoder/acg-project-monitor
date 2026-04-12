import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Navigation, Play, Square, ArrowRight, ArrowLeft, CornerDownRight, Milestone } from "lucide-react";
import type { TurnDirection } from "./types";

interface Props {
  directions: TurnDirection[];
  activeStep: number;
  onStepClick: (step: number) => void;
  onStart: () => void;
  onStop: () => void;
  isNavigating: boolean;
}

const maneuverIcon = (m: string) => {
  switch (m) {
    case "turn-right": return <CornerDownRight className="h-4 w-4 rotate-[-90deg]" />;
    case "turn-left": return <ArrowLeft className="h-4 w-4" />;
    default: return <ArrowRight className="h-4 w-4" />;
  }
};

const DirectionsPanel = ({ directions, activeStep, onStepClick, onStart, onStop, isNavigating }: Props) => {
  if (directions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Navigation className="h-4 w-4 text-primary" />
          Turn-by-Turn
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2">
          {!isNavigating ? (
            <Button onClick={onStart} size="sm" className="w-full gap-1">
              <Play className="h-3 w-3" /> Start Navigation
            </Button>
          ) : (
            <Button onClick={onStop} size="sm" variant="destructive" className="w-full gap-1">
              <Square className="h-3 w-3" /> Stop
            </Button>
          )}
        </div>
        <ScrollArea className="h-48">
          <div className="space-y-1 pr-2">
            {directions.map((d, i) => (
              <button
                key={d.step}
                onClick={() => onStepClick(i)}
                className={`w-full text-left flex items-start gap-2 p-2 rounded-md text-xs transition-colors ${
                  i === activeStep
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-muted"
                }`}
              >
                <div className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                  i === activeStep ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {i === directions.length - 1 ? <Milestone className="h-3 w-3" /> : maneuverIcon(d.maneuver)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`${i === activeStep ? "font-semibold" : ""} truncate`}>{d.instruction}</p>
                  <div className="flex gap-2 text-muted-foreground mt-0.5">
                    <span>{d.distance}</span>
                    <span>•</span>
                    <span>{d.duration}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default DirectionsPanel;
