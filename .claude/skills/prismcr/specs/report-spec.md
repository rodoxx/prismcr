# Report spec

Every `prismcr` run against a PR produces exactly two files:

```
reports/<YYYY-MM-DD>/<repo-name>-pr-<n>/report.md
reports/<YYYY-MM-DD>/<repo-name>-pr-<n>/findings.json
```

## `findings.json`

The machine-readable source of truth. A JSON object:

```json
{
  "run": {
    "repo": "some-repo",
    "github": "some-org/some-repo",
    "pr": 482,
    "commit_sha": "a1b2c3d...",
    "base_ref": "main",
    "dimensions_run": ["security", "correctness"],
    "triage_rationale": "Auth-adjacent change to session handling; skipped performance and architecture as out of scope for a small, contained fix."
  },
  "findings": [
    {
      "id": 1,
      "pr": { "owner": "some-org", "repo": "some-repo", "number": 482 },
      "commit_sha": "a1b2c3d...",
      "file": "src/orders/orders.controller.ts",
      "line": 42,
      "category": "security",
      "severity": "high",
      "confidence": 85,
      "summary": "Missing ownership check on order lookup",
      "failure_scenario": "An authenticated user requests GET /orders/999 owned by a different customer and receives it, because no ownership check compares the requester to the order's owner.",
      "recommendation": "Add an ownership/tenant check before returning the order.",
      "suggested_comment_body": "**Security finding:** Missing ownership check on order lookup.\n\nAn authenticated user requesting GET /orders/999 owned by a different customer currently receives it — no check compares the requester's ID to the order's owner (orders.controller.ts:42).\n\nSuggested fix: add an ownership/tenant check before returning the order."
    }
  ]
}
```

- `id` is a **stable, run-scoped sequential integer** (`1`, `2`, ...) in the
  order findings were synthesized (most-severe-first). This is what a later
  "comment issue 2 on the PR" request resolves against — see
  `jobs/comment-finding.md`.
- `dimensions_run` reflects what the adaptive triage step actually
  selected for this PR, which can be a subset of the four lenses or empty.
  `triage_rationale` is triage's own one-to-two sentence explanation of why
  — include it even when `dimensions_run` is empty, since "no dimensions
  applied" without a reason reads as a broken run rather than a deliberate
  one.
- `suggested_comment_body` is pre-written so `comment-finding` never has to
  re-derive comment text from the markdown — it's ready to post as-is (the
  human can still edit it before approving).
- One `findings.json` exists per run. A re-review of the same PR (e.g. after
  new commits) writes a new dated/numbered run directory — it never
  overwrites a prior run's file, so old finding IDs stay resolvable.
- Optional `status` (`"acknowledged_wont_fix"`, `"fixed"`, or absent for the
  default "open, unreviewed by a human yet") + `status_note` (who, when,
  why) — set these when the user responds to a finding in conversation
  after the report was written (edit the existing `findings.json`/`report.md`
  in place rather than writing a new run). This happens most often for
  security findings on a **frontend-only repo**: a missing client-side
  authorization check the review has no way to confirm is independently
  exploitable if a separate backend service already enforces it — see the
  scope-limit note in `agents/review-security.md`. Never delete or silently
  reword the original finding when this happens; append the status instead,
  so the reasoning trail (what was found, why, and why it was or wasn't
  acted on) stays intact. `jobs/comment-finding.md` should mention an
  existing `status` before posting, in case the user forgot it was already
  addressed.

## `report.md`

Human-facing rendering of the same data:

```markdown
# some-repo — PR #482 review

**Commit:** a1b2c3d  **Base:** main  **Dimensions run:** security, correctness
**Triage:** auth-adjacent change to session handling; skipped performance and architecture as out of scope for a small, contained fix.

## Findings (4, most severe first)

### #1 — [security / high] Missing ownership check on order lookup
`src/orders/orders.controller.ts:42`

An authenticated user requests GET /orders/999 owned by a different
customer and receives it, because no ownership check compares the
requester to the order's owner.

**Recommendation:** Add an ownership/tenant check before returning the order.

---
### #2 — ...
```

- If triage selected zero dimensions, say so plainly with its rationale
  ("Triage determined no lenses applied to this change — <rationale>. No
  findings.") rather than presenting an empty findings section with no
  explanation.
- A finding flagged by more than one dimension lens (same `file`+`line`
  region reported independently by two agents) is called out at the top of
  the findings list — this is the strongest signal a multi-lens review
  produces and should not get buried.
- An empty findings list from lenses that *did* run is a valid, good
  result — say so plainly ("No findings across N dimensions"), don't pad
  the report to look busier than the review actually was.
