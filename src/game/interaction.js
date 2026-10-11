import { getLevel } from './levels.js';

const countKeys = ['input', 'completed', 'rejected', 'lost', 'retained', 'suppressed'];
const emptyCounts = () => Object.fromEntries(countKeys.map(key => [key, 0]));
const workloadDescriptions = {
  1: 'Disjoint served/rejected cohorts represent continuous request equivalents from the analytical capacity model, not individual requests. Counts preserve fractional equivalents.',
  11: 'Ten reader cohorts each represent 100 of the 1,000 modeled reads. Publication and assembly work are disclosed separately.',
  15: 'Counts cover the two submitted concurrent revisions. Sampled content transfers are subsidiary operations, and exact transfer hashes are disclosed in events.',
  16: 'Disjoint cohorts represent 240 accepted-work equivalents from the analytical preservation/backlog model. Partial preservation does not identify individual surviving jobs or a specific retention store.',
};

// The collector keeps model time untouched. Only the final projection is presentation time.
// Full-workload counters remain in aggregate events when a logical job is not sampled.
export function createTrace(level, domainUnit = 'steps') {
  const jobs = new Map(), events = [], counts = emptyCounts();
  function emit(time, jobId, landmark, action, outcome = 'pending', message = '', extra = {}) {
    const sampled = jobs.get(jobId);
    const entry = { id: `ch${level.id}-event-${events.length}`, seq: events.length, time,
      atMs: 0, jobId: sampled ? jobId : null, landmark, role: sampled?.role || extra.role || 'operator',
      action, outcome, message, ...extra };
    if (extra.countDelta) for (const key of countKeys) counts[key] += extra.countDelta[key] || 0;
    events.push(entry);
    if (sampled) {
      if (!sampled.landmarks.includes(landmark)) sampled.landmarks.push(landmark);
      if (['completed', 'rejected', 'lost', 'retained'].includes(outcome)) sampled.outcome = outcome;
      else if (outcome === 'suppressed' && sampled.outcome === 'pending') sampled.outcome = outcome;
    }
    return entry;
  }
  return {
    sample(id, label, role = 'courier') {
      if (!jobs.has(id) && jobs.size < 10) jobs.set(id, { id, label, role, outcome: 'pending', landmarks: [] });
      return jobs.has(id);
    },
    has: id => jobs.has(id), emit,
    input(time, count, landmark, message = `${count} workload items submitted.`) {
      emit(time, null, landmark, 'submit', 'pending', message, { countDelta: { input: count } });
    },
    settle(time, id, landmark, outcome, message, count = 1, extra = {}) {
      emit(time, id, landmark, outcome === 'completed' ? 'complete' : outcome, outcome, message,
        { ...extra, countDelta: { [outcome]: count } });
    },
    finish() {
      events.sort((a, b) => a.time - b.time || a.seq - b.seq);
      const domainEnd = Math.max(0, ...events.map(entry => entry.time));
      const finalByJob = new Map();
      events.forEach((entry, seq) => {
        entry.seq = seq;
        entry.jobTerminal = false;
        if (entry.jobId !== null) finalByJob.set(entry.jobId, entry);
        const ordinal = events.length > 1 ? seq / (events.length - 1) : 0;
        const domainPosition = domainEnd > 0 ? entry.time / domainEnd : ordinal;
        entry.atMs = Math.min(6000, Math.max(0, (domainPosition + ordinal) / 2 * 6000));
      });
      // An operation can complete or suppress subsidiary work while its actor continues.
      // Exit only after the logical actor's final event, including a final receipt/ACK.
      for (const job of jobs.values()) {
        const finalEvent = finalByJob.get(job.id);
        if (finalEvent && ['completed', 'rejected', 'lost', 'suppressed'].includes(job.outcome))
          finalEvent.jobTerminal = true;
      }
      return { version: 1, playbackMs: 6000, domainUnit, domainEnd, counts,
        presentation: 'Domain time is unchanged. Playback blends domain position and stable operation order for visible pacing; concurrent operations can be shown sequentially.',
        sample: { trackedJobs: jobs.size, workloadItems: counts.input, description: workloadDescriptions[level.id] || 'At most ten representative logical jobs; counters include every workload item.' },
        jobs: [...jobs.values()], events };
    },
  };
}

