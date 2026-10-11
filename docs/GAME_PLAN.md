# Systems / Islands — complete build plan

## Product and acceptance boundary

Build an original, playable, single-player 3D systems-design expedition based on the **16 chapters in the supplied edition** of Alex Xu's *System Design Interview: An Insider's Guide*. Every chapter has its own Blender-authored environment, interactive mission, measurable success criteria, failure explanation, and replayable configuration. The chapter concepts inform the challenges; the shipped game contains original explanations, not scans or a redistribution of the book.

The final deliverables are the source project, editable Blender scenes, exported GLB environments, a detailed chapter design plan, a conventional static web build, and **one portable HTML edition that opens directly from disk with no server or internet connection**. No backend, account, analytics, remote AI, or paid service is needed. A development server is only a local preview tool.

## Creative direction

The player is the new architect of a little archipelago. Each island has a malfunctioning service. Requests are tiny orange courier marbles; servers are porcelain towers; queues become conveyors; replicas are vaults; network partitions break illuminated bridges. Make the system work and restore the island's beacon.

Use a tactile, matte, low-poly miniature aesthetic: pale turquoise sea, faceted stone island bases, sage and mint terrain, ivory buildings, warm terracotta roofs and request lights, golden walkways, dark teal outlines and interface text. The default orthographic three-quarter view must expose paths and buildings clearly. A consistent small service-robot guide, buoys, trees, docks, bridges, and beacons connect the levels without making them identical.

UI: editorial typography, a calm expedition chart, slim chapter rail, cream mission panels, dark ink copy, orange primary actions. The 3D world is the main surface. The user's later steering explicitly removes unnecessary titles and subtitles: no decorative headline, repeated chapter subtitle, or filler section labels. Keep text that identifies a chapter, explains an objective, labels a control, or describes an outcome; place deeper material in the field guide. No marketing landing page precedes play. HUD text and controls are real accessible HTML. Production environment geometry is modeled in Blender by the coordinator; image generation supplies only the concept reference, honoring the user's request to design the levels in Blender.

## Player loop

1. Explore the 3D expedition chart; select any numbered island or a chapter in the rail.
2. Enter the island. Read the service incident, three objectives, and short chapter field notes.
3. Inspect named 3D landmarks. Adjust architecture with chapter-specific switches, numeric controls, or strategy choices. Changes update the miniature world immediately.
4. Launch a traffic trial. Observe moving packets, overloaded nodes, dropped requests, and the outcome. Trials are brief, visibly progress, and can be canceled by leaving a level.
5. Read actual configuration-dependent metrics and an explanation of the dominant trade-off. Failure supplies a specific next experiment; it does not erase progress or permanently lock a chapter.
6. Earn up to three beacon stars. Save the best result locally, replay, or travel to the next chapter. Complete the capstone to obtain an expedition completion state.

All levels are directly accessible for study. The recommended route is chapter order. Separate exploration access from earned completion. Save only validated, versioned game progress and settings; handle unavailable or malformed localStorage without crashing. Support restart, sound toggle, reduced motion, keyboard controls, and narrow screens. Sound uses browser-generated tones after a user gesture, never autoplay or remote audio.

## Chapter design specifications

PDF page numbers below are file page positions, including front matter. Book statistics are illustrative, not claims about today's providers. Gameplay numbers are invented teaching scenarios, explicitly labeled as simulation values.

### 01 — First light: Scale from zero to millions of users

- **Source:** PDF pp. 5–33. Web/data separation, horizontal scaling, load balancing, caching, replicas, queues, sharding, observability.
- **Blender environment:** large terraced harbor island; incoming ferry dock, a load-balancer lighthouse, three deployment pads, cylindrical database vaults, cache pavilion, cream route bridges, trees and first beacon.
- **Incident:** the harbor's little app becomes popular and one machine cannot serve the arriving requests.
- **Actions:** select 1–6 web servers; activate a load balancer; adjust cache hit ratio; enable a read replica. Clicking the server landmark inspects the serving tier.
- **Simulation:** incoming read-heavy load is divided only when balancing is enabled; cache hits avoid database work; replicas enlarge read capacity; extra nodes consume coins. Bottlenecks include both web and data tiers.
- **Win:** serve at least 95% of requests, meet a latency target, and stay within the displayed budget. More machines alone must not bypass an unbalanced serving path or saturated database.
- **Feedback:** reveal the limiting tier and explain horizontal scaling versus cache/read offload. Traffic goes dock → lighthouse → servers → cache/vault.

