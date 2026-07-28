// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
let G=null, running=false, lastT=0;

function init(){
  initFactions();
  const s=SYS.sol;
  // §2 Starting state: Shuttle, T1 engine, T1 armour, chosen T1 weapon, 500 CR
  const shipKey = 'shuttle';
  const shipDef = SHIP_DEFS[shipKey];
  const armourTier = 0; // index into ARMOUR_TYPES
  const maxArmour = shipDef.struct * ARMOUR_TYPES[armourTier].mult;

  // Build hardpoints with starting weapon
  const startWpn = t1Weapon(startingWeaponType);
  const hardpoints = shipDef.hardpoints.map((hpType,i) => ({
    type: hpType,
    weapon: (i===0) ? startWpn : null, // first hardpoint gets the chosen weapon
    fireCd: 0,
    laserBeam: null,
  }));

  // Engine slots — all start at T1
  const engines = [];
  for(let i=0; i<shipDef.engineSlots; i++) engines.push(0); // index into ENGINE_TIERS

  G={
    sys:'sol',time:0,mode:'space',dead:false,cargoTarget:null,
    p:{
      pos:v3(0,0,0),
      vel:v3(0,0,0),
      ori:quat(1,0,0,0),
      roll:0,
      // Ship identity
      shipKey,
      ship: shipDef,
      sz: shipDef.sz,
      // Equipment
      hardpoints,
      engines,
      armourTier,
      // Derived (recalculated)
      thrustF:0, turnRate:0, maxSpd:0, fuelRate:0, totalMass:0,
      brakeF:200, boostMul:2.0,
      // HP
      armour:maxArmour, maxArmour,
      struct:shipDef.struct, maxStruct:shipDef.struct,
      fuel:shipDef.maxFuel, maxFuel:shipDef.maxFuel,
      // Economy
      credits:500,
      cargo:{}, cargoUsed:0, cargoMax:shipDef.cargo,
      // Weapon state
      activeGroup: startingWeaponType,
      // Status
      outlaw:false, outlawTimer:0, friendlyHits:0,
    },
    stations:s.stations.map(st=>({...st,model:scaleM(M_STATION,12),rAngle:0,dockR:220,landingZones:buildLandingZones(st.pos)})),
    pBases:s.pBases.map(pb=>({...pb,model:scaleM(M_PBASE,15),rAngle:Math.random()*PI2})),
    launchZone:s.launchZone ? {...s.launchZone,model:scaleM(M_STATION,6),rAngle:0} : null,
    // Shallow-copy each planet so orbital pos mutations don't corrupt SYS static data
    planets:s.planets.map(pl=>({...pl,pos:{x:pl.pos.x,y:pl.pos.y,z:pl.pos.z}})),
    asteroids:[],  // filled below after G.pBases exists
    enemies:[],bullets:[],eBullets:[],parts:[],bgStars:[],
    cargoBoxes:[],
    distressPings:[],
    pendingSpawns:[],
    eventQueue:[],
    shockwaves:[],
    hvFlashes:[],
    missions:{ board:[], active:null, storyProgress:0, completedStory:[] },
    // Targeting system
    targetIdx:-1, targetShip:null,
    locked:false,
    navIdx:-1, navTarget:null,
    spawnT:0,nearSt:null,nearLZ:false,
  };

  G.asteroids = buildAsteroids(G.pBases);

  // Opening position — needs G.planets/stations/asteroids, and must be set before
  // the spawn block below so station traffic is placed relative to the real start.
  G.p.pos = placeOpeningSpawn();

  // Calculate derived physics from equipment
  calcPlayerPhysics(G.p);
  for(let i=0;i<500;i++){
    G.bgStars.push({
      dir:v3norm(v3(Math.random()-.5,Math.random()-.5,Math.random()-.5)),
      br:.15+Math.random()*.85, sz:.4+Math.random()*1.8,
    });
  }
  // §16 System Load Spawns
  // 4 militia patrol ships
  for(let i=0;i<4;i++) spawnNPC('militia', null, pickStation());
  // Cargo on every station pair — 3 per direction for busy trade lanes
  const stPairs=[];
  for(let i=0;i<G.stations.length;i++)
    for(let j=i+1;j<G.stations.length;j++) stPairs.push([G.stations[i],G.stations[j]]);
  stPairs.forEach(([a,b])=>{
    spawnNPC('cargo',null,a,b);
    spawnNPC('cargo',null,b,a);
    if(Math.random()<0.5) spawnNPC('cargo',null,a,b);
  });
  // 6 pirate fighters + 2 recovery per pirate base (threshold 4 for hunt mode)
  G.pBases.forEach(pb=>{
    for(let i=0;i<6;i++) spawnNPC('pirate', null, null, null, pb);
    for(let i=0;i<2;i++) spawnNPC('recovery', null, null, null, pb);
    // §8: 65% chance of capital ship per base
    if(Math.random() < 0.65) spawnCapital(pb);
  });
  // 1 corporate security per station
  G.stations.forEach(st=>{ spawnNPC('corporate',null,st); });
  // Merchant Guild recovery ship at each lawful station
  G.stations.forEach(st=>{
    if(FACTIONS[st.factionId]?.cat !== 'criminal')
      spawnNPC('recovery', FACTIONS['f05']?.col||'#44cc88', st, null, null);
  });
  // 3 merc patrols
  for(let i=0;i<3;i++) spawnNPC('merc');

  running=true; G.dead=false;
}

