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
- **Operator:** records `ACCEPTED`, `REJECTED`, or requested adjustments after seeing
  the result. Explicit contrary feedback from the operator reopens the item until
  reconciled.
- **Merge gate:** a slice is ready to merge only when the auditor records `PASS`
  and the operator records `ACCEPTED`.

Operator feedback outranks worker and auditor conclusions. New feedback is appended;
do not rewrite old verdicts or erase the path by which a decision changed.

## Status vocabulary

Use only these labels in the active checklist:

- `PROPOSED` — candidate slice, not started.
- `IN PROGRESS` — worker is changing it.
- `AWAITING AUDIT` — implementation is committed and evidence is recorded.
- `CHANGES REQUESTED` — auditor or human found a blocker.
- `AWAITING HUMAN` — auditor passed; the operator has not accepted it yet.
- `ACCEPTED` — auditor passed and the operator accepted it.
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
- [ ] The operator records an explicit verdict.

For performance-sensitive work, also record a repeatable stress scene and frame-time
comparison. A visual improvement must not hide a material performance regression.

## Active checklist

| ID | Slice | State | Worker evidence | Auditor | Human gate |
|---|---|---|---|---|---|
| V-001 | Tone mapping, sRGB output, procedural reflections, and subtle nebula backdrop | `AWAITING HUMAN` | Initial `bdf4561`; audit remediation `b238423` on `codex/visual-upgrade-v1` | Claude auditor 2026-07-27: `CHANGES REQUESTED` on `bdf4561`, then `PASS` on `b238423` (saturation 0.632 → 0.833, PMREM warnings 2 → 0) | Operator 2026-07-27: accepted for live preview. Preview is live and verified at <https://grandbeggar.github.io/voidrunner777/> (build `afa0733`, desktop browser required) — awaiting final visual confirmation |
| V-002 | Low-threshold bloom for emissive bullets, particles, and engines | `DEFERRED` | Requires a post-processing pipeline and a measured frame-time budget. Re-audit note: Linear tone mapping leaves ~27% of the station hull region hard-clipped, so bloom will key off far more area than the baseline look implies — revisit tone mapping as part of this slice | — | — |
| V-003 | Consolidate legacy global Three.js and module Three.js loading | `DEFERRED` | Removes the r160 deprecation warning; broader loader migration | — | — |
| V-004 | Engine ribbons, thrust-responsive glow, and camera motion polish | `PROPOSED` | Not started | — | — |
| V-005 | Dispose capital-ship component groups on removal | `PROPOSED` | Pre-existing leak found during the V-001 audit at `src/renderer-threejs.js:735` and `:431`; groups are removed from the scene but never disposed | — | — |
| V-006 | Give planets authored-looking gradients, bands, or procedural surface patterns | `PROPOSED` | Operator feedback 2026-07-27; use the Homeworld reference for visual principle, not direct imitation | — | — |
| V-007 | Replace the basic HUD outline with a cockpit-like ship silhouette and structural framing | `PROPOSED` | Operator feedback 2026-07-27; retain clear target/radar sightlines | — | — |
| V-008 | Start the player closer to stations, traffic, or other meaningful entities | `PROPOSED` | Operator feedback 2026-07-27; must remain collision-safe and avoid immediate hostile spawn traps | — | — |

## Acceptance notes

### V-001

Intended result: retain VOIDRUNNER's vector-cockpit identity while giving the 3D
scene enough color, reflection, and authored silhouette detail to stop reading as
flat faceted geometry on a black background.

Review these risks deliberately:

- The nebula must remain subordinate to HUD legibility and target visibility.
- Hull-edge overlays were removed in remediation `b238423`; their subtle visual delta
  did not justify the measured draw-call increase.
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
The operator's unstaged local changes were not touched and were not present in either worktree.

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
art-direction call from the operator; findings 2 and 3 are worker follow-ups.

### 2026-07-27 — Codex — worker — V-001 changes-requested remediation

**Branch/commit:** `codex/visual-upgrade-v1` at remediation commit
`b238423f75da9c1f8b0bd988ce0d9511cf81d55c`, applied after audit commit `aa84d5a`.

**What changed:** accepted the auditor's faction-colour finding and selected colour
identity as the governing art-direction criterion. ACES filmic tone mapping was
replaced with Linear tone mapping at exposure 1.0. The per-hull edge overlay and its
material cache were removed because the audit measured 95 versus 62 draw calls for a
subtle close-range difference. PMREM sigma was reduced from 0.05 to 0.03 to stay under
the sample limit and remove the two new warnings. The nebula, reflection environment,
sRGB output, and recursive geometry disposal remain.

