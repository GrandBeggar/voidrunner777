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

// Procedural hull edges are the strongest authored detail in the source models.
// Keep them visible over the convex hull so the low-poly look reads as deliberate.
const _edgeMatCache = {};
function _edgeMat(col) {
  if (!_edgeMatCache[col]) {
    _edgeMatCache[col] = new THREE.LineBasicMaterial({
      color: new THREE.Color(col),
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
  }
  return _edgeMatCache[col];
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
function _modelToMesh(model, col) {
  const geo = _convexHullGeo(model.verts);
  const mesh = new THREE.Mesh(geo, _meshMat(col));
  let edgeGeo;

  if (model.edges?.length) {
    const positions = [];
    model.edges.forEach(([i, j]) => {
      const a = model.verts[i], b = model.verts[j];
      positions.push(a[0],a[1],a[2], b[0],b[1],b[2]);
    });
    edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  } else {
    edgeGeo = new THREE.EdgesGeometry(geo, 25);
  }

  const edges = new THREE.LineSegments(edgeGeo, _edgeMat(col));
  edges.scale.setScalar(1.004);
  edges.renderOrder = 1;
  mesh.add(edges);
  return mesh;
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
  _reflectionTarget = pmrem.fromScene(envScene, 0.05, 0.1, 100);
  pmrem.dispose();
  envScene.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  return _reflectionTarget.texture;
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
  const col = new THREE.Color(ast.col);
  const mat = new THREE.MeshStandardMaterial({
    color: col,
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
  _renderer.toneMapping = THREE.ACESFilmicToneMapping;
  _renderer.toneMappingExposure = 1.15;

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

  // Bullet point cloud (in sceneRoot so Z coords match game world)
  _bulletPositions = new Float32Array(MAX_BULLETS * 3);
  _bulletColors    = new Float32Array(MAX_BULLETS * 3);
  _bulletGeo = new THREE.BufferGeometry();
  _bulletGeo.setAttribute('position', new THREE.BufferAttribute(_bulletPositions, 3).setUsage(THREE.DynamicDrawUsage));
  _bulletGeo.setAttribute('color',    new THREE.BufferAttribute(_bulletColors,    3).setUsage(THREE.DynamicDrawUsage));
  _bulletGeo.setDrawRange(0, 0);
  _bulletPoints = new THREE.Points(_bulletGeo, new THREE.PointsMaterial({
    size: 1.5, vertexColors: true, sizeAttenuation: true,
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
    size: 4, vertexColors: true, sizeAttenuation: false,
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
  // Clear planets (each planet creates its own material — dispose it)
  while (_planetGroup.children.length) {
    const c = _planetGroup.children[0];
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
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
    // Custom GLTF preferred; fall back to procedural convex hull.
    const mesh = assetsGetModel('station') || _modelToMesh(st.model, st.col);
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
    const mesh = assetsGetModel('pirate_base') || _modelToMesh(pb.model, pb.col);
    mesh.position.set(pb.pos.x, pb.pos.y, pb.pos.z);
    mesh.userData.entity = pb;
    _pBaseGroup.add(mesh);
  });

  // Launch zone
  if (G.launchZone) {
    _launchZoneObj = _modelToMesh(G.launchZone.model, '#50c8ff');
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
    const mat = new THREE.MeshStandardMaterial({
      color: col,
      emissive: col.clone().multiplyScalar(0.12),
      metalness: 0.0,
      roughness: 0.85,
    });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.position.set(pl.pos.x, pl.pos.y, pl.pos.z);
    _planetGroup.add(sphere);

    // Atmosphere shell — BackSide so it's visible from outside
    const glowGeo = new THREE.SphereGeometry(pl.r * 1.08, 24, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true, opacity: 0.10,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(pl.pos.x, pl.pos.y, pl.pos.z);
    _planetGroup.add(glow);

    // Store mesh refs on orbiting planets so drawFrame can update their position
    if (pl.orbitCenter) { pl._mesh = sphere; pl._glowMesh = glow; }
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
  _starField = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 1.5, vertexColors: true, sizeAttenuation: false,
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
      const geo = new THREE.BoxGeometry(_CARGO_BOX_SIZE, _CARGO_BOX_SIZE, _CARGO_BOX_SIZE);
      const mesh = new THREE.Mesh(geo, _meshMat('#88ff44'));
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
