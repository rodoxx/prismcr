# Job: review a shared concern across several repos

For "does every one of these services handle X the same way" style
requests — one specific question, checked across repos the user names in
the request itself. There's no persisted group/registry concept — the
user lists the repos (or PR URLs) they mean each time.

## 1. Resolve each repo

For each `owner/repo` (or PR URL) the user named, resolve it exactly as in
`jobs/review-tree.md` step 1 (or `review-pr.md` step 1 if they gave a PR
URL for that repo) — confirm it's accessible via `gh repo view`, clone into
`./.repo-cache/<owner>/<repo>` if not already cached.

## 2. Set up one worktree per repo

Same as `jobs/review-tree.md` step 2, once per repo — each on its own
default branch (or a branch the user names), each its own worktree under
`.worktrees/`.

## 3. Run a focused, single-question review

This is not the generic triage-driven `Workflow(prismcr:review, ...)`
pass — it's one specific question applied across N worktrees. Use
`parallel()` semantics (one focused agent per repo, all independent,
each told the specific concern and given its own worktree path) rather
than the fixed dimension pipeline. Reuse whichever of the four dimension
agents is the closest fit to the concern (e.g. a "webhook signature
verification consistency" question is a security concern — invoke
`review-security` per repo with the specific question folded into its
prompt) rather than inventing a new agent type per concern.

## 4. Synthesize across repos

The interesting output here is the **cross-repo comparison**, not just N
separate reports — call out where repos agree, where one diverges, and
which divergence looks like a real gap vs. an intentional difference.
Write this as a single combined report under
`reports/<today>/shared-concern-<slug>/report.md`, one `findings.json` with
each finding's `file` prefixed by its repo name so IDs stay unambiguous
across repos.

## 5. Leave every worktree in place

Same as `review-tree.md` step 5, for each repo. Worktree teardown is
manual, so don't remove any of them. Collect the manual teardown command
for each repo and include the full list when reporting back to the user,
so cleaning up N worktrees at once is a single copy-paste.
