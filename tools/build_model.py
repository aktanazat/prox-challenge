"""
Procedural Blender build for the Vulcan OmniPro 220 welder model.

Reproduce with:
    blender -b -P tools/build_model.py
Add turntable verification renders (not baked into the GLB):
    blender -b -P tools/build_model.py -- --render

Contract (node names, materials, budgets): see local://model-contract.md at
build time; the ASSERT_NAMES block below is the frozen list machine.js binds
to. Geometry is authored directly with bmesh/curves (no booleans on the hot
path) to keep the tri budget small and the script fast to iterate on.
"""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Euler, Matrix

# --------------------------------------------------------------------------
# Paths / constants
# --------------------------------------------------------------------------
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GLB_OUT = os.path.join(REPO, "web", "models", "omnipro220.glb")
RENDER_DIR = "/tmp/omnipro-renders"

RENDER = "--render" in sys.argv

# Chassis envelope (meters). Real machine reads W:H:D ~= 1:1.5:2.1 (upright
# suitcase, taller than wide) per photo analysis; keep the contract's W/D,
# correct H upward from the first pass which read squat.
X0, X1 = -0.25, 0.25          # width extents
W = X1 - X0
D = 0.66                      # depth (front..rear)
# Side profile (Y,Z) of the main body, front-bottom -> front-top(fascia) ->
# rear-top -> rear-bottom. Body reads as a near-rectangular box: front
# fascia leans back only ~3 deg, top slopes down toward the front ~7 deg,
# rear face is vertical.
V1 = (-0.33, 0.00)   # front-bottom
V2 = (-0.30, 0.50)   # front-top / fascia-top
V3 = (0.33, 0.58)    # rear-top
V4 = (0.33, 0.00)    # rear-bottom
HB = V3[1]           # body height (no handle) = 0.58
HANDLE_TOP = 0.66    # rail height; grip bar sits here (lower-profile arch, W:H ~1:1.3)

DOOR_DEPTH = 0.09    # interior bay depth from the -X opening

# Fascia plane basis (front leaning face V1->V2), used to place every front
# panel control at an exact point on that tilted plane.
_fx = V2[0] - V1[0]
_fz = V2[1] - V1[1]
_flen = math.hypot(_fx, _fz)
FASCIA_UP = (_fx / _flen, _fz / _flen)              # (dy, dz) unit "up" on the face
FASCIA_TILT_X = math.atan2(-FASCIA_UP[0], FASCIA_UP[1])  # rotation about local X to align Z with fascia up
FASCIA_NORMAL = (-FASCIA_UP[1], FASCIA_UP[0])        # (ny, nz) outward normal (front, slightly up)


def panel_point(x, s, off=0.0):
    """World point on the leaning fascia: x=width coord, s=0..1 bottom->top
    of the slant, off=outward offset along the fascia normal (meters)."""
    y = V1[0] + s * _fx + off * FASCIA_NORMAL[0]
    z = V1[1] + s * _fz + off * FASCIA_NORMAL[1]
    return (x, y, z)


# --------------------------------------------------------------------------
# Scene setup
# --------------------------------------------------------------------------
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.unit_settings.system = 'METRIC'
    scn.unit_settings.scale_length = 1.0
    return scn


MAIN_COLL = "OmniPro220"


def make_collection(name, parent=None):
    coll = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(coll)
    return coll


# --------------------------------------------------------------------------
# Materials (PBR only, per contract palette + a few unnamed dressing extras)
# --------------------------------------------------------------------------
MATS = {}


def mat(name, base, rough=0.5, metal=0.0, emit=None, emit_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    MATS[name] = m
    return m


def build_materials():
    def srgb(hexstr):
        r = int(hexstr[0:2], 16) / 255
        g = int(hexstr[2:4], 16) / 255
        b = int(hexstr[4:6], 16) / 255
        # simple sRGB->linear for correct-looking PBR base color
        conv = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
        return (conv(r), conv(g), conv(b))

    mat("chassis", srgb("232528"), rough=0.55, metal=0.10)
    mat("chassis_b", srgb("202226"), rough=0.68, metal=0.06)  # rear cap: slightly rougher, less metallic
    mat("panel", srgb("2b2e33"), rough=0.5, metal=0.10)
    mat("orange", srgb("ff6a00"), rough=0.45, metal=0.05)
    mat("brass", srgb("b08d57"), rough=0.30, metal=1.0)
    mat("rubber", srgb("1a1a1c"), rough=0.9, metal=0.0)
    mat("LCD", srgb("1c2b22"), rough=0.25, metal=0.0, emit=srgb("2f4a3a"), emit_strength=0.6)
    mat("white", (0.92, 0.92, 0.92), rough=0.4, metal=0.0)
    mat("aluminum", (0.72, 0.72, 0.74), rough=0.35, metal=0.85)
    mat("wire", (0.55, 0.55, 0.55), rough=0.45, metal=0.6)
    mat("teal", srgb("2f8f8f"), rough=0.5, metal=0.1)


# --------------------------------------------------------------------------
# Mesh helpers
# --------------------------------------------------------------------------
def link_obj(obj, coll):
    coll.objects.link(obj)
    return obj


def obj_from_bmesh(name, bm, origin, material, coll, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.update()
    if material:
        me.materials.append(MATS[material])
    ob = bpy.data.objects.new(name, me)
    ob.location = origin
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    link_obj(ob, coll)
    return ob


def add_box(name, size, loc, rot=(0, 0, 0), material=None, coll=None, bevel=0.0):
    """Box centered at `loc`, local origin = box center."""
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0:
        edges = [e for e in bm.edges]
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=2, affect='EDGES')
    ob = obj_from_bmesh(name, bm, loc, material, coll)
    ob.rotation_euler = rot
    return ob


def add_cylinder(name, radius, depth, loc, rot=(0, 0, 0), material=None, coll=None, segs=20, cap=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segs,
                           radius1=radius, radius2=radius, depth=depth)
    ob = obj_from_bmesh(name, bm, loc, material, coll, smooth=True)
    ob.rotation_euler = rot
    return ob


def add_cone(name, r1, r2, depth, loc, rot=(0, 0, 0), material=None, coll=None, segs=20):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                           radius1=r1, radius2=r2, depth=depth)
    ob = obj_from_bmesh(name, bm, loc, material, coll, smooth=True)
    ob.rotation_euler = rot
    return ob


