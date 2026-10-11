import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './world.css';
import { evaluateLevel } from './game/simulation.js';
import { batchStaticMeshes } from './rendering/batchStaticMeshes.js';
import { compileCrewPlayback, sampleCrewPlayback, traceEventAt, tracePacketState, crewRoleColors } from './rendering/crewPlayback.js';

const cache = new Map();
const navigationCache = new Map();
const emptyConfig = Object.freeze({});
const models = new GLTFLoader();
const islandPositions = [
  [-10, 18], [-22, 10], [-18, -2], [-25, -14],
  [-11, -18], [1, -21], [13, -19], [24, -12],
  [27, 0], [22, 12], [9, 22], [3, 9],
  [-5, -7], [8, -7], [13, 4], [-9, 5],
];

function getModel(id) {
  const name = id === 'worker' ? 'worker.glb' : `chapter-${String(id).padStart(2, '0')}.glb`;
  if (!cache.has(id)) {
    const source = window.__SYSTEMS_ASSETS__?.[name] || `./models/${name}`;
    const promise = models.loadAsync(source).then(gltf => {
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
      });
      return gltf.scene;
    }).catch(error => { cache.delete(id); throw error; });
    cache.set(id, promise);
  }
  return cache.get(id);
}

function createSea(scene, tracked, chart) {
  const geometry = new THREE.PlaneGeometry(240, 240);
  const material = new THREE.MeshBasicMaterial({ color: '#c6e5e4', toneMapped: false });
  const ocean = new THREE.Mesh(geometry, material);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -2.15;
  ocean.receiveShadow = true;
  scene.add(ocean);
  tracked.push(geometry, material);
  if (!chart) {
    const shadows = new THREE.ShadowMaterial({ opacity: .13 });
    const shadowPlane = new THREE.Mesh(geometry, shadows);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -2.14;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);
    tracked.push(shadows);
  }
  const points = [];
  const count = chart ? 140 : 48;
  for (let i = 0; i < count; i++) {
    const span = chart ? 75 : 27;
    const x = Math.sin(i * 31.19) * span / 2;
    const z = Math.cos(i * 17.78) * span / 2;
    points.push(new THREE.Vector3(x, -2.09, z), new THREE.Vector3(x + .38, -2.09, z + .12));
  }
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#f3fbef', transparent: true, opacity: .58 });
  const waterLines = new THREE.LineSegments(lineGeometry, lineMaterial);
  scene.add(waterLines);
  tracked.push(lineGeometry, lineMaterial);
}

function createBoat(scene, tracked, position, scale = 1) {
  const group = new THREE.Group();
  group.position.set(position[0], -1.9, position[1]);
  group.scale.setScalar(scale);
  const hullGeo = new THREE.ConeGeometry(.45, 1.7, 4);
  const hullMat = new THREE.MeshStandardMaterial({ color: '#a88663', roughness: .8 });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.rotation.z = Math.PI / 2;
  hull.scale.y = 1.1;
  group.add(hull);
  const mastGeo = new THREE.CylinderGeometry(.035, .035, 1.65, 6);
  const mastMat = new THREE.MeshStandardMaterial({ color: '#325a51' });
  const mast = new THREE.Mesh(mastGeo, mastMat);
  mast.position.y = .85;
  group.add(mast);
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,1.65,0, 0,.4,0, .9,.4,0], 3));
  sailGeo.computeVertexNormals();
  const sailMat = new THREE.MeshStandardMaterial({ color: '#f6f4ea', side: THREE.DoubleSide });
  group.add(new THREE.Mesh(sailGeo, sailMat));
  scene.add(group);
  tracked.push(hullGeo, hullMat, mastGeo, mastMat, sailGeo, sailMat);
  return group;
}

function createRoute(scene, tracked, from, to, color = '#e0bb74', height = .1) {
  const midpoint = from.clone().add(to).multiplyScalar(.5);
  midpoint.y += height;
  const curve = new THREE.QuadraticBezierCurve3(from, midpoint, to);
  const geometry = new THREE.TubeGeometry(curve, 18, .035, 5, false);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .7 });
  const mesh=new THREE.Mesh(geometry, material);
  scene.add(mesh);
  curve.mesh=mesh;
  tracked.push(geometry, material);
  return curve;
}

