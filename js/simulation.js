// ============================================================
// INITIALIZE
// ============================================================
function initGame() {
  // 大本营在正中央
  const th = new Building('town_hall', 74, 74);
  G.buildings.push(th);
  G.townHall = th;
  th.stored = townHallStartingResources();
  updateAllResourceTotals();
  G.cam.x = th.x + CFG.CELL; G.cam.y = th.y + CFG.CELL;
  G.maxPop = CFG.MAX_POP_BASE;
  G.maxGuards = CFG.MAX_GUARD_BASE;

  for (let i=0; i<CFG.START_POP; i++) {
    const r = new Resident(
      th.x + 40 + (Math.random()-0.5)*100,
      th.y + 40 + (Math.random()-0.5)*100
    );
    assignHome(r, th);
    G.residents.push(r);
  }
  for (let i=0; i<Math.min(CFG.START_ENGINEERS, G.residents.length); i++) G.residents[i].isEngineer = true;
  const guard=new Resident(th.x+55, th.y+45);
  guard.isGuard=true; guard.state='GUARD_SLEEPING'; guard.hidden=true;
  assignHome(guard, th);
  G.residents.push(guard);
  initFloorMask();
  generateResources();
  initFog();
  refreshFogVisibility();
  generateAnimals();
}

function addBuilding(type, col, row, skipBlueprint) {
  const def = BLD_DEFS[type];
  const townHallLevel=G.townHall ? G.townHall.level : 1;
  if (!def||!buildingUnlockStatus(def,townHallLevel).unlocked||!canPlaceBuilding(type, col, row)) return null;
  const hasCost = Object.keys(def.cost||{}).length > 0;
  const b = new Building(type, col, row);
  if (hasCost && !skipBlueprint) {
    b.blueprint = true;
    b.constructCost = Object.assign({}, def.cost);
    b.constructDelivered = {};
    for (const k of Object.keys(def.cost)) b.constructDelivered[k] = 0;
    b.hp = 1; b.maxHp = def.hp;
  }
  G.buildings.push(b);
  invalidateNavigation();
  if (type==='house' && !b.blueprint) G.maxPop += BLD_DEFS[type].popBonus;
  if (type==='barracks' && !b.blueprint) G.maxGuards += BLD_DEFS[type].guardBonus;
  if (type==='farm') refreshFarmAdjacency();
  if (!b.blueprint) refreshFogVisibility();
  return b;
}

class ArrowProjectile {
  constructor(source, target, damage) {
    this.x=source.x; this.y=source.y;
    this.target=target; this.damage=damage;
    this.speed=CFG.ARROW_SPEED; this.life=0; this.maxLife=2.5;
    this.angle=Math.atan2(target.y-source.y,target.x-source.x);
    this.alive=true;
  }
}

function clearGuardPost(r, b) {
  if (!r.isGuard) return;
  if (r.assignedTower === b) r.assignedTower = null;
  if (r.manningTower === b) r.manningTower = null;
  if(G.phase==='night'||G.phase==='dusk') { r.state='GUARD_FIGHTING';r.hidden=false; }
  else if(r.state!=='GUARD_SLEEPING') sendGuardHomeForDay(r);
}

