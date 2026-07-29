// ═══════════════════════════════════════════════════════════
//  THREE.JS RENDERER — 3D scene only
//
//  Coordinate bridge:
//    Game world uses +Z forward (left-handed).
//    Three.js camera uses -Z forward (right-handed).
//    _sceneRoot has scale.z = -1: scene objects placed at
//      game (x, y, z) → world (x, y, -z).
//    Camera position: world (x, y, -z) to match scene Z-flip.
//    Camera quaternion: {w, x, -y, z} — negating only Y component
//      (M*q*M, M=diag(1,1,-1)) fixes yaw while preserving pitch/roll.
//    Star field is in _scene (not sceneRoot) with Z negated
//    in its geometry so it distributes correctly around the camera.
// ═══════════════════════════════════════════════════════════

let _renderer, _scene, _sceneRoot, _camera, _sun, _reflectionTarget;

// Scene object groups (rebuilt per system, live in _sceneRoot)
let _stationGroup, _pBaseGroup, _planetGroup, _lzGroup, _asteroidGroup;
let _launchZoneObj = null;
let _starField = null;

// NPC mesh tracking: entity object → THREE.Mesh (non-capital ships only)
const _npcMeshes = new Map();

// Capital ship component groups: entity → { group: THREE.Group, compMeshes: [{mesh, destroyed}] }
const _capCompGroups = new Map();
// Drifting destroyed component debris: [{mesh, vel, angVel, life}]
const _capDebris = [];

// Cargo box mesh tracking: box object → THREE.Mesh
const _cargoMeshes = new Map();
// 10% of freighter length: scaleM(M_FREIGHT, 8) → Z-extent 4.0 × 8 = 32 → 3.2
const _CARGO_BOX_SIZE = 3.2;

// Bullet point cloud
const MAX_BULLETS = 300;
let _bulletPositions, _bulletColors, _bulletGeo, _bulletPoints;

// Particle point cloud
const MAX_PARTS = 1500;
let _partPositions, _partColors, _partGeo, _partPoints;

// Material cache (color string → MeshStandardMaterial)
const _meshMatCache = {};
function _meshMat(col) {
  if (!_meshMatCache[col]) {
    const c = new THREE.Color(col);
    _meshMatCache[col] = new THREE.MeshStandardMaterial({
      color: c,
      emissive: c.clone().multiplyScalar(0.10),
      metalness: 0.65,
      roughness: 0.40,
      envMapIntensity: 1.25,
    });
  }
  return _meshMatCache[col];
}

// Color cache (for bullets/particles)
const _colCache = {};
function _col(str) {
  if (!_colCache[str]) _colCache[str] = new THREE.Color(str);
  return _colCache[str];
}

// Build a convex hull BufferGeometry from a flat vert array [[x,y,z], ...].
// Brute-force O(n³) — fine for these models (≤ 21 verts).
// No external addons required.
function _convexHullGeo(verts) {
  const n = verts.length;

  // Centroid
  let cx = 0, cy = 0, cz = 0;
  for (const v of verts) { cx += v[0]; cy += v[1]; cz += v[2]; }
  cx /= n; cy /= n; cz /= n;

  const positions = [];

  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const a = verts[i], b = verts[j], c = verts[k];
        // Edge vectors
        const abx = b[0]-a[0], aby = b[1]-a[1], abz = b[2]-a[2];
        const acx = c[0]-a[0], acy = c[1]-a[1], acz = c[2]-a[2];
        // Face normal = ab × ac
        const nx = aby*acz - abz*acy;
        const ny = abz*acx - abx*acz;
        const nz = abx*acy - aby*acx;
        if (nx*nx + ny*ny + nz*nz < 1e-10) continue; // degenerate

        // dc > 0 → normal points outward from centroid; < 0 → inward
        const dc = nx*(a[0]-cx) + ny*(a[1]-cy) + nz*(a[2]-cz);
        if (Math.abs(dc) < 1e-8) continue; // centroid on plane — skip

        // Hull face: all other verts must be on the centroid's side
        let isFace = true;
        for (let m = 0; m < n; m++) {
          if (m === i || m === j || m === k) continue;
          const dm = nx*(verts[m][0]-a[0]) + ny*(verts[m][1]-a[1]) + nz*(verts[m][2]-a[2]);
          // dm must have opposite sign to dc (inward side) or be near-zero (on plane)
          if (dc > 0 && dm >  1e-6) { isFace = false; break; }
          if (dc < 0 && dm < -1e-6) { isFace = false; break; }
        }
        if (!isFace) continue;

        // Emit triangle; flip winding if normal was pointing inward
        if (dc > 0) {
          positions.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]);
        } else {
          positions.push(a[0],a[1],a[2], c[0],c[1],c[2], b[0],b[1],b[2]);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

// Convert {verts} model to a solid Mesh.
// The {verts, edges} data in data-models.js is unchanged and
// continues to be used by canvas.js for MFD/radar wireframes.
// Box-projected UVs for hull geometry. Convex hulls carry no UVs, so the plating
// map had nothing to sample. Each triangle is projected along its dominant normal
// axis, which is cheap, seam-free for panel detail, and keeps plate size constant
// in world units regardless of how big the object is.
const _HULL_UV_SCALE = 1 / 26;
function _boxUVs(geo, scale) {
  const pa = geo.getAttribute('position');
  const uv = new Float32Array(pa.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t + 2 < pa.count; t += 3) {
    a.fromBufferAttribute(pa, t);
    b.fromBufferAttribute(pa, t + 1);
    c.fromBufferAttribute(pa, t + 2);
    ab.subVectors(b, a); ac.subVectors(c, a); n.crossVectors(ab, ac);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    let i0, i1;
    if (ax >= ay && ax >= az)      { i0 = 2; i1 = 1; }   // dominant X → project ZY
    else if (ay >= az)             { i0 = 0; i1 = 2; }   // dominant Y → project XZ
    else                           { i0 = 0; i1 = 1; }   // dominant Z → project XY
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : (k === 1 ? b : c);
      const comp = [v.x, v.y, v.z];
      uv[(t + k) * 2]     = comp[i0] * scale;
      uv[(t + k) * 2 + 1] = comp[i1] * scale;
    }
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}

// Per-face tone, baked into vertex colours so it costs no extra draw call and no
// extra material. Upward faces catch more light and a small positional hash varies
// neighbouring plates, which stops a faceted hull reading as one moulded piece.
function _faceTones(geo, lo, hi) {
  const pa = geo.getAttribute('position');
  const cols = new Float32Array(pa.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t + 2 < pa.count; t += 3) {
    a.fromBufferAttribute(pa, t);
    b.fromBufferAttribute(pa, t + 1);
    c.fromBufferAttribute(pa, t + 2);
    ab.subVectors(b, a); ac.subVectors(c, a); n.crossVectors(ab, ac).normalize();
    const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
    // Deterministic hash so a given hull always looks the same.
    const h = Math.abs(Math.sin(cx * 12.9898 + cy * 78.233 + cz * 37.719) * 43758.5453) % 1;
    const up = 0.5 + 0.5 * n.y;
    const tone = lo + (hi - lo) * (0.55 * up + 0.45 * h);
    for (let k = 0; k < 3; k++) {
      cols[(t + k) * 3] = tone; cols[(t + k) * 3 + 1] = tone; cols[(t + k) * 3 + 2] = tone;
    }
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
}

// `kind` selects the plating dialect: 'ship' by default, 'station' for fixed
// structures such as pirate bases and the launch zone.
function _modelToMesh(model, col, kind) {
  const geo = _convexHullGeo(model.verts);
  _boxUVs(geo, _HULL_UV_SCALE);
  _faceTones(geo, 0.74, 1.10);
  return new THREE.Mesh(geo, _hullMat(col, kind || 'ship'));
}

// Small native-Three reflection studio. It gives metal hulls readable cool/warm
// highlights without adding image assets or another Three.js addon/runtime.
function _buildReflectionEnvironment() {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x02050d);
  const panels = [
    { pos:[ 12, 10,-16], size:[10,10], col:0xffb36b, power:4.0 },
    { pos:[-16,  2,  8], size:[18,12], col:0x5d8dff, power:2.2 },
    { pos:[  0,-12, 12], size:[14, 8], col:0x36ffd2, power:1.4 },
  ];

  panels.forEach(p => {
    const geo = new THREE.PlaneGeometry(p.size[0], p.size[1]);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(p.col).multiplyScalar(p.power),
      side: THREE.DoubleSide,
    });
    const panel = new THREE.Mesh(geo, mat);
    panel.position.set(...p.pos);
    panel.lookAt(0, 0, 0);
    envScene.add(panel);
  });

  const pmrem = new THREE.PMREMGenerator(_renderer);
  pmrem.compileCubemapShader();
  _reflectionTarget = pmrem.fromScene(envScene, 0.03, 0.1, 100);
  pmrem.dispose();
  envScene.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  return _reflectionTarget.texture;
}