function createCrewNavigation(model) {
  model.updateMatrixWorld(true);
  const inverse = model.matrixWorld.clone().invert();
  const points = {entrance:[],exit:[],workstation:[]};
  const obstacles = [];
  const surfaces = [];
  let boundary;
  model.traverse(node => {
    const matrix = inverse.clone().multiply(node.matrixWorld);
    const role = node.userData.crewRole;
    if(points[role]) points[role].push({point:new THREE.Vector3().applyMatrix4(matrix),landmark:node.userData.crewLandmark});
    const polygon = node.userData.crewWalkBoundary;
    if(Array.isArray(polygon)) boundary=polygon.map(([x,z])=>new THREE.Vector3(x,0,z).applyMatrix4(matrix));
    const surface=node.userData.crewWalkSurface;
    if(surface){
      const corners=[[-1,-1],[-1,1],[1,1],[1,-1]].map(([x,z])=>new THREE.Vector3(x*surface.halfWidth,surface.height,z*surface.halfDepth).applyMatrix4(matrix));
      surfaces.push({corners,height:new THREE.Vector3(0,surface.height,0).applyMatrix4(matrix).y});
    }
    const obstacle = node.userData.crewObstacle;
    if(!obstacle)return;
    const clearance=.10+(obstacle.canTip ? .30 : 0);
    const centerX=obstacle.centerX??0,centerZ=obstacle.centerZ??0;
    if(obstacle.shape==='circle') {
      const center=new THREE.Vector3(centerX,0,centerZ).applyMatrix4(matrix);
      const scale=new THREE.Vector3().setFromMatrixScale(matrix);
      obstacles.push({shape:'circle',center,radius:obstacle.radius*Math.max(Math.abs(scale.x),Math.abs(scale.z))+clearance});
    } else if(obstacle.shape==='box') {
      const corners=[[-1,-1],[-1,1],[1,1],[1,-1]].map(([x,z])=>new THREE.Vector3(centerX+x*obstacle.halfWidth,0,centerZ+z*obstacle.halfDepth).applyMatrix4(matrix));
      obstacles.push({shape:'box',corners,clearance});
    }
    if(obstacle.canTip && node.geometry){
      // Read exact vertex bounds without changing the shared cached geometry.
      const bounds=new THREE.Box3().setFromBufferAttribute(node.geometry.attributes.position);
      const parentMatrix=inverse.clone().multiply(node.parent.matrixWorld);
      const swept=new THREE.Box3();
      const direction=node.position.x>0?1:-1;
      for(let phase=0;phase<=20;phase++){
        const fraction=phase/20;
        const position=node.position.clone();position.y-=fraction*.55;
        const rotation=node.rotation.clone();rotation.z+=direction*fraction*.23;
        const pose=parentMatrix.clone().multiply(new THREE.Matrix4().compose(position,new THREE.Quaternion().setFromEuler(rotation),node.scale));
        for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])swept.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(pose));
      }
      // Cover the continuous rotation between samples, including tall landmark bases.
      const radius=Math.hypot(Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x))*node.scale.x,Math.max(Math.abs(bounds.min.y),Math.abs(bounds.max.y))*node.scale.y);
      const parentScale=new THREE.Vector3().setFromMatrixScale(parentMatrix);
      const arcPadding=radius*Math.max(Math.abs(parentScale.x),Math.abs(parentScale.y),Math.abs(parentScale.z))*(1-Math.cos(.23/40));
      const corners=[[swept.min.x,swept.min.z],[swept.min.x,swept.max.z],[swept.max.x,swept.max.z],[swept.max.x,swept.min.z]].map(([x,z])=>new THREE.Vector3(x,0,z));
      obstacles.push({shape:'box',corners,clearance:.10+arcPadding});
    }
  });
  if(!boundary || points.entrance.length!==1 || points.exit.length!==1 || !points.workstation.length) throw new Error(`Chapter ${model.userData.chapterId} is missing authored crew navigation.`);
  const inside = (point,polygon) => {
    let contained=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const a=polygon[i],b=polygon[j];
      if((a.z>point.z)!==(b.z>point.z) && point.x<(b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x)contained=!contained;
    }
    return contained;
  };
  const edgeDistance = (point,a,b) => {
    const dx=b.x-a.x,dz=b.z-a.z;
    const fraction=THREE.MathUtils.clamp(((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
    return Math.hypot(point.x-a.x-fraction*dx,point.z-a.z-fraction*dz);
  };
  const isClear = point => inside(point,boundary) && !obstacles.some(obstacle => {
    if(obstacle.shape==='circle')return Math.hypot(point.x-obstacle.center.x,point.z-obstacle.center.z)<obstacle.radius;
    return inside(point,obstacle.corners) || obstacle.corners.some((a,i)=>edgeDistance(point,a,obstacle.corners[(i+1)%4])<obstacle.clearance);
  });
  const intersects=(a,b,c,d)=>{
    const cross=(x,z,u,v)=>x*v-z*u;
    const denominator=cross(b.x-a.x,b.z-a.z,d.x-c.x,d.z-c.z);
    if(Math.abs(denominator)<1e-9)return [a,b].some(p=>edgeDistance(p,c,d)<1e-9)||[c,d].some(p=>edgeDistance(p,a,b)<1e-9);
    const along=cross(c.x-a.x,c.z-a.z,d.x-c.x,d.z-c.z)/denominator;
    const across=cross(c.x-a.x,c.z-a.z,b.x-a.x,b.z-a.z)/denominator;
    return along>=0&&along<=1&&across>=0&&across<=1;
  };
  const segmentClear = (a,b) => {
    if(!isClear(a)||!isClear(b))return false;
    if(boundary.some((c,i)=>intersects(a,b,c,boundary[(i+1)%boundary.length])))return false;
    return !obstacles.some(obstacle=>{
      if(obstacle.shape==='circle')return edgeDistance(obstacle.center,a,b)<obstacle.radius;
      return obstacle.corners.some((c,i)=>{
        const d=obstacle.corners[(i+1)%4];
        return intersects(a,b,c,d)||Math.min(edgeDistance(a,c,d),edgeDistance(b,c,d),edgeDistance(c,a,b),edgeDistance(d,a,b))<obstacle.clearance;
      });
    });
  };
  const entrance=points.entrance[0].point,exit=points.exit[0].point;
  const ground=entrance.y;
  // Resolve narrow authored paths while preserving the .10 worker clearance.
  const step=.11;
  const minX=Math.min(...boundary.map(p=>p.x)),minZ=Math.min(...boundary.map(p=>p.z));
  const columns=Math.ceil((Math.max(...boundary.map(p=>p.x))-minX)/step)+1;
  const rows=Math.ceil((Math.max(...boundary.map(p=>p.z))-minZ)/step)+1;
  const grid=Array.from({length:columns*rows},(_,i)=>new THREE.Vector3(minX+i%columns*step,ground,minZ+Math.floor(i/columns)*step));
  const clear=grid.map(isClear);
  const edgeCache=new Map();
  const gridSegmentClear=(from,to)=>{
    const key=Math.min(from,to)*grid.length+Math.max(from,to);
    if(!edgeCache.has(key))edgeCache.set(key,segmentClear(grid[from],grid[to]));
    return edgeCache.get(key);
  };
  const findPath = (start,end) => {
    if(!isClear(start)||!isClear(end))return null;
    if(segmentClear(start,end))return [start.clone(),end.clone()];
    const nearest = point => {
      let best=-1,distance=Infinity;
      grid.forEach((cell,i)=>{const d=cell.distanceToSquared(point);if(clear[i]&&d<distance&&d<1&&segmentClear(point,cell)){best=i;distance=d;}});
      return best;
    };
    const first=nearest(start),last=nearest(end);
    if(first<0||last<0)return null;
    const costs=new Float64Array(grid.length).fill(Infinity),previous=new Int32Array(grid.length).fill(-1);
    const heap=[];
    const push = entry => {
      heap.push(entry);let i=heap.length-1;
      while(i){const parent=(i-1)>>1;if(heap[parent].priority<=entry.priority)break;heap[i]=heap[parent];i=parent;}heap[i]=entry;
    };
    const pop = () => {
      const best=heap[0],tail=heap.pop();
      if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].priority<heap[child].priority)child++;if(heap[child].priority>=tail.priority)break;heap[i]=heap[child];i=child;}heap[i]=tail;}
      return best;
    };
    costs[first]=0;push({index:first,cost:0,priority:grid[first].distanceTo(grid[last])});
    let visits=0;
    while(heap.length && visits++<grid.length*8){
      const current=pop(),index=current.index;
      if(current.cost!==costs[index])continue;
      if(index===last){
        const path=[end.clone()];let cursor=last;
        while(cursor!==-1){path.push(grid[cursor].clone());cursor=previous[cursor];}path.push(start.clone());path.reverse();
        // Remove redundant turns only when the whole replacement segment is clear.
        const simplified=[path[0]];let anchor=0;
        while(anchor<path.length-1){let next=path.length-1;while(next>anchor+1&&!segmentClear(path[anchor],path[next]))next--;simplified.push(path[next]);anchor=next;}
        return simplified;
      }
      const x=index%columns,z=Math.floor(index/columns);
      for(const [dx,dz] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]]){
        const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=columns||nz>=rows)continue;
        const next=nz*columns+nx;if(!clear[next]||!gridSegmentClear(index,next))continue;
        const cost=costs[index]+Math.hypot(dx,dz)*step;
        if(cost>=costs[next])continue;
        costs[next]=cost;previous[next]=index;push({index:next,cost,priority:cost+grid[next].distanceTo(grid[last])});
      }
    }
    return null;
  };
  const pathData = points => ({points,length:points.slice(1).reduce((n,p,i)=>n+p.distanceTo(points[i]),0)});
  const routes=[];
  for(const station of points.workstation){
    const enter=findPath(entrance,station.point),leave=findPath(station.point,exit);
    if(enter&&leave)routes.push({workstation:station.point,landmark:station.landmark,enter:pathData(enter),leave:pathData(leave)});
  }
  if(!routes.length)throw new Error(`Chapter ${model.userData.chapterId} has no unobstructed crew routes.`);
  let celebrity;
  model.traverse(node=>{if(!celebrity&&node.isMesh&&node.userData.landmark==='celebrity')celebrity=node.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);});
  const crowdRoutes=celebrity ? routes.filter(r=>r.landmark==='celebrity') : [];
  if(!crowdRoutes.length)crowdRoutes.push(...(celebrity ? routes.slice().sort((a,b)=>a.workstation.distanceToSquared(celebrity)-b.workstation.distanceToSquared(celebrity)).slice(0,5) : routes));
  const heightAt=point=>surfaces.find(surface=>inside(point,surface.corners))?.height??.22;
  // Slots are authored-site-adjacent clear spaces, shared across all reservations.
  // Keeping distinct slots globally also prevents neighbouring sites sharing a queue spot.
  let revisionHash=2166136261;
  const revisionSource=JSON.stringify({boundary,obstacles,points,surfaces});
  for(let i=0;i<revisionSource.length;i++)revisionHash=Math.imul(revisionHash^revisionSource.charCodeAt(i),16777619);
  const revision=`chapter-${model.userData.chapterId}:clearance-v2:${(revisionHash>>>0).toString(16)}`;
  const slots=new Map(),reservedPoints=[],paths=new Map();
  const getSlots=landmark=>{
    if(slots.has(landmark))return slots.get(landmark);
    const route=routes.find(r=>r.landmark===landmark)||routes[0];
    const anchor=landmark==='entrance'?entrance:landmark==='exit'?exit:route.workstation;
    const candidates=[anchor,...grid.filter((p,i)=>clear[i]&&p.distanceToSquared(anchor)<36).sort((a,b)=>a.distanceToSquared(anchor)-b.distanceToSquared(anchor))];
    const result=[];
    for(const direct of [true,false]){
      for(const point of candidates){
        if(reservedPoints.some(p=>p.distanceToSquared(point)<.24*.24))continue;
        const connector=direct?(segmentClear(anchor,point)?[anchor,point]:null):findPath(anchor,point);
        if(!connector)continue;
        const slot={id:`${landmark}:${result.length}`,landmark,point:point.clone(),anchor,route,connector,available:landmark==='entrance'||landmark==='exit'||route.landmark===landmark};
        result.push(slot);reservedPoints.push(slot.point);
        if(result.length===10)break;
      }
      if(result.length===10)break;
    }
    if(result.length<10)throw new Error(`Chapter ${model.userData.chapterId} has insufficient safe queue slots for ${landmark}.`);
    slots.set(landmark,result);return result;
  };
  const getPath=(from,to)=>{
    const key=`${revision}:${from.id}>${to.id}`;
    if(paths.has(key))return paths.get(key);
    let points;
    if(segmentClear(from.point,to.point))points=[from.point,to.point];
    else {
      // Existing entrance spines form a conservative exterior graph. No per-frame A*.
      // Exit's spine runs exit -> workstation -> entrance.
      const toEntrance=slot=>slot.landmark==='exit'?[...slot.route.leave.points].reverse().concat([...slot.route.enter.points].reverse().slice(1)):slot.landmark==='entrance'?[entrance]:[...slot.route.enter.points].reverse();
      points=[...from.connector].reverse().concat(toEntrance(from),toEntrance(to).reverse(),to.connector);
      const simplified=[points[0]];let index=0;
      while(index<points.length-1){let next=points.length-1;while(next>index+1&&!segmentClear(points[index],points[next]))next--;simplified.push(points[next]);index=next;}
      points=simplified;
    }
    const path=pathData(points.map(p=>p.clone()));
    if(path.points.some((p,i)=>i&&!segmentClear(path.points[i-1],p)))throw new Error(`Unsafe crew path ${key}`);
    paths.set(key,path);return path;
  };
  return {entrance,exit,routes,crowdRoutes,isClear,heightAt,segmentClear,revision,getSlots,getPath,paths,slots};
}