### 02 — The observatory: Back-of-the-envelope estimation

- **Source:** PDF pp. 34–41. Powers of two, units, approximate capacity, average versus peak QPS, storage and availability.
- **Blender environment:** hilltop telescope, stacked storage blocks, golden measuring rings, three instrument pedestals, clock tower and celestial beacon.
- **Incident:** reserve enough compute and storage for a service before the launch boat arrives.
- **Actions:** estimate peak requests per second, daily storage in GB, and annual downtime in minutes for the supplied availability target. Display the scenario's DAU, requests/day, peak multiplier, object size, and retention period with units.
- **Simulation:** compute reference answers from explicit assumptions; measure relative error rather than require a single rounded integer. Storage must distinguish daily ingest from retained storage. Availability uses minutes per year.
- **Win:** each estimate is within a disclosed tolerance (e.g. 20%). Scores reward closeness; a unit mistake cannot win through guessing unrelated choices.
- **Feedback:** show worked formulas after the trial and a unit-aware hint before retrying. Animated instruments fill proportionally to selected capacity.

### 03 — Blueprint bay: A framework for system design interviews

- **Source:** PDF pp. 42–50. Understand scope, propose high-level design, deep dive, wrap up; collaboration and trade-offs.
- **Blender environment:** open architect plaza with four distinct stepping-stone stations, drafting pavilion, blueprint tile, discussion amphitheater and beacon.
- **Incident:** the island council has a vague brief and only a short design session.
- **Actions:** choose requirements clarification, initial architecture breadth, deepest risk to investigate, and wrap-up content. Each stage exposes concrete choices and consequences.
- **Simulation:** assess coverage of the four steps against a small supplied workload and correctness risk. A high-level diagram without requirements or an irrelevant deep dive must lose coverage.
- **Win:** satisfy scope, choose an architecture that covers the workload, investigate the stated bottleneck, and include limitations/next steps.
- **Feedback:** illuminate the four stations sequentially and explain why communication choices improve a design; avoid implying there is only one valid real-world architecture.

### 04 — The floodgates: Design a rate limiter

- **Source:** PDF pp. 51–70. Token/leaky buckets, fixed and sliding windows, distributed counters, responses, reliability.
- **Blender environment:** aqueduct island, two floodgate towers, token reservoir, pressure gauge, service turbine and overflow channel.
- **Incident:** legitimate bursts and an abusive client arrive together.
- **Actions:** choose token bucket or fixed window; set bucket capacity/window limit and refill rate; choose per-client versus global scope; enable shared atomic accounting.
- **Simulation:** run a deterministic timestamped request trace with client identities. Token balance refills over elapsed time; fixed windows reset at boundaries. Track admitted legitimate requests, blocked abuse, and overshoot caused by inconsistent counters.
- **Win:** admit legitimate traffic while protecting the service capacity, without one client consuming everyone's quota.
- **Feedback:** show accepted and throttled packets separately. Explain burst tolerance, fairness, boundary spikes, and why distributed accounting must be coordinated.

### 05 — The ring: Design consistent hashing

- **Source:** PDF pp. 71–86. Modulo rehashing, hash ring, clockwise ownership, virtual nodes and balance.
- **Blender environment:** circular garden ring, four radial server towers, floating key crystals, central compass, removable outer tower and ring beacon.
- **Incident:** add one server without relocating most of the island's keys.
- **Actions:** choose modulo or consistent hashing; select number of physical servers and virtual nodes; run the add-node event.
- **Simulation:** hash a deterministic set of keys and server/vnode identities; compare before/after ownership when one physical server joins. Compute migration fraction and maximum load/mean imbalance from the actual assignment.
- **Win:** keep migration below a stated threshold and distribute keys reasonably evenly. Virtual nodes improve balance but have a visible metadata cost.
- **Feedback:** animate only migrated keys and report measured ownership changes, not a canned benefit for selecting the expected algorithm.

### 06 — The vaults: Design a key-value store

