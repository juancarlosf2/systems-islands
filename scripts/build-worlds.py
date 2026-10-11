"""Coordinator-authored Blender miniature environments for all sixteen chapters.

Run Blender in background with --python scripts/build-worlds.py.
Native scenes, embedded-material GLBs and EEVEE renders are reproducible.
"""
import bpy
import math
import random
import json
import os
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / 'public' / 'models'
SOURCES = ROOT / 'art' / 'blender'
RENDERS = ROOT / 'art' / 'renders'
for folder in (MODELS, SOURCES, RENDERS):
    folder.mkdir(parents=True, exist_ok=True)

TITLES = ['First light', 'The observatory', 'Blueprint bay', 'The floodgates',
          'The ring', 'The vaults', 'Snowflake summit', 'Shortcut docks',
          'The crawler gardens', 'Signal station', 'The town square',
          'Conversation coves', 'Prefix grove', 'Cinema cliffs',
          'Sync sanctuary', 'Horizon lab']
PALETTE = {'paper':'f6f4ea','white':'fcf9ed','orange':'d5603d','sage':'91b89c',
           'mint':'a7c8af','teal':'325a51','ink':'18383a','stone':'8e9f98',
           'darkstone':'667e79','gold':'e0bb74','sea':'c6e5e4','wood':'a88663',
           'blue':'729da7','red':'b14c43','snow':'dae7dd'}
MATS = {}

def linear(v):
    return v / 12.92 if v < 0.04045 else ((v + 0.055) / 1.055) ** 2.4

def material(key):
    if key in MATS:
        return MATS[key]
    value=PALETTE.get(key,key)
    rgb=[linear(int(value[i:i+2],16)/255) for i in (0,2,4)]
    m=bpy.data.materials.new(key)
    m.diffuse_color=(*rgb,1)
    m.use_nodes=True
    bsdf=m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*rgb,1)
    bsdf.inputs['Roughness'].default_value=0.78
    MATS[key]=m
    return m

def finish(obj,name,color,landmark=None):
    obj.name=name
    obj.data.materials.append(material(color))
    obj['chapter']=CURRENT
    if landmark:
        obj['landmark']=landmark
    return obj

def cube(name,loc,size,color='white',bevel=.06,landmark=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object
    o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Soft miniature edges','BEVEL')
        mod.width=bevel
        mod.segments=2
        bpy.context.view_layer.objects.active=o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,name,color,landmark)

def cylinder(name,loc,radius,depth,color='white',vertices=24,landmark=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
    return finish(bpy.context.object,name,color,landmark)

def cone(name,loc,r1,r2,depth,color='teal',vertices=8,landmark=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=depth,location=loc)
    return finish(bpy.context.object,name,color,landmark)

def sphere(name,loc,radius,color='orange',landmark=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=radius,location=loc)
    return finish(bpy.context.object,name,color,landmark)

def ring(name,loc,major,minor,color='gold',landmark=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=48,minor_segments=8,location=loc)
    return finish(bpy.context.object,name,color,landmark)

def path(name,points,width=.22,color='paper',landmark=None):
    curve=bpy.data.curves.new(name,'CURVE')
    curve.dimensions='3D'
    curve.resolution_u=2
    curve.bevel_depth=width
    curve.bevel_resolution=2
    spline=curve.splines.new('POLY')
    spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points):
        p.co=(*co,1)
    o=bpy.data.objects.new(name,curve)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o.select_set(False)
    return finish(o,name,color,landmark)

def road(a,b,name='route',color='paper',width=.18):
    return path(name,[(a[0],a[1],.32),(b[0],b[1],.32)],width,color)

def crew_point(name,x,y,role='workstation',landmark=None):
    o=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(o)
    o.location=(x,y,.22)
    o['crewRole']=role
    if landmark:o['crewLandmark']=landmark
    return o

def doorway(body,x,front,landmark):
    """A physical opening, with consistent human-scale clearance across worlds."""
    cutter=cube('Doorway_cutter',(x,front+.08,.48),(.28,.34,.48),'ink',0)
    bpy.context.view_layer.objects.active=body
    mod=body.modifiers.new('Open pedestrian doorway','BOOLEAN')
    mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    cube('door_recess_'+str(landmark),(x,front+.255,.48),(.28,.025,.46),'ink',0,landmark)
    for dx in (-.165,.165):
        cube('door_frame_'+str(landmark),(x+dx,front-.015,.48),(.035,.055,.49),'paper',.007,landmark)
    frame=cube('door_header_'+str(landmark),(x,front-.015,.735),(.365,.055,.045),'paper',.007,landmark)
    frame['doorHeight']=.46;frame['doorWidth']=.28
    cube('door_step_'+str(landmark),(x,front-.14,.215),(.40,.30,.035),'paper',.015)
    crew_point('crew_work_'+str(landmark),x,front-.25,landmark=landmark)