// ── GEOMETRY MERGE ───────────────────────────────────────────
// BufferGeometryUtils lives in the module build, which this file does not load, so
// merging is done by hand. Worth the ~30 lines: a station assembled from a dozen
// primitives would otherwise cost a dozen draw calls each, and the V-001 audit
// already rejected a change for taking the scene from 62 to 95.
// Consumes the input geometries — they are disposed here.
// Carries uv through (so a panel texture has something to sample) and bakes an
// optional per-part `tint` into a vertex-colour attribute. The tint is what stops a
// merged station reading as one moulded lump: parts can differ in tone and
// saturation without costing extra draw calls or extra materials.
// `uvScale` repeats the panel texture per part so plate size stays roughly even
// across pieces of very different dimensions.
function _mergeGeos(parts) {
  const src = parts.map(p => ({
    geo: p.geo.index ? p.geo.toNonIndexed() : p.geo,
    owned: !!p.geo.index,
    orig: p.geo,
    mat: p.mat,
    tint: p.tint || [1, 1, 1],
    uvScale: p.uvScale || 1,
  }));
  let total = 0;
  src.forEach(s => { total += s.geo.getAttribute('position').count; });

  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const cols = new Float32Array(total * 3);
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  let o = 0;

  src.forEach(s => {
    const pa = s.geo.getAttribute('position');
    const na = s.geo.getAttribute('normal');
    const ua = s.geo.getAttribute('uv');
    nm.getNormalMatrix(s.mat);
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(s.mat);
      pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
      n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      nrm[o * 3] = n.x; nrm[o * 3 + 1] = n.y; nrm[o * 3 + 2] = n.z;
      if (ua) { uvs[o * 2] = ua.getX(i) * s.uvScale; uvs[o * 2 + 1] = ua.getY(i) * s.uvScale; }
      cols[o * 3] = s.tint[0]; cols[o * 3 + 1] = s.tint[1]; cols[o * 3 + 2] = s.tint[2];
      o++;
    }
    if (s.owned) s.geo.dispose();
    s.orig.dispose();
  });

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return out;
}

// Panel/plating map for hull surfaces. Deliberately near-greyscale: it multiplies
// the faction colour rather than replacing it, so plating breaks up the monochrome
// without shifting hue — the identity-colour failure V-001 was remediated for.
// Two plating dialects. Station architecture is big plate, wide seam, hazard
// striping. Ship hulls are tighter: small plates, fine seams and stringer lines
// running along the hull, which at ship scale is what separates "vehicle" from
// "building" even before you register the silhouette.
const _PLATING = {
  station: { plates: 130, pw: [24, 108], ph: [18, 84], seam: 64, stripes: 7, blocks: 26,
             base: '#dcdcdc', plateLo: 186, plateRange: 69, stringers: 0 },
  ship:    { plates: 210, pw: [8, 34],   ph: [7, 26],  seam: 26, stripes: 3, blocks: 46,
             base: '#d6d6d6', plateLo: 178, plateRange: 76, stringers: 9 },
};

const _hullTexCache = {};
function _buildHullTexture(kind) {
  const k = _PLATING[kind] ? kind : 'station';
  if (_hullTexCache[k]) return _hullTexCache[k];
  const cfg = _PLATING[k];
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  const rnd = _seededRand('hull-plating-' + k);

  // Base plate tone, then rectangular plates at varying brightness.
  ctx.fillStyle = cfg.base;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < cfg.plates; i++) {
    const w = cfg.pw[0] + rnd() * cfg.pw[1], h = cfg.ph[0] + rnd() * cfg.ph[1];
    const x = rnd() * S, y = rnd() * S;
    const g = cfg.plateLo + Math.floor(rnd() * cfg.plateRange);
    ctx.fillStyle = `rgba(${g},${g},${g},${0.30 + rnd() * 0.45})`;
    ctx.fillRect(x, y, w, h);
  }
  // Seam grid — the strongest cue that a surface is panelled rather than painted.
  const sm = cfg.seam, half = sm / 2;
  ctx.strokeStyle = 'rgba(52,56,60,0.42)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= S; x += sm) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke(); }
  for (let y = 0; y <= S; y += sm) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(78,82,86,0.22)';
  ctx.lineWidth = 1;
  for (let x = half; x <= S; x += sm) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke(); }
  for (let y = half; y <= S; y += sm) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }

  // Stringers — long unidirectional lines. Ships only; they imply a spine and a
  // direction of travel, which is wrong on a station.
  ctx.strokeStyle = 'rgba(62,66,72,0.34)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < cfg.stringers; i++) {
    const y = rnd() * S;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
  }

  // Hazard stripes and dark service blocks for local contrast.
  for (let i = 0; i < cfg.stripes; i++) {
    const x = rnd() * S, y = rnd() * S, w = 40 + rnd() * 70, h = 8 + rnd() * 12;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() < 0.5 ? 0 : Math.PI / 2);
    ctx.fillStyle = 'rgba(70,70,74,0.65)'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(215,215,215,0.5)';
    for (let sx = 0; sx < w; sx += 12) ctx.fillRect(sx, 0, 6, h);
    ctx.restore();
  }
  for (let i = 0; i < cfg.blocks; i++) {
    const x = rnd() * S, y = rnd() * S;
    ctx.fillStyle = `rgba(74,77,82,${0.30 + rnd() * 0.34})`;
    ctx.fillRect(x, y, 6 + rnd() * 20, 6 + rnd() * 16);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = _renderer.capabilities.getMaxAnisotropy();
  _hullTexCache[k] = tex;
  return tex;
}

// Hull material per faction colour: faction hue on the material, plating in the
// map, per-part tone in vertex colours.
// Neutral framework colour shared by every station regardless of faction, so the
// faction hue reads as paint on a hull rather than as the material of the whole
// structure. Slightly blue to sit against the warm sun.
const _STATION_STEEL = '#8d969e';

// Cached per (plating dialect, colour). Ships read slightly less polished than
// station architecture, so roughness differs a little too.
const _hullMatCache = {};
function _hullMat(col, kind) {
  const k = _PLATING[kind] ? kind : 'station';
  const key = k + '|' + col;
  if (!_hullMatCache[key]) {
    const c = new THREE.Color(col);
    _hullMatCache[key] = new THREE.MeshStandardMaterial({
      color: c,
      map: _buildHullTexture(k),
      vertexColors: true,
      emissive: c.clone().multiplyScalar(0.06),
      metalness: k === 'ship' ? 0.58 : 0.62,
      roughness: k === 'ship' ? 0.46 : 0.52,
      envMapIntensity: 1.15,
    });
  }
  return _hullMatCache[key];
}

// ── PROCEDURAL STATIONS ──────────────────────────────────────
// `mkStation()` is an 8-sided drum of 18 verts, and `_convexHullGeo` then discards
// everything concave about it, so a station rendered as a faceted ball. This builds
// an actual structure instead: a spine, a habitat ring on the rotation axis, spokes,
// docking pylons and masts, plus emissive window bands so the thing reads as
// inhabited and gives the eye a sense of scale.
//
// Built around +Y because the renderer already spins stations on Y (`rAngle`), so
// the ring turns in its own plane rather than tumbling end over end.
// Outer radius stays ~105 u, well inside the 220 u landing-zone ring.
const _winMatCache = {};

