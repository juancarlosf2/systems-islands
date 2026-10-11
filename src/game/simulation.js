import { getLevel } from './levels.js';

const round = (n, digits = 2) => Number(n.toFixed(digits));
const metric = (label, value, unit, met) => ({ label, value: typeof value === 'number' ? round(value) : value, unit, status: met ? 'good' : 'bad' });
const event = (type, message) => ({ type, message });
const hash = text => {
  let value = 2166136261;
  for (const char of text) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); }
  // Avalanche FNV's correlated suffixes before using them as ring positions.
  value ^= value >>> 16; value = Math.imul(value, 0x85ebca6b); value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35); value ^= value >>> 16;
  return value >>> 0;
};

export function getDefaultConfig(id) { return { ...getLevel(id).defaultConfig }; }

function configuration(level, input) {
  const config = {};
  for (const control of level.controls) {
    const value = input?.[control.key] ?? control.default;
    if (control.type === 'range') {
      const bounded = typeof value === 'number' && Number.isFinite(value) ? Math.max(control.min, Math.min(control.max, value)) : control.default;
      config[control.key] = round(Math.max(control.min, Math.min(control.max, control.min + Math.round((bounded-control.min)/control.step)*control.step)), 6);
    }
    else if (control.type === 'toggle') config[control.key] = typeof value === 'boolean' ? value : control.default;
    else if (control.type === 'select') config[control.key] = control.options.some(option => option.value === value) ? value : control.default;
    else config[control.key] = typeof value === 'string' ? value.slice(0, 64).trim().toLowerCase() : control.default;
  }
  return config;
}

function finish(level, met, metrics, explanation, advice, { count = 40, delivered = count, events = [], bottleneck = '', quality = 1, suggestions, visual } = {}) {
  const passed = met.every(Boolean);
  const score = passed ? Math.max(75, Math.min(100, Math.round(75 + 25 * quality))) : Math.min(74, Math.round(met.filter(Boolean).length / met.length * 70));
  return {
    score, stars: passed ? score >= 95 ? 3 : score >= 85 ? 2 : 1 : 0, passed,
    metrics, objectives: level.objectives.map((label, i) => ({ label, met: Boolean(met[i]) })),
    events, explanation, debrief: passed ? `Beacon restored. ${explanation}` : advice,
    traffic: { count: Math.round(count), delivered: Math.max(0, Math.min(Math.round(count), Math.round(delivered))), dropped: Math.max(0, Math.round(count) - Math.max(0, Math.min(Math.round(count), Math.round(delivered)))), duration: 6, bottleneck },
    ...(suggestions ? { suggestions } : {}),
    ...(visual ? { visual } : {}),
  };
}

function scale(level, c) {
  const web = (c.balance ? c.servers : 1) * 260;
  const dbWork = 1000 * (0.1 + 0.9 * (1 - c.cache / 100));
  const db = 260 + (c.replica ? 320 : 0);
  const fraction = Math.min(1, web / 1000, db / dbWork);
  const latency = 25 + 110 * Math.max(1000 / web, dbWork / db) ** 2;
  const cost = c.servers * 18 + (c.balance ? 10 : 0) + c.cache * 0.2 + (c.replica ? 20 : 0);
  const met = [fraction >= 0.95, latency <= 130, cost <= 130];
  const bottleneck = 1000 / web > dbWork / db ? 'Serving tier' : 'Database tier';
  return finish(level, met, [metric('Requests served',fraction*100,'%',met[0]),metric('Modeled latency',latency,'ms',met[1]),metric('Architecture cost',cost,'coins',met[2]),metric('Database work',dbWork,'ops/s',dbWork <= db)],
    `The ${bottleneck.toLowerCase()} limits this burst. Balancing enables ${c.balance ? c.servers : 1} serving node(s); read offload leaves ${round(dbWork)} database operations.`,
    !c.balance ? 'Enable balancing so added servers receive traffic, then inspect database work.' : dbWork > db ? 'Reduce read pressure with caching or a replica, then rerun the burst.' : cost > 130 ? 'Reduce unused capacity while retaining the delivery and latency targets.' : 'Increase serving capacity until the latency curve fits the target.',
    {count:1000,delivered:1000*fraction,bottleneck,quality:Math.min(1,130/Math.max(1,latency))});
}

function estimate(level, c) {
  const s = level.scenario;
  const peak = s.dailyActiveUsers * s.requestsPerUser / 86400 * s.peakMultiplier;
  const storage = s.dailyActiveUsers * s.uploadsPerUser * s.objectSizeKiB * 1024 / 1e9;
  const downtime = 525600 * (1 - s.availabilityPercent / 100);
  const errors = [Math.abs(c.peak-peak)/peak,Math.abs(c.storage-storage)/storage,Math.abs(c.downtime-downtime)/downtime];
  const met = errors.map(e => e <= 0.2);
  return finish(level,met,[metric('Peak QPS reference',peak,'QPS',met[0]),metric('Daily ingest reference',storage,'GB/day',met[1]),metric('Annual downtime reference',downtime,'min',met[2]),metric('30-day retained storage',storage*30,'GB',true),...errors.map((e,i)=>metric(['Peak error','Ingest error','Downtime error'][i],e*100,'%',met[i]))],
    `Peak = 240,000 × 40 ÷ 86,400 × 5 = ${round(peak)} QPS. Ingest = 240,000 × 0.2 × 512 × 1,024 ÷ 1,000,000,000 = ${round(storage)} GB/day. Downtime = 525,600 × 0.0005 = ${round(downtime)} minutes.`,
    'Check seconds per day, KiB-to-byte conversion and the unavailable fraction. Daily ingest is different from retained storage.',
    {delivered:40*met.filter(Boolean).length/3,quality:1-errors.reduce((a,b)=>a+b,0)/3});
}

