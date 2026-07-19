function spawnEnemyWave() {
  refreshFogVisibility();
  const candidates=collectFogSpawnCandidates();
  G.enemySpawnTimer = 0;
  G.enemySpawnQueue = [];
  if (!candidates.length) return;
  const bloodMoon=isBloodMoonDay(G.day);
  const baseCount=CFG.ENEMY_WAVE_BASE_COUNT+G.day*CFG.ENEMY_WAVE_PER_DAY;
  const count=Math.max(0,Math.ceil(baseCount*(bloodMoon?CFG.BLOOD_MOON_COUNT_MULTIPLIER:1)));
  const waves=clamp(1+Math.floor((G.day-1)/CFG.ENEMY_WAVE_DAY_STEP),1,CFG.ENEMY_WAVE_MAX);
  let remaining=count;
  for(let wave=0;wave<waves;wave++) {
    const waveCount=Math.ceil(remaining/(waves-wave));
    remaining-=waveCount;
    const waveStart=1+wave*(CFG.ENEMY_WAVE_DURATION+CFG.ENEMY_WAVE_INTERVAL);
    const reserved=[];
    for(let i=0;i<waveCount;i++) {
      const slot=(i+0.5+(Math.random()-0.5)*CFG.ENEMY_SPAWN_JITTER)/waveCount;
      const point=pickFogSpawnCandidate(candidates,reserved);
      if (!point) continue;
      reserved.push(point);
      G.enemySpawnQueue.push({delay:waveStart+clamp(slot,0,1)*CFG.ENEMY_WAVE_DURATION,x:point.x,y:point.y,wave,type:pickEnemyType(G.day,bloodMoon),bloodMoon});
    }
  }
}

function pickEnemyType(day,bloodMoon=false) {
  const unlockKey=bloodMoon?'bloodMoonUnlockDay':'unlockDay',weightKey=bloodMoon?'bloodMoonSpawnWeight':'spawnWeight';
  const eligible=Object.entries(ENEMY_DEFS).filter(([,def])=>day>=Math.max(1,Number(def[unlockKey]??def.unlockDay)||1));
  const total=eligible.reduce((sum,[,def])=>sum+Math.max(0,Number(def[weightKey]??def.spawnWeight)||0),0);
  if (total<=0) return 'normal';
  let roll=Math.random()*total;
  for (const [type, def] of eligible) {
    roll-=Math.max(0,Number(def[weightKey]??def.spawnWeight)||0);
    if (roll<=0) return type;
  }
  return eligible[eligible.length-1][0];
}

function collectFogSpawnCandidates() {
  const candidates=[];
  const minDepth=CFG.ENEMY_SPAWN_FOG_DEPTH;
  const maxDepth=minDepth+1;
  const radius=Math.ceil(maxDepth);
  for(let col=0;col<CFG.WORLD_COLS;col++) for(let row=0;row<CFG.WORLD_ROWS;row++) {
    if (isFogCellVisible(col,row)) continue;
    let nearest=Infinity;
    for(let dc=-radius;dc<=radius;dc++) for(let dr=-radius;dr<=radius;dr++) {
      const distance=Math.hypot(dc,dr);
      if (distance>=nearest||distance>maxDepth) continue;
      if (isFogCellVisible(col+dc,row+dr)) nearest=distance;
    }
    if (nearest>=minDepth&&nearest<=maxDepth) {
      candidates.push({x:gridX(col)+CFG.CELL/2+(Math.random()-0.5)*CFG.CELL*0.45,y:gridY(row)+CFG.CELL/2+(Math.random()-0.5)*CFG.CELL*0.45});
    }
  }
  return candidates;
}

function pickFogSpawnCandidate(candidates,reserved) {
  if (!candidates.length) return null;
  for(let attempt=0;attempt<16;attempt++) {
    const point=candidates[Math.floor(Math.random()*candidates.length)];
    if (reserved.every(other=>Math.hypot(point.x-other.x,point.y-other.y)>=CFG.CELL*1.5)) return point;
  }
  return candidates[Math.floor(Math.random()*candidates.length)];
}

function spawnEnemy(entry) {
  if (!entry || isWorldVisible(entry.x,entry.y)) return false;
  G.enemies.push(new Enemy(entry.x,entry.y,entry.type,{bloodMoon:entry.bloodMoon}));
  return true;
}

