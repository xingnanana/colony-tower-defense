function updateParticles(dt) {
  for (const p of G.particles) { p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; }
  G.particles=G.particles.filter(p=>p.life>0);
}

function spawnParticles(x,y,color,count) {
  for (let i=0;i<count;i++)
    G.particles.push(new Particle(x,y,color,0.3+Math.random()*0.4));
}

function showTimeIndicator(text) {
  const el=document.getElementById('time-indicator');
  el.textContent=text; el.style.opacity='1';
  setTimeout(()=>el.style.opacity='0', 1500);
}
function showResourceFullNotice(type) {
  if (G.resourceFullNotices.has(type)) return;
  G.resourceFullNotices.add(type);
  const el=document.getElementById('resource-full-notice');
  el.textContent=(RESOURCE_NAMES[type]||type)+'已满';
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

let gameRunning = true;
let gameSpeed = 1;

function setSpeed(s) {
  gameSpeed = s;
  document.querySelectorAll('[data-speed]').forEach(button => button.classList.toggle('active', Number(button.dataset.speed)===s));
  const pauseButton=document.getElementById('time-pause');
  if (pauseButton) {
    const paused=s===0;
    pauseButton.textContent=paused?'▶':'Ⅱ';
    pauseButton.title=paused?'继续游戏':'暂停游戏';
    pauseButton.setAttribute('aria-label',pauseButton.title);
    pauseButton.classList.toggle('active', s===0);
  }
}

function fireArrow(source,target,damage) {
  G.projectiles.push(new ArrowProjectile(source,target,damage));
}

function updateProjectiles(dt) {
  for(const arrow of G.projectiles) {
    const target=arrow.target;
    arrow.life+=dt;
    if (!target || !target.alive || !isWorldVisible(target.x,target.y) || arrow.life>=arrow.maxLife) { arrow.alive=false; continue; }
    const dx=target.x-arrow.x, dy=target.y-arrow.y;
    const distance=Math.hypot(dx,dy);
    const step=arrow.speed*dt;
    if (distance<=step+target.size*0.45) {
      arrow.x=target.x; arrow.y=target.y;
      target.hp-=arrow.damage;
      spawnParticles(target.x,target.y,'#ffaa00',2);
      if (target.hp<=0) { target.alive=false; spawnParticles(target.x,target.y,'#ff6600',6); }
      arrow.alive=false;
      continue;
    }
    arrow.angle=Math.atan2(dy,dx);
    arrow.x+=Math.cos(arrow.angle)*step;
    arrow.y+=Math.sin(arrow.angle)*step;
  }
  G.projectiles=G.projectiles.filter(arrow=>arrow.alive);
}
function togglePause() { setSpeed(gameSpeed===0?1:0); }
function setRes(type) {
  const inp = document.getElementById('dbg-'+type);
  setStartingResource(type, parseInt(inp.value) || 0);
}
function setAllRes() {
  G.infiniteResources = true;
  refillInfiniteResources(true);
  showTimeIndicator('大本营资源已填满');
}
function refillInfiniteResources(forceTotals=false) {
  const hall=G.townHall;
  if(!G.infiniteResources||!hall||hall.hp<=0) return false;
  let changed=false;
  for(const type of RESOURCE_TYPES) {
    const target=storageCapacity(hall,type);
    if(storedAmount(hall,type)!==target) {
      hall.stored[type]=target;
      changed=true;
    }
  }
  if(changed||forceTotals) updateAllResourceTotals();
  return changed;
}
function debugRevealAllFog() {
  G.debugRevealAllFog=true;
  refreshFogVisibility();
  showTimeIndicator('迷雾已移除');
}
function toggleDebugNavigation() {
  G.debugShowNavigation=!G.debugShowNavigation;
  const button=document.getElementById('debug-navigation-btn');
  if(button) {
    button.classList.toggle('active',G.debugShowNavigation);
    button.textContent=G.debugShowNavigation?'隐藏寻路':'显示寻路';
  }
  showTimeIndicator(G.debugShowNavigation?'寻路显示已开启':'寻路显示已关闭');
  return G.debugShowNavigation;
}
function addGuardCommandMarker(x,y,type='move') {
  G.commandMarkers.push({x,y,type,life:0.9,maxLife:0.9});
  if(G.commandMarkers.length>12) G.commandMarkers.splice(0,G.commandMarkers.length-12);
}
function updateCommandMarkers(dt) {
  for(const marker of G.commandMarkers) marker.life-=dt;
  G.commandMarkers=G.commandMarkers.filter(marker=>marker.life>0);
}
function skipToNight() {
  G.phase = 'night'; G.dayTime = 0; G.enemies = []; G.projectiles = []; G.enemySpawnQueue = []; G.enemySpawnTimer = 0;
  for (const r of G.residents) {
    if (r.isGuard) { wakeGuardAtHome(r);continue; }
    releaseEngineerRepairAssignment(r);
    releaseProductionInputTask(r);
    releaseGroundPickup(r);
    releaseFruitPlanting(r);
    if(r.carrying) { r.state='HAULING';continue; }
    const home = r.home || findNearestHome(r, r.isGuard);
    if (home) { r.state = 'GOING_HOME'; const hc = home.center(); r.targetX = hc.x; r.targetY = hc.y; if (!r.home) assignHome(r, home); }
  }
  spawnEnemyWave();
  showTimeIndicator('跳至夜晚');
}
function unlockAll() {
  const th = G.townHall; if (!th) return;
  th.level = maxBuildingLevel('town_hall'); th.maxHp = Math.floor(buildingLevelValue('town_hall',th.level,'hp')); th.hp = th.maxHp;
  G.treesChopped = Math.max(G.treesChopped||0, ...Object.values(BLD_DEFS).map(def=>Math.max(0, Number(def.unlockTreesChopped)||0)));
  G.maxPop = CFG.MAX_POP_BASE;
  G.maxGuards = CFG.MAX_GUARD_BASE;
  for (const b of G.buildings) { if (b.type==='house') G.maxPop += houseCapacity(b); }
  for (const b of G.buildings) { if (b.type==='barracks') G.maxGuards += guardCapacity(b); }
  G.maxPop += houseCapacity(th);
  updateBuildingPanel();
}
function upgradeTH() {
  const th = G.townHall; if (!th) return;
  const oldPop=houseCapacity(th), oldGuard=guardCapacity(th);
  th.level=Math.min(th.level+1,maxBuildingLevel('town_hall')); th.maxHp=Math.floor(buildingLevelValue('town_hall',th.level,'hp')); th.hp=th.maxHp;
  G.maxPop+=houseCapacity(th)-oldPop; G.maxGuards+=guardCapacity(th)-oldGuard;
  refreshFogVisibility();
  updateBuildingPanel();
}
function skipToDay() {
  G.phase = 'day'; G.dayTime = 0; G.day++; G.enemies = []; G.projectiles = []; G.enemySpawnQueue = []; G.enemySpawnTimer = 0;
  setSelectedGuards([]);
  for (const r of G.residents) {
    if (r.isGuard) sendGuardHomeForDay(r);
    else {
      r.state = 'IDLE'; r.hidden = false;
    }
  }
  showTimeIndicator('跳至第 '+G.day+' 天');
}
// === In-game balance editor ===
function assignEngineer() {
  const idle = G.residents.find(r => (r.state === 'IDLE' || r.state === 'PATROL') && !r.workplace && !r.isEngineer);
  if (idle) {
    idle.isEngineer = true;
    assignEngineerBuildTask(idle);
  }
}
function unassignEngineer() {
  const priority={IDLE:0,PATROL:0,GOING_HOME:1,SLEEPING:1,GOING_TO_REPAIR:2,REPAIRING:2,GATHERING:3,BUILDING:3,CONSTRUCTING:3};
  const eng=G.residents.filter(r=>r.isEngineer).sort((a,b)=>(priority[a.state]??2)-(priority[b.state]??2))[0];
  if (eng) {
    const target=eng.buildTarget;
    eng.isEngineer = false;
    if (target?.assignedEngineer===eng) target.assignedEngineer = null;
    eng.buildTarget = null; eng.state = eng.carrying ? 'HAULING' : 'IDLE';
  }
}
function addPop(n) {
  if (n > 0) {
    for (let i=0; i<n; i++) {
      const th = G.townHall;
      const r = new Resident(th.x+40+(Math.random()-0.5)*60, th.y+40+(Math.random()-0.5)*60);
      assignHome(r, findNearestHome(r, r.isGuard)); G.residents.push(r);
    }
  } else {
    for (let i=0; i<-n; i++) {
      const r = [...G.residents].reverse().find(resident=>!resident.isGuard);
      if (!r) break;
      removeResident(r);
    }
  }
  G.popGrowthTimer = 0;
}
function addDebugGuard(n) {
  const th=G.townHall;
  if (!th) return;
  if (n>0) {
    for (let i=0;i<n;i++) {
      const r=new Resident(th.x+55+(Math.random()-0.5)*60,th.y+45+(Math.random()-0.5)*60);
      r.isGuard=true;
      r.state=(G.phase==='night'||G.phase==='dusk') ? 'GUARD_FIND_TOWER' : 'GUARD_SLEEPING';
      r.hidden=G.phase!=='night'&&G.phase!=='dusk';
      assignHome(r,findNearestHome(r,true));
      G.residents.push(r);
      if(G.phase==='night'||G.phase==='dusk') wakeGuardAtHome(r);
    }
  } else {
    for (let i=0;i<-n;i++) {
      const guard=[...G.residents].reverse().find(resident=>resident.isGuard);
      if (!guard) break;
      removeResident(guard);
    }
  }
}

function gameOver(msg) {
  gameRunning = false;
  document.getElementById('gameover-msg').textContent = msg;
  document.getElementById('gameover-overlay').style.display = 'flex';
}
function restartGame() {
  G.buildings = []; G.residents = []; G.enemies = []; G.animals=[]; G.groundItems=[]; G.particles = []; G.projectiles = []; G.commandMarkers = [];
  G.resourceCellIndex=null;
  G.resources = { food:CFG.START_FOOD, wood:CFG.START_WOOD, stone:CFG.START_STONE, iron:CFG.START_IRON, charcoal:0, ingot:CFG.START_INGOT };
  G.day = 1; G.dayTime = 0; G.phase = 'day'; G.totalTime = 0;
  G.selectedBldType = null; G.selectedBuilding = null; clearSelectedGuards(); G.placingMode = false; G.movingBuilding = null;
  G.guardSelectStart=null; G.guardSelectEnd=null; G.guardSelectMoved=false;
  G.maxPop = CFG.MAX_POP_BASE; G.maxGuards = CFG.MAX_GUARD_BASE; G.popGrowthTimer = 0; G.enemySpawnQueue = []; G.enemySpawnTimer = 0;
  G.resourceCleanupTimer = 0; G.farmLinks = []; G.navigationRevision = 0; G.obstacleIndexRevision = -1;
  G.navigationGridRevision = -1; G.navigationGrid = null;
  G.navigationQueue = [];
  G.resourceFullNotices = new Set();
  G.treesChopped = 0;
  G.buildingPanelDirty = true;
  G.debugRevealAllFog = false;
  G.debugShowNavigation = true;
  const debugNavigationButton=document.getElementById('debug-navigation-btn');
  if(debugNavigationButton){debugNavigationButton.classList.add('active');debugNavigationButton.textContent='隐藏寻路';}
  G.targetedTrees = new Set();
  G.targetedAnimals = new Set();G.animalSpawnTimer=0;
  G.dragging = false; G.dragButton=null; G.dragMoved=false; gameRunning = true;
  setSpeed(1);
  G.infiniteResources = false;
  document.getElementById('gameover-overlay').style.display = 'none';
  initGame();
}
function update(dt) {
  if (!gameRunning) return;
  G.dt = dt;
  refillInfiniteResources();
  updateDayNight(dt);
  updateBuildings(dt);
  updateAnimals(dt);
  processNavigationRequests();
  updateResidents(dt);
  updateFogVisibility(dt);
  if (G.phase==='night') {
    updateEnemies(dt);
    updateTowers(dt);
  }
  updateProjectiles(dt);
  updateParticles(dt);
  G.tick++;
}