function framework(level,c) {
  const stages = [c.scope==='requirements',c.architecture==='archive',c.risk==='reconnect',c.wrap==='tradeoffs'];
  const met = [stages[0] && stages[1],stages[2],stages[3]];
  return finish(level,met,[metric('Requirements coverage',stages[0]?100:0,'%',stages[0]),metric('Architecture coverage',stages[1]?100:0,'%',stages[1]),metric('Risk investigation',stages[2]?100:0,'%',stages[2]),metric('Wrap-up coverage',stages[3]?100:0,'%',stages[3])],
    'This brief needs durable messages and a reconnect path. The design session succeeds when requirements, architecture, correctness investigation and validation agree.',
    !stages[0] ? 'Clarify workload, durability and offline requirements first.' : !stages[1] ? 'Choose an initial sketch that includes durable storage and reconnect replay.' : !stages[2] ? 'Investigate missing messages after reconnect, the council’s stated risk.' : 'Wrap up with limitations, monitoring and recovery tests.',
    {delivered:10*stages.filter(Boolean).length,events:stages.map((ok,i)=>event(ok?'accepted':'warning',`${['Scope','Architecture','Deep dive','Wrap-up'][i]}: ${ok?'covered':'needs revision'}.`))});
}

function limiter(level,c) {
  const trace = [];
  for (const client of ['resident-a','resident-b']) for (const time of [0,100,200,300,1200,1400,2000,2200]) trace.push({client,time,legitimate:true});
  for (const time of [950,1010]) for (let i=0;i<30;i++) trace.push({client:'attacker',time,legitimate:false});
  trace.sort((a,b)=>a.time-b.time || a.client.localeCompare(b.client));
  const buckets = new Map(); const accepted = []; let legitimate=0,abuse=0;
  trace.forEach((request,index)=>{
    const identity = c.scope==='client' ? request.client : 'all';
    const key = `${identity}:${c.atomic?0:index%2}`;
    const state = buckets.get(key) || {tokens:c.capacity,last:0,window:-1,used:0};
    let admit;
    if(c.algorithm==='token') {
      state.tokens = Math.min(c.capacity,state.tokens+(request.time-state.last)/1000*c.refill);
      state.last=request.time; admit=state.tokens>=1-1e-9;
      if(admit) state.tokens-=1;
    } else {
      const window=Math.floor(request.time/1000);
      if(window!==state.window) {state.window=window;state.used=0;}
      admit=state.used<c.capacity; if(admit)state.used++;
    }
    buckets.set(key,state);
    if(admit) { accepted.push(request); if(request.legitimate)legitimate++;else abuse++; }
  });
  const peak=accepted.reduce((max,r)=>Math.max(max,accepted.filter(other=>other.time>=r.time && other.time<r.time+1000).length),0);
  const met=[legitimate>=16*.9,abuse<=60*.2,peak<=18];
  return finish(level,met,[metric('Legitimate requests admitted',legitimate,'/16',met[0]),metric('Abuse blocked',(60-abuse)/60*100,'%',met[1]),metric('Peak rolling-second admissions',peak,'requests',met[2]),metric('Independent counter states',buckets.size,'balances',c.atomic)],
    `Timestamped ${c.algorithm==='token'?'token refill':'window resets'} admitted ${legitimate} residents and ${abuse} attacker requests. The busiest rolling second contains ${peak} admissions.`,
    c.scope==='global' ? 'Separate client quotas so the attacker cannot exhaust the residents’ tokens.' : !c.atomic ? 'Coordinate both gateway counters; independent quotas double the attack allowance.' : c.algorithm==='fixed' ? 'Try a token bucket to prevent the reset-boundary double burst.' : 'Tune burst capacity and refill together: preserve residents while limiting attack admissions.',
    {count:76,delivered:accepted.length,bottleneck:'Floodgate',events:[event('accepted',`${legitimate} legitimate requests admitted.`),event('throttled',`${60-abuse} abusive requests throttled.`),event(peak>18?'warning':'accepted',`Rolling peak: ${peak}/18.`)]});
}

