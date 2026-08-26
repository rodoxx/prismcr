# Prism CR

Multi-dimension AI code review for GitHub PRs — any repo you have `gh`
access to.

## Quickstart

Open Claude Code in this folder and paste a PR URL:

```
https://github.com/some-org/some-repo/pull/482
```

It will:
1. Confirm the repo exists and is accessible via `gh`, cloning it into
   `.repo-cache/some-org/some-repo` on first use (reused, never re-cloned,
   on later reviews).
2. Fetch the PR into a disposable git worktree under `.worktrees/` — your
   actual checkout of that repo, if you have one elsewhere, is never
   touched.
3. Triage the diff to decide which review lenses actually apply
   (correctness, security, performance, architecture) and how deep each
   should go — a trivial change can legitimately trigger none of them.
4. Run the selected lenses in parallel and verify the high-severity
   findings before reporting them.
5. Write `reports/<date>/<repo>-pr-<n>/report.md` (+ `findings.json`).

Then, if you want to act on something it found:

```
comment issue 2 on the PR
```

Posts exactly that one finding as a GitHub PR comment — nothing is ever
posted automatically. See [CLAUDE.md](CLAUDE.md) for the full boundary list
and [.claude/skills/prismcr/SKILL.md](.claude/skills/prismcr/SKILL.md)
for the other jobs (whole-tree review, shared-concern-across-repos review).

## Requirements

- [`gh`](https://cli.github.com/) authenticated with access to whatever
  repos you want to review.
- Claude Code with the `Workflow` tool available (falls back to running
  the four lens agents directly if it isn't — see `jobs/review-pr.md`).

## Why a worktree, not an in-place checkout

Checking out a PR branch in place would clobber whatever you're currently
working on in that repo. A `git worktree` off the `.repo-cache/` clone
gives a fully isolated working directory on its own branch — your actual
checkout elsewhere, if any, is never disturbed.