function pointOnCrewPath(path,distance) {
  for(let i=1;i<path.points.length;i++){
    const from=path.points[i-1],to=path.points[i],length=from.distanceTo(to);
    if(distance<=length || i===path.points.length-1)return {point:from.clone().lerp(to,length?Math.min(1,distance/length):1),heading:Math.atan2(to.x-from.x,to.z-from.z)};
    distance-=length;
  }
  return {point:path.points[0].clone(),heading:0};
}

export default function World(props) {
  const host = useRef(null);
  const state = useRef(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const [error, setError] = useState(null);
  const mode = props.mode || 'chart';
  const levelId = props.level?.id || 1;

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer;
    let disposed = false;
    let frame;
    const tracked = [];
    const labels = [];
    const chart = mode === 'chart';
    let markersDirty = true;
    let markerLevelId;
    let width = 1, height = 1;
    const projectedMarker = new THREE.Vector3();
    let navPaths = 0;
    let diagnosticServers = [];
    setError(null);
    element.dataset.modelsLoaded = '0';
    element.dataset.renderedFrames = '0';
    element.dataset.chapter = chart ? 'chart' : String(levelId);
    element.dataset.workerScale = chart ? '.32 × island scale' : '.32';
    element.dataset.doorHeight = '.46';
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (cause) {
      const message = '3D rendering is unavailable in this browser. You can still use the chapter controls and field guide.';
      setError(message);
      callbacks.current.onReady?.({ ok: false, message });
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !chart;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.className = 'world-canvas';
    renderer.domElement.setAttribute('aria-label', chart ? 'Interactive 3D chapter archipelago. Select an island using its numbered button.' : `Interactive 3D environment for ${callbacks.current.level?.title || 'this chapter'}. Drag to orbit and select a landmark to inspect it.`);
    renderer.domElement.setAttribute('role', 'img');
    element.appendChild(renderer.domElement);
    const eventCaption=document.createElement('div');
    eventCaption.className='world-event';
    eventCaption.setAttribute('aria-hidden','true');
    if(!chart)element.appendChild(eventCaption);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#c6e5e4');
    scene.fog = new THREE.Fog('#c6e5e4', 100, 220);
    const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, .1, 400);
    camera.position.set(chart ? 42 : 15, chart ? 49 : 18, chart ? 48 : 21);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(chart ? 0 : 0, chart ? 0 : .5, chart ? 0 : 0);
    controls.enableDamping = true;
    controls.dampingFactor = .06;
    controls.minPolarAngle = .40;
    controls.maxPolarAngle = 1.22;
    controls.minZoom = chart ? .65 : .6;
    controls.maxZoom = chart ? 2.7 : 2.2;
    controls.enablePan = true;
    controls.update();
    const invalidateMarkers = () => { markersDirty = true; };
    controls.addEventListener('change', invalidateMarkers);

    scene.add(new THREE.HemisphereLight('#fff9e6', '#669c9d', 2.3));
    const sun = new THREE.DirectionalLight('#fff1dc', 3.2);
    sun.position.set(-12, 25, 15);
    sun.castShadow = !chart;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
    sun.shadow.normalBias = .035;
    scene.add(sun);
    createSea(scene, tracked, chart);
    const boat = createBoat(scene, tracked, chart ? [-18, 21] : [8, 5], chart ? .9 : .7);
    if (chart) createBoat(scene, tracked, [26, 17], .9);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const root = new THREE.Group();
    scene.add(root);
    const dynamic = { chapterId: levelId, model: null, highlights: [], packetRoutes: [], packets: [], running: false, configuration: null, modelsLoaded: 0, ready: false, centers: new Map(), servers: [], actors: [], nodes: [], effects: [], forecast: null, configKey: null, damage: { severity: 0, type: 'none', keys: [] } };
    const followPosition=new THREE.Vector3(),followDelta=new THREE.Vector3();
    const carriedGeometry=chart?null:new THREE.BoxGeometry(.32,.24,.18);
    const carriedMaterials=chart?null:Object.fromEntries(Object.entries(crewRoleColors).map(([role,color])=>[role,new THREE.MeshStandardMaterial({color,roughness:.8})]));
    const followedMaterial=chart?null:new THREE.MeshStandardMaterial({color:'#f8df88',emissive:'#dfb54b',emissiveIntensity:.6,roughness:.7,depthTest:false,depthWrite:false});
    if(!chart)tracked.push(carriedGeometry,...Object.values(carriedMaterials),followedMaterial);
    state.current = { dynamic, scene, camera, renderer, controls };

    function labelFor(id, worldPosition) {
      const button = document.createElement('button');
      button.className = `island-marker${id === levelId ? ' is-current' : ''}`;
      button.textContent = String(id).padStart(2, '0');
      button.setAttribute('aria-label', `Select chapter ${id}`);
      button.title = `Chapter ${id}`;
      button.addEventListener('click', () => callbacks.current.onSelectLevel?.(id));
      element.appendChild(button);
      labels.push({ button, position: worldPosition, id });
      markersDirty = true;
    }

    const ready = Promise.all([chart ? Promise.all(Array.from({length:16}, (_, i) => getModel(i + 1))) : Promise.all([getModel(levelId)]), getModel('worker')]);
    ready.then(([scenes, workerSource]) => {
      if (disposed) return;
      const workerFootOffset=new THREE.Box3().setFromObject(workerSource).min.y*.32;
      scenes.forEach((source, i) => {
        const model = source.clone(true);
        const id = chart ? i + 1 : levelId;
        model.userData.chapterId = id;
        // Cache normalized local routes before chart batching or any level deformation.
        if (!navigationCache.has(id)) {
          const navigationModel = source.clone(true);
          navigationModel.userData.chapterId = id;
          navigationCache.set(id, createCrewNavigation(navigationModel));
        }
        const navigation = navigationCache.get(id);
        navPaths += navigation.routes.length * 2;
        if (chart) {
          batchStaticMeshes(model);
          const [x,z] = islandPositions[i];
          model.scale.setScalar(id === 1 ? .95 : .69);
          model.position.set(x, -.8, z);
          model.rotation.y = (i % 3 - 1) * .2;
          labelFor(id, new THREE.Vector3(x, -.2, z + 4.4));
        } else {
          dynamic.model = model;
          model.traverse(o => {
            dynamic.nodes.push({object:o, position:o.position.clone(), rotation:o.rotation.clone(), scale:o.scale.clone(), visible:o.visible});
            if (!o.isMesh) return;
            if (Array.isArray(o.material)) o.material=o.material.map(m=>m.clone());
            else o.material=o.material.clone();
            const materials=Array.isArray(o.material)?o.material:[o.material];
            materials.forEach(m=>{m.userData.originalColor=m.color?.clone();});
            if (/^server_\d+$/.test(o.name)) {
              const position = new THREE.Vector3();
              o.getWorldPosition(position);
              position.y=.62;
              dynamic.servers.push({index:Number(o.name.split('_')[1]),position});
            }
          });
          // Landmarks determine request routes from the actual Blender node positions.
          const centers = new Map();
          model.updateMatrixWorld(true);
          model.traverse(o => {
            const key = o.userData.landmark;
            if (key && !centers.has(key) && o.isMesh) {
              const position = new THREE.Vector3();
              o.getWorldPosition(position);
              position.y = .55;
              centers.set(key, position);
            }
          });
          const positions = [...centers.values()];
          dynamic.centers=centers;
          if (positions.length < 2) positions.push(new THREE.Vector3(-3,.6,-3), new THREE.Vector3(3,.6,3));
          dynamic.servers.sort((a,b)=>a.index-b.index);
        }
        root.add(model);
        for (let j = 0; j < (chart ? 2 : 10); j++) {
          const actor = workerSource.clone(true);
          actor.scale.setScalar(.32);
          const joints = [];
          actor.traverse(o => {
            if (/^worker_(arm|leg)_(left|right)$/.test(o.name)) joints.push({object:o, rotation:o.rotation.clone(), leg:/leg/i.test(o.name)});
          });
          let carried;
          if(!chart){
            carried=new THREE.Mesh(carriedGeometry,carriedMaterials.visitor);
            carried.position.set(.38,.94,.18);
            carried.visible=false;
            carried.raycast=()=>{};
            actor.add(carried);
          }
          model.add(actor);
          const route = navigation.routes[j % navigation.routes.length];
          actor.position.copy(navigation.entrance);
          dynamic.actors.push({object:actor, joints, navigation, route, carried, carriedMaterials, followedMaterial, footOffset:workerFootOffset, index:j, stage:'entering', distance:0, pause:0, initialized:false});
        }
      });
      dynamic.modelsLoaded = scenes.length;
      dynamic.ready = true;
      diagnosticServers = dynamic.nodes.filter(({object}) => /^server_\d+$/.test(object.name));
      element.dataset.navPaths = String(navPaths);
      if (chart) {
        for (let i = 0; i < 15; i++) {
          const a = islandPositions[i], b = islandPositions[i + 1];
          createRoute(scene, tracked, new THREE.Vector3(a[0],-1.93,a[1]),new THREE.Vector3(b[0],-1.93,b[1]),'#f6f4ea', .1);
        }
      }
      const packetGeometry = new THREE.SphereGeometry(chart ? .13 : .13, 8, 6);
      const packetMaterial = new THREE.MeshStandardMaterial({ color: '#d5603d', emissive: '#d5603d', emissiveIntensity: .22, roughness: .5 });
      const lostMaterial = new THREE.MeshStandardMaterial({ color: '#b14c43', roughness: .6 });
      tracked.push(packetGeometry, packetMaterial, lostMaterial);
      for (let i = 0; i < (chart ? 12 : 36); i++) {
        const p = new THREE.Mesh(packetGeometry, packetMaterial);
        p.userData.phase = i / 36;
        p.userData.lostMaterial = lostMaterial;
        p.userData.goodMaterial = packetMaterial;
        scene.add(p);
        dynamic.packets.push(p);
      }
      element.dataset.modelsLoaded = String(scenes.length);
      element.dataset.workerLoaded = 'true';
      callbacks.current.onReady?.({ ok: true, message: `${scenes.length} Blender world${scenes.length > 1 ? 's' : ''} loaded.` });
    }).catch(cause => {
      if (disposed) return;
      const message = 'A Blender island could not load. Reload the page or open the complete portable edition.';
      setError(message);
      callbacks.current.onReady?.({ ok: false, message });
      console.error('Blender model load failed', cause);
    });

    const resize = () => {
      width = Math.max(1, element.clientWidth);
      height = Math.max(1, element.clientHeight);
      renderer.setSize(width, height);
      const aspect = width / height;
      const half = chart ? Math.max(32, 32 / aspect) : 7;
      camera.left = -half * aspect;
      camera.right = half * aspect;
      camera.top = half;
      camera.bottom = -half;
      camera.updateProjectionMatrix();
      markersDirty = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    let down;
    const onDown = event => { down = { x: event.clientX, y: event.clientY }; };
    const onUp = event => {
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(root.children, true)[0];
      if (!hit) return;
      let node = hit.object;
      if (chart) {
        while (node && !node.userData.chapterId) node = node.parent;
        if (node) callbacks.current.onSelectLevel?.(node.userData.chapterId);
      } else {
        while (node && !node.userData.landmark) node = node.parent;
        if (node) callbacks.current.onInspect?.(node.userData.landmark);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let previous = 0;
    let diagnosticTime = -Infinity;
    let rendererDiagnosticTime = -Infinity;
    let renderedFrames = 0;
    function animate(time) {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      if (document.hidden || time - previous < 28) return;
      previous = time;
      const t = time / 1000;
      controls.update();
      const supplied = callbacks.current;
      const projectedMs=supplied.playback?Math.max(0,Math.min(6000,(supplied.playback.atMs||0)+(supplied.playback.paused||!Number.isFinite(supplied.playback.sampledAt)?0:Math.max(0,time-supplied.playback.sampledAt)))):0;
      const current=!chart&&supplied.playback?{...supplied,playback:{...supplied.playback,atMs:projectedMs}}:supplied;
      const playbackTime=!chart&&current.playback?projectedMs/1000:t;
      boat.rotation.y = .3;
      const motionReduced = reducedMotion.matches || current.config?.reducedMotion;
      if (!motionReduced) boat.position.y = -1.9 + Math.sin(t) * .055;
      const configurationChanged = dynamic.model && updateConfiguration(dynamic, current.config || emptyConfig, tracked, current, scene, playbackTime);
      animateWorld(dynamic, current, playbackTime, motionReduced, chart);
      const packetState=!chart&&current.playback&&dynamic.crewPlayback?tracePacketState(dynamic.crewPlayback,projectedMs):null;
      if(!chart&&current.playback?.followJobId){
        const followed=dynamic.actors.find(actor=>actor.jobId===current.playback.followJobId&&actor.object.visible);
        if(followed){
          followed.object.getWorldPosition(followPosition);
          followPosition.y=.5;
          followDelta.copy(followPosition).sub(controls.target).multiplyScalar(motionReduced?1:.07);
          controls.target.add(followDelta);camera.position.add(followDelta);controls.update();
        }
      }
      if (configurationChanged || time - diagnosticTime >= 500) {
        diagnosticTime = time;
        let visiblePeople = 0, blockingIntersections = 0, visibleServers = 0;
        for (const actor of dynamic.actors) {
          if (!actor.object.visible) continue;
          visiblePeople++;
          if (!actor.navigation.isClear(actor.object.position)) blockingIntersections++;
        }
        for (const {object} of diagnosticServers) if (object.visible) visibleServers++;
        element.dataset.workforceCount = String(chart ? dynamic.actors.length : current.playback ? dynamic.crewPlayback?.timelines.length || 0 : dynamic.workforce || 0);
        element.dataset.visiblePeople = String(visiblePeople);
        element.dataset.blockingIntersections = String(blockingIntersections);
        element.dataset.visibleServers = String(visibleServers);
        element.dataset.damageType = dynamic.damage.type;
        element.dataset.damageSeverity = String(dynamic.damage.severity);
        element.dataset.routeCount = String(dynamic.packetRoutes.length);
        element.dataset.traceJobs=String(dynamic.crewPlayback?.timelines.length||0);
        element.dataset.activeJobIds=JSON.stringify(dynamic.actors.filter(a=>a.jobId&&a.object.visible).map(a=>a.jobId));
        element.dataset.activeJobLandmarks=JSON.stringify(dynamic.actors.filter(a=>a.jobId&&a.object.visible).map(a=>({id:a.jobId,landmark:a.tracePose?.event?.landmark,action:a.tracePose?.event?.action,physicalLandmark:a.tracePose?.slot?.landmark,stage:a.stage})));
        const reservations=dynamic.actors.filter(a=>a.jobId&&a.object.visible).map(a=>a.tracePose?.slot?.id).filter(Boolean);
        element.dataset.reservedSlots=JSON.stringify(reservations);
        element.dataset.reservationConflicts=String(reservations.length-new Set(reservations).size);
        element.dataset.traceFallbacks=String(dynamic.crewPlayback?.fallbackCount||0);
        element.dataset.playbackMs=String(current.playback?.atMs??0);
        element.dataset.followedJobId=current.playback?.followJobId||'';
        element.dataset.cachedCrewPaths=String(dynamic.actors[0]?.navigation.paths.size||0);
        element.dataset.crewPositions=JSON.stringify(dynamic.actors.filter(a=>a.jobId&&a.object.visible).map(a=>({id:a.jobId,position:a.object.position.toArray().map(n=>Number(n.toFixed(4)))})));
        element.dataset.tracePacketCounts=JSON.stringify(packetState?.counts||{});
        element.dataset.tracePacketLostRatio=String(packetState?.lostRatio||0);
        element.dataset.crewPresentationHolds=String(dynamic.crewPlayback?.timelines.filter(timeline=>timeline.holdAtEntrance).length||0);
      }
      if(!chart){
        const events=current.result?.events||[];
        const index=Math.min(events.length-1,Math.floor((playbackTime-(dynamic.start||playbackTime))/1.6));
        const traceEvent=dynamic.crewPlayback&&current.playback?traceEventAt(dynamic.crewPlayback.events,current.playback.atMs):null;
        eventCaption.textContent=current.running||current.playback?(traceEvent?.message || events[index]?.message || `${current.result?.traffic?.bottleneck || 'Architecture'} · ${current.result?.traffic?.delivered ?? 0} of ${current.result?.traffic?.count ?? 0} accepted in this trial`).slice(0,140):'';
        eventCaption.style.display=current.running||current.playback?'block':'none';
      }
      dynamic.packets.forEach((p, i) => {
        if (chart) {
          const a = islandPositions[i % 15], b = islandPositions[(i % 15) + 1];
          const phase = motionReduced ? .5 : (t * .09 + i * .13) % 1;
          p.position.set(THREE.MathUtils.lerp(a[0],b[0],phase), -1.75,THREE.MathUtils.lerp(a[1],b[1],phase));
          p.visible = true;
        } else {
          p.visible = Boolean(current.running||current.playback);
          if (!(current.running||current.playback) || !dynamic.packetRoutes.length) return;
          let routes = dynamic.packetRoutes;
          if(dynamic.chapterId === 1) {
            const hit = i / dynamic.packets.length < .9 * (current.config.cache || 0) / 100;
            const branch = routes.filter(route => hit ? route.to === 'cache' : route.to !== 'cache');
            if(branch.length) routes = branch;
          }
          const route = routes[i % routes.length];
          const speed = packetSpeed(dynamic.chapterId, current.config || {});
          const phase = motionReduced ? (i % 8) / 8 : (playbackTime * speed + i * .09) % 1;
          p.position.copy(route.getPoint(phase));
          const lostRatio = packetState ? packetState.lostRatio : (current.result?.traffic?.dropped || 0) / Math.max(1,current.result?.traffic?.count || 100);
          p.material = i / dynamic.packets.length < lostRatio ? p.userData.lostMaterial : p.userData.goodMaterial;
          p.scale.setScalar(1 + Math.sin(phase * Math.PI) * .2);
          if (i / dynamic.packets.length < lostRatio && phase > .78) p.position.y -= motionReduced ? 1.2 : (phase-.78)*8;
        }
      });
      if (markerLevelId !== current.level?.id) {
        markerLevelId = current.level?.id;
        labels.forEach(({button,id}) => button.classList.toggle('is-current', id === markerLevelId));
        markersDirty = true;
      }
      if (markersDirty) {
        markersDirty = false;
        labels.forEach(({button,position}) => {
          projectedMarker.copy(position).project(camera);
          const x=(projectedMarker.x*.5+.5)*width;
          const y=(-projectedMarker.y*.5+.5)*height;
          button.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
          button.style.visibility = projectedMarker.z > 1 || projectedMarker.z < -1 || x < 0 || x > width || y < 0 || y > height ? 'hidden' : 'visible';
        });
      }
      renderer.render(scene,camera);
      if (time - rendererDiagnosticTime >= 1000) {
        rendererDiagnosticTime = time;
        // Cached geometry must keep at most one listener from the active renderer.
        let listenerMaximum = 0;
        root.traverse(o => { if(o.geometry) listenerMaximum = Math.max(listenerMaximum, o.geometry._listeners?.dispose?.length || 0); });
        element.dataset.maxGeometryDisposeListeners = String(listenerMaximum);
        element.dataset.renderCalls = String(renderer.info.render.calls);
        element.dataset.renderTriangles = String(renderer.info.render.triangles);
      }
      // Read-only evidence used by browser acceptance checks; no gameplay bypass.
      element.dataset.renderedFrames = String(++renderedFrames);
    }
    frame = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener('change', invalidateMarkers);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown',onDown);
      renderer.domElement.removeEventListener('pointerup',onUp);
      labels.forEach(({button}) => button.remove());
      eventCaption.remove();
      dynamic.highlights.forEach(h => { h.geometry.dispose(); h.material.dispose(); });
      // Geometry.dispose releases renderer-specific listeners/GPU buffers while retaining
      // the cached CPU arrays, which GLTF scene clones can upload on their next visit.
      const geometrySet=new Set(), materialSet=new Set();
      root.traverse(o=>{
        if(o.geometry)geometrySet.add(o.geometry);
        if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materialSet.add(m));
      });
      geometrySet.forEach(g=>g.dispose());
      materialSet.forEach(m=>m.dispose());
      sun.shadow.dispose();
      tracked.forEach(resource => resource.dispose?.());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      if (state.current?.renderer === renderer) state.current=null;
    };
  }, [mode, mode === 'level' ? levelId : null]);

  return <div className="world-host" ref={host} data-mode={mode}>
    {error && <div className="world-error" role="status">{error}</div>}
  </div>;
}