def add_plane(name, w, h, loc, rot=(0, 0, 0), material=None, coll=None, uv=True):
    bm = bmesh.new()
    v0 = bm.verts.new((-w / 2, -h / 2, 0))
    v1 = bm.verts.new((w / 2, -h / 2, 0))
    v2 = bm.verts.new((w / 2, h / 2, 0))
    v3 = bm.verts.new((-w / 2, h / 2, 0))
    f = bm.faces.new((v0, v1, v2, v3))
    bm.faces.ensure_lookup_table()
    if uv:
        uv_layer = bm.loops.layers.uv.new()
        coords = [(0, 0), (1, 0), (1, 1), (0, 1)]
        for loop, co in zip(f.loops, coords):
            loop[uv_layer].uv = co
    ob = obj_from_bmesh(name, bm, loc, material, coll)
    ob.rotation_euler = rot
    return ob


def add_empty(name, loc, coll, radius=0.02, rot=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = 'PLAIN_AXES'
    ob.empty_display_size = radius
    ob.location = loc
    ob.rotation_euler = rot
    link_obj(ob, coll)
    return ob


def rotation_for_normal(normal, up=(0, 0, 1)):
    """Euler that orients an object whose local Z is its face normal (planes,
    text) so that Z points along `normal` and Y points "up" as given. Used
    instead of hand-derived single-axis Eulers wherever the target normal
    isn't confined to a single rotation plane (avoids reading-direction /
    mirroring bugs on faces not aligned with the fascia)."""
    z = Vector(normal).normalized()
    u = Vector(up).normalized()
    x = u.cross(z).normalized()
    y = z.cross(x).normalized()
    m = Matrix((x, y, z)).transposed().to_4x4()
    return m.to_euler()


def add_tube_curve(name, points, radius, loc_origin, material, coll, segs=6):
    """A curve with a circular bevel, converted to a mesh object, local
    origin at `loc_origin` (points are given in world space)."""
    curve = bpy.data.curves.new(name, type='CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    curve.resolution_u = 6
    curve.use_fill_caps = True  # close tube ends; open ends see-through to the world background
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for i, p in enumerate(points):
        bp = spline.bezier_points[i]
        bp.co = Vector(p) - Vector(loc_origin)
        bp.handle_left_type = 'AUTO'
        bp.handle_right_type = 'AUTO'
    tmp = bpy.data.objects.new(name + "_curve", curve)
    bpy.context.scene.collection.objects.link(tmp)
    deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(deps))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(curve)
    if material:
        me.materials.append(MATS[material])
    ob = bpy.data.objects.new(name, me)
    ob.location = loc_origin
    for p in me.polygons:
        p.use_smooth = True
    link_obj(ob, coll)
    return ob


def parent_keep_transform(child, parent):
    """Parent `child` to `parent` while preserving child's already-authored
    world transform. `matrix_world` is only valid after a depsgraph update
    for objects transformed this call (bpy quirk) - force it before reading."""
    bpy.context.view_layer.update()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


def apply_scale(ob):
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.select_set(False)


def add_text(name, body, size, loc, rot, material, coll, extrude=0.0015, align='CENTER', shear=0.0):
    tc = bpy.data.curves.new(name, type='FONT')
    tc.body = body
    tc.size = size
    tc.extrude = extrude
    tc.shear = shear
    tc.align_x = align
    tc.align_y = 'CENTER'
    tmp = bpy.data.objects.new(name + "_txt", tc)
    bpy.context.scene.collection.objects.link(tmp)
    deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(deps))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(tc)
    if material:
        me.materials.append(MATS[material])
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = rot
    link_obj(ob, coll)
    return ob


