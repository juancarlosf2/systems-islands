import test from 'node:test';
import assert from 'node:assert/strict';
import { levels, getLevel } from '../src/game/levels.js';
import { evaluateLevel, getDefaultConfig, getSuggestions } from '../src/game/simulation.js';

const trial = (id, changes = {}) => evaluateLevel(id, { ...getLevel(id).solution, ...changes });
const value = (result, label) => {
  const metric = result.metrics.find(metric => metric.label === label);
  assert.ok(metric, `Missing metric: ${label}`);
  return metric.value;
};
const fails = (id, changes, objective) => {
  const result = trial(id, changes);
  assert.equal(result.passed, false);
  assert.equal(result.stars, 0);
  if (objective !== undefined) assert.equal(result.objectives[objective].met, false);
  return result;
};

test('all sixteen missions have complete, original playable schemas', () => {
  assert.deepEqual(levels.map(level => level.id), Array.from({ length: 16 }, (_, i) => i + 1));
  for (const level of levels) {
    assert.equal(level.objectives.length, 3);
    assert.ok(level.guide.length >= 2);
    assert.ok(level.scenario.label.includes('teaching'));
    assert.ok(level.landmarks.every(mark => mark.key && mark.name && mark.explanation));
    assert.equal(new Set(level.controls.map(control => control.key)).size, level.controls.length);
    for (const control of level.controls) {
      assert.ok(control.label && control.help);
      assert.ok(['range', 'select', 'toggle', 'text'].includes(control.type));
      if (control.type === 'select') {
        assert.ok(control.options.every(option => typeof option === 'object' && option.value && option.label));
        assert.ok(control.options.some(option => option.value === control.default));
      }
      if (control.type === 'toggle') assert.equal(typeof control.default, 'boolean');
      if (control.type === 'text') assert.equal(typeof control.default, 'string');
      if (control.type === 'range') assert.ok(control.min <= control.default && control.default <= control.max && control.step > 0);
    }
  }
  assert.throws(() => getLevel(17), RangeError);
});

for (const level of levels) {
  test(`chapter ${level.chapter}: default exposes a failure and solution meets every objective`, () => {
    const initial = evaluateLevel(level.id, getDefaultConfig(level.id));
    assert.equal(initial.passed, false);
    assert.ok(initial.objectives.some(objective => !objective.met));
    const config = Object.freeze({ ...level.solution });
    const before = JSON.stringify(config);
    const result = evaluateLevel(level.id, config);
    assert.equal(result.passed, true);
    assert.ok(result.objectives.every(objective => objective.met));
    assert.ok(result.stars >= 1 && result.stars <= 3);
    assert.equal(JSON.stringify(config), before);
    assert.deepEqual(evaluateLevel(level.id, config), result);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    for (const sample of [initial, result]) {
      assert.ok(sample.score >= 0 && sample.score <= 100);
      assert.ok(sample.explanation.length && sample.debrief.length);
      assert.equal(sample.stars === 0, !sample.passed);
      for (const metric of sample.metrics) {
        if (typeof metric.value === 'number') assert.ok(Number.isFinite(metric.value));
        assert.ok(['good', 'warn', 'bad'].includes(metric.status));
      }
      const traffic = sample.traffic;
      assert.ok([traffic.count, traffic.delivered, traffic.dropped].every(Number.isInteger));
      assert.equal(traffic.count, traffic.delivered + traffic.dropped);
      assert.ok(traffic.count >= 0 && traffic.delivered >= 0 && traffic.dropped >= 0);
      assert.equal(traffic.duration, 6);
    }
    const separate = getDefaultConfig(level.id);
    separate[level.controls[0].key] = 'changed';
    assert.notDeepEqual(separate, getDefaultConfig(level.id));
  });

  test(`chapter ${level.chapter}: every control boundary remains deterministic and finite`, () => {
    for (const control of level.controls) {
      const alternatives = control.type === 'range' ? [control.min, control.max, (control.min + control.max) / 2, NaN, Infinity] : control.type === 'select' ? [...control.options.map(o => o.value), 'unsupported'] : control.type === 'toggle' ? [false, true, 'true'] : ['', 'ca', 'zz', ' SEA ', null];
      for (const choice of alternatives) {
        const config = { ...level.solution, [control.key]: choice };
        const result = evaluateLevel(level.id, config);
        assert.deepEqual(result, evaluateLevel(level.id, config));
        assert.ok(Number.isFinite(result.score));
        assert.ok(result.metrics.every(metric => typeof metric.value !== 'number' || Number.isFinite(metric.value)));
        assert.equal(result.passed, result.objectives.every(objective => objective.met));
        assert.ok(Number.isInteger(result.traffic.count));
      }
    }
  });
}

