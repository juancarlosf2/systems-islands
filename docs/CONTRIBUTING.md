# Contributing

Build and play instructions are in the [README](../README.md#build-locally). Use `npm ci` with the checked-in lockfile. Exported art is included, so normal development and builds need neither Blender nor the reference book PDF. The PDF and extracted full text are excluded from this public repository; contribute original mission prose, explanations and scenarios.

## Module responsibilities

Keep a change focused on the modules that own its behavior. When working alongside other contributors, agree on file ownership first and preserve their edits.

| Files | Responsibility |
| --- | --- |
| `src/game/levels.js` | Sixteen chapter schemas, controls, briefs, guide notes, objectives, landmarks and teaching workloads. |
| `src/game/simulation.js` | Deterministic evaluators, input bounds, metrics, event traces, suggestions and visual result data. |
| `tests/simulation.test.js` | Mission invariants, defaults/solutions, policy alternatives and simulation boundary cases. |
| `src/App.jsx`, `src/ui/` | Expedition state, trials, native controls/dialogs, keyboard behavior, progress and settings. |
| `src/World.jsx`, `src/world.css` | GLB loading, Three.js rendering, inspection, crew navigation, staffing, consequences and lifecycle cleanup. |
| `src/styles.css` | Retro DOM interface styling; world rendering is managed separately. |
| `scripts/build-worlds.py`, `scripts/build-worker.py` | Blender authoring, native scene saves, GLB exports, renders and manifest generation. |
| `art/blender/`, `art/renders/`, `public/models/`, `public/asset-manifest.json` | Editable scenes, art renders, shipped models and asset metadata. |
| `vite.config.js`, `scripts/build-portable.mjs`, `package.json` | Conventional static build and embedded offline packaging. |
| `docs/`, `output/` | Design contracts, validation records and browser screenshot evidence. |

See the [game plan's shared interfaces](GAME_PLAN.md#shared-interfaces) before changing contracts used by multiple modules.

## Edit a mission or simulation

Chapter IDs remain ordered 1–16. Each chapter has three objectives, original guide notes, named landmark keys, a teaching scenario and a complete control schema. Match defaults, selectable values and numeric bounds to the control definitions. A default should expose a meaningful problem; `solution` is a test fixture that meets every objective, not an automatic solve action in the UI.

Update the corresponding evaluator when changing a workload or architecture policy. `evaluateLevel(id, config, options)` must remain deterministic for the same inputs, avoid mutating its configuration, and return finite, serializable results. Preserve the result fields consumed by the interface and world, including metrics, objectives, traffic, events, debrief and optional `visual` data. Explain teaching assumptions and meaningful trade-offs instead of implying a strategy is universally correct. Chapter 16 remains an original combined-service capstone.

Add or adjust meaningful tests for altered behavior: failure/success boundaries, unit conversions, policy alternatives, lost or duplicate work, and correctness invariants. Test the actual consequence, rather than copying the evaluator's formula into a test. Inspect the affected chapter in the browser to confirm controls, debrief and world effects agree with the result.

## Edit Blender assets

The repository contains **eighteen native scenes**:

- `art/blender/chapter-01.blend` through `chapter-16.blend`: individual worlds.
- `art/blender/archipelago.blend`: overview assembled from the exported islands.
- `art/blender/worker.blend`: articulated human maintenance crew.

Assets were authored/exported with Blender 5.2.1 LTS, as recorded in [validation](VALIDATION.md). Keep camera, lights and materials editable in the native sources. Art renders in `art/renders/` are distinct from actual browser captures in `output/screens/`.

For reproducible regeneration, edit the authoring scripts, then run from the repository root. **`npm run assets` is macOS-specific**: it calls Blender in the standard macOS application location. With Blender available on your PATH, use this portable CLI alternative:

```sh
blender --background --python scripts/build-worlds.py
blender --background --python scripts/build-worker.py
```

Both scripts regenerate their outputs, overwriting corresponding native scenes, GLBs and renders. Preserve manual scene work before running them. The worlds script rebuilds the manifest; run the worker script afterward to restore its character entry. On a POSIX shell, regenerate selected islands with:

```sh
ISLAND_CHAPTERS=1,5,16 blender --background --python scripts/build-worlds.py
blender --background --python scripts/build-worker.py
```

Selected regeneration still rebuilds the overview from all sixteen existing GLBs, so retain the other exported islands.

For manual scene edits, save the `.blend` and export its runtime objects to the matching `public/models/chapter-NN.glb` or `worker.glb`. Use binary glTF, selected runtime objects, custom properties/extras and Y-up conversion; embed buffers/textures and exclude render-only sea/ground, lights and cameras. Include navigation/access empties as well as meshes. Review the corresponding `public/asset-manifest.json` entry to keep source, landmarks, counts and file size consistent. The authoring scripts show the export selection and options used by the game; running regeneration later recreates the scripted design.

Preserve the scene contract when changing geometry:

- Named terrain, beacon and landmark nodes, plus custom properties consumed by `World.jsx`.
- One entrance and one exit per island, exterior workstations, terrain walk boundaries and conservative obstacle footprints, including gate posts.
- Actual cut-out doorways and compatible scale: .46-unit openings, approximately .38-unit workers at .32 scale.
- Connected paths inside terrain, authored crossings, and clearance during configuration changes and damage deformation.
- Worker root and four named limb pivots: `worker`, `worker_arm_left`, `worker_arm_right`, `worker_leg_left`, `worker_leg_right`.

The game loads exported GLBs; saving only a `.blend` does not update what players see. The offline file must also be rebuilt after model changes.

## Validate a change

Run relevant checks from the repository root. For a change spanning gameplay, art or packaging, run the full sequence:

```sh
npm test
npm run validate:assets
npm run validate:crew
npm run build
```

`validate:assets` checks GLB structure, embedded resources, native sources, landmarks and crew metadata. `validate:crew` checks walking clearance against exported geometry under deformation. Neither replaces visual review of an altered island, entry/exit lifecycle, staffing, repair and reduced-motion poses.

For interface changes, check keyboard controls, focus, modal Escape/Tab behavior, narrow layouts and both game/OS reduced-motion preferences. For packaging or model changes, open **`dist/systems-islands-offline.html`** directly with networking disabled, and also serve the conventional build with `npm run preview`. Verify changed chapters load and run, with no missing assets or uncaught errors. Test saving/reloading where the browser permits storage.

Keep evidence scoped to what you actually checked. Responsive captures do not prove physical-device coverage; simulation metrics do not prove production performance. Update [validation notes](VALIDATION.md) when new evidence changes the coverage, and retain [third-party notices](../public/THIRD_PARTY_NOTICES.txt) when distributing builds.