function enemyRouteBlocker(e) {
  const dx=e.targetX-e.x, dy=e.targetY-e.y;
  const routeLength=Math.hypot(dx,dy);
  if (routeLength<0.01) return null;
  let best=null, bestAlong=Infinity, bestDistance=Infinity;
  let preferred=null, preferredAlong=Infinity, preferredDistance=Infinity;
  for (const b of G.buildings) {
    if (!buildingBlocksMovement(b)) continue;
    const c=b.center();
    const along=((c.x-e.x)*dx+(c.y-e.y)*dy)/routeLength;
    if (along < -0.01 || along > routeLength+0.01) continue;
    const side=Math.abs((c.x-e.x)*dy-(c.y-e.y)*dx)/routeLength;
    const reach=b.collisionRadius()+CFG.ENEMY_ATTACK_RANGE+5;
    if (side>reach) continue;
    const distance=Math.hypot(c.x-e.x,c.y-e.y);
    if (along<bestAlong-0.01 || (Math.abs(along-bestAlong)<0.01 && distance<bestDistance)) {
      best=b; bestAlong=along; bestDistance=distance;
    }
    if (e.type==='breaker' && BLD_DEFS[b.type].cat==='defense' &&
        (along<preferredAlong-0.01 || (Math.abs(along-preferredAlong)<0.01 && distance<preferredDistance))) {
      preferred=b; preferredAlong=along; preferredDistance=distance;
    }
  }
  return preferred || best;
}

function enemyCanAttackBuilding(e,b) {
  if (!b || b.hp<=0) return false;
  const c=b.center();
  return Math.hypot(e.x-c.x,e.y-c.y) <= b.collisionRadius()+e.attackRange+5;
}

function enemyFacingPoint(e) {
  const guard=e.fightingGuard||e.guardTarget;
  if(guard&&guard.guardHP>0&&!guard.hidden) return {x:guard.x,y:guard.y};
  if(e.attacking&&e.attacking.hp>0) return e.attacking.center();
  return {x:e.targetX,y:e.targetY};
}

function enemyAggroGuard(e, guard) {
  if (!e || !e.alive || !guard || !guard.isGuard || guard.guardHP<=0 || guard.hidden) return;
  e.guardTarget=guard;
  e.attacking=null;
}

function enemyCanChaseGuard(e, guard) {
  if (!guard || !guard.isGuard || guard.guardHP<=0 || guard.hidden) return false;
  if (guard.state==='GUARD_RETURNING' || guard.state==='GUARD_HEALING' || guard.state==='GUARD_GOING_HOME' || guard.state==='GUARD_SLEEPING') return false;
  return Math.hypot(e.x-guard.x,e.y-guard.y)<=CFG.ENEMY_GUARD_LEASH;
}

function updateEnemyGuardCombat(e, dt) {
  const guard=e.guardTarget || e.fightingGuard;
  if (!enemyCanChaseGuard(e,guard)) {
    e.guardTarget=null; e.fightingGuard=null;
    return false;
  }
  e.attacking=null;
  const distance=Math.hypot(e.x-guard.x,e.y-guard.y);
  if (distance>e.attackRange+4) {
    e.fightingGuard=null;
    moveViaFlow(e,guard.x,guard.y,e.speed,dt);
    return true;
  }
  e.fightingGuard=guard;
  e.attackTimer += dt;
  if (e.attackTimer >= 0.5) {
    e.attackTimer = 0;
    guard.guardHP -= e.damage;
    spawnParticles(e.x, e.y, '#ff4444', 2);
    playGameSound('damage',guard.x,guard.y);
    if (guard.guardHP <= 0) {
      guard.guardHP=0;
      guard.controlMode='auto'; guard.manualTarget=null; guard.manualTargetEnemy=null;
      guard.state='GUARD_RETURNING'; guard.manningTower=null;
      e.guardTarget=null; e.fightingGuard=null;
    }
  }
  return true;
}