function updateConfiguration(dynamic, config, tracked, current, scene, time) {
  if (current.playback) dynamic.start=0;
  else if (current.running && !dynamic.running) dynamic.start = time;
  dynamic.running = current.running;
  const phase = current.running || current.playback ? Math.min(3, Math.floor((time - (dynamic.start ?? time)) / 1.5)) : 4;
  if (dynamic.configReference !== config) {
    dynamic.configReference = config;
    const configKey = JSON.stringify(config);
    if (dynamic.configKey !== configKey) {
      dynamic.configKey = configKey;
      dynamic.forecast = evaluateLevel(dynamic.chapterId, config);
    }
  }
  const configKey = dynamic.configKey;
  const fingerprint = `${configKey}:${Boolean(current.running)}:${phase}`;
  if (dynamic.configuration === fingerprint && dynamic.result === current.result) return;
  dynamic.configuration = fingerprint;
  dynamic.result = current.result;
  const id = dynamic.chapterId;
  const result = current.result || dynamic.forecast;
  const actual = current.result && (current.playback ? phase >= 1 : !current.running || phase >= 1);
  const failed = actual ? result.objectives.map((o,i) => o.met ? -1 : i).filter(i => i >= 0) : [];
  const severity = failed.length / 3;
  const hazard = hazardFor(id, failed, result);
  dynamic.damage = {severity, ...hazard};
  const met = result.objectives.filter(o => o.met).length;
  dynamic.workforce = result.passed ? 10 : actual ? Math.max(0, 8 - failed.length * 3) : 3 + met * 2;
  let serverCount = config.servers ?? config.serverCount ?? config.nodes ?? config.webServers;
  if (id === 5 && phase >= 1) serverCount += 1;
  if (id === 14) serverCount = config.renditions === 'adaptive' ? 3 : 1;
  if (id === 16 && actual) serverCount = Math.floor(serverCount / 2);
  const states = landmarkStates(id, config, phase, result);
  const versions = phase >= 2 ? result.visual?.versionsAfterRepair : result.visual?.versionsBeforeRepair;
  const changedBlocks = result.visual?.changedBlockIndices || [];
  dynamic.nodes.forEach(({object:o, position, rotation, scale, visible}) => {
    o.position.copy(position); o.rotation.copy(rotation); o.scale.copy(scale); o.visible = visible;
    if (/^server_\d+(?:_|$)/.test(o.name) && typeof serverCount === 'number') o.visible = Number(o.name.split('_')[1]) < serverCount;
    if (o.isMesh) {
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      materials.forEach(m => {
        if (!m.userData.originalColor) return;
        m.color.copy(m.userData.originalColor);
        const status = states[o.userData.landmark];
        if (status === false) m.color.lerp(new THREE.Color('#637d78'), .55);
        if (m.emissive) { m.emissive.set(status === true ? '#335b39' : '#000000'); m.emissiveIntensity = status === true ? .18 : 0; }
        if (hazard.keys.includes(o.userData.landmark) && severity > 0) m.color.lerp(new THREE.Color('#b14c43'), .65);
        if (id === 6 && /^landmark_replicas_\d+$/.test(o.name) && versions) {
          const replica = Number(o.name.split('_').at(-1));
          m.color.set(versions[replica] === Math.max(...versions) && versions[replica] > 0 ? '#91bdab' : '#d5603d');
        }
        if (id === 15 && /^landmark_blocks_\d+$/.test(o.name)) {
          const index = Number(o.name.split('_').at(-1));
          m.color.set(changedBlocks.includes(index) ? '#d5603d' : '#f6f4ea');
          if (m.emissive) {m.emissive.set(changedBlocks.includes(index) ? '#572819' : '#000000');m.emissiveIntensity = current.running ? .4 : 0;}
        }
      });
    }
    if (o.name.startsWith('beacon_lantern') && o.material?.emissive) {
      o.material.emissive.set(current.result?.passed ? '#dfb54b' : '#000000');
      o.material.emissiveIntensity = current.result?.passed ? 1.2 : 0;
    }
    if (id === 2 && o.name.startsWith('landmark_storage_')) o.visible = Number(o.name.split('_').at(-1)) < Math.max(1, Math.ceil(config.storage / 8));
    if (id === 2 && o.name === 'landmark_telescope') o.rotation.z = .5 + Math.min(1.3, config.peak / 800);
    if (id === 2 && o.name === 'beacon') o.scale.y = .7 + config.downtime / 525;
    if (id === 4 && o.name === 'reservoir_water') o.position.y = position.y + config.capacity / 20 * .3;
    if (id === 6 && o.userData.landmark === 'partition' && !o.name.includes('river')) o.scale.x = phase < 2 ? .55 : 1;
    if (id === 7 && o.name.startsWith('id_segment_')) {o.scale.x = config.strategy === 'ticket' ? .5 : 1; o.rotation.y = config.uniqueWorkers ? 0 : Number(o.name.split('_').at(-1)) % 2 * .3;}
    if (id === 8 && o.name === 'redirect_sign') o.rotation.y = config.redirect === '301' ? .7 : 0;
    if (id === 12 && o.name === 'landmark_connection') o.scale.x = actual && failed.length ? .35 : config.transport === 'socket' ? 1 : .65;
    if (id === 8 && o.name === 'shortcut' && actual && !result.objectives[0].met) o.scale.x = .6;
    if (id === 7 && o.name === 'beacon' && config.rollback === 'ignore') o.rotation.z = -.12;
    if (id === 14 && o.name === 'cinema_screen' && actual && !result.objectives[1].met && o.material?.color) o.material.color.set('#3b4d52');
    if (id === 13 && o.name.startsWith('prefix_light_')) {
      const index = Number(o.name.split('_').at(-1));
      // Prefix letters choose a deterministic branch; an empty result lights no leaves.
      const branch = [...(config.prefix || '')].reduce((n,c) => n + c.charCodeAt(0), 0) % 4;
      const lit = config.strategy === 'scan' || (result.suggestions?.length > 0 && (index < 2 || index === 2 + branch % 2 || index === 4 + branch));
      if (o.material?.emissive) {o.material.emissive.set(lit ? '#e0bb74' : '#000000');o.material.emissiveIntensity = lit ? 1.2 : 0;}
      o.scale.setScalar(lit ? (config.topK ? 1.25 : 1) : .55);
    }
    if (id === 14 && o.name === 'cinema_play') o.visible = !actual || result.objectives[1].met;
  });
  dynamic.model.position.y = id === 16 && severity >= 2 / 3 ? -.65 : 0;
  dynamic.model.rotation.z = id === 16 && severity >= 2 / 3 ? .08 : 0;
  dynamic.highlights.forEach(h => {h.parent?.remove(h);h.geometry.dispose();h.material.dispose();});
  dynamic.highlights = [];
  dynamic.effects = [];
  Object.entries(states).forEach(([key,active]) => {
    const position = dynamic.centers.get(key);
    if (!position) return;
    const disc = new THREE.Mesh(new THREE.RingGeometry(.44,.51,24),new THREE.MeshBasicMaterial({color:active ? '#427c5b' : '#b14c43',side:THREE.DoubleSide,transparent:true,opacity:.85}));
    disc.rotation.x = -Math.PI / 2; disc.position.copy(position); disc.position.y = .26;
    dynamic.model.add(disc); dynamic.highlights.push(disc);
  });
  createChapterEffects(dynamic, config, result, actual, phase);
  dynamic.packetRoutes.forEach(curve => {
    curve.mesh?.parent?.remove(curve.mesh);
    [curve.mesh?.geometry,curve.mesh?.material].forEach(resource => {resource?.dispose();const index = tracked.indexOf(resource);if(index >= 0) tracked.splice(index,1);});
  });
  dynamic.packetRoutes = [];
  const addRoute = (a,b,color='#e0bb74') => {if(a && b && a.distanceToSquared(b) > .01) dynamic.packetRoutes.push(createRoute(scene,tracked,a,b,color,.3));};
  if (id === 5 && current.running && phase >= 1 && result.visual?.migrations) {
    // A representative route per actual source/destination pair, weighted by real keys.
    const pairs = new Map();
    result.visual.migrations.forEach(({from,to}) => {const key = `${from}:${to}`;pairs.set(key,{from,to,count:(pairs.get(key)?.count || 0) + 1});});
    [...pairs.values()].forEach(({from,to,count}) => {addRoute(dynamic.servers[from]?.position,dynamic.servers[to]?.position);const route=dynamic.packetRoutes.at(-1);if(route)route.keyCount=count;});
  } else {
    chapterRoutes(id,config).forEach(([from,to]) => {addRoute(dynamic.centers.get(from),dynamic.centers.get(to),states[to] === false ? '#b14c43' : '#e0bb74');const route=dynamic.packetRoutes.at(-1);if(route){route.from=from;route.to=to;}});
    if ([1,5,16].includes(id)) {
      const origin = dynamic.centers.get(id === 1 ? (config.balance ? 'balancer' : 'dock') : id === 5 ? 'compass' : 'failover');
      const count = id === 1 && !config.balance ? 1 : serverCount;
      dynamic.servers.slice(0,count).forEach(({position}) => addRoute(origin,position));
    }
  }
  if (!dynamic.packetRoutes.length) {
    const positions = [...dynamic.centers.values()];addRoute(positions[0],positions[1]);
  }
  return true;
}