function hashing(level,c) {
  const owners = count => {
    const points=[];
    if(c.algorithm==='ring')for(let server=0;server<count;server++)for(let vnode=0;vnode<c.vnodes;vnode++)points.push({position:hash(`server-${server}:vnode-${vnode}`),server});
    points.sort((a,b)=>a.position-b.position || a.server-b.server);
    return Array.from({length:800},(_,i)=>{
      const key=hash(`island-key-${i}`);
      if(c.algorithm==='modulo')return key%count;
      let low=0,high=points.length;
      while(low<high){const mid=(low+high)>>>1;if(points[mid].position<key)low=mid+1;else high=mid;}
      return points[low%points.length].server;
    });
  };
  const before=owners(c.servers),after=owners(c.servers+1);
  const migrations=before.flatMap((from,keyIndex)=>from===after[keyIndex]?[]:[{keyIndex,from,to:after[keyIndex]}]);
  const changed=before.reduce((n,owner,i)=>n+(owner!==after[i]),0);
  const loads=Array(c.servers+1).fill(0);after.forEach(owner=>loads[owner]++);
  const imbalance=Math.max(...loads)/(800/loads.length);
  const entries=c.algorithm==='ring'?(c.servers+1)*c.vnodes:c.servers+1;
  const movement=changed/800;const met=[movement<=.35,imbalance<=1.4,entries<=512];
  const retainedMoves=before.reduce((n,owner,i)=>n+(after[i]!==c.servers && after[i]!==owner),0);
  return finish(level,met,[metric('Keys migrated',movement*100,'%',met[0]),metric('Migrated key count',changed,'keys',met[0]),metric('Busiest / mean load',imbalance,'×',met[1]),metric('Placement metadata',entries,'entries',met[2]),metric('Keys moved between old servers',retainedMoves,'keys',retainedMoves===0),...loads.map((load,i)=>metric(`Server ${i+1} keys`,load,'keys',load<=800/loads.length*1.4))],
    `${changed} of 800 actual key assignments changed. Server loads after joining: ${loads.join(', ')}. A ring join moves keys only into the new owner’s ranges.`,
    c.algorithm==='modulo' ? 'Compare the ring strategy: changing a modulo divisor remaps many unrelated keys.' : entries>512 ? 'Reduce virtual nodes to fit the metadata budget.' : 'Increase virtual nodes to smooth uneven ring ownership, then measure again.',
    {count:changed,delivered:changed,events:[event('migration',`${changed} keys move to their new owners.`)],bottleneck:'Placement balance',quality:Math.min(1,1.3/imbalance),visual:{migrations,beforeOwners:before,afterOwners:after,loads}});
}

function vaults(level,c) {
  const versions=[0,0,0];const events=[event('partition','Replica 3 is isolated; replicas 1 and 2 remain connected.')];
  const majorityAck=c.write<=2;
  if(majorityAck) {for(let i=0;i<c.write;i++)versions[i]=1;events.push(event('write',`Majority acknowledges version 1 with W=${c.write}.`));}
  const isolatedAck=c.policy==='available' && c.write===1;
  if(isolatedAck){versions[2]=2;events.push(event('warning','The isolated replica acknowledges a conflicting version 2.'));}
  else events.push(event('rejected','Isolated write rejected until coordination is possible.'));
  // Read from the least-updated majority member first. The minority can answer R=1 only under availability-first policy.
  const majorityRead=c.read<=2 ? Math.max(...[versions[1],versions[0]].slice(0,c.read)) : null;
  const minorityRead=c.policy==='available'&&c.read===1 ? versions[2] : null;
  events.push(event('read',`Majority read: ${majorityRead===null?'quorum unavailable':`version ${majorityRead}`}; isolated read: ${minorityRead===null?'quorum unavailable':`version ${minorityRead}`}.`));
  const stale=(majorityAck && majorityRead!==null && majorityRead<1) || (majorityAck && minorityRead!==null && minorityRead<1) || isolatedAck;
  const overlap=c.read+c.write>3;
  const correctness=overlap&&!stale&&majorityRead!==null&&c.read===2;
  const partitionService=majorityAck&&!isolatedAck&&c.read<=2;
  const versionsBeforeRepair=versions.slice();
  if(c.repair){const latest=Math.max(...versions);versions.fill(latest);events.push(event('repair',`Reconnected replicas converge on version ${latest}.`));}
  const converged=versions.every(v=>v===versions[0])&&versions[0]>0;
  const met=[correctness,partitionService,converged];
  return finish(level,met,[metric('Read/write overlap',c.read+c.write,'R + W',correctness),metric('Majority write acknowledgments',majorityAck?c.write:0,'replicas',partitionService),metric('Isolated writes acknowledged',isolatedAck?1:0,'writes',!isolatedAck),metric('Versions after healing',versions.join(' / '),'versions',converged)],
    `The majority ${majorityAck?'accepted':'rejected'} the write; the isolated side ${isolatedAck?'created a conflicting write':'safely rejected its write'}. R+W=${c.read+c.write} for N=3. Coordinated quorum overlap and newest-version selection are assumptions of this model.`,
    c.policy!=='consistent' ? 'Require majority coordination to prevent isolated acknowledgments from diverging.' : !partitionService ? 'Use a write quorum reachable by the two-vault majority.' : !correctness ? 'Require an overlapping read quorum that can still read from the majority.' : 'Enable repair so the stale vault converges after the bridge heals.',
    {count:3,delivered:met.filter(Boolean).length,events,bottleneck:'Partition coordination',visual:{versionsBeforeRepair,versionsAfterRepair:versions.slice(),partitionedReplica:2}});
}