def terrain(seed,variant='round'):
    rng=random.Random(seed)
    n=22
    radii=[5.7+rng.uniform(-.5,.5) for _ in range(n)]
    xscale=1.14 if variant in ('wide','split') else .95 if variant=='tall' else 1
    yscale=.8 if variant=='wide' else 1.13 if variant=='tall' else 1
    for name,rscale,zs,col in [('rock_base',1,[-2.3,-1.8,-.12],'stone'),('terrain',.97,[-.12,.16],'sage')]:
        verts=[]
        for j,z in enumerate(zs):
            for i,r in enumerate(radii):
                a=i*math.tau/n
                rr=r*rscale*(.82 if j==0 and name=='rock_base' else 1)
                zz=z+(rng.uniform(-.22,.14) if name=='rock_base' else 0)
                verts.append((math.cos(a)*rr*xscale,math.sin(a)*rr*yscale,zz))
        faces=[]
        for j in range(len(zs)-1):
            for i in range(n):
                k=(i+1)%n
                faces.extend([(j*n+i,j*n+k,(j+1)*n+i),(j*n+k,(j+1)*n+k,(j+1)*n+i)])
        faces.extend([tuple(reversed(range(n))),tuple((len(zs)-1)*n+i for i in range(n))])
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata(verts,[],faces)
        mesh.update()
        o=bpy.data.objects.new(name,mesh)
        bpy.context.collection.objects.link(o)
        finish(o,name,col)
    navigation=bpy.data.objects.new('crew_navigation',None)
    bpy.context.collection.objects.link(navigation)
    navigation['crewWalkBoundary']=[[math.cos(i*math.tau/n)*r*.97*xscale,-math.sin(i*math.tau/n)*r*.97*yscale] for i,r in enumerate(radii)]
    navigation['workerHeight']=.38
    navigation['doorHeight']=.46
    # Varied rock teeth make cliffs read as a hand-built miniature, not a disc.
    for i in range(17):
        a=i*math.tau/17
        r=5.25+rng.uniform(-.1,.3)
        rock=cone('cliff_facet_%02d'%i,(math.cos(a)*r*xscale,math.sin(a)*r*yscale,-1.0),.65,.40,2.2,'darkstone' if i%4==0 else 'stone',5)
        rock.rotation_euler.z=a

def tree(x,y,scale=1,index=0):
    cylinder('tree_trunk_%d'%index,(x,y,.35*scale),.085*scale,.6*scale,'wood',8)
    for j in range(3):
        cone('tree_crown_%d_%d'%(index,j),(x,y,(.85+j*.35)*scale),(.52-j*.095)*scale,0,.85*scale,'teal' if j%2==0 else '325f4b',7)

def garden(seed,skip=()):
    rng=random.Random(seed+91)
    for i in range(24):
        a=i*math.tau/24+rng.uniform(-.07,.07)
        r=rng.uniform(4.05,4.8)
        x,y=math.cos(a)*r,math.sin(a)*r
        if any(math.dist((x,y),p)<1.3 for p in skip):
            continue
        tree(x,y,rng.uniform(.65,1.05),i)
    for i in range(7):
        x,y=rng.uniform(-3.8,3.8),rng.uniform(-3.8,3.8)
        if any(math.dist((x,y),p)<1.3 for p in skip):
            continue
        cylinder('garden_patch_%d'%i,(x,y,.22),.35,.07,'mint',12)

def server(x,y,h=1.8,index=0,landmark='servers'):
    name='server_%d'%index
    body=cube(name,(x,y,.25+h/2),(.9,.9,h),'white',.08,landmark)
    doorway(body,x,y-.45,landmark)
    cube(name+'_roof',(x,y,.29+h),(.99,.99,.15),'orange',.025,landmark)
    for j in range(max(2,int(h/.4))):
        z=.8+j*.4
        if z>.25+h-.15:continue
        cube(name+'_slot_%d'%j,(x,y-.46,z),(.62,.025,.08),'ink',.005,landmark)
        sphere(name+'_light_%d'%j,(x+.25,y-.48,z+.04),.045,'orange',landmark)
    cube(name+'_pedestal',(x,y,.27),(1.2,1.2,.12),'paper',.08,landmark)