function hazardFor(id, failed, result) {
  if (!failed.length) return {type:'none',keys:[]};
  const hazards = {
    1:['overload',['servers','database','balancer']], 2:['capacity-error',['telescope','storage','clock']],
    3:['incomplete-design',['blueprint','deepDive','wrapUp']], 4:['flood',['service','reservoir','gates']],
    5:['unstable-migration',['ring','servers','compass']], 6:['partition',['replicas','partition','repair']],
    7:['clock-foundry',['workers','clock','assembly']], 8:['shortcut-collision',['redirect','encoder','archive']],
    9:['forbidden-crawl',['archive','frontier','robots']], 10:['stalled-conveyor',['queue','channels','preferences']],
    11:['celebrity-crowd',['celebrity','cache','inboxes']], 12:['broken-connection',['history','sync','connection']],
    13:['stale-prefix',['trie','aggregator','library']], 14:['stalled-cinema',['transcode','cdn','cdn']],
    15:['lost-blocks',['versions','blocks','devices']], 16:['region-collapse',['ingress','queue','replicas']],
  };
  const [type, targets] = hazards[id];
  let keys = [...new Set(failed.map(index => targets[index]))];
  if (id === 1 && failed.includes(0)) keys = [result.traffic.bottleneck === 'Serving tier' ? 'servers' : 'database'];
  // Budget errors degrade staffing, without pretending money destroyed a building.
  if ([1,5,16].includes(id) && failed.length === 1 && failed[0] === 2) return {type:'budget-pressure',keys:[]};
  return {type,keys};
}