function ids(level,c) {
  const generated=[];const states=Array.from({length:4},()=>({last:-1,sequence:0,counter:0}));let unsafe=0,rejected=0,inversions=0;
  for(let batch=0;batch<7;batch++)for(let worker=0;worker<4;worker++) {
    const state=states[worker];let time=batch===6?159999999999:160000000000+Math.floor(batch/2);let id;
    if(c.strategy==='local')id=BigInt(state.counter++);
    else if(c.strategy==='ticket')id=BigInt(generated.length+1);
    else {
      if(time<state.last) {
        if(c.rollback==='reject'){rejected++;continue;}
        if(c.rollback==='wait')time=state.last+1;
        else {unsafe++;inversions++;}
      }
      state.sequence=time===state.last?state.sequence+1:0;state.last=time;
      id=(BigInt(time)<<22n)|(BigInt(c.uniqueWorkers?worker:0)<<12n)|BigInt(state.sequence);
    }
    generated.push(id.toString());
  }
  const collisions=generated.length-new Set(generated).size;
  const latency=c.strategy==='ticket'?generated.length*5:12+(c.rollback==='wait'?4:0);
  const met=[collisions===0&&generated.length>0,c.strategy!=='local'&&unsafe===0&&inversions===0,generated.length>=24&&latency<=60];
  const sample=c.strategy==='snowflake'&&generated.length ? BigInt(generated[0]) : 0n;
  return finish(level,met,[metric('ID collisions',collisions,'IDs',met[0]),metric('Unsafe rollback emissions',unsafe,'IDs',met[1]),metric('Emitted IDs',generated.length,'/28',met[2]),metric('Stamping latency',latency,'ms',met[2]),metric('Rejected stamps',rejected,'IDs',rejected===0)],
    `${generated.length} numeric IDs were generated using exact BigInt arithmetic. ${c.strategy==='snowflake'?`Sample fields: time=${sample>>22n}, worker=${(sample>>12n)&1023n}, sequence=${sample&4095n}.`:'Local counters collide across workers; ticket serialization consumes latency.'}`,
    c.strategy==='local' ? 'Use a distributed timestamp/worker/sequence layout rather than independent counters.' : c.strategy==='ticket' ? 'Try a distributed generator to remove the ticket serialization bottleneck.' : !c.uniqueWorkers ? 'Assign distinct worker bits so simultaneous stamps cannot collide.' : 'Wait or reject when the clock moves backward; compare safe throughput.',
    {count:28,delivered:new Set(generated).size,events:[event('ids',`ID batch: ${generated.join(', ')}`),event('clock',`Rollback produced ${unsafe} unsafe and ${rejected} rejected stamps.`)],bottleneck:'ID stamping'});
}

const alphabet='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function base62(value,length) {let encoded='';do{encoded=alphabet[value%62]+encoded;value=Math.floor(value/62);}while(value>0);return encoded.padStart(length,'0');}
function shortener(level,c) {
  const capacity=62**c.length, mappings=new Map(),aliases=[];let collisions=0,failed=0;
  for(let i=0;i<120;i++) {
    const destination=`https://island.example/routes/${i*2}`;
    let number=(c.strategy==='sequence'?i:hash(destination))%capacity;
    let alias=base62(number,c.length);
    if(mappings.has(alias))collisions++;
    if(c.collisionCheck) {
      let probes=0;
      while(mappings.has(alias)&&probes<capacity){number=(number+1)%capacity;alias=base62(number,c.length);probes++;}
      if(mappings.has(alias)){failed++;aliases.push(null);continue;}
    }
    mappings.set(alias,destination);aliases.push(alias);
  }
  const browserCache=new Map(),archiveCache=new Map();let correct=0,origins=0,serviceVisits=0;let time=0;
  for(let visit=0;visit<360;visit++) {
    const i=visit%120,alias=aliases[i],expected=`https://island.example/routes/${i*2}${visit>=240&&i===0?'?revision=2':''}`;
    if(visit===240&&alias){mappings.set(alias,expected);archiveCache.delete(alias);}
    let destination;
    if(c.redirect==='301'&&browserCache.has(alias)){destination=browserCache.get(alias);time+=3;}
    else {
      serviceVisits++;
      if(c.cache&&archiveCache.has(alias)){destination=archiveCache.get(alias);time+=18;}
      else {destination=mappings.get(alias);origins++;time+=110;if(c.cache)archiveCache.set(alias,destination);}
      if(c.redirect==='301'&&alias)browserCache.set(alias,destination);
    }
    if(alias&&destination===expected)correct++;
  }
  // Cache trial reports warmed service lookup, with the cold fill separately disclosed.
  const latency=c.cache?18:110;
  const met=[correct===360&&serviceVisits===360&&failed===0,capacity>=200000,latency<=35];
  return finish(level,met,[metric('Correct current destinations',correct,'/360',met[0]),metric('Visits reaching redirect service',serviceVisits,'/360',met[0]),metric('Alias namespace',capacity,'aliases',met[1]),metric('Warm redirect model latency',latency,'ms',met[2]),metric('Archive reads including cold fill',origins,'reads',c.cache),metric('Allocation collisions encountered',collisions,'collisions',failed===0)],
    `The allocator stored ${mappings.size} aliases; ${collisions} collisions were encountered. ${correct}/360 visits resolved correctly. Cache latency is the warmed 18 ms lookup model; cold archive reads take 110 ms.`,
    capacity<200000 ? 'Increase alias length to cover 200,000 links before relying on collision handling.' : c.redirect==='301' ? 'Use temporary redirects for this mutable, per-visit-analytics workload.' : !c.collisionCheck&&collisions ? 'Check collisions before saving so one destination cannot overwrite another.' : 'Cache destination mappings to lower warmed redirect latency.',
    {count:360,delivered:correct,events:[event('allocation',`${collisions} alias collisions; ${failed} failed allocations.`)],bottleneck:'Alias archive'});
}

