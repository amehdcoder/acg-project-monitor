// Emits a sample microplanning XLSForm for manual KoboCollect inspection.
// Run with:  bun scripts/generate-sample-xlsform.mjs <out-path>

import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";
import { buildMicroplanningXlsForm } from "../src/lib/microplanning/xlsformBuilder.ts";

const out = process.argv[2] || "/mnt/documents/microplan_sample.xlsx";
const wb = await buildMicroplanningXlsForm(undefined, {
  projectName: "Amehnities Sample Microplan",
  projectStates: ["__none__"],
});
const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
writeFileSync(out, buf);
console.log("wrote", out);