test('scaling cannot bypass routing or database saturation by buying web servers', () => {
  const unbalanced = fails(1, { servers: 6, balance: false }, 0);
  assert.equal(value(unbalanced, 'Requests served'), 26);
  fails(1, { servers: 6, cache: 0, replica: false }, 0);
  fails(1, { servers: 6, cache: 90 }, 2);
});

test('estimation uses explicit binary object units, decimal GB and annual downtime', () => {
  const result = trial(2);
  assert.equal(value(result, 'Peak QPS reference'), 555.56);
  assert.equal(value(result, 'Daily ingest reference'), 25.17);
  assert.equal(value(result, '30-day retained storage'), 754.97);
  assert.equal(value(result, 'Annual downtime reference'), 262.8);
  fails(2, { storage: 100 }, 1);
  fails(2, { downtime: 5 }, 2);
  fails(2, { peak: 111 }, 0);
  assert.equal(trial(2, { peak: 600, storage: 28, downtime: 300 }).passed, true);
});

test('framework must cover requirements, architecture, declared risk and wrap-up', () => {
  fails(3, { scope: 'colors' }, 0);
  fails(3, { architecture: 'client' }, 0);
  fails(3, { risk: 'images' }, 1);
  fails(3, { wrap: 'diagram' }, 2);
});

test('rate-limiter trace distinguishes fairness, boundary bursts and split accounting', () => {
  const tokens = trial(4);
  assert.equal(value(tokens, 'Legitimate requests admitted'), 16);
  assert.equal(value(tokens, 'Abuse blocked'), 90);
  fails(4, { scope: 'global' }, 0);
  const split = fails(4, { atomic: false }, 2);
  assert.ok(value(split, 'Peak rolling-second admissions') > 18);
  fails(4, { capacity: 1 }, 0);
  fails(4, { capacity: 12 }, 2);
  const fixed = trial(4, { algorithm: 'fixed' });
  assert.equal(fixed.passed, true); // A carefully bounded fixed window is a valid alternative.
  assert.ok(value(fixed, 'Peak rolling-second admissions') > value(tokens, 'Peak rolling-second admissions'));
  assert.ok(value(fixed, 'Abuse blocked') < value(tokens, 'Abuse blocked'));
});

test('hash-ring join changes only keys acquired by the new server and balances actual loads', () => {
  const ring = trial(5);
  assert.equal(value(ring, 'Keys moved between old servers'), 0);
  const loads = ring.metrics.filter(m => /^Server \d+ keys$/.test(m.label)).map(m => m.value);
  assert.equal(loads.reduce((sum, load) => sum + load, 0), 800);
  assert.equal(value(ring, 'Migrated key count'), loads[3]);
  const modulo = fails(5, { algorithm: 'modulo' }, 0);
  assert.ok(value(modulo, 'Keys moved between old servers') > 0);
  fails(5, { vnodes: 1 }, 1);
  fails(5, { servers: 6, vnodes: 96 }, 2);
});

