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
| V-001 | Tone mapping, sRGB output, procedural reflections, hull-edge overlays, and subtle nebula backdrop | `CHANGES REQUESTED` | Branch `codex/visual-upgrade-v1`; implementation commit `bdf4561` | Claude auditor 2026-07-27: `CHANGES REQUESTED` — ACES tone mapping desaturates faction hull colour ~33% | Pending |
| V-002 | Low-threshold bloom for emissive bullets, particles, and engines | `DEFERRED` | Requires a post-processing pipeline and a measured frame-time budget | — | — |
| V-003 | Consolidate legacy global Three.js and module Three.js loading | `DEFERRED` | Removes the r160 deprecation warning; broader loader migration | — | — |
| V-004 | Engine ribbons, thrust-responsive glow, and camera motion polish | `PROPOSED` | Not started | — | — |
| V-005 | Dispose capital-ship component groups on removal | `PROPOSED` | Pre-existing leak found during the V-001 audit at `src/renderer-threejs.js:735` and `:431`; groups are removed from the scene but never disposed. Amplified by V-001's edge geometry | — | — |

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

### 2026-07-27 — Claude — auditor — V-001 independent audit

**Branch/commit:** `codex/visual-upgrade-v1`. Reviewed implementation commit
`bdf456144fd51f393fab4a78f83ef2e1aa34b0ed` against its parent `0446bf3`. Both commits
were checked out into throwaway git worktrees and served over separate local HTTP
ports so before/after captures came from identical code paths and the same viewport.
Doran's unstaged local changes were not touched and were not present in either worktree.

**What was reviewed:** the full V-001 diff. It touches only `src/renderer-threejs.js`
(+114 / −9), which matches the declared slice — no unrelated files, no scope creep.

**Where to look:** `src/renderer-threejs.js` — `_edgeMat` (edge material cache),
`_modelToMesh` (edge overlay attachment), `_buildReflectionEnvironment` (PMREM studio),
`_buildNebulaBackground` (equirectangular canvas texture), `initScene` (tone mapping
and colour space), and `_disposeObj`.

**Evidence run:**

- All 16 `src/*.js` files pass `node --check`.
- `git diff --check` on `bdf4561^..bdf4561` is clean.
- Both builds launch over local HTTP and render at 1280 × 720 with no page errors.
- Captures are committed under `docs/audit/v-001/`.
- Hull colour was measured, not eyeballed: mean RGB and mean HSL saturation over a
  fixed 130 × 120 px box on the SOL station hull.
- An ablation was run against `bdf4561` by overriding the relevant globals before
  launch, to attribute the colour shift to a specific cause.

Station hull, same region, same viewport:

| Build | mean R | mean G | mean B | mean saturation |
|---|---|---|---|---|
| `0446bf3` (before) | 16.1 | 142.2 | 85.7 | 0.945 |
| `bdf4561` (full V-001) | 102.9 | 157.7 | 141.2 | 0.631 |
| `bdf4561`, edge overlay disabled | 102.2 | 153.1 | 137.3 | 0.611 |
| `bdf4561`, reflection env disabled | 86.4 | 152.4 | 121.2 | 0.621 |
| `bdf4561`, tone mapping disabled | 19.5 | 163.7 | 122.9 | 0.845 |

**Findings and open risks:**

1. **Blocking — ACES tone mapping desaturates faction hull colour.** The station's
   saturated green hull goes from mean R 16 to mean R 103, and mean saturation drops
   from 0.945 to 0.631, a ~33% loss. The ablation isolates the cause: disabling the
   edge overlay or the reflection environment barely moves the number, but disabling
   tone mapping restores R to 19.5 and saturation to 0.845. This is inherent ACES
   behaviour on saturated primaries, not a bug in the new code. It matters here because
   VOIDRUNNER uses hull colour as faction identity coding, and the slice's own stated
   goal is to *retain* the vector-cockpit identity. See
   `docs/audit/v-001/05-hull-closeup-before-0446bf3.png` versus
   `06-hull-closeup-after-bdf4561.png`: saturated green becomes pale mint.
   Worth noting the acceptance notes anticipated the wrong risk — they flagged the
   reflection environment as the likely source of an "indistinguishable chrome finish",
   and the measurements say the reflection environment is a minor contributor.
   Suggested directions, all cheap to test: lower `toneMappingExposure` below 1.15,
   use `THREE.NeutralToneMapping` (much gentler on saturated primaries than ACES), or
   pre-saturate hull colours to compensate. This needs an art-direction decision, so it
   is flagged for the human gate rather than fixed unilaterally.

2. **Non-blocking — recorded evidence was inaccurate.** The worker entry states "the
   only console warning was the pre-existing Three.js global-build deprecation warning."
   `bdf4561` in fact emits two additional new warnings that `0446bf3` does not:
   `sigmaRadians, 0.05, is too large and will clip, as it requested 25 samples when the
   maximum is set to 20`, from `pmrem.fromScene(envScene, 0.05, 0.1, 100)`. Cosmetic and
   easily fixed by lowering the sigma argument, but in a process whose value rests on
   trustworthy evidence, the discrepancy is worth correcting explicitly. Separately, a
   404 appears in both builds and is only `favicon.ico` — pre-existing and harmless.

3. **Non-blocking — edge overlay cost/benefit is unfavourable.** Attaching a
   `LineSegments` child to every procedural hull roughly doubles per-hull draw calls;
   a paired run showed 62 draw calls with the overlay disabled versus 95 with it
   enabled. The visual delta is subtle even at close range — compare
   `06-hull-closeup-after-bdf4561.png` with `07-hull-closeup-after-edges-disabled.png`.
   Recommend keeping it only if the human gate judges the silhouette detail worth the
   draw-call cost.

4. **Perf evidence is inconclusive, not clean.** Median frame time was ~16.6 ms in
   every variant, which is the 60 Hz vsync cap, so no frame-time regression is
   *measurable* by this method — that is not the same as "no regression exists."
   Captures also ran headless on SwiftShader software rendering, and NPC spawns are
   random, so scene complexity varied between runs (95–110 draw calls across
   edge-enabled variants). A proper stress scene on real GPU hardware is still owed
   before any performance claim is made.

5. **Cleared — the disposal risk the acceptance notes raised is genuinely addressed.**
   `_disposeObj` now traverses, so edge geometry is released with its parent hull, and
   the two call sites that previously used a bare `geometry.dispose()` on
   `_modelToMesh` products were correctly migrated. I checked every remaining direct
   `geometry.dispose()` call; each one operates on a plain single-geometry mesh
   (planets, cargo boxes, debris, landing zones) and is unaffected.

6. **Pre-existing, amplified, out of scope.** `_syncCapitals` removes a destroyed
   capital's component group from the scene without disposing it
   (`src/renderer-threejs.js:735`, and the same pattern at `:431`). This is identical in
   `0446bf3`, so V-001 did not introduce it, but each component mesh now carries an
   extra edge geometry, so the leak grows. Logging as a separate item rather than
   widening this slice.

7. **Confirmed as intended, no action.** `initScene` is called once per session — the
   restart path calls only `init()` and `initSceneForSystem()` — so the PMREM render
   target and the nebula canvas texture are allocated once and do not leak across
   restarts. The nebula also reads as a clear improvement over near-pure black and
   leaves the teal cockpit lines legible; the one thing to watch is that the lifted
   background makes the star field slightly less crisp.

**Verdict:** CHANGES REQUESTED

**Gate transition:** `AWAITING AUDIT` → `CHANGES REQUESTED`. Finding 1 needs a human
art-direction call from Stephen or Doran; findings 2 and 3 are worker follow-ups.

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