- **Source:** PDF pp. 87–109. CAP under partitions, replication, tunable consistency, quorums, versioning, hinted handoff and anti-entropy.
- **Blender environment:** three fortified replica vaults connected by bridges; split river; repair hut; key crates; central quorum beacon.
- **Incident:** one replica becomes partitioned while writes continue.
- **Actions:** set read and write quorums for N=3; choose availability-first or consistency-first partition policy; enable repair after reconnection.
- **Simulation:** model reachable replicas, successful write acknowledgments, read overlap, stale versions, and post-partition repair. W+R>N is explained with assumptions; it is not presented as a universal guarantee for every distributed store.
- **Win:** meet the scenario's declared correctness requirement, explain/accept temporary write unavailability for consistency-first operation, and converge after healing.
- **Feedback:** show the partition bridge, the stale vault, rejected writes or stale reads, and repaired versions. CAP means a trade-off during a partition, not a permanent menu of three independent toggles.

### 07 — Snowflake summit: Design a unique ID generator

- **Source:** PDF pp. 110–118. Multi-master sequences, UUIDs, ticket servers, Snowflake fields, time ordering and clock issues.
- **Blender environment:** icy mint summit, clock spire, four little worker foundries, segmented ID assembly conveyor, snowflake sculpture and beacon.
- **Incident:** parallel workers must stamp unique, roughly time-ordered numeric IDs.
- **Actions:** select local counter, centralized ticket or Snowflake strategy; configure worker identity separation; configure backward-clock handling.
- **Simulation:** generate a batch of BigInt IDs from timestamp/worker/sequence fields; deliberately reuse timestamps and introduce a clock rollback. Count collisions, ordering inversions and successful stamps; never rely on unsafe Number precision for 64-bit IDs.
- **Win:** unique outputs, no unsafe emission on rollback, and distributed workers continue within the stated throughput target.
- **Feedback:** inspect an ID's fields and explain why UUID uniqueness alone does not satisfy a sortable 64-bit numeric requirement.

### 08 — Shortcut docks: Design a URL shortener

- **Source:** PDF pp. 119–131. APIs, 301/302 redirects, base62, hash collisions, persistence and caching.
- **Blender environment:** long winding route, short golden bridge, base62 encoder mill, redirect signpost, mapping archive and beacon.
- **Incident:** turn long destinations into compact links without sending visitors to the wrong place.
- **Actions:** choose truncated hash or base62 sequence; choose alias length; enable collision checks; select redirect policy and cache.
- **Simulation:** create a deterministic alias mapping for sample destinations; calculate alias namespace capacity; preserve mappings under collisions; replay repeated lookups to measure origin requests and latency.
- **Win:** all destinations resolve correctly, alias capacity covers the workload, and redirect latency meets the target. Both 301 and 302 can be valid depending on the stated analytics/update requirement.
- **Feedback:** packets visibly take the shortcut. Explain collision handling and permanent redirect caching versus origin analytics.

### 09 — The crawler gardens: Design a web crawler

- **Source:** PDF pp. 132–150. Frontier, traversal, politeness, robots exclusions, deduplication, parsing and robustness.
- **Blender environment:** branching greenhouse garden with page plinths, queue conveyor, robot scout, three domain gates, forbidden red garden and archive.
- **Incident:** explore a miniature web graph containing duplicate pages, cycles and disallowed links.
- **Actions:** select breadth-first or depth-first frontier; enable URL/content deduplication and robots rules; set per-host delay.
- **Simulation:** traverse an actual finite adjacency graph using a queue/stack, with host-aware timestamps and distinct content fingerprints. Count unique allowed pages, repeat fetches, forbidden requests and politeness violations.
- **Win:** discover the allowed graph, skip duplicates, obey exclusion and host delay, and finish within a generous crawl window.
- **Feedback:** light visited gardens; loops waste visible packets. Explain why politeness is host-scoped and why URL deduplication alone misses duplicated content.

### 10 — Signal station: Design a notification system