function demolishBuilding(b) {
  if (b.type==='town_hall') return; // 大本营不可拆除
  const idx = G.buildings.indexOf(b);
  if (idx===-1) return;
  b.outputHauler = null;
  b.inputHaulers.clear();
  invalidateNavigation();
  for (const r of G.residents) {
    if (r.workplace===b) { releaseProductionInputTask(r);r.workplace=null; r.chopTarget=null; r.state=r.carrying?'HAULING':'IDLE'; }
    if (r.home===b) { assignHome(r, findNearestHome(r, r.isGuard, b)); }
    if (r.assignedTower===b || r.manningTower===b) clearGuardPost(r,b);
    if (r.buildTarget===b) { r.buildTarget=null; r.state=r.carrying?'HAULING':'IDLE'; }
  }
  if (b.type==='house') G.maxPop = Math.max(CFG.MAX_POP_BASE, G.maxPop - BLD_DEFS[b.type].popBonus - (b.level-1)*2);
  if (b.type==='barracks') G.maxGuards = Math.max(CFG.MAX_GUARD_BASE, G.maxGuards - BLD_DEFS[b.type].guardBonus - (b.level-1)*2);
  G.buildings.splice(idx,1);
  if (b.assignedGuard) b.assignedGuard = null;
  if (b.type==='forester') {
    for (const node of G.resourceNodes) if (node.ownerForester===b) { node.ownerForester=null; node.marked=false; }
  }
  if (isStorage(b.type)) updateAllResourceTotals();
  if (b.type==='farm') refreshFarmAdjacency();
  refreshFogVisibility();
}
function scaledResourceCost(cost, ratio, round=Math.ceil) {
  const result={};
  for(const [type,amount] of Object.entries(cost||{})) {
    const scaled=round(amount*ratio);
    if(scaled>0) result[type]=scaled;
  }
  return result;
}
function ruinRebuildCost(b) { return scaledResourceCost(b.ruinCost||BLD_DEFS[b.type].cost,0.7,Math.ceil); }
function ruinSalvage(b) { return scaledResourceCost(b.ruinCost||BLD_DEFS[b.type].cost,0.2,Math.floor); }
function clearBuildingAssignments(b) {
  b.outputHauler=null; b.inputHaulers.clear(); b.upgrading=false; b.upgradeProgress=0; b.assignedEngineer=null;
  for (const r of G.residents) {
    if (r.workplace===b) { releaseProductionInputTask(r);r.workplace=null; r.chopTarget=null; r.state=r.carrying?'HAULING':'IDLE'; }
    if (r.home===b) assignHome(r,findNearestHome(r,r.isGuard,b));
    if (r.assignedTower===b || r.manningTower===b) clearGuardPost(r,b);
    if (r.buildTarget===b) { r.buildTarget=null; r.state=r.carrying?'HAULING':'IDLE'; }
  }
  if (b.type==='forester') for (const node of G.resourceNodes) if (node.ownerForester===b) { node.ownerForester=null; node.marked=false; }
}
function turnBuildingIntoRuin(b) {
  if (b.ruin||b.type==='town_hall') return;
  b.ruin=true; b.ruinCost=cloneResourceMap(BLD_DEFS[b.type].cost);
  b.hp=0; b.blueprint=false; b.constructCost=null; b.constructDelivered=null; b.constructionTimer=0;
  b.stored={}; b.pendingOutput=0; b.productionInputs={}; b.productionRoundActive=false;
  b.recruitQueue=0; b.recruitProgress=0;
  clearBuildingAssignments(b);
  recalculatePopulationLimits();
  invalidateNavigation(); refreshFarmAdjacency(); updateAllResourceTotals(); refreshFogVisibility();
}
function findNearestRepairTarget(resident) {
  let best=null, bestDistance=Infinity;
  for(const b of G.buildings) {
    if(b.ruin||b.blueprint||b.constructionTimer>0||b.hp<=0||b.hp>=b.maxHp||b.assignedEngineer) continue;
    const distance=Math.hypot(resident.x-b.center().x,resident.y-b.center().y);
    if(distance<bestDistance) { best=b; bestDistance=distance; }
  }
  return best;
}
function releaseEngineerRepairAssignment(resident) {
  const target=resident?.buildTarget;
  if(target?.assignedEngineer!==resident) return false;
  target.assignedEngineer=null;
  resident.buildTarget=null;
  return true;
}
function addRuinSalvage(b) {
  for(const [type,amount] of Object.entries(ruinSalvage(b))) {
    let remaining=amount;
    const stores=G.buildings.filter(store=>isStorage(store.type)&&!store.ruin&&store.hp>0&&!store.blueprint&&store.constructionTimer<=0)
      .sort((a,c)=>Math.hypot(a.center().x-b.center().x,a.center().y-b.center().y)-Math.hypot(c.center().x-b.center().x,c.center().y-b.center().y));
    for(const store of stores) {
      remaining-=depositToStorage(store,type,remaining);
      if(remaining<=0) break;
    }
    if(remaining>0) {
      const center=b.center();
      G.groundItems.push({type,amount:remaining,x:center.x,y:center.y,alive:true,claimedBy:null});
    }
  }
}