function pickStation(){ return G.stations[Math.floor(Math.random()*G.stations.length)]; }

// ── OPENING SPAWN PLACEMENT ──────────────────────────────────
// The player used to start at the system origin, ~6000u from the nearest station
// with nothing recognisable on screen. Start just off a lawful station instead,
// backed off along -Z so the identity start orientation looks straight at it and
// the station, its planet, and station traffic are all in frame at t=0.
// Computed rather than hardcoded so it stays outside every hazard radius the HUD
// alarms on even if a system's layout changes.
const SPAWN_BACK=750;       // distance behind the station along the view axis
const SPAWN_LATERAL=250;    // nudge away from the station's parent planet
const SPAWN_STEP=250;       // push-back increment when a hazard is too close
const SPAWN_TRIES=12;
const SPAWN_CLEAR=200;      // margin beyond each hazard's own alarm radius
const SPAWN_MAX_VIEW=2200;  // past this the station stops reading as a landmark

// Hazard radii mirror the alarms in player.js: planet atmosphere warns at
// r*1.08*2.5, station proximity at 350, asteroid proximity at r*2.5.
function spawnPosClear(pos, target){
  for(const pl of G.planets)
    if(v3len(v3sub(pl.pos,pos)) < pl.r*1.08*2.5 + SPAWN_CLEAR) return false;
  for(const st of G.stations)
    if(v3len(v3sub(st.pos,pos)) < 350 + SPAWN_CLEAR) return false;
  for(const ast of G.asteroids||[])
    if(v3len(v3sub(ast.pos,pos)) < ast.r*2.5 + SPAWN_CLEAR) return false;
  for(const pb of G.pBases)
    if(v3len(v3sub(pb.pos,pos)) < 4000) return false;  // no hostile spawn trap
  return v3len(v3sub(target.pos,pos)) <= SPAWN_MAX_VIEW;
}

function placeOpeningSpawn(){
  const target = G.stations.find(st=>FACTIONS[st.factionId]?.cat!=='criminal') || G.stations[0];
  if(!target) return v3(0,0,0);
  // Lateral nudge points away from whichever planet this station orbits, so the
  // backed-off position clears the atmosphere warning ring instead of skimming it.
  let away=v3(0,0,0), best=Infinity;
  G.planets.forEach(pl=>{
    const d=v3len(v3sub(target.pos,pl.pos));
    if(d>1 && d<best){ best=d; away=v3norm(v3sub(target.pos,pl.pos)); }
  });
  for(let i=0;i<SPAWN_TRIES;i++){
    const pos=v3(
      target.pos.x + away.x*SPAWN_LATERAL,
      target.pos.y + away.y*SPAWN_LATERAL,
      target.pos.z + away.z*SPAWN_LATERAL - (SPAWN_BACK + i*SPAWN_STEP)
    );
    if(spawnPosClear(pos,target)) return pos;
  }
  return v3(0,0,0);  // nothing clear — fall back to the legacy origin
}

