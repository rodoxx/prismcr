export const meta = {
  name: 'prismcr:review',
  description:
    'Triage a prepared PR worktree to decide which review lenses apply, run the selected ones, verify high-severity findings, and synthesize one ranked list.',
  whenToUse:
    'Called by jobs/review-pr.md (and the other review-* jobs) AFTER the worktree has already been fetched/created and BEFORE it is torn down. Requires args {worktreePath, baseRef, dimensions?}. baseRef MUST be a ref the caller has already fetched fresh (e.g. "origin/main", not a bare local branch name) — a local branch can be arbitrarily behind its remote, which silently turns a small PR diff into a huge one if diffed against the stale local ref. Pass dimensions to force a specific subset and skip triage; otherwise triage decides. This script never sets up or tears down the worktree, and never touches the repo outside the worktree it is handed.',
  phases: [
    { title: 'Triage', detail: 'classify the diff and decide which lenses/depth apply' },
    { title: 'Review', detail: 'one agent per selected dimension' },
    { title: 'Verify', detail: 'single second-opinion pass on high/critical findings' },
  ],
}

const ARGS = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch (e) { return args } })() : args

const worktreePath = ARGS && ARGS.worktreePath
const baseRef = ARGS && ARGS.baseRef
const forcedDimensions = ARGS && ARGS.dimensions

if (!worktreePath || typeof worktreePath !== 'string') {
  throw new Error('prismcr:review requires args: {worktreePath: "<abs path>", baseRef: "<ref>", dimensions?: [...]}')
}
// Must be one of this project's own ephemeral worktrees — never point this
// workflow at a real checkout or an arbitrary path.
if (!/\/\.worktrees\/[^/]+$/.test(worktreePath)) {
  throw new Error(`Unsafe worktreePath ${JSON.stringify(worktreePath)} — must be a path under a .worktrees/ directory`)
}
if (!baseRef || typeof baseRef !== 'string' || baseRef.startsWith('-')) {
  throw new Error(`Unsafe or missing baseRef ${JSON.stringify(baseRef)}`)
}

const ALL_DIMENSIONS = ['correctness', 'security', 'performance', 'architecture']
const DEPTHS = ['light', 'standard', 'deep']

const FINDING_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'line', 'category', 'severity', 'confidence', 'title', 'rationale', 'recommendation'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          category: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          confidence: { type: 'number' },
          title: { type: 'string' },
          rationale: { type: 'string' },
          recommendation: { type: 'string' },
        },
      },
    },
  },
}

phase('Triage')
let lensPlan
let triageRationale = null
if (Array.isArray(forcedDimensions) && forcedDimensions.length > 0) {
  const forced = forcedDimensions.filter(d => ALL_DIMENSIONS.includes(d))
  if (forced.length === 0) {
    throw new Error(`No valid dimensions in ${JSON.stringify(forcedDimensions)} — expected a subset of ${ALL_DIMENSIONS.join(', ')}`)
  }
  lensPlan = forced.map(name => ({ name, depth: 'standard' }))
  log(`Dimensions forced by caller: ${forced.join(', ')} — skipping triage`)
} else {
  const TRIAGE_SCHEMA = {
    type: 'object',
    required: ['lenses', 'rationale'],
    properties: {
      lenses: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'depth'],
          properties: {
            name: { type: 'string', enum: ALL_DIMENSIONS },
            depth: { type: 'string', enum: DEPTHS },
            focus: { type: 'string' },
          },
        },
      },
      rationale: { type: 'string' },
    },
  }
  const triage = await agent(
    `Look at the diff between "${baseRef}" and HEAD in the git worktree at ${worktreePath}. Run \`git -C ${worktreePath} diff ${baseRef}...HEAD --stat\` and then read the actual diff to understand what kind of change this is. Decide which of these review lenses genuinely matter for this specific change — ${ALL_DIMENSIONS.join(', ')} — and how deep each should go: "light" (quick pass, flag only obvious/high-confidence issues), "standard" (normal thoroughness), or "deep" (exhaustive, line-by-line). It is correct and expected to select zero lenses for a trivial change (e.g. a version bump, comment-only, or docs-only diff) — don't force lenses that don't apply just to have output. For each lens you do select, add a one-sentence "focus" note pointing at what specifically to concentrate on (e.g. "session token handling in the new auth middleware"). Always give an overall one-to-two sentence "rationale" explaining your selections (or why you selected none).`,
    { label: 'triage', phase: 'Triage', schema: TRIAGE_SCHEMA },
  )
  lensPlan = (triage && Array.isArray(triage.lenses) ? triage.lenses : []).filter(l => l && ALL_DIMENSIONS.includes(l.name))
  triageRationale = (triage && triage.rationale) || null
  log(`Triage selected: ${lensPlan.length ? lensPlan.map(l => `${l.name}(${l.depth})`).join(', ') : 'none'}${triageRationale ? ` — ${triageRationale}` : ''}`)
}