# --------------------------------------------------------------------------
# Chassis shell: a tapered quad-profile prism (front lean + top slope +
# vertical rear), extruded along X. The -X end is left open (the side door
# covers it); the +X end is capped solid (mirrored orange side, no hinge).
# --------------------------------------------------------------------------
def build_chassis(coll):
    bm = bmesh.new()
    prof = [V1, V2, V3, V4]

    def ring(x):
        return [bm.verts.new((x, y, z)) for (y, z) in prof]

    r0 = ring(X0)
    r1 = ring(X1)
    bm.verts.ensure_lookup_table()

    # side walls (front, top, rear, bottom) bridging the two rings
    n = len(prof)
    side_faces = []
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
        side_faces.append(f)

    # cap the +X end only (right side, solid orange wall)
    cap1 = bm.faces.new(tuple(reversed(r1)))

    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))

    # bevel the long edges for a molded-plastic rounded look, cheap (few
    # hundred tris) since the base prism is only 5 faces.
    long_edges = []
    for f in side_faces:
        long_edges.extend(f.edges)
    bmesh.ops.bevel(bm, geom=list(set(long_edges)), offset=0.012, segments=2, affect='EDGES')

    me = bpy.data.meshes.new("chassis_body")
    bm.to_mesh(me)
    bm.free()
    me.update()
    me.materials.append(MATS["chassis"])
    me.materials.append(MATS["panel"])
    me.materials.append(MATS["chassis_b"])
    # assign the fascia-facing polys (front-lean side, i.e. facing -Y/+Z-ish)
    # to the lighter "panel" material by normal test; rear-facing polys get
    # the slightly rougher chassis_b variant for subtle material contrast.
    for p in me.polygons:
        n = p.normal
        if n.y < -0.55 and n.z > 0.15:
            p.material_index = 1
        elif n.y > 0.7:
            p.material_index = 2
    ob = bpy.data.objects.new("chassis_body", me)
    link_obj(ob, coll)
    return ob


