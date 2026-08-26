# Job: review a PR

Input: a GitHub PR URL, e.g. `https://github.com/some-org/some-repo/pull/482`.
If the user gave a bare `owner/repo#number` or `owner/repo 482` instead of a
URL, that's fine too.

## 1. Resolve

Parse `owner/repo/number` from the URL. Confirm the repo is real and
accessible before doing anything else: `gh repo view <owner>/<repo> --json
defaultBranchRef`. If that fails (typo, private repo you can't see, etc.),
stop here and tell the user — never guess.

The canonical local clone for this repo lives at `./.repo-cache/<owner>/<repo>`.

**If it doesn't exist yet:** `gh repo clone <owner>/<repo> ./.repo-cache/<owner>/<repo>`.

**If it already exists:** it's reused as-is — no re-clone. It only ever
gets `fetch`ed (see step 2), never checked out to a branch directly, so it
can't have picked up local drift between runs.

## 2. Set up the worktree

First check whether this PR already has a worktree from a prior run:
`git -C ./.repo-cache/<owner>/<repo> worktree list --porcelain` and look
for `.worktrees/<repo>-pr-<n>` among the listed paths.

**If it doesn't exist (first run):**

```
git -C ./.repo-cache/<owner>/<repo> fetch origin pull/<n>/head:prismcr/pr-<n>
git -C ./.repo-cache/<owner>/<repo> worktree add ./.worktrees/<repo>-pr-<n> prismcr/pr-<n>
gh pr view <n> --repo <owner>/<repo> --json baseRefName,headRefOid
git -C ./.repo-cache/<owner>/<repo> fetch origin <baseRefName>
```

**If it already exists (re-review):** the `prismcr/pr-<n>` branch is
checked out inside that worktree, so a direct
`git fetch origin ...:prismcr/pr-<n>` from the cache clone will be
refused ("refusing to fetch into branch ... checked out at ..."). Update
the worktree in place instead:

```
git -C ./.worktrees/<repo>-pr-<n> fetch origin pull/<n>/head
git -C ./.worktrees/<repo>-pr-<n> reset --hard FETCH_HEAD
gh pr view <n> --repo <owner>/<repo> --json baseRefName,headRefOid
git -C ./.repo-cache/<owner>/<repo> fetch origin <baseRefName>
```

If the directory exists on disk but isn't in `git worktree list` (e.g.
someone removed it by hand instead of via `git worktree remove`), stop and
tell the user rather than guessing what to do with it.

**Note `gh` has no `-C` flag** (that's git-only) — use `gh <subcommand>
--repo <owner>/<repo>` instead, or `cd ./.repo-cache/<owner>/<repo> && gh ...`.

Record `headRefOid` (the commit SHA being reviewed — goes into
`findings.json`'s `commit_sha`) and the diff base as **`origin/<baseRefName>`**,
never a bare local branch name — a local branch can be arbitrarily behind
its remote, which silently turns a small PR diff into a huge one if diffed
against it. The `git fetch origin <baseRefName>` above guarantees
`origin/<baseRefName>` is current before anything diffs against it.

If any of these fail (bad PR number, network, etc.), report the error and
skip straight to teardown of whatever partially succeeded — never leave a
half-created worktree or fetched branch behind.

## 3. Run the review

Call `Workflow(prismcr:review, {worktreePath: "<abs path to the worktree>", baseRef: "origin/<baseRefName>"})`.
Triage inside the workflow decides which dimension lenses actually run and
how deep — don't pass `dimensions` unless the user explicitly asked to
force a specific subset.

If the `Workflow` tool isn't available in this session, fall back: call
`Agent(review-correctness, ...)`, `Agent(review-security, ...)`,
`Agent(review-performance, ...)`, `Agent(review-architecture, ...)` directly
and in parallel, each given the worktree path and base ref and told to
follow its own output contract. Then do one lightweight pass yourself
merging the four arrays, sorting by severity/confidence, and assigning
sequential `id`s — same shape the workflow would have produced.

## 4. Write the report

Per [report-spec.md](../specs/report-spec.md), write:

```
reports/<today>/<repo>-pr-<n>/report.md
reports/<today>/<repo>-pr-<n>/findings.json
```

Fill in `suggested_comment_body` for every finding while you have full
context — `jobs/comment-finding.md` relies on it already being there.

## 5. Leave the worktree in place

Do **not** remove the worktree or its branch — that's a manual step now
(see `CLAUDE.md` boundary 4). The `.repo-cache/<owner>/<repo>` clone is
likewise left in place so the next review of this repo can reuse it.

## 6. Tell the user

Report the location of `report.md`, a one-line summary (counts by
severity, which dimensions triage actually ran and why if it's notable —
e.g. it skipped everything for a trivial change), that the worktree at
`.worktrees/<repo>-pr-<n>` is left in place for inspection, and mention
they can say "comment issue N on the PR" to post any specific finding —
nothing is posted to GitHub automatically. Also give the exact manual
teardown commands for when they're ready:

```
git -C ./.repo-cache/<owner>/<repo> worktree remove ./.worktrees/<repo>-pr-<n>
git -C ./.repo-cache/<owner>/<repo> branch -D prismcr/pr-<n>
```
