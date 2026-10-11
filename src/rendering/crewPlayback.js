// The trace is authoritative. Physical routes may trail rapid simultaneous events,
// but never shortcut an obstacle or manufacture delivery counts.
const terminalActions = new Set(['complete', 'reject', 'rejected', 'lost', 'suppress', 'suppressed']);
const terminalOutcomes = new Set(['completed', 'rejected', 'lost', 'suppressed']);
const waitingActions = new Set(['queue', 'retry', 'retain', 'retained']);
const countKeys = ['input', 'completed', 'rejected', 'lost', 'retained', 'suppressed'];
const emptyCounts = () => Object.fromEntries(countKeys.map(key=>[key,0]));
export const crewRoleColors = Object.freeze({ visitor:'#e0bb74', operator:'#91bdab', courier:'#d5603d', technician:'#83a8c0' });

function upperBound(items, atMs, time = 'atMs') {
  let low=0,high=items.length;
  while(low<high){const middle=(low+high)>>>1;if(items[middle][time]<=atMs)low=middle+1;else high=middle;}
  return low;
}

export function traceEventAt(events, atMs) {
  return events[upperBound(events,atMs)-1] || null;
}

// Aggregate loss visuals use elapsed model counters, including unsampled jobs.
// Prefixes are built once; packet animation never scans the entire trace.
export function tracePacketState(playback, atMs) {
  const index=upperBound(playback.events,atMs)-1;
  const counts=playback.countPrefixes[index]||playback.emptyCounts;
  const total=Math.max(1,counts.input);
  return {counts,lostRatio:Math.min(1,counts.lost/total),retainedRatio:Math.min(1,counts.retained/total),rejectedRatio:Math.min(1,counts.rejected/total),suppressedRatio:Math.min(1,counts.suppressed/total)};
}

export function compileCrewPlayback(trace, navigation) {
  const jobs=(trace.jobs||[]).slice(0,10);
  const byJob=new Map(jobs.map(job=>[job.id,[]]));
  const events=(trace.events||[]).slice(0,2000).sort((a,b)=>a.atMs-b.atMs||a.seq-b.seq);
  for(const event of events)byJob.get(event.jobId)?.push(event);
  let cumulative=emptyCounts();
  const countPrefixes=events.map(event=>{
    cumulative=Object.fromEntries(countKeys.map(key=>[key,cumulative[key]+(event.countDelta?.[key]||0)]));
    return cumulative;
  });
  const knownSites=new Set(navigation.routes.map(route=>route.landmark));
  // Allocate in source-site order so previous trials/configurations cannot move
  // another job's queue. Chart idle navigation never allocates these slots.
  for(const site of ['entrance',...[...knownSites].sort(),'refuge','exit'])navigation.getSlots(site);
  let fallbackCount=0;
  const timelines=jobs.map((job,index)=>{
    const jobEvents=byJob.get(job.id);
    const entrance=navigation.getSlots('entrance')[index];
    const firstAt=jobEvents[0]?.atMs??0;
    const hasTerminalMarkers=jobEvents.some(event=>typeof event.jobTerminal==='boolean');
    let previous=entrance,end=firstAt;
    const segments=[];
    for(const [eventIndex,event] of jobEvents.entries()){
      // Subsidiary completion, deduplication and ACK operations stay at their
      // sites. Production traces explicitly mark final logical job settlement.
      const terminal=hasTerminalMarkers?event.jobTerminal===true&&terminalOutcomes.has(job.outcome):eventIndex===jobEvents.length-1&&(terminalOutcomes.has(job.outcome)||terminalActions.has(event.action));
      const site=terminal?'exit':knownSites.has(event.landmark)?event.landmark:'refuge';
      if(site==='refuge')fallbackCount++;
      const slot=navigation.getSlots(site)[index];
      const path=navigation.getPath(previous,slot);
      // Start as soon as the model event occurs. Repeated gestures at one site do
      // not add travel; simultaneous handoffs serialize without teleportation.
      const duration=previous.id===slot.id?0:Math.max(180,Math.min(500,path.length*55));
      // Departures can use the idle interval leading up to their terminal event.
      // Counts and event captions still settle only at the event's actual time.
      const start=Math.max(end,firstAt,event.atMs-(terminal?duration:0));
      end=start+duration;
      segments.push({start,end,path,slot,event,terminal});
      previous=slot;
    }
    const duration=trace.playbackMs||6000;
    const available=Math.max(0,duration-firstAt);
    const presentationScale=end>duration?available/(end-firstAt||1):1;
    const holdAtEntrance=available===0&&segments.some(segment=>segment.path.length>0);
    if(presentationScale<1)for(const segment of segments){segment.start=Math.min(duration,firstAt+(segment.start-firstAt)*presentationScale);segment.end=Math.min(duration,firstAt+(segment.end-firstAt)*presentationScale);}
    return {job,events:jobEvents,segments,entrance,index,presentationScale,holdAtEntrance};
  });
  return {trace,events,countPrefixes,emptyCounts:emptyCounts(),timelines,fallbackCount,navigationRevision:navigation.revision};
}

// Callers provide reusable position vectors. Lookup stays O(log(events/job)).
export function sampleCrewPlayback(timeline, atMs, reduced, position) {
  const event=traceEventAt(timeline.events,atMs);
  const segmentIndex=reduced?upperBound(timeline.events,atMs)-1:upperBound(timeline.segments,atMs,'start')-1;
  const segment=timeline.segments[segmentIndex];
  const firstAt=timeline.events[0]?.atMs??Infinity;
  if(timeline.holdAtEntrance){position.copy(timeline.entrance.point);return {visible:atMs>=firstAt,event,slot:timeline.entrance,walking:false,heading:0,stage:'waiting',physicalLimited:true};}
  if(!segment){position.copy(timeline.entrance.point);return {visible:atMs>=firstAt,event,slot:timeline.entrance,walking:false,heading:0,stage:'arriving'};}
  const fraction=reduced||segment.end===segment.start?1:Math.min(1,Math.max(0,(atMs-segment.start)/(segment.end-segment.start)));
  const path=segment.path;
  let distance=path.length*fraction,heading=0;
  if(fraction>=1)position.copy(segment.slot.point);
  else for(let i=1;i<path.points.length;i++){
    const from=path.points[i-1],to=path.points[i],length=from.distanceTo(to);
    if(distance<=length||i===path.points.length-1){position.copy(from).lerp(to,length?Math.min(1,distance/length):1);heading=Math.atan2(to.x-from.x,to.z-from.z);break;}
    distance-=length;
  }
  const walking=!reduced&&fraction<1;
  // Compressed routes can anticipate a site, but its gesture/outcome must never
  // happen before the corresponding authoritative event.
  const physicalEvent=segment.event.atMs<=atMs?segment.event:null;
  const action=physicalEvent?.action;
  const stage=walking?'walking':!physicalEvent?'waiting':segment.terminal?'exited':waitingActions.has(action)?'waiting':action==='ack'?'acknowledging':action==='arrive'?'arriving':'working';
  return {visible:atMs>=firstAt,event,physicalEvent,slot:segment.slot,walking,heading,stage};
}
