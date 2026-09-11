// Next follow-up appointment captured with every service, so outcome tracking
// always has a scheduled next visit.

import { CalendarClock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface FollowUpValue {
  date: string;
  time: string;
  location: string;
}

export const emptyFollowUp = (): FollowUpValue => ({ date: "", time: "", location: "" });

const FollowUpFields = ({
  value, onChange, locationSuggestion,
}: {
  value: FollowUpValue;
  onChange: (v: FollowUpValue) => void;
  locationSuggestion?: string;
}) => (
  <div className="rounded-lg border border-border bg-muted/30 p-3">
    <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
      <CalendarClock className="h-4 w-4" /> Next follow-up
    </p>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Date</Label>
        <Input type="date" value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Time</Label>
        <Input type="time" value={value.time} onChange={(e) => onChange({ ...value, time: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Location</Label>
        <Input
          value={value.location}
          placeholder={locationSuggestion || "Facility, village or home visit"}
          onChange={(e) => onChange({ ...value, location: e.target.value })}
        />
      </div>
    </div>
  </div>
);

export default FollowUpFields;