// ── ASTEROID FIELDS ──────────────────────────────────────────
// Generates 4-6 large rocky asteroids clustered around each pirate base.
// Rocky colours — subtle variation per asteroid.
const _AST_COLS = ['#7a6a55','#8B7355','#6B5B4A','#9A8060','#5A4F42','#857060'];

function buildAsteroids(pBases){
  const asts = [];
  pBases.forEach(pb=>{
    const count = 8 + Math.floor(Math.random()*4); // 8–11 per base
    for(let i=0;i<count;i++){
      const a   = Math.random()*PI2;
      const d   = 160 + Math.random()*880;          // 160–1040 u — base sits in the middle
      const yOff = (Math.random()-.5)*240;
      const r   = 85 + Math.random()*75;            // collision radius 85–160 u
      asts.push({
        pos: v3add(pb.pos, v3(Math.cos(a)*d, yOff, Math.sin(a)*d)),
        r,
        col: _AST_COLS[Math.floor(Math.random()*_AST_COLS.length)],
        rAngle: Math.random()*PI2,
        rSpeed: 0.012 + Math.random()*0.020, // slow tumble
        // Orbital parameters — asteroid circles its pirate base
        orbitCenter: {x:pb.pos.x, y:pb.pos.y, z:pb.pos.z},
        orbitRadius: d,
        orbitAngle: a,
        orbitY: yOff,
        orbitSpeed: 0.0015 + Math.random()*0.002, // very slow orbital drift
      });
    }
  });
  return asts;
}

const _LZ_CUBE = (function(){
  const s=14;
  return {
    verts:[[-s,-s,-s],[s,-s,-s],[s,s,-s],[-s,s,-s],
           [-s,-s, s],[s,-s, s],[s,s, s],[-s,s, s]],
    edges:[[0,1],[1,2],[2,3],[3,0],   // back face
           [4,5],[5,6],[6,7],[7,4],   // front face
           [0,4],[1,5],[2,6],[3,7]],  // pillars
  };
})();

function buildLandingZones(stPos){
  const lzs=[];
  for(let i=0;i<6;i++){
    const a=(i/6)*PI2;
    const yOff=(i%2===0?1:-1)*30;
    const offset=v3(Math.cos(a)*220,yOff,Math.sin(a)*220);
    lzs.push({
      pos:v3add(stPos,offset),
      _offset:offset,   // kept so orbit update can recompute pos when station moves
      model:_LZ_CUBE,
      rAngle:Math.random()*PI2,
    });
  }
  return lzs;
}

// Nav target list: stations + pirate bases + launch zone
function getNavList(){
  const list = [];
  G.stations.forEach(s=>list.push({name:s.name, pos:s.pos, col:s.col, type:'STATION'}));
  G.pBases.forEach(b=>list.push({name:b.name, pos:b.pos, col:b.col, type:'PIRATE BASE'}));
  if(G.launchZone) list.push({name:G.launchZone.name, pos:G.launchZone.pos, col:G.launchZone.col, type:'JUMP POINT'});
  return list;
}

// Validate targeting state each frame
function validateTargets(){
  if(G.targetShip && (!G.enemies.includes(G.targetShip) || G.targetShip.struct<=0)){
    G.targetShip=null; G.targetIdx=-1; G.locked=false;
  }
  if(G.cargoTarget && !G.cargoBoxes.includes(G.cargoTarget)){
    G.cargoTarget=null;
  }
}