function updateEnemies(dt) {
  G.enemySpawnTimer += dt;
  for (let i=G.enemySpawnQueue.length-1; i>=0; i--) {
    if (G.enemySpawnQueue[i].delay <= G.enemySpawnTimer) {
      if (spawnEnemy(G.enemySpawnQueue[i])) G.enemySpawnQueue.splice(i,1);
    }
  }
  for (const e of G.enemies) {
    if (!e.alive) continue;
    if (updateEnemyGuardCombat(e,dt)) continue;
    if(e.attacking&&!enemyCanAttackBuilding(e,e.attacking)) e.attacking=null;
    // Building attack
    if (e.attacking && e.attacking.hp>0) {
      e.attackTimer += dt;
      if (e.attackTimer >= 0.5) {
        e.attackTimer = 0;
        e.attacking.hp -= buildingDamageTaken(e.attacking, e.damage);
        spawnParticles(e.x,e.y,'#ff4444',3);
        const center=e.attacking.center();playGameSound('damage',center.x,center.y);
        if (e.attacking.hp <= 0) { e.attacking.hp = 0; e.attacking = null; }
      }
    } else {
      e.attacking = null;
      // Attack the first building that physically blocks the route
      // to the town hall. This makes walls and front-line buildings reliable.
      const blocker=enemyRouteBlocker(e);
      if (enemyCanAttackBuilding(e, blocker)) {
        e.attacking=blocker; e.attackTimer=0;
      } else {
        moveViaFlow(e,e.targetX,e.targetY,e.speed,dt);
      }
    }
  }
  G.enemies = G.enemies.filter(e=>e.alive && e.hp>0);

  // Homeless residents at night can be attacked (exclude guards)
  if (G.phase==='night') {
    for (const e of G.enemies) {
      if (!e.alive || e.attacking || e.fightingGuard || e.guardTarget) continue;
      for (const r of G.residents) {
        if (r.isGuard) continue;
        if (r.state==='SLEEPING') continue;
        if (r.home) continue;
        const d = Math.hypot(e.x-r.x, e.y-r.y);
        if (d < 20) {
          removeResident(r);
          spawnParticles(r.x, r.y, '#ff0000', 8);
          break;
        }
      }
    }
  }
}

function getGuardPatrol() {
  let cx = 0, cy = 0, n = 0;
  for (const b of G.buildings) {
    if (b.hp <= 0 || b.blueprint) continue;
    const c = b.center();
    cx += c.x; cy += c.y; n++;
  }
  if (n === 0) { const th = G.townHall; if (!th) return { x:3000, y:3000, r:500 }; const tc = th.center(); return { x: tc.x, y: tc.y, r: 200 }; }
  cx /= n; cy /= n;
  let maxR = 0;
  for (const b of G.buildings) {
    if (b.hp <= 0 || b.blueprint) continue;
    const c = b.center();
    const d = Math.hypot(c.x - cx, c.y - cy) + b.collisionRadius();
    if (d > maxR) maxR = d;
  }
  return { x: cx, y: cy, r: maxR + 100 };
}

function isPatrolPointClear(x,y) {
  const padding=RESIDENT_RADIUS+2;
  for(const b of G.buildings) {
    const width=b.size[0]*CFG.CELL,height=b.size[1]*CFG.CELL;
    if(x>=b.x-padding&&x<=b.x+width+padding&&y>=b.y-padding&&y<=b.y+height+padding) return false;
  }
  return true;
}

function choosePatrolTarget(r,boundary=null) {
  for(let attempt=0;attempt<24;attempt++) {
    const angle=Math.random()*Math.PI*2,distance=45+Math.random()*85;
    let x=r.x+Math.cos(angle)*distance,y=r.y+Math.sin(angle)*distance;
    if(boundary) {
      const dx=x-boundary.x,dy=y-boundary.y,fromCenter=Math.hypot(dx,dy);
      const limit=Math.max(10,boundary.r-RESIDENT_RADIUS-4);
      if(fromCenter>limit){x=boundary.x+dx/fromCenter*limit;y=boundary.y+dy/fromCenter*limit;}
    }
    x=clamp(x,RESIDENT_RADIUS,CFG.WORLD_W-RESIDENT_RADIUS);
    y=clamp(y,RESIDENT_RADIUS,CFG.WORLD_H-RESIDENT_RADIUS);
    if(isStaticPatrolVisible(x,y)&&isPatrolPointClear(x,y)) return {x,y};
  }
  return null;
}

function releaseGuardTower(r) {
  const tower=r.manningTower || r.assignedTower;
  if (tower && tower.assignedGuard===r) tower.assignedGuard=null;
  r.manningTower=null;
  r.assignedTower=null;
}

