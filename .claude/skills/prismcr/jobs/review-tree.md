# Job: review a whole repo tree (no PR)

For "review some-repo's main branch" style requests with no PR
involved — a full-tree pass instead of a diff.

## 1. Resolve

Confirm the repo exists and is accessible: `gh repo view <owner>/<repo>
--json defaultBranchRef`. Refuse (tell the user) if it isn't. Clone into
`./.repo-cache/<owner>/<repo>` if not already cached, same as
`jobs/review-pr.md` step 1.

## 2. Set up the worktree

No PR ref to fetch — just a plain worktree on the branch to review
(default: the repo's actual default branch, from the `gh repo view` call
above, unless the user named a different one).

**Fetch before checking out** — a local branch name can be arbitrarily
behind its remote, so worktree-adding a bare local branch name can
silently check out stale code.

Check `git -C ./.repo-cache/<owner>/<repo> worktree list --porcelain`
first for an existing `.worktrees/<repo>-tree-<branch>` from a prior run.

**First run:**

```
git -C ./.repo-cache/<owner>/<repo> fetch origin <branch>
git -C ./.repo-cache/<owner>/<repo> worktree add ./.worktrees/<repo>-tree-<branch> origin/<branch>
```

**Already exists (re-run):** it's a detached checkout of `origin/<branch>`,
not a named branch, so there's nothing checked-out to conflict with a
fetch — just update it in place:

```
git -C ./.repo-cache/<owner>/<repo> fetch origin <branch>
git -C ./.worktrees/<repo>-tree-<branch> reset --hard origin/<branch>
```

No `prismcr/*` temp branch is needed here since there's no PR ref to
namespace — the worktree just tracks the existing branch directly
(read-only checkout, nothing is committed to it).

## 3-4. Same as review-pr.md

Run `Workflow(prismcr:review, ...)` with `baseRef` set to something
sensible for a full-tree pass — e.g. diffing against an empty tree isn't
meaningful, so either tell the dimension agents there's no diff to scope
to and to review the whole worktree, or pick a recent point of comparison
the user names. Triage still applies: it may still decide some lenses
don't apply, based on what it finds reviewing the tree.

Write the report exactly as in `review-pr.md` step 4, under
`reports/<today>/<repo>-tree-<branch>/`.

## 5. Leave the worktree in place

Same as `review-pr.md` step 5 — don't remove it. Manual teardown command
when the user's ready:

```
git -C ./.repo-cache/<owner>/<repo> worktree remove ./.worktrees/<repo>-tree-<branch>
```

No branch to delete this time (nothing was created).