**Where to look:** `src/renderer-threejs.js`, specifically `_modelToMesh`,
`_buildReflectionEnvironment`, and `initScene`.

**Evidence:** all `src/*.js` files passed `node --check`; `git diff --check` passed;
the game launched at 1280 × 720 through local HTTP and rendered the initial SOL view.
The browser reported only the pre-existing Three.js global-build deprecation warning.
The PMREM warnings reported by the auditor are gone. A Neutral tone-mapping candidate
was tested and rejected because the pinned r160 global build does not support it and
emitted repeated `Unsupported toneMapping` shader warnings. No performance claim is
made: the real-GPU stress scene remains outstanding.

**Evidence correction:** the initial worker entry's claim that `bdf4561` emitted only
the pre-existing warning was inaccurate. The independent audit correctly identified
two PMREM sample-limit warnings. This entry corrects the record without rewriting the
original claim.

**Findings and open risks:** the remediation follows the audit's measured causal
finding and removes the unfavourable edge-overlay trade. It still needs the auditor to
repeat the fixed station-region colour measurement and close-hull capture against
`b238423`. V-005 remains a separate pre-existing leak; removing the edge overlay means
V-001 no longer amplifies it.

**Verdict:** n/a — worker remediation, not an audit or human verdict.

**Gate transition:** `CHANGES REQUESTED` → `AWAITING AUDIT` after remediation commit
`b238423` was created. The human gate remains pending.

### 2026-07-27 — Claude — auditor — V-001 re-audit of remediation

**Branch/commit:** `codex/visual-upgrade-v1` at remediation commit
`b238423f75da9c1f8b0bd988ce0d9511cf81d55c`. Re-measured against pre-slice baseline
`0446bf3` and the original implementation `bdf4561`. All three were checked out into
separate throwaway worktrees and served on separate local HTTP ports simultaneously,
so the three readings come from the same tooling, viewport, and measurement box.

**What was reviewed:** the remediation diff, which touches only
`src/renderer-threejs.js` (+6 / −40) — scope is clean and matches the declared change.

**Where to look:** `src/renderer-threejs.js` — `initScene` (tone mapping),
`_modelToMesh` (edge overlay removed), `_buildReflectionEnvironment` (PMREM sigma).

**Evidence:** all 16 `src/*.js` files pass `node --check`; `git diff --check` on
`b238423^..b238423` is clean; the build launches over local HTTP at 1280 × 720 with no
page errors and no console output beyond a pre-existing `favicon.ico` 404. Remediated
captures are committed as `docs/audit/v-001/08-*`, `09-*`, and `10-*`.

Station hull, same fixed 130 × 120 px region and same camera offset as the first audit:

| Build | mean R | mean G | mean B | mean saturation | clipped px | PMREM warnings |
|---|---|---|---|---|---|---|
| `0446bf3` baseline | 16.7 | 138.7 | 86.8 | 0.956 | 23.79% | 0 |
| `bdf4561` original | 103.4 | 157.0 | 142.7 | 0.632 | 1.21% | 2 |
| `b238423` remediated | 21.6 | 157.7 | 123.5 | 0.833 | 26.90% | 0 |

**Findings:**

1. **Blocking finding resolved.** Mean saturation recovers from 0.632 to 0.833 against
   a 0.956 baseline, and mean red — the clearest signal of the wash toward white — falls
   from 103.4 back to 21.6 against a 16.7 baseline. Faction colour identity is restored.
   Comparing `docs/audit/v-001/10-hull-closeup-remediated-b238423.png` with the baseline
   `05-*` and the original `06-*`, the remediated build is arguably the best of the
   three: it keeps the identity green while the reflection environment now produces
   genuine per-facet hue variation (cool cyan on the panel-lit left facets) instead of
   flattening everything toward white. The reflection work pays off once tone mapping
   is no longer fighting it.

2. **PMREM warnings confirmed eliminated.** Sigma 0.03 stays under the sample limit:
   0 warnings on baseline, 2 on `bdf4561`, 0 on `b238423`.

3. **Correction to my own tooling, disclosed.** My first re-audit script filtered
   console events on `type() === 'warning'`, but Puppeteer reports these as `warn`, so
   the script initially reported 0 PMREM warnings for *both* `bdf4561` and `b238423` —
   a false negative that would have wrongly credited the fix. I caught it because the
   zero for `bdf4561` contradicted the first audit, re-ran with a corrected filter, and
   the numbers above are from the corrected run. Recording this because a process whose
   value rests on evidence integrity should hold the auditor's instruments to the same
   standard as the worker's claims.