function createChapterEffects(dynamic,c,result,actual,phase) {
  const id = dynamic.chapterId;
  const mark = (key,count,color,layout='row',size=.18,point) => {
    const center = point || dynamic.centers.get(key);if(!center)return;
    const geometry = new THREE.BoxGeometry(size,size,size);
    const material = new THREE.MeshStandardMaterial({color,roughness:.65});
    // Each effect owns its geometry/material: disposal remains bounded when config changes.
    for(let i=0;i<Math.min(32,count);i++) {
      const mesh = new THREE.Mesh(i === 0 ? geometry : geometry.clone(),i === 0 ? material : material.clone());
      const angle = i / Math.max(1,count) * Math.PI * 2;
      mesh.position.copy(center);
      if(layout === 'ring') {mesh.position.x += Math.cos(angle)*1.35;mesh.position.z += Math.sin(angle)*1.35;}
      else {mesh.position.x += (i%8-3.5)*.27;mesh.position.z += Math.floor(i/8)*.28+.65;}
      mesh.position.y = .5;
      dynamic.model.add(mesh);dynamic.highlights.push(mesh);
      dynamic.effects.push({object:mesh,base:mesh.position.clone(),key,index:i});
    }
    if(count < 1){geometry.dispose();material.dispose();}
  };
  switch(id) {
    case 1:mark(c.cache>0?'cache':'database',Math.round(c.cache/10),'#e0bb74');mark('database',c.replica?2:1,'#91bdab');break;
    case 2:mark('clock',Math.max(1,Math.ceil(c.downtime/60)),'#e0bb74','ring');break;
    case 3:mark(c.architecture==='archive'?'blueprint':'scope',c.risk==='reconnect'?4:1,'#91bdab');break;
    case 4: {
      mark('gates',c.refill,'#e0bb74');mark('reservoir',Math.min(20,c.capacity),'#79b6bb','ring');
      if(actual && !result.objectives[1].met) {
        const flood=new THREE.Mesh(new THREE.CylinderGeometry(4.7,4.7,.12,40),new THREE.MeshStandardMaterial({color:'#58a8b5',transparent:true,opacity:.68}));
        flood.position.y=.48+dynamic.damage.severity*.5;dynamic.model.add(flood);dynamic.highlights.push(flood);
      }break;
    }
    case 5:mark('ring',c.algorithm==='ring'?Math.min(32,c.vnodes):c.servers+1,'#e0bb74','ring');result.visual?.loads.forEach((load,i)=>mark('servers',Math.min(8,Math.ceil(load/60)),i===c.servers?'#d5603d':'#91bdab','row',.18,dynamic.servers[i]?.position));break;
    case 6:mark('replicas',c.read,'#e0bb74');mark('repair',c.write,'#91bdab');break;
    case 7:mark(c.strategy==='ticket'?'clock':'workers',c.strategy==='ticket'?1:4,'#e0bb74','ring');mark('assembly',c.rollback==='reject'?3:7,'#d5603d');break;
    case 8:mark('encoder',c.length,c.strategy==='sequence'?'#e0bb74':'#d5603d');mark('archive',c.collisionCheck?2:1,'#91bdab');break;
    case 9:mark('frontier',c.urlDedup?4:12,'#e0bb74');mark('archive',c.contentDedup?3:9,'#91bdab');mark('robots',c.robots?1:6,c.robots?'#91bdab':'#b14c43','ring');break;
    case 10:mark('queue',c.queue?c.retries+3:1,'#e0bb74');mark('channels',c.idempotency?3:6,'#91bdab');break;
    case 11:mark('inboxes',c.fanout==='push'||(c.fanout==='hybrid'&&c.threshold>100000)?24:4,'#d5603d','ring');mark('cache',Math.round(c.cache/150),'#91bdab');break;
    case 12:mark('history',c.history?8:3,'#91bdab');mark('sync',c.replay?3:1,c.ordering?'#e0bb74':'#d5603d');break;
    case 13:mark('trie',result.suggestions?.length||0,c.refresh<=60?'#e0bb74':'#637d78');break;
    case 14:mark('upload',c.pipeline==='queue'?3:1,'#e0bb74');mark('transcode',c.renditions==='adaptive'?3:1,c.retry?'#91bdab':'#b14c43');break;
    case 15:mark('blocks',result.visual?.transferredBlockHashes?.length||0,'#e0bb74');mark('versions',c.conflicts==='preserve'?2:1,'#91bdab');break;
    case 16:mark('replicas',c.replication?2:1,'#91bdab');mark('queue',c.queue?6:2,c.queue?'#e0bb74':'#b14c43');break;
  }
  // Show the broken service path at the actual failure point, then restore on edit/retry.
  if(actual && dynamic.damage.severity > 0) dynamic.damage.keys.forEach(key => mark(key,2,'#b14c43','row',.32));
  if(id===9 && actual && !result.objectives[2].met){
    const center=dynamic.centers.get('robots');
    if(center)for(const angle of [-.7,.7]){
      const bar=new THREE.Mesh(new THREE.BoxGeometry(1.3,.1,.1),new THREE.MeshStandardMaterial({color:'#b14c43'}));
      bar.position.copy(center);bar.position.y=1.4;bar.rotation.z=angle;
      dynamic.model.add(bar);dynamic.highlights.push(bar);
    }
  }
}