function _windowMat(col) {
  if (!_winMatCache[col]) {
    // Warm light against cool hulls; deliberately not the faction colour, so
    // windows read as lit interior rather than more of the same paint.
    _winMatCache[col] = new THREE.MeshStandardMaterial({
      color: 0x1a1408,
      emissive: new THREE.Color(0xffc27a),
      emissiveIntensity: 1.6,
      roughness: 0.5,
      metalness: 0.0,
      toneMapped: true,
    });
  }
  return _winMatCache[col];
}

function _buildStationGroup(col) {
  const group = new THREE.Group();
  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

  // Two material groups rather than one. Vertex colours multiply, so a grey tint on
  // a saturated hull can only darken it — it cannot desaturate it, and the station
  // stays one hue. Genuine two-tone needs a second, neutral material, which costs
  // one extra draw call per station and is what actually breaks the monochrome.
  const hull = [], steel = [];
  const pushH = (geo, mat, tint, uvScale) =>
    hull.push({ geo, mat: mat || new THREE.Matrix4(), tint, uvScale });
  const pushS = (geo, mat, tint, uvScale) =>
    steel.push({ geo, mat: mat || new THREE.Matrix4(), tint, uvScale });

  // Within-group tone variation, on top of the two base colours.
  const PLATE  = [0.94, 0.96, 0.98];
  const ACCENT = [1.16, 1.08, 0.90];
  const FRAME  = [0.86, 0.90, 0.94];
  const DARK   = [0.46, 0.49, 0.53];

  // Faction-coloured: habitat drum, collars, ring, docking pylons.
  pushH(new THREE.CylinderGeometry(30, 30, 46, 8, 1), null, PLATE, 3);
  pushH(new THREE.CylinderGeometry(34, 26, 16, 8, 1), T(0, 30, 0), ACCENT, 2);
  pushH(new THREE.CylinderGeometry(26, 34, 16, 8, 1), T(0, -30, 0), ACCENT, 2);
  pushH(new THREE.TorusGeometry(92, 12, 8, 28),
        new THREE.Matrix4().makeRotationX(Math.PI / 2), PLATE, 6);
  pushH(new THREE.BoxGeometry(46, 12, 12), T(0, 84, 0), ACCENT, 2);
  pushH(new THREE.BoxGeometry(12, 12, 46), T(0, -84, 0), ACCENT, 2);

  // Neutral structural steel: spine, spokes, masts.
  pushS(new THREE.CylinderGeometry(15, 15, 150, 8, 1), null, FRAME, 3);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const m = new THREE.Matrix4()
      .makeRotationY(-a)
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, 46));
    pushS(new THREE.BoxGeometry(9, 9, 92), m, FRAME, 2);
  }
  pushS(new THREE.CylinderGeometry(2.5, 2.5, 54, 5), T(38, 52, 0), DARK, 1);
  pushS(new THREE.CylinderGeometry(2.5, 2.5, 54, 5), T(-38, -52, 0), DARK, 1);

  group.add(new THREE.Mesh(_mergeGeos(hull), _hullMat(col)));
  group.add(new THREE.Mesh(_mergeGeos(steel), _hullMat(_STATION_STEEL)));

  // Windows: one InstancedMesh, so the whole lit band is a single draw call.
  const winGeo = new THREE.BoxGeometry(7, 3.2, 3.2);
  const RING_WIN = 28, HUB_WIN = 8;
  const inst = new THREE.InstancedMesh(winGeo, _windowMat(col), RING_WIN + HUB_WIN);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < RING_WIN; i++) {
    const a = (i / RING_WIN) * Math.PI * 2;
    m4.makeRotationY(-a).multiply(new THREE.Matrix4().makeTranslation(0, 0, 104));
    inst.setMatrixAt(k++, m4);
  }
  for (let i = 0; i < HUB_WIN; i++) {
    const a = (i / HUB_WIN) * Math.PI * 2;
    m4.makeRotationY(-a).multiply(new THREE.Matrix4().makeTranslation(0, 6, 31));
    inst.setMatrixAt(k++, m4);
  }
  inst.instanceMatrix.needsUpdate = true;
  group.add(inst);

  return group;
}

// Deliberately NOT geometry-cached across stations. `initSceneForSystem` disposes
// station children by traversal, so a shared cached geometry would be freed out from
// under the next system load. Building per station costs two geometries each, once
// per system change, which is nothing next to that class of bug.
function _stationMesh(col) {
  return _buildStationGroup(col);
}

// ── PROCEDURAL PLANET SURFACES ───────────────────────────────
// Planets were flat single-colour spheres. These build an equirectangular albedo
// map per planet so they read as places rather than coloured balls.
//
// Two constraints shape the construction:
//   * No visible UV seam. Latitude bands are drawn as a vertical gradient, so they
//     are constant in u and cannot seam. Blobs are drawn three times (-W, 0, +W)
//     so anything crossing the wrap matches itself on the far edge.
//   * No shimmer. Features are large and low-frequency, mipmaps are on, and
//     anisotropy is set to the hardware maximum.
//
// The texture carries the planet's colour, so the material's `color` becomes white
// while `emissive` is left exactly as it was — the night side keeps its original
// lift and the terminator stays as readable as before.