const webGraph={
  'a/start':{content:'welcome',links:['a/map','b/news','a/private']},
  'a/map':{content:'map',links:['a/start','b/mirror','c/port']},
  'b/news':{content:'news',links:['b/weather','c/library']},
  'b/mirror':{content:'map',links:['a/start','c/port']},
  'c/port':{content:'port',links:['c/library','a/garden']},
  'b/weather':{content:'weather',links:['b/news','c/forecast']},
  'c/library':{content:'library',links:['a/garden']},
  'a/garden':{content:'garden',links:['c/forecast']},
  'c/forecast':{content:'forecast',links:[]},
  'a/private':{content:'private',links:[],forbidden:true},
};
function crawler(level,c) {
  const frontier=['a/start'],visited=new Set(),contents=new Set(),lastHost=new Map();let repeat=0,duplicateParsing=0,forbidden=0,violations=0,time=0,fetches=0;
  const events=[];
  while(frontier.length&&fetches<40) {
    const url=c.traversal==='bfs'?frontier.shift():frontier.pop();
    if(c.urlDedup&&visited.has(url))continue;
    const page=webGraph[url];if(c.robots&&page.forbidden){events.push(event('skipped',`Robots excludes ${url}.`));continue;}
    const host=url.split('/')[0],previous=lastHost.get(host);
    const dispatch=Math.max(time,previous===undefined?0:previous+c.delay);
    if(previous!==undefined&&dispatch-previous<250)violations++;
    time=dispatch+20;lastHost.set(host,dispatch);fetches++;
    if(visited.has(url))repeat++;visited.add(url);
    if(page.forbidden)forbidden++;
    const duplicate=contents.has(page.content);
    if(duplicate&&c.contentDedup){events.push(event('duplicate',`Fingerprint skips parsing ${url}.`));continue;}
    if(duplicate)duplicateParsing++;
    contents.add(page.content);events.push(event('fetch',`${url} fetched at ${dispatch} ms.`));
    frontier.push(...page.links);
  }
  const allowed=[...contents].filter(content=>content!=='private').length;
  const met=[allowed===8,repeat===0&&duplicateParsing===0,forbidden===0&&violations===0&&time<=10000&&frontier.length===0];
  return finish(level,met,[metric('Allowed unique content',allowed,'/8',met[0]),metric('Repeated URL fetches',repeat,'fetches',repeat===0),metric('Duplicate content parses',duplicateParsing,'parses',duplicateParsing===0),metric('Forbidden fetches',forbidden,'fetches',forbidden===0),metric('Host-delay violations',violations,'violations',violations===0),metric('Crawl elapsed model time',time,'ms',met[2])],
    `${c.traversal.toUpperCase()} fetched ${fetches} pages and discovered ${allowed} allowed content fingerprints. Per-host dispatch scheduling produced ${violations} timing violations.`,
    !c.urlDedup ? 'Deduplicate visited URLs before fetching to break graph cycles.' : !c.contentDedup ? 'Compare content fingerprints so a mirror is not parsed twice.' : !c.robots ? 'Check robots exclusions before dispatching the private URL.' : 'Set host delay to at least 250 ms and inspect the dispatch timestamps.',
    {count:fetches,delivered:allowed,events,bottleneck:'Crawl frontier'});
}

function notifications(level,c) {
  const jobs=Array.from({length:8},(_,i)=>({id:`job-${i}`,allowed:true,transient:i%3===0}));
  jobs.push({...jobs[1]},{...jobs[3]},{id:'optout-1',allowed:false},{id:'optout-2',allowed:false});
  const delivered=new Set();let duplicates=0,optouts=0,attempts=0,elapsed=0,sideEffects=0;const events=[];
  for(const job of jobs) {
    if(c.preferences&&!job.allowed){events.push(event('suppressed',`${job.id} opted out.`));continue;}
    if(c.idempotency&&delivered.has(job.id)){events.push(event('duplicate',`${job.id} already delivered.`));continue;}
    let time=0;
    for(let attempt=0;attempt<= (c.queue?c.retries:0);attempt++) {
      attempts++;elapsed=Math.max(elapsed,time);
      if(job.transient&&time<500){events.push(event('retry',`${job.id} provider unavailable at ${time} ms.`));time+=c.backoff;continue;}
      if(delivered.has(job.id))duplicates++;
      delivered.add(job.id);sideEffects++;if(!job.allowed)optouts++;
      events.push(event('delivered',`${job.id} delivered at ${time} ms.`));break;
    }
  }
  const permitted=jobs.slice(0,8).filter(job=>delivered.has(job.id)).length;
  const met=[permitted===8,duplicates===0&&optouts===0,attempts<=22&&elapsed<=5000];
  return finish(level,met,[metric('Permitted deliveries',permitted,'/8',met[0]),metric('Duplicate side effects',duplicates,'deliveries',duplicates===0),metric('Opt-out violations',optouts,'deliveries',optouts===0),metric('Provider attempts',attempts,'attempts',met[2]),metric('Recovery time',elapsed,'ms',met[2])],
    `${attempts} provider attempts produced ${permitted} permitted outcomes, ${duplicates} duplicate side effects and ${optouts} opt-out violations. Retries use a deterministic 500 ms outage.`,
    !c.queue ? 'Retain failed jobs in a durable queue, then add retries.' : permitted<8 ? 'Give retries enough backoff to pass the 500 ms outage.' : !c.idempotency ? 'Deduplicate by job identity before applying another successful side effect.' : 'Honor opt-outs at dispatch and keep retry work within budget.',
    {count:12,delivered:permitted,events,bottleneck:'Provider retry queue'});
}

