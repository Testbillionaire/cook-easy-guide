Remove the top "Back" button on the results step (the one circled in the screenshot, just under the progress bar). The footer already has a "Back" button next to "Start over", so the top one is redundant.

### File
- `src/routes/index.tsx` — delete the top-of-results `Back` button inside `ResultsStep` (keep the footer Back + Start over intact).
