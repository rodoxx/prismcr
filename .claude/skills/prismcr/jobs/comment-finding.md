# Job: comment a specific finding on GitHub

Triggered by requests like *"comment issue 2 on the PR"*, *"post finding 3
from the some-repo review"*. **Never triggered by finishing a
review** — this only runs when the user names it explicitly, in this
message, right now.

## 1. Resolve which finding

Find the relevant run's `findings.json` — if the user just finished
reviewing a PR in this conversation, that run; if they reference an older
one, look under `reports/` for the matching `<repo>-pr-<n>` directory
(most recent date if more than one). If it's ambiguous which run they
mean, ask rather than guessing.

Look up the finding by its `id` inside that run's `findings.json`. If no
finding with that ID exists, say so — don't post something else instead.

If the finding already has a `status` (e.g. `acknowledged_wont_fix`),
mention it and its `status_note` before proceeding — the user may have
forgotten it was already addressed, or may genuinely still want it posted
(e.g. to leave a record on the PR even though no fix is planned). Either
way, don't silently skip or silently post; say what you see and confirm.

## 2. Show, don't just tell

Before posting anything, show the user exactly what's about to happen:
- Target: `owner/repo#<pr number>`, at `commit_sha`
- Location: `file:line`
- The exact `suggested_comment_body` text (or ask if they want it edited
  first)

The user's request to comment this specific finding *is* the approval for
this one action — you don't need a second round-trip confirmation on top
of it, but showing the exact content is still worth doing, since
"issue 2" could be misread against the wrong finding.

## 3. Post

Try an inline review comment, anchored to the diff:

```
gh api repos/<owner>/<repo>/pulls/<n>/comments -f body="<suggested_comment_body>" -f commit_id="<commit_sha>" -f path="<file>" -F line=<line>
```

If the finding doesn't cleanly anchor to one file:line (e.g. an
architecture finding spanning several files), or the inline call fails
because the PR has moved on since the review (new commits pushed, the line
is no longer part of the diff), fall back to a plain PR-level comment:

```
gh pr comment <n> --repo <owner>/<repo> --body "<suggested_comment_body>"
```

Post **exactly one finding** per invocation of this job — never "post all
of them," even if the user's phrasing is ambiguous about scope; if they
seem to want more than one, ask which ones.

## 4. Confirm

Tell the user the comment posted successfully (link if `gh` returns one),
or report exactly why it didn't (PR moved, permission denied, etc.) — don't
retry silently on failure.

## What this job never does

- Never pushes a commit, opens a PR, or modifies any file in the sibling
  repo. It only ever calls `gh pr comment` / `gh api .../comments` — a
  comment, nothing else.
- Never posts more than the one finding named in the request.
- Never runs without the user having named a specific finding in this
  conversation turn.
