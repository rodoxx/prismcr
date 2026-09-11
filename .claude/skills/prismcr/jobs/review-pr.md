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
gets `fetch`ed (see step 3), never checked out to a branch directly, so it
can't have picked up local drift between runs.

## 2. Ensure the architecture profile is fresh

The architecture lens works best with a durable picture of this repo's
own conventions instead of re-deriving them from scratch every run. That
picture is cached at `./.repo-cache/<owner>/<repo>.architecture.json` — a
sibling of the clone, never inside it.

Check whether it exists and is fresh:

```
cat ./.repo-cache/<owner>/<repo>.architecture.json 2>/dev/null
```

It's fresh if it exists, parses as JSON, and its `generated_at` is
**less than 30 days** before now. If it's missing, unparseable, or
`generated_at` is 30+ days old, first make the default branch current, then
rebuild. The fetch isn't optional: the profiling agent reads the repo
through git plumbing against `origin/<defaultBranchRef.name>`, so that ref
has to actually be up to date or the profile describes a stale snapshot of
the conventions.

```
git -C ./.repo-cache/<owner>/<repo> fetch origin <defaultBranchRef.name from step 1>
Agent(profile-architecture, "repoCachePath: ./.repo-cache/<owner>/<repo>\ndefaultBranchName: <defaultBranchRef.name from step 1>\nprofilePath: ./.repo-cache/<owner>/<repo>.architecture.json")
```

This reads the repo's default branch via git plumbing (never checks the
clone out to a branch) and is independent of any PR worktree — it's safe
to run in the same batch of tool calls as step 3 (worktree setup) rather
than waiting on it, since the two touch different things.

If this agent call fails or produces invalid output for any reason,
proceed without a profile — the architecture lens still runs, just
without the extra grounding, same as it always has. Never let a profiling
failure block the review.

Load whichever profile you end up with (freshly built or the existing
fresh one) into memory, and remember whether you rebuilt it this run —
you'll pass both into step 4 and mention them to the user in step 7.

## 3. Set up the worktree

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

## 4. Run the review

Call `Workflow(prismcr:review, {worktreePath: "<abs path to the worktree>", baseRef: "origin/<baseRefName>", architectureProfile: <the profile object loaded in step 2, or omit this key entirely if none is available>})`.
Triage inside the workflow decides which dimension lenses actually run and
how deep — don't pass `dimensions` unless the user explicitly asked to
force a specific subset. The workflow's result includes
`architectureProfileApplied: true/false` — use it in step 5 to decide
whether to include `run.architecture_profile` in `findings.json`.

If the `Workflow` tool isn't available in this session, fall back: call
`Agent(review-correctness, ...)`, `Agent(review-security, ...)`,
`Agent(review-performance, ...)`, `Agent(review-architecture, ...)` directly
and in parallel, each given the worktree path and base ref and told to
follow its own output contract — and, for `review-architecture` only, also
append the same "Known conventions for this repo, from a prior profiling
pass: `<profile>`..." context used in the workflow, if a profile is
available. Then do one lightweight pass yourself merging the four arrays,
sorting by severity/confidence, and assigning sequential `id`s — same
shape the workflow would have produced.

## 5. Write the report

Per [report-spec.md](../specs/report-spec.md), write:

```
reports/<today>/<repo>-pr-<n>/report.md
reports/<today>/<repo>-pr-<n>/findings.json
```

Fill in `suggested_comment_body` for every finding while you have full
context — `jobs/comment-finding.md` relies on it already being there.

If the review's result had `architectureProfileApplied: true`, include
`run.architecture_profile` in `findings.json`: `path` and `generated_at`
from the profile you loaded in step 2, `rebuilt_this_run` set to whether
you rebuilt it in step 2 this run. Omit the field entirely otherwise
(architecture lens didn't run, or ran without a profile). Mirror this as
a one-line `**Architecture profile:**` note in `report.md`, per
report-spec.md.

## 6. Leave the worktree in place

Do **not** remove the worktree or its branch — that's a manual step now
(see `CLAUDE.md` boundary 4). The `.repo-cache/<owner>/<repo>` clone, and
its sibling `.repo-cache/<owner>/<repo>.architecture.json` profile if one
was built, are likewise left in place so the next review of this repo can
reuse them.

## 7. Tell the user

Report the location of `report.md`, a one-line summary (counts by
severity, which dimensions triage actually ran and why if it's notable —
e.g. it skipped everything for a trivial change), whether the architecture
profile was freshly built or reused this run (when the architecture lens
ran at all), that the worktree at `.worktrees/<repo>-pr-<n>` is left in
place for inspection, and mention they can say "comment issue N on the
PR" to post any specific finding — nothing is posted to GitHub
automatically. Also give the exact manual teardown commands for when
they're ready:

```
git -C ./.repo-cache/<owner>/<repo> worktree remove ./.worktrees/<repo>-pr-<n>
git -C ./.repo-cache/<owner>/<repo> branch -D prismcr/pr-<n>
```
