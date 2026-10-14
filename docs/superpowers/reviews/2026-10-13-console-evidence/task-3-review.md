# Task 3 source review

Reviewed range: `4c671a2..ba02fcfd74455f11d2e7f770b9d038034c22e583`, only `scene/build.py`. Read the filled actual reviewer template, Task 3 report, complete diff, affected builders and merge helpers, Blender validation probe and output, and downstream bake/export/optimization/render/finalization/runtime paths. No source/index/git mutation. `git diff --check` passes.

## Strengths

- Repairs the identified cause rather than masking the bake: 60° headphone smoothing is applied before merging, and the final blanket 38° pass no longer overwrites merged groups. Existing slipper overrides survive through the same mechanism (`scene/build.py:2168`, `2258`).
- Tessellation increases are bounded and localized: cup/cushion 16→24, band step 12°→8°, hero bevels 2→3. Actual Blender output is 26,820 build triangles, +640 (+2.44%), with 44 objects unchanged. Mouse geometry is deliberately retained.
- Weighted normals are restricted to the desk top and two stand parts, preserve sharp edges, and are applied before join. Actual measured broad-plane deviation is 0° before and after merge. The threshold is justified by the measured failed default configuration, not an unexplained global setting.
- The actual Blender probe measures geometry, not source strings: headphone 38–60° sharp edges are 0/336; hard cap edges remain 112/112 sharp. Every merged edge/sharp total is preserved. Fixed nodes/screens and the intentionally flat cat geometry match the baseline exactly.

## Issues

### Critical
None found in this source range.

### Important
None found in this source range. Pending aggregate asset/runtime verification is a shipping prerequisite, not a demonstrated defect in this source patch.

### Minor
None.

## Requirement alignment

- Rounded-part crease preservation, modest circumference/bevel detail, broad hard-plane normals, mouse/controller 55° smoothing: implemented and supported by actual Blender geometry evidence.
- Cat facets, node/screen geometry, desk arrangement and previous stand-foot removal: preserved by the diff and probe.
- Unchanged triangle ceiling: build result passes 40k; final exported count still must be checked.
- Complete fresh bake/export/optimization/screens/posters/finalization/import-check and matching-pose day/night comparisons: not yet demonstrated at this review. Final GLB ≤250KiB, atlas/poster budgets, coherent metadata/content hashes, and analytic handoff against the new GLB remain required.
- No defect in the relevant prop specification. The older night subsection says no rebake, but the explicit subsequent owner-scope override requires a fresh prop bake; apply that override. The optional pre-bake optimized-size check was not performed; the report correctly does not infer byte-budget success from source triangles.

## Dependent read/write paths

1. `scene/build.py` part constructors write geometry, materials and smoothing angles; `smooth()` writes polygon smooth flags and edge sharpness; `weighted_normals()` writes custom corner normals. Existing slipper calls now persist their intent rather than losing it later. The selected hero modifier changes normals only, and the three-segment bevel changes topology locally.
2. `scene/common.py:join()` joins part meshes into `static` / `desk_baked`, retaining transforms, mesh attributes, sharp flags and custom normals. The Blender probe explicitly verifies these joins. `build.py` saves the resulting `desk.blend`.
3. `scene/bake.py` reads that blend, rebuilds UVs, density-packs islands, and uses evaluated copies/proxies for ray visibility and lighting. Changed topology and normals alter baked lighting/UV packing, so **every dependent atlas must be regenerated**, not spliced from previous masters. Proxy copies preserve mesh data layers. The final `desk_uv.blend` and day/night PNG masters feed later stages.
4. `scene/export.py` reads the UV blend, collapses materials/strips build attributes, exports positions/UVs/normals and writes screen/pivot metadata. Fixed screen/node contracts were verified pre-export, but must survive the full export.
5. `scene/optimize.ts` replaces materials with unlit roles, strips non-screen normals, welds/quantizes/meshopt-compresses and writes statistics plus decoded import-check GLB. Therefore hero normal improvements reach runtime through the **baked atlases**, while circumference/bevel improvements also remain geometric. Normal removal is intentional and does not negate the bake fix.
6. `scene/screens.py` generates screen imagery; `scene/render_posters.py` reads the baked UV model and atlases for posters/OG/check renders; `scene/check.py` imports the decoded GLB to validate the exported UV mapping. All must use the same fresh cache.
7. `scene/finalize.py` encodes/hashes/publishes geometry, atlases, posters, OG and manifest, pruning old hashed assets and enforcing byte budgets. New UV packing makes old asset filenames invalid for the new GLB. `scene/run.sh` is the ordered producer for all these writes.
8. `src/scene/manifest.ts` / `src/scene/index.ts` load that manifest, GLB and themed atlases; assign baked materials to named groups; derive screen world corners; use scene meshes for ray occlusion/camera fitting and desk-height transforms. Node identities and pivots are retained, while camera occlusion and intro projection require regression against the regenerated GLB.
9. Page poster consumers, `tests/unit/scene-assets.test.ts`, scene browser tests and `scripts/budget.ts` depend on the generated paths, node/extension contracts, manifest statistics and asset sizes. Their final gates must run after publication of the coherent generated asset set.

No broken dependent path was identified in the source implementation. Paths 3–9 cannot be declared verified solely from the geometry report.

## Recommendations

Finish the existing aggregate pipeline and collect matching-pose close/desk day/night evidence, final budgets/import-check, and new-GLB handoff regressions before merge. Do not widen scope or increase budget ceilings to compensate for the extra topology.

## Declined to judge

- Final atlas shading/seams, night quantization/dither, poster coherence and hardware/GPU appearance: full bake and runtime evidence pending; the source range alone cannot prove them.
- Console loading, cancellation, typography, failure handling and cmatrix controls: separate source tasks; aggregate review must judge them, including new-GLB handoff.
- Final byte budgets, complete application gates, CI, PR/merge readiness and deployment: not completed in this focused source review.

## Assessment

**Source task approved: Yes. Aggregate ready to merge: No, pending planned verification.**

The source patch addresses the demonstrated crease/plane-normal causes at the responsible layer and preserves authored contracts with convincing Blender measurements. It is suitable for the current full bake; the branch still requires regenerated asset/runtime evidence and aggregate gates before merge.
