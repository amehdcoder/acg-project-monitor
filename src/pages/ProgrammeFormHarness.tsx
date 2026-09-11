import { useState } from "react";
import BeneficiaryFormDialog from "@/components/ProgrammeModule/BeneficiaryFormDialog";
import { CISKULA_PRESET } from "@/lib/programmeModule/defaults";
import { Button } from "@/components/ui/button";

/** Test-only harness: renders the beneficiary registration form. */
const ProgrammeFormHarness = () => {
  const [open, setOpen] = useState(true);
  return (
    <div className="p-6">
      <Button onClick={() => setOpen(true)}>Open</Button>
      <BeneficiaryFormDialog
        open={open}
        onOpenChange={setOpen}
        moduleId="test-module"
        projectId="test-project"
        config={CISKULA_PRESET}
        onSaved={() => undefined}
      />
    </div>
  );
};

export default ProgrammeFormHarness;