function feed(level,c) {
  const authors=Array.from({length:100},(_,i)=>({followers:80,time:i+1,id:i}));authors.push({followers:100000,time:101,id:100});
  const pulled=author=>c.fanout==='pull'||(c.fanout==='hybrid'&&author.followers>=c.threshold);
  const fanout=authors.reduce((sum,author)=>sum+(pulled(author)?0:author.followers),0);
  const readAuthors=[...authors.slice(0,12),authors[100]];
  const pullCount=readAuthors.filter(pulled).length,pushCount=13-pullCount;
  const cached=Math.min(c.cache,1000)/1000;
  const assembly=1000*(pullCount+pushCount*(1-cached));
  const latency=35+pullCount*16+pushCount*(1-cached)*8;
  const chronology=readAuthors.slice().sort((a,b)=>b.time-a.time).map(a=>a.id);
  const met=[fanout<=15000,latency<=90,assembly<=4000];
  return finish(level,met,[metric('Publish fanout',fanout,'writes',met[0]),metric('Read model latency',latency,'ms',met[1]),metric('Read assembly',assembly,'operations',met[2]),metric('Authors pulled per read',pullCount,'authors',pullCount<=2)],
    `Publication creates ${fanout} inbox writes. Each read pulls ${pullCount} authors and merges their posts with cached inbox entries in descending publication order.`,
    fanout>15000 ? 'Use hybrid routing with a threshold below the celebrity’s 100,000 followers.' : latency>90 ? 'Cache ordinary inboxes and avoid pulling every ordinary author at read time.' : 'Increase cached inbox coverage to reduce repeated read assembly.',
    {count:1000,delivered:1000,events:[event('ranking',`Chronological author IDs: ${chronology.join(', ')}.`)],bottleneck:fanout>15000?'Celebrity fanout':'Read assembly'});
}

function chat(level,c) {
  const arrivals=[1,3,2];if(c.history&&c.replay)arrivals.push(4,5,6);arrivals.push(7,7,8);
  const display=[],pending=new Set(),seen=new Set();let next=1,duplicate=0;
  for(const sequence of arrivals) {
    if(c.ordering){
      if(seen.has(sequence)){duplicate++;continue;}seen.add(sequence);pending.add(sequence);
      while(pending.has(next)){display.push(next);pending.delete(next);next++;}
    }else display.push(sequence);
  }
  const unique=new Set(display).size;
  const inversions=display.slice(1).reduce((sum,value,i)=>sum+(value<=display[i]),0);
  const gaps=[4,5,6].filter(id=>!display.includes(id)).length;
  const latency=c.transport==='socket'?40:1000;
  const met=[unique===8,inversions===0&&display.length===8,gaps===0&&c.history&&c.replay&&latency<=100];
  return finish(level,met,[metric('Unique displayed messages',unique,'/8',met[0]),metric('Order or duplicate violations',inversions,'violations',met[1]),metric('Offline gaps remaining',gaps,'messages',gaps===0),metric('Live transport model latency',latency,'ms',met[2]),metric('Suppressed duplicate arrivals',duplicate,'arrivals',c.ordering)],
    `Arrival sequence: ${arrivals.join(', ')}. Display sequence: ${display.join(', ')||'buffered'}. The live connection and durable replay solve separate parts of delivery.`,
    !c.history ? 'Persist messages so the offline interval has something to replay.' : !c.replay ? 'Replay durable history after the last contiguous cursor on reconnect.' : !c.ordering ? 'Buffer missing sequence numbers and deduplicate repeated arrivals.' : 'Use a persistent live transport to meet the realtime latency target.',
    {count:8,delivered:unique,events:[event('offline','Receiver disconnects for sequences 4, 5 and 6.'),event('reconnect',`Reconnected display: ${display.join(', ')}.`)],bottleneck:'Reconnect replay'});
}

