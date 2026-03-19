import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SecurityPosture } from "@/hooks/useContinuousAuth";

interface AuthConfidenceMeterProps {
  posture: SecurityPosture;
}

const AuthConfidenceMeter = ({ posture }: AuthConfidenceMeterProps) => {
  const { confidenceScore, typingRhythmMatch, touchPressureMatch, swipeSpeedMatch, isLocked } = posture;

  const getColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 50) return "text-amber-500";
    return "text-destructive";
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 50) return "bg-amber-500";
    return "bg-destructive";
  };

  const Icon = isLocked ? ShieldAlert : confidenceScore >= 80 ? ShieldCheck : Shield;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-help">
            <Icon className={`h-4 w-4 ${isLocked ? "text-destructive" : getColor(confidenceScore)}`} />
            <div className="flex items-center gap-1">
              <div className="w-12 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getProgressColor(confidenceScore)}`}
                  style={{ width: `${confidenceScore}%` }}
                />
              </div>
              <span className={`text-[10px] font-mono font-medium ${getColor(confidenceScore)}`}>
                {confidenceScore}%
              </span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="w-56 p-3">
          <p className="text-xs font-semibold mb-2">Behavioral Auth Score</p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Typing Rhythm</span>
              <span className={`font-medium ${getColor(typingRhythmMatch)}`}>{typingRhythmMatch}%</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Touch Pressure</span>
              <span className={`font-medium ${getColor(touchPressureMatch)}`}>{touchPressureMatch}%</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Swipe Speed</span>
              <span className={`font-medium ${getColor(swipeSpeedMatch)}`}>{swipeSpeedMatch}%</span>
            </div>
          </div>
          {isLocked && (
            <p className="text-[10px] text-destructive mt-2 font-medium">⚠ Session locked — re-auth required</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default AuthConfidenceMeter;