def house(x,y,scale=1,landmark=None):
    body=cube('landmark_'+str(landmark),(x,y,.22+.5*scale),(1.25*scale,1.1*scale,1.0*scale),'white',.06,landmark)
    doorway(body,x,y-.55*scale,landmark)
    roof=cone('roof_'+str(landmark),(x,y,.22+1.15*scale),.98*scale,0,.65*scale,'orange',4,landmark)
    roof.rotation_euler.z=math.pi/4
    for dx in (-.39,.39):
        cube('window_'+str(landmark),(x+dx*scale,y-.558*scale,.22+.6*scale),(.2*scale,.04,.22*scale),'gold',.015,landmark)

def vault(x,y,index=0,landmark='replicas'):
    body=cylinder('landmark_'+landmark+'_%d'%index,(x,y,1.1),1.0,1.7,'white',20,landmark)
    doorway(body,x,y-1,landmark)
    for z in (.85,1.35,1.75):
        ring('vault_band_%d_%s'%(index,z),(x,y,z),1.02,.055,'teal',landmark)
    cylinder('vault_cap_%d'%index,(x,y,2.0),1.1,.18,'gold',24,landmark)
    sphere('vault_status_%d'%index,(x,y-1.02,1.62),.12,'orange',landmark)

def beacon(x=0,y=0,h=3.4,landmark=None):
    cylinder('beacon_base',(x,y,.3),.52,.32,'paper',20)
    cone('beacon',(x,y,h/2+.3),.32,.22,h,'white',16,landmark)
    for z in (h*.36,h*.7):
        cylinder('beacon_stripe',(x,y,z+.3),.29,.22,'orange',16,landmark)
    cylinder('beacon_lantern',(x,y,h+.35),.40,.42,'gold',16,landmark)
    cone('beacon_roof',(x,y,h+.73),.54,0,.34,'teal',12,landmark)

def bridge(a,b,name='bridge',landmark=None):
    mx,my=(a[0]+b[0])/2,(a[1]+b[1])/2
    length=math.dist(a,b)
    o=cube(name,(mx,my,.28),(length,.75,.12),'wood',.025,landmark)
    o['crewWalkSurface']={'halfWidth':length/2,'halfDepth':.30,'height':.06}
    angle=math.atan2(b[1]-a[1],b[0]-a[0])
    o.rotation_euler.z=angle
    for sign in (-1,1):
        for k in range(6):
            t=k/5
            x=a[0]+(b[0]-a[0])*t-math.sin(angle)*.36*sign
            y=a[1]+(b[1]-a[1])*t+math.cos(angle)*.36*sign
            cylinder(name+'_post',(x,y,.44),.025,.24,'white',8,landmark)
        path(name+'_rail',[(a[0]-math.sin(angle)*.36*sign,a[1]+math.cos(angle)*.36*sign,.56),(b[0]-math.sin(angle)*.36*sign,b[1]+math.cos(angle)*.36*sign,.56)],.025,'white',landmark)

def crane(x,y,landmark='upload'):
    cylinder('landmark_'+landmark,(x,y,1.8),.16,3.4,'gold',10,landmark)
    arm=cube('crane_arm',(x+.7,y,3.4),(2.2,.2,.2),'gold',.025,landmark)
    path('crane_cable',[(x+1.65,y,3.45),(x+1.65,y,1.3)],.026,'ink',landmark)
    cube('crane_cargo',(x+1.65,y,1.05),(.65,.6,.45),'orange',.05,landmark)

def robot(x,y):
    cylinder('guide_feet',(x,y,.37),.26,.25,'teal',12)
    cube('guide_body',(x,y,.70),(.52,.38,.48),'white',.09)
    cube('guide_face',(x,y-.21,.74),(.37,.04,.18),'ink',.045)
    for dx in (-.1,.1):
        sphere('guide_eye',(x+dx,y-.25,.76),.038,'gold')
    cylinder('guide_antenna',(x,y,1.05),.026,.28,'teal',8)
    sphere('guide_antenna_light',(x,y,1.2),.07,'orange')

