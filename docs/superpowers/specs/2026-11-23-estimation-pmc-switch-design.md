# Enable configured PMC pricing in Estimation

## Goal and evidence

For an editable estimate with permission to change pricing, Sales can enable PMC on POP false ceiling when its saved Signature pricing supports the selected quantity. The reported row is selected at 1 sq-ft. The screenshot does not identify which check failed.

ConfiguredEstimateBuilder currently gates the switch on catalogue readiness, workflow access, the selected tier's base-price availability flag, its projected mode rate, and the vendor rate calculated for the quantity. The catalogue builds the flag separately from the PMC settings. The row uses a generic pricing message for several failures and reports a stage restriction during catalogue refresh.

## Requirements and verification

- Trace a saved Signature configuration through catalogue projection, estimate draft hydration, the switch and the save endpoint. Reproduce with a selected POP line at 1 sq-ft in both a new and reopened editable draft. Identify the first inconsistent value before changing eligibility.
- Use the current saved revision for the same Main Line ID and tier. With valid settings and access, enable PMC in one click, show the vendor amount and internal margin, and preserve the mode after save and reload.
- When legitimately blocked, display the specific reason beside the switch, including refresh, access, unavailable source or incomplete PMC inputs. Verify keyboard and touch access to the reason.
- Cover another tier with missing settings, a restricted user and a frozen estimate. Preserve backend authorization, financial formulas, historical prices and tier isolation. No migration or new public pricing fields are expected.

## Open evidence

The exact saved revision, returned catalogue fields and workflow capability for the reported instance remain unverified. Any fixture used for regression coverage must distinguish observed behavior from inferred causes.
