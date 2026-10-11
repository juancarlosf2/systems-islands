# Playable interactions

Version 1.1.0 implements the first interaction layer in all sixteen worlds. Click a world, then use Play directly beneath the render to enter it. Configure its architecture or stage a change through a landmark, and press Play again to run the trial. Pause, Step, Resume and Cancel control playback. Trace lets players follow one representative job and inspect its operations; completed trials can be scrubbed and stepped through.

Every declared site offers up to three changes using that chapter's existing controls. These are individual policy or capacity changes, rather than an automatic solution. During an active or paused trial, configuration changes are disabled. Inspecting or following work cannot repair a fault, change the captured result or award stars. Leaving a world cancels its trial without a delayed award.

## Rules made visible

| Chapter | Operations and consequences |
| --- | --- |
| 1 | Serving and database capacity constrain disjoint request-equivalent cohorts. Balancing, caching, replication and coin costs retain their measured objectives. |
| 2 | Three estimates succeed or fail against the declared unit conversions and tolerance. |
| 3 | Four design decisions cover requirements, architecture, the stated correctness risk and validation. |
| 4 | Timestamped resident and attacker requests consume quota. Shared counters, client scope, refill and window boundaries determine admission or safe throttling. |
| 5 | Actual key ownership determines migration versus unchanged placement. Balance and metadata limits still decide the mission. |
| 6 | Reachable quorums determine persistence and acknowledgments. Isolated rejection, conflicting versions, reads and repair remain distinct operations. |
| 7 | Stamp requests retain exact ID strings and clock fields. Collisions, unsafe rollback and safe waiting/rejection remain distinct. |
| 8 | Alias allocation, lookup, cache invalidation and current-destination checks expose collisions and stale redirects. |
| 9 | Frontier dispatch, visited URLs, content fingerprints, robots exclusions and per-host spacing determine crawl behavior. |
| 10 | Durable queue acceptance precedes dispatch. Provider attempts, fixed backoff, duplicate suppression and opt-outs distinguish completed, lost and retained envelopes. |
| 11 | Reader cohorts assemble pushed/pulled author streams. Fanout, assembly work and cache coverage expose the publish/read trade-off. |
| 12 | Persisted history, reconnect replay, duplicate arrivals and ordered buffering determine displayed messages and gaps. |
| 13 | Prefix traversal and snapshot age expose lookup work, popularity freshness and returned rankings. |
| 14 | Upload acceptance is separate from encoding. Probe/encoder/manifest dependencies, a failed encoder, retries and adaptive segments determine readiness and playback. The upload ACK target is two seconds; encoding may take longer. |
| 15 | Block hashes, completed transfer cursors and concurrent metadata revisions expose retransmission and conflict loss. |
| 16 | Regional failure produces preserved, completed, retained or lost accepted-work equivalents under the existing analytical model. Rerouting, surviving capacity and budget remain separate checks. |

All three existing objectives must pass to earn a beacon. Configurations are evaluated by their outcomes, not by equality with the solution fixture. Stars, metrics and objective predicates are unchanged from v1.0.1. A safely rejected operation is not represented as lost accepted state. A duplicate attempt is not automatically a duplicate side effect. Chapter 10's bounded idempotency model does not establish universal exactly-once delivery.

## Trace contract

`evaluateLevel(id, config)` retains its existing result and adds `trace`:

- `version: 1`, `playbackMs: 6000`, `domainUnit` and `domainEnd` describe the two clocks.
- `counts` contains full-workload input, completed, rejected, lost, retained and suppressed totals. Each event's `countDelta` contributes to elapsed counters. The terminal categories conserve the declared input.
- `jobs` contains at most ten representative logical jobs, each with a stable identity, role, label, outcome and site keys.
- `events` contains bounded, ordered operations with stable IDs, sequence, model time, presentation `atMs`, job/site/role, action, outcome and message. `jobTerminal` marks the final operation of a finished actor; subsidiary deduplication or completion does not send its worker to the exit. Unsampled aggregate operations have a null job ID. Version, attempt, retry deadline and dependency fields are attached when relevant.
- `sample` discloses the workload and what the drawn jobs represent. Scaling, feed reads and the capstone use analytical cohorts. File-sync counters describe two revisions; block-transfer operations are subsidiary work. These counts should not be compared as if every chapter measured the same item.

Traces come from the model's actual operations or disclosed analytical cohorts. Presentation uses a deterministic blend of domain position and operation-order spacing so simultaneous operations remain inspectable. Domain timestamps stay unchanged. The six-second playback is illustrative pacing, not a timing benchmark. A paused or slower browser cannot alter the evaluation.

`getTraceSnapshot` returns elapsed counters and current sampled-job events. `getSiteActions` returns valid configuration patches without mutating the caller. The UI captures a trial result before playback starts, locks configuration and awards its result once after completion. Stepping to the final event leaves the trial paused; Resume completes it.

## People and paths

Visitors, operators, couriers and technicians reuse the original Blender human rig at scale .32, approximately .3784 units tall for .46-unit openings. Colored carried props distinguish roles; a gold marker identifies a followed job. Role-specific poses show waiting, operation, acknowledgment and retry behavior. Job following moves the camera toward the selected person; orbit controls remain usable.

Each sampled job receives a distinct reservation at every relevant site, queue, refuge and exit. Site connectors use the existing conservative terrain, building and deformation navigation data. Paths are cached by source navigation revision and slot pair, and compiled once for a trial. Rendering samples precompiled routes with bounded job/event lookup; it does not run pathfinding each frame. The chart keeps its existing 32 people and merged static geometry.

Physical route pacing may trail or anticipate an operation to fit long handoffs into the presentation. Gestures and terminal outcomes remain gated by authoritative events. Compressed movement starts from the entrance when its actor becomes visible and fits the remaining playback window. If a job first appears at the final instant, its actor stays at the entrance as a bounded visual fallback. Reduced motion uses valid reserved positions with the same trace and result. Packet sinking uses elapsed loss counters; retained work, suppression and safe rejection do not sink. Paths and reservations are not a crowd-physics or collision-avoidance simulation between moving people. The geometry audit covers tagged exported XZ footprints and 21 collapse poses. Configuration-generated transformations and full animated body or carried-prop clearance remain unverified.

## Remaining roadmap

Paid staffing and crew reassignment, player-authored incident schedules, seeded challenge modes, predictions, richer route-policy choices and replay import/export remain planned in [the roadmap](INTERACTION_ROADMAP.md). This release exposes existing chapter rules through playable site actions and model-driven work; it does not invent new staff costs or silently alter mission thresholds.
