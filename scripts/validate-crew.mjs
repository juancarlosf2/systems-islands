// Independent route clearance audit against exported mesh vertices and actual collapse poses.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {compileCrewPlayback} from '../src/rendering/crewPlayback.js';
import {levels} from '../src/game/levels.js';
import {evaluateLevel} from '../src/game/simulation.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const source=await fs.readFile(`${root}/src/World.jsx`,'utf8');
assert.ok(source.includes('function createCrewNavigation(')&&source.includes('function animateWorld('),'Production navigation/animation helpers exist');
const helper=source.slice(source.indexOf('function createCrewNavigation('),source.indexOf('export default function World'));
const animateSource=source.slice(source.indexOf('function animateWorld('),source.indexOf('function landmarkStates('));
const {create,animate}=new Function('THREE',`${helper};${animateSource};return {create:createCrewNavigation,animate:animateWorld};`)(THREE);
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function hull(points){
 const sorted=[...new Map(points.map(p=>[`${p.x.toFixed(8)}:${p.z.toFixed(8)}`,p])).values()].sort((a,b)=>a.x-b.x||a.z-b.z);
 const chain=list=>{const result=[];for(const p of list){while(result.length>1&&cross(result.at(-2),result.at(-1),p)<=0)result.pop();result.push(p);}result.pop();return result;};
 return [...chain(sorted),...chain(sorted.slice().reverse())];
}
const distance=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);};
const hit=(a,b,c,d)=>{const u=cross(a,b,c),v=cross(a,b,d),s=cross(c,d,a),t=cross(c,d,b);return u*v<0&&s*t<0;};
function pathHits(a,b,poly){
 const inside=p=>poly.every((q,i)=>cross(q,poly[(i+1)%poly.length],p)>=-1e-8);
 return inside(a)||inside(b)||poly.some((c,i)=>{const d=poly[(i+1)%poly.length];return hit(a,b,c,d)||Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b))<.10-1e-7;});
}
const report=[];let beacon;
for(let id=1;id<=16;id++){
 const bytes=await fs.readFile(`${root}/public/models/chapter-${String(id).padStart(2,'0')}.glb`);
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');scene.userData.chapterId=id;
 const nav=create(scene),nodes=[],targets=new Set();scene.traverse(o=>{nodes.push({object:o,position:o.position.clone(),rotation:o.rotation.clone()});if(o.userData.crewObstacle?.canTip)targets.add(o.userData.landmark);});
 // Compile the same production paths used by both baseline and repaired trials.
 for(const config of [levels[id-1].defaultConfig,levels[id-1].solution])compileCrewPlayback(evaluateLevel(id,config).trace,nav);
 // Explicitly cover the unavailable-site refuge and queue/exit paths as well.
 const refuge=nav.getSlots('refuge'),entrance=nav.getSlots('entrance'),exit=nav.getSlots('exit');
 for(let i=0;i<10;i++){nav.getPath(entrance[i],refuge[i]);nav.getPath(refuge[i],exit[i]);}
 const auditedPaths=[...nav.routes.flatMap(route=>[route.enter,route.leave]),...nav.paths.values()];
 const allSlots=[...nav.slots.values()].flat();
 assert.equal(new Set(allSlots.map(slot=>`${slot.point.x}:${slot.point.z}`)).size,allSlots.length,`Chapter ${id} distinct reservations`);
 const dynamic={actors:[],nodes,model:scene,chapterId:id,start:0,effects:[],damage:{severity:1,type:'region-collapse',keys:[...targets]}};
 let collisions=0;const examples=[];
 for(let phase=0;phase<=20;phase++){
  animate(dynamic,{config:{},running:true},1.5+phase/20*1.5,false,false);scene.updateMatrixWorld(true);
  for(const {object:o} of nodes){
   if(!o.geometry||!o.userData.crewObstacle)continue;
   const positions=o.geometry.attributes.position,vertices=[];
   for(let i=0;i<positions.count;i++)vertices.push(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld));
   const polygon=hull(vertices);if(polygon.length<3)continue;
   if(id===16&&o.name==='beacon'&&phase===20)beacon={actualMinX:Math.min(...vertices.map(p=>p.x)),actualMaxX:Math.max(...vertices.map(p=>p.x)),oldClearanceEnvelope:.32+.30+.10};
   for(const path of auditedPaths)for(let j=1;j<path.points.length;j++)if(pathHits(path.points[j-1],path.points[j],polygon)){collisions++;if(examples.length<3)examples.push({mesh:o.name,phase:phase/20});}
  }
 }
 report.push({id,routes:nav.routes.length,compiledPaths:nav.paths.size,reservedSlots:allSlots.length,deformedGeometryIntersections:collisions,...(examples.length?{examples}:{})});
}
console.log(JSON.stringify({coverage:{collapsePoses:21,geometry:'Tagged exported mesh hulls in XZ with .10 route clearance',configurationTransforms:false,fullAnimatedBodyAndProps:false},beacon,report}));if(report.some(r=>r.deformedGeometryIntersections))process.exitCode=1;