- **Source:** PDF pp. 151–165. Push/SMS/email, queues, retries, deduplication, preferences and observability.
- **Blender environment:** radio tower, three channel huts, durable mail conveyor, retry loop, preference gate and beacon.
- **Incident:** providers fail temporarily, and some residents have opted out.
- **Actions:** enable durable queue; set retries/backoff; enable idempotency keys; honor recipient preferences.
- **Simulation:** process a deterministic set of recipient/channel jobs with transient failures and duplicate delivery attempts. Track lost jobs, duplicate side effects, successful allowed deliveries and preference violations.
- **Win:** deliver permitted notifications after retry, suppress opt-outs and duplicates, and avoid runaway retry load.
- **Feedback:** failed deliveries loop back through the queue. Explain at-least-once attempts versus effectively deduplicated outcomes, without promising universal exactly-once delivery.

### 11 — The town square: Design a news feed system

- **Source:** PDF pp. 166–177. Publish/read flows, fanout on write/read, celebrity hot spots, caches and ranking order.
- **Blender environment:** terracotta town hall, regular-user cottages, large celebrity amphitheater, inbox gardens, cache kiosk and beacon.
- **Incident:** a high-follower resident publishes while everyone refreshes their feed.
- **Actions:** choose push, pull or hybrid fanout; adjust celebrity threshold; allocate feed-cache capacity.
- **Simulation:** compute write fanout operations and read assembly work on a concrete follower distribution including one celebrity. Hybrid routes high-follower authors to pull and ordinary authors to push.
- **Win:** publish within fanout budget and serve chronological reads within a latency target. A pure push design must expose the celebrity problem.
- **Feedback:** visualize spreading packets versus read-time retrieval and explain where hybrid design moves work.

### 12 — Conversation coves: Design a chat system

- **Source:** PDF pp. 178–199. Polling/WebSockets, discovery, persistence, IDs, delivery, offline sync and presence.
- **Blender environment:** paired coastal villages linked by a lit cable bridge; presence lamps, message archive, offline dock, sync station and beacon.
- **Incident:** messages arrive while a user disconnects and reconnects on another device.
- **Actions:** choose polling or WebSocket transport; enable durable history; enable per-conversation ordering; enable reconnect cursor replay.
- **Simulation:** execute a timestamped sender/receiver trace including offline periods, duplicated arrivals and reorderings. Count delivered messages, order violations, gaps after reconnect and transport overhead.
- **Win:** preserve history, deliver in conversation order, and recover missed messages with acceptable realtime latency.
- **Feedback:** presence lamps follow the trace. Explain why persistent transport does not itself guarantee durability or ordering. No real chat server or external messages exist.

### 13 — Prefix grove: Design a search autocomplete system

- **Source:** PDF pp. 200–219. Trie, prefix search, top-k caching, frequency, collection/aggregation and updates.
- **Blender environment:** branching trie tree with illuminated letter paths, query library, five suggestion pedestals, aggregation windmill and beacon.
- **Incident:** return relevant popular completions as a visitor types.
- **Actions:** enter a lowercase prefix; select full scan or trie; choose top-k cache and refresh interval. Show actual matching suggestions with frequencies.
- **Simulation:** construct a trie from a local original corpus; walk the prefix and return up to five frequency-ranked matches. Model scan work and refresh staleness for a changing popularity trace.
- **Win:** return correct prefix matches, maintain ranking freshness within the scenario's target, and keep the disclosed model latency below the budget.
- **Feedback:** light the path corresponding to input; changing the prefix visibly changes suggestions. Model latency is labeled and never passed off as measured browser benchmark latency.

### 14 — Cinema cliffs: Design YouTube

- **Source:** PDF pp. 220–243. Upload/storage, asynchronous transcoding DAG, multiple encodings, streaming, CDN and error handling.
- **Blender environment:** cinema amphitheater, upload crane, three transcoding workshops, storage reels, three coastal CDN stations and playback beacon.
- **Incident:** a video needs to play across fast and slow connections while encoding jobs complete.
- **Actions:** choose synchronous or queued transcoding; choose a single rendition or adaptive bitrate ladder; deploy edge cache; configure retry on worker failure.
- **Simulation:** process an encoding dependency graph with one transient worker failure; simulate segment delivery over an explicit bandwidth trace. Count successful renditions, startup time, rebuffer seconds and origin bytes.
- **Win:** complete the pipeline, avoid severe rebuffering, and meet origin bandwidth constraints. Model adaptation respects available renditions and network throughput.
- **Feedback:** reels pass through encoding stages; viewers stall when chosen bitrate exceeds capacity. No external videos are embedded or fetched.

