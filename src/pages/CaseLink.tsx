import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Landing page for Hand Card QR links (/cases?case=CiS2-...).
 * Resolves the beneficiary's project, then opens the records workspace
 * with that project selected and the record ready to open.
 */
const CaseLink = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("Opening beneficiary record…");

  useEffect(() => {
    const caseId = params.get("case");
    if (!caseId) {
      navigate("/?tab=records", { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("beneficiaries")
        .select("project_id")
        .eq("case_id", caseId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.project_id) {
        navigate(`/?tab=records&project=${data.project_id}&case=${encodeURIComponent(caseId)}`, { replace: true });
      } else {
        setMessage("No beneficiary record found for this Case ID. Taking you to records…");
        setTimeout(() => {
          if (!cancelled) navigate("/?tab=records", { replace: true });
        }, 2500);
      }
    })();
    return () => { cancelled = true; };
  }, [params, navigate]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm">{message}</p>
    </div>
  );
};

export default CaseLink;