const siteControls = {
  1: { dock: ['balance'], balancer: ['balance'], servers: ['servers'], database: ['replica'], cache: ['cache'] },
  2: { telescope: ['peak'], storage: ['storage'], clock: ['downtime'] },
  3: { scope: ['scope'], blueprint: ['architecture'], deepDive: ['risk'], wrapUp: ['wrap'] },
  4: { reservoir: ['capacity', 'refill'], gates: ['algorithm', 'scope'], service: ['atomic'] },
  5: { ring: ['algorithm'], servers: ['servers'], compass: ['vnodes'] },
  6: { replicas: ['read', 'write'], partition: ['policy'], repair: ['repair'] },
  7: { clock: ['rollback'], workers: ['uniqueWorkers'], assembly: ['strategy'] },
  8: { encoder: ['strategy', 'length'], archive: ['collisionCheck', 'cache'], redirect: ['redirect'] },
  9: { frontier: ['traversal', 'urlDedup'], robots: ['robots', 'delay'], archive: ['contentDedup'] },
  10: { queue: ['queue', 'retries'], channels: ['backoff', 'idempotency'], preferences: ['preferences'] },
  11: { celebrity: ['fanout', 'threshold'], inboxes: ['fanout'], cache: ['cache'] },
  12: { connection: ['transport'], history: ['history'], sync: ['ordering', 'replay'] },
  13: { trie: ['strategy', 'topK'], library: ['prefix'], aggregator: ['refresh'] },
  14: { upload: ['pipeline'], transcode: ['renditions', 'retry'], cdn: ['cdn'] },
  15: { blocks: ['transfer', 'dedup'], devices: ['resume'], versions: ['conflicts'] },
  16: { ingress: ['cache'], replicas: ['replication'], queue: ['queue'], failover: ['failover', 'servers'] },
};
const choiceLabels = {
  scope: {colors:'Discuss interface colors',requirements:'Clarify requirements',global:'Use global quota',client:'Use client quotas'},
  architecture: {client:'Use client storage',archive:'Use durable archive',pictures:'Use image pipeline'},
  risk: {images:'Inspect image compression',reconnect:'Inspect reconnect gaps',logos:'Inspect brand assets'},
  wrap: {diagram:'Review diagram',tradeoffs:'Discuss recovery and limits'},
  strategy: {local:'Use local counters',ticket:'Use ticket server',snowflake:'Use Snowflake IDs',hash:'Use hash allocation',sequence:'Use Base62 sequence',scan:'Scan corpus',trie:'Walk prefix trie'},
  rollback: {ignore:'Emit on backward clock',reject:'Reject backward stamps',wait:'Wait for safe clock'},
  fanout: {push:'Push into inboxes',pull:'Pull at read time',hybrid:'Use hybrid fanout'},
  renditions: {single:'Use one rendition',adaptive:'Use bitrate ladder'},
  conflicts: {last:'Keep latest writer',preserve:'Preserve conflict copy'},
};
const labels = {
  servers: 'Servers', balance: 'Balance traffic', cache: 'Cache', replica: 'Read replica',
  peak: 'Peak estimate', storage: 'Storage estimate', downtime: 'Downtime estimate',
  capacity: 'Burst quota', refill: 'Refill', atomic: 'Shared accounting', vnodes: 'Virtual nodes',
  read: 'Read quorum', write: 'Write quorum', repair: 'Repair replicas', uniqueWorkers: 'Unique workers',
  length: 'Alias length', collisionCheck: 'Check collisions', urlDedup: 'Deduplicate URLs',
  robots: 'Honor robots', delay: 'Host delay', contentDedup: 'Deduplicate content', queue: 'Durable queue',
  retries: 'Retries', backoff: 'Retry delay', idempotency: 'Deduplicate deliveries', preferences: 'Honor opt-outs',
  threshold: 'Celebrity threshold', history: 'Persist history', ordering: 'Order messages', replay: 'Replay gaps',
  topK: 'Cache top five', refresh: 'Refresh interval', cdn: 'Use CDN', retry: 'Retry encoder',
  dedup: 'Deduplicate blocks', resume: 'Resume transfer', replication: 'Replicate state', failover: 'Reroute traffic',
};

