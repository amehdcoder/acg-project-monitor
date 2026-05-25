import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, UserPlus, Users } from "lucide-react";
import { Participant } from "./types";
import { format } from "date-fns";

interface Props {
  participants: Participant[];
  onAdd: () => void;
}

export default function ParticipantsView({ participants, onAdd }: Props) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() =>
    participants.filter(p =>
      !q.trim() ||
      p.full_name.toLowerCase().includes(q.toLowerCase()) ||
      p.participant_code.toLowerCase().includes(q.toLowerCase()) ||
      (p.organization || "").toLowerCase().includes(q.toLowerCase())
    ), [participants, q]);

  return (
    <Card className="border border-border/60 shadow-sm">
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Participants Registry
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{participants.length} registered</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, ID, org…" className="pl-9 h-9" />
          </div>
          <Button onClick={onAdd} className="bg-blue-600 hover:bg-blue-700 h-9">
            <UserPlus className="h-4 w-4 mr-1.5" /> Register
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b border-border/60">
              {["PID", "Name", "Sex", "Role", "Organization", "State / LGA", "Registered"].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-10 text-center text-muted-foreground text-sm">No participants yet.</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 text-xs font-mono">{p.participant_code}</td>
                <td className="px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    {p.photo_url
                      ? <img src={p.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                      : <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">{p.full_name.charAt(0)}</div>}
                    <span className="font-medium">{p.full_name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-xs">{p.sex || "—"}</td>
                <td className="px-3 py-2 text-xs">{p.role || "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{p.organization || "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{[p.state, p.lga].filter(Boolean).join(" / ") || "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{format(new Date(p.created_at), "dd MMM yyyy")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
