// ═══════════════════════════════════════════════════════════
//  RENDERER — FOV/NEAR/proj + all draw* functions + updHUD
// ═══════════════════════════════════════════════════════════
const FOV = Math.PI / 2.5;
const NEAR = 0.5;
function proj(cp){ const f=(H/2)/Math.tan(FOV/2); const x=CX+cp.x/cp.z*f; const y=CY-cp.y/cp.z*f; return {x,y}; }

// ═══════════════════════════════════════════════════════════
//  DRAW
// ═══════════════════════════════════════════════════════════
function drawHUD(){
  ctx.clearRect(0,0,W,H);
  if(!G)return;
  // Cockpit bitmap — drawn first so all HUD elements render on top.
  // To activate: set a path in ASSET_REGISTRY.cockpits in asset-loader.js.
  const _cpImg = assetsGetCockpit(G.p.shipKey);
  if (_cpImg) ctx.drawImage(_cpImg, 0, 0, W, H);
  const p=G.p, cPos=p.pos, cQ=p.ori;

  // Sun glow — kept in 2D overlay (sprite work is future)
  const sunC=w2c(v3(0,1000,-8000),cPos,cQ);
  if(sunC.z>0){
    const sp=proj(sunC);
    if(sp){
      const g=ctx.createRadialGradient(sp.x,sp.y,0,sp.x,sp.y,120);
      g.addColorStop(0,SYS[G.sys].starCol+'60');g.addColorStop(.5,SYS[G.sys].starCol+'15');g.addColorStop(1,'transparent');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(sp.x,sp.y,120,0,PI2);ctx.fill();
      ctx.fillStyle=SYS[G.sys].starCol;ctx.beginPath();ctx.arc(sp.x,sp.y,4,0,PI2);ctx.fill();
    }
  }

  // Escort mission target indicator — pulsing green brackets
  const escortNPC = G.missions?.active?._escortNPC;
  if(escortNPC && G.enemies.includes(escortNPC) && escortNPC.struct > 0){
    const cp=w2c(escortNPC.pos,cPos,cQ);
    if(cp.z > NEAR){
      const sp=proj(cp);
      if(sp){
        const r = Math.max(18, escortNPC.sz*60/cp.z);
        const pulse = 0.5+0.5*Math.sin(G.time*3);
        ctx.strokeStyle=`rgba(68,255,120,${0.4+0.4*pulse})`;
        ctx.lineWidth=1.5;
        // Corner brackets
        const bk=r*0.35;
        ctx.beginPath();
        ctx.moveTo(sp.x-r, sp.y-r+bk); ctx.lineTo(sp.x-r, sp.y-r); ctx.lineTo(sp.x-r+bk, sp.y-r);
        ctx.moveTo(sp.x+r-bk, sp.y-r); ctx.lineTo(sp.x+r, sp.y-r); ctx.lineTo(sp.x+r, sp.y-r+bk);
        ctx.moveTo(sp.x+r, sp.y+r-bk); ctx.lineTo(sp.x+r, sp.y+r); ctx.lineTo(sp.x+r-bk, sp.y+r);
        ctx.moveTo(sp.x-r+bk, sp.y+r); ctx.lineTo(sp.x-r, sp.y+r); ctx.lineTo(sp.x-r, sp.y+r-bk);
        ctx.stroke();
        // Label
        ctx.fillStyle=`rgba(68,255,120,${0.5+0.3*pulse})`;
        ctx.font='8px Courier New'; ctx.textAlign='center';
        ctx.fillText('ESCORT', sp.x, sp.y-r-8);
        const dist=Math.round(v3len(v3sub(escortNPC.pos, G.p.pos)));
        ctx.fillStyle='rgba(68,255,120,0.35)';
        ctx.fillText(dist+'m', sp.x, sp.y+r+14);
      }
    }
  }

  // Player laser beams — screen-space rendering
  // (A beam along the view axis projects to a single pixel in 3D, so we draw in 2D)
  if(G.p.hardpoints){
    const pFwd = qFwd(G.p.ori);
    G.p.hardpoints.forEach(hp => {
      if(!hp.laserBeam || !hp.weapon) return;
      const lb = hp.laserBeam;
      const alpha = Math.min(1, lb.timer * 2);

      // Beam origin: from the nose of the cockpit
      const gunX = CX, gunY = H * 0.56;

      // Find nearest enemy along beam for hit point
      let hitScreenY = -H*0.5; // default: extend well above screen
      let hitDist = lb.range;
      G.enemies.forEach(e => {
        const toE = v3sub(e.pos, G.p.pos);
        const along = v3dot(toE, pFwd);
        if(along < 0 || along > lb.range) return;
        const perp = v3len(v3sub(toE, v3scale(pFwd, along)));
        if(perp < e.sz * 1.5 && along < hitDist){
          hitDist = along;
          // Project hit point to screen
          const cp = w2c(v3add(G.p.pos, v3scale(pFwd, along)), G.p.pos, G.p.ori);
          if(cp.z > NEAR){
            const sp = proj(cp);
            if(sp) hitScreenY = sp.y;
          }
        }
      });

      // Beam line — from gun barrel through center to hit/far
      const endY = hitDist < lb.range ? hitScreenY : -H*0.3;
      const jitterX = (Math.random()-0.5) * 2;

      // Core beam
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = lb.col;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 20; ctx.shadowColor = lb.col;
      ctx.beginPath();
      ctx.moveTo(gunX + jitterX, gunY);
      ctx.lineTo(CX + jitterX*0.5, CY);
      ctx.lineTo(CX, endY);
      ctx.stroke();

      // Wide glow
      ctx.globalAlpha = alpha * 0.15;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(gunX, gunY);
      ctx.lineTo(CX, CY);
      ctx.lineTo(CX, endY);
      ctx.stroke();

      // Impact flare at hit point
      if(hitDist < lb.range){
        ctx.globalAlpha = alpha * (0.5 + Math.random()*0.4);
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 25; ctx.shadowColor = lb.col;
        const fx = CX, fy = hitScreenY > -H ? hitScreenY : CY;
        ctx.beginPath(); ctx.arc(fx, fy, 3+Math.random()*4, 0, PI2); ctx.fill();
      }

      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;
  }

  ctx.globalAlpha=1;

  // Distress pings
  G.distressPings.forEach(dp=>{
    const cp=w2c(dp.pos,cPos,cQ);
    if(cp.z<=NEAR)return;
    const sp=proj(cp);if(!sp)return;
    const a=Math.max(0,dp.life/dp.ml)*.7;
    const sr=Math.max(4, dp.r*50/cp.z);
    ctx.globalAlpha=a; ctx.strokeStyle='#ffff44'; ctx.lineWidth=1.5;
    ctx.shadowBlur=8; ctx.shadowColor='#ffff44';
    ctx.beginPath(); ctx.arc(sp.x,sp.y,sr,0,PI2); ctx.stroke();
    ctx.shadowBlur=0;
  });
  ctx.globalAlpha=1;

  // Shockwave rings
  if(G.shockwaves){
    G.shockwaves.forEach(s=>{
      const cp=w2c(s.pos,cPos,cQ);
      if(cp.z<=NEAR) return;
      const sp=proj(cp);
      if(!sp) return;
      const a=Math.max(0,s.life/s.ml);
      const screenR=Math.max(2, s.r*50/cp.z);
      ctx.globalAlpha=a*.6;
      ctx.strokeStyle=s.col;
      ctx.lineWidth=Math.max(1, (2.5*(1-a)+1)*30/cp.z);
      ctx.shadowBlur=10; ctx.shadowColor=s.col;
      ctx.beginPath(); ctx.arc(sp.x,sp.y,screenR,0,PI2); ctx.stroke();
      ctx.shadowBlur=0;
    });
    ctx.globalAlpha=1;
  }

  // HV flash trails
  if(G.hvFlashes){
    G.hvFlashes.forEach(f=>{
      const sc=w2c(f.start,cPos,cQ);
      const ec=w2c(f.end,cPos,cQ);
      if(sc.z<=NEAR&&ec.z<=NEAR) return;
      const sp2=sc.z>NEAR?proj(sc):null;
      const ep=ec.z>NEAR?proj(ec):null;
      if(!sp2&&!ep) return;
      const sx=sp2?sp2.x:CX, sy=sp2?sp2.y:CY;
      const ex=ep?ep.x:CX, ey=ep?ep.y:CY;
      const a=f.life/f.ml;
      ctx.globalAlpha=a*.9;
      ctx.strokeStyle=f.col;
      ctx.lineWidth=4; ctx.shadowBlur=18; ctx.shadowColor=f.col;
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
      ctx.globalAlpha=a*.2;
      ctx.lineWidth=12;
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
      ctx.shadowBlur=0;
    });
    ctx.globalAlpha=1;
  }

  // HUD overlays
  drawCockpit();
  drawVelMarker();
  drawRadar();
  drawCrosshair();
  drawMissionMarker();
  drawTargeting();
  drawCargoTargeting();
  drawNavMFD();
  drawMouseRing();

  // Damage flash
  if(dmgAlpha>0){
    ctx.globalAlpha=dmgAlpha;ctx.fillStyle='#ff2200';ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=1;dmgAlpha=Math.max(0,dmgAlpha-.012);
  }

  // ── ATMOSPHERE DANGER WARNING ──
  if(G._atmoDanger){
    const pulse=0.5+0.5*Math.abs(Math.sin(G.time*4));
    ctx.save();
    ctx.globalAlpha=0.4+0.6*pulse;
    ctx.fillStyle='#ff6600';
    ctx.font='bold 26px monospace';
    ctx.textAlign='center';
    ctx.fillText('⚠ PLANETARY ATMOSPHERE DANGER',CX,H*0.22);
    ctx.globalAlpha=1;
    ctx.restore();
  }
  // ── PROXIMITY ALARM ──
  if(G._proxDanger && !G._atmoDanger){
    const pulse=0.5+0.5*Math.abs(Math.sin(G.time*5));
    ctx.save();
    ctx.globalAlpha=0.45+0.55*pulse;
    ctx.fillStyle='#ffdd00';
    ctx.font='bold 26px monospace';
    ctx.textAlign='center';
    ctx.fillText('⚠ PROXIMITY ALARM',CX,H*0.22);
    ctx.globalAlpha=1;
    ctx.restore();
  }
}


// ═══════════════════════════════════════════════════════════
//  VELOCITY VECTOR (prograde / retrograde markers)
// ═══════════════════════════════════════════════════════════
function drawVelMarker(){
  const p=G.p,spd=v3len(p.vel);
  if(spd<5)return;
  const vDir=v3norm(p.vel);

  // Prograde
  const proW=v3add(p.pos,v3scale(vDir,1000));
  const proC=w2c(proW,p.pos,p.ori);
  if(proC.z>0){
    const sp=proj(proC);
    if(sp){
      ctx.strokeStyle='#00ffcc';ctx.lineWidth=1;ctx.globalAlpha=.4;
      ctx.beginPath();ctx.arc(sp.x,sp.y,8,0,PI2);ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sp.x,sp.y-8);ctx.lineTo(sp.x,sp.y-13);
      ctx.moveTo(sp.x-8,sp.y);ctx.lineTo(sp.x-13,sp.y);
      ctx.moveTo(sp.x+8,sp.y);ctx.lineTo(sp.x+13,sp.y);
      ctx.stroke();
    }
  }

  // Retrograde
  const retW=v3add(p.pos,v3scale(vDir,-1000));
  const retC=w2c(retW,p.pos,p.ori);
  if(retC.z>0){
    const sp=proj(retC);
    if(sp){
      ctx.globalAlpha=.2;
      ctx.beginPath();ctx.arc(sp.x,sp.y,6,0,PI2);ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sp.x-4,sp.y-4);ctx.lineTo(sp.x+4,sp.y+4);
      ctx.moveTo(sp.x+4,sp.y-4);ctx.lineTo(sp.x-4,sp.y+4);
      ctx.stroke();
    }
  }
  ctx.globalAlpha=1;
}