test('partition correctness includes overlap, reachable majority and post-heal repair', () => {
  const good = trial(6);
  assert.equal(value(good, 'Versions after healing'), '1 / 1 / 1');
  assert.equal(value(good, 'Isolated writes acknowledged'), 0);
  fails(6, { read: 1 }, 0);
  fails(6, { write: 1 }, 0);
  fails(6, { write: 3 }, 1);
  fails(6, { repair: false }, 2);
  const split = fails(6, { policy: 'available', read: 1, write: 1 }, 0);
  assert.equal(value(split, 'Isolated writes acknowledged'), 1);
  // Availability-first does not waive a configured two-replica quorum: the minority still rejects.
  assert.equal(trial(6, { policy: 'available' }).passed, true);
});

test('Snowflake emits exact large integers and separates worker and sequence fields', () => {
  const result = trial(7);
  const ids = result.events.find(e => e.type === 'ids').message.slice('ID batch: '.length).split(', ').map(BigInt);
  assert.equal(ids.length, 28);
  assert.equal(new Set(ids).size, 28);
  assert.ok(ids.every(id => id > BigInt(Number.MAX_SAFE_INTEGER) && id < (1n << 63n)));
  assert.deepEqual(ids.slice(0, 4).map(id => Number((id >> 12n) & 1023n)), [0, 1, 2, 3]);
  assert.equal(ids[4] & 4095n, 1n); // Same worker, same millisecond, next sequence.
  assert.ok((ids[24] >> 22n) > (ids[20] >> 22n)); // Waiting makes rollback safe.
  fails(7, { uniqueWorkers: false }, 0);
  fails(7, { rollback: 'ignore' }, 1);
  fails(7, { strategy: 'local' }, 0);
  fails(7, { strategy: 'ticket' }, 2);
  const reject = trial(7, { rollback: 'reject' });
  assert.equal(reject.passed, true);
  assert.equal(value(reject, 'Emitted IDs'), 24);
});

test('short links preserve ownership, updates, analytics and namespace capacity', () => {
  assert.equal(value(trial(8), 'Alias namespace'), 62 ** 3);
  assert.equal(value(trial(8), 'Correct current destinations'), 360);
  fails(8, { length: 1 }, 1);
  fails(8, { redirect: '301' }, 0);
  fails(8, { cache: false }, 2);
  const collision = trial(8, { strategy: 'hash', length: 2, collisionCheck: false });
  assert.ok(value(collision, 'Allocation collisions encountered') > 0);
  assert.equal(collision.objectives[0].met, false);
  const checked = trial(8, { strategy: 'hash', length: 2 });
  assert.equal(checked.objectives[0].met, true);
  assert.equal(trial(8, { strategy: 'hash' }).passed, true);
});

test('crawler explores both frontier orders and enforces URL, content and host rules', () => {
  for (const traversal of ['bfs', 'dfs']) {
    const result = trial(9, { traversal });
    assert.equal(result.passed, true);
    assert.equal(value(result, 'Allowed unique content'), 8);
    const hostTimes = new Map();
    for (const entry of result.events.filter(e => e.type === 'fetch')) {
      const [, host, time] = entry.message.match(/^([^/]+)\/.* fetched at (\d+) ms\.$/);
      if (hostTimes.has(host)) assert.ok(Number(time) - hostTimes.get(host) >= 300);
      hostTimes.set(host, Number(time));
    }
  }
  fails(9, { urlDedup: false }, 1);
  fails(9, { contentDedup: false }, 1);
  fails(9, { robots: false }, 2);
  fails(9, { delay: 0 }, 2);
});

test('notifications distinguish attempts from side effects and preference violations', () => {
  const result = trial(10);
  assert.equal(value(result, 'Permitted deliveries'), 8);
  assert.ok(value(result, 'Provider attempts') > 8);
  fails(10, { queue: false }, 0);
  fails(10, { retries: 0 }, 0);
  fails(10, { backoff: 0 }, 0);
  fails(10, { idempotency: false }, 1);
  fails(10, { preferences: false }, 1);
  fails(10, { retries: 6, backoff: 0 }, 2);
});