if (lensPlan.length === 0) {
  return {
    worktreePath,
    baseRef,
    dimensionsRun: [],
    findings: [],
    refutedCount: 0,
    totalRaw: 0,
    triageRationale,
  }
}

phase('Review')
const perDimension = await pipeline(
  lensPlan,
  lens =>
    agent(
      `Review the diff between "${baseRef}" and HEAD in the git worktree at ${worktreePath}. Run \`git -C ${worktreePath} diff ${baseRef}...HEAD\` first to scope your review to what actually changed, then read the changed files in full for context. Depth for this pass: ${lens.depth}.${lens.focus ? ` Focus: ${lens.focus}` : ''} Return your findings per your output contract, as the "findings" array of the required tool call (an empty array if you found nothing).`,
      { agentType: `review-${lens.name}`, label: `review:${lens.name}`, phase: 'Review', schema: FINDING_SCHEMA },
    ).then(result => (result && Array.isArray(result.findings) ? result.findings.map(f => ({ ...f, category: f.category || lens.name })) : [])),
)

const dimensions = lensPlan.map(l => l.name)
const allFindings = perDimension.flat()
log(`${allFindings.length} raw findings across ${dimensions.length} dimension(s)`)

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['refuted', 'reason'],
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
  },
}

phase('Verify')
const toVerify = allFindings.filter(f => f.severity === 'high' || f.severity === 'critical')
const verdicts = await parallel(
  toVerify.map(f => () =>
    agent(
      `A reviewer flagged this in the worktree at ${worktreePath}:\n\nFile: ${f.file}:${f.line}\nCategory: ${f.category}\nTitle: ${f.title}\nRationale: ${f.rationale}\n\nRead the file yourself and try to disprove this finding in one pass. Default to refuted=false if you're genuinely unsure — only refute what you can actually show is wrong by reading the code.`,
      { label: `verify:${f.file}:${f.line}`, phase: 'Verify', schema: VERDICT_SCHEMA },
    ).then(v => ({ finding: f, verdict: v })),
  ),
)

const refutedSet = new Set(
  verdicts.filter(Boolean).filter(v => v.verdict && v.verdict.refuted).map(v => `${v.finding.file}:${v.finding.line}:${v.finding.title}`),
)
const survivingFindings = allFindings.filter(f => !refutedSet.has(`${f.file}:${f.line}:${f.title}`))
const refutedCount = allFindings.length - survivingFindings.length
if (refutedCount > 0) log(`${refutedCount} high/critical finding(s) refuted on verification and dropped`)

// Cross-lens confirmation: two+ dimensions flagging the same file within a
// few lines of each other is the strongest signal a multi-lens review
// produces — surface it rather than letting it read as two unrelated findings.
for (const f of survivingFindings) {
  const others = survivingFindings.filter(
    g => g !== f && g.file === f.file && g.category !== f.category && Math.abs(g.line - f.line) <= 3,
  )
  f.crossLensConfirmedBy = others.map(o => o.category)
}

const SEVERITY_RANK = { critical: 3, high: 2, medium: 1, low: 0 }
survivingFindings.sort((a, b) => {
  const bySeverity = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0)
  if (bySeverity !== 0) return bySeverity
  return (b.confidence || 0) - (a.confidence || 0)
})
survivingFindings.forEach((f, i) => { f.id = i + 1 })

return {
  worktreePath,
  baseRef,
  dimensionsRun: dimensions,
  findings: survivingFindings,
  refutedCount,
  totalRaw: allFindings.length,
  triageRationale,
}