const terms=[['sailing',70],['sand',50],['sea',90],['search',80],['server',75],['signal',40],['snowflake',45],['storage',65],['stream',55],['sync',60],['system',85],['shore',30],['cache',82],['castle',20],['cave',24],['chat',78],['cloud',74],['code',63],['coral',32],['queue',68],['query',72],['quorum',47],['rate',62],['reef',31],['replica',66],['retry',59],['ring',57],['river',33],['route',58],['robot',48],['token',64],['tower',27],['trie',61],['travel',29],['upload',54],['user',69],['video',77],['vault',46],['wave',44],['worker',51],['web',76],['write',53]].map(([text,frequency])=>({text,frequency}));
const corpus=fresh=>terms.map(term=>({...term,frequency:fresh&&term.text==='sync'?140:term.frequency}));
const ranked=list=>list.slice().sort((a,b)=>b.frequency-a.frequency||a.text.localeCompare(b.text)).slice(0,5);
function buildTrie(entries) {
  const root={children:new Map(),entries:[],top:[]};
  for(const term of entries) {
    let node=root;node.entries.push(term);
    for(const letter of term.text){if(!node.children.has(letter))node.children.set(letter,{children:new Map(),entries:[],top:[]});node=node.children.get(letter);node.entries.push(term);}
  }
  const cache=node=>{node.top=ranked(node.entries);for(const child of node.children.values())cache(child);};cache(root);return root;
}
function trieNode(root,prefix){let node=root;for(const char of prefix){node=node.children.get(char);if(!node)return null;}return node;}
export function getSuggestions(prefix='',options={}) {
  // Existing callers receive the fresh snapshot; an explicit refresh follows the trial's control normalization.
  const c=configuration(getLevel(13),{prefix:String(prefix),refresh:options?.refresh??30});
  const node=trieNode(buildTrie(corpus(c.refresh<=60)),c.prefix);
  return node?node.top.map(term=>({...term})):[];
}
function autocomplete(level,c) {
  const fresh=c.refresh<=60,entries=corpus(fresh),root=buildTrie(entries),node=trieNode(root,c.prefix);
  let suggestions,work;
  if(c.strategy==='scan'){suggestions=ranked(entries.filter(term=>term.text.startsWith(c.prefix)));work=entries.length;}
  else {suggestions=node?(c.topK?node.top:ranked(node.entries)):[];work=c.prefix.length+(node?(c.topK?1:node.entries.length):0);}
  const expected=ranked(entries.filter(term=>term.text.startsWith(c.prefix)));
  const correct=JSON.stringify(suggestions)===JSON.stringify(expected)&&suggestions.every(term=>term.text.startsWith(c.prefix));
  const latency=2+work*(c.strategy==='scan'?1.8:.7);
  const met=[correct,fresh,latency<=20];
  return finish(level,met,[metric('Matching suggestions',suggestions.length,'/5',correct),metric('Popularity snapshot age',fresh?c.refresh:Math.min(c.refresh,300),'s',fresh),metric('Inspected entries or trie steps',work,'steps',latency<=20),metric('Query model latency',latency,'ms',met[2])],
    `Prefix “${c.prefix}” returns ${suggestions.map(term=>`${term.text} (${term.frequency})`).join(', ')||'no matches'}. Modeled work is ${work} steps; sync rose from 60 to 140 searches in the recent update.`,
    !fresh ? 'Refresh popularity within 60 seconds so the new ranking reaches serving nodes.' : c.strategy==='scan' ? 'Use a trie to follow the prefix rather than inspect the entire corpus.' : 'Cache the top five at each trie node to avoid walking a broad subtree.',
    {count:1,delivered:1,suggestions:suggestions.map(term=>({...term})),events:[event('prefix',`Walked prefix: ${c.prefix||'(root)'}.`)],bottleneck:'Prefix lookup'});
}

function cinema(level,c) {
  const jobs=[{id:'upload',deps:[],duration:1},{id:'probe',deps:['upload'],duration:1}];
  const bitrates=c.renditions==='adaptive'?[.6,1.6,3.5]:[3.5];
  for(const bitrate of bitrates)jobs.push({id:`encode-${bitrate}`,deps:['probe'],duration:bitrate===3.5?8:4,fail:bitrate===3.5});
  jobs.push({id:'manifest',deps:bitrates.map(b=>`encode-${b}`),duration:.5});
  const completed=new Map(),events=[];
  for(const job of jobs) {
    if(job.deps.some(dep=>!completed.has(dep))){events.push(event('blocked',`${job.id} waits for missing dependencies.`));continue;}
    const start=Math.max(0,...job.deps.map(dep=>completed.get(dep)));
    if(job.fail&&!c.retry){events.push(event('failed',`${job.id} fails on its first worker attempt.`));continue;}
    const end=start+job.duration+(job.fail?job.duration:0);completed.set(job.id,end);
    events.push(event(job.fail?'retry':'encoded',`${job.id} completes at ${end} s.`));
  }
  const ready=bitrates.filter(b=>completed.has(`encode-${b}`));
  const uploadAck=c.pipeline==='queue'?1:Math.max(...completed.values());
  let buffer=0,startup=0,rebuffer=0,bytes=0;const chosen=[];
  if(completed.has('manifest'))for(const [i,bandwidth] of level.scenario.bandwidthMbps.entries()) {
    const safe=ready.filter(b=>b<=bandwidth*.75);
    const bitrate=c.renditions==='adaptive'?Math.max(...(safe.length?safe:[Math.min(...ready)])):3.5;
    const transfer=bitrate*2/bandwidth+(c.cdn?.15:.8);
    if(i===0)startup=transfer;
    else {rebuffer+=Math.max(0,transfer-buffer);buffer=Math.max(0,buffer-transfer);}
    buffer+=2;bytes+=bitrate*2*1e6/8;chosen.push(bitrate);
  }
  else {startup=30;rebuffer=30;}
  const origin=bytes*(c.cdn?.2:1)/1e6;
  const met=[ready.length===3&&completed.has('manifest')&&uploadAck<=2,startup<=3&&rebuffer<=1,completed.has('manifest')&&origin<=1.2];
  return finish(level,met,[metric('Completed renditions',ready.length,'/3',met[0]),metric('Upload acknowledgment',uploadAck,'s',uploadAck<=2),metric('Playback startup',startup,'s',startup<=3),metric('Rebuffer time',rebuffer,'s',met[1]),metric('Origin segment transfer',origin,'MB',met[2])],
    `The dependency graph completed ${completed.size}/${jobs.length} jobs. Playback chose ${chosen.join(', ')||'no'} Mbps renditions over the declared bandwidth trace. Segment delivery consumes and replenishes an explicit two-second buffer.`,
    !c.retry ? 'Retry the failed encoder before publishing its rendition in the manifest.' : c.pipeline==='sync' ? 'Queue encoding so upload acknowledgment does not wait for all renditions.' : c.renditions==='single' ? 'Create the bitrate ladder so low-bandwidth viewers have a playable option.' : 'Serve segments through the edge cache to lower origin bytes.',
    {count:jobs.length+6,delivered:completed.size+(rebuffer<=1?6:0),events,bottleneck:'Encoding and playback'});
}