// Deterministic per-planet PRNG: the same planet looks the same every run, which
// also keeps before/after captures comparable.
function _seededRand(seed) {
  let s = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) s = (Math.imul(s ^ seed.charCodeAt(i), 16777619)) >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function _buildPlanetTexture(pl) {
  const W = 1024, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const rnd = _seededRand(String(pl.name || pl.col));
  // THREE.Color holds linear-sRGB under colour management, but canvas pixels are
  // sRGB and the texture is tagged sRGB. Convert back before writing, or the value
  // gets linearised twice and every planet renders ~35% too dark.
  const base = new THREE.Color(pl.col).convertLinearToSRGB();

  const cssOf = (c, m, a) => {
    const r = Math.min(255, Math.round(c.r * 255 * m));
    const g = Math.min(255, Math.round(c.g * 255 * m));
    const b = Math.min(255, Math.round(c.b * 255 * m));
    return a == null ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
  };
  const css = (m, a) => cssOf(base, m, a);

  // Type from radius so this generalises to systems we have not authored.
  const isGas  = pl.r >= 400;
  const isMoon = pl.r <= 150;

  // Terrestrial landmasses need their own colour, not just a lighter patch of the
  // base, or a blue world reads as blue-on-blue. Blend toward a fixed green-ochre
  // rather than rotating hue: rotation by a fixed angle sends blue to magenta and
  // costs the planet its identity colour, whereas blending cannot overshoot.
  // Land colour is derived from the sea rather than fixed. A constant green-ochre
  // target reads well on Terra's saturated blue but collapses on green worlds —
  // measured land/sea hue spread was 32 on Terra against 8 on Vega Prime, i.e.
  // over-fitted to the one planet it was tuned against. Instead: pick whichever of
  // two natural land hues sits furthest from this planet's own hue, and force a
  // lightness step as well, so contrast survives even when both hues are close.
  const hsl = {};
  base.getHSL(hsl);
  const hDeg = hsl.h * 360;
  const arc = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const LAND_HUES = [35, 100];   // ochre/desert, and vegetation green
  const landHue = arc(hDeg, LAND_HUES[0]) >= arc(hDeg, LAND_HUES[1]) ? LAND_HUES[0] : LAND_HUES[1];
  // Saturation and lightness are NOT inherited from the sea. Deriving them meant a
  // pale or desaturated world produced equally pale land, which is why the first
  // attempt at this fix left Vega Prime unchanged and made Sirius II worse. A fixed
  // saturation gives the hue something to actually register with, and the lightness
  // step is forced away from the sea — lighter on dark worlds, darker on pale ones —
  // so contrast holds even where the two hues end up close.
  const landL = hsl.l > 0.62 ? Math.max(0.28, hsl.l - 0.26) : Math.min(0.74, hsl.l + 0.26);
  const land = new THREE.Color().setHSL(landHue / 360, 0.42, landL);
  // Terrestrial water is darkened so land reads against it. Without this the two
  // sit at similar luminance and the coastline disappears under the cloud deck.
  const seaMul = (pl.r > 150 && pl.r < 400) ? 0.80 : 1.0;

  // Latitude banding — a vertical gradient, therefore seamless in u by construction.
  const stops = isGas ? 22 : 10;
  const amp   = isGas ? 0.34 : (isMoon ? 0.14 : 0.22);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  for (let i = 0; i <= stops; i++) {
    const t = i / stops;
    // Slight limb darkening toward both poles keeps the sphere reading as round.
    const polar = 1 - 0.14 * Math.pow(Math.abs(t * 2 - 1), 2.2);
    grad.addColorStop(t, css((1 + (rnd() - 0.5) * 2 * amp) * polar * seaMul));
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Large-scale breakup: continents, storms, or crater mottle depending on type.
  const blobs   = isGas ? 7 : (isMoon ? 34 : 14);
  const stretch = isGas ? 2.6 : 1.0;   // gas storms elongate along the bands
  for (let i = 0; i < blobs; i++) {
    const cx = rnd() * W, cy = rnd() * H;
    const r  = isMoon ? 12 + rnd() * 30 : (isGas ? 40 + rnd() * 70 : 38 + rnd() * 92);
    const m  = isMoon ? 0.72 + rnd() * 0.42 : (isGas ? 0.70 + rnd() * 0.54 : 0.80 + rnd() * 0.45);
    // Terrestrial blobs are land; gas and moon blobs stay tonal on the base hue.
    const c  = (!isGas && !isMoon) ? land : base;
    const a0 = (!isGas && !isMoon) ? 0.92 : 0.85;
    for (const off of [-W, 0, W]) {
      ctx.save();
      ctx.translate(cx + off, cy);
      ctx.scale(stretch, 1);
      const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      // Terrestrial land holds its alpha most of the way out then drops fast, so
      // coastlines read as edges. Gas and moon features stay soft.
      const hard = (!isGas && !isMoon);
      g2.addColorStop(0, cssOf(c, m, a0));
      g2.addColorStop(hard ? 0.80 : 0.62, cssOf(c, m, a0 * (hard ? 0.78 : 0.45)));
      g2.addColorStop(1, cssOf(c, m, 0));
      ctx.fillStyle = g2;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    }
  }

  // Polar caps for terrestrial bodies only — gas giants and moons do not get them.
  if (!isGas && !isMoon) {
    for (const capTop of [true, false]) {
      const h = H * (0.07 + rnd() * 0.05);
      const cg = ctx.createLinearGradient(0, capTop ? 0 : H, 0, capTop ? h : H - h);
      cg.addColorStop(0, css(1.5, 0.7));
      cg.addColorStop(1, css(1.5, 0));
      ctx.fillStyle = cg;
      ctx.fillRect(0, capTop ? 0 : H - h, W, h);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = _renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// Cloud deck for terrestrial worlds. Kept as its own texture on its own shell so
// land, water, and cloud read as three separate layers rather than one painted
// surface — the shell sits slightly proud of the planet, so it also parallaxes
// against the terrain at the limb.
function _buildCloudTexture(pl) {
  const W = 1024, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const rnd = _seededRand('cloud:' + String(pl.name || pl.col));

  // Clouds streak along latitudes, so blobs are wider than tall. Drawn at -W, 0
  // and +W for the same seam reason as the surface map.
  // Deliberately sparse. A dense deck blankets the surface and destroys exactly the
  // land/water separation the layer is meant to sit above; discrete systems over
  // visible ground read as three layers, a blanket reads as one hazy ball.
  const puffs = 24;
  for (let i = 0; i < puffs; i++) {
    const cx = rnd() * W;
    // Bias away from the poles — equatorial and mid-latitude bands, not caps.
    const cy = H * (0.12 + rnd() * 0.76);
    const r  = 18 + rnd() * 46;
    const a  = 0.14 + rnd() * 0.30;
    const wide = 1.8 + rnd() * 1.7;
    for (const off of [-W, 0, W]) {
      ctx.save();
      ctx.translate(cx + off, cy);
      ctx.scale(wide, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.5, `rgba(255,255,255,${a * 0.45})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = _renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// Atmospheric rim halo. The previous shell was a flat 10% tint over the whole
// sphere, which reads as haze rather than atmosphere. A Fresnel term concentrates
// it at the limb instead, and weighting by the sun direction keeps the lit edge
// bright while the night edge only carries a trace — which is what actually sells
// the effect. Additive so it glows against the backdrop.
const _ATMO_VERT = `
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vCenter;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  // The shell's own origin is the planet centre, so no uniform is needed and
  // orbiting planets stay correct without per-frame updates.
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// Driven by the view ray's impact parameter — its closest approach to the planet
// centre — rather than a Fresnel term on the shell. A Fresnel rim peaks at the
// *shell's* silhouette, which puts the brightest ring at the outer edge of the
// glow with a hard cutoff: measurably backwards. Impact parameter peaks at the
// planet's own limb and decays outward, which is how an atmosphere actually reads.
const _ATMO_FRAG = `
uniform vec3 uColor;
uniform vec3 uSunDir;
uniform float uRadius;
uniform float uShell;
uniform float uFalloff;
uniform float uStrength;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vCenter;
void main() {
  vec3 rd = normalize(vWorldPos - cameraPosition);
  vec3 oc = vCenter - cameraPosition;
  float tca = dot(oc, rd);
  float impact = sqrt(max(dot(oc, oc) - tca * tca, 0.0));

  // Zero inside the planet disc so the near hemisphere cannot fog the surface,
  // rising to full at the limb, then decaying to nothing at the shell edge.
  float inner = smoothstep(uRadius * 0.72, uRadius * 1.02, impact);
  float outer = 1.0 - smoothstep(uRadius, uShell, impact);
  float band = inner * pow(clamp(outer, 0.0, 1.0), uFalloff);

  float day = clamp(dot(normalize(vWorldNormal), normalize(uSunDir)), 0.0, 1.0);
  float amt = band * (0.15 + 0.85 * day) * uStrength;
  gl_FragColor = vec4(uColor * amt, amt);
}`;

function _buildAtmosphereMaterial(col, strength, radius, shell) {
  // Directional light, so the sun is a direction rather than a place.
  const sd = _sun ? _sun.position.clone().normalize() : new THREE.Vector3(0, 0.12, 1).normalize();
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor:    { value: col.clone() },
      uSunDir:   { value: sd },
      uRadius:   { value: radius },
      uShell:    { value: shell },
      uFalloff:  { value: 2.8 },
      uStrength: { value: strength },
    },
    vertexShader: _ATMO_VERT,
    fragmentShader: _ATMO_FRAG,
    // FrontSide, not BackSide. On the far hemisphere the normals point away from
    // the camera, so the Fresnel term collapses to zero across the whole annulus
    // and only a razor-thin silhouette line survives — measured as invisible. The
    // near hemisphere gives rim≈0 dead centre (so it does not fog the disc) rising
    // to rim≈1 at the edge, which is the halo we actually want.
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

// Low-contrast equirectangular backdrop: enough colour variation to establish
// depth and art direction while leaving the authored star field readable.
function _buildNebulaBackground() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#01030a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'screen';

  const clouds = [
    [180,180,310, '34,82,138', 0.20],
    [390,270,250, '26,108,122',0.12],
    [650,170,330, '92,35,126', 0.15],
    [870,320,290, '24,70,128', 0.16],
    [990,120,230, '20,92,108', 0.10],
  ];
  clouds.forEach(([x,y,r,rgb,a]) => {
    const grad = ctx.createRadialGradient(x,y,0,x,y,r);
    grad.addColorStop(0, `rgba(${rgb},${a})`);
    grad.addColorStop(0.45, `rgba(${rgb},${a * 0.45})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x-r, y-r, r*2, r*2);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ── POINT SPRITES ────────────────────────────────────────────
// `THREE.Points` with no map draws hard-edged squares. Every projectile, spark and
// star in the game was therefore a literal square pixel. These are white radial
// falloffs whose alpha does the shaping; the per-point vertex colour supplies the
// hue, so one sprite serves every weapon and faction.
//   tracer — tight bright core, small halo: reads as a round bolt in flight
//   spark  — soft and wide: debris and explosion motes
//   star   — small core, gentle edge: takes the hard corners off the star field
const _SPRITE_STOPS = {
  tracer: [[0, 1], [0.20, 0.95], [0.45, 0.35], [1, 0]],
  spark:  [[0, 1], [0.30, 0.55], [0.65, 0.16], [1, 0]],
  star:   [[0, 1], [0.28, 0.75], [0.60, 0.20], [1, 0]],
};
const _spriteCache = {};
function _spriteTex(kind) {
  if (_spriteCache[kind]) return _spriteCache[kind];
  const S = 64, h = S / 2;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(h, h, 0, h, h, h);
  (_SPRITE_STOPS[kind] || _SPRITE_STOPS.spark).forEach(([t, a]) => {
    grad.addColorStop(t, `rgba(255,255,255,${a})`);
  });
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  _spriteCache[kind] = tex;
  return tex;
}

// Rock map. Panel plating would be plainly wrong here, so asteroids get their own
// dialect: broad tonal mottling, impact craters drawn as a dark floor with a lit
// rim, and fine speckle. Near-greyscale for the same reason as the hull map — it
// multiplies the rock colour rather than replacing it.
let _rockTex = null;
function _buildRockTexture() {
  if (_rockTex) return _rockTex;
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  const rnd = _seededRand('asteroid-rock');

  ctx.fillStyle = '#cfcac2';
  ctx.fillRect(0, 0, S, S);

  // Broad mottling. Drawn at -S, 0 and +S in x so the map tiles without a seam.
  for (let i = 0; i < 70; i++) {
    const cx = rnd() * S, cy = rnd() * S, r = 30 + rnd() * 120;
    const g = 150 + Math.floor(rnd() * 95);
    for (const off of [-S, 0, S]) {
      const grad = ctx.createRadialGradient(cx + off, cy, 0, cx + off, cy, r);
      grad.addColorStop(0, `rgba(${g},${g - 4},${g - 10},${0.30 + rnd() * 0.30})`);
      grad.addColorStop(1, `rgba(${g},${g - 4},${g - 10},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(cx + off - r, cy - r, r * 2, r * 2);
    }
  }

  // Craters: dark bowl, brighter rim on the lit side. The rim is what reads as a
  // crater rather than a stain.
  for (let i = 0; i < 34; i++) {
    const cx = rnd() * S, cy = rnd() * S, r = 6 + rnd() * 26;
    for (const off of [-S, 0, S]) {
      ctx.beginPath();
      ctx.arc(cx + off, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(96,92,86,${0.30 + rnd() * 0.28})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + off, cy - r * 0.14, r * 0.94, Math.PI * 1.06, Math.PI * 1.94);
      ctx.strokeStyle = 'rgba(240,236,228,0.42)';
      ctx.lineWidth = Math.max(1, r * 0.16);
      ctx.stroke();
    }
  }

  // Fine speckle for close-range texture.
  for (let i = 0; i < 900; i++) {
    const x = rnd() * S, y = rnd() * S, s = 1 + rnd() * 2.5;
    const g = rnd() < 0.5 ? 108 : 232;
    ctx.fillStyle = `rgba(${g},${g},${g},${0.10 + rnd() * 0.22})`;
    ctx.fillRect(x, y, s, s);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = _renderer.capabilities.getMaxAnisotropy();
  _rockTex = tex;
  return tex;
}

// Build a lumpy asteroid mesh with radius ast.r and color ast.col.
// 22 points distributed on a unit sphere, each scaled by ast.r * (0.7–1.0).
function _buildAsteroidMesh(ast) {
  const pts = [];
  // Golden-angle spiral for even sphere distribution
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 22; i++) {
    const y = 1 - (i / 21) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = phi * i;
    const jitter = 0.70 + Math.random() * 0.30;
    const s = ast.r * jitter;
    pts.push([Math.cos(theta) * r * s, y * s, Math.sin(theta) * r * s]);
  }
  const geo = _convexHullGeo(pts);
  // Scaled off the asteroid's own radius so a 40 u rock and a 120 u rock show
  // comparable surface detail rather than the big one looking smooth.
  _boxUVs(geo, 1 / Math.max(12, ast.r * 0.55));
  _faceTones(geo, 0.70, 1.14);
  const col = new THREE.Color(ast.col);
  // Material stays per-asteroid: the clear-asteroids loop calls material.dispose(),
  // so a shared cached material would be freed out from under the next system load.
  // The map is safe to share — dispose() on a material does not touch its textures.
  const mat = new THREE.MeshStandardMaterial({
    color: col,
    map: _buildRockTexture(),
    vertexColors: true,
    emissive: col.clone().multiplyScalar(0.03),
    roughness: 0.95,
    metalness: 0.03,
  });
  return new THREE.Mesh(geo, mat);
}

// Rotate a hex color's hue by 180° and lock lightness to ~0.58 so the
// landing zone markers always stand out against their parent station.
function _contrastHex(hex) {
  const r=parseInt(hex.slice(1,3),16)/255||0;
  const g=parseInt(hex.slice(3,5),16)/255||0;
  const b=parseInt(hex.slice(5,7),16)/255||0;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), l=(max+min)/2;
  let h=0, s=0;
  if(max!==min){
    const d=max-min;
    s=l>0.5?d/(2-max-min):d/(max+min);
    if(max===r)      h=((g-b)/d+(g<b?6:0))/6;
    else if(max===g) h=((b-r)/d+2)/6;
    else             h=((r-g)/d+4)/6;
  }
  h=(h+0.5)%1;                    // rotate 180°
  const nl=0.58, ns=Math.max(0.75,s);
  const q=nl<0.5?nl*(1+ns):nl+ns-nl*ns, pp=2*nl-q;
  function h2r(t){ t=(t+1)%1; if(t<1/6)return pp+(q-pp)*6*t; if(t<1/2)return q; if(t<2/3)return pp+(q-pp)*(2/3-t)*6; return pp; }
  return '#'+[h+1/3,h,h-1/3].map(t=>Math.round(h2r(t)*255).toString(16).padStart(2,'0')).join('');
}

// Landing-zone wireframe: LineSegments from model edges — no z-fighting,
// unique material per instance so opacity/intensity can be driven per-frame.
function _lzModelToLineSegs(model, col) {
  const positions = [];
  (model.edges || []).forEach(([i, j]) => {
    const a = model.verts[i], b = model.verts[j];
    positions.push(a[0],a[1],a[2], b[0],b[1],b[2]);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: new THREE.Color(col),
    transparent: true,
    opacity: 0.35,
  });
  return new THREE.LineSegments(geo, mat);
}

// ═══════════════════════════════════════════════════════════
//  ONE-TIME SETUP — call once before init()
// ═══════════════════════════════════════════════════════════
function initScene() {
  const canvas = document.getElementById('c');
  _renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _renderer.setSize(W, H);
  _renderer.setClearColor(0x000006, 1);
  _renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Linear preserves saturated faction colours; ACES washed the station's
  // identity green toward pale mint in the V-001 audit captures.
  _renderer.toneMapping = THREE.LinearToneMapping;
  _renderer.toneMappingExposure = 1.0;

  _scene = new THREE.Scene();
  _scene.background = _buildNebulaBackground();
  _scene.environment = _buildReflectionEnvironment();

  // Z-flip root — all game objects live here.
  // Bridges game +Z-forward to Three.js -Z-forward without touching the camera.
  _sceneRoot = new THREE.Group();
  _sceneRoot.scale.z = -1;
  _scene.add(_sceneRoot);

  // FOV matches proj() in renderer.js: Math.PI/2.5 ≈ 72°
  _camera = new THREE.PerspectiveCamera(72, W / H, 0.5, 60000);

  // Lighting — dim ambient fill + directional sun from upper-right +
  // a weak backfill so shadowed faces aren't pure black.
  _scene.add(new THREE.AmbientLight(0x223344, 1.5));

  // Sun position mirrors the 2D renderer: game world (0, 1000, -8000).
  // In Three.js world space (Z-flipped via _sceneRoot): (0, 1000, 8000).
  // Color is updated per-system in initSceneForSystem.
  _sun = new THREE.DirectionalLight(0xffd0a0, 3.0);
  _sun.position.set(0, 1000, 8000);
  _scene.add(_sun);

  const fill = new THREE.DirectionalLight(0x334466, 0.8);
  fill.position.set(-0.8, -0.4, 1.0); // lower-left backfill
  _scene.add(fill);

  // Static groups (go into sceneRoot)
  _stationGroup  = new THREE.Group(); _sceneRoot.add(_stationGroup);
  _pBaseGroup    = new THREE.Group(); _sceneRoot.add(_pBaseGroup);
  _planetGroup   = new THREE.Group(); _sceneRoot.add(_planetGroup);
  _lzGroup       = new THREE.Group(); _sceneRoot.add(_lzGroup);
  _asteroidGroup = new THREE.Group(); _sceneRoot.add(_asteroidGroup);

  // Point sprites — see _spriteTex. Without a map, THREE.Points renders hard-edged
  // squares, which is why projectiles and sparks read as pixels rather than light.
  _bulletPositions = new Float32Array(MAX_BULLETS * 3);
  _bulletColors    = new Float32Array(MAX_BULLETS * 3);
  _bulletGeo = new THREE.BufferGeometry();
  _bulletGeo.setAttribute('position', new THREE.BufferAttribute(_bulletPositions, 3).setUsage(THREE.DynamicDrawUsage));
  _bulletGeo.setAttribute('color',    new THREE.BufferAttribute(_bulletColors,    3).setUsage(THREE.DynamicDrawUsage));
  _bulletGeo.setDrawRange(0, 0);
  // Additive: weapon fire is emitted light, so it should brighten what it crosses
  // rather than occlude it. depthWrite off so overlapping bolts do not cut each other.
  _bulletPoints = new THREE.Points(_bulletGeo, new THREE.PointsMaterial({
    size: 3.4, vertexColors: true, sizeAttenuation: true,
    map: _spriteTex('tracer'), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  _bulletPoints.frustumCulled = false;
  _sceneRoot.add(_bulletPoints);

  // Particle point cloud (in sceneRoot)
  _partPositions = new Float32Array(MAX_PARTS * 3);
  _partColors    = new Float32Array(MAX_PARTS * 3);
  _partGeo = new THREE.BufferGeometry();
  _partGeo.setAttribute('position', new THREE.BufferAttribute(_partPositions, 3).setUsage(THREE.DynamicDrawUsage));
  _partGeo.setAttribute('color',    new THREE.BufferAttribute(_partColors,    3).setUsage(THREE.DynamicDrawUsage));
  _partGeo.setDrawRange(0, 0);
  _partPoints = new THREE.Points(_partGeo, new THREE.PointsMaterial({
    size: 7, vertexColors: true, sizeAttenuation: false,
    map: _spriteTex('spark'), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  _partPoints.frustumCulled = false;
  _sceneRoot.add(_partPoints);

  window.addEventListener('resize', () => {
    _renderer.setSize(W, H);
    _camera.aspect = W / H;
    _camera.updateProjectionMatrix();
  });
}

// ═══════════════════════════════════════════════════════════
//  PER-SYSTEM BUILD — call after G is ready (init / loadSystem)
// ═══════════════════════════════════════════════════════════
function initSceneForSystem(G) {
  // Update sun direction and color to match the current system's star.
  // The 2D renderer places the sun at game world (0, 1000, -8000);
  // Three.js world space flips Z → (0, 1000, 8000).
  _sun.color.set(SYS[G.sys].starCol);

  // Clear landing zones (unique materials — dispose both)
  while (_lzGroup.children.length) {
    const c = _lzGroup.children[0];
    c.geometry.dispose();
    if (c.material) c.material.dispose();
    _lzGroup.remove(c);
  }
  // Clear stations
  while (_stationGroup.children.length) {
    const c = _stationGroup.children[0];
    _disposeObj(c);
    _stationGroup.remove(c);
  }
  // Clear pirate bases
  while (_pBaseGroup.children.length) {
    const c = _pBaseGroup.children[0];
    _disposeObj(c);
    _pBaseGroup.remove(c);
  }
  // Clear planets (each planet creates its own material and albedo map — dispose both)
  while (_planetGroup.children.length) {
    const c = _planetGroup.children[0];
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (c.material.map) c.material.map.dispose();
      c.material.dispose();
    }
    _planetGroup.remove(c);
  }
  // Clear launch zone
  if (_launchZoneObj) {
    _disposeObj(_launchZoneObj);
    _sceneRoot.remove(_launchZoneObj);
    _launchZoneObj = null;
  }
  // Clear NPC meshes (non-capital, enemies array was wiped by loadSystem)
  for (const [, mesh] of _npcMeshes) {
    _disposeObj(mesh);
    _sceneRoot.remove(mesh);
  }
  _npcMeshes.clear();

  // Clear capital component groups
  for (const [, capData] of _capCompGroups) {
    _sceneRoot.remove(capData.group);
  }
  _capCompGroups.clear();

  // Clear drifting debris
  for (const d of _capDebris) {
    d.mesh.geometry.dispose();
    d.mesh.material.dispose();
    _sceneRoot.remove(d.mesh);
  }
  _capDebris.length = 0;

  // Clear cargo box meshes
  for (const [, mesh] of _cargoMeshes) {
    mesh.geometry.dispose();
    _sceneRoot.remove(mesh);
  }
  _cargoMeshes.clear();

  // Star field lives in _scene, not _sceneRoot, to avoid double Z-flip.
  _buildStarField(G);

  // Stations
  G.stations.forEach(st => {
    // Custom GLTF preferred; otherwise the procedural station structure.
    // The legacy convex hull of st.model is no longer used for the 3D view, but
    // st.model itself still drives the 2D MFD/radar wireframe in canvas.js.
    const mesh = assetsGetModel('station') || _stationMesh(st.col);
    mesh.position.set(st.pos.x, st.pos.y, st.pos.z);
    mesh.userData.entity = st;
    _stationGroup.add(mesh);
    // Landing zones — wireframe boxes with contrasting colour + beacon flash
    const lzCol = _contrastHex(st.col);
    (st.landingZones || []).forEach(lz => {
      const lzMesh = _lzModelToLineSegs(lz.model, lzCol);
      lzMesh.position.set(lz.pos.x, lz.pos.y, lz.pos.z);
      lzMesh.userData.lzRef = lz;
      lzMesh.userData.station = st;
      _lzGroup.add(lzMesh);
    });
  });

  // Pirate bases
  G.pBases.forEach(pb => {
    const mesh = assetsGetModel('pirate_base') || _modelToMesh(pb.model, pb.col, 'station');
    mesh.position.set(pb.pos.x, pb.pos.y, pb.pos.z);
    mesh.userData.entity = pb;
    _pBaseGroup.add(mesh);
  });

  // Launch zone
  if (G.launchZone) {
    _launchZoneObj = _modelToMesh(G.launchZone.model, '#50c8ff', 'station');
    _launchZoneObj.position.set(G.launchZone.pos.x, G.launchZone.pos.y, G.launchZone.pos.z);
    _launchZoneObj.userData.entity = G.launchZone;
    _sceneRoot.add(_launchZoneObj);
  }

  // Clear asteroids
  while (_asteroidGroup.children.length) {
    const c = _asteroidGroup.children[0];
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
    _asteroidGroup.remove(c);
  }

  // Planets — solid sphere with MeshStandardMaterial + atmosphere glow shell
  G.planets.forEach(pl => {
    const col = new THREE.Color(pl.col);

    const geo = new THREE.SphereGeometry(pl.r, 48, 32);
    // The albedo map carries the planet colour, so `color` goes white to avoid
    // multiplying it twice. `emissive` is unchanged so the terminator reads as before.
    const mat = new THREE.MeshStandardMaterial({
      map: _buildPlanetTexture(pl),
      color: 0xffffff,
      emissive: col.clone().multiplyScalar(0.12),
      metalness: 0.0,
      roughness: 0.85,
    });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.position.set(pl.pos.x, pl.pos.y, pl.pos.z);
    _planetGroup.add(sphere);

    // Cloud deck — terrestrial only. Gas giants are already all cloud, and an
    // airless moon should not have one.
    let cloud = null;
    if (pl.r > 150 && pl.r < 400) {
      const cloudGeo = new THREE.SphereGeometry(pl.r * 1.015, 48, 32);
      const cloudMat = new THREE.MeshStandardMaterial({
        map: _buildCloudTexture(pl),
        transparent: true,
        depthWrite: false,
        roughness: 1.0,
        metalness: 0.0,
      });
      cloud = new THREE.Mesh(cloudGeo, cloudMat);
      cloud.position.set(pl.pos.x, pl.pos.y, pl.pos.z);
      _planetGroup.add(cloud);
    }

    // Atmosphere rim — BackSide so only the annulus outside the planet shows.
    // Airless moons get a much fainter trace than worlds with real atmosphere.
    const shellR = pl.r * 1.30;
    const glowGeo = new THREE.SphereGeometry(shellR, 48, 32);
    const glow = new THREE.Mesh(glowGeo,
      _buildAtmosphereMaterial(col, pl.r <= 150 ? 0.30 : 1.20, pl.r, shellR));
    glow.position.set(pl.pos.x, pl.pos.y, pl.pos.z);
    _planetGroup.add(glow);

    // Store mesh refs on orbiting planets so drawFrame can update their position
    if (pl.orbitCenter) { pl._mesh = sphere; pl._glowMesh = glow; pl._cloudMesh = cloud; }
  });

  // Asteroids
  (G.asteroids || []).forEach(ast => {
    const mesh = _buildAsteroidMesh(ast);
    mesh.position.set(ast.pos.x, ast.pos.y, ast.pos.z);
    mesh.userData.astRef = ast;
    _asteroidGroup.add(mesh);
  });
}

function _buildStarField(G) {
  if (_starField) { _starField.geometry.dispose(); _scene.remove(_starField); }
  const positions = [], colors = [];
  G.bgStars.forEach(s => {
    // Negate Z so +Z-forward game stars appear at -Z in Three.js world (in front of camera)
    positions.push(s.dir.x * 50000, s.dir.y * 50000, -s.dir.z * 50000);
    const b = s.br * 0.75;
    colors.push(b, b, b);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
  // Stars keep normal blending. Additive here would lift them over the V-001 nebula
  // and cost the backdrop its restraint; the sprite is only here to round the corners.
  _starField = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 2.4, vertexColors: true, sizeAttenuation: false,
    map: _spriteTex('star'), transparent: true, depthWrite: false,
  }));
  // Stars live in _scene (world space), not _sceneRoot, and follow camera directly
  _scene.add(_starField);
}

// ═══════════════════════════════════════════════════════════
//  MAIN FRAME — call from loop() each tick
// ═══════════════════════════════════════════════════════════
function drawFrame(G, dt) {
  if (!G || !_renderer) return;
  const p = G.p;

  // Camera Z negated to match sceneRoot Z-flip.
  // Quaternion derivation: q_cam = (w, -x, -y, z) — see coordinate bridge comment at top.
  _camera.position.set(p.pos.x, p.pos.y, -p.pos.z);
  _camera.quaternion.set(-p.ori.x, -p.ori.y, p.ori.z, p.ori.w);

  // Star field follows camera in world space
  if (_starField) _starField.position.set(p.pos.x, p.pos.y, -p.pos.z);

  // Update station positions (orbiting) + rotation
  _stationGroup.children.forEach(mesh => {
    const st = mesh.userData.entity;
    if (st) {
      mesh.position.set(st.pos.x, st.pos.y, st.pos.z);
      mesh.rotation.y = st.rAngle || 0;
    }
  });
  _pBaseGroup.children.forEach(mesh => {
    const pb = mesh.userData.entity;
    if (pb) mesh.rotation.y = pb.rAngle || 0;
  });
  // Update orbiting planet (moon) mesh positions to match game-state pos
  G.planets?.forEach(pl => {
    if (pl._mesh) {
      pl._mesh.position.set(pl.pos.x, pl.pos.y, pl.pos.z);
      if (pl._glowMesh) pl._glowMesh.position.set(pl.pos.x, pl.pos.y, pl.pos.z);
      if (pl._cloudMesh) pl._cloudMesh.position.set(pl.pos.x, pl.pos.y, pl.pos.z);
    }
  });

  // Update asteroid positions (orbiting) + tumble rotation
  _asteroidGroup.children.forEach(mesh => {
    const ast = mesh.userData.astRef;
    if (ast) {
      mesh.position.set(ast.pos.x, ast.pos.y, ast.pos.z);
      mesh.rotation.y = ast.rAngle || 0;
      mesh.rotation.x = (ast.rAngle || 0) * 0.4;
    }
  });
  // Landing zones — show only for the nav-targeted station when within 2500u
  const _navSt = G.navTarget?.type === 'STATION'
    ? (G.stations?.find(s => s.name === G.navTarget.name) ?? null)
    : null;
  const _lzDist = _navSt
    ? Math.sqrt((G.p.pos.x-_navSt.pos.x)**2+(G.p.pos.y-_navSt.pos.y)**2+(G.p.pos.z-_navSt.pos.z)**2)
    : Infinity;
  const _lzVisible = _navSt !== null && _lzDist < 2500;
  // Smooth beacon pulse: opacity cycles 0.15 → 1.0 → 0.15 every ~2 s
  const _lzOpacity = 0.15 + 0.85 * Math.abs(Math.sin(G.time * 1.5));
  _lzGroup.children.forEach(mesh => {
    const lz = mesh.userData.lzRef;
    if (!lz) return;
    // Always sync position so it follows the orbiting station
    mesh.position.set(lz.pos.x, lz.pos.y, lz.pos.z);
    mesh.visible = _lzVisible && mesh.userData.station === _navSt;
    if (mesh.visible) {
      mesh.rotation.y = lz.rAngle || 0;
      mesh.material.opacity = _lzOpacity;
    }
  });
  if (_launchZoneObj && G.launchZone) {
    G.launchZone.rAngle = (G.launchZone.rAngle || 0) + 0.3 * (dt || 0.016);
    _launchZoneObj.rotation.y = G.launchZone.rAngle;
  }

  _syncNPCs(G);
  _syncCapitals(G);
  _syncCargos(G);
  _syncBullets(G);
  _syncParticles(G);
  _updateDebris(dt);

  _renderer.render(_scene, _camera);
}

// Dispose all geometry in an Object3D — handles both Mesh and Group.
function _disposeObj(obj) {
  obj.traverse(m => { if (m.geometry) m.geometry.dispose(); });
}

// ── NPC MESH SYNC (non-capital ships only) ──
function _syncNPCs(G) {
  const currentSet = new Set(G.enemies.filter(e => !e.isCapital));

  // Remove meshes for enemies no longer in the array
  for (const [entity, mesh] of _npcMeshes) {
    if (!currentSet.has(entity)) {
      _disposeObj(mesh);
      _sceneRoot.remove(mesh);
      _npcMeshes.delete(entity);
    }
  }

  // Create or update mesh for each active non-capital enemy
  currentSet.forEach(e => {
    if (!_npcMeshes.has(e)) {
      // Prefer a custom GLTF model; fall back to procedural convex hull.
      const obj = assetsGetModel(e.hullKey) || _modelToMesh(e.model, e.col);
      _sceneRoot.add(obj);
      _npcMeshes.set(e, obj);
    }
    const mesh = _npcMeshes.get(e);
    mesh.position.set(e.pos.x, e.pos.y, e.pos.z);
    // YXZ order: yaw (Y) applied before pitch (X), matching eRotY then eRotX
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = e.yaw   || 0;
    mesh.rotation.x = e.pitch || 0;
    mesh.visible = e.struct > 0;
  });
}

// ── CAPITAL SHIP COMPONENT SYNC ──
// Detaches a destroyed component mesh as a drifting grey debris piece.
function _spawnCompDebris(compMesh, entity) {
  // Compute component world position from entity state (game space),
  // applying YXZ Euler rotation of the ship to the component's local offset.
  const lx = compMesh.position.x, ly = compMesh.position.y, lz = compMesh.position.z;
  const cy = Math.cos(entity.yaw || 0), sy = Math.sin(entity.yaw || 0);
  const cp = Math.cos(entity.pitch || 0), sp = Math.sin(entity.pitch || 0);
  // Yaw (Y axis) rotation
  const yx = lx*cy + lz*sy, yy = ly, yz = -lx*sy + lz*cy;
  // Pitch (X axis) rotation
  const wx = yx, wy = yy*cp - yz*sp, wz = yy*sp + yz*cp;
  const worldX = entity.pos.x + wx;
  const worldY = entity.pos.y + wy;
  const worldZ = entity.pos.z + wz;

  const debrisMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    emissive: new THREE.Color(0x1a0800),  // residual heat glow
    metalness: 0.5,
    roughness: 0.7,
    transparent: true,
    opacity: 1.0,
  });
  const debrisMesh = new THREE.Mesh(compMesh.geometry, debrisMat);
  debrisMesh.position.set(worldX, worldY, worldZ);
  debrisMesh.rotation.order = 'YXZ';
  debrisMesh.rotation.y = entity.yaw   || 0;
  debrisMesh.rotation.x = entity.pitch || 0;
  _sceneRoot.add(debrisMesh);

  const kickMag = 12 + Math.random() * 22;
  const kx = Math.random()-0.5, ky = Math.random()-0.5, kz = Math.random()-0.5;
  const klen = Math.sqrt(kx*kx+ky*ky+kz*kz) || 1;
  const spinRate = 0.4 + Math.random() * 0.9;
  const srx = Math.random()-0.5, sry = Math.random()-0.5, srz = Math.random()-0.5;
  const slen = Math.sqrt(srx*srx+sry*sry+srz*srz) || 1;

  _capDebris.push({
    mesh: debrisMesh,
    vel: {
      x: (entity.vel?.x || 0) + (kx/klen) * kickMag,
      y: (entity.vel?.y || 0) + (ky/klen) * kickMag,
      z: (entity.vel?.z || 0) + (kz/klen) * kickMag,
    },
    angVel: {
      x: (srx/slen) * spinRate,
      y: (sry/slen) * spinRate,
      z: (srz/slen) * spinRate,
    },
    life: 9 + Math.random() * 5,
  });
}

function _syncCapitals(G) {
  const currentSet = new Set(G.enemies.filter(e => e.isCapital));

  // Remove groups for capitals that have been killed — detach survivors as debris
  for (const [entity, capData] of _capCompGroups) {
    if (!currentSet.has(entity)) {
      capData.compMeshes.forEach(cm => {
        if (!cm.destroyed) {
          capData.group.remove(cm.mesh);  // detach before spawning
          _spawnCompDebris(cm.mesh, entity);
        }
      });
      _sceneRoot.remove(capData.group);
      _capCompGroups.delete(entity);
    }
  }

  // Create or update component groups for each active capital
  currentSet.forEach(e => {
    const compDefs = CAP_COMPONENT_MODELS[e.capType];
    if (!compDefs) return;  // unknown type — no 3D component breakdown

    if (!_capCompGroups.has(e)) {
      const group = new THREE.Group();
      const compMeshes = compDefs.map(def => {
        const mesh = _modelToMesh({ verts: def.verts }, e.col);
        mesh.position.set(def.offset[0], def.offset[1], def.offset[2]);
        group.add(mesh);
        return { mesh, destroyed: false };
      });
      _sceneRoot.add(group);
      _capCompGroups.set(e, { group, compMeshes });
    }

    const { group, compMeshes } = _capCompGroups.get(e);
    group.position.set(e.pos.x, e.pos.y, e.pos.z);
    group.rotation.order = 'YXZ';
    group.rotation.y = e.yaw   || 0;
    group.rotation.x = e.pitch || 0;

    // Detect newly destroyed components and detach as debris
    e.components.forEach((comp, idx) => {
      const cm = compMeshes[idx];
      if (!cm || cm.destroyed) return;
      if (comp.hp <= 0) {
        cm.destroyed = true;
        _spawnCompDebris(cm.mesh, e);
        group.remove(cm.mesh);
      }
    });
  });
}

// ── DEBRIS DRIFT + FADE ──
function _updateDebris(dt) {
  for (let i = _capDebris.length - 1; i >= 0; i--) {
    const d = _capDebris[i];
    d.life -= dt;
    if (d.life <= 0) {
      d.mesh.geometry.dispose();
      d.mesh.material.dispose();
      _sceneRoot.remove(d.mesh);
      _capDebris.splice(i, 1);
      continue;
    }
    d.mesh.position.x += d.vel.x * dt;
    d.mesh.position.y += d.vel.y * dt;
    d.mesh.position.z += d.vel.z * dt;
    d.mesh.rotation.x += d.angVel.x * dt;
    d.mesh.rotation.y += d.angVel.y * dt;
    d.mesh.rotation.z += d.angVel.z * dt;
    // Fade out over the final 3 seconds
    if (d.life < 3) d.mesh.material.opacity = Math.max(0, d.life / 3);
  }
}

// ── CARGO BOX SYNC ──
function _syncCargos(G) {
  const currentSet = new Set(G.cargoBoxes);

  for (const [box, mesh] of _cargoMeshes) {
    if (!currentSet.has(box)) {
      mesh.geometry.dispose();
      _sceneRoot.remove(mesh);
      _cargoMeshes.delete(box);
    }
  }

  G.cargoBoxes.forEach(box => {
    if (!_cargoMeshes.has(box)) {
      // BoxGeometry UVs run 0–1 per face, which across a 3.2 u crate would magnify
      // the plating map to a single smear. Rebuilt non-indexed so the shared hull
      // helpers apply, with a scale tuned to crate size rather than world size.
      const geo = new THREE.BoxGeometry(_CARGO_BOX_SIZE, _CARGO_BOX_SIZE, _CARGO_BOX_SIZE)
        .toNonIndexed();
      _boxUVs(geo, 1 / 1.6);
      _faceTones(geo, 0.80, 1.12);
      const mesh = new THREE.Mesh(geo, _hullMat('#88ff44', 'ship'));
      _sceneRoot.add(mesh);
      _cargoMeshes.set(box, mesh);
    }
    const mesh = _cargoMeshes.get(box);
    mesh.position.set(box.pos.x, box.pos.y, box.pos.z);
    // Multi-axis tumble derived from the single box.angle value
    mesh.rotation.y = box.angle;
    mesh.rotation.x = box.angle * 0.7;
    mesh.rotation.z = box.angle * 0.4;
  });
}

// ── BULLET SYNC ──
function _syncBullets(G) {
  const bullets = [...G.bullets, ...G.eBullets];
  const n = Math.min(bullets.length, MAX_BULLETS);
  for (let i = 0; i < n; i++) {
    const b = bullets[i];
    _bulletPositions[i * 3]     = b.pos.x;
    _bulletPositions[i * 3 + 1] = b.pos.y;
    _bulletPositions[i * 3 + 2] = b.pos.z;
    const c = _col(b.col);
    // Fade starts at midpoint of travel; full brightness for first half
    const a = b.maxLife ? Math.min(1, b.life / b.maxLife * 2) : Math.min(1, b.life * 3);
    _bulletColors[i * 3]     = c.r * a;
    _bulletColors[i * 3 + 1] = c.g * a;
    _bulletColors[i * 3 + 2] = c.b * a;
  }
  _bulletGeo.setDrawRange(0, n);
  if (n > 0) {
    _bulletGeo.attributes.position.needsUpdate = true;
    _bulletGeo.attributes.color.needsUpdate    = true;
  }
}

// ── PARTICLE SYNC ──
function _syncParticles(G) {
  const n = Math.min(G.parts.length, MAX_PARTS);
  for (let i = 0; i < n; i++) {
    const pt = G.parts[i];
    _partPositions[i * 3]     = pt.pos.x;
    _partPositions[i * 3 + 1] = pt.pos.y;
    _partPositions[i * 3 + 2] = pt.pos.z;
    const c = _col(pt.col);
    const a = pt.life > 0.4 ? 0.7 : (pt.life / 0.4) * 0.7;
    _partColors[i * 3]     = c.r * a;
    _partColors[i * 3 + 1] = c.g * a;
    _partColors[i * 3 + 2] = c.b * a;
  }
  _partGeo.setDrawRange(0, n);
  if (n > 0) {
    _partGeo.attributes.position.needsUpdate = true;
    _partGeo.attributes.color.needsUpdate    = true;
  }
}
