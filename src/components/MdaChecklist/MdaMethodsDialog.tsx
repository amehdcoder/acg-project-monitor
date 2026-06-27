/**
 * MDA Analyses — "Methods" modal
 * ────────────────────────────────────────────────────────────────────────
 * Transparently documents exactly how the statistical inferences shown on the
 * dashboard are computed (95% confidence intervals, one-way ANOVA, the
 * F-statistic, p-values and η² effect size) so analysts can validate the logic.
 * All formulas mirror the implementation in src/lib/statisticalInference.ts.
 */
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FlaskConical } from "lucide-react";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <div className="space-y-1.5 text-[12px] leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 px-3 py-2 text-[11px] text-foreground">
      {children}
    </pre>
  );
}

export default function MdaMethodsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <FlaskConical className="h-3.5 w-3.5" /> Methods
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" /> Statistical methods
          </DialogTitle>
          <DialogDescription>
            How every confidence interval, ANOVA result and effect size on this dashboard
            is computed. All calculations run locally on the filtered submissions — no AI,
            no network.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          <Block title="Inputs">
            <p>
              Each community is reduced to a binary outcome (e.g. 1 = MDA completed, 0 = not;
              or 1 = side-effects reported, 0 = none), expressed as a percentage (×100). Only
              communities with a non-empty answer for the relevant question are included
              (this is the sample size <em>n</em>).
            </p>
          </Block>

          <Block title="95% confidence interval (CI)">
            <p>
              We estimate the mean rate and a Student-<em>t</em> interval around it:
            </p>
            <Formula>{`mean  = Σxᵢ / n
sd    = √( Σ(xᵢ − mean)² / (n − 1) )
se    = sd / √n
CI    = mean ± t₀.₉₇₅,(n−1) × se`}</Formula>
            <p>
              <strong>t₀.₉₇₅,(n−1)</strong> is the two-tailed critical value at 95% confidence
              for <em>n−1</em> degrees of freedom. A narrower interval means a more precise
              estimate; a wider one signals more uncertainty (usually a smaller sample).
            </p>
          </Block>

          <Block title="One-way ANOVA (variation across LGAs)">
            <p>
              Tests whether the average outcome differs between LGAs more than would be
              expected by chance. Groups with fewer than 2 observations are dropped; at least
              2 valid groups are required.
            </p>
            <Formula>{`SS_between = Σ nⱼ (meanⱼ − grandMean)²
SS_within  = Σ Σ (xᵢⱼ − meanⱼ)²
df_between = k − 1        (k = number of LGAs)
df_within  = N − k        (N = total observations)
F = (SS_between / df_between) ÷ (SS_within / df_within)`}</Formula>
            <p>
              The <strong>F-statistic</strong> compares between-LGA variation to within-LGA
              variation. Larger F ⇒ stronger evidence the LGAs really differ.
            </p>
          </Block>

          <Block title="p-value">
            <p>
              The p-value is the upper-tail probability of the F-distribution with
              (df_between, df_within) degrees of freedom, computed from the regularised
              incomplete beta function. It is the chance of seeing differences this large if
              all LGAs were truly equal.
            </p>
            <Formula>{`p = 1 − F_CDF(F; df_between, df_within)
p < 0.05  ⇒ differences are statistically significant`}</Formula>
          </Block>

          <Block title="η² (eta-squared) effect size">
            <p>
              While the p-value tells you <em>whether</em> LGAs differ, η² tells you{" "}
              <em>how much</em> of the variation is explained by the LGA:
            </p>
            <Formula>{`η² = SS_between / (SS_between + SS_within)`}</Formula>
            <p>
              It ranges 0–1. Rough guide: 0.01 = small, 0.06 = medium, 0.14+ = large effect.
            </p>
          </Block>

          <Block title="Caveats">
            <p>
              Inferences are only as trustworthy as the data behind them. The “Data Quality &amp;
              Trust” panel above flags sections with low coverage — interpret intervals and
              ANOVA results with care wherever completeness is low or the sample is small.
            </p>
          </Block>
        </div>
      </DialogContent>
    </Dialog>
  );
}
