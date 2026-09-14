# WHO-inspired Beneficiary Records experience

## What will change

- Redesign the Beneficiary Journey as a high-trust public-health evidence report using the selected Global Health Spectrum, Sora/Manrope typography, and WHO data-design principles.
- Replace the plain indicator cards and nested accordions with an editorial hierarchy: scope and reporting context, headline outcomes, change distribution, service reach, feedback and safeguarding signals, ranked facility summaries, and scannable beneficiary journey records.
- Keep safeguarding narratives restricted; the general journey displays only counts and action-needed signals.

## Cases page behaviour

- Detect Beneficiary Records independently for each project from its configured programme module.
- For a configured project, show only the Beneficiary Records workspace on the Cases page and hide the legacy case header, KPIs, buttons, tabs, map and analytics.
- Present a polished project selector at the top. “All Projects” will not mix incompatible record systems; the page will select a specific configured project before opening its records.
- For projects without Beneficiary Records, retain the existing case-management experience. Administrators will still receive a clear project-specific path to add the module.
- Avoid flashing the wrong interface while project configuration is loading.

## Safeguarding officers

- Allow Owners to appoint themselves or any eligible user as a safeguarding officer or safeguarding lead.
- Keep self-appointment blocked for non-owner administrators.
- Update the database rule as well as the screen, so this permission cannot be bypassed or inconsistently denied.
- Refresh officer access immediately after appointment so the Safeguarding and Safeguarding Dashboard views appear without a page reload.

## Technical details

- Add semantic WHO-style colour tokens for institutional blue, health teal, attention amber, safeguarding red and report surfaces, including dark-mode counterparts.
- Use existing records, services, facilities, feedback and safeguarding flag data; derive percentages only where the denominator is explicit.
- Preserve facility focal-person scoping and current project-level access controls.
- Add focused tests for project-only Cases rendering and owner self-appointment, then verify desktop and mobile layouts in the signed-in preview.