function drive(level,c) {
  const s=level.scenario,base=s.baseBlocks.map(block=>hash(`block:${block}`));
  const revisions=[s.deviceA,s.deviceB].map(blocks=>blocks.map(block=>hash(`block:${block}`)));
  const changedBlockIndices=[...new Set(revisions.flatMap(revision=>revision.flatMap((block,i)=>block!==base[i]?[i]:[])))].sort((a,b)=>a-b);
  let chunks=[];
  revisions.forEach(revision=>revision.forEach((block,i)=>{if(c.transfer==='whole'||block!==base[i])chunks.push(block);}));
  const changed=chunks.length;
  if(c.dedup&&c.transfer==='delta'){const existing=new Set(base);chunks=chunks.filter(block=>{if(existing.has(block))return false;existing.add(block);return true;});}
  const retransmitted=c.resume?0:Math.min(s.interruptedAfterBlocks,chunks.length);
  const transferredBlockHashes=[...chunks.slice(0,retransmitted),...chunks];
  const bytes=(chunks.length+retransmitted)*s.blockBytes;
  const versions=c.conflicts==='preserve'?2:1;
  const met=[versions===2,bytes<=2000000,retransmitted===0];
  return finish(level,met,[metric('Preserved concurrent revisions',versions,'/2',met[0]),metric('Transferred block content',bytes/1e6,'MB',met[1]),metric('Retransmitted completed chunks',retransmitted,'chunks',met[2]),metric('Candidate changed chunks',changed,'chunks',c.transfer==='delta'),metric('Unique new chunks',chunks.length,'chunks',c.dedup)],
    `Hash comparison selected ${changed} candidate chunks; ${c.transfer==='delta'?'block deduplication':'whole-file transfer'} left ${chunks.length}. The interrupted transfer ${c.resume?'continued at its cursor':'restarted completed work'}. Metadata reconciliation retained ${versions} revision(s).`,
    c.conflicts!=='preserve' ? 'Preserve a conflict copy: both devices edited the same base version.' : c.transfer==='whole' ? 'Compare block hashes and send deltas instead of whole files.' : !c.dedup ? 'Deduplicate the repeated X block so only X and Y cross the bridge.' : 'Resume after the completed chunk rather than restarting the transfer.',
    {count:chunks.length+retransmitted,delivered:chunks.length+retransmitted,events:[event('delta',`New block hashes: ${chunks.join(', ')}.`),event('interrupted','Transfer stops after one completed chunk, then reconnects.'),event('conflict',`${versions} revision(s) retained from base metadata version 1.`)],bottleneck:'Block transfer',visual:{changedBlockIndices,transferredBlockHashes}});
}

function capstone(level,c) {
  const survivors=Math.floor(c.servers/2),webCapacity=survivors*300;
  const servingWork=1800*(1-c.cache/100*.75),databaseWork=1800*(.1+.9*(1-c.cache/100));
  const databaseCapacity=c.replication?600:260;
  const served=Math.min(c.failover?1:.5,webCapacity/servingWork,databaseCapacity/databaseWork);
  const latency=45+95*Math.max(servingWork/webCapacity,databaseWork/databaseCapacity);
  const durable=c.replication&&c.queue?100:c.replication||c.queue?50:0;
  const backlog=c.queue?Math.max(0,240-survivors*100):120;
  const cost=c.servers*16+c.cache*.2+(c.replication?20:0)+(c.queue?12:0)+(c.failover?10:0);
  const met=[served>=.95&&latency<=150,durable===100&&backlog===0,cost<=160];
  const bottleneck=!c.failover?'Regional routing':servingWork/webCapacity>databaseWork/databaseCapacity?'Surviving serving nodes':'Database';
  return finish(level,met,[metric('Requests served after region loss',served*100,'%',met[0]),metric('Incident model latency',latency,'ms',latency<=150),metric('Accepted work preserved',durable,'%',durable===100),metric('Background backlog',backlog,'jobs',backlog===0),metric('Architecture cost',cost,'coins',met[2]),metric('Surviving nodes',survivors,'nodes',true)],
    `${survivors} serving nodes survive. ${bottleneck} is the limiting stage. Read offload leaves ${round(databaseWork)} database operations; durability requires both replicated state and a surviving job queue.`,
    !c.failover ? 'Reroute around the lost region, then inspect surviving capacity.' : !c.replication||!c.queue ? 'Protect acknowledged state with replication and background jobs with a durable queue.' : cost>160 ? 'Trim cost while keeping enough surviving capacity and read offload.' : 'Increase surviving serving capacity or read-cache offload until the chain clears the surge.',
    {count:1800,delivered:1800*served,events:[event('failure',`${c.servers-survivors} nodes and one data region fail.`),event('recovery',`${durable}% accepted work preserved; ${backlog} jobs remain.`)],bottleneck});
}

const models=[scale,estimate,framework,limiter,hashing,vaults,ids,shortener,crawler,notifications,feed,chat,autocomplete,cinema,drive,capstone];
export function evaluateLevel(id,config={},options={}) {
  const level=getLevel(id);
  return models[level.id-1](level,configuration(level,config),options);
}