// ═══════════════════════════════════════════════════════════
//  §15 BIG WARN — one-shot center-screen warning
// ═══════════════════════════════════════════════════════════
let bigWarnId=0;
function bigWarn(msg, col){
  col=col||'#ff2222';
  const el=document.getElementById('big-warn');
  if(!el) return;
  el.textContent=msg;
  el.style.color=col;
  el.style.textShadow=`0 0 24px ${col}, 0 0 60px ${col}66`;
  el.style.opacity='1';
  clearTimeout(bigWarnId);
  bigWarnId=setTimeout(()=>{ el.style.opacity='0'; }, 2000);
}

// ═══════════════════════════════════════════════════════════
//  §17 SHOCKWAVE RINGS
// ═══════════════════════════════════════════════════════════
function addShockwave(pos, speed, life, col){
  if(!G.shockwaves) G.shockwaves=[];
  G.shockwaves.push({pos:{...pos}, r:6, speed, life, ml:life, col});
}

// ═══════════════════════════════════════════════════════════
//  FLASH
// ═══════════════════════════════════════════════════════════
let flashT=0;
function flash(m){
  const el=document.getElementById('flash-msg');
  el.textContent=m;el.style.opacity='1';flashT=2;
}

// ═══════════════════════════════════════════════════════════
//  §4 STAR MAP & JUMP TRAVEL
// ═══════════════════════════════════════════════════════════
let smTarget=null; // selected destination system key

function openStarMap(){
  G.mode='starmap';
  smTarget=null;
  document.getElementById('sm-info').textContent='SELECT A SYSTEM TO JUMP (FUEL: '+JUMP_FUEL+')';
  document.getElementById('starmap-screen').style.display='block';
  drawStarMap();
}

function drawStarMap(){
  const smC=document.getElementById('sm-canvas');
  const sx=smC.getContext('2d');
  const sw=smC.width, sh=smC.height;
  sx.fillStyle='#000610'; sx.fillRect(0,0,sw,sh);

  // Draw jump routes
  sx.strokeStyle='rgba(68,153,255,0.2)'; sx.lineWidth=1;
  SM_LINKS.forEach(([a,b])=>{
    const pa=SM_POS[a], pb=SM_POS[b];
    sx.beginPath(); sx.moveTo(pa.x*sw,pa.y*sh); sx.lineTo(pb.x*sw,pb.y*sh); sx.stroke();
  });

  // Highlight routes from current system
  sx.strokeStyle='rgba(68,153,255,0.5)'; sx.lineWidth=1.5;
  SM_LINKS.forEach(([a,b])=>{
    if(a!==G.sys && b!==G.sys) return;
    const pa=SM_POS[a], pb=SM_POS[b];
    sx.beginPath(); sx.moveTo(pa.x*sw,pa.y*sh); sx.lineTo(pb.x*sw,pb.y*sh); sx.stroke();
  });

  // Draw systems
  Object.entries(SYS).forEach(([key,sys])=>{
    const p=SM_POS[key];
    const px=p.x*sw, py=p.y*sh;
    const isCur=key===G.sys;
    const isSel=key===smTarget;
    const isReachable=SM_LINKS.some(([a,b])=>(a===G.sys&&b===key)||(b===G.sys&&a===key));

    // Glow
    const gr=sx.createRadialGradient(px,py,0,px,py,20);
    gr.addColorStop(0,sys.starCol+'40'); gr.addColorStop(1,'transparent');
    sx.fillStyle=gr; sx.beginPath(); sx.arc(px,py,20,0,PI2); sx.fill();

    // Star dot
    sx.fillStyle=isCur?'#ffffff':sys.starCol;
    sx.beginPath(); sx.arc(px,py,isCur?5:4,0,PI2); sx.fill();

    // Selection ring
    if(isSel){
      sx.strokeStyle='#ffdd44'; sx.lineWidth=2;
      sx.beginPath(); sx.arc(px,py,10,0,PI2); sx.stroke();
    }
    if(isCur){
      sx.strokeStyle='#00ffcc'; sx.lineWidth=1.5;
      sx.beginPath(); sx.arc(px,py,9,0,PI2); sx.stroke();
    }

    // Label
    sx.fillStyle=isCur?'#00ffcc':isReachable?'#88aaff':'#445566';
    sx.font='9px Courier New'; sx.textAlign='center';
    sx.fillText(sys.name, px, py+20);
    if(isCur){
      sx.fillStyle='#00ffcc66'; sx.font='7px Courier New';
      sx.fillText('YOU ARE HERE', px, py+30);
    }
  });
}