test('feed shifts celebrity writes into bounded read assembly and retains chronology', () => {
  const push = fails(11, { fanout: 'push' }, 0);
  assert.equal(value(push, 'Publish fanout'), 108000);
  const pull = fails(11, { fanout: 'pull' }, 1);
  assert.equal(value(pull, 'Read assembly'), 13000);
  assert.equal(value(trial(11), 'Publish fanout'), 8000);
  fails(11, { cache: 0 }, 2);
  fails(11, { threshold: 200000 }, 0);
  assert.match(trial(11).events[0].message, /100, 11, 10, 9/);
});

test('chat socket, history, ordered display and cursor replay solve separate failures', () => {
  assert.equal(value(trial(12), 'Suppressed duplicate arrivals'), 1);
  assert.match(trial(12).events[1].message, /1, 2, 3, 4, 5, 6, 7, 8/);
  fails(12, { history: false }, 0);
  fails(12, { replay: false }, 2);
  fails(12, { ordering: false }, 1);
  fails(12, { transport: 'poll' }, 2);
});

test('trie suggestions match prefixes, rank frequency, reflect updates and return copies', () => {
  for (const prefix of ['', 's', 'ca', 'qu', 'zz']) {
    const result = trial(13, { prefix });
    assert.equal(result.passed, true);
    assert.deepEqual(result.suggestions, getSuggestions(prefix));
    assert.ok(result.suggestions.length <= 5);
    assert.ok(result.suggestions.every(term => term.text.startsWith(prefix)));
    assert.ok(result.suggestions.every((term, i, list) => i === 0 || term.frequency <= list[i - 1].frequency));
  }
  assert.equal(getSuggestions('s')[0].text, 'sync');
  const copy = getSuggestions('s'); copy[0].frequency = -1;
  assert.equal(getSuggestions('s')[0].frequency, 140);
  assert.deepEqual(getSuggestions(' SEA '), getSuggestions('sea'));
  const stale = fails(13, { refresh: 300 }, 1);
  assert.notDeepEqual(stale.suggestions, getSuggestions('s'));
  assert.equal(getSuggestions('s', { refresh: 300 })[0].text, 'sea');
  assert.equal(getSuggestions('s', { refresh: 300 })[0].frequency, 90);
  assert.equal(getSuggestions('s', { refresh: 30 })[0].text, 'sync');
  assert.equal(getSuggestions('s', { refresh: 30 })[0].frequency, 140);
  for (const prefix of ['', 's', 'ca', 'zz', ' SEA ']) {
    for (const refresh of [30, 60, 60.1, 65, 300, 600, NaN, Infinity]) {
      assert.deepEqual(trial(13, { prefix, refresh }).suggestions, getSuggestions(prefix, { refresh }));
    }
  }
  fails(13, { strategy: 'scan' }, 2);
  fails(13, { prefix: '', topK: false }, 2);
});

test('video honors encoding dependencies, recovery, network adaptation and origin bytes', () => {
  const good = trial(14);
  assert.equal(value(good, 'Completed renditions'), 3);
  assert.equal(value(good, 'Rebuffer time'), 0);
  assert.ok(good.events.find(e => e.type === 'retry'));
  const failure = fails(14, { retry: false }, 0);
  assert.ok(failure.events.find(e => e.type === 'blocked' && e.message.includes('manifest')));
  fails(14, { pipeline: 'sync' }, 0);
  fails(14, { renditions: 'single' }, 1);
  const origin = fails(14, { cdn: false }, 2);
  assert.ok(value(origin, 'Origin segment transfer') > value(good, 'Origin segment transfer'));
});

test('sync compares actual block hashes, deduplicates repeated content and preserves metadata conflicts', () => {
  const good = trial(15);
  assert.equal(value(good, 'Candidate changed chunks'), 3);
  assert.equal(value(good, 'Unique new chunks'), 2);
  assert.equal(value(good, 'Transferred block content'), 2);
  assert.equal(value(fails(15, { dedup: false }, 1), 'Transferred block content'), 3);
  assert.equal(value(fails(15, { transfer: 'whole' }, 1), 'Transferred block content'), 16);
  fails(15, { conflicts: 'last' }, 0);
  assert.equal(value(fails(15, { resume: false }, 2), 'Retransmitted completed chunks'), 1);
});