4. **New observation, non-blocking — Linear hard-clips where ACES rolled off.**
   Clipped pixels in the measured region go from 1.21% under ACES to 26.90% under
   Linear, which is also ~3 points above the 23.79% pre-slice baseline; the extra is
   attributable to the added reflection light. This is inherent to Linear tone mapping
   rather than a defect, the facet gradient is visibly preserved, and the result matches
   the art direction the project already shipped — so it does not block. It is worth
   carrying forward to **V-002**: low-threshold bloom feeds on exactly these clipped
   highlights, and at 27% clipped area the station would bloom far more aggressively
   than the baseline look implies. V-002 should re-examine tone mapping rather than
   treat it as settled.

5. **Edge-overlay removal is clean.** No orphan references to `_edgeMat`, `edgeGeo`, or
   `EdgesGeometry` remain. The two surviving `LineSegments` uses are the unrelated
   pre-existing landing-zone wireframe helper. `model.edges` is still consumed by the 2D
   MFD/radar path, which this slice does not touch.

6. **Retained items verified present, not just claimed.** `_disposeObj` still traverses,
   `outputColorSpace` is still `SRGBColorSpace`, and the nebula and reflection
   environment are still built in `initScene`.

7. **No performance claim is made or implied.** Removing the overlay necessarily removes
   one draw call per procedural hull, but frame time here remains vsync-capped on
   software rendering, so nothing measured constitutes a performance result. The
   real-GPU stress scene stays outstanding, consistent with the worker's own statement.

8. **V-005 correctly kept separate**, and the worker is right that removing the edge
   overlay means V-001 no longer amplifies it. The underlying leak is untouched and
   still real.

**Verdict:** PASS

**Gate transition:** `AWAITING AUDIT` → `AWAITING HUMAN`. Per the merge gate, V-001
now needs an explicit `ACCEPTED` from the operator before it is ready to merge.
The specific thing to eyeball is `docs/audit/v-001/09-station-remediated-b238423.png`
and `10-hull-closeup-remediated-b238423.png`: confirm the station green reads as the
correct faction identity colour and the nebula stays subordinate to HUD legibility.

### 2026-07-27 — Operator — human — V-001 live-preview authorization

**Branch/commit:** `codex/visual-upgrade-v1` at audited branch tip `c41a312`, containing
remediation commit `b238423` and the auditor's `PASS` evidence.

**Human feedback:** "accept.. I can only confirm changes are correct AFTER the changes
go live"

**Disposition:** accepted for deployment to a browser-accessible preview. This is not
yet final visual acceptance and does not authorize the upstream merge. The operator will
review the hosted build before the human merge gate closes.

**Verdict:** final `ACCEPTED` pending live review.

**Gate transition:** none. V-001 remains `AWAITING HUMAN` until the hosted preview is
reviewed; live-preview deployment is authorized.

### 2026-07-27 — Operator — human — visual direction reference and next slices

**Reference:** screenshot from the unrelated Homeworld-style "one shot" project that
started this review. It is a mood and composition reference only; VOIDRUNNER remains a
first-person trading/combat game and should not inherit RTS interface conventions that
do not fit its play.

**Human feedback:** three concrete opportunities were identified, with more feedback
still to come:

1. Planets need gradients or surface patterns so they read as places rather than plain
   coloured spheres. The useful cue in the reference is layered large-scale variation:
   lit and shadowed regions, bands, terrain-like breakup, and rings—not asset density
   for its own sake.
2. The HUD's current perimeter is only a basic outline. It should suggest a physical
   ship cockpit through thicker structural members, inset panels, and a recognizable
   silhouette while preserving the crisp vector instrumentation and central view.
3. The initial spawn is too far from meaningful entities. The opening composition
   should put a station, traffic, planet, or other point of interest close enough that
   the player encounters the game immediately rather than spending several minutes in
   empty transit.

**Proposed slice boundaries:** V-006 owns planet surface presentation only; V-007 owns
cockpit/HUD framing only; V-008 owns initial placement and safety only. Do not bundle
them into one implementation or treat the Homeworld screenshot as a pixel target.

**Acceptance direction:**

- V-006 should show visible large-scale planet variation at normal play distance with
  no texture shimmer, obvious UV seam, or loss of terminator readability.