def build_right_side_wrap(coll):
    """Orange sheet-metal wrap on the +X (non-door) side, mirroring the
    door's outer look; sits just outboard of the chassis cap."""
    prof = [V1, V2, V3, V4]
    bm = bmesh.new()
    verts = [bm.verts.new((0, y, z)) for (y, z) in prof]
    bm.faces.new(verts)
    bm.normal_update()
    ret = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    extruded = [v for v in ret["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0.014, 0, 0), verts=extruded)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    ob = obj_from_bmesh("chassis_wrap_right", bm, (X1 - 0.001, 0, 0), "orange", coll)
    return ob


# --------------------------------------------------------------------------
# Left side door (part_side-panel) + interior bay
# --------------------------------------------------------------------------
def build_side_door(coll):
    prof = [V1, V2, V3, V4]
    hinge = (X0, V3[0] - 0.01, 0.0)  # rear-top-ish y, vertical hinge line
    bm = bmesh.new()
    local = [(p[0] - hinge[1], p[1] - hinge[2]) for p in prof]
    v_out = [bm.verts.new((0.0, y, z)) for (y, z) in local]
    f_out = bm.faces.new(v_out)
    bm.normal_update()
    ret = bmesh.ops.extrude_face_region(bm, geom=[f_out])
    ext_verts = [v for v in ret["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(-0.016, 0, 0), verts=ext_verts)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.006, segments=1, affect='EDGES')
    ob = obj_from_bmesh("part_side-panel", bm, hinge, "orange", coll)
    ob.rotation_euler = (0, 0, 0)  # closed, as authored; +Z rotation opens

    # branding graphics on the outer door face: the single most identifying
    # visual cue on the real machine. Computed (not hand-derived) basis so
    # the reading direction lands correctly for a viewer standing outside
    # (-X) looking at the closed door; parented so it swings open with it.
    face_x = X0 - 0.017
    txt_rot = rotation_for_normal((-1, 0, 0), up=(0, 0, 1))
    specs = (
        ("wordmark_omnipro", "OMNIPRO", 0.048, -0.10, 0.425, True),
        ("wordmark_220", "220", 0.075, -0.10, 0.29, False),
        ("wordmark_vulcan_side", "VULCAN", 0.078, 0.05, 0.155, True),
    )
    for name, body, size, y, z, italic in specs:
        t = add_text(name, body, size, (face_x, y, z), txt_rot, "white", coll,
                     extrude=0.0018, shear=0.3 if italic else 0.0)
        parent_keep_transform(t, ob)
    swoosh_y0, swoosh_z0 = 0.05 - 0.10, 0.155 - 0.045
    swoosh = add_tube_curve("wordmark_vulcan_side_swoosh",
                             [(face_x, swoosh_y0, swoosh_z0), (face_x, 0.05, swoosh_z0 - 0.006),
                              (face_x, 0.05 + 0.10, swoosh_z0)],
                             0.003, (face_x, swoosh_y0, swoosh_z0), "white", coll)
    parent_keep_transform(swoosh, ob)
    return ob


def build_interior_bay(coll):
    """Recessed bay behind the door: back wall + spool + drive unit + guides
    + tension knob + polarity terminal block, all real geometry so the open
    door reveals a readable interior."""
    bx = X0 + DOOR_DEPTH  # back wall x

    # bay side/floor/roof walls: a shallow inset room using the same
    # tapered profile, scaled in toward the center a bit.
    def shrink(p, k=0.86):
        return (p[0] * k, HB * 0.5 + (p[1] - HB * 0.5) * k)

    prof = [shrink(V1), shrink(V2), shrink(V3), shrink(V4)]
    bm = bmesh.new()
    rb = [bm.verts.new((bx, y, z)) for (y, z) in prof]  # back ring
    ro = [bm.verts.new((X0 - 0.001, y, z)) for (y, z) in prof]  # opening ring (unused as cap)
    back_face = bm.faces.new(rb)
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ro[i], ro[j], rb[j], rb[i]))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    obj_from_bmesh("interior_bay_walls", bm, (0, 0, 0), "chassis", coll)

    # spool: part_spool IS the wound-wire cylinder (visible, real geometry),
    # origin on the spindle axis; hub + spindle stub are its children so the
    # whole assembly moves/hides together.
    spool_c = (X0 + 0.045, -0.06, 0.363)
    part_spool = add_cylinder("part_spool", 0.105, 0.045, spool_c, rot=(0, math.pi / 2, 0),
                               material="wire", coll=coll)
    spool_hub = add_cylinder("spool_hub", 0.028, 0.05, spool_c, rot=(0, math.pi / 2, 0),
                              material="orange", coll=coll)
    spool_spindle = add_cylinder("spool_spindle", 0.012, 0.10, (X0 + 0.02, -0.06, 0.363),
                                  rot=(0, math.pi / 2, 0), material="aluminum", coll=coll)
    for child in (spool_hub, spool_spindle):
        parent_keep_transform(child, part_spool)

    # drive/feed unit (cast aluminum block) + rollers
    drive_c = (X0 + 0.05, 0.10, 0.207)
    add_box("drive_block", (0.10, 0.09, 0.075), drive_c, material="aluminum", coll=coll, bevel=0.006)
    add_cylinder("drive_roller", 0.022, 0.03, (X0 + 0.05, 0.10, 0.177),
                 rot=(0, math.pi / 2, 0), material="chassis", coll=coll)

    # feed guide tubes (spool -> drive)
    add_cylinder("guide_1", 0.006, 0.05, (X0 + 0.05, 0.02, 0.269), rot=(math.radians(70), 0, 0),
                 material="teal", coll=coll)
    add_cylinder("guide_2", 0.006, 0.045, (X0 + 0.045, 0.155, 0.207), rot=(0, math.radians(80), 0),
                 material="teal", coll=coll)

    # tension arm + knob
    tension_c = (X0 + 0.06, 0.075, 0.342)
    add_box("tension_arm", (0.018, 0.07, 0.014), (X0 + 0.06, 0.075, 0.322),
            rot=(math.radians(20), 0, 0), material="chassis", coll=coll)
    part_tk = add_cylinder("part_tension-knob", 0.013, 0.03, tension_c,
                            rot=(math.pi / 2, 0, 0), material="chassis", coll=coll, segs=10)

    # polarity terminal block + lugs
    term_c = (X0 + 0.05, -0.23, 0.135)
    add_box("terminal_block", (0.075, 0.06, 0.045), term_c, material="chassis", coll=coll, bevel=0.004)
    lug_a_pos = (X0 + 0.075, -0.255, 0.155)
    lug_b_pos = (X0 + 0.075, -0.205, 0.155)
    add_cylinder("lug_post_a", 0.007, 0.03, lug_a_pos, rot=(0, math.pi / 2, 0), material="brass", coll=coll)
    add_cylinder("lug_post_b", 0.007, 0.03, lug_b_pos, rot=(0, math.pi / 2, 0), material="brass", coll=coll)
    add_tube_curve("part_polarity-jumper",
                    [lug_a_pos, (X0 + 0.09, -0.23, 0.17), lug_b_pos],
                    0.004, lug_a_pos, "rubber", coll)

    guide1_c = (X0 + 0.05, 0.02, 0.269)
    guide2_c = (X0 + 0.045, 0.155, 0.207)
    return {
        "spool_c": spool_c, "drive_c": drive_c, "tension_c": tension_c,
        "term_c": term_c, "lug_a": lug_a_pos, "lug_b": lug_b_pos,
        "guide1": guide1_c, "guide2": guide2_c,
    }


# --------------------------------------------------------------------------
# Front panel controls
# --------------------------------------------------------------------------
def build_front_panel(coll):
    result = {}

    # Vertical rhythm as fractions of the fascia (s: 0=bottom, 1=top),
    # matched to the pixel layout of the real product photo (LCD upper
    # third dominating the fascia; connector bay near the bottom):
    #   bay 0.16  |  switch/vents 0.375  |  ridge 0.46  |  knobs 0.55  |  LCD 0.78
    lcd_s, knob_s, ridge_s, switch_s, bay_s = 0.78, 0.55, 0.46, 0.375, 0.20

    # LCD screen: the focal point of the fascia, ~56% of panel width.
    lcd_c = panel_point(0.0, lcd_s, 0.006)
    lcd = add_plane("lcd_screen", 0.28, 0.193, lcd_c, rot=(FASCIA_TILT_X + math.pi / 2, 0, 0),
                     material="LCD", coll=coll)
    result["lcd_screen"] = lcd
    # LCD bezel
    add_box("lcd_bezel", (0.31, 0.005, 0.22), panel_point(0.0, lcd_s, -0.002),
            rot=(FASCIA_TILT_X, 0, 0), material="chassis", coll=coll)

    # HOME / BACK buttons, flanking the screen at the same height
    add_cylinder("btn_home", 0.017, 0.012, panel_point(-0.185, lcd_s, 0.009),
                 rot=(FASCIA_TILT_X + math.pi / 2, 0, 0), material="chassis", coll=coll, segs=14)
    add_cylinder("btn_back", 0.017, 0.012, panel_point(0.185, lcd_s, 0.009),
                 rot=(FASCIA_TILT_X + math.pi / 2, 0, 0), material="chassis", coll=coll, segs=14)

    # Knobs: left / center(larger) / right, dark knurled body + orange cap
    def knob(name, x, dia):
        c = panel_point(x, knob_s, 0.02)
        rot = (FASCIA_TILT_X + math.pi / 2, 0, 0)
        add_cylinder(name + "_body", dia / 2, 0.026, c, rot=rot, material="chassis", coll=coll, segs=16)
        cap_c = panel_point(x, knob_s, 0.02 + 0.014)
        add_cylinder(name, dia / 2 * 0.68, 0.007, cap_c, rot=rot, material="orange", coll=coll, segs=16)
        return c

    result["knob_left"] = knob("part_knob-left", -0.115, 0.05)
    result["knob_center"] = knob("part_knob-center", 0.0, 0.066)
    result["knob_right"] = knob("part_knob-right", 0.115, 0.05)

    # VULCAN wordmark: heavy italic caps on a slim mid-band ridge, with a
    # swoosh underline bar for the bold-branding look from the reference.
    ridge_s = 0.46
    ridge_c = panel_point(0.0, ridge_s, 0.002)
    add_box("mid_ridge", (0.30, 0.006, 0.02), ridge_c,
            rot=(FASCIA_TILT_X, 0, 0), material="chassis", coll=coll)
    wm_c = panel_point(0.0, ridge_s, 0.008)
    wm = add_text("wordmark_vulcan", "VULCAN", 0.018, wm_c,
                   (math.pi / 2 + FASCIA_TILT_X, 0, 0), "white", coll, extrude=0.0014, shear=0.32)
    add_tube_curve("wordmark_vulcan_swoosh",
                    [panel_point(-0.07, ridge_s - 0.028, 0.008),
                     panel_point(0.0, ridge_s - 0.033, 0.008),
                     panel_point(0.07, ridge_s - 0.026, 0.008)],
                    0.0025, panel_point(-0.07, ridge_s - 0.028, 0.008), "white", coll)

    # Power switch (vertical rocker) + oval blank recess + louver vent block
    sw_c = panel_point(-0.02, switch_s, 0.012)
    add_box("switch_bezel", (0.05, 0.008, 0.06), panel_point(-0.02, switch_s, 0.004),
            rot=(FASCIA_TILT_X, 0, 0), material="chassis", coll=coll, bevel=0.003)
    add_box("part_power-switch", (0.03, 0.012, 0.038), sw_c,
            rot=(FASCIA_TILT_X, 0, 0), material="chassis", coll=coll)
    add_cylinder("blank_oval", 0.024, 0.006, panel_point(-0.13, switch_s, 0.003),
                 rot=(FASCIA_TILT_X + math.pi / 2, 0, 0), material="chassis", coll=coll, segs=16)
    for i in range(6):
        add_box(f"vent_slat_{i}", (0.11, 0.006, 0.007), panel_point(0.115, switch_s - 0.10 + i * 0.032, 0.006),
                rot=(FASCIA_TILT_X - math.radians(25), 0, 0), material="chassis", coll=coll)
    result["switch_c"] = sw_c

    # Connector bay (recessed): gun bulkhead (left, larger Euro-style), DINSE-
    # (mid), DINSE+ (right). Rings sit PROUD of the recess mouth (not buried
    # in shadow) so the brass reads clearly at a glance, per reference photo.
    gun_c = panel_point(-0.13, bay_s, 0.006)
    neg_c = panel_point(0.0, bay_s, 0.006)
    pos_c = panel_point(0.13, bay_s, 0.006)
    rot = (FASCIA_TILT_X + math.pi / 2, 0, 0)
    add_box("connector_bay", (0.42, 0.03, 0.16), panel_point(0.0, bay_s, -0.02),
            rot=(FASCIA_TILT_X, 0, 0), material="panel", coll=coll)

    def dinse_socket(name, c, r):
        add_cylinder(name + "_surround", r * 1.3, 0.012, (c[0], c[1] - 0.006, c[2]), rot=rot,
                     material="chassis", coll=coll, segs=22)
        add_cylinder(name + "_ring", r, 0.03, c, rot=rot, material="brass", coll=coll, segs=22)
        add_cylinder(name + "_bore", r * 0.58, 0.02, (c[0], c[1] + 0.012, c[2]), rot=rot,
                     material="chassis", coll=coll, segs=22)
        # bayonet notch
        add_box(name + "_notch", (0.009, 0.014, r * 0.4), (c[0] + r * 0.8, c[1], c[2] + r * 0.8),
                rot=rot, material="brass", coll=coll)

    dinse_socket("socket_neg", neg_c, 0.045)
    dinse_socket("socket_pos", pos_c, 0.045)
    add_cylinder("socket_gun_surround", 0.075, 0.012, (gun_c[0], gun_c[1] - 0.006, gun_c[2]), rot=rot,
                 material="chassis", coll=coll, segs=24)
    add_cylinder("socket_gun_ring", 0.058, 0.032, gun_c, rot=rot, material="brass", coll=coll, segs=24)
    add_cylinder("socket_gun_bore", 0.034, 0.02, (gun_c[0], gun_c[1] + 0.014, gun_c[2]), rot=rot,
                 material="chassis", coll=coll, segs=24)

    # 4 panel corner screws (cheap fidelity detail)
    for sx, ss in ((-0.19, 0.94), (0.19, 0.94), (-0.19, 0.05), (0.19, 0.05)):
        add_cylinder(f"panel_screw_{sx}_{ss}", 0.006, 0.006, panel_point(sx, ss, 0.004),
                     rot=rot, material="aluminum", coll=coll, segs=8)

    result["gun_c"] = gun_c
    result["neg_c"] = neg_c
    result["pos_c"] = pos_c
    result["rot"] = rot
    return result


def build_handle(coll):
    # Distinct corner bumpers (chunky rounded blocks) at all 4 base corners;
    # the roll-cage tube feet land on top of these rather than merging
    # straight into the body, matching the reference's 3-part clamshell look.
    bumper_h = 0.11
    for bx, by, name in ((X0 + 0.02, -0.31, "fl"), (X1 - 0.02, -0.31, "fr"),
                         (X0 + 0.02, 0.31, "rl"), (X1 - 0.02, 0.31, "rr")):
        add_box(f"corner_bumper_{name}", (0.05, 0.075, bumper_h), (bx, by, bumper_h / 2),
                material="chassis", coll=coll, bevel=0.012)

    # Roll-cage tubes: ~40% thinner than the first pass, feet seated on the
    # bumpers rather than the raw body surface.
    tube_r = 0.0095
    y0, y1 = -0.15, 0.15
    foot_z = bumper_h - 0.015
    for side in (X0 + 0.02, X1 - 0.02):
        pts = [
            (side, -0.31, foot_z),
            (side, -0.20, HANDLE_TOP - 0.02),
            (side, y0, HANDLE_TOP),
            (side, y1, HANDLE_TOP),
            (side, 0.20, HANDLE_TOP - 0.02),
            (side, 0.31, foot_z),
        ]
        add_tube_curve(f"handle_rail_{'L' if side < 0 else 'R'}", pts, tube_r, pts[0], "chassis", coll)
    add_tube_curve("handle_grip", [(X0 + 0.02, 0, HANDLE_TOP), (X1 - 0.02, 0, HANDLE_TOP)],
                    tube_r, (X0 + 0.02, 0, HANDLE_TOP), "chassis", coll)


def build_rear(coll):
    gas_c = (0.0, V4[0] + 0.001, 0.20)
    add_cylinder("gas_inlet_fitting", 0.014, 0.035, gas_c, rot=(math.pi / 2, 0, 0),
                 material="brass", coll=coll, segs=14)
    return gas_c


def build_torch_and_connectors(coll):
    result = {}

    # torch: handle body + neck + nozzle + contact tip, parked bottom-right
    torch_root = (0.17, 0.14, 0.028)
    add_box("part_torch-body", (0.032, 0.16, 0.032), torch_root, rot=(0, 0, math.radians(8)),
            material="rubber", coll=coll, bevel=0.008)
    neck_c = (torch_root[0] + 0.02, torch_root[1] + 0.11, torch_root[2] + 0.01)
    add_cylinder("torch_neck", 0.011, 0.07, neck_c, rot=(math.radians(75), 0, 0),
                 material="chassis", coll=coll, segs=12)
    tip_base = (neck_c[0] + 0.006, neck_c[1] + 0.07, neck_c[2] + 0.01)
    add_cone("part_nozzle", 0.013, 0.009, 0.04, tip_base, rot=(math.radians(75), 0, 0),
              material="aluminum", coll=coll)
    tip_end = (tip_base[0] + 0.002, tip_base[1] + 0.045, tip_base[2] + 0.006)
    add_cylinder("part_contact-tip", 0.0025, 0.018, tip_end, rot=(math.radians(75), 0, 0),
                 material="brass", coll=coll, segs=8)

    result["torch_root"] = torch_root

    # parked DINSE connectors (ground / electrode / gun), each a brass plug
    # with a short curved cable stub, parked front-right on the floor.
    def connector(name, loc, rot, target_dir):
        plug = add_cylinder(name, 0.024, 0.05, loc, rot=rot, material="brass", coll=coll, segs=16)
        cable_end = (loc[0] + target_dir[0], loc[1] + target_dir[1], loc[2] + target_dir[2])
        add_tube_curve(name + "_cable",
                        [loc, ((loc[0] + cable_end[0]) / 2, (loc[1] + cable_end[1]) / 2, loc[2] + 0.03),
                         cable_end], 0.009, loc, "rubber", coll)
        return plug

    gnd_loc = (0.13, -0.27, 0.026)
    ele_loc = (0.19, -0.24, 0.026)
    gun_loc = (0.09, -0.24, 0.03)
    connector("part_connector-ground", gnd_loc, (math.pi / 2, 0, 0), (0.05, 0.08, 0))
    connector("part_connector-electrode", ele_loc, (math.pi / 2, 0, 0), (0.06, 0.07, 0))
    plug_gun = add_box("part_connector-gun", (0.03, 0.05, 0.03), gun_loc, rot=(0, 0, 0),
                        material="brass", coll=coll, bevel=0.004)
    add_tube_curve("part_connector-gun_cable", [gun_loc, (gun_loc[0] - 0.02, gun_loc[1] + 0.09, gun_loc[2] + 0.03),
                    (gun_loc[0] - 0.01, gun_loc[1] + 0.16, gun_loc[2] + 0.01)], 0.009, gun_loc, "rubber", coll)

    result["gnd_loc"] = gnd_loc
    result["ele_loc"] = ele_loc
    result["gun_loc"] = gun_loc
    return result


# --------------------------------------------------------------------------
# Empties: hotspots, seats, homes, lugs, wirepath
# --------------------------------------------------------------------------
def build_empties(coll, panel, bay, connectors, gas_c):
    rot = panel["rot"]

    add_empty("hotspot_socket-positive", panel["pos_c"], coll)
    add_empty("hotspot_socket-negative", panel["neg_c"], coll)
    add_empty("hotspot_polarity-terminals", bay["term_c"], coll)
    add_empty("hotspot_wire-feed", bay["drive_c"], coll)
    add_empty("hotspot_tension-knob", bay["tension_c"], coll)
    add_empty("hotspot_spool", bay["spool_c"], coll)
    add_empty("hotspot_front-panel", panel_point(0.0, 0.87, 0.05), coll)
    add_empty("hotspot_power-switch", panel["switch_c"], coll)
    add_empty("hotspot_gas-inlet", gas_c, coll)

    # seats: fully-seated plug transforms, inset along the socket axis
    add_empty("seat_socket-positive", panel_point(0.09, 0.13, -0.03), coll, rot=rot)
    add_empty("seat_socket-negative", panel_point(0.0, 0.13, -0.03), coll, rot=rot)
    add_empty("seat_gun-bulkhead", panel_point(-0.09, 0.13, -0.02), coll, rot=rot)

    add_empty("home_connector-ground", connectors["gnd_loc"], coll, rot=(math.pi / 2, 0, 0))
    add_empty("home_connector-electrode", connectors["ele_loc"], coll, rot=(math.pi / 2, 0, 0))
    add_empty("home_connector-gun", connectors["gun_loc"], coll)

    add_empty("lug_a", bay["lug_a"], coll)
    add_empty("lug_b", bay["lug_b"], coll)

    wp = [
        bay["spool_c"],
        bay["guide1"],
        bay["guide2"],
        (bay["drive_c"][0] - 0.03, bay["drive_c"][1] - 0.02, bay["drive_c"][2]),
        (bay["drive_c"][0] + 0.03, bay["drive_c"][1] + 0.03, bay["drive_c"][2]),
        panel_point(-0.09, 0.13, -0.06),
    ]
    for i, p in enumerate(wp):
        add_empty(f"wirepath_{i}", p, coll)


# --------------------------------------------------------------------------
# Contract assertion + budget checks
# --------------------------------------------------------------------------
ASSERT_NAMES = [
    "hotspot_socket-positive", "hotspot_socket-negative", "hotspot_polarity-terminals",
    "hotspot_wire-feed", "hotspot_tension-knob", "hotspot_spool", "hotspot_front-panel",
    "hotspot_power-switch", "hotspot_gas-inlet",
    "part_connector-ground", "part_connector-electrode", "part_connector-gun",
    "part_nozzle", "part_contact-tip", "part_torch-body",
    "part_knob-left", "part_knob-right", "part_tension-knob", "part_power-switch",
    "part_side-panel", "part_polarity-jumper", "part_spool",
    "seat_socket-positive", "seat_socket-negative", "seat_gun-bulkhead",
    "home_connector-ground", "home_connector-electrode", "home_connector-gun",
    "lug_a", "lug_b",
    "wirepath_0", "wirepath_1", "wirepath_2", "wirepath_3", "wirepath_4", "wirepath_5",
    "lcd_screen",
]

TRI_BUDGET = 80000
SIZE_BUDGET = 4 * 1024 * 1024


def assert_contract():
    names = set(bpy.data.objects.keys())
    missing = [n for n in ASSERT_NAMES if n not in names]
    if missing:
        raise AssertionError(f"CONTRACT VIOLATION - missing nodes: {missing}")
    lcd = bpy.data.objects["lcd_screen"]
    if not lcd.data.materials or lcd.data.materials[0].name != "LCD":
        raise AssertionError("lcd_screen must use material named exactly 'LCD'")
    print(f"ASSERT OK: all {len(ASSERT_NAMES)} contract nodes present.")
    for n in ASSERT_NAMES:
        print(f"  ok: {n}")


def tri_count():
    total = 0
    for ob in bpy.data.objects:
        if ob.type == 'MESH' and not ob.hide_render:
            me = ob.data
            me.calc_loop_triangles()
            total += len(me.loop_triangles)
    return total


# --------------------------------------------------------------------------
# Export
# --------------------------------------------------------------------------
def export_glb():
    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in bpy.data.objects:
        ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials='EXPORT',
        export_lights=False,
        export_cameras=False,
        export_draco_mesh_compression_enable=False,
    )
    size = os.path.getsize(GLB_OUT)
    print(f"EXPORTED {GLB_OUT} ({size/1024:.1f} KB)")
    if size > SIZE_BUDGET:
        raise AssertionError(f"GLB exceeds 4MB budget: {size} bytes")
    return size


# --------------------------------------------------------------------------
# Turntable verification renders (temporary lights/camera; never exported)
# --------------------------------------------------------------------------
def render_turntable():
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_EEVEE'
    scn.render.resolution_x = 800
    scn.render.resolution_y = 800
    scn.render.film_transparent = False
    # Standard view transform: AgX heavily desaturates the saturated orange
    # accent color; three.js won't apply Blender's tonemap either, so
    # Standard is the honest preview of what the exported GLB will look like.
    scn.view_settings.view_transform = 'Standard'
    scn.view_settings.look = 'None'
    scn.world = bpy.data.worlds.new("StudioWorld")
    scn.world.use_nodes = True
    bg = scn.world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.9, 0.9, 0.92, 1.0)
    bg.inputs[1].default_value = 0.5

    sun = bpy.data.lights.new("Sun", 'SUN')
    sun.energy = 2.0
    sun_ob = bpy.data.objects.new("Sun", sun)
    sun_ob.rotation_euler = (math.radians(55), 0, math.radians(35))
    scn.collection.objects.link(sun_ob)

    area = bpy.data.lights.new("Fill", 'AREA')
    area.energy = 40
    area.size = 1.2
    area_ob = bpy.data.objects.new("Fill", area)
    area_ob.location = (-1.0, -0.8, 0.9)
    area_ob.rotation_euler = (math.radians(60), 0, math.radians(-40))
    scn.collection.objects.link(area_ob)

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 45
    cam = bpy.data.objects.new("Cam", cam_data)
    scn.collection.objects.link(cam)
    scn.camera = cam

    target = Vector((0, 0, 0.33))

    def look_at(cam_ob, target_pt):
        direction = target_pt - cam_ob.location
        cam_ob.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    os.makedirs(RENDER_DIR, exist_ok=True)
    views = {
        "front": Vector((0, -1.5, 0.38)),
        "front_left_3q": Vector((-1.15, -1.15, 0.42)),
        "left_open_door": Vector((-1.35, -0.55, 0.4)),
        "rear": Vector((0, 1.5, 0.38)),
        "top": Vector((0.0001, -0.6, 1.55)),
        "front_panel_closeup": Vector((0, -1.05, 0.30)),
    }
    view_targets = {
        "left_open_door": Vector((X0, 0.0, 0.28)),
        "front_panel_closeup": Vector((0, 0, 0.30)),
    }

    door = bpy.data.objects.get("part_side-panel")
    closed_rot = door.rotation_euler.copy() if door else None
    open_rot = (0, 0, math.radians(70))

    for view_name, pos in views.items():
        if door:
            door.rotation_euler = open_rot if view_name == "left_open_door" else closed_rot
        cam.location = pos
        cam_data.lens = 32 if view_name == "front_panel_closeup" else 42
        look_at(cam, view_targets.get(view_name, target))
        scn.render.filepath = os.path.join(RENDER_DIR, f"{view_name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"RENDERED {scn.render.filepath}")

    if door and closed_rot:
        door.rotation_euler = closed_rot


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def main():
    reset_scene()
    build_materials()
    root = make_collection(MAIN_COLL)

    build_chassis(root)
    build_right_side_wrap(root)
    build_side_door(root)
    bay = build_interior_bay(root)
    panel = build_front_panel(root)
    build_handle(root)
    gas_c = build_rear(root)
    connectors = build_torch_and_connectors(root)
    build_empties(root, panel, bay, connectors, gas_c)

    assert_contract()
    tris = tri_count()
    print(f"TRI COUNT: {tris}")
    if tris > TRI_BUDGET:
        raise AssertionError(f"Tri budget exceeded: {tris} > {TRI_BUDGET}")

    export_glb()

    if RENDER:
        render_turntable()

    print("BUILD COMPLETE")


if __name__ == "__main__":
    main()