function setGuardControlMode(r, mode) {
  if (!r || !r.isGuard || r.guardHP<=0 || r.hidden || !isWorldVisible(r.x,r.y)) return false;
  clearNavigation(r);r.patrolTarget=null;r.formationCommandId=0;
  if (mode==='manual') {
    releaseGuardTower(r);
    r.controlMode='manual'; r.manualTarget=null; r.manualTargetEnemy=null;
    r.targetX=r.x;r.targetY=r.y;r.navDebugTarget={x:r.x,y:r.y};r.navDebugTick=G.tick;
    r.state='GUARD_MANUAL';
  } else {
    r.controlMode='auto'; r.manualTarget=null; r.manualTargetEnemy=null;
    r.targetX=r.x;r.targetY=r.y;r.navDebugTarget={x:r.x,y:r.y};r.navDebugTick=G.tick;
    if(G.phase==='night'||G.phase==='dusk') { r.state='GUARD_FIGHTING';r.hidden=false; }
    else sendGuardHomeForDay(r);
  }
  return true;
}

function guardAttackEnemy(r, enemy, dt) {
  r.guardAttackCD -= dt;
  if (r.guardAttackCD > 0) return;
  r.guardAttackCD=CFG.GUARD_ATTACK_COOLDOWN;
  enemy.hp-=CFG.GUARD_DAMAGE;
  enemyAggroGuard(enemy,r);
  spawnParticles(enemy.x,enemy.y,'#ffaa00',2);
  playGameSound('impact',enemy.x,enemy.y);
  if (enemy.hp<=0) {
    enemy.alive=false;
    spawnParticles(enemy.x,enemy.y,'#ff6600',5);
  }
}

function finishManualGuardCommand(r,point={x:r.x,y:r.y}) {
  r.manualTarget=null;r.manualTargetEnemy=null;
  r.targetX=point.x;r.targetY=point.y;
  r.navDebugTarget={x:point.x,y:point.y};r.navDebugTick=G.tick;
  clearNavigation(r);
}
function canIssueManualGuardMove(x,y) { return isWorldVisible(x,y); }

function updateManualGuard(r, dt) {
  let target=r.manualTargetEnemy;
  if (target && (!target.alive || target.hp<=0 || !isWorldVisible(target.x,target.y))) {
    finishManualGuardCommand(r);target=null;
  }
  if (target) {
    const distance=Math.hypot(target.x-r.x,target.y-r.y);
    if (distance<=20) guardAttackEnemy(r,target,dt);
    else moveManualGuardWithinVision(r,target.x,target.y,dt);
    return;
  }
  if (!r.manualTarget) return;
  if(!isWorldVisible(r.manualTarget.x,r.manualTarget.y)) { finishManualGuardCommand(r);return; }
  if(r.navBlockedGoal&&r.navResolvedPoint&&Math.hypot(r.navResolvedPoint.x-r.x,r.navResolvedPoint.y-r.y)<=4) {
    finishManualGuardCommand(r,r.navResolvedPoint);return;
  }
  const distance=Math.hypot(r.manualTarget.x-r.x,r.manualTarget.y-r.y);
  if (distance<=3) { finishManualGuardCommand(r,r.manualTarget);return; }
  moveManualGuardWithinVision(r,r.manualTarget.x,r.manualTarget.y,dt);
}
function moveManualGuardWithinVision(guard,targetX,targetY,dt) {
  const previousX=guard.x,previousY=guard.y;
  moveViaFlow(guard,targetX,targetY,CFG.GUARD_SPEED,dt);
  if(isWorldVisible(guard.x,guard.y)) return true;
  guard.x=previousX;guard.y=previousY;
  finishManualGuardCommand(guard,{x:previousX,y:previousY});
  return false;
}