// ═══════════════════════════════════════════════════════════
//  CROSSHAIR (always at center — IS the ship nose)
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
//  MOUSE RING — cursor dot + decorative arc ticks
//  Ring radius matches CSS #mouse-ring (75vh / 2 = H * 0.375).
//  Cursor dot stays inside ring because mX/mY are clamped in player.js.
// ═══════════════════════════════════════════════════════════
function drawMouseRing(){
  if(!G || G.mode!=='space') return;
  const r = H * 0.375;          // ring radius
  const tickR = r * 0.5;        // halfway between center and ring edge
  const arcSpan = PI / 8;       // 22.5° each side = 45° total arc

  ctx.save();

  // 4 arc ticks at 0°, 90°, 180°, 270°
  ctx.strokeStyle = 'rgba(0,255,204,0.35)';
  ctx.lineWidth = 1.5;
  for(let i = 0; i < 4; i++){
    const a = i * PI2 / 4;
    ctx.beginPath();
    ctx.arc(CX, CY, tickR, a - arcSpan, a + arcSpan);
    ctx.stroke();
  }

  // Cursor dot at clamped mouse position
  const dx = mX === null ? CX : mX;
  const dy = mY === null ? CY : mY;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#00ffcc';
  ctx.beginPath();
  ctx.arc(dx, dy, 3, 0, PI2);
  ctx.fill();

  ctx.restore();
}

function drawCrosshair(){
  const col=G.nearSt?'#ffdd44':'#00ffcc';
  ctx.strokeStyle=col;ctx.lineWidth=1;ctx.globalAlpha=.6;
  const r=18;
  ctx.beginPath();
  ctx.moveTo(CX-r,CY);ctx.lineTo(CX-r*.35,CY);
  ctx.moveTo(CX+r*.35,CY);ctx.lineTo(CX+r,CY);
  ctx.moveTo(CX,CY-r);ctx.lineTo(CX,CY-r*.35);
  ctx.moveTo(CX,CY+r*.35);ctx.lineTo(CX,CY+r);
  ctx.stroke();
  ctx.globalAlpha=.2;ctx.beginPath();ctx.arc(CX,CY,r,0,PI2);ctx.stroke();
  ctx.globalAlpha=.5;ctx.fillStyle=col;
  ctx.beginPath();ctx.arc(CX,CY,1.5,0,PI2);ctx.fill();
  ctx.globalAlpha=1;
}