- V-007 should look like a cockpit at a glance without covering target brackets,
  warnings, radar, or the central combat view; ship-specific variation is desirable but
  not required for the first slice.
- V-008 should place a clearly identifiable non-hostile point of interest within a
  short flight while preserving collision clearance and a safe reaction window.

**Verdict:** direction recorded; implementation intentionally not started while more
human feedback is pending.

**Gate transition:** none. V-006, V-007, and V-008 enter the checklist as `PROPOSED`.

### 2026-07-27 — Claude — auditor — V-001 live preview verification

**Live preview:** <https://grandbeggar.github.io/voidrunner777/>

**Branch/commit:** GitHub Pages on the `GrandBeggar` fork was already enabled and
configured to serve `codex/visual-upgrade-v1` from the repository root. The most recent
successful build is `afa0733`, which is the current branch tip, so the hosted build is
current rather than stale. The fork was already public, so publishing exposed nothing
that was not already readable.

**What was verified:** that the *hosted* build actually serves the remediated V-001
renderer. A hosted build differs from the local one in three ways that could each mask a
regression — HTTPS rather than plain HTTP, a `/voidrunner777/` subpath rather than root,
and a jsDelivr CDN fetch for Three.js — so the local `PASS` does not automatically carry
over and was re-checked against the live site rather than assumed.

**Evidence:** loaded the live URL headless at 1280 × 720, started a game, and read the
renderer state actually in effect:

| Property | Live value | Meaning |
|---|---|---|
| `_renderer.toneMapping` | `1` | `LinearToneMapping` — the remediation. ACES would be `4` |
| `_renderer.toneMappingExposure` | `1.0` | remediated exposure |
| `_renderer.outputColorSpace` | `srgb` | retained |
| `_scene.environment` | present | reflection environment retained |
| `_scene.background` | present | nebula retained |
| `THREE.REVISION` | `160` | CDN served the expected build |

Station hull, same fixed region and camera offset as both prior audits: mean RGB
23.8 / 155.1 / 125.9, mean saturation **0.823** — consistent with the local `b238423`
reading of 0.833 within spawn and render variance, and decisively not the ACES value of
0.632. The live build is the remediated one, confirmed by two independent signals.

HTTP 200; 0 page errors; 0 failed requests; 0 PMREM `sigmaRadians` warnings. The only
console output is the pre-existing Three.js global-build deprecation warning (tracked as
V-003) and a `favicon.ico` 404, which is cosmetic and pre-existing. Live capture is
committed as `docs/audit/v-001/11-station-live-preview-afa0733.png`.

**Findings and open risks:**

1. The preview needs a **desktop browser**. VOIDRUNNER uses mouse aim plus keyboard
   thrust and hides the cursor; there is no touch input path, so the hosted build will
   not be reviewable on a phone or tablet. Worth knowing before opening the link.
2. Pages serves whatever `codex/visual-upgrade-v1` points at, so any future push to
   this branch silently republishes. If the operator's review needs a frozen build, the
   reviewed commit should be pinned or tagged rather than left tracking the branch tip.
3. The favicon 404 is the only unresolved console noise and is not worth a slice on its
   own; folding it into any later slice that touches `index.html` would be cheapest.

**Verdict:** n/a — deployment verification, not a code audit. The prior `PASS` on
`b238423` stands and is now confirmed to be what the hosted build actually runs.

**Gate transition:** none. V-001 remains `AWAITING HUMAN`. The live-review precondition
the operator set is now satisfied: the changes are live and independently confirmed correct
at the hosted URL, so the final human verdict is unblocked.

### 2026-07-27 — Claude — auditor — terminology redaction pass

**What changed:** at the operator's instruction, individual names were removed from this
file and replaced with the role term "operator". This touched prior ledger entries,
which the append-only rule would normally protect, so it is recorded here rather than
applied silently. No verdict, gate transition, commit SHA, measurement, or decision path
was altered — the edit is purely who-is-named, not what-was-decided.

**Scope:** 16 occurrences across this file only; no other tracked file contained the
names. The `Human gate` column header and the `AWAITING HUMAN` status label were left
unchanged: both are role-generic rather than personal, and `AWAITING HUMAN` already
appears in historical gate-transition records, so renaming it would have meant editing
recorded state history for no privacy benefit.

**Known limitation:** the names persist in already-pushed commit messages, notably
`c41a312` and `9a43d39`. Removing them would require rewriting and force-pushing
published history, which is not warranted for a naming change; this entry is the
correction of record instead.

**Verdict:** n/a — editorial pass.

**Gate transition:** none.

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
