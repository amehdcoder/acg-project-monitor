import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, IdCard, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { HandCardDocument } from "@/components/ProgrammeModule/BeneficiaryCaseCard";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";

export default function HandCard() {
  const { beneficiaryId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["hand-card", beneficiaryId],
    enabled: Boolean(beneficiaryId),
    placeholderData: undefined,
    queryFn: async () => {
      if (!beneficiaryId) return null;
      const { data, error } = await supabase.from("beneficiaries").select("*").eq("id", beneficiaryId).maybeSingle();
      if (error) throw error;
      return data as unknown as BeneficiaryRow | null;
    },
  });
  return (
    <main className="h-dvh overflow-y-auto bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-4">
          <Button variant="outline" size="icon" aria-label="Back to Cases" title="Back to Cases" onClick={() => navigate("/cases")}><ArrowLeft className="h-5 w-5" /></Button>
          <IdCard className="h-6 w-6 text-primary" />
          <div className="min-w-0 flex-1"><h1 className="text-xl font-semibold">Beneficiary Hand Card</h1><p className="text-sm text-muted-foreground">Amehnities</p></div>
          {data && <Button variant="outline" className="gap-2" onClick={() => navigate(`/cases?case=${encodeURIComponent(data.case_id)}`)}><ClipboardList className="h-4 w-4" />Open record</Button>}
        </div>
      </header>
      <div className="mx-auto max-w-4xl space-y-4 px-3 py-6 sm:px-6">
        {isLoading ? <div role="status" className="flex justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading hand card…</div>
          : error ? <div role="alert" className="space-y-4 py-12 text-center"><p>Unable to load this hand card. Check your connection and try again.</p><Button variant="outline" className="gap-2" onClick={() => void refetch()}><RefreshCw className="h-4 w-4" />Retry</Button></div>
          : data ? <><div><h2 className="break-words text-lg font-semibold">{data.full_name}</h2><p className="break-all font-mono text-sm text-muted-foreground">{data.case_id}</p></div><HandCardDocument key={data.id} beneficiary={data} /></>
          : <p role="status" className="py-16 text-center text-muted-foreground">This beneficiary record is unavailable or you do not have access.</p>}
      </div>
    </main>
  );
}