test('capstone chains capacity, rerouting, durable jobs and budget under regional loss', () => {
  assert.equal(value(trial(16), 'Surviving nodes'), 3);
  fails(16, { failover: false }, 0);
  fails(16, { replication: false }, 1);
  fails(16, { queue: false }, 1);
  fails(16, { servers: 2 }, 0);
  fails(16, { cache: 0 }, 0);
  fails(16, { servers: 8 }, 2);
});

test('hash visualization exposes exactly the computed ownership changes and load counts', () => {
  for (const algorithm of ['ring', 'modulo']) {
    const result = trial(5, { algorithm });
    const { migrations, beforeOwners, afterOwners, loads } = result.visual;
    assert.equal(beforeOwners.length, 800);
    assert.equal(afterOwners.length, 800);
    assert.equal(migrations.length, value(result, 'Migrated key count'));
    assert.equal(migrations.length, result.traffic.count);
    assert.equal(new Set(migrations.map(migration => migration.keyIndex)).size, migrations.length);
    for (const migration of migrations) {
      assert.equal(migration.from, beforeOwners[migration.keyIndex]);
      assert.equal(migration.to, afterOwners[migration.keyIndex]);
      assert.notEqual(migration.from, migration.to);
      if (algorithm === 'ring') assert.equal(migration.to, 3);
    }
    assert.equal(beforeOwners.filter((owner, index) => owner !== afterOwners[index]).length, migrations.length);
    assert.deepEqual(loads, Array.from({ length: 4 }, (_, owner) => afterOwners.filter(value => value === owner).length));
  }
});

test('replica visualization retains the actual partition and repair version snapshots', () => {
  const repaired = trial(6);
  assert.deepEqual(repaired.visual, { versionsBeforeRepair: [1, 1, 0], versionsAfterRepair: [1, 1, 1], partitionedReplica: 2 });
  assert.equal(repaired.visual.versionsAfterRepair.join(' / '), value(repaired, 'Versions after healing'));
  const stale = trial(6, { repair: false });
  assert.deepEqual(stale.visual.versionsBeforeRepair, [1, 1, 0]);
  assert.deepEqual(stale.visual.versionsAfterRepair, stale.visual.versionsBeforeRepair);
  const conflict = trial(6, { policy: 'available', read: 1, write: 1 });
  assert.deepEqual(conflict.visual.versionsBeforeRepair, [1, 0, 2]);
  assert.deepEqual(conflict.visual.versionsAfterRepair, [2, 2, 2]);
});

test('block visualization uses changed positions and the actual deduplicated and retried transfer hashes', () => {
  const result = trial(15);
  assert.deepEqual(result.visual.changedBlockIndices, [2, 3, 7]);
  assert.equal(result.visual.changedBlockIndices.length, value(result, 'Candidate changed chunks'));
  const hashes = result.visual.transferredBlockHashes;
  assert.equal(hashes.length, 2);
  assert.equal(new Set(hashes).size, 2);
  assert.ok(hashes.every(Number.isInteger));
  assert.equal(hashes.length, value(result, 'Transferred block content'));
  const duplicate = trial(15, { dedup: false });
  assert.deepEqual(duplicate.visual.transferredBlockHashes, [hashes[0], hashes[0], hashes[1]]);
  const restart = trial(15, { resume: false });
  assert.deepEqual(restart.visual.transferredBlockHashes, [hashes[0], hashes[0], hashes[1]]);
  const whole = trial(15, { transfer: 'whole' });
  assert.equal(whole.visual.transferredBlockHashes.length, 16);
  assert.deepEqual(whole.visual.changedBlockIndices, result.visual.changedBlockIndices);
});
