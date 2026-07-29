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
| V-001 | Tone mapping, sRGB output, procedural reflections, and subtle nebula backdrop | `ACCEPTED` | Initial `bdf4561`; audit remediation `b238423` on `codex/visual-upgrade-v1` | Claude auditor 2026-07-27: `CHANGES REQUESTED` on `bdf4561`, then `PASS` on `b238423` (saturation 0.632 → 0.833, PMREM warnings 2 → 0) | Operator 2026-07-27: `ACCEPTED` after live review — "i don't see any issues. nothing is super noticeable yet." Ready to merge |
| V-002 | Low-threshold bloom for emissive bullets, particles, and engines | `DEFERRED` | Requires a post-processing pipeline and a measured frame-time budget. Re-audit note: Linear tone mapping leaves ~27% of the station hull region hard-clipped, so bloom will key off far more area than the baseline look implies — revisit tone mapping as part of this slice | — | — |
| V-003 | Consolidate legacy global Three.js and module Three.js loading | `DEFERRED` | Removes the r160 deprecation warning; broader loader migration | — | — |
| V-004 | Engine ribbons, thrust-responsive glow, and camera motion polish | `PROPOSED` | Not started | — | — |
| V-005 | Dispose capital-ship component groups on removal | `PROPOSED` | Pre-existing leak found during the V-001 audit at `src/renderer-threejs.js:735` and `:431`; groups are removed from the scene but never disposed | — | — |
| V-006 | Give planets authored-looking gradients, bands, or procedural surface patterns | `ACCEPTED` (audit gate open) | Branch `claude/v006-planet-surfaces`; `3cb8da7` then remediation `fba96e5`. Terrestrial disc dynamic range roughly doubled (Terra 25.6 → 65.4, Mars 21.2 → 51.3); seam <1/255 | Pending — needs an auditor other than Claude, who wrote this slice | Operator 2026-07-28: Jupiter good, Terra wanted clearer cloud/land/water separation — remediated in `fba96e5`; operator 2026-07-28: `ACCEPTED` |
| V-009 | Atmospheric rim halo around planet limbs | `AWAITING AUDIT` | Operator feedback 2026-07-28 (No Man's Sky reference). Branch `claude/v006-planet-surfaces`, commit `fba96e5`. Impact-parameter shader; limb glow decays to background over ~28px | Pending — needs an auditor other than Claude | Operator 2026-07-28: `ACCEPTED` — "that looks excellent" |
| V-007 | Replace the basic HUD outline with a cockpit-like ship silhouette and structural framing | `ACCEPTED` (parked) | Branch `claude/v007-cockpit-frame`; commit `a80e567`. Centre view and warning row measured unchanged (22.78 → 22.77, 17.20 → 17.22) | Pending — needs an auditor other than Claude | Operator 2026-07-28: `ACCEPTED` — "ya this is fine", but HUD treated as placeholder pending upstream direction |
| V-010 | Stations as assembled structures instead of convex-hull blobs | `AWAITING AUDIT` | Branch `claude/v010-station-structure`; commit `78d5abe`. Spawn-view cost 74 → 78 draw calls, 22490 → 25716 tris | Pending — needs an auditor other than Claude | Pending |
| V-013 | Station plating and two-tone materials | `ACCEPTED` (audit gate open) | Branch `claude/v013-station-texture`; commit `ee6ac67`. Saturation spread 0.150 → 0.281, near-neutral pixels 0.2% → 11.6%, mean hue held 156.5 → 147.6 | Pending — needs an auditor other than Claude | Operator 2026-07-28: `ACCEPTED` — "much better already" |
| V-011 | Plated materials for all convex-hull manufactured objects — ships, pirate bases, capital components, launch zone | `ACCEPTED` (audit gate open) | Branch `claude/v011-hull-plating`; commit pending. Box-projected UVs + per-face vertex tones; 48/48 NPC hulls carry both; separate ship/station plating dialects added in `7ad5290`; no draw-call increase | Pending — needs an auditor other than Claude | Operator 2026-07-28: `ACCEPTED` — "looks good" |
| V-012 | Asteroid rock map and cargo crate plating | `ACCEPTED` (audit gate open) | Branch `claude/v012-rock-and-cargo`. Asteroids get a dedicated crater/mottle map with radius-scaled UVs; cargo crates rebuilt non-indexed with crate-scale UVs. No draw-call increase | Pending — needs an auditor other than Claude | Operator 2026-07-28: `ACCEPTED` — "looks good" |
| V-008 | Start the player closer to stations, traffic, or other meaningful entities | `ACCEPTED` (audit gate still open) | Branch `claude/v008-spawn-proximity`; implementation commit `c3a417c`. Nearest station 6159u → 795u; nearest entity 5500u → ~431u; no hazard alarm across 16 runs | Not performed — Claude wrote this slice and cannot audit it | Operator 2026-07-27: `ACCEPTED` — "ya good" |

| V-014 | Projectile, particle and star point sprites | `ACCEPTED` (audit gate open) | Branch `claude/v014-projectiles`. `THREE.Points` had no map, so every bolt, spark and star drew as a hard square. Soft radial sprites; bullets and sparks additive, stars left on normal blending | Pending — needs an auditor other than Claude | Operator 2026-07-28: `ACCEPTED` — "definitely better than the cubes that they replaced" |

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

### 2026-07-27 — Operator — human — V-001 live review and acceptance

**Branch/commit:** hosted preview at <https://grandbeggar.github.io/voidrunner777/>,
build `afa0733`, containing remediation `b238423`.

**Operator feedback, verbatim:** "i don't see any issues. nothing is super noticeable
yet."

**Disposition:** `ACCEPTED`. The live-review precondition set earlier is satisfied — the
build was reviewed running, not from screenshots, and nothing is broken. Recorded as
acceptance of correctness, not as a claim that the slice is visually impactful.

**Signal worth carrying forward:** "nothing is super noticeable yet" is the more useful
half of this feedback. V-001 was deliberately conservative — restrained nebula, subtle
reflections, and after remediation a tone-mapping change that mostly *restores* the
original colour rather than adding anything. The measured deltas were real but small at
normal play distance. Later slices should be judged partly on whether a player notices
them without being told to look, and V-006 through V-008 are all better positioned to
deliver perceptible change than V-001 was.

**Verdict:** ACCEPTED

**Gate transition:** `AWAITING HUMAN` → `ACCEPTED`. Both merge-gate conditions are now
met: auditor `PASS` on `b238423` and operator `ACCEPTED`. V-001 is ready to merge
upstream whenever the operator wants the PR opened.

### 2026-07-27 — Claude — worker — V-008 opening spawn placement

**Role note, read first:** I audited V-001. For V-008 I am the *worker*, so the rule
that a worker does not approve its own work applies to me here. Nothing below is a
verdict; V-008 needs an auditor who did not write it — Codex, or the operator directly.

**Branch/commit:** `claude/v008-spawn-proximity`, branched from `205f9c6` (the V-001
branch tip, so the preview keeps V-001's accepted renderer). Implementation commit
`c3a417c`. Work was done in a separate worktree so the operator's uncommitted changes in
the main tree were never staged or disturbed.

**Measured problem:** at 1280 × 720 with the default shuttle (max speed 220 u/s), the
player started at the system origin with:

| | Baseline | After |
|---|---|---|
| Nearest station | 6159 u (TERRA INDUSTRIAL) | 795 u |
| Nearest entity of any kind | 5500 u (Terra) | ~431 u (freighter) |
| Transit time to nearest point of interest at full throttle | ~25 s | ~2 s |
| Nearest hostile | 13466 u | 12730 u |

**What changed:** `src/game.js` only, +53 lines, no deletions. Adds `placeOpeningSpawn()`
and `spawnPosClear()`, called once from `init()` after `G.asteroids` is built and before
the NPC spawn block. The spawn point is offset from the first non-criminal station,
backed off along -Z so the identity start orientation looks straight at it, and nudged
laterally away from whichever planet that station orbits.

**Why computed rather than hardcoded:** TERRA INDUSTRIAL orbits Terra at 825 u, but
Terra's atmosphere warning fires at `r*1.08*2.5` = 918 u — so the station sits *inside*
its own planet's warning ring. A naive "spawn next to the station" would have started
every game with a pulsing red hazard alarm. The lateral nudge plus hazard check avoids
that, and the same check keeps the placement valid if a system layout changes. If no
candidate clears, it returns the legacy origin rather than risk a hazard.

**Evidence:** `node --check` passes on all 16 `src/*.js`; `git diff --check` clean; the
game launches with no page errors. Spawn state was probed over **16 runs** (NPC placement
is random, so one run proves nothing):

- `_atmoDanger` false in every run; `_proxDanger` false in every run.
- No armour or structure loss at spawn in any run; never auto-docked.
- Minimum planet-surface clearance 970 u; minimum asteroid clearance ~12100 u.
- Minimum hostile distance 12730 u — no hostile spawn trap.

**Collision safety is structural, not just observed.** Station-spawned NPCs are placed in
a 150–650 u shell around the station (`spawnNPC` in `src/npc.js`), and the player sits
795 u from the station centre, so the closest any station-spawned NPC can *ever* be at
t=0 is ~145 u. Combined hull sizes are under ~40 u, so a spawn collision is not merely
unobserved, it is unreachable by construction. The closest observed was 148 u, which
matches that floor.

**Captures:** `docs/audit/v-008/01-spawn-before-205f9c6.png` and `02-spawn-after.png`,
same viewport and both 300 ms after launch. The opening view goes from an essentially
empty starfield to the station, Terra, Luna, and roughly a dozen traffic contacts in
frame, with a target readout already populated.

**Findings and open risks:**

1. **Scope is the initial spawn only.** Arrival after a jump still uses the launch-zone
   placement in `loadSystem`, which this slice does not touch. If empty transit on
   arrival is also a complaint, that is a separate slice.
2. **Other systems are untested.** Only SOL was measured. The placement is computed, so
   it should hold elsewhere, but PROXIMA, SIRIUS, and VEGA have not been probed — an
   auditor should check at least one other system, especially one where the first lawful
   station orbits a large planet.
3. **The tuning constants are judgement, not derivation.** `SPAWN_BACK` 750,
   `SPAWN_LATERAL` 250, and `SPAWN_CLEAR` 200 were chosen to put the station at a
   readable on-screen size while clearing hazards; they are worth an opinion at the
   human gate rather than acceptance by default.
4. **This changes difficulty, not just composition.** Starting beside a busy hub means
   traffic, corporate security, and militia are immediately in sensor range. Nothing
   hostile is nearby, but the opening is no longer quiet, which is a design change the
   operator should confirm is wanted.

**Verdict:** n/a — worker entry.

**Gate transition:** `PROPOSED` → `AWAITING AUDIT`.

### 2026-07-27 — Operator — human — V-008 acceptance

**Branch/commit:** `claude/v008-spawn-proximity` at `525844d`, reviewed on the hosted
preview.

**Operator feedback, verbatim:** "ya good"

**Disposition:** `ACCEPTED`. This also resolves the open design question raised in the
worker entry — the busier, no-longer-quiet opening is wanted, not an unintended side
effect.

**Outstanding gate, recorded rather than glossed:** no independent audit was performed.
Claude wrote this slice, so under the participants rule it cannot supply the auditor
`PASS`, and the merge gate requires both an auditor `PASS` and an operator `ACCEPTED`.
V-008 is therefore operator-accepted but not yet merge-ready by the file's own standard.
Two ways to close it: have Codex audit `c3a417c` independently, or have the operator
explicitly waive the audit for this slice and record that waiver here. The three open
risks from the worker entry are also still unexamined by anyone but their author —
untested systems beyond SOL, judgement-based tuning constants, and scope limited to the
initial spawn rather than post-jump arrival.

**Verdict:** ACCEPTED

**Gate transition:** `AWAITING AUDIT` → `ACCEPTED` on the operator gate. The auditor gate
remains open.

### 2026-07-27 — Claude — worker — V-006 procedural planet surfaces

**Role note:** as with V-008, I am the worker here and cannot supply the auditor `PASS`.

**Branch/commit:** `claude/v006-planet-surfaces`, branched from `75c2dd3` (the V-008 tip,
so the preview carries V-001 and V-008 too). Implementation commit `3cb8da7`. Worked in
a separate worktree; the operator's uncommitted changes were never touched.

**What changed:** `src/renderer-threejs.js` only, +108 / −3. Adds `_seededRand()` and
`_buildPlanetTexture()`, and gives each planet an equirectangular albedo map: latitude
banding, large-scale blobs, and polar caps. Planet type comes from radius — gas giant
above 400 u, moon below 150 u, terrestrial between — so it generalises to systems we
have not authored rather than keying off planet names.

**Two constraints drove the construction:**

- *No UV seam.* Bands are drawn as a vertical gradient, so they are constant in u and
  cannot seam at all. Blobs are drawn three times, at −W, 0 and +W, so anything crossing
  the wrap matches itself on the far edge.
- *No shimmer.* Features are large and low-frequency, mipmaps are on, and anisotropy is
  set to the hardware maximum (16 on this machine).

**Evidence:** `node --check` passes on all 16 `src/*.js`; `git diff --check` clean; no
page errors. V-008's spawn placement still measures 796 u to the station with the
nearest hostile at 12935 u, so this slice did not disturb it.

Seam continuity was measured, not eyeballed. Texture columns 0 and W−1 are adjacent once
wrapped, so their difference is compared against an ordinary interior neighbour pair as a
control, on a 0–255 scale:

| Planet | Seam diff | Interior control | Ratio |
|---|---|---|---|
| Terra | 0.767 | 0.628 | 1.22 |
| Luna | 0.408 | 0.250 | 1.63 |
| Mars | 0.758 | 0.588 | 1.29 |
| Jupiter | 0.403 | 0.274 | 1.47 |

Every seam difference is below 1/255 — under a single quantisation step, therefore not
displayable, let alone visible.

Close-view luminance over a fixed box, before versus after:

| Planet | Mean before → after | Dark-side p05 before → after |
|---|---|---|
| Terra | 108.5 → 108.8 | 26.6 → 26.6 |
| Luna | 144.8 → 143.9 | 29.7 → 29.7 |
| Mars | 105.1 → 105.2 | 25.4 → 25.4 |
| Jupiter | 158.5 → 156.9 | 32.4 → 32.4 |

Brightness is preserved and **dark-side p05 is identical on all four bodies**, which is
the terminator-readability criterion met exactly rather than approximately. That is by
construction: `emissive` was deliberately left untouched, so the night-side lift is the
same value it always was.

**Two mistakes I made and corrected, recorded because the numbers would otherwise look
suspiciously clean:**

1. **Double colour-space conversion.** The first version rendered every planet ~35%
   darker (Terra mean 108.5 → 68.7) *with less* variation. `THREE.Color` stores
   linear-sRGB under colour management, but I wrote those values straight into an
   sRGB-tagged canvas, so they were linearised twice. Fixed with
   `convertLinearToSRGB()`; brightness then returned to within 0.3% of baseline. I only
   caught this because I measured against a baseline instead of just looking at the
   result — it read as "moody" rather than obviously wrong.
2. **Hue rotation turned Terra pink.** Strengthening the effect by rotating continent hue
   a fixed +0.30 sent Terra's blue to magenta and destroyed its identity colour — the
   exact failure mode the V-001 audit had already flagged for faction colours. Replaced
   with a blend toward a fixed green-ochre, which cannot overshoot regardless of base
   hue. Terra now reads blue with green landmasses; Mars reads rust with olive.

**Findings and open risks:**

1. **Impact is uneven across body types.** Jupiter's banding is the standout and is
   plainly visible; Terra and Mars are improved but still fairly soft. Given the
   "nothing is super noticeable yet" note on V-001, the operator may want terrestrial
   contrast pushed further. I stopped where I did because the previous step overshot
   into pink, and the honest position is that this is a judgement call for the human
   gate, not a solved problem.
2. **Only SOL was inspected.** Other systems use the same radius heuristic but were not
   viewed. A planet near a threshold — just under 400 u or just over 150 u — will flip
   type, which is worth an auditor's spot check.
3. **The radius thresholds are arbitrary.** 400 u and 150 u were chosen to sort SOL's
   four bodies correctly. They are not derived from anything.
4. **Texture memory grows with planet count.** Each planet now allocates a 1024 × 512
   canvas texture with mipmaps, roughly 2.7 MB of GPU memory per planet. SOL's four are
   trivial; a system with many bodies would not be. Disposal was added so they are
   released on system change, but the per-system ceiling is untested.
5. **No performance claim.** Frame time remains vsync-capped on software rendering here.

**Verdict:** n/a — worker entry.

**Gate transition:** `PROPOSED` → `AWAITING AUDIT`.

### 2026-07-28 — Operator — human — V-006 partial feedback, and V-009 requested

**Reviewed:** hosted preview at `0c29ac9`.

**Operator feedback, verbatim:** "Jupiter looks good.. Terra could use some work making
it look a bit more like clear cloud/land/water separation layers.. but overall, still an
improvement. one thing i noticed in no man's sky, is that there is usually a halo that
glows around perimeter/atmosphere on the planet.. We're obviously not going to do
textures at this implementation level, but I think a few small details can really make
the planets pop."

**Disposition:** V-006 is not rejected — "still an improvement" — but Terra is not
finished, so the slice reopens rather than passing. A new item, V-009, is registered for
the atmospheric rim halo, with a No Man's Sky screenshot supplied as a mood reference,
explicitly not a texture-fidelity target.

**Gate transition:** V-006 `AWAITING AUDIT` → reopened for remediation.

### 2026-07-28 — Claude — worker — V-006 remediation and V-009 atmosphere

**Role note:** still the worker on both; neither can carry my `PASS`.

**Branch/commit:** `claude/v006-planet-surfaces`, remediation commit `fba96e5` on top of
`3cb8da7`. Separate worktree; the operator's uncommitted work untouched.

**What changed:** `src/renderer-threejs.js` only. Adds `_buildCloudTexture()` and
`_buildAtmosphereMaterial()` with a small GLSL pair, and retunes the terrestrial surface.

**The atmosphere took three attempts, and the first two were wrong in ways only
measurement caught.** I probed a radial luminance profile across the limb rather than
trusting the screenshots, which is the only reason the first two failed:

1. **`BackSide` — invisible.** The shell's visible far hemisphere has normals pointing
   away from the camera, so the Fresnel term collapsed to nothing across the whole
   annulus. Profile just outside the limb read 16–18 against a 16.1 background: *fainter
   than the flat shell it replaced*, which had a 27 shelf. By eye it merely looked
   subtle; by measurement it was doing nothing.
2. **`FrontSide` Fresnel — inverted.** A Fresnel rim peaks at the *shell's* silhouette,
   not the planet's, so the profile rose from 19 at the limb to 55 at the outer edge and
   then cut off hard — the bright ring was in the wrong place, floating off the planet.
3. **Impact parameter — correct.** Driving the glow from the view ray's closest approach
   to the planet centre puts the peak at the planet's own limb, decaying outward to
   background over ~28 px. `smoothstep` keeps it at zero inside the disc so the near
   hemisphere cannot fog the surface.

A fourth pass was needed on strength alone: the first working version rendered a
saturated neon hoop (limb 214.8 against a 16 background). That capture is kept as
`docs/audit/v-009/07-rejected-neon-hoop.png` so the rejected look is on record, not just
described.

**Cloud layer:** terrestrial bodies get a second shell at 1.015 r with its own sparse
cloud map. My first attempt used 46 dense puffs and blanketed the surface — it destroyed
exactly the land/water separation the operator asked for, making Terra a hazy ball.
Reduced to 24 sparser, fainter puffs so ground stays visible beneath them. Ocean is
darkened to 0.80 and continents cut from 22 large blobs to 14 smaller ones, so water
dominates and coastlines read as shapes.

**Evidence:** `node --check` passes on all 16 `src/*.js`; `git diff --check` clean; no
page errors; V-008's spawn still measures 796 u to the station with the nearest hostile
at 12887 u.

Measured on a disc sampled strictly *inside* the planet silhouette, so the halo cannot
contaminate the surface numbers:

| Planet | Dynamic range before → after | Saturation before → after |
|---|---|---|
| Terra | 25.6 → 65.4 | 0.249 → 0.264 |
| Mars | 21.2 → 51.3 | 0.561 → 0.488 |
| Luna | 46.7 → 43.4 | 0.190 → 0.191 |
| Jupiter | 87.6 → 85.4 | 0.717 → 0.742 |

Terrestrial contrast roughly doubles while Luna and Jupiter stay within noise — a useful
control, since only terrestrial bodies were targeted. Terra's saturation is slightly
*up*, so identity colour was not eroded this time.

**Note on the earlier metric.** My first pass reported "dark-side p05 unchanged" from a
brightness-thresholded sample. That threshold also swept in the old flat atmosphere
shell, which sat just above the cutoff; removing the shell changed which pixels were
sampled and made p05 appear to leap (Luna 29.7 → 125.7) with no real lighting change.
The disc-masked metric above replaces it. The V-006 terminator conclusion still holds —
`emissive` is untouched — but it was reached with a contaminated instrument.

**Findings and open risks:**

1. **Halo strength is a taste call.** 1.20 for atmospheres, 0.30 for airless moons. The
   range between "invisible" and "neon hoop" is narrow and I landed it by eye against
   the reference. Easy to move either way.
2. **Mars gets clouds because the radius heuristic calls it terrestrial.** Defensible as
   dust haze, but it is a side effect of the threshold, not a decision.
3. **Mars lost some saturation** (0.561 → 0.488) from the cloud layer. Smaller than
   V-001's rejected wash, but it is the same category of drift and worth an opinion.
4. **Memory grew again.** Terrestrial planets now carry two 1024 × 512 textures instead
   of one, roughly 5.4 MB each. Both are disposed on system change.
5. **Still SOL-only, and no performance claim.**

**Verdict:** n/a — worker entry.

**Gate transition:** V-006 reopened → `AWAITING AUDIT`; V-009 `PROPOSED` →
`AWAITING AUDIT`.

### 2026-07-28 — Operator — human — V-006 and V-009 acceptance

**Branch/commit:** `claude/v006-planet-surfaces` at `8b73c1f`, reviewed on the hosted
preview.

**Operator feedback, verbatim** (one name redacted to `[the upstream owner]` per the
standing instruction to use role terms in this file): "hey that looks excellent,
especially considering it's not a complex texture map. I'm happy to proceed with that,
we'll see what [the upstream owner] has to say, but I'm sure he'll be happy with the
upgrade."

**Disposition:** `ACCEPTED` for both V-006 and V-009. The earlier "Terra could use some
work" feedback is resolved by `fba96e5`. Note that acceptance here is explicitly framed
against the implementation level — procedural canvas maps, not authored textures — so it
should not be read as a claim that the surfaces are finished art.

**Downstream review still expected:** the operator anticipates a further review by the
upstream repository owner. That is outside this file's gate structure; nothing here
binds it.

**Outstanding gate:** as with V-008, no independent audit exists for V-006 or V-009 —
Claude wrote both. Three slices are now operator-accepted without an auditor `PASS`, so
the merge gate as written is unmet for all three. This is worth resolving deliberately
rather than by accumulation: either Codex audits `c3a417c`, `3cb8da7` and `fba96e5`, or
the operator records a blanket waiver naming those commits.

**Verdict:** ACCEPTED

**Gate transition:** V-006 `AWAITING AUDIT` → `ACCEPTED` on the operator gate; V-009
likewise. Auditor gate remains open on both.

### 2026-07-28 — Claude — worker — V-007 cockpit framing

**Role note:** worker again; cannot supply the auditor `PASS`.

**Branch/commit:** `claude/v007-cockpit-frame`, branched from `9933dd8` (the V-006/V-009
tip). Implementation commit `a80e567`. Separate worktree; operator's uncommitted work
untouched.

**What changed:** `src/renderer.js` only, +89 / −33. `drawCockpit()` previously drew two
thin A-pillar polylines and a crossbar, which read as an overlay rather than a ship.
Adds `_canopyOpening()` and `_canopyFrame()`: everything outside a windscreen opening is
filled, then edged with a bright inner lip over a heavier dim member, with corner gussets
and pillar ribs. Console instrument blocks became recessed wells — dark fill, shadowed
top-left edge, lit bottom-right edge — instead of plain `strokeRect` outlines.

**Two construction details that matter for review:**

- The opening is traced by one helper used both to punch the hole (`fill('evenodd')`)
  and to stroke the edge, so the silhouette and its outline cannot drift apart.
- The outer fill rect runs from `-W,-H` to `2W,2H`. The whole cockpit is inside a
  `ctx.rotate(p.roll)`, so a viewport-sized rect would swing an uncovered corner into
  view during a roll.

**Ordering bug found and fixed during implementation:** the frame was first added at the
end of `drawCockpit`, which painted over the console that had been drawn earlier in the
same function — the dashboard vanished entirely. Moved ahead of the console. The bad
frame is kept as `docs/audit/v-007/03-rejected-frame-over-console.png`.

**Evidence:** `node --check` passes on all 16 `src/*.js`; `git diff --check` clean; no
page errors. Because the acceptance criterion is "does not cover target brackets,
warnings, radar, or the central combat view", the protected regions were measured
directly rather than judged by eye, at a fixed camera 900 u from station[0]:

| Region | Mean luminance before → after | Content before → after |
|---|---|---|
| Centre combat view | 22.78 → 22.77 | 6.57% → 6.64% |
| Warning row (H×0.22) | 17.20 → 17.22 | 1.40% → 1.44% |
| Crosshair box | 63.88 → 61.77 | 40.68% → 38.58% |
| Radar | 14.49 → 13.54 | 9.49% → 11.24% |
| Target readout column | 19.52 → 14.40 | 7.18% → 14.03% |

The centre view and warning row are unchanged to within a rounding step, so the frame
does not intrude on either. Radar and target-readout *content* rose, because those
instruments now sit against darker framing rather than open space — legibility improved
rather than degraded. The crosshair box moved slightly, which is NPC-position variance
between runs, not framing.

Whole-screen mean luminance fell 27.02 → 22.32, which is the intended effect: the
periphery is now structure instead of space.

**Findings and open risks:**

1. **Peripheral vision is genuinely reduced.** The opening is roughly 83% of width and
   70% of height, so ships at the extreme edges are now behind the frame. That is
   inherent to having a cockpit at all, but it is a gameplay change, not only a visual
   one, and deserves an explicit yes rather than passive acceptance.
2. **Tier variation is thin.** Rib count rises with hull tier, but all ships share one
   silhouette. The acceptance direction called ship-specific variation desirable but not
   required for a first slice, so this is deliberately unfinished.
3. **Only the default shuttle at 1280 × 720 was measured.** Other hulls change rib count
   only; other aspect ratios are untested, and the opening is defined in fractions of
   `W`/`H`, so an extreme aspect ratio could crowd the readouts.
4. **Roll was not measured, only reasoned about.** The oversized fill rect should make
   roll safe, but I verified it by construction rather than by capturing a rolled frame.

**Verdict:** n/a — worker entry.

**Gate transition:** `PROPOSED` → `AWAITING AUDIT`.

### 2026-07-28 — Claude — worker — V-007 correction: roll is inert

Correcting risk 4 of the previous entry, which said roll safety was "reasoned about
rather than captured".

I tried to capture a rolled frame on the live build by setting `G.p.roll` directly. The
capture came back upright, which sent me to the source: `src/player.js:152` sets
`p.roll = 0` unconditionally every frame, commented "Visual cockpit — no roll, keep HUD
stable". A/D roll the *ship* via its quaternion, but the cockpit overlay is deliberately
held level.

So the accurate statement is not "unverified" but "cannot occur": `ctx.rotate(p.roll)` in
`drawCockpit` is a no-op under current gameplay, and the frame cannot expose an
uncovered corner because it never rotates. The oversized fill rect is therefore
defensive cover for a path that is presently inert rather than a live requirement — it
costs nothing and would matter immediately if cockpit roll were ever switched on.

Worth knowing for whoever takes V-004 (camera motion polish): re-enabling cockpit roll
is a one-line change there, and this frame is already built to survive it.

**Verdict:** n/a — correction to a worker entry.

**Gate transition:** none.

### 2026-07-28 — Operator — human — V-007 accepted, focus redirected to 3D space

**Operator feedback, verbatim:** "ya this is fine, but let's focus on all of the space
elements first - I think the hud is just a place holder, and may require some nicer
rendering.. but im not sure what Dimman wants there, so let's just focus on what we know
is roughly rendered place holders in the actual 3d space"

**Disposition:** V-007 `ACCEPTED` but parked. The HUD is regarded as placeholder work
whose direction belongs to the upstream owner, so no further HUD slices should be opened
speculatively. V-004 (camera motion polish) is HUD-adjacent and should be treated as
parked for the same reason until direction exists.

**New direction:** prioritise geometry that is obviously placeholder *in the 3D scene*.
Registered as V-010 (stations), V-011 (ship hulls) and V-012 (cargo, asteroids, pirate
bases, landing zones), in that order — stations first because the player now spawns
795 u from one, making it the most-looked-at object in the game.

**Gate transition:** V-007 `AWAITING AUDIT` → `ACCEPTED`, then parked. V-010, V-011 and
V-012 enter the checklist.

### 2026-07-28 — Claude — worker — V-010 station structure

**Role note:** worker; cannot supply the auditor `PASS`.

**Branch/commit:** `claude/v010-station-structure`, branched from `1a029ec`.
Implementation commit `78d5abe`. Separate worktree; operator's uncommitted work untouched.

**The actual defect:** `mkStation()` in `src/data-models.js` is an 8-sided drum of 18
vertices, and `_convexHullGeo()` then discards everything concave about it. Every station
in the game was therefore a faceted ball. The model was never the problem — the convex
hull was, and no amount of model authoring survives it.

**What changed:** `src/renderer-threejs.js` only, +140 / −2. Stations now build an
assembled structure: central spine, docking drum with tapered collars, habitat ring, four
spokes, polar docking pylons, two masts, and an emissive window band. Built around +Y
because `drawFrame` already spins stations on `rAngle` about Y — so the ring turns in its
own plane instead of tumbling end over end. Outer radius is ~105 u, chosen to stay well
inside the 220 u landing-zone ring built by `buildLandingZones`.

**Draw-call discipline, because there is precedent.** The V-001 audit rejected a change
for taking the scene 62 → 95 draw calls, so a station made of a dozen separate meshes was
not acceptable. `BufferGeometryUtils` exists only in the module build this file does not
load, so `_mergeGeos()` is hand-rolled: it bakes each primitive's matrix into position and
normal data and concatenates. Structure collapses to one draw call and the windows are a
single `InstancedMesh`, so a station costs two.

| | Before | After |
|---|---|---|
| Spawn-view draw calls | 74 | 78 |
| Spawn-view triangles | 22490 | 25716 |
| Close-view draw calls | 65 | 67 |
| Geometries resident | 74 | 78 |

Four visible stations for four extra calls. **No frame-time claim:** the median frame was
16.7 ms both before and after, which is vsync on software rendering and carries no
information either way.

**A disposal trap I walked into and backed out of.** My first version cached station
geometry per faction colour. `initSceneForSystem` disposes station children by traversal,
so the cache would have been freed out from under the next system load — jumping to
another system and back would have rendered nothing. Stations now build their own
geometry; two geometries per station, once per system change, is nothing against that
class of bug.

**Evidence:** `node --check` passes on all 16 `src/*.js`; `git diff --check` clean; the
only console output is the pre-existing `favicon.ico` 404. Captures in
`docs/audit/v-010/`, before and after at identical cameras.

**Findings and open risks:**

1. **`st.model` now feeds two divergent representations.** The 3D view ignores it; the 2D
   MFD and radar wireframes in `canvas.js` still draw it. The wireframe silhouette on the
   targeting display therefore no longer matches the 3D station. Deliberate — rewriting
   the MFD is out of scope — but it is a real inconsistency an auditor should weigh.
2. **Pirate bases were left alone.** They use the same convex-hull path and are still
   blobs. Keeping this slice to stations makes it reviewable; pirate bases should get the
   same treatment with a distinct silhouette, not a recolour. Logged under V-012.
3. **One silhouette for every station.** Faction identity is still carried only by colour.
   Type-specific variation (refinery, agricultural, military) is the natural follow-up.
4. **Window brightness is unmeasured.** The emissive band is set by eye at intensity 1.6.
   It should be checked against V-002, since bloom would key off it hard.
5. **Collision and docking are unchanged** — `dockR` 220 and the 350 u proximity alarm are
   game-state values this slice does not touch. But the station now *looks* bigger than
   the old blob, so the docking radius may feel wrong even though it is numerically
   identical.

**Verdict:** n/a — worker entry.

**Gate transition:** `PROPOSED` → `AWAITING AUDIT`.

### 2026-07-28 — Operator — human — V-013 requested

**Operator feedback, verbatim:** "space station shape is decent.. can we add a bit of
texturing to it to make it look less monochromatic"

**Disposition:** V-010's silhouette is accepted in substance; the complaint is surface,
not shape. Registered as V-013 rather than reopening V-010, since the geometry is not
what is being challenged.

**Gate transition:** V-013 enters the checklist.

### 2026-07-28 — Claude — worker — V-013 station plating and two-tone

**Role note:** worker; cannot supply the auditor `PASS`.

**Branch/commit:** `claude/v013-station-texture`, branched from `f03d9c0`. Implementation
commit `ee6ac67`. Separate worktree; operator's uncommitted work untouched.

**What changed:** `src/renderer-threejs.js` only. Three things:

1. `_mergeGeos()` now carries `uv` through and bakes an optional per-part `tint` into a
   vertex-colour attribute. The original version discarded UVs, so a texture map would
   have had nothing to sample — that had to be fixed before any plating was possible.
2. `_buildHullTexture()` draws a procedural panel map: plate rectangles, a two-level seam
   grid, hazard stripes and service blocks. Deliberately near-greyscale, because it
   *multiplies* the faction colour; a coloured map would have shifted hue, which is the
   exact failure V-001 was remediated for.
3. The station splits into two merged meshes — faction-coloured hull (drum, collars,
   ring, pylons) and neutral structural steel (spine, spokes, masts).

**Why the split was necessary, having first tried without it.** My first attempt used
vertex tints alone to pull the framework toward grey. It does not work, and the reason is
structural rather than a tuning miss: vertex colours *multiply* the material colour, so a
grey tint on a saturated green can only darken it. Multiplication cannot add the neutral
component that desaturation requires. A genuinely two-tone station needs a second
material, which costs one extra draw call per station — three total (hull, steel,
windows) against two in V-010 and one in the original blob.

**Evidence:** `node --check` passes on all 16 `src/*.js`; `git diff --check` clean; no
console output beyond the pre-existing `favicon.ico` 404.

Measured over the station's own pixels at a fixed camera, with NPCs cleared from the
scene so nothing else entered the sample box:

| | V-010 | V-013 |
|---|---|---|
| Saturation spread (sd) | 0.150 | 0.281 |
| Near-neutral pixels | 0.2% | 11.6% |
| Mean saturation | 0.878 | 0.723 |
| Mean hue | 156.5° | 147.6° |
| Mean luminance | 139.7 | 119.5 |

Saturation *spread* is the number that matters for "less monochromatic", and it nearly
doubled; roughly an eighth of the station is now genuinely neutral rather than
essentially none. Mean hue barely moved and both values are green, so faction identity
survived — checked deliberately, because "more variety" is exactly how the V-001
wash-out could have crept back in disguised as an improvement.

**A darkening I caused and corrected.** The first plating pass dropped mean luminance
139.7 → 108.6, about 22%. The map multiplies, so a mid-grey base map dims everything it
touches. Lifting the base tone and plate brightness recovered it to 119.5 while leaving
the saturation spread untouched at 0.281. The station is still slightly darker than
V-010, which is expected — seams and service blocks are genuinely dark — but it is no
longer dingy.

**Findings and open risks:**

1. **Draw-call counts vary run to run**, because NPC population is random and affects
   what is in frustum. Single-run comparisons of total calls are therefore noisy and I
   have not quoted them as a delta. The deterministic statement is the structural one:
   three draw calls per station, up from two.
2. **UV scale is per-part and hand-set.** Plate density is roughly even across pieces but
   was tuned by eye, not derived from surface area, so a future part could look
   over- or under-tiled.
3. **The plating map is shared by every station and faction.** Only the hue differs. At
   close range two stations will show identical plate layouts.
4. **Pirate bases and ships still use the old flat material** via `_meshMat`. `_hullMat`
   is ready for them, and V-011/V-012 are the natural place to apply it.
5. **Emissive window brightness is unchanged** and still unmeasured against V-002 bloom.

**Verdict:** n/a — worker entry.

**Gate transition:** V-013 `PROPOSED` → `AWAITING AUDIT`.

### 2026-07-28 — Operator — human — V-013 accepted, v1-breadth strategy set

**Operator feedback, verbatim:** "much better already.. ok.. let's keep going.. we can do
finishing passes over all of these objects later, but just getting them up to v1 makes a
huge difference."

**Disposition:** V-013 `ACCEPTED`. More importantly this sets a working policy: prefer
breadth across every placeholder object over depth on any one of them. Polish passes are
explicitly deferred, not forgotten. Slices should therefore be scoped to lift a whole
class of object to a credible v1 rather than perfecting a single one.

**Gate transition:** V-013 `AWAITING AUDIT` → `ACCEPTED` on the operator gate. Auditor
gate remains open.

### 2026-07-28 — Claude — worker — V-011 plated hulls across manufactured objects

**Role note:** worker; cannot supply the auditor `PASS`.

**Branch/commit:** `claude/v011-hull-plating`, branched from `c09caae`. Separate worktree;
operator's uncommitted work untouched.

**Scope chosen to match the v1-breadth policy.** `_modelToMesh()` is the single
constructor behind NPC and player ship hulls, pirate bases, capital-ship components and
the launch zone. Changing it once lifts all of them, which is why this slice is a sweep
rather than a ship-only change. Pirate bases were moved out of V-012 into this slice for
that reason — they were sitting next to freshly plated stations still looking like
untextured blobs.

**What changed:** `src/renderer-threejs.js` only. Two new helpers plus a three-line change
to `_modelToMesh`:

1. `_boxUVs()` — convex hulls carry no UVs at all, so V-013's plating map had nothing to
   sample on anything except stations. Each triangle is projected along its dominant
   normal axis. Cheap, seam-free for panel detail, and because the projection is in world
   units the plate size stays constant whether the object is a 12 u shuttle or a 75 u
   pirate base.
2. `_faceTones()` — per-face brightness baked into vertex colours from face normal plus a
   deterministic positional hash. Costs no extra draw call and no extra material, and
   stops a faceted hull reading as one moulded piece.

**Evidence:** `node --check` passes on all 16 `src/*.js`; `git diff --check` clean; no page
errors. Verified on the running game rather than by inspection: **45 of 45** live NPC hull
geometries carry both a `uv` and a `color` attribute, and the pirate base does too.

**Cost:** this is a material swap, not added geometry — same mesh count, same triangle
count, no new draw calls. Measured 72 calls / 25466 triangles at spawn, inside the normal
run-to-run range for a randomly populated scene. As noted in V-013, I am not quoting
call deltas as a headline because NPC population is random between runs; the meaningful
claim is structural: no mesh or material is added per object.

**Findings and open risks:**

1. **Asteroids deliberately excluded.** They use `_convexHullGeo` too and would pick up
   the machinery for free, but a *metal panel* map on rock would look wrong. They need
   their own mottled map, which is V-012. The pirate-base capture in
   `docs/audit/v-011/` shows both together and makes the remaining gap obvious.
2. **Cargo boxes excluded.** `BoxGeometry` already has UVs, but they are 0–1 across a
   3.2 u box, so the plating map would appear enormously magnified. They need the same
   world-scale treatment; also V-012.
3. **UV scale is a single global constant** (1/26). It suits shuttles through pirate
   bases, but a much larger or smaller hull would want its own scale.
4. **Every faction shares one plating map.** Only hue differs, same limitation as V-013.
5. **Capital-ship components now plate too**, which was not separately verified beyond
   the shared code path — an auditor should confirm a capital ship still reads correctly.

**Verdict:** n/a — worker entry.

**Gate transition:** V-011 `PROPOSED` → `AWAITING AUDIT`.

### 2026-07-28 — Claude — worker — V-012 asteroid rock and cargo crates

**Role note:** worker; cannot supply the auditor `PASS`.

**Branch/commit:** `claude/v012-rock-and-cargo`, branched from `7ad5290`. Separate
worktree; operator's uncommitted work untouched.

**What changed:** `src/renderer-threejs.js` only, +81 / −2.

1. **`_buildRockTexture()`** — a third surface dialect alongside station and ship
   plating. Panel seams on rock would have been plainly wrong, which is exactly why
   asteroids were held out of V-011 rather than swept in for convenience. Broad tonal
   mottling, impact craters drawn as a dark bowl with a lit rim on the sunward side, and
   fine speckle for close range. Mottling and craters are drawn at −S, 0 and +S in x so
   the map tiles without a seam, the same technique as the planet surfaces.
2. **Asteroid UVs scale off the asteroid's own radius** (`1 / max(12, r*0.55)`) rather
   than the fixed world scale used for hulls, so a 40 u rock and a 120 u rock show
   comparable surface detail instead of the large one looking polished.
3. **Cargo crates** rebuilt non-indexed so the shared `_boxUVs`/`_faceTones` helpers
   apply, then given the ship plating dialect. `BoxGeometry` UVs run 0–1 per face, which
   across a 3.2 u crate would have magnified the map into a single smear — the crate
   scale is set independently for that reason.

**A disposal detail worth stating, because it differs from V-010's trap.** The
clear-asteroids loop calls `material.dispose()`, so asteroid materials must stay
per-instance — a shared cached material would be freed out from under the next system
load, exactly the bug avoided in V-010. The *map* is safe to share, because disposing a
material does not dispose its textures. So the rock texture is cached once and every
asteroid material points at it.

**Evidence:** `node --check` passes on all 16 `src/*.js`; `git diff --check` clean; no
page errors. On the running game all 27 asteroids carry `uv`, `color` and a `map`. Draw
calls measured 71 at the pirate-base camera — this is a material and attribute change,
so no meshes, geometry or draw calls are added.

**Findings and open risks:**

1. **Landing zones deliberately untouched.** They are wireframe boxes with a beacon
   flash, and they read as holographic markers rather than physical objects. Texturing
   them would make them look like solid crates and would probably hurt legibility. If
   the operator wants them treated as physical, that is a separate decision, not an
   oversight.
2. **One rock map for every asteroid.** Crater placement is identical on all 27; only
   the hull silhouette and colour differ. At close range in a dense field this will
   repeat visibly.
3. **Crater lighting is baked, not lit.** The rim highlight assumes a fixed light
   direction, so it will not track the actual sun as an asteroid tumbles. Acceptable at
   v1 and cheap; a normal map would fix it properly.
4. **Cargo crates are 3.2 u** and almost always seen at distance, so this is the lowest
   visual return of the three changes. Included for completeness of the sweep.
5. **Bullets and particles remain point clouds** and were not part of this slice. They
   are the last obviously-placeholder element in 3D space — worth registering if the
   operator wants the sweep genuinely complete.

**Verdict:** n/a — worker entry.

**Gate transition:** V-012 `PROPOSED` → `AWAITING AUDIT`.

### 2026-07-28 — Claude — worker — V-014 point sprites

**Role note:** worker; cannot supply the auditor `PASS`.

**Branch/commit:** `claude/v014-projectiles`, branched from `644ab47`. Separate worktree;
operator's uncommitted work untouched.

**The defect:** all three `THREE.Points` clouds — bullets, particles and the star field —
were constructed with a bare `PointsMaterial` and no `map`. `THREE.Points` renders a
hard-edged square in that case, so every projectile, explosion spark and star in the game
was literally a square pixel. This was the last obviously-placeholder element left in the
3D scene.

**What changed:** `src/renderer-threejs.js` only. Adds `_spriteTex(kind)`, which builds
white radial-falloff sprites whose *alpha* does the shaping. Colour still comes from the
existing per-point vertex colours, so one sprite serves every weapon type and faction
without touching the game-state side. Three profiles:

| Sprite | Shape | Used by |
|---|---|---|
| `tracer` | tight bright core, small halo | bullets |
| `spark` | soft, wide falloff | explosion and debris particles |
| `star` | small core, gentle edge | star field |

**Blending was chosen per cloud rather than uniformly.** Bullets and particles are
additive: weapon fire and sparks are emitted light and should brighten what they cross
rather than occlude it, with `depthWrite` off so overlapping bolts do not cut each other.
The **star field deliberately keeps normal blending** — additive there would lift the
stars over the V-001 nebula and cost the backdrop the restraint that slice was
specifically remediated to protect. The sprite is applied only to round off the corners.

**Evidence:** `node --check` passes on all 16 `src/*.js`; `git diff --check` clean; no page
errors. Verified against real gameplay rather than a static scene — the trigger
(`mousedown`, `src/player.js:94`) was held for ~900 ms with the player parked facing a
station, producing 6 live bullets and 344 live particles at capture time. Material state
read from the running game: bullet cloud mapped and additive, particle cloud mapped,
star field mapped and still on normal blending. Draw calls 78, unchanged — this is a
material change on three existing clouds, nothing added.

**Findings and open risks:**

1. **Sizes were raised to suit the sprites** (bullets 1.5 → 3.4, particles 4 → 7, stars
   1.5 → 2.4). A soft falloff has less visual mass than a hard square of the same size,
   so keeping the old numbers would have made everything fainter. These are judgement
   values and are the most likely thing to want tuning.
2. **Additive fire will interact with V-002 bloom.** Combined with the ~27% hard-clipped
   area already noted under Linear tone mapping, bloom would key off projectiles hard.
   V-002 should be evaluated with this slice present.
3. **Bullets are still points, not stretched tracers.** True velocity-aligned streaks
   need per-bullet quads or a custom shader; at 300 max bullets that is a real cost
   decision, not a free change. Left for a polish pass.
4. **Star field size increase is the riskiest visual call here**, since the star field is
   always on screen behind everything. It is worth an explicit look on the live build.

**Verdict:** n/a — worker entry.

**Gate transition:** V-014 `PROPOSED` → `AWAITING AUDIT`.

### 2026-07-28 — Operator — human — V-014 accepted; 3D placeholder sweep complete

**Operator feedback, verbatim:** "ok, those are definitely better than the cubes that they
replaced haha"

**Disposition:** V-014 `ACCEPTED`. This closes the sweep the operator opened on
2026-07-28 when redirecting away from HUD work: every object then identified as
"roughly rendered placeholder" in the 3D scene has now been lifted to v1 and accepted —
stations (V-010, V-013), ships, pirate bases, capital components and the launch zone
(V-011), planets and atmospheres (V-006, V-009), asteroids and cargo (V-012), and
projectiles, sparks and stars (V-014). Spawn placement (V-008) and cockpit framing
(V-007) were accepted alongside.

**State of the register after this entry.** Nothing placeholder-shaped remains open. The
outstanding items are all previously-deferred engineering rather than v1 coverage:

- **V-002** bloom — should now be evaluated *with* V-014 present. Additive projectiles
  plus the ~27% hard-clipped hull area under Linear tone mapping mean bloom will key off
  weapon fire hard. The V-002 row already carries the tone-mapping caveat.
- **V-003** Three.js global/module consolidation — removes the r160 deprecation warning.
- **V-004** engine ribbons and thrust glow — note the V-007 correction: cockpit roll is
  inert at `src/player.js:152`, and the canopy frame is already built to survive it being
  switched back on.
- **V-005** capital-ship component group leak — pre-existing, found during the V-001
  audit, still untouched.

**The one thing that has accumulated rather than resolved.** Eight slices are now
operator-accepted with no independent audit: V-006, V-007, V-008, V-009, V-010, V-011,
V-012 and V-014. Claude wrote all of them and therefore cannot supply the auditor `PASS`
the merge gate requires. Every one is `ACCEPTED` on the operator gate and open on the
auditor gate. Two clean ways to settle it, and it should be settled deliberately rather
than by continuing to add slices:

1. Codex audits the set — the relevant commits are `c3a417c`, `3cb8da7`, `fba96e5`,
   `a80e567`, `78d5abe`, `ee6ac67`, `7ad5290`, `644ab47` and `81596f2`.
2. The operator records an explicit waiver naming those commits, which keeps the ledger
   honest about the fact that no second pair of eyes reviewed them.

Each worker entry lists its own open risks; the recurring ones across the sweep are
shared texture maps repeating across instances, hand-tuned constants (UV scales, halo
strength, point sizes), and SOL being the only system measured.

**Verdict:** ACCEPTED

**Gate transition:** V-014 `AWAITING AUDIT` → `ACCEPTED` on the operator gate. Auditor
gate remains open on all eight.

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
