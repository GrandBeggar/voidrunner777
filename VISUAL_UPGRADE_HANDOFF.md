# VOIDRUNNER Visual Upgrade Checklist and Handoff

This file is the durable coordination point for visual changes to VOIDRUNNER.
It is intentionally plain Markdown: no service, schema, daemon, or generated state.

The checklist tracks decisions and gates. The handoff ledger records what each
participant found while the context is still fresh. Git remains the authority
for code; this file is the authority for the current review disposition.

## Participants and gates

- **Worker:** implements one bounded slice and records the exact branch, commit,
  changed files, and verification evidence. The worker does not approve its own work.
- **Auditor:** reviews the committed diff independently, repeats relevant evidence,
  and records `PASS` or `CHANGES REQUESTED` with blocking findings.
- **Human gate:** Stephen or Doran records `ACCEPTED`, `REJECTED`, or requested
  adjustments after seeing the result. Either may accept; explicit contrary feedback
  from either reopens the item until reconciled.
- **Merge gate:** a slice is ready to merge only when the auditor records `PASS`
  and at least one human records `ACCEPTED`.

Human feedback outranks worker and auditor conclusions. New feedback is appended;
do not rewrite old verdicts or erase the path by which a decision changed.

## Status vocabulary

Use only these labels in the active checklist:

- `PROPOSED` — candidate slice, not started.
- `IN PROGRESS` — worker is changing it.
- `AWAITING AUDIT` — implementation is committed and evidence is recorded.
- `CHANGES REQUESTED` — auditor or human found a blocker.
- `AWAITING HUMAN` — auditor passed; Stephen or Doran has not accepted it yet.
- `ACCEPTED` — auditor passed and Stephen or Doran accepted it.
- `REJECTED` — explicitly declined; retained for history.
- `DEFERRED` — worthwhile, but intentionally outside the current slice.

## Required evidence for every visual slice

- [ ] Branch and commit SHA identify the exact reviewed code.
- [ ] The diff contains only the declared slice and preserves unrelated local work.
- [ ] All JavaScript files pass `node --check`.
- [ ] `git diff --check` passes.
- [ ] The game launches through a local HTTP server with no new console errors.
- [ ] A repeatable scene and viewport are named for before/after comparison.
- [ ] Before and after screenshots are attached or linked.
- [ ] The worker records expected visual benefit and likely regression risks.
- [ ] The auditor independently repeats the relevant checks.
- [ ] Stephen or Doran records an explicit human verdict.

For performance-sensitive work, also record a repeatable stress scene and frame-time
comparison. A visual improvement must not hide a material performance regression.

## Active checklist

| ID | Slice | State | Worker evidence | Auditor | Human gate |
|---|---|---|---|---|---|
| V-001 | Tone mapping, sRGB output, procedural reflections, hull-edge overlays, and subtle nebula backdrop | `AWAITING AUDIT` | Branch `codex/visual-upgrade-v1`; implementation commit `bdf4561` | Pending | Pending |
| V-002 | Low-threshold bloom for emissive bullets, particles, and engines | `DEFERRED` | Requires a post-processing pipeline and a measured frame-time budget | — | — |
| V-003 | Consolidate legacy global Three.js and module Three.js loading | `DEFERRED` | Removes the r160 deprecation warning; broader loader migration | — | — |
| V-004 | Engine ribbons, thrust-responsive glow, and camera motion polish | `PROPOSED` | Not started | — | — |

## Acceptance notes

### V-001

Intended result: retain VOIDRUNNER's vector-cockpit identity while giving the 3D
scene enough color, reflection, and authored silhouette detail to stop reading as
flat faceted geometry on a black background.

Review these risks deliberately:

- The nebula must remain subordinate to HUD legibility and target visibility.
- Additive hull edges must not turn distant fleets into unreadable bright noise.
- The procedural reflection environment must improve metal response without making
  every faction share an indistinguishable chrome finish.
- Geometry added for edge overlays must be disposed with its parent hull.
- Tone mapping must not crush dark-side detail or clip star and projectile colors.

Suggested repeatable capture:

1. Use a 1280 × 720 viewport.
2. Launch with the default ballistic weapon.
3. Capture the initial SOL view after 300 ms, without moving the ship.
4. Capture a close ship/station view that makes hull edges and reflections visible.
5. Repeat the same two captures on the reviewed commit.

## Append-only handoff ledger

Add new entries at the bottom. Do not edit prior entries except to correct a broken
link or obvious typo; record substantive corrections in a new entry.

Each entry should answer:

- Who wrote it, in what role, and when?
- What branch and commit were inspected?
- What changed or was reviewed?
- Where does the relevant code live?
- What evidence was run, and what happened?
- What smells, risks, or open questions should the next participant know about?
- Was a gate transitioned? If so, from what to what?

### 2026-07-27 — Codex worker — V-001 initial implementation

**Branch/base:** `codex/visual-upgrade-v1`, based on `0446bf3`; implementation commit
`bdf456144fd51f393fab4a78f83ef2e1aa34b0ed`. `origin/master` matched 0 ahead /
0 behind before the branch was created.

**What changed:** `src/renderer-threejs.js` now applies ACES filmic tone mapping and
sRGB output, builds a small native-Three reflection environment, overlays existing
model edges on procedural hulls, and generates a low-contrast equirectangular nebula
background. Geometry disposal was updated to traverse hull children.

**Where to look:** `src/renderer-threejs.js` contains the entire V-001 slice. The
renderer coordinate bridge at the top of that file remains load-bearing and was not
changed. `src/asset-loader.js` still dynamically imports `GLTFLoader` from the module
build and re-wraps loaded meshes into the global `THREE` scene graph.

**Evidence:** every `src/*.js` file passed `node --check`; `git diff --check` passed;
the game launched from a local HTTP server; the start screen and initial SOL view
rendered at 1280 × 720; no runtime errors were reported. The only console warning was
the pre-existing Three.js global-build deprecation warning.

**Visual observation:** the nebula changes the initial view from near-pure black to a
restrained blue/cyan field while keeping the teal cockpit lines readable. The initial
spawn does not place a large hull close enough to judge the edge/reflection treatment,
so a close-hull capture remains required before audit.

**Open risks:** V-001 needs saved before/after captures, a close hull/station inspection,
and an independent auditor verdict. Bloom and Three.js module consolidation remain
separate slices to keep this review bounded.

**Gate transition:** `IN PROGRESS` → `AWAITING AUDIT` after implementation commit
`bdf4561` was created.

## Entry template

```md
### YYYY-MM-DD — Name — worker | auditor | human — V-### subject

**Branch/commit:**

**What changed or was reviewed:**

**Where to look:**

**Evidence:**

**Findings and open risks:**

**Verdict:** PASS | CHANGES REQUESTED | ACCEPTED | REJECTED | n/a

**Gate transition:** previous state → new state, or none
```