### 15 — Sync sanctuary: Design Google Drive

- **Source:** PDF pp. 244–263. Block transfers, delta sync, metadata, strong consistency requirements, conflicts, chunking and reliability.
- **Blender environment:** cloud-shaped green plateau, block archive, two device cabins, checksum workshop, version monument, sync bridges and beacon.
- **Incident:** two devices edit a file; a transfer fails and must resume without losing either edit.
- **Actions:** choose whole-file or block delta transfer; enable content-hash deduplication; select last-writer-wins or preserved conflict copies; enable resumable upload.
- **Simulation:** compare arrays of file-block hashes, identify changed blocks, account transfer bytes, interrupt an upload at a fixed block, and reconcile concurrent revisions.
- **Win:** preserve both concurrent edits, transfer only the required new content, and resume without restarting completed chunks.
- **Feedback:** changed blocks glow and move; duplicate blocks remain in the archive. Explain metadata/version coordination separately from block transfer efficiency.

### 16 — Horizon lab: The learning continues

- **Source:** PDF pp. 264–265 (followed by afterword/references). Continued study of real-world architectures, principles and company engineering write-ups.
- **Blender environment:** capstone island combining the harbor, hash ring, vault, radio spire and cinema; open research observatory; restored archipelago beacon.
- **Incident:** design a small globally distributed media service and survive a launch surge plus one regional failure.
- **Actions:** allocate serving nodes, choose cache and replication/queue policies, and enable failover. Reuse familiar mechanisms with a new combined workload and budget.
- **Simulation:** chain ingress capacity, database load, asynchronous backlog and regional capacity loss; calculate delivery, durability, recovery and cost from the chosen configuration.
- **Win:** meet availability and durability goals under the combined incident within budget. Completing this level earns the horizon beacon; full expedition completion additionally requires every chapter's earned star.
- **Feedback:** a short original retrospective links the chosen bottleneck to prior levels and recommends a concrete next experiment. External reading is optional; core play remains entirely offline.

## Crew, consequences and minimal UI refinement

Every island has visible human maintenance workers wearing Blender-authored hardhats and reflective vests. The chart has small crews; in a level, crew size and activity follow the player's architecture forecast and trial results. Workers walk between useful landmarks, operate equipment and return after successful repairs. No remote character asset is used.

Each chapter has a consequence tied to its objective failures: overloaded harbor stations, estimation shortages, a framework construction fault, rate-limit flooding, hash migration imbalance, vault partition damage, foundry clock faults, alias collisions, crawler boundary violations, notification backlog, feed congestion, disconnected chat spires, stale prefix signals, stalled cinema delivery, sync conflicts and regional collapse. Severe failures can abandon and tip or sink structures. Damage resets when the architecture changes and improves when a trial succeeds. Reduced motion preserves static state without walking, shaking or falling animation.

Hashing shows actual before/after key ownership; vault repair follows observed replica versions; sync highlights actual changed blocks and transferred hashes. Those visual traces come from the simulation result. Consequences are teaching metaphors rather than additional scoring rules.

The main UI keeps chapter navigation, a concise mission, its three objectives, architecture inputs and the trial outcome. Passive subtitles, duplicate values, save-success notes and inline help paragraphs are removed. Full assumptions, control help and explanations remain in the optional field guide or debrief. Landmark inspection is collapsed by default and remains keyboard accessible.

## Blender asset plan and authored scene contract

Final access refinement: every world includes visibly different entrance and exit arches, exterior workstations and real cut-out building doorways. Building openings are .46 scene units high; the articulated human prefab is scaled to .32 (about .38 units tall). Blender exports the terrain polygon, conservative structure footprints, deck heights and access points. Three.js computes finite collision-aware walking paths inside that polygon, then moves workers from the entrance to their worksite and through the exit. Retiring workers finish their exit path before disappearing; replacement crews arrive at the entrance. Reduced motion places crews at safe workstations. Water crossings use authored bridges. The capstone reserves a western service corridor through its server ring, with an exit in the connected outdoor area.