export function getSiteActions(levelId, landmarkKey, config = {}) {
  const level = getLevel(levelId);
  if (!level.landmarks.some(site => site.key === landmarkKey)) return [];
  const actions = [];
  for (const key of siteControls[level.id]?.[landmarkKey] || []) {
    const control = level.controls.find(item => item.key === key);
    const raw = config?.[key];
    const name = labels[key] || control.label;
    if (control.type === 'toggle') {
      const value = typeof raw === 'boolean' ? raw : control.default;
      actions.push({ id: `${key}-${!value}`, label: `${value ? 'Disable' : 'Enable'} ${name.toLowerCase()}`, patch: { [key]: !value } });
    } else if (control.type === 'select') {
      const value = control.options.some(item => item.value === raw) ? raw : control.default;
      for (const option of control.options.filter(item => item.value !== value))
        actions.push({ id: `${key}-${option.value}`, label: choiceLabels[key]?.[option.value] || option.label, patch: { [key]: option.value } });
    } else if (control.type === 'range') {
      const bounded = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(control.min, Math.min(control.max, raw)) : control.default;
      const value = Math.max(control.min, Math.min(control.max, control.min + Math.round((bounded - control.min) / control.step) * control.step));
      const amount = Math.max(control.step, Math.round((control.max - control.min) / 10 / control.step) * control.step);
      for (const direction of [1, -1]) {
        const next = Number(Math.max(control.min, Math.min(control.max, value + direction * amount)).toFixed(6));
        if (next !== value) actions.push({ id: `${key}-${next}`, label: `${name} ${direction > 0 ? '+' : '−'}${Number(Math.abs(next - value).toFixed(6))}`, patch: { [key]: next } });
      }
    } else {
      const value = typeof raw === 'string' ? raw.trim().toLowerCase() : control.default;
      for (const prefix of ['s', 'ca', '']) if (prefix !== value)
        actions.push({ id: `${key}-${prefix || 'root'}`, label: prefix ? `Try prefix “${prefix}”` : 'Try all prefixes', patch: { [key]: prefix } });
    }
  }
  return actions.slice(0, 3);
}

export function getTraceSnapshot(trace, atMs = 0) {
  const counts = emptyCounts();
  if (!trace?.events?.length) return { eventIndex: -1, lastEvent: null, activeJobs: [], counts };
  const time = typeof atMs === 'number' && Number.isFinite(atMs) ? atMs : 0;
  let eventIndex = -1;
  const byJob = new Map();
  for (let i = 0; i < trace.events.length; i++) {
    const entry = trace.events[i];
    if (entry.atMs <= time) {
      eventIndex = i;
      for (const key of countKeys) counts[key] += entry.countDelta?.[key] || 0;
    }
    if (entry.jobId !== null) {
      if (!byJob.has(entry.jobId)) byJob.set(entry.jobId, []);
      byJob.get(entry.jobId).push(entry);
    }
  }
  const activeJobs = [];
  for (const job of trace.jobs) {
    const entries = byJob.get(job.id) || [];
    let index = -1;
    for (let i = 0; i < entries.length && entries[i].atMs <= time; i++) index = i;
    if (index < 0) continue;
    const current = entries[index];
    activeJobs.push({ ...job, outcome: current.outcome, event: current,
      previousEvent: entries[index - 1] || null, nextEvent: entries[index + 1] || null });
  }
  return { eventIndex, lastEvent: trace.events[eventIndex] || null, activeJobs, counts };
}
