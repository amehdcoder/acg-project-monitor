---
name: Sensitivity Analysis Module
description: In-browser local + global sensitivity engine (OAT, NSI, LHS+PRCC, Sobol) for the active math model with publication-grade plots, exports, and interpretation
type: feature
---
The Math Modeling suite includes a full **Sensitivity Lab** tab (SensitivityWorkspace.tsx) backed by a pure-TS engine (`src/lib/sensitivity/engine.ts`).

**Methods**: One-at-a-time (OAT), Normalized Sensitivity Index with time-resolved profile (NSI), Latin Hypercube + PRCC (with t-based p-values), and Saltelli-style Sobol first/total-order indices.

**Output metrics**: peak prevalence, time to peak, final value, cumulative burden (trapezoidal ∫), value at chosen time-point, endemic equilibrium (tail mean), R₀ proxy (initial growth rate).

**UI guarantees**:
- Per-parameter selectable variation ranges (defaults to ±50% baseline); fixed-range params are flagged and skipped.
- Computational budget estimator with warnings (>3000 sims warn, >8000 strong-warn).
- Publication-grade plots: tornado (sign-coloured), Sobol grouped bar (S₁ vs Sᴛ), time-profile NSI line plot, LHS scatter for top driver.
- Downloads: CSV, multi-sheet XLSX (Sensitivity / Run Info / Time Profile / Raw Samples), PNG (html2canvas), PDF report (jsPDF), raw JSON.
- Interpretation panel highlights top drivers, direction, significant PRCC params (α=0.05), and Sobol interaction effects (Sᴛ−S₁ > 0.1).

**Engine reuses** the same RK4 solver path used by `localMathModelSimulation`, with safe `Function`-based RHS evaluation. LHS uses log-uniform sampling when bounds span ≥ 2 orders of magnitude.