Final interface refinement: the user's Gumroad/retro direction supersedes the initial soft panel treatment. DOM controls use chunky dark borders, square corners, solid offset shadows and tactile pressed states. Ethereum and visually inspected Mobbin references are recorded in `docs/design/visual-spec.md`. This changes the interface only; island materials, ocean and Three.js lighting retain their original design. The requested preview handoff is a grid with all sixteen chapter screens and the first two phone views.

Final motion refinement: Motion animates the React interface's chapter panels, dialog entry and exit, result cards and button feedback. Native dialogs keep their focus handling and block closing controls until exit completes. Input changes remain immediate, and chapter navigation cancels active trials. The operating system's reduced-motion preference and the game setting both disable interface movement, including when preferences change during play. Three.js retains its own render loop for crews, requests and damage effects.

The coordinator designs all island silhouettes and chapter landmarks, then implements the design through Blender's Python API. This is real scene authoring: mesh creation, bevels, materials, collection grouping, lights, orthographic camera, native `.blend` saves and Blender glTF export. It is not a Three.js-only procedural substitute.

- Author `art/blender/worker.blend` and `public/models/worker.glb` with named arm and leg pivots.
- Create 16 native scenes in `art/blender/chapter-01.blend` … `chapter-16.blend` and one overview scene.
- Export each environment to `public/models/chapter-01.glb` … `chapter-16.glb`. All visible chapter landmarks and terrain are included; Three.js adds dynamic effects and interaction overlays.
- Keep the island centered at the origin, terrain plane around Blender Z=0, radius about 6–8 units, camera-friendly landmarks not hiding the path network. Blender exports coordinate conversion to glTF Y-up.
- Naming: `landmark_<key>`, `server_<index>`, `beacon`, `tree_<index>`, `route_<index>`, `terrain`, `rock_base`. Attach chapter/role metadata through custom properties; exported nodes remain inspectable.
- Reuse ivory, sage, teal, terracotta, gold and stone materials. Prefer bevelled primitive forms, faceted rocks, pyramidal pines, extruded paths and named groups. Different chapters must have different silhouettes and meaningful distinct landmarks.
- Render an overview plus representative close-ups in Blender. Record exporter/version and asset size in a manifest. Avoid remote textures and external GLB dependencies.
- Three.js imports the actual GLBs, centers/scales the chart models, lights them, draws ocean/ripples, animates couriers and beacons, and raycasts landmarks/islands. Preserve the original Blender files for editing.

## Architecture and work ownership

Use React + Vite for the DOM application and Three.js directly for the world. Dependency lockfile is authoritative. A small pure JavaScript simulation layer makes chapter behavior independently testable. No server framework is added.

**Coordinator owns:** this plan; visual direction; package/build configuration; Blender scripts/scenes/exports; world rendering direction; portable packaging; integration decisions; browser acceptance and final handoff.

**World-effects UI implementer owns:** `src/World.jsx` and `src/world.css`, limited to crews, configuration-driven hazards, semantic routes and renderer cleanup.

**UI implementer owns:** `src/App.jsx`, `src/main.jsx`, `src/styles.css`, and UI-only helpers/components. Build the chart rail, mission controls, trial/debrief states, guide, sound settings, local progress and completion. Must not edit coordinator rendering, package configuration or simulation files.

**Simulation implementer owns:** `src/game/levels.js`, `src/game/simulation.js`, `tests/simulation.test.js`. Read the relevant source chapter sections as needed. Implement original content, control schemas, chapter-specific simulation algorithms, default configurations and explicit objective checks. Must not edit UI, Blender or build files.

**Independent reviewer:** fresh read-only context after integration; inspect requirements, relevant diff, tests and browser evidence. Confirm actual effective read-only runtime before review. Separate blockers from optional suggestions; coordinator routes repairs to the owning implementer.

### Shared interfaces

`levels.js` exports `levels` (16 ordered objects) and `getLevel(id)`. Each level has numeric `id` 1–16, `chapter`, `title`, `subtitle`, `theme`, `color`, `brief`, `objectives` (three strings), `concepts`, `guide` (original explanation), `controls`, `defaultConfig`, `solution`, `landmarks` (keys + friendly name + explanation), and scenario details. Controls have `key`, `label`, `type` (`range`, `select`, `toggle`, `text`), default/min/max/step/options, help and optional unit. Every default is intentionally useful to experiment with but does not automatically pass. `solution` is a validation fixture, not an automatically disclosed answer in the UI.

