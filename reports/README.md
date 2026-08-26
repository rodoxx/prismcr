# Reports

Each `prismcr` run writes `reports/<YYYY-MM-DD>/<repo-name>-pr-<n>/`
containing `report.md` and `findings.json`.

**These dated run directories are gitignored and never committed.** They
routinely quote reviewed-repo source — sometimes near secrets even after
the security lens's masking — and a stale report is misleading rather than
useful once the reviewed PR has moved on. This file is the only thing under
`reports/` that's checked in.

See [../.claude/skills/prismcr/specs/report-spec.md](../.claude/skills/prismcr/specs/report-spec.md)
for the exact shape.