// ═══════════════════════════════════════════════════════════
//  MISSION WAYPOINT MARKER
// ═══════════════════════════════════════════════════════════
function drawMissionMarker(){
  const M=G.missions;
  if(!M?.active) return;
  const m=M.active;
  const p=G.p;

  // Determine target position
  let targetPos=null, label='';
  if(m.type==='intel' && m._scanTarget){
    targetPos=m._scanTarget; label='SCAN TARGET';
  } else if(m.type==='escort' && m._destStation){
    targetPos=m._destStation.pos; label='ESCORT DEST';
  } else if(m.type==='delivery' && m.destStationId){
    const st=G.stations.find(s=>s.id===m.destStationId);
    if(st) { targetPos=st.pos; label='DELIVER'; }
  }
  if(!targetPos) return;

  // Project to screen
  const cp = w2c(targetPos, p.pos, p.ori);
  const dist = v3len(v3sub(targetPos, p.pos));
  const pulse = 0.6+0.4*Math.sin(G.time*4);

  if(cp.z > NEAR){
    const sp=proj(cp);
    if(sp && sp.x>-50 && sp.x<W+50 && sp.y>-50 && sp.y<H+50){
      // On screen — pulsing diamond
      ctx.save();
      ctx.strokeStyle=`rgba(255,220,60,${pulse})`;
      ctx.lineWidth=1.5;
      ctx.beginPath();
      ctx.moveTo(sp.x,sp.y-12); ctx.lineTo(sp.x+10,sp.y);
      ctx.lineTo(sp.x,sp.y+12); ctx.lineTo(sp.x-10,sp.y);
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle=`rgba(255,220,60,${pulse*0.2})`;
      ctx.fill();
      ctx.fillStyle=`rgba(255,220,60,${pulse})`;
      ctx.font='8px Courier New'; ctx.textAlign='center';
      ctx.fillText(label, sp.x, sp.y-18);
      ctx.font='7px Courier New'; ctx.fillStyle='rgba(255,220,60,0.5)';
      ctx.fillText(`${Math.round(dist)}m`, sp.x, sp.y+22);
      ctx.restore();
      return;
    }
  }

  // Off screen — edge arrow pointing toward target
  const dx=cp.x, dy=-cp.y; // screen-relative direction
  const angle=Math.atan2(dy,dx);
  const margin=40;
  const ax=Math.max(margin,Math.min(W-margin, CX+Math.cos(angle)*(Math.min(CX,CY)-margin)));
  const ay=Math.max(margin,Math.min(H-margin, CY+Math.sin(angle)*(Math.min(CX,CY)-margin)));

  ctx.save();
  ctx.translate(ax,ay); ctx.rotate(angle);
  ctx.strokeStyle=`rgba(255,220,60,${0.5+0.4*pulse})`;
  ctx.fillStyle=`rgba(255,220,60,${0.4+0.3*pulse})`;
  ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(-6,-6); ctx.lineTo(-6,6); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.rotate(-angle);
  ctx.fillStyle=`rgba(255,220,60,${0.6+0.3*pulse})`;
  ctx.font='8px Courier New'; ctx.textAlign='center';
  ctx.fillText(label,0,-14);
  ctx.font='7px Courier New'; ctx.fillStyle='rgba(255,220,60,0.4)';
  ctx.fillText(`${Math.round(dist)}m`,0,16);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
//  TARGETING / LOCK / NAV SYSTEM
// ═══════════════════════════════════════════════════════════

// Draw a mini wireframe into a screen-space box for MFD
// relYaw/relPitch = orientation of object RELATIVE TO PLAYER'S VIEW
function drawMFDWireframe(model, cx, cy, boxR, relYaw, relPitch, col, alpha){
  if(!model || !model.verts || !model.verts.length) return;
  ctx.save();
  ctx.globalAlpha = alpha || 0.7;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.2;

  // Auto-fit: find bounding radius of model verts, normalize to fit in boxR
  let maxR = 0;
  model.verts.forEach(v=>{
    const r = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    if(r > maxR) maxR = r;
  });
  if(maxR < 0.01) maxR = 1;
  const scale = (boxR * 0.85) / maxR;

  const cosY=Math.cos(relYaw), sinY=Math.sin(relYaw);
  const cosP=Math.cos(relPitch), sinP=Math.sin(relPitch);
  const projected = model.verts.map(v=>{
    let x=v[0], y=v[1], z=v[2];
    let x2=x*cosY+z*sinY, z2=-x*sinY+z*cosY;
    let y2=y*cosP-z2*sinP;
    return { x:cx+x2*scale, y:cy-y2*scale };
  });
  model.edges.forEach(([a,b])=>{
    if(a>=projected.length||b>=projected.length) return;
    ctx.beginPath();
    ctx.moveTo(projected[a].x, projected[a].y);
    ctx.lineTo(projected[b].x, projected[b].y);
    ctx.stroke();
  });
  ctx.restore();
}

// Draw off-screen direction indicator for a world position
function drawDirIndicator(targetPos, col, label){
  const p=G.p;
  const cp = w2c(targetPos, p.pos, p.ori);
  const dist = v3len(v3sub(targetPos, p.pos));

  // If on screen, skip the indicator (brackets handle it)
  if(cp.z > NEAR){
    const sp=proj(cp);
    if(sp && sp.x>0 && sp.x<W && sp.y>0 && sp.y<H) return;
  }

  const dx=cp.x, dy=-cp.y;
  const angle=Math.atan2(dy,dx);
  const margin=60;
  const ax=Math.max(margin,Math.min(W-margin, CX+Math.cos(angle)*(Math.min(CX,CY)-margin)));
  const ay=Math.max(margin,Math.min(H-margin, CY+Math.sin(angle)*(Math.min(CX,CY)-margin)));

  const pulse=.5+.5*Math.sin(G.time*4);
  ctx.save();
  ctx.translate(ax,ay); ctx.rotate(angle);
  ctx.strokeStyle=col; ctx.fillStyle=col;
  ctx.globalAlpha=0.5+0.4*pulse; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(-5,-5); ctx.lineTo(-5,5); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.rotate(-angle);
  ctx.globalAlpha=0.6+0.3*pulse;
  ctx.font='7px Courier New'; ctx.textAlign='center';
  ctx.fillText(label,0,-12);
  ctx.fillStyle=col+'88'; ctx.fillText(Math.round(dist)+'m',0,14);
  ctx.restore();
}

function drawTargeting(){
  if(!G.targetShip && !G.locked) return;
  const t = G.targetShip;
  if(!t || !G.enemies.includes(t) || t.struct<=0) return;
  const p = G.p;
  const cPos=p.pos, cQ=p.ori;
  const dP = v3len(v3sub(t.pos, p.pos));

  const isLocked = G.locked;
  const tgtCol = isLocked ? '#ff4444' : '#ff8800';

  // ── 3D BRACKETS / LOCK SQUARE ──
  const cp = w2c(t.pos, cPos, cQ);
  if(cp.z > NEAR){
    const sp = proj(cp);
    if(sp){
      const r = Math.max(16, t.sz*70/cp.z);
      const pulse = 0.5+0.5*Math.sin(G.time*5);
      ctx.strokeStyle = tgtCol;
      ctx.lineWidth = isLocked ? 2 : 1.5;
      ctx.globalAlpha = 0.5+0.4*pulse;

      if(isLocked){
        // Closed square
        ctx.strokeRect(sp.x-r, sp.y-r, r*2, r*2);
      } else {
        // Open corner brackets
        const bk=r*0.4;
        ctx.beginPath();
        ctx.moveTo(sp.x-r,sp.y-r+bk); ctx.lineTo(sp.x-r,sp.y-r); ctx.lineTo(sp.x-r+bk,sp.y-r);
        ctx.moveTo(sp.x+r-bk,sp.y-r); ctx.lineTo(sp.x+r,sp.y-r); ctx.lineTo(sp.x+r,sp.y-r+bk);
        ctx.moveTo(sp.x+r,sp.y+r-bk); ctx.lineTo(sp.x+r,sp.y+r); ctx.lineTo(sp.x+r-bk,sp.y+r);
        ctx.moveTo(sp.x-r+bk,sp.y+r); ctx.lineTo(sp.x-r,sp.y+r); ctx.lineTo(sp.x-r,sp.y+r-bk);
        ctx.stroke();
      }

      // Distance text
      ctx.globalAlpha=0.5;
      ctx.fillStyle=tgtCol;
      ctx.font='7px Courier New'; ctx.textAlign='center';
      ctx.fillText(Math.round(dP)+'m', sp.x, sp.y+r+12);
      ctx.globalAlpha=1;
    }
  }

  // ── HUD DIRECTION INDICATOR (when off screen) ──
  drawDirIndicator(t.pos, tgtCol, isLocked?'LOCK':'TGT');

  // ── PREDICTIVE GUNSIGHT (lock only) ──
  if(isLocked && cp.z > NEAR){
    // Lead calculation: where to aim to hit a moving target
    const activeHPs = p.hardpoints.filter(hp=>hp.weapon && hp.weapon.type===p.activeGroup);
    const wpn = activeHPs[0]?.weapon;
    if(wpn){
      // For lasers use range as a stand-in speed (instantaneous); ballistic/HV use velocity
      const bulletSpd = wpn.type === 'laser' ? 99999 : (wpn.velocity || 600);
      const relVel = v3sub(t.vel||v3(0,0,0), p.vel);
      const toTgt = v3sub(t.pos, p.pos);
      // Quadratic intercept: solve (bulletSpd²-|relVel|²)t² + 2(toTgt·relVel)t - |toTgt|² = 0
      const a = bulletSpd*bulletSpd - v3dot(relVel,relVel);
      const b = 2*v3dot(toTgt,relVel);
      const c = -v3dot(toTgt,toTgt);
      let tHit;
      if(Math.abs(a) < 0.1){ tHit = Math.abs(b)>0.001 ? -c/b : dP/bulletSpd; }
      else {
        const disc = b*b - 4*a*c;
        tHit = disc >= 0 ? (-b + Math.sqrt(disc))/(2*a) : dP/bulletSpd;
        if(tHit < 0) tHit = dP/bulletSpd;
      }
      const leadPos = v3add(t.pos, v3scale(relVel, tHit));
      const lcp = w2c(leadPos, cPos, cQ);
      if(lcp.z > NEAR){
        const lsp = proj(lcp);
        if(lsp){
          const lPulse = 0.5+0.5*Math.sin(G.time*8);
          ctx.strokeStyle = '#ff2222';
          ctx.globalAlpha = 0.5+0.4*lPulse;
          ctx.lineWidth = 1.5;
          // Small crosshair at lead point
          const lr=8;
          ctx.beginPath();
          ctx.moveTo(lsp.x-lr,lsp.y); ctx.lineTo(lsp.x-lr*0.3,lsp.y);
          ctx.moveTo(lsp.x+lr*0.3,lsp.y); ctx.lineTo(lsp.x+lr,lsp.y);
          ctx.moveTo(lsp.x,lsp.y-lr); ctx.lineTo(lsp.x,lsp.y-lr*0.3);
          ctx.moveTo(lsp.x,lsp.y+lr*0.3); ctx.lineTo(lsp.x,lsp.y+lr);
          ctx.stroke();
          ctx.beginPath(); ctx.arc(lsp.x,lsp.y,lr*0.7,0,PI2); ctx.stroke();
          ctx.globalAlpha=0.4;
          ctx.font='6px Courier New'; ctx.textAlign='center'; ctx.fillStyle='#ff4444';
          ctx.fillText('LEAD',lsp.x,lsp.y-lr-4);
          ctx.globalAlpha=1;
        }
      }
    }
  }

  // ── TARGET MFD (lower center-left, 400×270) ──
  const mfdW=400, mfdH=270;
  const mfdX=CX-mfdW-30, mfdY=H-mfdH-30;
  ctx.save();
  ctx.fillStyle='rgba(0,4,10,0.88)';
  ctx.fillRect(mfdX, mfdY, mfdW, mfdH);
  ctx.strokeStyle=tgtCol+'66'; ctx.lineWidth=1;
  ctx.strokeRect(mfdX, mfdY, mfdW, mfdH);

  // Header
  ctx.fillStyle=tgtCol; ctx.globalAlpha=0.9;
  ctx.font='12px Courier New'; ctx.textAlign='left';
  ctx.fillText(isLocked?'◼ LOCKED':'◻ TARGET', mfdX+10, mfdY+18);

  // Wireframe — orientation relative to player's view
  // Transform target's forward into player's local frame
  const tFwd = npcForward(t);
  const pFwd2 = qFwd(p.ori), pRight = qRight(p.ori), pUp = qUp(p.ori);
  const localX = v3dot(tFwd, pRight);
  const localY = v3dot(tFwd, pUp);
  const localZ = v3dot(tFwd, pFwd2);
  const relYaw = Math.atan2(localX, localZ);
  const relPitch = Math.asin(Math.max(-1, Math.min(1, localY)));
  drawMFDWireframe(t.model, mfdX+mfdW/2, mfdY+85, 70, relYaw, relPitch, tgtCol, 0.7);

  // Distance on wireframe
  ctx.globalAlpha=0.5; ctx.fillStyle=tgtCol;
  ctx.font='11px Courier New'; ctx.textAlign='center';
  ctx.fillText(Math.round(dP)+' m', mfdX+mfdW/2, mfdY+145);

  // Ship info
  ctx.globalAlpha=0.8; ctx.fillStyle='#ffffff';
  ctx.font='14px Courier New'; ctx.textAlign='left';
  ctx.fillText(t.name||'UNKNOWN', mfdX+10, mfdY+175);

  const fac = t.factionId ? FACTIONS[t.factionId] : null;
  ctx.fillStyle=fac?.col||'#888'; ctx.globalAlpha=0.6;
  ctx.font='11px Courier New';
  ctx.fillText(fac?.name||(t.aiRole||'').toUpperCase(), mfdX+10, mfdY+195);

  // Armour/Structure bars
  if(t.isCapital && t.components){
    const totalHp = t.components.reduce((s,c)=>s+Math.max(0,c.hp),0);
    const totalMax = t.components.reduce((s,c)=>s+c.maxHp,0);
    const hpPct = totalMax>0 ? totalHp/totalMax : 0;
    ctx.globalAlpha=0.5; ctx.fillStyle='#222';
    ctx.fillRect(mfdX+10, mfdY+208, mfdW-20, 10);
    ctx.fillStyle=hpPct>.5?'#44ff88':hpPct>.25?'#ffaa00':'#ff4444';
    ctx.fillRect(mfdX+10, mfdY+208, (mfdW-20)*hpPct, 10);
    ctx.globalAlpha=0.5; ctx.fillStyle='#fff'; ctx.font='10px Courier New';
    ctx.fillText('HULL '+Math.round(hpPct*100)+'%', mfdX+10, mfdY+235);
  } else {
    const ap2=t.maxArmour>0?t.armour/t.maxArmour:0;
    const sp2=t.maxStruct>0?t.struct/t.maxStruct:0;
    ctx.globalAlpha=0.5; ctx.fillStyle='#222';
    ctx.fillRect(mfdX+10, mfdY+205, mfdW-20, 8);
    ctx.fillStyle=ap2>.5?'#00ccaa':'#ff8844';
    ctx.fillRect(mfdX+10, mfdY+205, (mfdW-20)*ap2, 8);
    ctx.fillStyle='#222';
    ctx.fillRect(mfdX+10, mfdY+218, mfdW-20, 8);
    ctx.fillStyle=sp2>.5?'#44ff88':sp2>.25?'#ffaa00':'#ff4444';
    ctx.fillRect(mfdX+10, mfdY+218, (mfdW-20)*sp2, 8);
    ctx.globalAlpha=0.5; ctx.fillStyle='#fff'; ctx.font='10px Courier New';
    ctx.fillText('ARM '+Math.round(ap2*100)+'%', mfdX+10, mfdY+242);
    ctx.fillText('STR '+Math.round(sp2*100)+'%', mfdX+120, mfdY+242);
  }

  // Extra info row — below ARM/STR labels, clear of bars
  ctx.font='9px Courier New'; ctx.textAlign='left';
  if(t.aiRole==='recovery'){
    const cCount = t._cargo?.length||0;
    ctx.globalAlpha=0.85; ctx.fillStyle='#ff9944';
    ctx.fillText(`CARGO: ${cCount}/5 BOX${cCount!==1?'ES':''}`, mfdX+10, mfdY+256);
  } else if(t.aiRole==='cargo' && t._cargoOwner){
    const ownerFac = FACTIONS[t._cargoOwner];
    const destFid  = t.routeB?.factionId;
    const destFac  = destFid ? FACTIONS[destFid] : null;
    ctx.globalAlpha=0.75; ctx.fillStyle=ownerFac?.col||'#888';
    ctx.fillText((ownerFac?.name||t._cargoOwner)+' CARGO', mfdX+10, mfdY+256);
    ctx.globalAlpha=0.5; ctx.fillStyle=destFac?.col||'#888';
    ctx.fillText('→ '+(destFac?.name||t.routeB?.name||'?'), mfdX+10, mfdY+267);
  }

  // Distance
  ctx.globalAlpha=0.45; ctx.fillStyle='#fff'; ctx.font='11px Courier New';
  ctx.textAlign='right';
  ctx.fillText(Math.round(dP)+'m', mfdX+mfdW-10, mfdY+267);

  ctx.restore();
  ctx.globalAlpha=1;
}

// ═══════════════════════════════════════════════════════════
//  CARGO TARGETING — brackets + direction arrow for G.cargoTarget
//  Mirrors drawTargeting but for cargo boxes (C key).
// ═══════════════════════════════════════════════════════════
function drawCargoTargeting(){
  if(!G.cargoTarget) return;
  const box=G.cargoTarget;
  if(!G.cargoBoxes.includes(box)){ G.cargoTarget=null; return; }
  const p=G.p, col='#88ff44';
  const dist=v3len(v3sub(box.pos,p.pos));
  const cp=w2c(box.pos,p.pos,p.ori);
  if(cp.z>NEAR){
    const sp=proj(cp);
    if(sp){
      const r=Math.max(12,50/cp.z);
      const pulse=0.5+0.5*Math.sin(G.time*4);
      const bk=r*0.4;
      ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.globalAlpha=0.5+0.4*pulse;
      ctx.beginPath();
      ctx.moveTo(sp.x-r,sp.y-r+bk); ctx.lineTo(sp.x-r,sp.y-r); ctx.lineTo(sp.x-r+bk,sp.y-r);
      ctx.moveTo(sp.x+r-bk,sp.y-r); ctx.lineTo(sp.x+r,sp.y-r); ctx.lineTo(sp.x+r,sp.y-r+bk);
      ctx.moveTo(sp.x+r,sp.y+r-bk); ctx.lineTo(sp.x+r,sp.y+r); ctx.lineTo(sp.x+r-bk,sp.y+r);
      ctx.moveTo(sp.x-r+bk,sp.y+r); ctx.lineTo(sp.x-r,sp.y+r); ctx.lineTo(sp.x-r,sp.y+r-bk);
      ctx.stroke();
      ctx.globalAlpha=0.5; ctx.fillStyle=col;
      ctx.font='7px Courier New'; ctx.textAlign='center';
      ctx.fillText(Math.round(dist)+'m',sp.x,sp.y+r+12);
      ctx.globalAlpha=1;
    }
  }
  drawDirIndicator(box.pos,col,'CARGO');
}

// ═══════════════════════════════════════════════════════════
//  CARGO BOX MFD — single-target panel for G.cargoTarget
//  Shown in nav MFD slot; mutually exclusive with nav (N clears it).
// ═══════════════════════════════════════════════════════════
function drawCargoBoxMFD(){
  const box=G.cargoTarget;
  if(!G.cargoBoxes.includes(box)){ G.cargoTarget=null; return; }
  const p=G.p, col='#88ff44';
  const dist=v3len(v3sub(box.pos,p.pos));
  const mfdW=400,mfdH=270,mfdX=CX+30,mfdY=H-mfdH-30;

  ctx.save();
  ctx.fillStyle='rgba(0,4,14,0.88)';
  ctx.fillRect(mfdX,mfdY,mfdW,mfdH);
  ctx.strokeStyle=col+'55'; ctx.lineWidth=1;
  ctx.strokeRect(mfdX,mfdY,mfdW,mfdH);

  ctx.fillStyle=col; ctx.globalAlpha=0.9;
  ctx.font='12px Courier New'; ctx.textAlign='left';
  ctx.fillText('◇ CARGO',mfdX+10,mfdY+18);

  // Spinning wireframe cube — uses box.angle so it rotates with the 3D mesh
  drawMFDWireframe(M_CARGO_BOX,mfdX+mfdW/2,mfdY+85,70,box.angle,box.angle*0.7,col,0.6);

  ctx.globalAlpha=0.5; ctx.fillStyle=col;
  ctx.font='11px Courier New'; ctx.textAlign='center';
  ctx.fillText(Math.round(dist)+' m',mfdX+mfdW/2,mfdY+145);

  // Good name + quantity
  ctx.globalAlpha=0.8; ctx.fillStyle='#fff';
  ctx.font='14px Courier New'; ctx.textAlign='left';
  ctx.fillText((GNAMES[box.good]||box.good).toUpperCase(),mfdX+10,mfdY+175);
  ctx.fillStyle=col; ctx.globalAlpha=0.6;
  ctx.font='11px Courier New';
  ctx.fillText(box.units+' UNITS',mfdX+10,mfdY+195);

  // Distance
  ctx.globalAlpha=0.5; ctx.fillStyle='#fff'; ctx.font='12px Courier New';
  ctx.fillText(Math.round(dist)+'m',mfdX+10,mfdY+220);

  // Bearing compass
  const toBox=v3sub(box.pos,p.pos);
  const bearing=Math.atan2(v3dot(toBox,qRight(p.ori)),v3dot(toBox,qFwd(p.ori)));
  const cx2=mfdX+mfdW-40,cy2=mfdY+215;
  ctx.strokeStyle=col; ctx.globalAlpha=0.4; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(cx2,cy2,22,0,PI2); ctx.stroke();
  ctx.strokeStyle=col; ctx.globalAlpha=0.7; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(cx2,cy2);
  ctx.lineTo(cx2+Math.sin(bearing)*18,cy2-Math.cos(bearing)*18); ctx.stroke();
  ctx.fillStyle=col; ctx.globalAlpha=0.5;
  ctx.beginPath(); ctx.arc(cx2,cy2,2,0,PI2); ctx.fill();
  ctx.globalAlpha=0.35; ctx.font='7px Courier New'; ctx.textAlign='center';
  ctx.fillText('F',cx2,cy2-27); ctx.fillText('R',cx2+27,cy2+3);

  ctx.restore();
  ctx.globalAlpha=1;
}

function drawNavMFD(){
  if(G.cargoTarget){ drawCargoBoxMFD(); return; }
  if(!G.navTarget) return;
  const t = G.navTarget;
  const p = G.p;
  const dist = v3len(v3sub(t.pos, p.pos));
  const navCol = '#44aaff';

  // ── HUD DIRECTION INDICATOR ──
  drawDirIndicator(t.pos, navCol, 'NAV');

  // ── 3D diamond marker ──
  const cp = w2c(t.pos, p.pos, p.ori);
  if(cp.z > NEAR){
    const sp = proj(cp);
    if(sp && sp.x>-50 && sp.x<W+50 && sp.y>-50 && sp.y<H+50){
      const pulse=0.5+0.5*Math.sin(G.time*3);
      ctx.strokeStyle=navCol;
      ctx.globalAlpha=0.4+0.4*pulse;
      ctx.lineWidth=1.5;
      ctx.beginPath();
      ctx.moveTo(sp.x,sp.y-10); ctx.lineTo(sp.x+8,sp.y);
      ctx.lineTo(sp.x,sp.y+10); ctx.lineTo(sp.x-8,sp.y);
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle=navCol; ctx.globalAlpha=0.5+0.3*pulse;
      ctx.font='7px Courier New'; ctx.textAlign='center';
      ctx.fillText(t.name, sp.x, sp.y-16);
      ctx.fillStyle=navCol+'77';
      ctx.fillText(Math.round(dist)+'m', sp.x, sp.y+20);
    }
  }

  // ── NAV MFD (lower center-right, 400×270, mirrors target MFD) ──
  const mfdW=400, mfdH=270;
  const mfdX=CX+30, mfdY=H-mfdH-30;
  ctx.save();
  ctx.fillStyle='rgba(0,4,14,0.88)';
  ctx.fillRect(mfdX, mfdY, mfdW, mfdH);
  ctx.strokeStyle=navCol+'55'; ctx.lineWidth=1;
  ctx.strokeRect(mfdX, mfdY, mfdW, mfdH);

  ctx.fillStyle=navCol; ctx.globalAlpha=0.9;
  ctx.font='12px Courier New'; ctx.textAlign='left';
  ctx.fillText('◇ NAV', mfdX+10, mfdY+18);

  // Wireframe of destination — station or pirate base model
  let navModel = null;
  let navYaw = 0;
  if(t.type==='STATION'){
    const st = G.stations.find(s=>s.name===t.name);
    if(st){ navModel = st.model; navYaw = st.rAngle||0; }
  } else if(t.type==='PIRATE BASE'){
    const pb = G.pBases.find(b=>b.name===t.name);
    if(pb){ navModel = pb.model; navYaw = pb.rAngle||0; }
  } else if(t.type==='JUMP POINT' && G.launchZone){
    navModel = G.launchZone.model;
    navYaw = G.launchZone.rAngle||0;
  }
  if(navModel){
    // Orientation relative to player's view
    const toNav2 = v3norm(v3sub(t.pos, p.pos));
    const pFwd3 = qFwd(p.ori), pRight3 = qRight(p.ori), pUp3 = qUp(p.ori);
    // Station faces us — show angle we're viewing it from, plus its own rotation
    const viewYaw = Math.atan2(v3dot(toNav2, pRight3), v3dot(toNav2, pFwd3)) + navYaw;
    const viewPitch = Math.asin(Math.max(-1, Math.min(1, v3dot(toNav2, pUp3))));
    drawMFDWireframe(navModel, mfdX+mfdW/2, mfdY+85, 70, viewYaw, viewPitch, navCol, 0.6);

    // Distance on wireframe
    ctx.globalAlpha=0.5; ctx.fillStyle=navCol;
    ctx.font='11px Courier New'; ctx.textAlign='center';
    ctx.fillText(Math.round(dist)+' m', mfdX+mfdW/2, mfdY+145);
  }

  // Destination name
  ctx.globalAlpha=0.8; ctx.fillStyle='#ffffff';
  ctx.font='14px Courier New'; ctx.textAlign='left';
  ctx.fillText(t.name||'UNKNOWN', mfdX+10, mfdY+175);

  // Type label
  ctx.fillStyle=t.col||'#888'; ctx.globalAlpha=0.6;
  ctx.font='11px Courier New';
  ctx.fillText(t.type||'DESTINATION', mfdX+10, mfdY+195);

  // Distance
  ctx.globalAlpha=0.5; ctx.fillStyle='#fff'; ctx.font='12px Courier New';
  ctx.fillText(Math.round(dist)+'m', mfdX+10, mfdY+220);

  // Bearing compass — larger
  const toNav = v3sub(t.pos, p.pos);
  const fwd = qFwd(p.ori), right = qRight(p.ori);
  const bearing = Math.atan2(v3dot(toNav,right), v3dot(toNav,fwd));
  const cx2=mfdX+mfdW-40, cy2=mfdY+215;
  ctx.strokeStyle=navCol; ctx.globalAlpha=0.4; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(cx2,cy2,22,0,PI2); ctx.stroke();
  ctx.strokeStyle=navCol; ctx.globalAlpha=0.7; ctx.lineWidth=2.5;
  ctx.beginPath();
  ctx.moveTo(cx2, cy2);
  ctx.lineTo(cx2+Math.sin(bearing)*18, cy2-Math.cos(bearing)*18);
  ctx.stroke();
  ctx.fillStyle=navCol; ctx.globalAlpha=0.5;
  ctx.beginPath(); ctx.arc(cx2,cy2,2,0,PI2); ctx.fill();
  ctx.globalAlpha=0.35; ctx.font='7px Courier New'; ctx.textAlign='center';
  ctx.fillText('F',cx2,cy2-27); ctx.fillText('R',cx2+27,cy2+3);

  ctx.restore();
  ctx.globalAlpha=1;
}

// ═══════════════════════════════════════════════════════════
//  COCKPIT — ship-aware wireframe interior
// ═══════════════════════════════════════════════════════════
// Windscreen opening. Traced twice — once to punch the hole in the frame fill,
// once to stroke the inner edge — so the two can never drift apart.
// Tuned to clear the protected HUD regions: centre view, the warning line at
// H*0.22, the radar at (W-100, H-160) r60, and the right-hand MFD column.
function _canopyOpening(inset){
  const i = inset || 0;
  ctx.moveTo(W*.150 + i, H*.075 + i);
  ctx.lineTo(W*.350,     H*.042 + i);
  ctx.lineTo(CX,         H*.032 + i);
  ctx.lineTo(W*.650,     H*.042 + i);
  ctx.lineTo(W*.850 - i, H*.075 + i);
  ctx.lineTo(W*.915 - i, H*.420);
  ctx.lineTo(W*.885 - i, H*.730 - i);
  ctx.lineTo(W*.115 + i, H*.730 - i);
  ctx.lineTo(W*.085 + i, H*.420);
  ctx.closePath();
}

function _canopyFrame(shipCol, tier){
  // Outer rect runs well past the viewport so roll cannot swing an uncovered
  // corner into view.
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#010806';
  ctx.beginPath();
  ctx.rect(-W, -H, W * 3, H * 3);
  _canopyOpening(0);
  ctx.fill('evenodd');

  // Structural edge: a bright inner lip over a heavier dim member reads as a
  // machined frame rather than a drawn outline.
  ctx.strokeStyle = shipCol;
  ctx.globalAlpha = .13; ctx.lineWidth = 16;
  ctx.beginPath(); _canopyOpening(0); ctx.stroke();
  ctx.globalAlpha = .34; ctx.lineWidth = 2;
  ctx.beginPath(); _canopyOpening(0); ctx.stroke();
  ctx.globalAlpha = .14; ctx.lineWidth = 1;
  ctx.beginPath(); _canopyOpening(9); ctx.stroke();

  // Corner gussets — short diagonals where the pillars meet the roof, the detail
  // that makes a frame look fabricated rather than extruded.
  ctx.globalAlpha = .30; ctx.lineWidth = 2;
  const gus = [
    [W*.150, H*.075, W*.196, H*.120],
    [W*.850, H*.075, W*.804, H*.120],
    [W*.115, H*.730, W*.158, H*.686],
    [W*.885, H*.730, W*.842, H*.686],
  ];
  gus.forEach(([x1,y1,x2,y2]) => {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  });

  // Ribs along the pillars — count rises with hull tier, so heavier ships read
  // as more heavily built without needing per-ship art.
  const ribs = 2 + Math.min(tier, 4);
  ctx.globalAlpha = .22; ctx.lineWidth = 1.5;
  for (let s = 0; s < ribs; s++) {
    const t = (s + 1) / (ribs + 1);
    const y = H * (.075 + t * (.730 - .075));
    const xl = W * (.150 - t * (.150 - .085)) - (t > .55 ? W * (t - .55) * .07 : 0);
    const xr = W - xl;
    ctx.beginPath(); ctx.moveTo(xl - W*.055, y); ctx.lineTo(xl, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xr, y); ctx.lineTo(xr + W*.055, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawCockpit(){
  const p=G.p;
  const shipCol = SHIP_DEFS[p.shipKey]?.col || '#00ffcc';
  const tier = SHIP_DEFS[p.shipKey]?.tier || 1;

  ctx.save();
  ctx.translate(CX,CY);
  ctx.rotate(p.roll);
  ctx.translate(-CX,-CY);

  // ── CANOPY FRAME — solid structure around a windscreen opening ──
  // Previously two thin A-pillar lines, which read as an overlay rather than a
  // ship. Filling everything outside the opening gives the frame real mass and a
  // silhouette. Drawn first so the console below and every instrument after it
  // land on top: drawCockpit is the first HUD call, so radar, MFD, warnings and
  // target brackets all stay legible, and the opening keeps the central view clear.
  _canopyFrame(shipCol, tier);

  // ── DASHBOARD / CONSOLE PANEL (bottom) ──
  // Solid dark fill so space doesn't show through
  ctx.fillStyle='#010a08';
  ctx.beginPath();
  ctx.moveTo(0, H*.78);
  ctx.lineTo(W*.12, H*.72);
  ctx.lineTo(W*.28, H*.76);
  ctx.lineTo(W*.42, H*.71);
  ctx.lineTo(CX, H*.73);
  ctx.lineTo(W*.58, H*.71);
  ctx.lineTo(W*.72, H*.76);
  ctx.lineTo(W*.88, H*.72);
  ctx.lineTo(W, H*.78);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // Console surface wireframe lines
  ctx.strokeStyle=shipCol; ctx.lineWidth=1.5; ctx.globalAlpha=.35;
  ctx.beginPath();
  ctx.moveTo(0, H*.78);
  ctx.lineTo(W*.12, H*.72);
  ctx.lineTo(W*.28, H*.76);
  ctx.lineTo(W*.42, H*.71);
  ctx.lineTo(CX, H*.73);
  ctx.lineTo(W*.58, H*.71);
  ctx.lineTo(W*.72, H*.76);
  ctx.lineTo(W*.88, H*.72);
  ctx.lineTo(W, H*.78);
  ctx.stroke();

  // Console detail lines
  ctx.globalAlpha=.15; ctx.lineWidth=1;
  // Horizontal scan lines across console
  for(let y=H*.76; y<H*.95; y+=H*.035){
    ctx.beginPath(); ctx.moveTo(W*.1, y); ctx.lineTo(W*.9, y); ctx.stroke();
  }
  // Center vertical
  ctx.globalAlpha=.2;
  ctx.beginPath(); ctx.moveTo(CX, H*.73); ctx.lineTo(CX, H*.95); ctx.stroke();

  // ── INSTRUMENT BLOCKS (left & right of center) ──
  // Recessed rather than outlined: a dark well, a shadowed top-left edge and a lit
  // bottom-right edge. Two extra strokes per panel is all it takes to read as
  // depth instead of a rectangle drawn on a flat surface.
  const _inset = (x, y, w, h) => {
    ctx.globalAlpha=.55; ctx.fillStyle='#000503';
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha=.30; ctx.lineWidth=1.5; ctx.strokeStyle='#000000';
    ctx.beginPath(); ctx.moveTo(x, y+h); ctx.lineTo(x, y); ctx.lineTo(x+w, y); ctx.stroke();
    ctx.globalAlpha=.22; ctx.strokeStyle=shipCol;
    ctx.beginPath(); ctx.moveTo(x+w, y); ctx.lineTo(x+w, y+h); ctx.lineTo(x, y+h); ctx.stroke();
  };
  _inset(W*.18, H*.77, W*.12, H*.08);
  _inset(W*.18, H*.86, W*.12, H*.05);
  _inset(W*.70, H*.77, W*.12, H*.08);
  _inset(W*.70, H*.86, W*.12, H*.05);
  ctx.strokeStyle=shipCol;

  // ── NOSE / CANOPY STRUTS ──
  ctx.lineWidth=2; ctx.globalAlpha=.4; ctx.strokeStyle=shipCol;

  // Center nose strut — extends from console up toward crosshair area
  ctx.beginPath();
  ctx.moveTo(CX, H*.73);
  ctx.lineTo(CX, H*.58);
  ctx.stroke();

  // Nose tip — small V shape pointing forward
  ctx.lineWidth=1.5; ctx.globalAlpha=.3;
  ctx.beginPath();
  ctx.moveTo(CX-20, H*.60);
  ctx.lineTo(CX, H*.54);
  ctx.lineTo(CX+20, H*.60);
  ctx.stroke();


  // Secondary struts (depends on ship tier — more struts = heavier ship)
  if(tier >= 2){
    ctx.globalAlpha=.12; ctx.lineWidth=1;
    // Left mid strut
    ctx.beginPath();
    ctx.moveTo(W*.12, H*.72); ctx.lineTo(W*.20, H*.35); ctx.stroke();
    // Right mid strut
    ctx.beginPath();
    ctx.moveTo(W*.88, H*.72); ctx.lineTo(W*.80, H*.35); ctx.stroke();
  }
  if(tier >= 3){
    // Inner diagonal braces
    ctx.globalAlpha=.08;
    ctx.beginPath();
    ctx.moveTo(W*.28, H*.76); ctx.lineTo(W*.25, H*.25); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W*.72, H*.76); ctx.lineTo(W*.75, H*.25); ctx.stroke();
  }
  if(tier >= 4){
    // Heavy ship gets lower side panels
    ctx.globalAlpha=.1;
    ctx.beginPath();
    ctx.moveTo(0, H*.45); ctx.lineTo(W*.05, H*.55); ctx.lineTo(W*.04, H*.68); ctx.lineTo(0, H*.78);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W, H*.45); ctx.lineTo(W*.95, H*.55); ctx.lineTo(W*.96, H*.68); ctx.lineTo(W, H*.78);
    ctx.stroke();
  }

  // ── HARDPOINT INDICATORS (bottom corners of console) ──
  const hps = p.hardpoints;
  const hpCount = hps.length;
  const hpStartX = CX - (hpCount-1)*18;
  ctx.globalAlpha=.5;
  hps.forEach((hp, i) => {
    const hx = hpStartX + i*36;
    const hy = H*.92;
    const hasWpn = !!hp.weapon;
    const isActive = hasWpn && hp.weapon.type === p.activeGroup;
    const wpnCol = hasWpn ? hp.weapon.col : '#333333';

    // Hardpoint box
    ctx.strokeStyle = isActive ? wpnCol : '#334444';
    ctx.lineWidth = isActive ? 1.5 : 1;
    ctx.globalAlpha = isActive ? .7 : .25;
    ctx.strokeRect(hx-8, hy-6, 16, 12);

    // Type letter
    ctx.fillStyle = isActive ? wpnCol : '#446655';
    ctx.globalAlpha = isActive ? .8 : .3;
    ctx.font = 'bold 8px Courier New'; ctx.textAlign = 'center';
    ctx.fillText(hp.type, hx, hy+3);

    // Active fire indicator — pulsing glow
    if(isActive && hp.fireCd > 0){
      ctx.globalAlpha = .3 * (hp.fireCd / (hp.weapon?.cd||1));
      ctx.fillStyle = wpnCol;
      ctx.fillRect(hx-8, hy-6, 16, 12);
    }
    // Active laser beam indicator
    if(hp.laserBeam){
      ctx.globalAlpha = .4;
      ctx.fillStyle = hp.laserBeam.col;
      ctx.fillRect(hx-6, hy+8, 12, 2);
    }
  });

  // ── SHIP NAME in console ──
  ctx.globalAlpha=.2;
  ctx.fillStyle=shipCol;
  ctx.font='8px Courier New'; ctx.textAlign='left';
  ctx.fillText(SHIP_DEFS[p.shipKey]?.name || 'UNKNOWN', W*.20, H*.84);

  // Engine tier indicator
  const bestEngIdx = Math.max(...p.engines);
  const engName = ENGINE_TIERS[bestEngIdx]?.name || '';
  ctx.textAlign='right';
  ctx.fillText(engName, W*.82, H*.84);

  ctx.restore();

  // ── SPEED BAR (doesn't roll) ──
  const spdNow=v3len(p.vel);
  const boostActive = keys['shift'] && p.fuel > 0;
  const dispMax = boostActive ? p.maxSpd * 1.5 : p.maxSpd;
  const frac=Math.min(1,spdNow/dispMax);
  const bW=160, bH=4, bX=CX-bW/2, bY=H-28;
  ctx.fillStyle='#010a08'; ctx.fillRect(bX-1,bY-1,bW+2,bH+2);
  ctx.strokeStyle=shipCol+'44'; ctx.lineWidth=1; ctx.strokeRect(bX,bY,bW,bH);
  ctx.fillStyle=boostActive?'#ffaa00':frac>.8?'#ffaa00':shipCol;
  ctx.globalAlpha=.7;
  ctx.fillRect(bX,bY,bW*frac,bH);
  // Boost indicator text
  if(boostActive){
    ctx.globalAlpha=0.6; ctx.fillStyle='#ffaa00';
    ctx.font='7px Courier New'; ctx.textAlign='center';
    ctx.fillText('BOOST', CX, bY-4);
  }
  ctx.globalAlpha=1;

  // ── DAMAGE SPARKS on cockpit when armour is gone ──
  if(p.armour <= 0 && p.struct > 0){
    const severity = 1 - (p.struct / p.maxStruct);
    if(Math.random() < severity * 0.3){
      const sx = CX + (Math.random()-0.5)*W*0.6;
      const sy = H*0.7 + Math.random()*H*0.25;
      ctx.globalAlpha = 0.6+Math.random()*0.4;
      ctx.fillStyle = Math.random()<0.5?'#ffaa00':'#ff4400';
      ctx.beginPath(); ctx.arc(sx,sy,1+Math.random()*3,0,PI2); ctx.fill();
    }
  }
  ctx.globalAlpha=1;
}

// ═══════════════════════════════════════════════════════════
//  RADAR
// ═══════════════════════════════════════════════════════════
function drawRadar(){
  const p=G.p,rX=W-100,rY=H-160,rR=60;
  const fwd=qFwd(p.ori),right=qRight(p.ori);
  const escortNPC = G.missions?.active?._escortNPC || null;

  ctx.fillStyle='#000a08';ctx.globalAlpha=.5;
  ctx.beginPath();ctx.arc(rX,rY,rR,0,PI2);ctx.fill();
  ctx.globalAlpha=.3;ctx.strokeStyle='#00ffcc';ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(rX,rY,rR,0,PI2);ctx.stroke();
  ctx.globalAlpha=.1;
  ctx.beginPath();ctx.arc(rX,rY,rR*.5,0,PI2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(rX-rR,rY);ctx.lineTo(rX+rR,rY);
  ctx.moveTo(rX,rY-rR);ctx.lineTo(rX,rY+rR);ctx.stroke();

  ctx.globalAlpha=.6;ctx.fillStyle='#00ffcc';
  ctx.beginPath();ctx.arc(rX,rY,2,0,PI2);ctx.fill();
  ctx.strokeStyle='#00ffcc';ctx.lineWidth=1;ctx.globalAlpha=.35;
  ctx.beginPath();ctx.moveTo(rX,rY);ctx.lineTo(rX,rY-12);ctx.stroke();

  const range=4000;
  function rPlot(wPos,col,shape){
    const rel=v3sub(wPos,p.pos);
    const rF=v3dot(rel,fwd),rR2=v3dot(rel,right);
    if(Math.sqrt(rF*rF+rR2*rR2)>range)return;
    const sx=rX+(rR2/range)*rR,sy=rY-(rF/range)*rR;
    ctx.globalAlpha=.7;ctx.fillStyle=col;
    if(shape==='r')ctx.fillRect(sx-2,sy-2,4,4);
    else if(shape==='t'){ctx.beginPath();ctx.moveTo(sx,sy-3);ctx.lineTo(sx+3,sy+2);ctx.lineTo(sx-3,sy+2);ctx.closePath();ctx.fill();}
    else{ctx.beginPath();ctx.arc(sx,sy,1.5,0,PI2);ctx.fill();}
  }
  G.stations.forEach(st=>rPlot(st.pos,st.col,'r'));
  G.pBases.forEach(pb=>rPlot(pb.pos,'#ff4400','t'));
  if(G.launchZone){
    // Pulsing cyan ring for launch zone
    const rel=v3sub(G.launchZone.pos,p.pos);
    const rF2=v3dot(rel,fwd),rR3=v3dot(rel,right);
    if(Math.sqrt(rF2*rF2+rR3*rR3)<range){
      const sx=rX+(rR3/range)*rR,sy=rY-(rF2/range)*rR;
      const pulse=.5+.5*Math.sin(G.time*3);
      ctx.globalAlpha=.4+.3*pulse;ctx.strokeStyle='#50c8ff';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(sx,sy,3,0,PI2);ctx.stroke();
    }
  }
  G.enemies.forEach(e=>{
    if(e.isCapital){
      // Large pulsing diamond for capital ships
      const rel=v3sub(e.pos,p.pos);
      const rF2=v3dot(rel,fwd),rR3=v3dot(rel,right);
      if(Math.sqrt(rF2*rF2+rR3*rR3)>range) return;
      const sx=rX+(rR3/range)*rR,sy=rY-(rF2/range)*rR;
      const pulse=.5+.5*Math.sin(G.time*4);
      ctx.globalAlpha=.5+.4*pulse; ctx.fillStyle=e.col;
      ctx.beginPath();
      ctx.moveTo(sx,sy-5); ctx.lineTo(sx+4,sy); ctx.lineTo(sx,sy+5); ctx.lineTo(sx-4,sy);
      ctx.closePath(); ctx.fill();
    } else {
      let col=e.col, shape='d';
      if(e.aiRole==='recovery'){ col='#ff9944'; shape='r'; }
      else if(e.hostile) col='#ff4400';
      // Escort mission target — pulsing green ring on radar
      if(escortNPC && e===escortNPC){
        const rel2=v3sub(e.pos,p.pos);
        const rF3=v3dot(rel2,fwd),rR4=v3dot(rel2,right);
        if(Math.sqrt(rF3*rF3+rR4*rR4)<range){
          const ex=rX+(rR4/range)*rR, ey=rY-(rF3/range)*rR;
          const ep=.5+.5*Math.sin(G.time*3);
          ctx.globalAlpha=.5+.4*ep; ctx.strokeStyle='#44ff88'; ctx.lineWidth=1.5;
          ctx.beginPath(); ctx.arc(ex,ey,4,0,PI2); ctx.stroke();
          ctx.fillStyle='#44ff88'; ctx.globalAlpha=.3+.3*ep;
          ctx.beginPath(); ctx.arc(ex,ey,2,0,PI2); ctx.fill();
        }
        col='#44ff88';
      }
      rPlot(e.pos,col,shape);
    }
  });
  // Cargo boxes — small green dots
  G.cargoBoxes.forEach(box=>rPlot(box.pos,'#88ff44','d'));
  // Asteroids — brownish dots
  (G.asteroids||[]).forEach(ast=>rPlot(ast.pos,'#8B7355','d'));
  ctx.globalAlpha=1;

  ctx.fillStyle='#00ffcc';ctx.globalAlpha=.25;ctx.font='7px Courier New';ctx.textAlign='center';
  ctx.fillText('RADAR',rX,rY+rR+12);ctx.globalAlpha=1;
}

// ═══════════════════════════════════════════════════════════
//  HUD UPDATE
// ═══════════════════════════════════════════════════════════
function updHUD(){
  if(!G)return;
  document.getElementById('mouse-ring').style.display = G.mode==='space' ? 'block' : 'none';
  const p=G.p;
  const ap=p.armour/p.maxArmour,sp=p.struct/p.maxStruct,fp=p.fuel/p.maxFuel;
  document.getElementById('b-armour').style.width=(ap*100)+'%';
  document.getElementById('b-struct').style.width=(sp*100)+'%';
  document.getElementById('b-fuel').style.width=(fp*100)+'%';
  document.getElementById('v-armour').textContent=Math.ceil(p.armour);
  document.getElementById('v-struct').textContent=Math.ceil(p.struct);
  document.getElementById('v-fuel').textContent=Math.ceil(p.fuel);
  document.getElementById('speed-disp').textContent=`${Math.round(v3len(p.vel))} M/S`;
  document.getElementById('credits-disp').textContent=`⬡ ${p.credits} CR`;
  document.getElementById('cargo-disp').textContent=`CARGO: ${p.cargoUsed}/${p.cargoMax}`;

  // Outlaw indicator
  const od=document.getElementById('outlaw-disp');
  if(p.outlaw){
    od.style.display='block';
    od.textContent=`⚠ OUTLAW ${Math.ceil(p.outlawTimer)}s`;
  } else if(p.friendlyHits>0){
    od.style.display='block';
    od.style.color='#ffaa00';
    od.textContent=`WARNING ${p.friendlyHits}/${OUTLAW_THRESHOLD} FRIENDLY HITS`;
  } else {
    od.style.display='none';
  }

  // Mission indicator
  const md=document.getElementById('mission-disp');
  const am=G.missions?.active;
  if(am && md){
    md.style.display='block';
    const prog=missionProgress(am);
    const bar=prog.total>1?` ${prog.current}/${prog.total}`:'';
    md.innerHTML=`▶ ${am.title}${bar}`;
  } else if(md){
    md.style.display='none';
  }

  // Weapon group display
  const groups = getWeaponGroups(p);
  const gTypes = Object.keys(groups);
  const gLabels = {ballistic:'BALLISTIC',laser:'LASER',hypervelocity:'HYPERVEL'};
  if(gTypes.length > 0){
    const parts = gTypes.map(t => {
      const label = gLabels[t]||t.toUpperCase();
      const count = groups[t].length;
      return t===p.activeGroup ? `[${label}]×${count}` : `${label}`;
    });
    document.getElementById('wpn-disp').textContent = parts.join(' · ') + (gTypes.length>1?' [Q]':'');
  } else {
    document.getElementById('wpn-disp').textContent = 'NO WEAPONS';
  }

  // Ship info
  const shipDef = SHIP_DEFS[p.shipKey];
  document.getElementById('sys-name').textContent=SYS[G.sys].name;

  const spd=v3len(p.vel),fwd=qFwd(p.ori);
  const fwdC=spd>5?v3dot(p.vel,fwd):spd;
  const drift=spd>5?Math.acos(Math.max(-1,Math.min(1,fwdC/spd)))*180/PI:0;
  document.getElementById('vel-info').textContent=spd>5?`DRIFT: ${Math.round(drift)}°`:'';

  const ti=document.getElementById('target-info');
  // Prefer the T-targeted ship; fall back to nearest within 2000u
  let near=null, best=Infinity;
  G.enemies.forEach(e=>{const d=v3len(v3sub(e.pos,p.pos));if(d<best&&d<2000){best=d;near=e;}});
  const tgt = (G.targetShip && G.enemies.includes(G.targetShip) && G.targetShip.struct>0)
              ? G.targetShip : near;
  const tgtDist = tgt ? v3len(v3sub(tgt.pos,p.pos)) : 0;
  if(tgt){
    if(tgt.isCapital && tgt.components){
      let compHtml = tgt.components.map(c=>{
        const pct = c.maxHp>0?Math.round(c.hp/c.maxHp*100):0;
        const col = c.hp<=0?'#444':pct>50?'#00ff88':pct>25?'#ffaa00':'#ff4444';
        return `<span style="opacity:${c.hp>0?.6:.25};color:${col}">${c.name}: ${pct}%${c.isCore?' ★':''}</span>`;
      }).join('<br>');
      ti.innerHTML=`<span style="color:${tgt.col};font-size:11px">${tgt.name}</span><br>
        <span style="opacity:0.35;font-size:8px">CAPITAL</span><br>
        ${compHtml}<br>
        <span style="opacity:0.4">${Math.round(tgtDist)}m</span>`;
    } else {
      const armPct=tgt.maxArmour>0?Math.round(tgt.armour/tgt.maxArmour*100):0;
      const strPct=tgt.maxStruct>0?Math.round(tgt.struct/tgt.maxStruct*100):0;
      const role=tgt.aiRole?tgt.aiRole.toUpperCase():'';

      // Recovery: always show cargo hold status (X/5) so player can assess value
      const cargoCount = tgt._cargo?.length||0;
      const cargoLine = (tgt.aiRole==='recovery')
        ? `<br><span style="color:#ff9944">CARGO: ${cargoCount}/5 BOX${cargoCount!==1?'ES':''}</span>`
        : '';

      // Cargo freighter: show cargo owner faction → destination faction
      let routeLine = '';
      if(tgt.aiRole==='cargo'){
        const ownerFid   = tgt._cargoOwner || tgt.factionId;
        const ownerName  = FACTIONS[ownerFid]?.name || '?';
        const destFid    = tgt.routeB?.factionId;
        const destName   = (destFid && FACTIONS[destFid]?.name) || tgt.routeB?.name || '?';
        const ownerCol   = FACTIONS[ownerFid]?.col || '#888';
        const destCol    = (destFid && FACTIONS[destFid]?.col) || '#888';
        routeLine = `<br><span style="font-size:8px;opacity:0.7">` +
          `<span style="color:${ownerCol}">${ownerName}</span>` +
          ` <span style="opacity:0.4">→</span> ` +
          `<span style="color:${destCol}">${destName}</span> ASSETS</span>`;
      }

      ti.innerHTML=`<span style="color:${tgt.col}">${tgt.name}</span><br>
        <span style="opacity:0.35;font-size:8px">${role}</span><br>
        <span style="opacity:0.5">ARM: ${armPct}% · STR: ${strPct}%</span><br>
        <span style="opacity:0.4">${Math.round(tgtDist)}m</span>${cargoLine}${routeLine}`;
    }
  } else ti.innerHTML='';

  // §15 Critical warnings
  const armourGone = ap <= 0;
  const structLow = sp < 0.25 && sp > 0;
  const fuelLow = fp < 0.20;

  // One-shot big center warnings
  if(armourGone && !p.warnArmour){ p.warnArmour=true; bigWarn('ARMOUR BREACH!','#ff4400'); }
  if(!armourGone) p.warnArmour=false;
  if(structLow && !p.warnStruct){ p.warnStruct=true; bigWarn('STRUCTURAL INTEGRITY FAILING!','#ff2222'); }
  if(!structLow) p.warnStruct=false;
  if(fuelLow && !p.warnFuel){ p.warnFuel=true; bigWarn('LOW FUEL!','#ffaa00'); }
  if(!fuelLow) p.warnFuel=false;

  // Persistent warning overlay
  const wo=document.getElementById('warn-overlay');
  if(wo){
    let warnText='';
    if(structLow)            warnText='⚠ STRUCTURAL INTEGRITY FAILING';
    else if(armourGone)      warnText='⚠ ARMOUR BREACH';
    else if(fuelLow)         warnText='⚠ LOW FUEL';
    else if(G._proxDanger)   warnText='⚠ PROXIMITY ALARM';
    if(warnText){ wo.textContent=warnText; wo.style.opacity='1'; }
    else wo.style.opacity='0';
  }

  // Structure bar pulses
  const sf=document.getElementById('b-struct');
  if(sf) sf.style.background=sp<.25?'#ff0000':sp<.5?'#ff6633':'#ff3333';
}