`evaluateLevel(id, config, options)` returns `{score, stars, passed, metrics, objectives, events, debrief, explanation, traffic, suggestions?, visual?}`. Metrics contain `{label, value, unit?, status?}`; objectives contain `{label, met}`; events contain `{type, message}`; traffic contains `{count, delivered, dropped, duration, bottleneck?}`. Results are deterministic for a given config/scenario, finite, serializable and do not mutate inputs. `getDefaultConfig(id)` returns a fresh object. `getSuggestions(prefix, {refresh})` exports autocomplete suggestions for live UI. All metrics explain their teaching-model assumptions.

`World` default export receives `{mode, level, config, running, result, onSelectLevel, onInspect, onReady}`. `mode` is `chart` or `level`; `level` is the chapter object or null; `onSelectLevel(id)` switches to a chapter, `onInspect(key)` opens landmark information; `onReady({ok, message?})` reports renderer/asset availability. It mounts its own canvas into a React container and tears down safely. GLB failures and unavailable WebGL have an honest DOM fallback; they must never be silently claimed as successful 3D loading.

## Execution sequence

1. Verify PDF chapter list/page ranges, local tools and project state. Produce this detailed plan and visual concept.
2. Hand off the UI and simulation work packets with disjoint file ownership, invariants, non-goals, validation and escalation conditions.
3. **Only after the handoff, create the user's requested goal:** complete and validate Systems / Islands with all 16 Blender levels, Three.js browser play and a server-free portable edition.
4. Set up minimal build dependencies. Author and export the Blender worlds while implementers build their modules.
5. Integrate worlds, UI and simulations. Tune scene composition and miniature lighting against the concept. Connect live configuration to visible world changes and traffic trials.
6. Run engine tests and every chapter's fail/win fixtures. Build static and portable outputs. Check all 16 GLBs, `.blend` files and manifest.
7. Verify chart navigation, landmark clicks, changed config, traffic trial, failed debrief, earned star, next chapter, local save/reload, guide, sound and responsive layout in the collaborative browser.
8. Open the portable edition directly as `file://` and verify Three.js/model loading plus gameplay without HTTP or CDN dependencies. Inspect representative frames in Blender and the live browser. Run an independent read-only review and repair blocking findings.
9. Write `README.md` with exact launch/build/regeneration commands, controls, output locations and practical limits. Mark the goal complete only when required work and acceptance checks are actually finished.

## Validation and fidelity criteria

- Chapter completeness: exactly 16 distinct authored level environments and 16 implemented mission definitions matching the supplied contents.
- Educational correctness: reference formulas, real hash assignments, token trace, quorum partition semantics, BigInt IDs, graph traversal, deduplicated notifications, feed fanout, reconnect replay, trie matching, bandwidth trace and file-block transfer checks.
- Every chapter's default demonstrates a meaningful problem; a documented fixture can earn a star; a failed invariant fails the relevant objective. Test boundaries and policy alternatives, not just snapshots of implementation outputs.
- Scene evidence: exported named chapter landmarks, native source scenes, Blender renders, and live loaded GLB counts. Screenshots alone do not prove gameplay.
- Browser evidence: interact through real controls; observe trial, result, navigation and persistent progress; verify no uncaught errors in representative flows.
- Zero backend/runtime network: self-contained portable HTML with Three.js/React/CSS/fonts/models embedded. No remote fonts, assets, APIs or analytics. Conventional `dist` can be hosted as static files.
- Accessibility: semantic controls and labels, visible keyboard focus, readable contrast, keyboard route to every mission/action, sound opt-in, reduced motion, legible narrow-screen layout. 3D gestures have equivalent chapter navigation and controls in the DOM.
- Performance: shared model cache, small low-poly meshes, capped device pixel ratio, dispose rendering resources, bounded packets, avoid active work in hidden tabs, measured portable asset size. Do not claim frame rates that have not been measured.
- Honesty: this is an educational simulation, not a production distributed-system emulator. Report actual implementation and validation, and clearly state any browser/QA coverage limits.