function packetSpeed(id,c) {
  if(id===9)return .48/(1+(c.delay||0)/250);
  if(id===10)return c.queue&&c.backoff>=500?.3:.035;
  if(id===7)return c.strategy==='ticket'?.07:.32;
  if(id===12)return c.transport==='socket'?.4:.08;
  if(id===13)return c.strategy==='trie'?(c.topK?.55:.3):.08;
  return .32;
}

function animateWorld(dynamic,current,time,reduced,chart) {
  const damage=dynamic.damage;
  const delta = Math.min(.1, Math.max(0,time-(dynamic.lastCrewTime??time)));
  dynamic.lastCrewTime = time;
  const trace=current.result?.trace;
  const hasPlayback=!chart&&current.playback&&trace&&dynamic.actors.length;
  if(hasPlayback){
    if(dynamic.crewPlayback?.trace!==trace)dynamic.crewPlayback=compileCrewPlayback(trace,dynamic.actors[0].navigation);
    const atMs=Math.max(0,Math.min(trace.playbackMs||6000,current.playback.atMs||0));
    dynamic.actors.forEach((actor,index)=>{
      const timeline=dynamic.crewPlayback.timelines[index];
      if(!timeline){actor.object.visible=false;actor.carried.visible=false;actor.jobId=null;return;}
      const pose=sampleCrewPlayback(timeline,atMs,reduced,actor.object.position);
      actor.tracePose=pose;actor.jobId=timeline.job.id;actor.stage=pose.stage;actor.traceActive=true;
      actor.object.visible=pose.visible;
      actor.object.position.y=actor.navigation.heightAt(actor.object.position)-actor.footOffset;
      if(pose.walking)actor.object.rotation.y=pose.heading;
      else {
        const anchor=pose.slot.anchor;
        actor.object.rotation.y=Math.atan2(anchor.x-actor.object.position.x,anchor.z-actor.object.position.z);
      }
      const role=timeline.job.role||'visitor';
      const followed=current.playback.followJobId===timeline.job.id;
      actor.carried.visible=pose.visible;
      actor.carried.material=followed?actor.followedMaterial:actor.carriedMaterials[role]||actor.carriedMaterials.visitor;
      actor.carried.scale.set(followed?1.4:1,followed?1.8:1,1);
      actor.carried.position.y=followed?1.7:.94;
      actor.carried.renderOrder=followed?10:0;
      actor.joints.forEach(joint=>{
        joint.object.rotation.copy(joint.rotation);
        if(reduced||!pose.visible)return;
        const side=joint.object.name.endsWith('left')?0:Math.PI;
        if(pose.walking)joint.object.rotation.x+=Math.sin(time*9+side)*(joint.leg?.45:.35);
        else if(!joint.leg){
          const action=pose.physicalEvent?.action;
          if(pose.stage==='acknowledging'||action==='handoff')joint.object.rotation.x-=.8+Math.sin(time*5+side)*.25;
          else if(pose.stage==='working')joint.object.rotation.x+=role==='technician'?-1+Math.sin(time*8+side)*.2:role==='operator'?-.65+Math.sin(time*5+side)*.3:role==='courier'?-.5:-.2;
          else if(pose.stage==='waiting'&&action==='retry')joint.object.rotation.x+=Math.sin(time*2+side)*.12;
        }
      });
    });
  } else {dynamic.crewPlayback=null;dynamic.actors.forEach(actor => {
    const {object,joints,navigation,index}=actor;
    actor.carried&&(actor.carried.visible=false);
    actor.jobId=null;actor.tracePose=null;
    if(actor.traceActive){actor.traceActive=false;actor.initialized=false;actor.stage='entering';actor.distance=0;actor.pause=0;}
    const crowd=!chart && dynamic.chapterId===11 && (current.config.fanout==='push' || (current.config.fanout==='hybrid' && current.config.threshold>100000));
    const wanted=chart || index<dynamic.workforce || index<2 || crowd;
    const refuge=!chart && index>=dynamic.workforce && index<2 && !crowd;
    const candidate=crowd ? navigation.crowdRoutes[index%navigation.crowdRoutes.length] : navigation.routes[index%navigation.routes.length];
    if(!actor.initialized) {
      // Initial distribution lies on validated entrance paths, never inside a building.
      actor.distance=actor.route.enter.length*(index/(chart?3:12));
      actor.initialized=true;
    }
    if(reduced) {
      actor.route=candidate;
      object.position.copy(wanted?candidate.workstation:navigation.exit);
      object.visible=wanted;
      actor.stage=wanted?'working':'hidden';actor.distance=0;actor.pause=0;
    } else {
      if(actor.stage==='hidden' && wanted) {
        actor.route=candidate;actor.stage='entering';actor.distance=0;
        object.position.copy(navigation.entrance);object.visible=true;
      }
      const walking=actor.stage==='entering'||actor.stage==='leaving';
      if(walking) {
        const path=actor.stage==='entering'?actor.route.enter:actor.route.leave;
        actor.distance=Math.min(path.length,actor.distance+delta*.48);
        const pose=pointOnCrewPath(path,actor.distance);
        object.position.copy(pose.point);object.rotation.y=pose.heading;
        if(actor.distance>=path.length) {
          actor.distance=0;
          if(actor.stage==='entering'){actor.stage='working';actor.pause=0;}
          else {actor.stage='hidden';object.visible=false;object.position.copy(navigation.exit);}
        }
      } else if(actor.stage==='working') {
        object.position.copy(actor.route.workstation);
        actor.pause+=delta;
        if(!refuge && (!wanted || actor.pause>2.5+index*.12)) {actor.stage='leaving';actor.distance=0;}
      }
    }
    const walking=!reduced&&(actor.stage==='entering'||actor.stage==='leaving');
    object.position.y=navigation.heightAt(object.position)-actor.footOffset;
    joints.forEach(joint => {
      const side=joint.object.name.endsWith('left')?0:Math.PI;
      joint.object.rotation.copy(joint.rotation);
      if(reduced || actor.stage==='hidden' || refuge && !walking)return;
      joint.object.rotation.x += joint.leg ? (walking?Math.sin(time*9+side)*.45:0) : (walking?Math.sin(time*9+side)*.35:Math.sin(time*6+side)*.8-.6);
    });
  });}
  if(chart || !dynamic.model)return;
  const fall = reduced ? 1 : Math.min(1,Math.max(0,(time-(dynamic.start??time)-1.5)/1.5));
  dynamic.nodes.forEach(({object:o,position,rotation}) => {
    if(!damage.keys.includes(o.userData.landmark) || !o.isMesh || !damage.severity)return;
    const mayFall=damage.severity>=2/3 && !['capacity-error','incomplete-design','stale-prefix','budget-pressure'].includes(damage.type);
    if(mayFall) {o.position.y=position.y-fall*.55;o.rotation.z=rotation.z+fall*(o.position.x>0?.23:-.23);}
    else o.rotation.z=rotation.z+(!reduced && current.running?Math.sin(time*13+position.x)*.025:0);
  });
  dynamic.effects.forEach(({object,base,key,index}) => {
    object.position.copy(base);
    if(reduced)return;
    const stalled=damage.keys.includes(key) || (dynamic.chapterId===10 && (!current.config.queue || current.config.backoff<500));
    if(current.running&&!stalled)object.position.y+=Math.sin(time*3+index)*.08;
  });
}

