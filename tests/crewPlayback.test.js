import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {compileCrewPlayback,sampleCrewPlayback,traceEventAt,tracePacketState} from '../src/rendering/crewPlayback.js';
import {evaluateLevel} from '../src/game/simulation.js';
import {getLevel} from '../src/game/levels.js';

const source=await fs.readFile(new URL('../src/World.jsx',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function createCrewNavigation('),source.indexOf('export default function World'));
const createNavigation=new Function('THREE',`${helpers};return createCrewNavigation;`)(THREE);
const bytes=await fs.readFile(new URL('../public/models/chapter-16.glb',import.meta.url));
const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
scene.userData.chapterId=16;
const originals=[];
scene.traverse(node=>{if(node.geometry)originals.push([node.geometry,node.geometry.attributes.position.array.slice()]);});
const nav=createNavigation(scene);
const site=nav.routes[0].landmark,other=nav.routes.find(route=>route.landmark!==site).landmark;
const jobs=Array.from({length:10},(_,i)=>({id:`job-${i}`,role:['visitor','operator','courier','technician'][i%4]}));
const events=jobs.flatMap((job,index)=>[
  {seq:index,atMs:0,jobId:job.id,landmark:site,action:'arrive'},
  {seq:10+index,atMs:1200,jobId:job.id,landmark:site,action:'queue'},
  {seq:20+index,atMs:1600,jobId:job.id,landmark:other,action:'handoff'},
  {seq:30+index,atMs:3000,jobId:job.id,landmark:other,action:index<5?'retry':'work'},
  {seq:40+index,atMs:4800,jobId:job.id,landmark:other,action:index<3?'retained':index<6?'rejected':'complete'},
]);
const trace={jobs,events,playbackMs:6000};
const playback=compileCrewPlayback(trace,nav);
const navigationCache=new Map([[16,nav]]);
async function navigationFor(id){
  if(!navigationCache.has(id)){
    const data=await fs.readFile(new URL(`../public/models/chapter-${String(id).padStart(2,'0')}.glb`,import.meta.url));
    const {scene}=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
    scene.userData.chapterId=id;
    const positions=[];scene.traverse(node=>{if(node.geometry)positions.push([node.geometry,node.geometry.attributes.position.array.slice()]);});
    navigationCache.set(id,createNavigation(scene));
    positions.forEach(([geometry,array])=>assert.deepEqual(geometry.attributes.position.array,array));
  }
  return navigationCache.get(id);
}

test('trace events are indexed in time/sequence order; simultaneous events settle together',()=>{
  assert.equal(traceEventAt(playback.events,-1),null);
  assert.equal(traceEventAt(playback.events,1200).seq,19);
  assert.equal(traceEventAt(playback.events,6000).seq,49);
  assert.equal(playback.timelines.length,10);
});

test('ten jobs reserve distinct safe site/queue/refuge/exit slots and cache immutable routes',()=>{
  const pool=[...nav.slots.values()].flat();
  for(let i=0;i<pool.length;i++){
    assert.ok(nav.isClear(pool[i].point));
    for(let j=i+1;j<pool.length;j++)assert.ok(pool[i].point.distanceTo(pool[j].point)>=.24-1e-9);
  }
  for(const path of nav.paths.values())for(let i=1;i<path.points.length;i++)assert.ok(nav.segmentClear(path.points[i-1],path.points[i]));
  const [from,to]=[nav.getSlots(site)[0],nav.getSlots(other)[0]];
  assert.equal(nav.getPath(from,to),nav.getPath(from,to));
  originals.forEach(([geometry,array])=>assert.deepEqual(geometry.attributes.position.array,array));
});

test('paused/rewound sampling is deterministic, safe, bounded and avoids route planning',()=>{
  const pathCount=nav.paths.size;
  for(const atMs of [0,80,700,1200,1800,3000,4800,6000,1200]){
    const slots=[];
    for(const timeline of playback.timelines){
      const a=new THREE.Vector3(),b=new THREE.Vector3();
      const one=sampleCrewPlayback(timeline,atMs,false,a),two=sampleCrewPlayback(timeline,atMs,false,b);
      assert.deepEqual(one,two);assert.deepEqual(a,b);assert.ok(nav.isClear(a));
      slots.push(one.slot.id);
    }
    assert.equal(new Set(slots).size,10);
  }
  assert.equal(nav.paths.size,pathCount);
});

test('reduced motion retains model event order and unique static reservations, with retry/retention waits and rejection exit',()=>{
  for(const atMs of [1200,1600,3000,4800,6000]){
    const slots=[];
    for(const timeline of playback.timelines){
      const point=new THREE.Vector3(),pose=sampleCrewPlayback(timeline,atMs,true,point);
      assert.equal(pose.walking,false);assert.equal(pose.event.atMs,traceEventAt(timeline.events,atMs).atMs);
      assert.deepEqual(point,pose.slot.point);assert.ok(nav.isClear(point));slots.push(pose.slot.id);
      if(atMs>=4800)assert.equal(pose.stage,timeline.index<3?'waiting':'exited');
    }
    assert.equal(new Set(slots).size,10);
  }
});

test('unknown site falls back to a distinct clear refuge and compile caps sampled actors at ten',()=>{
  const unknown={jobs:[...jobs,{id:'extra'}],events:jobs.map((job,i)=>({jobId:job.id,seq:i,atMs:0,landmark:'unavailable-site',action:'retain'}))};
  const compiled=compileCrewPlayback(unknown,nav);
  assert.equal(compiled.timelines.length,10);assert.equal(compiled.fallbackCount,10);
  for(const timeline of compiled.timelines){const point=new THREE.Vector3(),pose=sampleCrewPlayback(timeline,6000,true,point);assert.equal(pose.slot.landmark,'refuge');assert.equal(pose.stage,'waiting');assert.ok(nav.isClear(point));}
});

test('late rapid handoff/ack/completion compresses only physical time and finishes at the safe exit',()=>{
  const job=jobs[0];
  const late={jobs:[job],playbackMs:6000,events:[
    {jobId:job.id,seq:0,atMs:0,landmark:site,action:'arrive'},
    {jobId:job.id,seq:1,atMs:5800,landmark:other,action:'handoff'},
    {jobId:job.id,seq:2,atMs:5900,landmark:site,action:'ack'},
    {jobId:job.id,seq:3,atMs:6000,landmark:site,action:'complete'},
  ]};
  const timeline=compileCrewPlayback(late,nav).timelines[0];
  assert.ok(timeline.presentationScale<1);assert.equal(timeline.segments.at(-1).end,6000);
  assert.deepEqual(timeline.events.map(event=>event.atMs),[0,5800,5900,6000]);
  for(let atMs=0;atMs<6000;atMs+=25){
    const point=new THREE.Vector3(),pose=sampleCrewPlayback(timeline,atMs,false,point);
    assert.ok(nav.isClear(point));
    if(pose.physicalEvent)assert.ok(pose.physicalEvent.atMs<=atMs);
    assert.notEqual(pose.stage,'exited');
  }
  const point=new THREE.Vector3(),pose=sampleCrewPlayback(timeline,6000,false,point);
  assert.equal(pose.stage,'exited');assert.equal(pose.slot.landmark,'exit');assert.deepEqual(point,pose.slot.point);
});

test('actual durable notification and chat retention never produce loss packet visuals',async()=>{
  for(const [id,config,expected] of [
    [10,{...getLevel(10).solution,retries:0},{lost:0,retained:4,suppressed:3}],
    [12,{...getLevel(12).solution,replay:false},{lost:0,retained:5,suppressed:0}],
  ]){
    const result=evaluateLevel(id,config),compiled=compileCrewPlayback(result.trace,await navigationFor(id));
    assert.ok(result.traffic.dropped>0,'legacy aggregate deliberately differs from actual loss');
    const final=tracePacketState(compiled,6000);
    for(const [key,value] of Object.entries(expected))assert.equal(final.counts[key],value);
    assert.equal(final.lostRatio,0);assert.ok(final.retainedRatio>0);
    for(const event of compiled.events){
      const elapsed=tracePacketState(compiled,event.atMs);
      const expectedCounts=compiled.events.filter(entry=>entry.atMs<=event.atMs).reduce((counts,entry)=>({lost:counts.lost+(entry.countDelta?.lost||0),retained:counts.retained+(entry.countDelta?.retained||0)}),{lost:0,retained:0});
      assert.equal(elapsed.counts.lost,expectedCounts.lost);assert.equal(elapsed.counts.retained,expectedCounts.retained);
      assert.equal(elapsed.lostRatio,0);
    }
  }
});

test('actual volatile work sinks only after elapsed trace loss events',async()=>{
  for(const [id,config] of [[10,{...getLevel(10).solution,queue:false,retries:0}],[12,{...getLevel(12).solution,history:false,replay:false}]]){
    const compiled=compileCrewPlayback(evaluateLevel(id,config).trace,await navigationFor(id));
    const loss=compiled.events.find(event=>event.countDelta?.lost>0);
    assert.ok(loss);assert.equal(tracePacketState(compiled,loss.atMs-.001).lostRatio,0);
    assert.ok(tracePacketState(compiled,loss.atMs).lostRatio>0);
    assert.equal(tracePacketState(compiled,6000).counts.lost,compiled.trace.counts.lost);
  }
});

test('actual chapter14 viewer first appears at entrance; compressed paths stay continuous and exit only after final operation',async()=>{
  const navigation=await navigationFor(14),compiled=compileCrewPlayback(evaluateLevel(14,getLevel(14).solution).trace,navigation);
  const viewer=compiled.timelines.find(timeline=>timeline.job.id==='viewer'),firstAt=viewer.events[0].atMs;
  assert.ok(firstAt>4000&&firstAt<6000);assert.ok(viewer.presentationScale<1);
  const firstPosition=new THREE.Vector3(),firstPose=sampleCrewPlayback(viewer,firstAt,false,firstPosition);
  assert.equal(firstPose.visible,true);assert.deepEqual(firstPosition,viewer.entrance.point);
  const hidden=sampleCrewPlayback(viewer,firstAt-.001,false,new THREE.Vector3());assert.equal(hidden.visible,false);
  for(const timeline of compiled.timelines){
    assert.equal(timeline.segments.filter(segment=>segment.terminal).length,1);
    assert.equal(timeline.segments.at(-1).event,timeline.events.at(-1));
    assert.ok(timeline.segments.at(-1).end<=6000);
    for(let i=1;i<timeline.segments.length;i++){
      assert.deepEqual(timeline.segments[i].path.points[0],timeline.segments[i-1].slot.point);
      assert.ok(timeline.segments[i].start>=timeline.segments[i-1].end);
    }
    for(const segment of timeline.segments){
      const position=new THREE.Vector3(),pose=sampleCrewPlayback(timeline,segment.start,false,position);
      assert.ok(navigation.isClear(position));
      if(pose.physicalEvent)assert.ok(pose.physicalEvent.atMs<=segment.start);
    }
    const last=timeline.events.at(-1);
    assert.notEqual(sampleCrewPlayback(timeline,last.atMs-.001,false,new THREE.Vector3()).stage,'exited');
    assert.equal(sampleCrewPlayback(timeline,6000,false,new THREE.Vector3()).stage,'exited');
  }
  const upload=compiled.timelines.find(timeline=>timeline.job.id==='upload');
  const operation=upload.segments.find(segment=>segment.event.action==='complete');
  assert.equal(operation.terminal,false);assert.equal(operation.slot.landmark,'upload');
  assert.equal(upload.segments.at(-1).event.action,'ack');assert.equal(upload.segments.at(-1).terminal,true);
});

test('actual chapter15 subsidiary block dedup stays on site; revisions and final chunk ACKs exit once',async()=>{
  const navigation=await navigationFor(15),compiled=compileCrewPlayback(evaluateLevel(15,getLevel(15).solution).trace,navigation);
  const revision=compiled.timelines.find(timeline=>timeline.job.id==='revision-0');
  const dedup=revision.segments.find(segment=>segment.event.action==='suppress');
  assert.equal(dedup.terminal,false);assert.equal(dedup.slot.landmark,'blocks');
  for(const timeline of compiled.timelines){
    const terminal=timeline.segments.filter(segment=>segment.terminal);
    assert.equal(terminal.length,1);assert.equal(terminal[0],timeline.segments.at(-1));
    const final=sampleCrewPlayback(timeline,6000,false,new THREE.Vector3());
    assert.equal(final.slot.landmark,'exit');assert.equal(final.stage,'exited');assert.equal(final.walking,false);
    if(timeline.job.id.startsWith('chunk-'))assert.equal(terminal[0].event.action,'ack');
  }
});

test('actual chapter10 final suppressed operation closes completed job3 and zero-duration segments settle at their start',async()=>{
  const compiled=compileCrewPlayback(evaluateLevel(10,getLevel(10).solution).trace,await navigationFor(10));
  const timeline=compiled.timelines.find(timeline=>timeline.job.id==='job-3');
  const pose=sampleCrewPlayback(timeline,6000,false,new THREE.Vector3());
  assert.equal(pose.stage,'exited');assert.equal(pose.walking,false);assert.equal(pose.slot.landmark,'exit');
  const last=timeline.segments.at(-1),instant={...timeline,segments:[{...last,start:6000,end:6000}]};
  assert.equal(sampleCrewPlayback(instant,6000,false,new THREE.Vector3()).walking,false);
  assert.equal(sampleCrewPlayback(instant,6000,false,new THREE.Vector3()).stage,'exited');
});

test('a fixture revealed only at the presentation endpoint holds its safe entrance without teleporting',()=>{
  const compiled=compileCrewPlayback({jobs:[{id:'too-late',outcome:'completed'}],playbackMs:6000,events:[{jobId:'too-late',seq:0,atMs:6000,landmark:site,action:'ack',jobTerminal:true}]},nav);
  const timeline=compiled.timelines[0],point=new THREE.Vector3(),pose=sampleCrewPlayback(timeline,6000,false,point);
  assert.equal(pose.physicalLimited,true);assert.equal(pose.stage,'waiting');assert.equal(pose.walking,false);assert.deepEqual(point,timeline.entrance.point);
});