// Star map click handler
document.getElementById('sm-canvas').addEventListener('click',function(ev){
  const rect=this.getBoundingClientRect();
  const mx=(ev.clientX-rect.left)/(rect.width)*this.width;
  const my=(ev.clientY-rect.top)/(rect.height)*this.height;

  let best=null, bestD=Infinity;
  Object.entries(SM_POS).forEach(([key,p])=>{
    const dx=p.x*this.width-mx, dy=p.y*this.height-my;
    const d=Math.sqrt(dx*dx+dy*dy);
    if(d<25 && d<bestD){ bestD=d; best=key; }
  });

  if(best && best!==G.sys){
    const isReachable=SM_LINKS.some(([a,b])=>(a===G.sys&&b===best)||(b===G.sys&&a===best));
    if(isReachable){
      smTarget=best;
      const info=document.getElementById('sm-info');
      info.textContent=`${SYS[best].name} — JUMP COST: ${JUMP_FUEL} FUEL`;
      info.style.color='#88aaff';
    } else {
      document.getElementById('sm-info').textContent='NO DIRECT ROUTE';
      document.getElementById('sm-info').style.color='#ff6644';
      smTarget=null;
    }
  } else {
    smTarget=null;
    document.getElementById('sm-info').textContent='SELECT A DESTINATION SYSTEM';
  }
  drawStarMap();
});

// Jump button
document.getElementById('jump-btn').onclick=()=>{
  if(!smTarget){ document.getElementById('sm-info').textContent='NO DESTINATION SELECTED'; return; }
  if(G.p.fuel < JUMP_FUEL){
    document.getElementById('sm-info').textContent='INSUFFICIENT FUEL — NEED '+JUMP_FUEL;
    document.getElementById('sm-info').style.color='#ff4444';
    return;
  }
  G.p.fuel -= JUMP_FUEL;
  document.getElementById('starmap-screen').style.display='none';
  loadSystem(smTarget);
};

document.getElementById('sm-close').onclick=()=>{
  document.getElementById('starmap-screen').style.display='none';
  G.mode='space';
};