def chapter_scene(ch):
    if ch==1:
        beacon(-3,-1,4,'balancer')
        bridge((0,-4.8),(0,-7.6),'landmark_dock','dock')
        for i,p in enumerate([(0,-1.0),(1.8,.4),(-.6,1.2),(-1.8,-.2),(2.0,-2),(-.4,2.8)]):
            server(*p,1.5+i*.3,i)
        vault(2.8,2.0,0,'database')
        house(-2.5,2,.95,'cache')
        for p in [(-3,-1),(2.8,2),(-2.5,2),(1.8,.4)]: road((0,-4),p)
        ring('harbor_plaza',(0,-1,.25),2.8,.10,'gold')
    elif ch==2:
        base=cylinder('observatory_base',(0,.5,.6),1.6,.8,'paper',32,'telescope')
        doorway(base,0,-1.1,'telescope')
        sphere('observatory_dome',(0,.5,1.4),1.35,'white','telescope')
        scope=cylinder('landmark_telescope',(.2,.2,2.4),.48,2.2,'teal',20,'telescope')
        scope.rotation_euler=(0,math.pi/3,-.4)
        cylinder('telescope_lens',(1.1,.2,2.95),.40,.15,'gold',20,'telescope').rotation_euler=(0,math.pi/3,-.4)
        for i in range(4): cube('landmark_storage_%d'%i,(2.6+(i%2)*.6,-1.2,.5+(i//2)*.55),(.52,.62,.52),'orange',.04,'storage')
        beacon(-2.6,1.8,3.5,'clock')
        for r in (2.1,3.3): ring('measuring_ring',(0,.5,.24),r,.055,'gold')
    elif ch==3:
        pts=[(-2.7,-2),(2,-2),(2,2),(-2.7,2)]
        keys=['scope','blueprint','deepDive','wrapUp']
        for i,(p,key) in enumerate(zip(pts,keys)):
            cylinder('landmark_'+key,(*p,.3),1.0,.22,'paper',24,key)
            if i==1:
                board=cube('drafting_board',(*p,1.3),(1.6,.15,1.2),'blue',.04,key)
                for j in range(3): cube('blueprint_rule',(p[0],p[1]-.09,.98+j*.3),(1.1,.025,.035),'white',0,key)
            else: house(*p,.65,key)
            road(p,pts[(i+1)%4],'route_step_%d'%i)
        beacon(0,0,3.0)
    elif ch==4:
        cube('canal',(0,-.2,.25),(1.6,9.6,.13),'blue',.02)
        for x in (-1.2,1.2):
            cube('landmark_gates',(x,-1,1.7),(.75,.9,3.0),'stone',.1,'gates')
            sphere('gate_pressure',(x,-1.51,2.6),.20,'orange','gates')
        cube('gate_beam',(0,-1,3.05),(3.25,1,.38),'white',.04,'gates')
        cube('gate_valve',(0,-1,1.35),(1.6,.15,2.2),'gold',.03,'gates')
        cylinder('landmark_reservoir',(0,3,.7),1.3,.9,'white',24,'reservoir')
        cylinder('reservoir_water',(0,3,1.17),1.22,.04,'blue',24,'reservoir')
        house(3,1,1,'service'); beacon(-3,2,3)
        bridge((-2,-3),(2,-3),'canal_bridge')
    elif ch==5:
        ring('landmark_ring',(0,0,.40),3.1,.18,'gold','ring')
        for i in range(7):
            a=i*math.tau/7
            server(3.1*math.cos(a),3.1*math.sin(a),1.4,i)
        for i in range(18):
            a=i*math.tau/18+.13
            sphere('key_crystal_%d'%i,(2.65*math.cos(a),2.65*math.sin(a),.65),.11,'orange')
        cylinder('landmark_compass',(0,0,.6),1.0,.8,'white',24,'compass')
        cone('compass_arrow',(0,0,1.3),.7,0,.7,'teal',3,'compass')
        beacon(0,0,3)
    elif ch==6:
        cube('partition_river',(0,0,.25),(.9,10,.08),'blue',.04,'partition')
        for i,p in enumerate([(-2.4,-1.6),(2.3,-1.6),(0,2.7)]):
            vault(*p,i,'replicas')
            road((0,.7),p)
        bridge((-1.1,0),(1.1,0),'landmark_partition','partition')
        house(-3,2,.65,'repair'); beacon(-1.5,1.0,2.6)
    elif ch==7:
        cone('summit',(0,.7,1.2),2.4,.4,2.0,'snow',8)
        beacon(0,.7,4.2,'clock')
        for i in range(4):
            p=(math.cos(i*math.pi/2)*3,math.sin(i*math.pi/2)*3)
            house(*p,.75,'workers'); road(p,(0,-1))
        cube('landmark_assembly',(0,-2,.48),(4,.7,.42),'teal',.04,'assembly')
        for i in range(7): cube('id_segment_%d'%i,(-1.65+i*.55,-2,.83),(.4,.5,.25),'orange' if i<4 else 'gold',.025,'assembly')
        for a in range(6):
            angle=a*math.pi/3
            road((0,-3.7),(math.cos(angle)*1.4, -3.7+math.sin(angle)*1.4),'snowflake','paper',.06)
    elif ch==8:
        road((-4,-2),(4,2),'long_route','paper',.18)
        path('long_route_curve',[(-4,-2,.33),(-3,2,.33),(0,3,.33),(3,2,.33),(4,2,.33)],.18,'paper')
        bridge((-3,-2),(3,-2),'shortcut','redirect')
        house(0,1.2,1.5,'encoder'); vault(3,1.5,0,'archive')
        cylinder('landmark_redirect',(-3,-2,1.05),.1,1.6,'wood',10,'redirect')
        cube('redirect_sign',(-3,-2,1.8),(1.3,.12,.45),'orange',.04,'redirect'); beacon(-2.5,2,2.6)
    elif ch==9:
        pts=[(0,-3),(-2.8,-1),(2.8,-1),(-3,2),(0,2),(3,2)]
        for i,p in enumerate(pts):
            cylinder('page_plinth_%d'%i,(*p,.4),.8,.4,'paper',12,'archive')
            cube('page_%d'%i,(*p,1.0),(.7,.15,.95),'white',.06,'archive')
            cube('page_header_%d'%i,(p[0],p[1]-.09,1.22),(.45,.025,.13),'orange',.02,'archive')
        for a,b in [(0,1),(0,2),(1,3),(1,4),(2,4),(2,5),(5,2)]: road(pts[a],pts[b])
        cube('landmark_frontier',(0,-3.8,.4),(2.1,.6,.3),'teal',.04,'frontier')
        house(3.3,3.2,.55,'robots'); robot(0,-1.4); beacon(-3.5,3,2.8)
    elif ch==10:
        cylinder('landmark_channels',(0,1.0,2.2),.18,4,'white',12,'channels')
        for z,r in [(2.4,.55),(3.2,.8),(4.2,1.05)]: ring('signal_ring',(0,1,z),r,.07,'orange','channels')
        for i,p in enumerate([(-3,-1),(0,-2.5),(3,-1)]): house(*p,.85,'channels'); road((0,1),p)
        path('landmark_queue',[(-2,2,.5),(-2,3.2,.5),(1.7,3.2,.5),(1.7,2,.5)],.23,'gold','queue')
        house(-3,2,.65,'preferences'); beacon(3,2.5,2.7)
    elif ch==11:
        house(0,1.7,1.8,'celebrity')
        for i in range(7):
            a=math.pi+i*math.pi/6
            x,y=3.6*math.cos(a),3.1*math.sin(a)
            house(x,y,.57,'inboxes'); road((0,1.7),(x,y))
        cylinder('town_plaza',(0,-.5,.2),2.1,.1,'paper',32)
        house(3.3,1.5,.65,'cache'); beacon(-3,2.4,3)
    elif ch==12:
        cube('cove_river',(0,0,.26),(1.5,10,.08),'blue',.04)
        house(-2.5,0,1.3,'connection'); house(2.5,0,1.3,'connection')
        bridge((-2,-1.4),(2,-1.4),'landmark_connection','connection')
        for x in (-2.5,2.5): sphere('presence_lamp',(x,-.9,1.4),.18,'gold','connection')
        vault(-2.5,2.8,0,'history'); house(2.5,2.8,.75,'sync')
        road((-2.5,0),(-2.5,2.8)); road((2.5,0),(2.5,2.8)); beacon(0,-3,2.8)
    elif ch==13:
        # A physical branching trie, not a generic tree decoration.
        pts=[(0,-3),(0,-1.4),(-2,.3),(2,.3),(-3.2,2),(-.8,2),(.9,2),(3.2,2)]
        for i,p in enumerate(pts):
            cylinder('landmark_trie_%d'%i,(*p,.6+i*.055),.4,.7,'white',12,'trie')
            sphere('prefix_light_%d'%i,(*p,1.02+i*.055),.23,'gold' if i<4 else 'orange','trie')
        for a,b in [(0,1),(1,2),(1,3),(2,4),(2,5),(3,6),(3,7)]: road(pts[a],pts[b],'trie_edge','gold',.12)
        house(-3,-2,.75,'library'); house(3,-2,.75,'aggregator'); beacon(0,3.8,2.4)
    elif ch==14:
        for i in range(4):
            cylinder('cinema_terrace_%d'%i,(0,1,.3+i*.19),2.6-i*.4,.18,'paper',32)
        cube('cinema_screen',(0,2.4,2.0),(3.2,.15,1.7),'teal',.05,'cdn')
        # Original geometric play symbol inside the modeled cinema.
        play=cone('cinema_play',(0,2.29,2.0),.52,0,.10,'gold',3,'cdn'); play.rotation_euler=(math.pi/2,0,math.pi/2)
        crane(-3,-1)
        for i in range(3): server(-1.3+i*1.3,-2.4,1.2,i,'transcode')
        for i,p in enumerate([(-3,2.4),(3,2.4),(3,-1)]):
            cylinder('landmark_cdn_%d'%i,(*p,.6),.5,.7,'orange',12,'cdn'); road((0,-2.4),p)
        beacon(3.3,.6,2.7)
    elif ch==15:
        for i in range(9):
            cube('landmark_blocks_%d'%i,(-1+(i%3)*.95,.3+(i//3)*.8,.6),(.75,.65,.7),'white' if i%3 else 'orange',.06,'blocks')
            cube('block_hash_%d'%i,(-1+(i%3)*.95,-.04+(i//3)*.8,.6),(.5,.035,.1),'teal',.01,'blocks')
        house(-3,-1.8,.9,'devices'); house(3,-1.8,.9,'devices')
        for x in (-3,3): road((x,-1.8),(0,0))
        vault(3,2.5,0,'versions'); beacon(-2.8,2.4,3)
        ring('sync_cycle',(0,.8,.25),2.4,.08,'gold')
    elif ch==16:
        beacon(0,0,5.2,'failover')
        ring('horizon_ring',(0,0,.28),2.4,.11,'gold')
        house(-3,-1.8,1,'ingress'); vault(3,1.3,0,'replicas')

        for i in range(8):
            a=i*math.tau/8+.2
            server(3.7*math.cos(a),3.7*math.sin(a),1.2,i,'ingress')
        path('landmark_queue',[(-2.7,-1.8,.35),(0,-2.4,.35),(2.8,-2,.35)],.22,'gold','queue')
        for p in [(-3,-1.8),(3,1.3),(2.8,-2),(-2.8,2)]: road((0,0),p)

def crew_infrastructure(ch):
    """Export dry-land containment, real access points and conservative footprints."""
    bpy.context.view_layer.update()
    obstacles=[]
    for o in list(bpy.context.scene.objects):
        if o.type!='MESH' or o.get('crewWalkSurface'):continue
        corners=[o.matrix_world@Vector(v) for v in o.bound_box]
        lo=[min(p[i] for p in corners) for i in range(3)]
        hi=[max(p[i] for p in corners) for i in range(3)]
        # Grounded structures/equipment; terrain, paths, door trims and overhead roofs are excluded.
        if hi[2]-lo[2]<.39 or lo[2]>.56 or hi[0]-lo[0]<.24 or hi[1]-lo[1]<.10:continue
        if o.name.startswith(('rock_','terrain','cliff_','canal','cove_river','partition_river')):continue
        local=[Vector(v) for v in o.bound_box]
        minx,maxx=min(p.x for p in local),max(p.x for p in local)
        miny,maxy=min(p.y for p in local),max(p.y for p in local)
        hx=(maxx-minx)/2;hy=(maxy-miny)/2
        can_tip=bool(o.get('landmark'))
        o['crewObstacle']={'shape':'box','halfWidth':hx,'halfDepth':hy,'centerX':(maxx+minx)/2,'centerZ':-(maxy+miny)/2,'canTip':can_tip}
        padding=.45 if can_tip else .15
        obstacles.append((lo[0]-padding,hi[0]+padding,lo[1]-padding,hi[1]+padding))
    # Keep water out of the walking graph, with a gap only at each physical bridge.
    river=None
    if ch==4:river=(.8,-3)
    elif ch==6:river=(.45,0)
    elif ch==12:river=(.75,-1.4)
    if river:
        half,gap=river
        for n,(low,high) in enumerate([(-5.4,gap-.36),(gap+.36,5.4)]):
            o=bpy.data.objects.new('crew_water_barrier_'+str(n),None);bpy.context.collection.objects.link(o)
            o.location=(0,(low+high)/2,.22)
            o['crewObstacle']={'shape':'box','halfWidth':half,'halfDepth':(high-low)/2,'canTip':False}
            obstacles.append((-half-.1,half+.1,low-.1,high+.1))
    navigation=bpy.data.objects.get('crew_navigation')
    boundary=[(x,-z) for x,z in navigation['crewWalkBoundary']]
    def inside(x,y):
        odd=False;j=len(boundary)-1
        for i,(ax,ay) in enumerate(boundary):
            bx,by=boundary[j]
            if (ay>y)!=(by>y) and x<(bx-ax)*(y-ay)/(by-ay)+ax:odd=not odd
            j=i
        return odd
    def free(x,y):
        return inside(x,y) and not any(a<=x<=b and c<=y<=d for a,b,c,d in obstacles)
    def safe_near(x,y):
        for radius in range(0,24):
            candidates=[(x+dx*.12,y+dy*.12) for dx in range(-radius,radius+1) for dy in range(-radius,radius+1) if max(abs(dx),abs(dy))==radius]
            candidates.sort(key=lambda p:(p[0]-x)**2+(p[1]-y)**2)
            for px,py in candidates:
                if free(px,py):return px,py
        raise RuntimeError('No safe access point near '+str((ch,x,y)))
    for o in bpy.context.scene.objects:
        if o.get('crewRole')=='workstation':o.location.x,o.location.y=safe_near(o.location.x,o.location.y)
    # Every chapter includes exterior work points, even chapters centered on equipment.
    groups={}
    for o in bpy.context.scene.objects:
        key=o.get('landmark')
        if key and o.type=='MESH' and not key in groups:
            corners=[o.matrix_world@Vector(v) for v in o.bound_box]
            groups[key]=(o.location.x,min(p.y for p in corners)-.6)
    for key,(x,y) in groups.items():
        if not any(o.get('crewLandmark')==key for o in bpy.context.scene.objects):
            px,py=safe_near(x,y);crew_point('crew_work_'+key,px,py,landmark=key)
    if ch==11:
        for i,(x,y) in enumerate([(-1.7,.6),(1.7,.6),(-1.7,-.5),(1.7,-.5)]):
            px,py=safe_near(x,y);crew_point('crew_crowd_'+str(i),px,py,landmark='celebrity')
    access=[('entrance',-1.5,-3.6),('exit',1.5,-3.6)]
    if ch==16:
        # The capstone's server ring needs a western service corridor; the
        # former southeast exit sat in an isolated equipment courtyard.
        access=[('entrance',-1.5,-3.6),('exit',-4.35,-2.1)]
    for role,x,y in access:
        x,y=safe_near(x,y)
        marker=crew_point('crew_'+role,x,y,role)
        marker['doorHeight']=.72;marker['doorWidth']=.75
        for dx in (-.46,.46):
            post=cube('access_'+role+'_post',(x+dx,y,.56),(.13,.16,.68),'stone',.025)
            # Access structures are authored after the main footprint pass.
            # Their posts still need real collision footprints; the center
            # opening remains clear for people walking through the gate.
            post['crewObstacle']={'shape':'box','halfWidth':.065,'halfDepth':.08,'canTip':False}
        cube('access_'+role+'_lintel',(x,y,.94),(1.05,.19,.15),'orange' if role=='entrance' else 'teal',.025)
        cube('access_'+role+'_threshold',(x,y,.205),(.85,.5,.035),'paper',.012)
        arrow=cone('access_'+role+'_arrow',(x,y-.12,.93),.14,0,.035,'gold',3)
        arrow.rotation_euler=(math.pi/2,0,0 if role=='entrance' else math.pi)
        road((x,y),(x,y+.6),'crew_access_path','paper',.055)

def setup_render():
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE' if bpy.app.version >= (5,0,0) else 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x=1100
    scene.render.resolution_y=900
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.world.color=(.5,.6,.6)
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.8,.8,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
    scene.view_settings.view_transform='Standard'
    scene.view_settings.look='None'
    bpy.ops.object.camera_add(location=(12,-17,14))
    cam=bpy.context.object
    cam.name='Design_camera'
    cam.rotation_euler=(Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO'
    cam.data.ortho_scale=19
    scene.camera=cam
    bpy.ops.object.light_add(type='AREA',location=(-6,-8,15))
    bpy.context.object.name='Softbox_key'
    bpy.context.object.data.energy=1700
    bpy.context.object.data.shape='DISK'
    bpy.context.object.data.size=10
    bpy.ops.object.light_add(type='AREA',location=(9,4,10))
    bpy.context.object.name='Softbox_fill'
    bpy.context.object.data.energy=900
    bpy.context.object.data.size=9
    # Sea is kept out of the exported environments and added by the web renderer.
    sea=cube('Render_sea',(0,0,-2.25),(200,200,.12),'sea',0)
    sea['render_only']=True

def build():
    global CURRENT,MATS
    manifest={'generator':'Blender Python authored by coordinator','blender':bpy.app.version_string,'levels':[]}
    if os.environ.get('ISLAND_CHAPTERS') and (ROOT/'public'/'asset-manifest.json').exists():
        manifest=json.loads((ROOT/'public'/'asset-manifest.json').read_text())
        manifest['levels']=[l for l in manifest['levels'] if str(l['id']) not in os.environ['ISLAND_CHAPTERS'].split(',')]
    for ch in range(1,17):
        if os.environ.get('ISLAND_CHAPTERS') and str(ch) not in os.environ['ISLAND_CHAPTERS'].split(','):
            continue
        CURRENT=ch
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete(use_global=False)
        MATS={}
        random.seed(ch*111)
        terrain(ch,'wide' if ch in (4,8,12) else 'tall' if ch in (7,13) else 'round')
        chapter_scene(ch)
        garden_clearings=[(0,0),(-3,-1),(3,1),(0,-4)]
        if ch==16:
            garden_clearings.extend([(-4.5,-2.4),(-4.5,-.9),(-4.5,.7),(-3.9,2.6),(4.4,0)])
        garden(ch,garden_clearings)
        robot(1.3,-3.7)
        crew_infrastructure(ch)
        for i in range(7):
            a=i*math.tau/7+.2
            sphere('route_token_%d'%i,(3.3*math.cos(a),3.3*math.sin(a),.43),.085,'orange')
        # Snapshot export geometry before camera, lights and render sea are added.
        meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
        bpy.ops.object.select_all(action='DESELECT')
        for o in bpy.context.scene.objects:
            if o.type=='MESH' or o.get('crewRole') or o.name=='crew_navigation' or o.get('crewObstacle'):o.select_set(True)
        export=MODELS/('chapter-%02d.glb'%ch)
        bpy.ops.export_scene.gltf(filepath=str(export),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
        landmarks=sorted({o.get('landmark') for o in meshes if o.get('landmark')})
        triangles=sum(len(o.data.polygons) for o in meshes)
        setup_render()
        source=SOURCES/('chapter-%02d.blend'%ch)
        bpy.context.scene['title']=TITLES[ch-1]
        bpy.context.scene['chapter']=ch
        bpy.ops.wm.save_as_mainfile(filepath=str(source))
        if ch in (1,4,5,9,13,14,16):
            bpy.context.scene.render.filepath=str(RENDERS/('chapter-%02d.png'%ch))
            bpy.ops.render.render(write_still=True)
        manifest['levels'].append({'id':ch,'title':TITLES[ch-1],'model':export.name,'bytes':export.stat().st_size,'source':str(source.relative_to(ROOT)),'meshCount':len(meshes),'polygonCount':triangles,'landmarks':landmarks,'crewAccess':{'doorHeight':.46,'workerHeight':.38,'entrance':True,'exit':True}})
        print('ISLAND_READY',ch,export.stat().st_size,flush=True)
    manifest['levels'].sort(key=lambda l:l['id'])
    (ROOT/'public'/'asset-manifest.json').write_text(json.dumps(manifest,indent=2))
    # A native overview scene with all sixteen already-authored exported environments.
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for ch in range(1,17):
        before=set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(MODELS/('chapter-%02d.glb'%ch)))
        objects=set(bpy.context.scene.objects)-before
        root=bpy.data.objects.new('Island_%02d'%ch,None)
        bpy.context.collection.objects.link(root)
        for o in objects:
            if not o.parent: o.parent=root
        root.location=((ch-1)%4*14-21,(ch-1)//4*14-21,0)
    CURRENT=0
    setup_render()
    bpy.context.scene.camera.location=(45,-60,62)
    bpy.context.scene.camera.rotation_euler=(Vector((0,0,0))-bpy.context.scene.camera.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.scene.camera.data.ortho_scale=82
    bpy.context.scene.render.resolution_x=1600
    bpy.context.scene.render.resolution_y=1200
    bpy.context.scene.render.filepath=str(RENDERS/'archipelago.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCES/'archipelago.blend'))
    bpy.ops.render.render(write_still=True)
    print('ALL_ISLANDS_COMPLETE',flush=True)

if __name__=='__main__':
    build()
