"""Blender-authored human maintenance crew prefab, with named limb pivots."""
import bpy
import importlib.util
import json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('world_authoring',ROOT/'scripts'/'build-worlds.py')
w=importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)
w.CURRENT=0
w.MATS={}
w.PALETTE['skin']='cf9c78'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def pivot(name,location):
    obj=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(obj)
    obj.location=location
    obj['role']='worker_animation_pivot'
    return obj

def parent(child,root):
    world=child.matrix_world.copy()
    child.parent=root
    child.matrix_world=world

root=pivot('worker',(0,0,0))
root['role']='human_maintenance_crew'
torso=w.cube('worker_vest',(0,0,.65),(.31,.23,.34),'orange',.045)
parent(torso,root)
for z in (.58,.75):
    parent(w.cube('worker_reflective_stripe',(0,-.125,z),(.28,.022,.035),'paper',.007),root)
parent(w.cube('worker_pants',(0,0,.44),(.26,.21,.14),'teal',.025),root)
head=w.sphere('worker_head',(0,0,.96),.155,'skin')
parent(head,root)
parent(w.sphere('worker_nose',(0,-.15,.945),.035,'skin'),root)
for x in (-.052,.052):
    parent(w.sphere('worker_eye',(x,-.139,.985),.014,'ink'),root)
parent(w.cylinder('worker_hardhat_brim',(0,0,1.075),.188,.035,'orange',20),root)
parent(w.sphere('worker_hardhat',(0,0,1.075),.16,'orange'),root)
parent(w.cube('worker_hat_ridge',(0,0,1.205),(.045,.2,.035),'gold',.008),root)

for side,x in [('left',-.19),('right',.19)]:
    arm=pivot('worker_arm_'+side,(x,0,.78))
    parent(arm,root)
    parent(w.cube('worker_sleeve_'+side,(x,0,.67),(.095,.13,.22),'teal',.025),arm)
    parent(w.cube('worker_forearm_'+side,(x,-.025,.50),(.075,.09,.16),'skin',.024),arm)
    parent(w.sphere('worker_hand_'+side,(x,-.028,.415),.054,'skin'),arm)
for side,x in [('left',-.085),('right',.085)]:
    leg=pivot('worker_leg_'+side,(x,0,.44))
    parent(leg,root)
    parent(w.cube('worker_trouser_'+side,(x,0,.29),(.11,.15,.28),'teal',.024),leg)
    parent(w.cube('worker_boot_'+side,(x,-.03,.105),(.13,.23,.105),'ink',.025),leg)

meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
for obj in bpy.context.scene.objects:obj.select_set(True)
model=ROOT/'public'/'models'/'worker.glb'
bpy.ops.export_scene.gltf(filepath=str(model),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
w.setup_render()
bpy.context.scene.camera.location=(2.4,-4.5,2.0)
bpy.context.scene.camera.rotation_euler=(Vector((0,0,.62))-bpy.context.scene.camera.location).to_track_quat('-Z','Y').to_euler()
bpy.context.scene.camera.data.ortho_scale=2.1
bpy.context.scene.render.resolution_x=700
bpy.context.scene.render.resolution_y=700
w.cube('Render_worker_ground',(0,0,-.02),(200,200,.04),'sea',0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art'/'blender'/'worker.blend'))
bpy.context.scene.render.filepath=str(ROOT/'art'/'renders'/'worker.png')
bpy.ops.render.render(write_still=True)
manifest_path=ROOT/'public'/'asset-manifest.json'
manifest=json.loads(manifest_path.read_text())
manifest['characters']=[{'model':'worker.glb','source':'art/blender/worker.blend','bytes':model.stat().st_size,'role':'human maintenance crew','pivots':['worker_arm_left','worker_arm_right','worker_leg_left','worker_leg_right']}]
manifest_path.write_text(json.dumps(manifest,indent=2))
print('CREW_PREFAB_READY',model.stat().st_size,flush=True)