function landmarkStates(id,c,phase,result){
  switch(id){
    case 1:return {balancer:c.balance,cache:c.cache>=50,database:c.replica};
    case 2:return {telescope:c.peak>=445&&c.peak<=667,storage:c.storage>=20.1&&c.storage<=30.3,clock:c.downtime>=210&&c.downtime<=316};
    case 3:return {scope:c.scope==='requirements',blueprint:c.architecture==='archive',deepDive:c.risk==='reconnect',wrapUp:c.wrap==='tradeoffs'};
    case 4:return {reservoir:c.capacity>=4,gates:c.atomic&&c.scope==='client',service:result?result.objectives[0].met:c.algorithm==='token'};
    case 5:return {ring:c.algorithm==='ring',compass:c.vnodes>=16,servers:phase>=1};
    case 6:return {partition:phase>=2,replicas:c.read+c.write>3,repair:c.repair&&phase>=2};
    case 7:return {clock:c.rollback!=='ignore',workers:c.uniqueWorkers,assembly:c.strategy==='snowflake'};
    case 8:return {encoder:c.length>=3&&(c.strategy==='sequence'||c.collisionCheck),archive:c.collisionCheck,redirect:c.redirect==='302'&&c.cache};
    case 9:return {robots:c.robots&&c.delay>=250,frontier:c.urlDedup,archive:c.contentDedup};
    case 10:return {queue:c.queue&&c.retries>0&&c.backoff>=500,channels:c.idempotency,preferences:c.preferences};
    case 11:return {celebrity:c.fanout!=='push'&&c.threshold<100000,inboxes:c.fanout!=='pull',cache:c.cache>=600};
    case 12:return {connection:c.transport==='socket',history:c.history,sync:c.replay&&c.ordering};
    case 13:return {library:c.refresh<=60,trie:c.strategy==='trie',aggregator:c.topK};
    case 14:return {upload:c.pipeline==='queue',transcode:c.retry&&phase>=2,cdn:c.cdn&&c.renditions==='adaptive'};
    case 15:return {blocks:c.transfer==='delta'&&c.dedup,devices:c.resume,versions:c.conflicts==='preserve'};
    case 16:return {ingress:c.cache>=50,replicas:c.replication,queue:c.queue,failover:c.failover};
    default:return {};
  }
}

function chapterRoutes(id,c){
  switch(id){
    case 1:return [...(c.balance?[['dock','balancer'],['balancer','servers']]:[]),['servers','database'],...(c.cache>0?[['servers','cache']]:[])];
    case 2:return [['telescope','storage'],['storage','clock']];
    case 3:return [['scope','blueprint'],['blueprint','deepDive'],['deepDive','wrapUp']];
    case 4:return [['reservoir','gates'],['gates','service']];
    case 5:return [['compass','ring']];
    case 6:return [['replicas','partition'],['partition','repair']];
    case 7:return [['clock','workers'],['workers','assembly']];
    case 8:return [['encoder','archive'],['archive','redirect']];
    case 9:return c.traversal==='dfs'?[['robots','archive'],['archive','frontier']]:[['robots','frontier'],['frontier','archive']];
    case 10:return [['preferences',c.queue?'queue':'channels'],...(c.queue?[['queue','channels']]:[])];
    case 11:return c.fanout==='pull'?[['inboxes','celebrity'],['celebrity','cache']]:[['celebrity','inboxes'],['inboxes','cache']];
    case 12:return [['connection',c.history?'history':'sync'],['history','sync']];
    case 13:return [['library',c.strategy==='trie'?'trie':'aggregator'],['trie','aggregator']];
    case 14:return [['upload','transcode'],...(c.retry?[['transcode','cdn']]:[])];
    case 15:return c.transfer==='delta'?[['devices','blocks'],['blocks','versions']]:[['devices','versions'],['versions','blocks']];
    case 16:return [['ingress',c.queue?'queue':'replicas'],['queue','replicas'],['replicas','failover']];
    default:return [];
  }
}