// ── SYSTEM TRANSITION ──
function loadSystem(sysKey){
  const s=SYS[sysKey];
  if(!s) return;
  G.sys=sysKey;
  G.mode='space';

  // Rebuild world objects for new system
  G.stations=s.stations.map(st=>({...st,pos:{x:st.pos.x,y:st.pos.y,z:st.pos.z},model:scaleM(M_STATION,12),rAngle:0,dockR:220,landingZones:buildLandingZones(st.pos)}));
  G.pBases=s.pBases.map(pb=>({...pb,model:scaleM(M_PBASE,15),rAngle:Math.random()*PI2}));
  G.launchZone=s.launchZone ? {...s.launchZone,model:scaleM(M_STATION,6),rAngle:0} : null;
  G.planets=s.planets.map(pl=>({...pl,pos:{x:pl.pos.x,y:pl.pos.y,z:pl.pos.z}}));
  G.asteroids=buildAsteroids(G.pBases);

  // Clear combat state
  G.enemies=[]; G.bullets=[]; G.eBullets=[]; G.parts=[];
  G.cargoBoxes=[]; G.distressPings=[]; G.pendingSpawns=[]; G.cargoTarget=null;
  G.shockwaves=[]; G.hvFlashes=[];
  G.nearSt=null; G.nearLZ=false;

  // Spawn at launch zone
  if(G.launchZone){
    G.p.pos = v3add(G.launchZone.pos, v3(100,0,100));
  } else {
    G.p.pos = v3(0,0,0);
  }
  G.p.vel = v3(0,0,0);

  // System load spawns (§16)
  for(let i=0;i<4;i++) spawnNPC('militia', null, pickStation());
  const stPairs=[];
  for(let i=0;i<G.stations.length;i++)
    for(let j=i+1;j<G.stations.length;j++) stPairs.push([G.stations[i],G.stations[j]]);
  stPairs.forEach(([a,b])=>{
    spawnNPC('cargo',null,a,b);
    spawnNPC('cargo',null,b,a);
    if(Math.random()<0.5) spawnNPC('cargo',null,a,b);
  });
  G.pBases.forEach(pb=>{
    for(let i=0;i<6;i++) spawnNPC('pirate', null, null, null, pb);
    for(let i=0;i<2;i++) spawnNPC('recovery', null, null, null, pb);
    if(Math.random() < 0.65) spawnCapital(pb);
  });
  G.stations.forEach(st=>{ spawnNPC('corporate',null,st); });
  // Merchant Guild recovery ship at each lawful station
  G.stations.forEach(st=>{
    if(FACTIONS[st.factionId]?.cat !== 'criminal')
      spawnNPC('recovery', FACTIONS['f05']?.col||'#44cc88', st, null, null);
  });
  for(let i=0;i<3;i++) spawnNPC('merc');

  initSceneForSystem(G);
  flash(`ARRIVED: ${s.name}`);
}

// ═══════════════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════════════
// ─── DEBUG PANEL ─────────────────────────────────────────────
let _debugVisible = false;
function toggleDebugPanel(){
  _debugVisible = !_debugVisible;
  document.getElementById('debug-panel').style.display = _debugVisible ? 'block' : 'none';
}
function updateDebugPanel(){
  if(!_debugVisible || !G) return;
  const el = document.getElementById('debug-factions');
  if(!el) return;
  let html = '';
  allFactions().forEach(f=>{
    if(!f.flags.active) return;
    const cfg  = factionEconCfg(f.id);
    const pwr  = factionPower(f.id);
    const ctrl = Math.max(1, factionControl(f.id));
    const assets = f.assets || 0;
    const pBar  = Math.min(100, Math.round(pwr  / ctrl  * 100));
    const aBar  = Math.min(100, Math.round(assets / 250  * 100));
    const eBar  = Math.round(f.econ);
    const sBar  = Math.round(f.str);
    html += `<div class="dbg-faction">
      <div class="dbg-name" style="color:${f.col}">${f.name} <span style="opacity:0.4">[${f.cat}]</span></div>
      <div class="dbg-bars">
        <div class="dbg-bar-row"><span class="dbg-bar-label">ASSETS</span>
          <div class="dbg-bar-outer"><div class="dbg-bar-fill" style="width:${aBar}%;background:#ffaa44;"></div></div>
          <span class="dbg-bar-val">${Math.round(assets)}</span></div>
        <div class="dbg-bar-row"><span class="dbg-bar-label">POWER</span>
          <div class="dbg-bar-outer"><div class="dbg-bar-fill" style="width:${pBar}%;background:#44ffcc;"></div></div>
          <span class="dbg-bar-val">${pwr}/${ctrl}</span></div>
        <div class="dbg-bar-row"><span class="dbg-bar-label">ECON</span>
          <div class="dbg-bar-outer"><div class="dbg-bar-fill" style="width:${eBar}%;background:#88aaff;"></div></div>
          <span class="dbg-bar-val">${eBar}</span></div>
        <div class="dbg-bar-row"><span class="dbg-bar-label">STR</span>
          <div class="dbg-bar-outer"><div class="dbg-bar-fill" style="width:${sBar}%;background:#ff6666;"></div></div>
          <span class="dbg-bar-val">${sBar}</span></div>
      </div>
      <div style="opacity:0.35;margin-top:2px;font-size:7px">
        COST ${cfg.shipCost} · CAP ${cfg.capitalCost} · INC ${cfg.passiveIncome}/30s · SPAWN ${cfg.spawnInterval}s · CTRL ${cfg.controlBase}base
        ${f._bountyActive?'· <span style="color:#ff4444">BOUNTY ACTIVE</span>':''}
      </div>
    </div>`;
  });
  el.innerHTML = html || '<div style="opacity:0.4">No active factions</div>';
}

