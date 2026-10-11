# Validation evidence

Verified locally on October 11, 2026. This project contains sixteen playable chapter missions, sixteen editable Blender island scenes, an overview scene and the articulated human scene. Assets were authored/exported using Blender 5.2.1 LTS and loaded by Three.js.

## Engine and gameplay

`npm test`: 52 tests passed, zero failures. Coverage includes chapter defaults and solutions, meaningful policy alternatives, input bounds, hash assignments/migration, token traces, quorum/version selection, clock rollback, collision-safe IDs, crawl coverage, notification deduplication, feed fanout, reconnect replay, trie freshness, video buffer behavior and file-block transfers.

All sixteen chapters were exercised through real browser controls in the disk-opened offline edition: each default produced an unsuccessful trial and a chapter-specific consequence; each solution restored its beacon with all objectives met and a score of 100/100. The recorded outcomes are in [offline-trials.json](offline-trials.json). All 48 stars persisted after reload. These full gameplay checks preceded the final visual-only retro refinement; final control editing, trial, focus and dialog checks were repeated for the new interface.

Chapter16's regional incident was checked explicitly with five and six configured nodes: respectively two and three survived, and the reduced count remained visible through the debrief. Reset architecture cleared the incident.

## Authored assets and access

`npm run validate:assets` passed. It checks sixteen GLB headers, embedded buffers/textures, named landmarks, terrain, beacons, unique entrance/exit roles, workstations, terrain navigation boundaries, .46-height door metadata and corresponding native `.blend` sources. It also validates the human prefab and four limb pivots. The environments total 13.63 MiB; the worker is 163.5 KiB.

Every building opening is physically cut from its body in Blender. Each world has separately colored entrance/exit arches. Workers use scale .32, yielding about .38 scene-unit height relative to .46 openings. The chart applies the island scale to its workers too.

All sixteen worlds' exported navigation graphs were checked using the actual current GLBs and production navigation helpers. There are 90 connected workstation routes (180 entry/exit paths); sampling each segment at .025-unit intervals found zero intersections with the authored conservative footprints. Evidence: [navigation-checks.json](navigation-checks.json).

An independent geometry check also projects convex hulls from actual exported vertices at21 collapse phases, using the production deformation transforms and .10 worker clearance. All16 chapters have zero route intersections with those deformed collider meshes, including gate posts. The earlier fixed envelope missed tall-structure sweeps; the final implementation derives swept bounds from actual geometry. Evidence: [deformed-clearance.json](deformed-clearance.json).

Actual current-source browser checks loaded sixteen worlds and 32 chart workers, with zero walking intersections. Stopped refuge residents keep a neutral pose instead of appearing to maintain buildings when workforce is zero. Chapter1 and16 controller lifecycle checks confirmed departures at the exit, arrivals at the entrance, and safe reduced-motion poses. Chapter16 was visually inspected during walking, staffing loss, repair and reduced-motion restoration. Repeated navigation retained at most one geometry-dispose listener per geometry.

## Interface and portable edition

The retro styling is defined in `src/styles.css`: chunky borders, solid shadows, square controls, lavender actions and serif/monospace typography. Three.js materials, lighting, water and scene styling retain their prior appearance. No decorative titles, subtitles or inline help notes were added.

The later authorized Motion integration uses the pinned14.1.0 dependency, `MotionConfig`, React motion elements and `AnimatePresence` for the noninteractive trial banner. Chapter panels enter without retaining stale controls. Native dialogs remain open through their exit before focus is restored. Reduced motion combines the OS preference with the saved game setting. The dependency installation audit reported zero vulnerabilities.

Desktop and responsive browser checks covered keyboard slider changes, checkbox Space, number/select/text editing, disabled controls during a trial, result focus, dialog Tab/Shift+Tab trapping, Escape and focus restoration. Widths390 and430 had no horizontal overflow. First-two-level offline screenshots are430 pixels wide and show the complete interface; [release-phone.json](release-phone.json) records dimensions.

The final Motion-enabled portable HTML was opened via `file://` with the browser context network disabled. All sixteen worlds plus the worker loaded. The chart has180 authored entry/exit paths. Every chapter's final controls were set through native DOM interactions, with healthy staffing, authored walking paths and zero reported path intersections. There were zero external HTTP requests and zero uncaught page errors. Saved progress remained48/48 after reload. Evidence: [release-runtime.json](release-runtime.json).

Chapters1–4 were then repeated through default-failure and solution-success traffic trials in that final production file, with all objectives met after repair. Evidence: [motion-offline-trials.json](motion-offline-trials.json). Production-file dialog and preference checks confirmed native modality during exit, inert closing content, trigger focus restoration, and both dynamically changed OS and game reduced-motion states with opacity1/transformnone. No runtime errors or external requests occurred: [motion-offline-ui.json](motion-offline-ui.json).

[release-assets.json](release-assets.json) records the portable size and SHA-256 hashes. All seventeen embedded GLBs decoded byte-for-byte identically to their exported files. There are no external script or stylesheet tags. The ordinary Vite build and the direct-open portable edition both build successfully.

The preview grid uses actual final browser screenshots, not concept art. It was inspected at728 pixels in light appearance and360 pixels in dark appearance, with all18 captures present and no console errors. Each thumbnail opens a larger view.

## Practical coverage

Metrics are deterministic teaching simulations with invented workloads, not production capacity predictions. Responsive browser captures are not physical-phone testing. WebGL and a modern browser are required; local progress persistence follows that browser's file-origin storage rules. An unavailable-storage fallback keeps the current session playable. Navigation and lifecycle checks cover authored conservative footprints and representative dynamics rather than a rigid-body physics simulation.

Independent review ran in fresh Codex processes whose actual runtime was verified read-only, approvals never, gpt-6.1-sol/high. The first final review found missing gate-post colliders; these were repaired in Blender and regenerated for all16 worlds. The follow-up review found no blocking defects in gate clearance, swept bounds, neutral refuge poses, Motion panels, reduced motion, or native modal exits. Its remaining request for current180-path production-file evidence was satisfied by the final offline run above.

The independent actual-vertex check is retained as `scripts/validate-crew.mjs` and can be repeated with `npm run validate:crew`; the checked-in tool itself passed after being made portable to this repository. It measures geometry against navigation rather than only checking the same metadata predicate used to construct paths.

## Public release packaging

The publication build was reproduced in a clean directory using the checked-in lockfile, `npm ci` and Node 22.23.1. Installation reported zero vulnerabilities; all 52 tests, asset validation, deformed crew-clearance validation and both build outputs passed. The source inputs were compared byte-for-byte with the working project before packaging.

Full installed license texts for all twelve bundled runtime/font packages are retained in `public/THIRD_PARTY_NOTICES.txt`. The static output copies this file, and the portable HTML embeds the identical notices as safely escaped, nonexecuting JSON. Its executable scripts and styles remain byte-for-byte identical to the previously browser-verified portable build. All seventeen embedded GLBs still decode identically to the exported models, with no external script or stylesheet dependencies. Updated size and checksums are in [release-assets.json](release-assets.json).

The shareable grid contains all sixteen desktop chapter captures and the first two responsive views. Its full PNG is 6,944 by 5,320 pixels; desktop screenshots retain their native pixel dimensions. The recorded local file URL in the public runtime evidence has its personal project path redacted.