function guardFormationAssignments(guards,target) {
  if(!guards.length) return [];
  const center=guards.reduce((sum,guard)=>({x:sum.x+guard.x,y:sum.y+guard.y}),{x:0,y:0});
  center.x/=guards.length; center.y/=guards.length;
  const dx=target.x-center.x,dy=target.y-center.y,length=Math.hypot(dx,dy)||1;
  const forward={x:dx/length,y:dy/length}, right={x:-forward.y,y:forward.x};
  const columns=Math.ceil(Math.sqrt(guards.length)), rows=Math.ceil(guards.length/columns), spacing=RESIDENT_RADIUS*3;
  const slots=[];
  for(let index=0;index<guards.length;index++) {
    const col=index%columns,row=Math.floor(index/columns);
    const lateral=(col-(columns-1)/2)*spacing,depth=(row-(rows-1)/2)*spacing;
    slots.push({
      x:clamp(target.x+right.x*lateral+forward.x*depth,RESIDENT_RADIUS,CFG.WORLD_W-RESIDENT_RADIUS),
      y:clamp(target.y+right.y*lateral+forward.y*depth,RESIDENT_RADIUS,CFG.WORLD_H-RESIDENT_RADIUS),
      lateral,depth
    });
  }
  const orderedGuards=guards.map((guard,index)=>({
    guard,index,
    depth:(guard.x-center.x)*forward.x+(guard.y-center.y)*forward.y,
    lateral:(guard.x-center.x)*right.x+(guard.y-center.y)*right.y
  })).sort((a,b)=>a.depth-b.depth||a.lateral-b.lateral||a.index-b.index);
  const orderedSlots=[...slots].sort((a,b)=>a.depth-b.depth||a.lateral-b.lateral);
  return orderedGuards.map((entry,index)=>({guard:entry.guard,target:orderedSlots[index]}));
}
function guardMovementClusters(guards,maxSize=25,joinDistance=320) {
  const remaining=new Set(guards),clusters=[];
  while(remaining.size) {
    const seed=remaining.values().next().value,cluster=[seed];
    remaining.delete(seed);
    while(cluster.length<maxSize&&remaining.size) {
      const center=cluster.reduce((sum,guard)=>({x:sum.x+guard.x/cluster.length,y:sum.y+guard.y/cluster.length}),{x:0,y:0});
      let nearest=null,nearestDistance=Infinity;
      for(const guard of remaining) {
        const distance=Math.hypot(guard.x-center.x,guard.y-center.y);
        if(distance<nearestDistance){nearestDistance=distance;nearest=guard;}
      }
      if(!nearest||nearestDistance>joinDistance) break;
      cluster.push(nearest);remaining.delete(nearest);
    }
    clusters.push(cluster);
  }
  return clusters;
}
function assignGuardGroupMove(guards,target) {
  const assignments=fitGuardFormationToVisibility(guardFormationAssignments(guards,target),target);
  if(!assignments.length) return assignments;
  const commandId=++G.guardMoveCommandSequence;
  const assignmentByGuard=new Map(assignments.map(assignment=>[assignment.guard,assignment]));
  const grid=ensureNavigationGrid();
  for(const cluster of guardMovementClusters(guards)) {
    const center=cluster.reduce((sum,guard)=>({x:sum.x+guard.x/cluster.length,y:sum.y+guard.y/cluster.length}),{x:0,y:0});
    const clusterTarget=cluster.reduce((sum,guard)=>{
      const slot=assignmentByGuard.get(guard).target;
      return {x:sum.x+slot.x/cluster.length,y:sum.y+slot.y/cluster.length};
    },{x:0,y:0});
    const leader={x:center.x,y:center.y,workplace:null,home:null,buildTarget:null};
    const blocker=firstBlockingObstacle(leader,clusterTarget.x,clusterTarget.y);
    const sharedPlan=blocker?findNavigationPath(center.x,center.y,clusterTarget.x,clusterTarget.y):null;
    for(const guard of cluster) {
      const slot=assignmentByGuard.get(guard).target;
      clearNavigation(guard);
      guard.manualTargetEnemy=null; guard.manualTarget=slot;
      guard.formationCommandId=commandId;
      guard.targetX=slot.x;guard.targetY=slot.y;guard.navDebugTarget={x:slot.x,y:slot.y};guard.navDebugTick=G.tick;
      guard.navTargetX=slot.x;guard.navTargetY=slot.y;guard.navRevision=G.navigationRevision;
      let route=[];
      if(sharedPlan&&sharedPlan.points.length&&navigationLineClear(guard,sharedPlan.points[0],grid)) route=sharedPlan.points.map(point=>({x:point.x,y:point.y}));
      const routeEnd=route.length?route[route.length-1]:guard;
      if(navigationLineClear(routeEnd,slot,grid)) route.push({x:slot.x,y:slot.y});
      if(route.length) {
        guard.navPath=route;guard.navPathIndex=0;
        guard.navResolvedPoint=route[route.length-1];
        guard.navBlockedGoal=!navigationLineClear(guard.navResolvedPoint,slot,grid);
      }
    }
  }
  return assignments;
}
function fitGuardFormationToVisibility(assignments,commandTarget) {
  if(!G.fogVisible) return assignments;
  const occupied=new Set(),step=RESIDENT_RADIUS*2.5;
  const reserve=point=>{occupied.add(point.x.toFixed(2)+','+point.y.toFixed(2));return point;};
  const available=point=>isWorldVisible(point.x,point.y)&&!occupied.has(point.x.toFixed(2)+','+point.y.toFixed(2));
  return assignments.map(assignment=>{
    if(available(assignment.target)) return {...assignment,target:reserve(assignment.target)};
    for(let ring=1;ring<=10;ring++) for(let index=0;index<16;index++) {
      const angle=index*Math.PI/8;
      const candidate={
        x:clamp(assignment.target.x+Math.cos(angle)*ring*step,RESIDENT_RADIUS,CFG.WORLD_W-RESIDENT_RADIUS),
        y:clamp(assignment.target.y+Math.sin(angle)*ring*step,RESIDENT_RADIUS,CFG.WORLD_H-RESIDENT_RADIUS)
      };
      if(available(candidate)) return {...assignment,target:reserve(candidate)};
    }
    const fallback=available(commandTarget)?commandTarget:{x:assignment.guard.x,y:assignment.guard.y};
    return {...assignment,target:reserve(fallback)};
  });
}