// ============================================================
// UPDATE
// ============================================================
function gameDayDuration() { return CFG.DAY_DURATION+CFG.NIGHT_DURATION+CFG.TRANSITION*2; }
function scheduledMealOffset(hour) { return ((hour-6+24)%24)/24*gameDayDuration(); }
function triggerScheduledMeals(startTime,endTime) {
  const cycle=gameDayDuration();
  const startCycle=Math.floor(startTime/cycle), endCycle=Math.floor(endTime/cycle);
  const offsets=[scheduledMealOffset(CFG.MEAL_TIME_LUNCH),scheduledMealOffset(CFG.MEAL_TIME_DINNER)];
  for(let cycleIndex=startCycle;cycleIndex<=endCycle;cycleIndex++) {
    for(const offset of offsets) {
      const mealTime=cycleIndex*cycle+offset;
      if(mealTime>startTime&&mealTime<=endTime) {
        for(const r of G.residents) if(!r.isGuard&&!r.hidden) r.mealPending=true;
      }
    }
  }
}
function updateDayNight(dt) {
  const phaseDuration = G.phase==='day' ? CFG.DAY_DURATION :
    G.phase==='night' ? CFG.NIGHT_DURATION : CFG.TRANSITION;
  G.dayTime += dt;
  const previousTime=G.totalTime;
  G.totalTime += dt;
  triggerScheduledMeals(previousTime,G.totalTime);
  if (G.dayTime >= phaseDuration) {
    G.dayTime = 0;
    if (G.phase==='day') {
      G.phase='dusk'; showTimeIndicator('黄昏');
      // 让居民回家睡觉
      for (const r of G.residents) {
        if (r.isGuard) continue; // guards handle their own sleep
        releaseEngineerRepairAssignment(r);
        releaseProductionInputTask(r);
        if (r.carrying) { if(r.carryingForPlanting)releaseFruitPlanting(r);r.state = 'HAULING'; continue; }
        releaseGroundPickup(r);
        releaseFruitPlanting(r);
        const home = r.home || findNearestHome(r, r.isGuard);
        if (home) {
          r.state = 'GOING_HOME';
          const hc = home.center();
          r.targetX = hc.x; r.targetY = hc.y;
          if (!r.home) assignHome(r, home);
        }
      }
      // Guards: wake up for night duty (unless already active)
      for (const r of G.residents) {
        if (r.isGuard) wakeGuardAtHome(r);
      }
    } else if (G.phase==='dusk') {
      G.phase='night'; showTimeIndicator('夜晚');
      // Guards that were still sleeping (e.g. newly assigned): wake up
      for (const r of G.residents) {
        if (r.isGuard && r.state === 'GUARD_SLEEPING') wakeGuardAtHome(r);
      }
      spawnEnemyWave();
    } else if (G.phase==='night') {
      G.phase='dawn'; showTimeIndicator('黎明');
      G.enemies=[]; G.projectiles=[]; G.enemySpawnQueue=[];
      setSelectedGuards([]);
      for(const r of G.residents) if(r.isGuard) sendGuardHomeForDay(r);
    } else if (G.phase==='dawn') {
      G.phase='day'; G.day++; showTimeIndicator('第 '+G.day+' 天');
      for (const r of G.residents) {
        if (r.isGuard) {
          if(r.state!=='GUARD_GOING_HOME'&&r.state!=='GUARD_SLEEPING') sendGuardHomeForDay(r);
        } else {
          releaseEngineerRepairAssignment(r);
          r.state=r.carrying?'HAULING':'IDLE'; r.hidden=false;
        }
      }
    }
  }
}
