# Prism CR

A multi-dimension code review tool for any GitHub repo you have `gh`
access to. This project's own code lives here; its *subject matter* is
always some other repo, reached through a disposable git worktree, never
edited in place.

## What this is

Give the `prismcr` skill a GitHub PR URL (e.g.
`https://github.com/some-org/some-repo/pull/482`) and it reviews that
PR across independent lenses — correctness, security, performance,
architecture — run in parallel and synthesized into one ranked report. An
adaptive triage step decides which lenses actually apply to the change and
how deep each should go; it's normal for a trivial PR to trigger none of
them.

## Hard boundaries (do not relax these without the user explicitly asking)

1. **Read-only with respect to every repo under review.** This tool
   creates and removes its own disposable `prismcr/*` worktree
   branch; it never pushes, commits, resets, or checks out a branch
   anywhere else, including in its own `.repo-cache/` clones (which only
   ever get `fetch`ed, never checked out to a branch directly).
2. **Posting to GitHub is never automatic.** A review only ever writes
   local files under `reports/`. Posting a PR comment happens only through
   `jobs/comment-finding.md`, for one named finding at a time, only when
   the user explicitly asks for that finding by ID — never as part of the
   review itself.
3. **Repos are resolved dynamically, never guessed at.** A PR URL's
   `owner/repo` is confirmed to exist and be accessible (`gh repo view`)
   before anything else runs; there's no pre-registered allowlist. The
   canonical local clone for a repo lives at `.repo-cache/<owner>/<repo>`,
   created on first use and reused (fetch-only) after that.
4. **Worktree teardown is manual.** A run's `.worktrees/*` checkout and its
   `prismcr/pr-<n>` branch are left in place after the run —
   including on failure — so the user can inspect the code later; they're
   removed only when the user runs the teardown commands themselves (or
   explicitly asks this tool to run them). A re-review of the same PR
   reuses the existing worktree (fetch + hard-reset in place) rather than
   erroring or duplicating it. The `.repo-cache/` clone likewise persists
   across runs so it isn't re-cloned every time.

## Layout

- `.claude/agents/review-{correctness,security,performance,architecture}.md` — the four dimension lenses
- `.claude/skills/prismcr/` — the entry point; `jobs/*.md` are the actual recipes, `specs/report-spec.md` is the output contract
- `.claude/workflows/review.js` — the triage→review→verify→synthesize orchestration (Workflow tool)
- `reports/` — dated run output, gitignored except this directory's own README
- `.repo-cache/` — persistent local clones of reviewed repos, created on first use, gitignored
- `.worktrees/` — ephemeral PR checkouts, created per run and torn down manually by the user

## Invocation

```
prismcr https://github.com/some-org/some-repo/pull/482
```

or plain language: "review PR 482 on some-repo." Follow-ups like
"comment issue 2 on the PR" work against the most recent review in the
conversation, or a named older one under `reports/`.