function guardUpdateAI(r, dt) {
  const th = G.townHall; if (!th) return;
  if (r.controlMode==='manual') { updateManualGuard(r,dt); return; }
  const thCenter = th.center();
  const twoGameHours = gameDayDuration() * 2 / CLOCK_HOURS;

  switch (r.state) {
    case 'GUARD_GOING_HOME': {
      const home=ensureGuardHome(r);
      if(!home) { r.state='GUARD_SLEEPING';r.hidden=true;break; }
      setBuildingInteractionTarget(r,home);
      if(residentReachedBuilding(r,home)) {
        clearNavigation(r);r.state='GUARD_SLEEPING';r.hidden=true;r.guardHP=r.guardMaxHP;
      } else moveViaFlow(r,r.targetX,r.targetY,CFG.GUARD_SPEED,dt);
      break;
    }
    case 'GUARD_FIND_TOWER': {
      const tower = r.assignedTower;
      if (tower && tower.hp > 0 && !tower.blueprint && BLD_DEFS[tower.type].needsManning) {
        if (tower.assignedGuard && tower.assignedGuard !== r) {
          r.assignedTower = null; r.state = 'GUARD_FIGHTING'; break;
        }
        const tc = tower.guardSpot();
        r.targetX = tc.x; r.targetY = tc.y;
        const dx = tc.x - r.x, dy = tc.y - r.y, dd = Math.hypot(dx, dy) || 1;
        if (Math.hypot(r.x - tc.x, r.y - tc.y) < tower.collisionRadius() + RESIDENT_RADIUS + 5) {
          r.state = 'GUARD_MANNING'; r.manningTower = tower; tower.assignedGuard = r;
        } else {
          moveViaFlow(r, tc.x, tc.y, CFG.GUARD_SPEED, dt);
        }
      } else {
        r.assignedTower = null;
        r.state = 'GUARD_FIGHTING';
      }
      break;
    }
    case 'GUARD_MANNING': {
      if (!r.manningTower || r.manningTower.hp <= 0 || r.manningTower.blueprint || r.assignedTower !== r.manningTower) {
        if (r.manningTower && r.manningTower.assignedGuard === r) r.manningTower.assignedGuard = null;
        r.manningTower = null; r.state = r.assignedTower ? 'GUARD_FIND_TOWER' : 'GUARD_FIGHTING'; break;
      }
      // Stand at tower center
      const tc = r.manningTower.guardSpot();
      const dx = tc.x - r.x, dy = tc.y - r.y, dd = Math.hypot(dx, dy) || 1;
      if (Math.hypot(r.x - tc.x, r.y - tc.y) > 3) {
        const nx = r.x + (dx / dd) * CFG.RESIDENT_SPEED * 0.5 * dt;
        const ny = r.y + (dy / dd) * CFG.RESIDENT_SPEED * 0.5 * dt;
        r.x = nx; r.y = ny;
      }
      break;
    }
    case 'GUARD_FIGHTING': {
      // Seek nearest enemy within vision range (450px)
      let targetEnemy = null, bestD = 450;
      for (const e of G.enemies) {
        if (!e.alive||!isWorldVisible(e.x,e.y)) continue;
        const d = Math.hypot(r.x - e.x, r.y - e.y);
        if (d < bestD) { bestD = d; targetEnemy = e; }
      }
      // If no enemy in vision, prioritize enemies attacking buildings
      if (!targetEnemy) {
        for (const e of G.enemies) {
          if (!e.alive||!isWorldVisible(e.x,e.y)) continue;
          if (e.attacking && e.attacking.hp > 0) {
            targetEnemy = e; break;
          }
        }
      }
      if (targetEnemy) {
        const dx = targetEnemy.x - r.x, dy = targetEnemy.y - r.y, dd = Math.hypot(dx, dy) || 1;
        if (dd < 20) {
          guardAttackEnemy(r,targetEnemy,dt);
        } else {
          // Move toward enemy
          moveViaFlow(r, targetEnemy.x, targetEnemy.y, CFG.GUARD_SPEED, dt);
        }
      } else {
        // Patrol within building boundary
        const pb = getGuardPatrol();
        r.patrolTimer-=dt;
        const targetInvalid=!r.patrolTarget||Math.hypot(r.x-r.patrolTarget.x,r.y-r.patrolTarget.y)<6||
          Math.hypot(r.patrolTarget.x-pb.x,r.patrolTarget.y-pb.y)>pb.r||!isStaticPatrolVisible(r.patrolTarget.x,r.patrolTarget.y);
        if(r.patrolTimer<=0||targetInvalid) {
          r.patrolTarget=choosePatrolTarget(r,pb);
          r.patrolTimer=2+Math.random()*3;
        }
        if(r.patrolTarget) {
          r.targetX=r.patrolTarget.x;r.targetY=r.patrolTarget.y;
          moveViaFlow(r,r.targetX,r.targetY,CFG.GUARD_SPEED,dt);
        }
      }
      break;
    }
    case 'GUARD_RETURNING': {
      // Return to town hall
      setBuildingInteractionTarget(r,th);
      if (residentReachedBuilding(r,th)) {
        r.state = 'GUARD_HEALING'; r.guardHealTimer = twoGameHours; r.hidden = true;
      } else {
        moveViaFlow(r, r.targetX, r.targetY, CFG.GUARD_SPEED, dt);
      }
      break;
    }
    case 'GUARD_HEALING': {
      r.guardHealTimer = Math.max(0, r.guardHealTimer - dt);
      if (r.guardHealTimer <= 0) {
        r.guardHP = r.guardMaxHP;
        r.hidden = false;
        // Go back to fighting or find a tower
        if (r.assignedTower && r.assignedTower.hp > 0 && !r.assignedTower.blueprint) { r.state = 'GUARD_FIND_TOWER'; }
        else { r.assignedTower = null; r.state = 'GUARD_FIGHTING'; }
      }
      break;
    }
  }
}

function updateTowers(dt) {
  for (const b of G.buildings) {
    const def = buildingRuntimeDef(b);
    if (!def.range || b.hp <= 0 || b.ruin || b.blueprint || b.constructionTimer>0) continue;
    // Arrow tower: needs manning by a guard
    if (def.needsManning) {
      const guard=b.assignedGuard;
      const manned = guard && guard.manningTower === b && guard.state === 'GUARD_MANNING';
      if (!manned) continue;
    }
    b.attackCooldown -= dt;
    if (b.attackCooldown > 0) continue;
    const center = b.center();
    const range = towerRange(b);
    const damage = towerDamage(b);
    let closest = null, closestD = Infinity;
    for (const e of G.enemies) {
      if (!e.alive || !isWorldVisible(e.x,e.y)) continue;
      const d = dist(center, e);
      if (d < range && d < closestD) { closestD = d; closest = e; }
    }
    if (closest) {
      fireArrow(center,closest,damage);
      b.attackCooldown = def.cooldown;
    }
  }
}