function loop(ts){
  const dt=Math.min(.05,(ts-lastT)/1000); lastT=ts;
  try {
    if(G&&!G.dead){update(dt);updHUD();updateDebugPanel();}
    drawFrame(G, dt);
    drawHUD();
  } catch(err) {
    // Display error on HUD canvas so we can diagnose freezes
    ctx.fillStyle='rgba(0,0,0,0.85)'; ctx.fillRect(0,0,W,200);
    ctx.fillStyle='#ff4444'; ctx.font='14px Courier New'; ctx.textAlign='left';
    ctx.fillText('ERROR: '+err.message, 20, 30);
    ctx.fillText('at: '+(err.stack||'').split('\n')[1]?.trim()?.substring(0,80), 20, 55);
    if(G){
      ctx.fillText('enemies:'+G.enemies.length+' parts:'+G.parts.length+' pings:'+G.distressPings.length, 20, 80);
      ctx.fillText('bullets:'+G.bullets.length+' eBullets:'+G.eBullets.length, 20, 105);
    }
    console.error('VOIDRUNNER ERROR:', err);
  }
  requestAnimationFrame(loop);
}

window.pickStartWpn = function(el, type){
  startingWeaponType = type;
  document.querySelectorAll('.wpn-card').forEach(c=>{
    c.style.borderColor='rgba(0,255,204,0.15)';
    c.style.background='rgba(0,255,204,0.02)';
    c.classList.remove('selected');
  });
  el.style.borderColor='rgba(0,255,204,0.6)';
  el.style.background='rgba(0,255,204,0.08)';
  el.classList.add('selected');
};

document.getElementById('start-btn').onclick=async ()=>{
  invertPitch = document.getElementById('invert-pitch').checked;
  document.getElementById('title-screen').style.display='none';
  mX=null; mY=null; mDown=false; // discard button-click mouse position
  try {
    await assetsInit();    // load custom models/sounds/cockpits (no-op if registry is empty)
    initScene();           // one-time Three.js setup
    init();                // game state
    initSceneForSystem(G); // build 3D scene for starting system
    lastT=performance.now();
    requestAnimationFrame(loop);
  } catch(err) {
    document.body.style.background='#000';
    document.body.innerHTML=`<pre style="color:#ff4444;padding:30px;font-size:13px">STARTUP ERROR:\n${err.message}\n\n${err.stack}</pre>`;
  }
};
document.getElementById('devmode-btn').onclick=async ()=>{
  invertPitch = document.getElementById('invert-pitch').checked;
  document.getElementById('title-screen').style.display='none';
  mX=null; mY=null; mDown=false;
  try {
    await assetsInit();
    initScene();
    init();
    G.p.credits = 10000000;
    initSceneForSystem(G);
    lastT=performance.now();
    requestAnimationFrame(loop);
  } catch(err) {
    document.body.style.background='#000';
    document.body.innerHTML=`<pre style="color:#ff4444;padding:30px;font-size:13px">STARTUP ERROR:\n${err.message}\n\n${err.stack}</pre>`;
  }
};

document.getElementById('restart-btn').onclick=()=>{
  document.getElementById('game-over').style.display='none';
  mX=null; mY=null; mDown=false; // discard stale mouse position
  init();
  initSceneForSystem(G);
  lastT=performance.now();
};
