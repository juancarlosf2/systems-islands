import test from 'node:test';
import assert from 'node:assert/strict';
import { levels, getLevel } from '../src/game/levels.js';
import { evaluateLevel } from '../src/game/simulation.js';
import { getSiteActions, getTraceSnapshot } from '../src/game/interaction.js';

const trial = (id, patch = {}) => evaluateLevel(id, { ...getLevel(id).solution, ...patch });
const terminalTotal = counts => counts.completed + counts.rejected + counts.lost + counts.retained + counts.suppressed;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≠ ${expected}`);
const metric = (result, label) => result.metrics.find(item => item.label === label).value;
const jobEvents = (trace, jobId) => trace.events.filter(entry => entry.jobId === jobId);

function validateTrace(level, result) {
  const trace = result.trace;
  assert.equal(trace.version, 1);
  assert.equal(trace.playbackMs, 6000);
  assert.ok(['ms', 's', 'steps'].includes(trace.domainUnit));
  assert.ok(Number.isFinite(trace.domainEnd) && trace.domainEnd >= 0);
  assert.ok(trace.jobs.length > 0 && trace.jobs.length <= 10);
  assert.ok(trace.events.length > 0 && trace.events.length <= 2000);
  assert.equal(trace.sample.trackedJobs, trace.jobs.length);
  assert.equal(trace.sample.workloadItems, trace.counts.input);
  const ids = new Set(trace.jobs.map(job => job.id));
  assert.equal(ids.size, trace.jobs.length);
  const sites = new Set(level.landmarks.map(site => site.key));
  for (const job of trace.jobs) {
    assert.ok(['visitor', 'operator', 'courier', 'technician'].includes(job.role));
    assert.ok(job.label && job.outcome);
    assert.ok(job.landmarks.length && job.landmarks.every(site => sites.has(site)));
    const entries=jobEvents(trace,job.id);
    assert.ok(entries.length);
    const terminal=['completed','rejected','lost','suppressed'].includes(job.outcome);
    assert.equal(entries.at(-1).jobTerminal,terminal);
    assert.ok(entries.slice(0,-1).every(entry=>entry.jobTerminal===false));
  }
  const eventIds = new Set();
  let previousTime = -Infinity, previousMs = -Infinity, previousSeq = -1;
  for (const entry of trace.events) {
    assert.ok(!eventIds.has(entry.id)); eventIds.add(entry.id);
    assert.ok(entry.jobId === null || ids.has(entry.jobId));
    assert.ok(sites.has(entry.landmark));
    assert.ok(Number.isFinite(entry.time) && entry.time >= previousTime);
    assert.ok(Number.isFinite(entry.atMs) && entry.atMs >= previousMs && entry.atMs >= 0 && entry.atMs <= 6000);
    assert.ok(entry.seq > previousSeq);
    assert.ok(entry.action && entry.outcome && entry.message);
    assert.equal(typeof entry.jobTerminal,'boolean');
    if(entry.jobId===null)assert.equal(entry.jobTerminal,false);
    previousTime = entry.time; previousMs = entry.atMs; previousSeq = entry.seq;
  }
  for (const count of Object.values(trace.counts)) assert.ok(Number.isFinite(count) && count >= 0);
  near(trace.counts.input, terminalTotal(trace.counts));
  assert.deepEqual(getTraceSnapshot(trace, 6000).counts, trace.counts);
  assert.deepEqual(JSON.parse(JSON.stringify(trace)), trace);
}

for (const level of levels) {
  test(`chapter ${level.chapter}: bounded reproducible operation traces and site actions`, () => {
    for (const config of [level.defaultConfig, level.solution]) {
      const frozen = Object.freeze({ ...config });
      const before = JSON.stringify(frozen);
      const result = evaluateLevel(level.id, frozen);
      validateTrace(level, result);
      assert.deepEqual(result, evaluateLevel(level.id, frozen));
      assert.equal(JSON.stringify(frozen), before);
      for (const site of level.landmarks) {
        const actions = getSiteActions(level.id, site.key, frozen);
        assert.ok(actions.length >= 1 && actions.length <= 3, site.key);
        assert.equal(new Set(actions.map(action => action.id)).size, actions.length);
        for (const action of actions) {
          assert.ok(action.label);
          assert.ok(Object.keys(action.patch).length > 0);
          for (const [key, value] of Object.entries(action.patch)) {
            const control = level.controls.find(control => control.key === key);
            assert.ok(control, `Unsupported patch ${key}`);
            assert.notEqual(value, frozen[key]);
            if (control.type === 'range') {
              assert.ok(value >= control.min && value <= control.max);
              near((value - control.min) / control.step, Math.round((value - control.min) / control.step));
            } else if (control.type === 'toggle') assert.equal(typeof value, 'boolean');
            else if (control.type === 'select') assert.ok(control.options.some(option => option.value === value));
            else assert.equal(typeof value, 'string');
          }
          validateTrace(level, evaluateLevel(level.id, { ...frozen, ...action.patch }));
        }
      }
      assert.deepEqual(getSiteActions(level.id, 'missing-site', config), []);
    }
    for (const control of level.controls) {
      const values = control.type === 'range' ? [control.min, control.max, NaN] : control.type === 'select' ? [...control.options.map(option => option.value), 'unsupported'] : control.type === 'toggle' ? [false, true, 'bad'] : ['', ' CA ', 'zz'];
      for (const value of values) validateTrace(level, trial(level.id, { [control.key]: value }));
    }
    // Invalid input falls back through the same evaluator normalization as a normal trial.
    const invalid = Object.fromEntries(level.controls.map(control => [control.key, control.type === 'range' ? Infinity : control.type === 'text' ? null : 'unsupported']));
    assert.deepEqual(evaluateLevel(level.id, invalid).trace, evaluateLevel(level.id, level.defaultConfig).trace);
  });
}

test('snapshots expose elapsed counters and current job state without leaking final outcomes', () => {
  const trace = trial(10).trace;
  const before = JSON.stringify(trace);
  const initial = getTraceSnapshot(trace, -1);
  assert.equal(initial.eventIndex, -1);
  assert.equal(initial.lastEvent, null);
  assert.deepEqual(initial.activeJobs, []);
  assert.equal(initial.counts.completed, 0);
  const midway = getTraceSnapshot(trace, 3000);
  assert.ok(midway.counts.completed < trace.counts.completed);
  for (const job of midway.activeJobs) {
    assert.ok(job.event.atMs <= 3000);
    if (job.nextEvent) assert.ok(job.nextEvent.atMs > 3000);
    assert.equal(job.outcome, job.event.outcome);
  }
  assert.deepEqual(getTraceSnapshot(trace, 7000).counts, trace.counts);
  assert.equal(JSON.stringify(trace), before);
  assert.deepEqual(getTraceSnapshot(null, 0).counts, initial.counts);
});

test('limiter exact quotas and rolling admissions reconcile to model metrics', () => {
  for (const patch of [{}, { algorithm: 'fixed' }, { scope: 'global' }, { atomic: false }, { capacity: 1 }]) {
    const result = trial(4, patch), trace = result.trace;
    const quota = trace.events.filter(entry => entry.action === 'quota');
    assert.equal(quota.length, 76);
    const admitted = quota.filter(entry => entry.outcome === 'admitted');
    const residents = admitted.filter(entry => entry.client !== 'attacker');
    const attackers = admitted.filter(entry => entry.client === 'attacker');
    assert.equal(residents.length, metric(result, 'Legitimate requests admitted'));
    assert.equal(Number(((60-attackers.length)/60*100).toFixed(2)), metric(result, 'Abuse blocked'));
    assert.equal(trace.counts.completed, admitted.length);
    assert.equal(trace.counts.rejected, 76 - admitted.length);
    assert.ok(trace.jobs.some(job=>job.outcome==='rejected'));
    assert.ok(trace.jobs.some(job=>job.outcome==='completed'));
    const rolling = Math.max(...admitted.map(entry => admitted.filter(other => other.time >= entry.time && other.time < entry.time + 1000).length));
    assert.equal(rolling, metric(result, 'Peak rolling-second admissions'));
    assert.equal(new Set(quota.map(entry => entry.counterKey)).size, metric(result, 'Independent counter states'));
    if (patch.algorithm !== 'fixed') for (const entry of admitted) assert.ok(entry.tokens >= -1e-8);
  }
});

test('notifications account envelopes separately from retries and recipient side effects', () => {
  const good = trial(10), trace = good.trace;
  assert.equal(trace.counts.input, 12);
  assert.equal(trace.counts.completed, 8);
  assert.equal(trace.counts.suppressed, 4);
  assert.equal(trace.events.filter(entry => entry.action === 'attempt').length, metric(good, 'Provider attempts'));
  assert.equal(trace.events.filter(entry => entry.action === 'side-effect').length, 8);
  assert.ok(trace.jobs.some(job => job.id === 'optout-1'));
  assert.ok(trace.jobs.some(job => job.id === 'optout-2'));
  for (const id of ['job-0', 'job-3', 'job-6']) {
    const entries = jobEvents(trace, id);
    const retry = entries.find(entry => entry.action === 'retry');
    assert.ok(retry && retry.retryAt >= 500);
    assert.ok(entries.find(entry => entry.action === 'side-effect').time >= 500);
    const ack = entries.find(entry => entry.action === 'ack');
    const persisted = entries.find(entry => entry.action === 'persist');
    assert.ok(persisted.seq < ack.seq);
  }
  const volatile = trial(10, { queue: false }).trace;
  assert.ok(volatile.counts.lost > 0);
  assert.equal(volatile.counts.retained, 0);
  const exhausted = trial(10, { retries: 0 }).trace;
  assert.ok(exhausted.counts.retained > 0);
  assert.equal(exhausted.counts.lost, 0);
  const immediate = trial(10, { backoff: 0 }).trace;
  assert.ok(immediate.counts.retained > 0);
  const repeated = trial(10, { idempotency: false });
  assert.equal(repeated.trace.events.filter(entry => entry.action === 'side-effect' && entry.duplicate).length, metric(repeated, 'Duplicate side effects'));
  const optouts = trial(10, { preferences: false });
  assert.equal(optouts.trace.events.filter(entry => entry.action === 'side-effect' && !entry.allowed).length, metric(optouts, 'Opt-out violations'));
});

test('quorum traces distinguish safe rejected writes from accepted conflicts', () => {
  const good = trial(6).trace;
  assert.equal(good.counts.lost, 0);
  assert.ok(jobEvents(good, 'isolated-write').some(entry => entry.outcome === 'rejected'));
  const majority = jobEvents(good, 'majority-write');
  assert.ok(majority.find(entry => entry.action === 'persist').seq < majority.find(entry => entry.action === 'complete').seq);
  assert.ok(good.events.some(entry => entry.action === 'repair' && entry.version === 1));
  const conflicting = trial(6, { policy: 'available', write: 1, read: 1 }).trace;
  assert.ok(jobEvents(conflicting, 'isolated-write').some(entry => entry.outcome === 'completed' && entry.version === 2));
});

test('chat displays actual ordered cursor history and suppresses the repeated side effect', () => {
  const trace = trial(12).trace;
  assert.deepEqual(trace.events.filter(entry => entry.countDelta?.completed).map(entry => entry.version), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(trace.events.filter(entry => entry.action === 'suppress').length, 1);
  for (const id of ['message-4', 'message-5', 'message-6']) {
    const entries = jobEvents(trace, id);
    assert.ok(entries.find(entry => entry.action === 'persist').seq < entries.find(entry => entry.action === 'ack').seq);
    assert.ok(entries.find(entry => entry.action === 'replay').seq < entries.find(entry => entry.action === 'complete').seq);
  }
  assert.equal(trial(12, { history: false }).trace.counts.lost, 3);
  assert.equal(trial(12, { replay: false }).trace.counts.retained, 5); // Three stored offline + two buffered behind their gap.
  const unordered = trial(12, { ordering: false }).trace;
  assert.deepEqual(unordered.events.filter(entry => entry.countDelta?.completed).map(entry => entry.version), [1, 3, 2, 4, 5, 6, 7, 8]);
  assert.ok(unordered.events.some(entry => entry.outcome === 'duplicate'));
});

test('video dependency readiness, durable upload ACK, retry, and six segment transfers preserve domain time', () => {
  const result = trial(14), trace = result.trace;
  const ack = jobEvents(trace, 'upload').find(entry => entry.action === 'ack');
  assert.equal(ack.time, 1);
  assert.ok(jobEvents(trace, 'upload').find(entry => entry.action === 'persist').seq < ack.seq);
  const encode = jobEvents(trace, 'encode-3.5');
  assert.equal(encode.find(entry => entry.action === 'retry').time, 10);
  assert.equal(encode.find(entry => entry.action === 'complete').time, 18);
  assert.equal(jobEvents(trace, 'manifest').find(entry => entry.action === 'work').time, 18);
  assert.equal(jobEvents(trace, 'manifest').find(entry => entry.action === 'complete').time, 18.5);
  for (const entry of trace.events.filter(entry => entry.action === 'work')) {
    for (const dep of entry.dependencies) {
      const complete = jobEvents(trace, dep).find(item => item.action === 'complete');
      assert.ok(complete.time <= entry.time && complete.seq < entry.seq);
    }
  }
  const segments = trace.events.filter(entry => entry.segment && entry.countDelta?.completed);
  assert.equal(segments.length, 6);
  assert.equal(Number((segments.reduce((sum, entry) => sum + entry.originBytes, 0) / 1e6).toFixed(2)), metric(result, 'Origin segment transfer'));
  assert.ok(trial(14, { retry: false }).trace.events.some(entry => entry.jobId === 'manifest' && entry.outcome === 'retained'));
  assert.equal(jobEvents(trial(14, { pipeline: 'sync' }).trace, 'upload').find(entry => entry.action === 'ack').time, 18.5);
});

test('sync traces show exact transmitted hashes, durable receipts, conflict copies, and resume cursor', () => {
  for (const patch of [{}, { resume: false }, { dedup: false }, { transfer: 'whole' }, { conflicts: 'last' }]) {
    const result = trial(15, patch), trace = result.trace;
    const transfers = trace.events.filter(entry => entry.action === 'transfer');
    assert.deepEqual(transfers.map(entry => entry.blockHash), result.visual.transferredBlockHashes);
    for (const entry of trace.events.filter(entry => entry.action === 'ack')) {
      assert.ok(trace.events.some(persisted => persisted.action === 'persist' && persisted.blockHash === entry.blockHash && persisted.seq < entry.seq));
    }
    const cursor = trace.events.find(entry => entry.action === (patch.resume === false ? 'restart' : 'resume'));
    assert.equal(cursor.cursor, patch.resume === false ? 0 : 1);
    assert.equal(trace.counts.completed, patch.conflicts === 'last' ? 1 : 2);
    assert.equal(trace.counts.lost, patch.conflicts === 'last' ? 1 : 0);
  }
});

test('capacity cohorts expose quantitative rejection and capstone accepted-work loss', () => {
  const saturated = trial(1, { cache: 0, replica: false });
  near(saturated.trace.counts.completed / 10, metric(saturated, 'Requests served'));
  assert.ok(saturated.trace.jobs.some(job => job.outcome === 'rejected'));
  for (const patch of [{}, { queue: false }, { replication: false }, { queue: false, replication: false }, { servers: 2 }]) {
    const result = trial(16, patch), trace = result.trace;
    assert.equal(trace.counts.input, 240);
    assert.ok(trace.sample.description.includes('equivalents'));
    assert.ok(trace.sample.description.includes('does not identify individual'));
    assert.equal(trace.counts.completed + trace.counts.retained, 240 * metric(result, 'Accepted work preserved') / 100);
    assert.equal(trace.counts.lost, 240 * (1 - metric(result, 'Accepted work preserved') / 100));
    for (const job of trace.jobs) assert.ok(jobEvents(trace, job.id).some(entry => entry.action === 'accepted'));
  }
});

 test('presentation spaces zero-time bursts while keeping every authoritative timestamp unchanged', () => {
  const trace=trial(10,{queue:false}).trace;
  assert.equal(trace.domainEnd,0);
  assert.ok(trace.events.every(entry=>entry.time===0));
  assert.equal(trace.events[0].atMs,0);
  assert.equal(trace.events.at(-1).atMs,6000);
  assert.ok(trace.events.slice(1).every((entry,index)=>entry.atMs>trace.events[index].atMs));
  assert.ok(trace.presentation.includes('concurrent'));
  assert.ok(getTraceSnapshot(trace,3000).eventIndex>0);
  assert.ok(getTraceSnapshot(trace,3000).counts.completed<trace.counts.completed);
});

 test('upload worker finishes at its final acknowledgment and segment completions stay subsidiary', () => {
  for(const patch of [{},{pipeline:'sync'},{retry:false}]) {
    const trace=trial(14,patch).trace;
    const upload=jobEvents(trace,'upload');
    assert.equal(upload.at(-1).action,'ack');
    assert.equal(upload.at(-1).jobTerminal,true);
    assert.equal(upload.find(entry=>entry.action==='complete').jobTerminal,false);
    assert.equal(trace.jobs.find(job=>job.id==='upload').outcome,'completed');
    assert.equal(upload.at(-1).outcome,'accepted'); // Durable acceptance remains distinct from encoding readiness.
    const viewer=jobEvents(trace,'viewer');
    assert.ok(viewer.slice(0,-1).every(entry=>entry.jobTerminal===false));
    if(patch.retry===false) {
      for(const id of ['encode-3.5','manifest']) {
        assert.equal(trace.jobs.find(job=>job.id===id).outcome,'retained');
        assert.ok(jobEvents(trace,id).every(entry=>entry.jobTerminal===false));
      }
    }
  }
});

 test('block ACKs finish chunk actors while deduplication does not finish revision actors', () => {
  for(const patch of [{},{resume:false},{dedup:false},{transfer:'whole'},{conflicts:'last'}]) {
    const trace=trial(15,patch).trace;
    for(const job of trace.jobs.filter(job=>job.id.startsWith('chunk-'))) {
      const entries=jobEvents(trace,job.id);
      assert.equal(job.outcome,'completed');
      assert.equal(entries.at(-1).action,'ack');
      assert.equal(entries.at(-1).jobTerminal,true);
      assert.ok(entries.slice(0,-1).every(entry=>entry.jobTerminal===false));
      assert.ok(entries.every(entry=>!entry.countDelta)); // Chunk lifecycle does not add revision workload outcomes.
    }
    for(const entry of trace.events.filter(entry=>entry.action==='suppress'))assert.equal(entry.jobTerminal,false);
    for(const id of ['revision-0','revision-1']) {
      const entries=jobEvents(trace,id);
      assert.equal(entries.at(-1).jobTerminal,true);
      assert.ok(['completed','lost'].includes(entries.at(-1).outcome));
      assert.ok(entries.slice(0,-1).every(entry=>entry.jobTerminal===false));
    }
    assert.equal(trace.counts.input,2);
    assert.equal(trace.counts.completed+trace.counts.lost,2);
  }
});
