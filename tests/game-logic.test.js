const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const gamePath = path.join(__dirname, '..', 'game.html');
const html = fs.readFileSync(gamePath, 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const logicScript = script.slice(0, script.indexOf('const canvas ='));

function elementStub() {
  return {
    addEventListener() {}, appendChild() {}, append() {}, querySelector() { return elementStub(); },
    querySelectorAll() { return []; }, style: {}, classList: { add() {}, remove() {}, toggle() {} },
    value: '', innerHTML: '', textContent: '', dataset: {}
  };
}

function runGameScenario(source) {
  const settingsStorage = new Map();
  const sandbox = {
    console, Math, JSON, Date, Uint8Array, Object, Array, Map, Set, Number, String,
    Boolean, parseInt, setTimeout() {}, FileReader: function FileReader() {},
    document: {
      getElementById: elementStub, querySelectorAll() { return []; },
      createElement: elementStub, addEventListener() {}
    },
    window: { addEventListener() {} }
  };
  sandbox.localStorage = {
    getItem(key) { return settingsStorage.has(key) ? settingsStorage.get(key) : null; },
    setItem(key, value) { settingsStorage.set(key, String(value)); }
  };
  vm.createContext(sandbox);
  vm.runInContext(`${logicScript}\n${source}`, sandbox);
  return sandbox.__result;
}

test('production batch reaches storage and releases the hauling lock', () => {
  const result = runGameScenario(`
    const farm = new Building('farm', 10, 10);
    const store = new Building('food_storage', 20, 20);
    const worker = new Resident(0, 0);
    store.stored.food = 45;
    worker.workplace = farm;
    worker.carrying = {type:'food', amount:5};
    worker.carryingFrom = farm;
    worker.state = 'HAULING';
    farm.outputHauler = worker;
    G.buildings = [farm, store]; G.residents = [worker];
    G.resources = {food:45, wood:0, stone:0, iron:0, ingot:0}; G.phase = 'day';
    const center = store.center(); worker.x = center.x; worker.y = center.y;
    updateResidents(0.01);
    globalThis.__result = {stored:store.stored.food, carrying:worker.carrying, lock:farm.outputHauler};
  `);
  assert.equal(result.stored, 50);
  assert.equal(result.carrying, null);
  assert.equal(result.lock, null);
});

test('removing a production hauler returns undelivered output', () => {
  const result = runGameScenario(`
    const farm = new Building('farm', 10, 10);
    const worker = new Resident(0, 0);
    worker.workplace = farm; worker.carrying = {type:'food', amount:5};
    worker.carryingFrom = farm; farm.outputHauler = worker; farm.assignedWorkers = 1;
    G.buildings = [farm]; G.residents = [worker];
    removeResident(worker);
    globalThis.__result = {buffer:farm.pendingOutput, lock:farm.outputHauler, workers:farm.assignedWorkers, count:G.residents.length};
  `);
  assert.equal(result.buffer, 5);
  assert.equal(result.lock, null);
  assert.equal(result.workers, 0);
  assert.equal(result.count, 0);
});

test('dusk does not interrupt a resident carrying resources', () => {
  const result = runGameScenario(`
    const worker = new Resident(0, 0); worker.carrying = {type:'food', amount:5};
    G.residents = [worker]; G.phase = 'day'; G.dayTime = CFG.DAY_DURATION;
    updateDayNight(0.01); globalThis.__result = worker.state;
  `);
  assert.equal(result, 'HAULING');
});

test('sleeping residents become visible as soon as dawn begins', () => {
  const result = runGameScenario(`
    const resident=new Resident(100,100);
    resident.state='SLEEPING';resident.hidden=true;
    G.residents=[resident];G.buildings=[];G.phase='night';G.dayTime=CFG.NIGHT_DURATION;
    updateDayNight(0.1);
    updateResidents(0.1);
    globalThis.__result={phase:G.phase,state:resident.state,visible:!resident.hidden};
  `);
  assert.equal(result.phase, 'dawn');
  assert.equal(result.state, 'IDLE');
  assert.equal(result.visible, true);
});

test('residents use phase based sleep without fatigue values', () => {
  const result=runGameScenario(`
    const home=new Building('house',10,10),resident=new Resident(0,0),center=home.center();
    resident.home=home;resident.x=center.x;resident.y=center.y;
    G.buildings=[home];G.residents=[resident];G.phase='night';
    updateResidents(0.01);
    globalThis.__result={state:resident.state,hidden:resident.hidden,hasResidentFatigue:'tired' in resident,hasRate:'TIRED_RATE' in CFG,hasThreshold:'TIRED_THRESHOLD' in CFG,editable:GLOBAL_EDIT_FIELDS.some(field=>field.k.includes('TIRED'))};
  `);
  assert.equal(result.state,'SLEEPING');
  assert.equal(result.hidden,true);
  assert.equal(result.hasResidentFatigue,false);
  assert.equal(result.hasRate,false);
  assert.equal(result.hasThreshold,false);
  assert.equal(result.editable,false);
});

test('saved balance overrides global and building defaults before game state is created', () => {
  const result = runGameScenario(`
    applyBalanceData({version:1, globals:{START_FOOD:77, RESIDENT_SPEED:85, ENEMY_WAVE_DURATION:11}, buildings:{farm:{baseTime:6,cost:{wood:8}}}});
    globalThis.__result = {food:CFG.START_FOOD, speed:CFG.RESIDENT_SPEED, waveDuration:CFG.ENEMY_WAVE_DURATION, farmTime:BLD_DEFS.farm.baseTime, farmWood:BLD_DEFS.farm.cost.wood};
  `);
  assert.equal(result.food, 77);
  assert.equal(result.speed, 85);
  assert.equal(result.waveDuration, 11);
  assert.equal(result.farmTime, 6);
  assert.equal(result.farmWood, 8);
});

test('invalid saved balance values do not replace numeric globals', () => {
  const result = runGameScenario(`
    const original=CFG.RESIDENT_SPEED;
    applyBalanceData({globals:{RESIDENT_SPEED:'fast', UNKNOWN_VALUE:12}});
    globalThis.__result = {speed:CFG.RESIDENT_SPEED, original, unknown:CFG.UNKNOWN_VALUE};
  `);
  assert.equal(result.speed, result.original);
  assert.equal(result.unknown, undefined);
});

test('shortcut settings save immediately and restore the default on a conflict', () => {
  const result = runGameScenario(`
    gameSettings.shortcuts={...DEFAULT_SHORTCUTS};
    assignShortcut('speed2', 'KeyC');
    const saved=JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
    globalThis.__result={speed2:gameSettings.shortcuts.speed2, chop:gameSettings.shortcuts.chop, savedSpeed2:saved.shortcuts.speed2};
  `);
  assert.equal(result.speed2, 'KeyC');
  assert.equal(result.chop, 'KeyC');
  assert.equal(result.savedSpeed2, 'KeyC');
});

test('camera drag threshold is clamped and persisted with game settings', () => {
  const result = runGameScenario(`
    setCameraDragThreshold(99);
    const saved=JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
    globalThis.__result={value:gameSettings.cameraDragThreshold,saved:saved.cameraDragThreshold,below:cameraDragExceeded(20,20),above:cameraDragExceeded(23,23)};
  `);
  assert.equal(result.value, 32);
  assert.equal(result.saved, 32);
  assert.equal(result.below, false);
  assert.equal(result.above, true);
});

test('a worker can finish chopping after its forester workplace is removed', () => {
  const result = runGameScenario(`
    const store = new Building('wood_storage', 20, 20);
    const worker = new Resident(100, 100);
    const tree = {type:'tree', x:100, y:100, alive:true, marked:true};
    worker.state='CHOPPING'; worker.chopTarget=tree; worker.chopTimer=3; worker.workplace=null;
    G.buildings=[store]; G.residents=[worker]; G.resourceNodes=[tree];
    G.resources={food:0,wood:0,stone:0,iron:0,ingot:0}; G.phase='day';
    updateResidents(0.01);
    globalThis.__result={state:worker.state, carrying:worker.carrying && worker.carrying.amount, treeAlive:tree.alive, shook:tree.shakeUntil>G.totalTime};
  `);
  assert.equal(result.state, 'HAULING');
  assert.equal(result.carrying, 1);
  assert.equal(result.treeAlive, false);
  assert.equal(result.shook, true);
});

test('an unemployed lumberjack finishes one tree and delivers it before starting an assigned job', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall',8,8),farm=new Building('farm',14,8);
    const storage=new Building('wood_storage',11,8),worker=new Resident(100,100);
    const tree={type:'tree',x:100,y:100,alive:true,marked:true,ownerForester:null};
    worker.state='CHOPPING';worker.chopTarget=tree;worker.chopTimer=3;
    G.townHall=hall;G.buildings=[hall,storage,farm];G.resourceNodes=[tree];G.residents=[worker];G.phase='day';
    assignResidentToWorkplace(worker,farm);
    const assignedWithoutInterrupt=worker.workplace===farm&&worker.state==='CHOPPING'&&worker.finishCurrentChopForWork&&farm.assignedWorkers===1;
    updateResidents(1);
    const haulingAfterTree=!tree.alive&&worker.state==='HAULING'&&worker.carrying?.type==='wood';
    const sc=storage.center();worker.x=sc.x;worker.y=sc.y;
    updateResidents(0.1);
    globalThis.__result={assignedWithoutInterrupt,haulingAfterTree,startedJob:worker.state==='GOING_TO_WORK'&&!worker.carrying&&!worker.finishCurrentChopForWork};
  `);
  assert.equal(result.assignedWithoutInterrupt, true);
  assert.equal(result.haulingAfterTree, true);
  assert.equal(result.startedJob, true);
});

test('full wood storage pauses logging instead of leaving a resident chopping in place', () => {
  const result = runGameScenario(`
    const store=new Building('wood_storage',20,20); store.stored.wood=storageCapacity(store,'wood');
    const forester=new Building('forester',10,10);
    const tree={type:'tree',x:100,y:100,alive:true,marked:true,ownerForester:forester};
    const worker=new Resident(100,100); worker.workplace=forester; worker.state='CHOPPING'; worker.chopTarget=tree; worker.chopTimer=3;
    G.buildings=[store,forester]; G.residents=[worker]; G.resourceNodes=[tree]; G.resources={food:0,wood:store.stored.wood,stone:0,iron:0,ingot:0}; G.phase='day';
    updateResidents(0.01);
    globalThis.__result={state:worker.state,target:worker.chopTarget,treeAlive:tree.alive,full:resourceStorageStatus('wood').full,selectable:findForesterTree(worker,forester)};
  `);
  assert.equal(result.state, 'GOING_TO_WORK');
  assert.equal(result.target, null);
  assert.equal(result.treeAlive, true);
  assert.equal(result.full, true);
  assert.equal(result.selectable, null);
});

test('a completed wood storage increases total wood capacity immediately', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall',30,30); hall.stored.wood=10;
    BLD_DEFS.town_hall.storageCaps={food:10,wood:10,stone:0,iron:0,ingot:0};
    const store=new Building('wood_storage',20,20); store.blueprint=false; store.constructionTimer=0;
    G.townHall=hall; G.buildings=[hall]; G.resources={food:0,wood:10,stone:0,iron:0,ingot:0};
    const before=resourceStorageCapacity('wood');
    G.buildings.push(store);
    const after=resourceStorageCapacity('wood');
    globalThis.__result={before,after,storeCapacity:storageCapacity(store,'wood'),full:resourceStorageStatus('wood').full};
  `);
  assert.equal(result.before, 10);
  assert.equal(result.after, 10+result.storeCapacity);
  assert.equal(result.full, false);
});

test('a full-resource notice is throttled until that resource has storage space again', () => {
  const result = runGameScenario(`
    G.resourceFullNotices=new Set();
    showResourceFullNotice('wood'); showResourceFullNotice('wood');
    const first=G.resourceFullNotices.size;
    G.resourceFullNotices.delete('wood');
    showResourceFullNotice('wood');
    globalThis.__result={first,second:G.resourceFullNotices.size,hasWood:G.resourceFullNotices.has('wood')};
  `);
  assert.equal(result.first, 1);
  assert.equal(result.second, 1);
  assert.equal(result.hasWood, true);
});

test('a resident leaves a continuous workplace immediately for a scheduled meal', () => {
  const result = runGameScenario(`
    const farm=new Building('farm', 10, 10);
    const hall=new Building('town_hall', 20, 20); hall.stored.food=2;
    const worker=new Resident(0, 0); worker.workplace=farm; worker.state='WORKING'; worker.mealPending=true;
    G.buildings=[farm,hall]; G.residents=[worker]; G.resources={food:2,wood:0,stone:0,iron:0,ingot:0}; G.phase='day';
    updateResidents(0.01); globalThis.__result=worker.state;
  `);
  assert.equal(result, 'GOING_TO_EAT');
});

test('farm workers must approach twice as close to work as other production workers', () => {
  const result = runGameScenario(`
    const farm=new Building('farm', 10, 10);
    const quarry=new Building('quarry', 14, 10);
    globalThis.__result={farm:workplaceWorkRange(farm), quarry:workplaceWorkRange(quarry)};
  `);
  assert.equal(result.farm, result.quarry * 0.5);
});

test('a resident delivers the current chopped tree before a scheduled meal', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall', 20, 20); hall.stored.food=2;
    const worker=new Resident(100, 100); worker.state='CHOPPING'; worker.mealPending=true; worker.chopTimer=2.99;
    const tree={type:'tree',x:100,y:100,alive:true,marked:true}; worker.chopTarget=tree;
    G.buildings=[hall]; G.residents=[worker]; G.resourceNodes=[tree]; G.resources={food:2,wood:0,stone:0,iron:0,ingot:0}; G.phase='day';
    updateResidents(0.02);
    const center=hall.center(); worker.x=center.x; worker.y=center.y;
    updateResidents(0.01);
    globalThis.__result={state:worker.state, carrying:worker.carrying, deferred:worker.finishBeforeEating, wood:hall.stored.wood};
  `);
  assert.equal(result.state, 'GOING_TO_EAT');
  assert.equal(result.carrying, null);
  assert.equal(result.deferred, false);
  assert.equal(result.wood, 1);
});

test('meal times trigger residents at 12:00 and 18:00 without hunger accumulation', () => {
  const result = runGameScenario(`
    const resident=new Resident(0,0);
    G.residents=[resident]; G.phase='day'; G.dayTime=0;
    G.totalTime=scheduledMealOffset(CFG.MEAL_TIME_LUNCH)-0.01;
    updateDayNight(0.02);
    const lunch=resident.mealPending;
    resident.mealPending=false;
    G.totalTime=scheduledMealOffset(CFG.MEAL_TIME_DINNER)-0.01;
    updateDayNight(0.02);
    globalThis.__result={lunch,dinner:resident.mealPending,hunger:resident.hunger,rate:CFG.HUNGER_RATE};
  `);
  assert.equal(result.lunch, true);
  assert.equal(result.dinner, true);
  assert.equal(result.hunger, undefined);
  assert.equal(result.rate, undefined);
});

test('a forester automatically plants saplings without assigned workers', () => {
  const result = runGameScenario(`
    const forester=new Building('forester', 20, 20); forester.foresterPlantCooldown=0;
    G.buildings=[forester]; G.residents=[]; G.resourceNodes=[];
    updateBuildings(0.01);
    const sapling=G.resourceNodes[0];
    globalThis.__result={count:G.resourceNodes.length, owner:sapling && sapling.ownerForester===forester, growDuration:sapling && sapling.growDuration};
  `);
  assert.equal(result.count, 1);
  assert.equal(result.owner, true);
  assert.ok(result.growDuration > 0);
});

test('a mature forester sapling becomes a marked harvestable tree', () => {
  const result = runGameScenario(`
    const forester=new Building('forester', 20, 20);
    const sapling={type:'sapling',col:30,row:30,x:1220,y:1220,alive:true,marked:false,growTimer:0.01,growDuration:3,ownerForester:forester};
    G.buildings=[forester]; G.residents=[]; G.resourceNodes=[sapling];
    updateBuildings(0.02);
    globalThis.__result={type:sapling.type, marked:sapling.marked, owner:sapling.ownerForester===forester};
  `);
  assert.equal(result.type, 'tree');
  assert.equal(result.marked, true);
  assert.equal(result.owner, true);
});

test('global navigation moves continuously around multiple blocking buildings', () => {
  const result = runGameScenario(`
    const a = new Building('town_hall', 2, 2), b = new Building('town_hall', 5, 2);
    const worker = new Resident(30, 140);
    G.buildings = [a, b]; G.resourceNodes = []; G.residents = [worker]; G.floorMask = null;
    for (let i=0; i<260; i++) {
      processNavigationRequests();
      moveViaFlow(worker, 360, 140, CFG.RESIDENT_SPEED, 0.05);
    }
    globalThis.__result = Math.hypot(360-worker.x, 140-worker.y);
  `);
  assert.ok(result < 8, `remaining distance was ${result}`);
});

test('all movable unit roles force a global replan after making too little progress', () => {
  const result = runGameScenario(`
    const resident=new Resident(100,100);
    const engineer=new Resident(120,100);engineer.isEngineer=true;
    const guard=new Resident(140,100);guard.isGuard=true;
    const animal=new Animal(160,100);
    const enemy=new Enemy(180,100);
    const units=[resident,engineer,guard,animal,enemy];
    G.navigationQueue=[];
    for(const unit of units) updateNavigationProgress(unit,500,100,CFG.NAV_STUCK_WINDOW);
    globalThis.__result={
      replans:units.map(unit=>unit.navForcedReplans),
      pending:units.map(unit=>unit.navPending),
      queued:G.navigationQueue.length
    };
  `);
  assert.equal(result.replans.join(','), '1,1,1,1,1');
  assert.equal(result.pending.join(','), 'true,true,true,true,true');
  assert.equal(result.queued, 5);
});

test('stuck detection ignores useful movement and an unreachable goal endpoint', () => {
  const result = runGameScenario(`
    const moving=new Animal(100,100);
    moving.x+=CFG.NAV_STUCK_MIN_DISTANCE+1;
    const movingReplanned=updateNavigationProgress(moving,500,100,CFG.NAV_STUCK_WINDOW);
    const stopped=new Animal(200,100);
    stopped.navBlockedGoal=true;stopped.navResolvedPoint={x:200,y:100};
    const endpointReplanned=updateNavigationProgress(stopped,500,100,CFG.NAV_STUCK_WINDOW);
    globalThis.__result={movingReplanned,endpointReplanned,queued:G.navigationQueue.length};
  `);
  assert.equal(result.movingReplanned, false);
  assert.equal(result.endpointReplanned, false);
  assert.equal(result.queued, 0);
});

test('a moving resident steers around stationary workers instead of being blocked by them', () => {
  const result = runGameScenario(`
    const mover=new Resident(0,100);
    const workerA=new Resident(46,94); workerA.state='WORKING';
    const workerB=new Resident(46,106); workerB.state='WORKING';
    G.buildings=[]; G.resourceNodes=[]; G.residents=[mover,workerA,workerB]; G.floorMask=null;
    let maxOffset=0;
    for (let i=0; i<80; i++) {
      rebuildResidentSpatialHash();
      moveViaFlow(mover,120,100,CFG.RESIDENT_SPEED,0.05);
      maxOffset=Math.max(maxOffset,Math.abs(mover.y-100));
    }
    globalThis.__result={x:mover.x,maxOffset};
  `);
  assert.ok(result.x>108, `mover stopped at x=${result.x}`);
  assert.ok(result.maxOffset>4, `mover did not make a lateral detour: ${result.maxOffset}`);
});

test('a building layout revision invalidates a cached waypoint', () => {
  const result = runGameScenario(`
    const obstacle = new Building('farm', 2, 2), worker = new Resident(30, 140);
    G.buildings = [obstacle]; G.resourceNodes = []; G.residents = [worker]; G.floorMask = null;
    moveViaFlow(worker, 280, 140, CFG.RESIDENT_SPEED, 0.05);
    const before = worker.navRevision;
    invalidateNavigation();
    moveViaFlow(worker, 280, 140, CFG.RESIDENT_SPEED, 0.05);
    globalThis.__result = {before, after:worker.navRevision, current:G.navigationRevision};
  `);
  assert.equal(result.after, result.current);
  assert.notEqual(result.before, result.after);
});

test('spatial hash limits a short navigation query to nearby obstacles', () => {
  const result = runGameScenario(`
    G.buildings = [];
    for (let i=0; i<80; i++) G.buildings.push(new Building('wall', i*3, i*3));
    G.resourceNodes = []; G.navigationRevision = 1; G.obstacleIndexRevision = -1;
    ensureObstacleSpatialHash();
    const nearby = G.obstacleSpatial.query(0,0,240,240);
    globalThis.__result = {nearby:nearby.length, total:G.buildings.length};
  `);
  assert.ok(result.nearby > 0);
  assert.ok(result.nearby < result.total / 4, `${result.nearby} of ${result.total} obstacles were returned`);
});

test('fog visibility is provided only by town hall and lamp light sources', () => {
  const result = runGameScenario(`
    const hall = new Building('town_hall', 30, 30);
    const resident = new Resident(20, 20);
    const farm = new Building('farm', 10, 10);
    G.buildings = [hall,farm]; G.residents = [resident]; G.resourceNodes = [];
    initFog(); refreshFogVisibility();
    const center = hall.center();
    globalThis.__result = {
      hall:isWorldVisible(center.x, center.y),
      resident:isWorldVisible(resident.x, resident.y),
      farm:isWorldVisible(farm.center().x,farm.center().y),
      distant:isFogCellVisible(0, 40)
    };
  `);
  assert.equal(result.hall, true);
  assert.equal(result.resident, false);
  assert.equal(result.farm,false);
  assert.equal(result.distant, false);
});

test('lamp reveals five cells and loses vision when removed', () => {
  const result = runGameScenario(`
    const lamp = new Building('lamp', 20, 20);
    G.buildings = [lamp]; G.residents = []; G.resourceNodes = [];
    initFog(); refreshFogVisibility();
    const within = isFogCellVisible(25, 20);
    const beyond = isFogCellVisible(26, 20);
    lamp.hp = 0; updateBuildings(0);
    globalThis.__result = {within, beyond, afterRemoval:isFogCellVisible(25, 20)};
  `);
  assert.equal(result.within, true);
  assert.equal(result.beyond, false);
  assert.equal(result.afterRemoval, false);
});

test('manual guards reject fog destinations and stop when a target loses light', () => {
  const result=runGameScenario(`
    const lamp=new Building('lamp',10,10),center=lamp.center(),guard=new Resident(center.x,center.y);
    guard.isGuard=true;guard.hidden=false;guard.controlMode='manual';guard.state='GUARD_MANUAL';
    G.buildings=[lamp];G.residents=[guard];initFog();refreshFogVisibility();
    const visibleAllowed=canIssueManualGuardMove(center.x,center.y),fogX=center.x+CFG.CELL*10,fogY=center.y;
    const fogAllowed=canIssueManualGuardMove(fogX,fogY);
    const fogGuard=new Resident(fogX,fogY);fogGuard.isGuard=true;fogGuard.hidden=false;
    const fogGuardControllable=setGuardControlMode(fogGuard,'manual');
    guard.manualTarget={x:fogX,y:fogY};updateManualGuard(guard,0.1);
    globalThis.__result={visibleAllowed,fogAllowed,fogGuardControllable,target:guard.manualTarget,x:guard.x,y:guard.y,startX:center.x,startY:center.y};
  `);
  assert.equal(result.visibleAllowed,true);
  assert.equal(result.fogAllowed,false);
  assert.equal(result.fogGuardControllable,false);
  assert.equal(result.target,null);
  assert.equal(result.x,result.startX);
  assert.equal(result.y,result.startY);
});

test('guard formation slots are kept inside the current light radius', () => {
  const result=runGameScenario(`
    const lamp=new Building('lamp',12,12),center=lamp.center(),guards=[];
    for(let index=0;index<9;index++) {const guard=new Resident(center.x-40+(index%3)*16,center.y-16+Math.floor(index/3)*16);guard.isGuard=true;guard.hidden=false;guard.controlMode='manual';guards.push(guard);}
    G.buildings=[lamp];G.residents=guards;initFog();refreshFogVisibility();
    const target={x:center.x+buildingFogRadius(lamp)-CFG.CELL,y:center.y};
    const assignments=assignGuardGroupMove(guards,target);
    globalThis.__result={count:assignments.length,allVisible:assignments.every(item=>isWorldVisible(item.target.x,item.target.y)),unique:new Set(assignments.map(item=>item.target.x.toFixed(2)+','+item.target.y.toFixed(2))).size};
  `);
  assert.equal(result.count,9);
  assert.equal(result.allVisible,true);
  assert.equal(result.unique,9);
});

test('building placement is rejected in fog and allowed in visible cells', () => {
  const result = runGameScenario(`
    G.buildings = []; G.residents = []; G.resourceNodes = [];
    initFog();
    const hidden = canPlaceBuilding('lamp', 10, 10);
    G.fogVisible[fogIndex(10, 10)] = 1;
    const visible = canPlaceBuilding('lamp', 10, 10);
    globalThis.__result = {hidden, visible};
  `);
  assert.equal(result.hidden, false);
  assert.equal(result.visible, true);
});

test('night waves snapshot spawn points from the fog frontier', () => {
  const result = runGameScenario(`
    const hall = new Building('town_hall', 30, 30);
    G.buildings = [hall]; G.townHall = hall; G.residents = []; G.enemies = [];
    initFog(); spawnEnemyWave();
    const queued = G.enemySpawnQueue.slice();
    const depthOk = queued.every(entry => {
      const col=gridCol(entry.x), row=gridRow(entry.y);
      for(let dc=-1;dc<=1;dc++) for(let dr=-1;dr<=1;dr++) if(isFogCellVisible(col+dc,row+dr)) return false;
      return true;
    });
    globalThis.__result = {count:queued.length, depthOk, firstDelay:queued[0] && queued[0].delay};
  `);
  assert.equal(result.count, 5);
  assert.equal(result.depthOk, true);
  assert.ok(result.firstDelay >= 1);
});

test('a revealed night spawn point is deferred without rescanning', () => {
  const result = runGameScenario(`
    const hall = new Building('town_hall', 30, 30);
    G.buildings = [hall]; G.townHall = hall; G.residents = []; G.enemies = [];
    initFog(); spawnEnemyWave();
    G.fogVisible.fill(1);
    G.enemySpawnTimer = 100;
    updateEnemies(0);
    globalThis.__result = {enemies:G.enemies.length, queued:G.enemySpawnQueue.length};
  `);
  assert.equal(result.enemies, 0);
  assert.equal(result.queued, 5);
});

test('tower arrows deal damage only after reaching a visible enemy', () => {
  const result = runGameScenario(`
    const tower = new Building('auto_arrow_tower', 20, 20);
    const center = tower.center();
    const enemy = new Enemy(center.x + 80, center.y);
    G.buildings = [tower]; G.enemies = [enemy]; G.projectiles = []; initFog(); G.fogVisible.fill(1);
    const hpBefore = enemy.hp;
    updateTowers(1);
    const hpAfterShot = enemy.hp;
    for(let i=0;i<10;i++) updateProjectiles(0.05);
    globalThis.__result = {arrows:G.projectiles.length, hpBefore, hpAfterShot, hpAfterHit:enemy.hp};
  `);
  assert.equal(result.hpAfterShot, result.hpBefore);
  assert.ok(result.hpAfterHit < result.hpBefore);
});

test('tower does not fire arrows at enemies in fog', () => {
  const result = runGameScenario(`
    const tower = new Building('auto_arrow_tower', 20, 20);
    const center = tower.center();
    const enemy = new Enemy(center.x + 80, center.y);
    G.buildings = [tower]; G.enemies = [enemy]; G.projectiles = []; initFog();
    updateTowers(1);
    globalThis.__result = {arrows:G.projectiles.length, hp:enemy.hp};
  `);
  assert.equal(result.arrows, 0);
  assert.equal(result.hp, 40);
});

test('coverage metadata exposes lamp, forester, mine, tower, and restoration ranges', () => {
  const result = runGameScenario(`
    globalThis.__result = {
      lamp:buildingCoverage('lamp').radius,
      forester:buildingCoverage('forester').radius,
      quarry:buildingCoverage('quarry').radius,
      tower:buildingCoverage('arrow_tower').radius,
      restoration:buildingCoverage('restoration_tower').radius,
      floor:buildingCoverage('floor')
    };
  `);
  assert.equal(result.lamp, 200);
  assert.equal(result.forester, 160);
  assert.equal(result.quarry, 120);
  assert.equal(result.tower, 150);
  assert.equal(result.restoration, 160);
  assert.equal(result.floor, null);
});

test('restoration tower repairs one lowest-health target and excludes itself and distant targets', () => {
  const result = runGameScenario(`
    const tower=new Building('restoration_tower',10,10);tower.level=2;tower.hp=40;
    const wall=new Building('wall',12,10);wall.hp=100;
    const distant=new Building('wall',30,30);distant.hp=20;
    const guard=new Resident(tower.center().x+30,tower.center().y);guard.isGuard=true;guard.hidden=false;guard.guardHP=20;guard.guardMaxHP=80;
    G.buildings=[tower,wall,distant];G.residents=[guard];
    updateRestorationTower(tower,1);
    const guardAfter=guard.guardHP,wallBefore=wall.hp;
    guard.guardHP=guard.guardMaxHP;
    updateRestorationTower(tower,1);
    globalThis.__result={guardAfter,wallGain:wall.hp-wallBefore,distantHp:distant.hp,towerHp:tower.hp,targetKind:tower.repairTarget?.kind||null};
  `);
  assert.equal(result.guardAfter, 34.4);
  assert.ok(Math.abs(result.wallGain-9.6)<0.001);
  assert.equal(result.distantHp, 20);
  assert.equal(result.towerHp, 40);
  assert.equal(result.targetKind, 'building');
});

test('town hall automatically fires entity arrows at visible enemies', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall',20,20),center=hall.center();G.townHall=hall;
    const enemy=new Enemy(center.x+80,center.y);
    G.buildings=[hall];G.enemies=[enemy];G.projectiles=[];initFog();G.fogVisible.fill(1);
    const hpBefore=enemy.hp;updateTowers(1);const arrows=G.projectiles.length;
    for(let index=0;index<10;index++) updateProjectiles(0.05);
    globalThis.__result={arrows,hpBefore,hpAfter:enemy.hp};
  `);
  assert.equal(result.arrows, 1);
  assert.ok(result.hpAfter<result.hpBefore);
});

test('idle patrol stays inside static light without revealing its own position', () => {
  const result = runGameScenario(`
    const resident = new Resident(400, 400);
    G.buildings = []; G.residents = [resident]; initFog(); refreshFogVisibility();
    const selfVisible = isWorldVisible(resident.x, resident.y);
    const patrolAllowedWithoutBuilding = isStaticPatrolVisible(resident.x, resident.y);
    const hall = new Building('town_hall', 8, 8);
    G.buildings = [hall];
    const center = hall.center();
    globalThis.__result = {
      selfVisible,
      patrolAllowedWithoutBuilding,
      inside:isStaticPatrolVisible(center.x, center.y),
      outside:isStaticPatrolVisible(center.x + buildingLevelValue('town_hall',1,'vision') * CFG.CELL + 1, center.y)
    };
  `);
  assert.equal(result.selfVisible, false);
  assert.equal(result.patrolAllowedWithoutBuilding, false);
  assert.equal(result.inside, true);
  assert.equal(result.outside, false);
});

test('night lights use full town hall and lamp vision radii', () => {
  const result = runGameScenario(`
    const hall = new Building('town_hall', 10, 10);
    const lamp = new Building('lamp', 20, 20);
    const farm = new Building('farm', 30, 30);
    globalThis.__result = {
      hall:nightLightRadius(hall),
      lamp:nightLightRadius(lamp),
      farm:nightLightRadius(farm)
    };
  `);
  assert.equal(result.hall, 320);
  assert.equal(result.lamp, 200);
  assert.equal(result.farm, 0);
});

test('initial resource generation respects radii and visible tree minimum', () => {
  const result = runGameScenario(`
    initGame();
    const center=G.townHall.center();
    const distance=node=>initialResourceDistance(node.col,node.row,center);
    const trees=G.resourceNodes.filter(node=>node.type==='tree');
    const stones=G.resourceNodes.filter(node=>node.type==='stone');
    const irons=G.resourceNodes.filter(node=>node.type==='iron');
    globalThis.__result={
      treeRadius:trees.every(node=>distance(node)>CFG.TREE_MIN_SPAWN_RADIUS),
      stoneRadius:stones.every(node=>distance(node)>CFG.STONE_MIN_SPAWN_RADIUS),
      ironRadius:irons.every(node=>distance(node)>CFG.IRON_MIN_SPAWN_RADIUS),
      visibleTrees:trees.filter(node=>distance(node)<=buildingLevelValue('town_hall',1,'vision')).length,
      treeCount:trees.length
    };
  `);
  assert.equal(result.treeRadius, true);
  assert.equal(result.stoneRadius, true);
  assert.equal(result.ironRadius, true);
  assert.ok(result.visibleTrees >= 5);
  assert.equal(result.treeCount, 150);
});

test('resource cluster sizes stay within configured bounds and rare iron clusters remain possible', () => {
  const result = runGameScenario(`
    const originalRandom=Math.random;
    Math.random=()=>0;
    const tree=sampleClusterSize(4,10);
    const stone=sampleClusterSize(1.5,6);
    Math.random=()=>0.01;
    const iron=sampleClusterSize(1,4,0.04);
    Math.random=originalRandom;
    globalThis.__result={tree,stone,iron};
  `);
  assert.ok(result.tree >= 1 && result.tree <= 10);
  assert.ok(result.stone >= 1 && result.stone <= 6);
  assert.ok(result.iron >= 2 && result.iron <= 4);
});

test('building upgrades improve production, storage, defense, and lamp vision', () => {
  const result = runGameScenario(`
    const farm=new Building('farm', 10, 10); farm.level=3;
    const storage=new Building('wood_storage', 20, 20); storage.level=2;
    const tower=new Building('arrow_tower', 30, 30); tower.level=2;
    const autoTower=new Building('auto_arrow_tower', 40, 40); autoTower.level=3;
    const lamp=new Building('lamp', 50, 50); lamp.level=2;
    const wall=new Building('wall', 60, 60); wall.level=3;
    globalThis.__result={
      speed:productionSpeedMultiplier(farm), buffer:productionBufferCapacity(farm), storage:storageCapacity(storage),
      towerDamage:towerDamage(tower), autoRange:towerRange(autoTower), lampVision:buildingVisionRadius(lamp)/CFG.CELL,
      wallDamage:buildingDamageTaken(wall, 100)
    };
  `);
  assert.equal(result.speed, 1.4);
  assert.equal(result.buffer, 9);
  assert.equal(result.storage, 75);
  assert.equal(result.towerDamage, 18.75);
  assert.equal(result.autoRange, 200);
  assert.equal(result.lampVision, 6);
  assert.equal(result.wallDamage, 70);
});

test('enemies target the first building blocking their route instead of array order', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall', 20, 10);
    const laterFarm=new Building('farm', 9, 10);
    const frontWall=new Building('wall', 4, 10);
    G.townHall=hall; G.buildings=[hall,laterFarm,frontWall];
    const enemy=new Enemy(100, 420);
    globalThis.__result={target:enemyRouteBlocker(enemy)?.type, isWall:enemyRouteBlocker(enemy)===frontWall};
  `);
  assert.equal(result.target, 'wall');
  assert.equal(result.isWall, true);
});

test('enemy types unlock by day and carry their own combat stats', () => {
  const result = runGameScenario(`
    const originalRandom=Math.random;
    Math.random=()=>0.99;
    const dayOne=pickEnemyType(1), dayThree=pickEnemyType(3), daySix=pickEnemyType(6);
    Math.random=originalRandom;
    const fast=new Enemy(0, 0, 'fast');
    const breaker=new Enemy(0, 0, 'breaker');
    globalThis.__result={dayOne,dayThree,daySix,fast:{hp:fast.hp,damage:fast.damage},breaker:{hp:breaker.hp,damage:breaker.damage,speed:breaker.speed}};
  `);
  assert.equal(result.dayOne, 'normal');
  assert.equal(result.dayThree, 'fast');
  assert.equal(result.daySix, 'breaker');
  assert.equal(result.fast.hp, 24);
  assert.equal(result.fast.damage, 5);
  assert.equal(result.breaker.hp, 110);
  assert.equal(result.breaker.damage, 16);
  assert.ok(result.breaker.speed < 40);
});

test('farms and ruins do not block movement or become enemy route blockers', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall', 20, 10);
    const frontFarm=new Building('farm', 4, 10);
    const laterWall=new Building('wall', 9, 10);
    const farmRuin=new Building('farm', 14, 10); farmRuin.hp=0; farmRuin.ruin=true;
    G.townHall=hall; G.buildings=[hall,frontFarm,laterWall,farmRuin];
    G.resourceNodes=[]; invalidateNavigation(); ensureObstacleSpatialHash();
    const normal=new Enemy(100, 420, 'normal');
    const breaker=new Enemy(100, 420, 'breaker');
    const fc=frontFarm.center(), rc=farmRuin.center();
    globalThis.__result={
      normal:enemyRouteBlocker(normal)?.type,
      breaker:enemyRouteBlocker(breaker)?.type,
      farmBlocks:buildingBlocksMovement(frontFarm),
      ruinBlocks:buildingBlocksMovement(farmRuin),
      farmIndexed:G.obstacleSpatial.query(fc.x,fc.y,fc.x,fc.y).includes(frontFarm),
      ruinIndexed:G.obstacleSpatial.query(rc.x,rc.y,rc.x,rc.y).includes(farmRuin),
      ruinPathClear:navigationLineClear({x:rc.x-CFG.CELL*2,y:rc.y},{x:rc.x+CFG.CELL*2,y:rc.y})
    };
  `);
  assert.equal(result.normal, 'wall');
  assert.equal(result.breaker, 'wall');
  assert.equal(result.farmBlocks, false);
  assert.equal(result.ruinBlocks, false);
  assert.equal(result.farmIndexed, false);
  assert.equal(result.ruinIndexed, false);
  assert.equal(result.ruinPathClear,true);
});

test('town hall starts with one guard and separate worker and guard capacity', () => {
  const result = runGameScenario(`
    initGame();
    globalThis.__result={
      workers:residentCount(false), guards:residentCount(true), workerCap:G.maxPop, guardCap:G.maxGuards,
      guardHome:G.residents.find(r=>r.isGuard).home.type, startPop:CFG.START_POP, startEngineers:CFG.START_ENGINEERS,
      engineers:G.residents.filter(r=>!r.isGuard&&r.isEngineer).length, startCap:CFG.MAX_POP_BASE
    };
  `);
  assert.equal(result.guards, 1);
  assert.equal(result.guardCap, 2);
  assert.equal(result.workers, result.startPop);
  assert.equal(result.engineers, result.startEngineers);
  assert.equal(result.workerCap, result.startCap);
  assert.equal(result.guardHome, 'town_hall');
});

test('starting engineer count is loaded from balance configuration', () => {
  const result = runGameScenario(`
    applyBalanceData({globals:{START_POP:3,START_ENGINEERS:2}});
    initGame();
    globalThis.__result={engineers:G.residents.filter(r=>!r.isGuard&&r.isEngineer).length,pop:residentCount(false)};
  `);
  assert.equal(result.pop, 3);
  assert.equal(result.engineers, 2);
});

test('houses and barracks provide separate homes while nursery and training ground recruit their own roles', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall', 10, 10);
    const house=new Building('house', 20, 10);
    const barracks=new Building('barracks', 30, 10);
    const nursery=new Building('nursery', 40, 10);
    const training=new Building('training_ground', 50, 10);
    G.townHall=hall; G.buildings=[hall,house,barracks,nursery,training]; G.residents=[];
    G.maxPop=5; G.maxGuards=6; G.phase='day';
    const worker=new Resident(0,0),helper=new Resident(0,0); const guard=new Resident(0,0); guard.isGuard=true;
    assignHome(worker, house); assignHome(helper,house);assignHome(guard, barracks); G.residents.push(worker,helper,guard);
    assignResidentToWorkplace(worker,nursery);assignResidentToWorkplace(helper,nursery);
    worker.state='WORKING';helper.state='WORKING';
    nursery.recruitQueue=1; training.recruitQueue=1;
    updateBuildings(20);
    globalThis.__result={
      workerHome:worker.home.type, guardHome:guard.home.type, workers:residentCount(false), guards:residentCount(true),
      nurseryQueue:nursery.recruitQueue, trainingQueue:training.recruitQueue, hallCanRecruit:!!BLD_DEFS.town_hall.recruits,
      nurseryWorkers:nursery.assignedWorkers,workerState:worker.state,helperState:helper.state
    };
  `);
  assert.equal(result.workerHome, 'house');
  assert.equal(result.guardHome, 'barracks');
  assert.equal(result.workers, 3);
  assert.equal(result.guards, 2);
  assert.equal(result.nurseryQueue, 0);
  assert.equal(result.trainingQueue, 0);
  assert.equal(result.hallCanRecruit, false);
  assert.equal(result.nurseryWorkers,0);
  assert.equal(result.workerState,'IDLE');
  assert.equal(result.helperState,'IDLE');
});

test('nursery recruitment waits until two assigned workers are simultaneously working', () => {
  const result=runGameScenario(`
    const hall=new Building('town_hall',10,10),nursery=new Building('nursery',20,10);
    const first=new Resident(0,0),second=new Resident(0,0);
    G.townHall=hall;G.buildings=[hall,nursery];G.residents=[first,second];G.maxPop=5;G.phase='day';
    nursery.recruitQueue=1;assignResidentToWorkplace(first,nursery);first.state='WORKING';
    updateBuildings(BLD_DEFS.nursery.recruitTime);const oneWorkerProgress=nursery.recruitProgress;
    assignResidentToWorkplace(second,nursery);second.state='GOING_TO_WORK';
    updateBuildings(BLD_DEFS.nursery.recruitTime);const travellingProgress=nursery.recruitProgress;
    second.state='WORKING';updateBuildings(BLD_DEFS.nursery.recruitTime);
    globalThis.__result={oneWorkerProgress,travellingProgress,queue:nursery.recruitQueue,pop:residentCount(false),assigned:nursery.assignedWorkers,states:[first.state,second.state]};
  `);
  assert.equal(result.oneWorkerProgress,0);
  assert.equal(result.travellingProgress,0);
  assert.equal(result.queue,0);
  assert.equal(result.pop,3);
  assert.equal(result.assigned,0);
  assert.equal(result.states[0],'IDLE');
  assert.equal(result.states[1],'IDLE');
});

test('building editor fields are tailored by building type and lamp vision uses its definition', () => {
  const result = runGameScenario(`
    BLD_DEFS.lamp.vision=7;
    const lamp=new Building('lamp', 20, 20); lamp.level=2;
    globalThis.__result={
      lampFields:buildingEditFields('lamp').map(field=>field.k).join(','),
      farmFields:buildingEditFields('farm').map(field=>field.k).join(','),
      storageFields:buildingEditFields('food_storage').map(field=>field.k).join(','),
      townHallFields:buildingEditFields('town_hall').map(field=>field.k).join(','),
      townHallLevelTwoFields:buildingEditFields('town_hall',2).map(field=>field.k).join(','),
      restorationFields:buildingEditFields('restoration_tower').map(field=>field.k).join(','),
      lampVision:buildingVisionRadius(lamp)/CFG.CELL,
    };
  `);
  assert.match(result.lampFields, /vision/);
  assert.doesNotMatch(result.lampFields, /maxWorkers/);
  assert.match(result.townHallFields, /startResources/);
  assert.match(result.townHallFields, /range/);
  assert.match(result.townHallFields, /damage/);
  assert.doesNotMatch(result.townHallLevelTwoFields, /startResources/);
  assert.match(result.farmFields, /maxWorkers/);
  assert.match(result.farmFields, /baseTime/);
  assert.match(result.farmFields, /unlock/);
  assert.doesNotMatch(result.storageFields, /maxWorkers/);
  assert.match(result.storageFields, /capacity/);
  assert.match(result.lampFields, /unlock/);
  assert.match(result.restorationFields, /repairRange/);
  assert.match(result.restorationFields, /buildingRepairRate/);
  assert.match(result.restorationFields, /unitRepairRate/);
  assert.doesNotMatch(result.townHallFields, /unlock/);
  assert.equal(result.lampVision, 8);
});

test('global editor fields are divided into complete non-overlapping groups', () => {
  const result=runGameScenario(`
    const grouped=GLOBAL_EDIT_GROUPS.flatMap(group=>group.fields);
    globalThis.__result={
      keys:GLOBAL_EDIT_GROUPS.map(group=>group.key),
      labels:GLOBAL_EDIT_GROUPS.map(group=>group.label),
      complete:GLOBAL_EDIT_FIELDS.every(field=>grouped.includes(field.k)),
      unique:new Set(grouped).size===grouped.length,
      movement:globalEditFields('movement').map(field=>field.k)
    };
  `);
  assert.equal(result.keys.join(','),'time,movement,fruitTrees,hunting');
  assert.equal(result.labels.join(','),'时间与居民作息,移动与寻路,果树种植与收获,猎物与狩猎');
  assert.equal(result.complete,true);
  assert.equal(result.unique,true);
  assert.equal(result.movement.join(','),'RESIDENT_SPEED,NAV_STUCK_WINDOW,NAV_STUCK_MIN_DISTANCE');
});

test('invalid global group values do not partially mutate configuration', () => {
  const result=runGameScenario(`
    const controls={'cfg-category':{value:'globals'},'cfg-item':{value:'fruitTrees'},'cfg-status':{textContent:'',style:{}}};
    for(const field of globalEditFields('fruitTrees')) controls['cfg-global-'+field.k]={value:String(CFG[field.k])};
    controls['cfg-global-FRUIT_TREE_WOOD_COST'].value='9';
    controls['cfg-global-FRUIT_TREE_GROW_TIME_MIN'].value='50';
    controls['cfg-global-FRUIT_TREE_GROW_TIME_MAX'].value='10';
    document.getElementById=id=>controls[id]||elementStub();
    const before=CFG.FRUIT_TREE_WOOD_COST,applied=cfgApply();
    globalThis.__result={applied,before,after:CFG.FRUIT_TREE_WOOD_COST};
  `);
  assert.equal(result.applied,false);
  assert.equal(result.after,result.before);
});

test('config editor session preserves panel values while switching views', () => {
  const result=runGameScenario(`
    const controls={};
    for(const field of globalEditFields('fruitTrees')) controls['cfg-global-'+field.k]={value:String(CFG[field.k])};
    controls['cfg-global-FRUIT_TREE_WOOD_COST'].value='13';
    document.getElementById=id=>controls[id]||elementStub();
    const view={cat:'globals',key:'fruitTrees',level:1};
    cfgEditSession={panels:new Map(),view};
    cfgCaptureCurrentPanel();
    controls['cfg-global-FRUIT_TREE_WOOD_COST'].value='2';
    cfgRestoreCurrentPanel(view);
    globalThis.__result={restored:controls['cfg-global-FRUIT_TREE_WOOD_COST'].value,panels:cfgEditSession.panels.size};
  `);
  assert.equal(result.restored,'13');
  assert.equal(result.panels,1);
});

test('config session merges changes from multiple categories into one commit', () => {
  const result=runGameScenario(`
    const panel=(view,fields,prefix,changes={})=>({view,values:Object.fromEntries(fields.map(field=>[prefix+field.k,String(changes[field.k]??CFG[field.k])]))});
    const fruit=panel({cat:'globals',key:'fruitTrees',level:1},globalEditFields('fruitTrees'),'cfg-global-',{FRUIT_TREE_WOOD_COST:12});
    const guard=panel({cat:'professions',key:'guard',level:1},PROFESSION_EDIT_FIELDS.guard,'cfg-profession-',{GUARD_DAMAGE:19});
    const candidate=cfgConfigSnapshot();
    const fruitError=cfgMergePanelIntoCandidate(fruit,candidate);
    const guardError=cfgMergePanelIntoCandidate(guard,candidate);
    const validationError=cfgValidateCandidate(candidate);
    const before={wood:CFG.FRUIT_TREE_WOOD_COST,damage:CFG.GUARD_DAMAGE};
    globalThis.updateBuildingPanel=()=>{};
    if(!fruitError&&!guardError&&!validationError) cfgCommitCandidate(candidate);
    globalThis.__result={fruitError,guardError,validationError,before,after:{wood:CFG.FRUIT_TREE_WOOD_COST,damage:CFG.GUARD_DAMAGE}};
  `);
  assert.equal(result.fruitError,'');
  assert.equal(result.guardError,'');
  assert.equal(result.validationError,'');
  assert.notEqual(result.before.wood,result.after.wood);
  assert.notEqual(result.before.damage,result.after.damage);
  assert.deepEqual({...result.after},{wood:12,damage:19});
});

test('resource map parser rejects unknown and duplicate resource keys', () => {
  const result=runGameScenario(`
    globalThis.__result={
      valid:parseResourceMapInput('wood:2, charcoal:1'),
      unknown:parseResourceMapInput('coal:1'),
      duplicate:parseResourceMapInput('wood:1,wood:2'),
      empty:parseResourceMapInput('wood:'),
      productTypes:['farm','charcoal_kiln','smelter'].map(type=>buildingEditFields(type).find(field=>field.k==='produces')?.type)
    };
  `);
  assert.deepEqual({...result.valid.value},{wood:2,charcoal:1});
  assert.match(result.unknown.error,/未知资源键/);
  assert.match(result.duplicate.error,/重复填写/);
  assert.match(result.empty.error,/数量无效/);
  assert.equal(result.productTypes.join(','),'resource,resource,resource');
});

test('building editor entries are stably sorted by town hall unlock level', () => {
  const result=runGameScenario(`
    BLD_DEFS.floor.unlock=3;BLD_DEFS.house.unlock=1;BLD_DEFS.nursery.unlock=2;BLD_DEFS.lamp.unlock=1;
    const original=Object.keys(BLD_DEFS),entries=sortedBuildingEntries(),keys=entries.map(([key])=>key),levels=entries.map(([,def])=>Number(def.unlock)||1);
    const stableAtLevel=level=>keys.filter(key=>(Number(BLD_DEFS[key].unlock)||1)===level).join(',')===original.filter(key=>(Number(BLD_DEFS[key].unlock)||1)===level).join(',');
    globalThis.__result={monotonic:levels.every((level,index)=>index===0||levels[index-1]<=level),stableOne:stableAtLevel(1),stableTwo:stableAtLevel(2),namesOnly:entries.every(([,def])=>!def.name.includes('大本营等级'))};
  `);
  assert.equal(result.monotonic,true);
  assert.equal(result.stableOne,true);
  assert.equal(result.stableTwo,true);
  assert.equal(result.namesOnly,true);
});

test('building editor filters combine town hall levels with custom building types', () => {
  const result=runGameScenario(`
    BLD_DEFS.nursery.unlock=2;BLD_DEFS.training_ground.unlock=3;BLD_DEFS.farm.unlock=2;
    BLD_DEFS.house.unlock=2;BLD_DEFS.barracks.unlock=3;BLD_DEFS.arrow_tower.unlock=2;BLD_DEFS.lamp.unlock=2;
    cfgBuildingFilters.levels=new Set([2]);cfgBuildingFilters.types=new Set(['production']);
    const levelTwoProduction=filteredCfgBuildingEntries().map(([key])=>key);
    cfgBuildingFilters.levels.add(3);
    const twoLevelsProduction=filteredCfgBuildingEntries().map(([key])=>key);
    cfgBuildingFilters.types=new Set(['storage']);
    const storage=filteredCfgBuildingEntries().map(([key])=>key);
    globalThis.__result={
      levelTwoProduction,twoLevelsProduction,storage,
      groups:{nursery:cfgBuildingFilterType('nursery'),training:cfgBuildingFilterType('training_ground'),house:cfgBuildingFilterType('house'),barracks:cfgBuildingFilterType('barracks'),tower:cfgBuildingFilterType('arrow_tower'),lamp:cfgBuildingFilterType('lamp')}
    };
  `);
  assert.equal(result.levelTwoProduction.includes('nursery'),true);
  assert.equal(result.levelTwoProduction.includes('farm'),true);
  assert.equal(result.levelTwoProduction.includes('training_ground'),false);
  assert.equal(result.twoLevelsProduction.includes('training_ground'),true);
  assert.equal(result.storage.includes('house'),true);
  assert.equal(result.storage.includes('barracks'),true);
  assert.deepEqual({...result.groups},{nursery:'production',training:'production',house:'storage',barracks:'storage',tower:'defense',lamp:'other'});
});

test('filtered buildings render as wrapping name buttons with an active selection', () => {
  const result=runGameScenario(`
    BLD_DEFS.farm.unlock=2;BLD_DEFS.nursery.unlock=2;BLD_DEFS.house.unlock=2;
    cfgBuildingFilters.levels=new Set([2]);cfgBuildingFilters.types=new Set(['production']);
    const container={innerHTML:'',children:[],appendChild(child){this.children.push(child);}};
    document.getElementById=id=>id==='cfg-building-results'?container:elementStub();
    document.createElement=()=>({type:'',className:'',textContent:'',onclick:null});
    renderCfgBuildingResults('farm');
    globalThis.__result={
      names:container.children.map(child=>child.textContent),
      active:container.children.find(child=>child.className.includes('active'))?.textContent
    };
  `);
  assert.match(html,/id="cfg-building-results" class="cfg-building-results"/);
  assert.equal(result.names.includes('农场'),true);
  assert.equal(result.names.includes('产房'),true);
  assert.equal(result.names.includes('住房'),false);
  assert.equal(result.active,'农场');
});

test('building level overrides and town hall resource configuration apply at runtime', () => {
  const result = runGameScenario(`
    BLD_DEFS.town_hall.maxLevel=3;
    BLD_DEFS.town_hall.startResources={food:12,wood:9,stone:3,iron:1,ingot:0};
    BLD_DEFS.town_hall.levels={2:{hp:820,vision:11,storageCaps:{food:80,wood:70,stone:60,iron:50,ingot:40},upgradeCost:{wood:33}}};
    initGame();
    const hall=G.townHall; hall.level=2;
    globalThis.__result={
      fields:buildingEditFields('town_hall').map(field=>field.k).join(','),
      startFood:hall.stored.food, startWood:hall.stored.wood,
      hp:buildingLevelValue('town_hall',2,'hp'), vision:buildingVisionRadius(hall)/CFG.CELL,
      foodCap:storageCapacity(hall,'food'), ironCap:storageCapacity(hall,'iron'),
      upgradeCost:upgradeCostForLevel('town_hall',2).wood, maxLevel:maxBuildingLevel('town_hall')
    };
  `);
  assert.match(result.fields, /startResources/);
  assert.match(result.fields, /storageCaps/);
  assert.match(result.fields, /vision/);
  assert.doesNotMatch(result.fields, /buildTime/);
  assert.equal(result.startFood, 12);
  assert.equal(result.startWood, 9);
  assert.equal(result.hp, 820);
  assert.equal(result.vision, 11);
  assert.equal(result.foodCap, 80);
  assert.equal(result.ironCap, 50);
  assert.equal(result.upgradeCost, 33);
  assert.equal(result.maxLevel, 3);
});

test('floor movement multiplier is configured by the floor definition', () => {
  const result = runGameScenario(`
    BLD_DEFS.floor.moveSpeedMultiplier=2;
    G.floorMask=new Uint8Array(CFG.WORLD_COLS*CFG.WORLD_ROWS);
    const resident=new Resident(60,60);
    G.floorMask[gridCol(resident.x)+gridRow(resident.y)*CFG.WORLD_COLS]=1;
    const moved=flowMove(resident,160,60,10,1);
    globalThis.__result={fields:buildingEditFields('floor').map(field=>field.k).join(','), multiplier:floorMovementMultiplier(), distance:moved.x-resident.x, maxLevel:BLD_DEFS.floor.maxLevel};
  `);
  assert.match(result.fields, /moveSpeedMultiplier/);
  assert.equal(result.multiplier, 2);
  assert.equal(result.distance, 20);
  assert.equal(result.maxLevel, 1);
});

test('building growth parameters are owned by their respective building definitions', () => {
  const result = runGameScenario(`
    globalThis.__result={
      globals:{storage:CFG.STORAGE_UPGRADE_CAPACITY,lamp:CFG.LAMP_UPGRADE_VISION},
      farm:buildingEditFields('farm').map(field=>field.k).join(','),
      storage:buildingEditFields('food_storage').map(field=>field.k).join(','),
      tower:buildingEditFields('arrow_tower').map(field=>field.k).join(','),
      lamp:buildingEditFields('lamp').map(field=>field.k).join(','),
      wall:buildingEditFields('wall').map(field=>field.k).join(','),
    };
  `);
  assert.equal(result.globals.storage, undefined);
  assert.equal(result.globals.lamp, undefined);
  assert.match(result.farm, /levelSpeedBonus/);
  assert.match(result.storage, /levelCapacityBonus/);
  assert.match(result.tower, /levelDamageBonus/);
  assert.match(result.lamp, /levelVisionBonus/);
  assert.match(result.wall, /levelDamageReduction/);
});

test('guard profession values control guard combat statistics', () => {
  const result = runGameScenario(`
    CFG.GUARD_MAX_HP=120; CFG.GUARD_DAMAGE=19; CFG.GUARD_SPEED=72; CFG.GUARD_ATTACK_COOLDOWN=0.4;
    const guard=new Resident(0,0); guard.isGuard=true;
    globalThis.__result={hp:guard.guardHP,maxHp:guard.guardMaxHP,damage:CFG.GUARD_DAMAGE,speed:CFG.GUARD_SPEED,cooldown:CFG.GUARD_ATTACK_COOLDOWN};
  `);
  assert.equal(result.hp, 120);
  assert.equal(result.maxHp, 120);
  assert.equal(result.damage, 19);
  assert.equal(result.speed, 72);
  assert.equal(result.cooldown, 0.4);
});

test('dedicated storage accepts only its matching resource type', () => {
  const result = runGameScenario(`
    const woodStore=new Building('wood_storage',10,10);
    const foodStore=new Building('food_storage',20,20);
    const hall=new Building('town_hall',30,30);
    G.buildings=[woodStore,foodStore,hall];
    G.resources={food:0,wood:0,stone:0,iron:0,ingot:0};
    globalThis.__result={
      foodIntoWood:depositToStorage(woodStore,'food',5),
      woodIntoFood:depositToStorage(foodStore,'wood',5),
      woodIntoWood:depositToStorage(woodStore,'wood',5),
      foodIntoHall:depositToStorage(hall,'food',5),
      wood:storedAmount(woodStore,'wood'),
      food:storedAmount(foodStore,'food'),
    };
  `);
  assert.equal(result.foodIntoWood, 0);
  assert.equal(result.woodIntoFood, 0);
  assert.equal(result.woodIntoWood, 5);
  assert.equal(result.foodIntoHall, 5);
  assert.equal(result.wood, 5);
  assert.equal(result.food, 0);
});

test('charcoal uses its own storage and resource icon', () => {
  const result=runGameScenario(`
    const hall=new Building('town_hall',30,30),store=new Building('charcoal_storage',20,20);
    G.townHall=hall;G.buildings=[hall,store];G.resources={};
    globalThis.__result={
      acceptsCharcoal:depositToStorage(store,'charcoal',6),
      rejectsWood:depositToStorage(store,'wood',3),
      stored:storedAmount(store,'charcoal'),
      mapped:RESOURCE_STORAGE_TYPES.charcoal,
      icon:resourceIcon('charcoal')
    };
  `);
  assert.equal(result.acceptsCharcoal,6);
  assert.equal(result.rejectsWood,0);
  assert.equal(result.stored,6);
  assert.equal(result.mapped,'charcoal_storage');
  assert.match(result.icon,/resource-mark charcoal/);
});

test('charcoal kiln consumes wood and the smelter requires iron plus charcoal', () => {
  const result=runGameScenario(`
    const hall=new Building('town_hall',30,30),kiln=new Building('charcoal_kiln',20,20),smelter=new Building('smelter',24,20);
    hall.stored.wood=10;hall.stored.iron=2;hall.stored.charcoal=0;
    const kilnWorker=new Resident(0,0);kilnWorker.workplace=kiln;kilnWorker.state='WORKING';
    const smelterWorker=new Resident(0,0);smelterWorker.workplace=smelter;smelterWorker.state='WORKING';
    G.townHall=hall;G.buildings=[hall,kiln,smelter];G.residents=[kilnWorker,smelterWorker];updateAllResourceTotals();
    updateBuildings(BLD_DEFS.charcoal_kiln.baseTime*BLD_DEFS.charcoal_kiln.maxWorkers);
    const afterKiln={wood:G.resources.wood,output:kiln.pendingOutput};
    updateBuildings(BLD_DEFS.smelter.baseTime*BLD_DEFS.smelter.maxWorkers);
    const blockedWithoutCharcoal={iron:G.resources.iron,output:smelter.pendingOutput};
    hall.stored.charcoal=1;updateAllResourceTotals();smelter.productionProgress=0;
    updateBuildings(BLD_DEFS.smelter.baseTime*BLD_DEFS.smelter.maxWorkers);
    globalThis.__result={afterKiln,blockedWithoutCharcoal,afterSmelting:{iron:G.resources.iron,charcoal:G.resources.charcoal,output:smelter.pendingOutput},recipe:BLD_DEFS.smelter.inputs};
  `);
  assert.deepEqual({...result.afterKiln},{wood:8,output:1});
  assert.deepEqual({...result.blockedWithoutCharcoal},{iron:2,output:0});
  assert.deepEqual({...result.afterSmelting},{iron:1,charcoal:0,output:1});
  assert.deepEqual({...result.recipe},{iron:1,charcoal:1});
});

test('a zero town hall resource capacity hides the resource from availability and storage', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall',30,30);
    const woodStore=new Building('wood_storage',10,10);
    BLD_DEFS.town_hall.storageCaps={food:20,wood:0,stone:0,iron:0,ingot:0};
    G.townHall=hall; G.buildings=[hall,woodStore];
    globalThis.__result={food:isResourceAvailable('food'),wood:isResourceAvailable('wood'),woodStorage:storageAcceptsResource(woodStore,'wood')};
  `);
  assert.equal(result.food, true);
  assert.equal(result.wood, false);
  assert.equal(result.woodStorage, false);
});

test('enemy attributes and profession attributes are kept out of global editor fields', () => {
  const result = runGameScenario(`
    globalThis.__result={
      globals:GLOBAL_EDIT_FIELDS.map(field=>field.k).join(','),
      guard:PROFESSION_EDIT_FIELDS.guard.map(field=>field.k).join(','),
      engineer:PROFESSION_EDIT_FIELDS.engineer.map(field=>field.k).join(','),
      normal:{hp:ENEMY_DEFS.normal.hp,speed:ENEMY_DEFS.normal.speed,damage:ENEMY_DEFS.normal.damage},
    };
  `);
  assert.doesNotMatch(result.globals, /ENEMY_BASE_HP|ENEMY_SPEED|ENEMY_DAMAGE|RESIDENT_VISION|GUARD_VISION|ENGINEER_REPAIR_RATE/);
  assert.match(result.guard, /GUARD_MAX_HP|GUARD_DAMAGE|GUARD_SPEED|GUARD_ATTACK_COOLDOWN/);
  assert.doesNotMatch(result.guard,/GUARD_VISION/);
  assert.match(result.engineer, /ENGINEER_REPAIR_RATE/);
  assert.equal(result.normal.hp, 40);
});

test('building panel unlock rules preview one town hall level and hide extra requirements until then', () => {
  const result = runGameScenario(`
    const def={unlock:2,unlockTreesChopped:10};
    G.treesChopped=1;
    const levelOne=buildingUnlockStatus(def,1);
    const levelTwo=buildingUnlockStatus(def,2);
    G.treesChopped=10;
    const complete=buildingUnlockStatus(def,2);
    globalThis.__result={levelOne,levelTwo,complete};
  `);
  assert.equal(result.levelOne.visible, true);
  assert.equal(result.levelOne.unlocked, false);
  assert.equal(result.levelOne.text, '需要2级大本营与？');
  assert.equal(result.levelTwo.text, '砍伐树木 1/10');
  assert.equal(result.complete.unlocked, true);
});

test('debug unlock all also satisfies extra building unlock requirements', () => {
  const result = runGameScenario(`
    globalThis.updateBuildingPanel=()=>{};
    const hall=new Building('town_hall',30,30);
    G.townHall=hall; G.buildings=[hall]; G.treesChopped=0;
    unlockAll();
    globalThis.__result={
      treesChopped:G.treesChopped,
      required:BLD_DEFS.wood_storage.unlockTreesChopped,
      woodStorage:buildingUnlockStatus(BLD_DEFS.wood_storage, G.townHall.level).unlocked,
    };
  `);
  assert.ok(result.treesChopped >= result.required);
  assert.equal(result.woodStorage, true);
});

test('debug population controls keep residents and guards separate', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall',30,30);
    G.townHall=hall; G.buildings=[hall]; G.residents=[]; G.phase='day';
    addPop(1); addDebugGuard(1); addPop(-1);
    globalThis.__result={workers:residentCount(false),guards:residentCount(true)};
  `);
  assert.equal(result.workers, 0);
  assert.equal(result.guards, 1);
});

test('a guard can enter manual mode and receive a move target', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall',30,30);
    const tower=new Building('arrow_tower',34,30);
    const guard=new Resident(100,100); guard.isGuard=true; guard.hidden=false; guard.state='GUARD_MANNING';
    guard.assignedTower=tower; guard.manningTower=tower; tower.assignedGuard=guard;
    G.townHall=hall; G.buildings=[hall,tower]; G.residents=[guard]; G.phase='night';
    setGuardControlMode(guard,'manual');
    guard.manualTarget={x:160,y:100};
    updateManualGuard(guard,0.5);
    globalThis.__result={mode:guard.controlMode,state:guard.state,towerReleased:tower.assignedGuard===null,moved:guard.x>100};
  `);
  assert.equal(result.mode, 'manual');
  assert.equal(result.state, 'GUARD_MANUAL');
  assert.equal(result.towerReleased, true);
  assert.equal(result.moved, true);
});

test('selected guards switch control mode together and manual movement plans around obstacles', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall',30,30);
    const wall=new Building('wall',2,1);
    const first=new Resident(20,60); first.isGuard=true; first.hidden=false;
    const second=new Resident(30,60); second.isGuard=true; second.hidden=false;
    G.townHall=hall; G.buildings=[hall,wall]; G.residents=[first,second]; G.phase='night';
    setSelectedGuards([first,second]);
    for (const guard of G.selectedGuards) setGuardControlMode(guard,'manual');
    first.manualTarget={x:220,y:60};
    updateManualGuard(first,0.1);
    processNavigationRequests();
    globalThis.__result={
      bothManual:first.controlMode==='manual'&&second.controlMode==='manual',
      hasPath:Array.isArray(first.navPath)&&first.navPath.length>0,
      leavesDirectLine:first.navPath&&first.navPath.some(point=>Math.abs(point.y-60)>10)
    };
  `);
  assert.equal(result.bothManual, true);
  assert.equal(result.hasPath, true);
  assert.equal(result.leavesDirectLine, true);
});

test('guard groups receive unique oriented formation slots and share a route around obstacles', () => {
  const result = runGameScenario(`
    const wall=new Building('town_hall',4,1);
    const guards=[];
    for(let index=0;index<9;index++) {
      const guard=new Resident(40+(index%3)*18,80+Math.floor(index/3)*18);
      guard.isGuard=true;guard.hidden=false;guard.controlMode='manual';guards.push(guard);
    }
    G.buildings=[wall];G.resourceNodes=[];G.residents=guards;invalidateNavigation();
    const assignments=assignGuardGroupMove(guards,{x:360,y:100});
    const slots=new Set(assignments.map(item=>item.target.x.toFixed(2)+','+item.target.y.toFixed(2)));
    globalThis.__result={
      count:assignments.length,unique:slots.size,
      allTargeted:guards.every(guard=>!!guard.manualTarget),
      routed:guards.filter(guard=>guard.navPath&&guard.navPath.length>1).length,
      verticalSpread:Math.max(...assignments.map(item=>item.target.y))-Math.min(...assignments.map(item=>item.target.y))
    };
  `);
  assert.equal(result.count, 9);
  assert.equal(result.unique, 9);
  assert.equal(result.allTargeted, true);
  assert.ok(result.routed >= 7);
  assert.ok(result.verticalSpread > 30);
});

test('formation assignment preserves each guards front-back and lateral order', () => {
  const result = runGameScenario(`
    const backLeft=new Resident(100,100),frontLeft=new Resident(100,121);
    const backRight=new Resident(121,100),frontRight=new Resident(121,121);
    const guards=[backLeft,frontLeft,backRight,frontRight];
    const assignments=guardFormationAssignments(guards,{x:110.5,y:300});
    const targetOf=guard=>assignments.find(item=>item.guard===guard).target;
    const bl=targetOf(backLeft),fl=targetOf(frontLeft),br=targetOf(backRight),fr=targetOf(frontRight);
    globalThis.__result={
      leftLane:Math.abs(bl.x-fl.x)<0.001,
      rightLane:Math.abs(br.x-fr.x)<0.001,
      lanesPreserved:bl.x<br.x&&fl.x<fr.x,
      leftOrder:bl.y<fl.y,
      rightOrder:br.y<fr.y
    };
  `);
  assert.equal(result.leftLane, true);
  assert.equal(result.rightLane, true);
  assert.equal(result.lanesPreserved, true);
  assert.equal(result.leftOrder, true);
  assert.equal(result.rightOrder, true);
});

test('moving guards can pass teammates already settled from the same formation command', () => {
  const result = runGameScenario(`
    const mover=new Resident(80,100),settled=new Resident(100,100);
    for(const guard of [mover,settled]) {guard.isGuard=true;guard.hidden=false;guard.controlMode='manual';guard.formationCommandId=7;}
    mover.manualTarget={x:160,y:100};settled.manualTarget=null;
    G.residents=[mover,settled];G.buildings=[];rebuildResidentSpatialHash();
    const sameCommand=resolveCollisions(mover,102,100);
    settled.formationCommandId=8;rebuildResidentSpatialHash();
    const otherCommand=resolveCollisions(mover,102,100);
    globalThis.__result={
      passesSame:Math.abs(sameCommand.x-102)<0.001&&Math.abs(sameCommand.y-100)<0.001,
      avoidsOther:Math.hypot(otherCommand.x-102,otherCommand.y-100)>0.001
    };
  `);
  assert.equal(result.passesSame, true);
  assert.equal(result.avoidsOther, true);
});

test('navigation requests are limited per tick and stale targets are discarded', () => {
  const result = runGameScenario(`
    const obstacle=new Building('town_hall',3,1),units=[];
    G.buildings=[obstacle];G.resourceNodes=[];G.residents=[];
    for(let index=0;index<8;index++) {
      const unit=new Resident(30,55+index*6);units.push(unit);
      flowMove(unit,320,80,CFG.RESIDENT_SPEED,0.05);
    }
    const queued=G.navigationQueue.length;
    const firstBatch=processNavigationRequests();
    const plannedAfterFirst=units.filter(unit=>unit.navPath).length;
    const stale=units[7];clearNavigation(stale);stale.navTargetX=20;stale.navTargetY=20;
    while(G.navigationQueue.length) processNavigationRequests();
    globalThis.__result={queued,firstBatch,plannedAfterFirst,stalePlanned:!!stale.navPath,pending:units.filter(unit=>unit.navPending).length};
  `);
  assert.equal(result.queued, 8);
  assert.equal(result.firstBatch, 2);
  assert.equal(result.plannedAfterFirst, 2);
  assert.equal(result.stalePlanned, false);
  assert.equal(result.pending, 0);
});

test('large guard selections split into proximity clusters capped at twenty five units', () => {
  const result = runGameScenario(`
    const guards=[];
    for(let index=0;index<60;index++) {
      const guard=new Resident(100+(index%10)*8,100+Math.floor(index/10)*8);guard.isGuard=true;guards.push(guard);
    }
    const clusters=guardMovementClusters(guards);
    globalThis.__result={sizes:clusters.map(cluster=>cluster.length),total:clusters.reduce((sum,cluster)=>sum+cluster.length,0)};
  `);
  assert.equal(result.total, 60);
  assert.equal(result.sizes.join(','), '25,25,10');
});

test('global navigation keeps direct routes straight and prevents diagonal corner cutting', () => {
  const result = runGameScenario(`
    G.buildings=[]; G.resourceNodes=[]; invalidateNavigation();
    const straight=findNavigationPath(30,30,230,230);
    const grid=new Uint8Array(navigationCols()*navigationRows());
    grid[navigationIndex(2,1)]=1; grid[navigationIndex(1,2)]=1;
    G.navigationGrid=grid; G.navigationGridRevision=G.navigationRevision;
    const aroundCorner=findNavigationPath(30,30,50,50);
    globalThis.__result={straightPoints:straight.points.length,cornerPoints:aroundCorner&&aroundCorner.points.length,cornerReached:aroundCorner&&aroundCorner.reachedGoal};
  `);
  assert.equal(result.straightPoints, 1);
  assert.ok(result.cornerPoints >= 2);
  assert.equal(result.cornerReached, true);
});

test('global navigation falls back to the nearest reachable point for a sealed target', () => {
  const result = runGameScenario(`
    G.buildings=[]; G.resourceNodes=[];
    for(let col=4;col<=6;col++) for(let row=4;row<=6;row++) {
      if(col===5&&row===5) continue;
      const wall=new Building('wall',col,row); G.buildings.push(wall);
    }
    invalidateNavigation();
    const path=findNavigationPath(30,30,gridX(5)+20,gridY(5)+20);
    globalThis.__result={exists:!!path,blocked:path&&path.blockedGoal,last:path&&path.points[path.points.length-1]};
  `);
  assert.equal(result.exists, true);
  assert.equal(result.blocked, true);
  assert.ok(result.last.x < 200 || result.last.y < 200 || result.last.x > 240 || result.last.y > 240);
});

test('an enemy chases an attacking guard then drops aggro beyond its leash', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall',30,30);
    const guard=new Resident(120,100); guard.isGuard=true; guard.hidden=false; guard.state='GUARD_MANUAL'; guard.controlMode='manual';
    G.townHall=hall; G.buildings=[hall]; G.residents=[guard]; G.enemies=[]; G.phase='night';
    const enemy=new Enemy(20,100); G.enemies=[enemy];
    enemyAggroGuard(enemy,guard);
    updateEnemies(0.5);
    const chased=enemy.x>20 && enemy.guardTarget===guard;
    guard.x=1000;
    updateEnemies(0.1);
    globalThis.__result={chased,dropped:enemy.guardTarget===null};
  `);
  assert.equal(result.chased, true);
  assert.equal(result.dropped, true);
});

test('enemy facing follows its current building or guard combat target', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall',8,8),wall=new Building('wall',12,8);
    G.townHall=hall;G.buildings=[hall,wall];
    const enemy=new Enemy(300,300),guard=new Resident(220,300);
    guard.isGuard=true;guard.hidden=false;guard.guardHP=10;
    enemy.attacking=wall;
    const buildingFacing=enemyFacingPoint(enemy),wallCenter=wall.center();
    enemyAggroGuard(enemy,guard);
    const guardFacing=enemyFacingPoint(enemy);
    globalThis.__result={
      facesBuilding:buildingFacing.x===wallCenter.x&&buildingFacing.y===wallCenter.y,
      facesGuard:guardFacing.x===guard.x&&guardFacing.y===guard.y,
      stoppedFacingBuilding:enemy.attacking===null
    };
  `);
  assert.equal(result.facesBuilding, true);
  assert.equal(result.facesGuard, true);
  assert.equal(result.stoppedFacingBuilding, true);
});

test('debug reveal removes fog across the whole map until restart state is cleared', () => {
  const result = runGameScenario(`
    G.fogVisible=new Uint8Array(CFG.WORLD_COLS*CFG.WORLD_ROWS);
    G.debugRevealAllFog=true;
    refreshFogVisibility();
    globalThis.__result={first:G.fogVisible[0],last:G.fogVisible[G.fogVisible.length-1]};
  `);
  assert.equal(result.first, 1);
  assert.equal(result.last, 1);
});

test('debug navigation toggle updates state and command markers fade independently', () => {
  const result = runGameScenario(`
    G.debugShowNavigation=false;G.commandMarkers=[];
    const enabled=toggleDebugNavigation();
    for(let index=0;index<14;index++) addGuardCommandMarker(index,index,index%2?'attack':'move');
    const capped=G.commandMarkers.length;
    updateCommandMarkers(0.5);const midway=G.commandMarkers.length;
    updateCommandMarkers(0.5);
    globalThis.__result={enabled,state:G.debugShowNavigation,capped,midway,expired:G.commandMarkers.length};
  `);
  assert.equal(result.enabled, true);
  assert.equal(result.state, true);
  assert.equal(result.capped, 12);
  assert.equal(result.midway, 12);
  assert.equal(result.expired, 0);
});

test('navigation debug display is enabled by default', () => {
  const result = runGameScenario(`
    globalThis.__result={enabled:G.debugShowNavigation};
  `);
  assert.equal(result.enabled, true);
});

test('navigation debug points show the remaining route and keep idle units visible', () => {
  const result = runGameScenario(`
    const moving=new Resident(20,20);G.tick=12;
    moving.navPath=[{x:40,y:20},{x:80,y:40},{x:120,y:60}];moving.navPathIndex=1;
    moving.navDebugTarget={x:140,y:80};moving.navDebugTick=12;
    const active=navigationDebugPoints(moving);
    const idle=new Resident(50,50);idle.navDebugTarget={x:50,y:50};idle.navDebugTick=1;
    globalThis.__result={active:active.map(point=>[point.x,point.y]),idle:navigationDebugPoints(idle).length};
  `);
  assert.equal(result.active.length, 3);
  assert.equal(result.active[0].join(','), '80,40');
  assert.equal(result.active[2].join(','), '140,80');
  assert.equal(result.idle, 1);
});

test('manual guard navigation target stays at the issued position after arrival', () => {
  const result = runGameScenario(`
    const guard=new Resident(80,20);guard.isGuard=true;guard.hidden=false;guard.controlMode='manual';guard.state='GUARD_MANUAL';
    guard.targetX=900;guard.targetY=700;guard.manualTarget={x:80,y:20};G.tick=24;
    updateManualGuard(guard,0.1);
    const debugTarget=navigationDebugPoints(guard).at(-1);
    globalThis.__result={
      commandFinished:guard.manualTarget===null,
      target:[guard.targetX,guard.targetY],
      debugTarget:[debugTarget.x,debugTarget.y]
    };
  `);
  assert.equal(result.commandFinished, true);
  assert.equal(result.target.join(','), '80,20');
  assert.equal(result.debugTarget.join(','), '80,20');
});

test('manual guard blocked destination settles on the nearest reachable point', () => {
  const result = runGameScenario(`
    const guard=new Resident(60,40);guard.isGuard=true;guard.hidden=false;guard.controlMode='manual';guard.state='GUARD_MANUAL';
    guard.targetX=600;guard.targetY=400;guard.manualTarget={x:100,y:40};
    guard.navBlockedGoal=true;guard.navResolvedPoint={x:60,y:40};G.tick=30;
    updateManualGuard(guard,0.1);
    const debugTarget=navigationDebugPoints(guard).at(-1);
    globalThis.__result={
      commandFinished:guard.manualTarget===null,
      target:[guard.targetX,guard.targetY],
      debugTarget:[debugTarget.x,debugTarget.y]
    };
  `);
  assert.equal(result.commandFinished, true);
  assert.equal(result.target.join(','), '60,40');
  assert.equal(result.debugTarget.join(','), '60,40');
});

test('idle residents patrol toward a stable visible target reported by navigation debug', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall',8,8),center=hall.center();
    const resident=new Resident(center.x,center.y);resident.state='IDLE';
    G.townHall=hall;G.buildings=[hall];G.residents=[resident];G.resourceNodes=[];G.phase='day';
    updateResidents(0.1);
    const first={...resident.patrolTarget},afterFirst={x:resident.x,y:resident.y};
    const debugTarget=navigationDebugPoints(resident).at(-1);
    updateResidents(0.1);
    globalThis.__result={
      hasTarget:!!first,stable:resident.patrolTarget.x===first.x&&resident.patrolTarget.y===first.y,
      moved:Math.hypot(resident.x-center.x,resident.y-center.y)>Math.hypot(afterFirst.x-center.x,afterFirst.y-center.y),
      debugMatches:debugTarget.x===first.x&&debugTarget.y===first.y,
      visible:isStaticPatrolVisible(first.x,first.y)
    };
  `);
  assert.equal(result.hasTarget, true);
  assert.equal(result.stable, true);
  assert.equal(result.moved, true);
  assert.equal(result.debugMatches, true);
  assert.equal(result.visible, true);
});

test('resident patrol destinations stay outside every building footprint', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall',8,8),center=hall.center();
    const farm=new Building('farm',14,8);
    G.townHall=hall;G.buildings=[hall,farm];
    const resident=new Resident(center.x,center.y);
    const values=[0,0,0,1],originalRandom=Math.random;
    Math.random=()=>values.length?values.shift():1;
    const target=choosePatrolTarget(resident);
    Math.random=originalRandom;
    globalThis.__result={
      hasTarget:!!target,
      targetClear:target?isPatrolPointClear(target.x,target.y):false,
      hallCenterClear:isPatrolPointClear(center.x,center.y),
      farmCenterClear:isPatrolPointClear(farm.center().x,farm.center().y)
    };
  `);
  assert.equal(result.hasTarget, true);
  assert.equal(result.targetClear, true);
  assert.equal(result.hallCenterClear, false);
  assert.equal(result.farmCenterClear, false);
});

test('automatic guards use a stable patrol target when no enemy is available', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall',8,8),center=hall.center();
    const guard=new Resident(center.x+30,center.y);guard.isGuard=true;guard.hidden=false;guard.state='GUARD_FIGHTING';
    G.townHall=hall;G.buildings=[hall];G.residents=[guard];G.enemies=[];G.phase='night';
    guardUpdateAI(guard,0.1);
    const first={...guard.patrolTarget},debugTarget=navigationDebugPoints(guard).at(-1);
    guardUpdateAI(guard,0.1);
    globalThis.__result={hasTarget:!!first,stable:guard.patrolTarget.x===first.x&&guard.patrolTarget.y===first.y,debugMatches:debugTarget.x===first.x&&debugTarget.y===first.y};
  `);
  assert.equal(result.hasTarget, true);
  assert.equal(result.stable, true);
  assert.equal(result.debugMatches, true);
});

test('navigation debug shows workers by day and guards with enemies by night', () => {
  const result = runGameScenario(`
    const worker=new Resident(20,20),guard=new Resident(30,30);guard.isGuard=true;
    const enemy=new Enemy(40,40);G.residents=[worker,guard];G.enemies=[enemy];
    G.phase='day';const day=navigationDebugUnits();
    G.phase='night';const night=navigationDebugUnits();
    globalThis.__result={dayWorkers:day.includes(worker),dayGuards:day.includes(guard),dayEnemies:day.includes(enemy),nightWorkers:night.includes(worker),nightGuards:night.includes(guard),nightEnemies:night.includes(enemy)};
  `);
  assert.equal(result.dayWorkers, true);
  assert.equal(result.dayGuards, false);
  assert.equal(result.dayEnemies, false);
  assert.equal(result.nightWorkers, false);
  assert.equal(result.nightGuards, true);
  assert.equal(result.nightEnemies, true);
});

test('wild trees regrow as slow random saplings only below their configured range', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall',74,74);
    G.townHall=hall; G.buildings=[hall]; G.resourceNodes=[];
    CFG.TREE_WILD_MIN_COUNT=1; CFG.TREE_WILD_MAX_COUNT=1;
    CFG.WILD_TREE_SPAWN_INTERVAL_MIN=0; CFG.WILD_TREE_SPAWN_INTERVAL_MAX=0;
    CFG.WILD_TREE_GROW_TIME_MIN=5; CFG.WILD_TREE_GROW_TIME_MAX=5;
    G.wildTreeTarget=null; G.wildTreeSpawnTimer=0;
    updateWildTreeRegrowth(0);
    const first=G.resourceNodes[0];
    updateWildTreeRegrowth(30);
    globalThis.__result={
      count:G.resourceNodes.length,
      type:first.type,
      owner:first.ownerForester,
      growTimer:first.growTimer,
      target:G.wildTreeTarget,
    };
  `);
  assert.equal(result.count, 1);
  assert.equal(result.type, 'sapling');
  assert.equal(result.owner, null);
  assert.equal(result.growTimer, 5);
  assert.equal(result.target, null);
});

test('an engineer patrols instead of reserving a blueprint with no materials', () => {
  const result = runGameScenario(`
    const farm=new Building('farm',20,20);
    farm.blueprint=true; farm.constructCost={wood:5}; farm.constructDelivered={wood:0};
    const engineer=new Resident(0,0); engineer.isEngineer=true;
    G.buildings=[farm]; G.residents=[engineer];
    G.resources={food:0,wood:0,stone:0,iron:0,ingot:0}; G.phase='day';
    updateResidents(0.1);
    globalThis.__result={state:engineer.state,target:engineer.buildTarget,assigned:farm.assignedEngineer};
  `);
  assert.equal(result.state, 'PATROL');
  assert.equal(result.target, null);
  assert.equal(result.assigned, null);
});

test('engineer reduction keeps active construction staffed and another engineer can join it', () => {
  const result = runGameScenario(`
    const farm=new Building('farm',20,20); farm.blueprint=false; farm.constructionTimer=3;
    const builder=new Resident(farm.center().x,farm.center().y); builder.isEngineer=true; builder.state='CONSTRUCTING'; builder.buildTarget=farm;
    const idle=new Resident(0,0); idle.isEngineer=true; idle.state='PATROL';
    G.buildings=[farm]; G.residents=[builder,idle]; G.phase='day';
    unassignEngineer();
    const afterReduction={builderStillEngineer:builder.isEngineer,builderTarget:builder.buildTarget===farm,idleEngineer:idle.isEngineer};
    idle.isEngineer=true; idle.state='IDLE'; idle.buildTarget=null;
    updateResidents(0.01);
    globalThis.__result={...afterReduction,joined:idle.buildTarget===farm,state:idle.state,assigned:assignedEngineerCount(farm)};
  `);
  assert.equal(result.builderStillEngineer, true);
  assert.equal(result.builderTarget, true);
  assert.equal(result.idleEngineer, false);
  assert.equal(result.joined, true);
  assert.equal(result.state, 'CONSTRUCTING');
  assert.equal(result.assigned,2);
});

test('engineers reserve blueprint materials so concurrent gathering never exceeds the cost', () => {
  const result=runGameScenario(`
    const hall=new Building('town_hall',10,10),farm=new Building('farm',20,20),center=hall.center();
    farm.blueprint=true;farm.constructCost={wood:8};farm.constructDelivered={wood:0};
    hall.stored.wood=20;G.townHall=hall;G.buildings=[hall,farm];G.resources={food:0,wood:20,stone:0,iron:0,ingot:0};G.phase='day';
    const first=new Resident(center.x,center.y),second=new Resident(center.x,center.y),third=new Resident(center.x,center.y);
    for(const engineer of [first,second,third]) { engineer.isEngineer=true;engineer.state='GATHERING';engineer.buildTarget=farm; }
    G.residents=[first,second,third];updateResidents(0.01);
    globalThis.__result={amounts:[first.carrying?.amount||0,second.carrying?.amount||0,third.carrying?.amount||0],withdrawn:20-hall.stored.wood,remaining:neededMaterials(farm)};
  `);
  assert.equal(result.amounts[0],5);
  assert.equal(result.amounts[1],3);
  assert.equal(result.amounts[2],0);
  assert.equal(result.withdrawn,8);
  assert.equal(result.remaining,null);
});

test('construction speed scales linearly with engineers present at the building', () => {
  const result=runGameScenario(`
    const farm=new Building('farm',20,20),center=farm.center();farm.blueprint=false;farm.constructionTimer=10;
    const engineers=[];
    for(let i=0;i<3;i++) { const engineer=new Resident(center.x+i,center.y);engineer.isEngineer=true;engineer.state='CONSTRUCTING';engineer.buildTarget=farm;engineers.push(engineer); }
    G.buildings=[farm];G.residents=engineers;updateBuildings(1);
    globalThis.__result={remaining:farm.constructionTimer};
  `);
  assert.equal(result.remaining,7);
});

test('engineer task assignment staffs every construction before adding helpers', () => {
  const result=runGameScenario(`
    const firstBuild=new Building('farm',20,20),secondBuild=new Building('farm',30,20);
    firstBuild.blueprint=false;firstBuild.constructionTimer=10;secondBuild.blueprint=false;secondBuild.constructionTimer=10;
    const engineers=[new Resident(0,0),new Resident(1,0),new Resident(2,0)];
    for(const engineer of engineers) engineer.isEngineer=true;
    G.buildings=[firstBuild,secondBuild];G.residents=engineers;G.phase='day';updateResidents(0.01);
    globalThis.__result={first:assignedEngineerCount(firstBuild),second:assignedEngineerCount(secondBuild),states:engineers.map(engineer=>engineer.state)};
  `);
  assert.equal(result.first+result.second,3);
  assert.equal(Math.min(result.first,result.second),1);
  for(const state of result.states) assert.equal(state,'CONSTRUCTING');
});

test('a destroyed building remains as a non-colliding occupied ruin with salvage and rebuild costs', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall',10,10);
    const farm=new Building('farm',20,20);
    G.townHall=hall; G.buildings=[hall,farm]; G.residents=[]; G.resourceNodes=[];
    farm.hp=0;
    updateBuildings(0);
    globalThis.__result={
      ruin:farm.ruin,
      remains:G.buildings.includes(farm),
      occupied:isCellBlocked(farm.col,farm.row),
      blocksMovement:buildingBlocksMovement(farm),
      salvage:ruinSalvage(farm).wood,
      rebuild:ruinRebuildCost(farm).wood,
    };
  `);
  assert.equal(result.ruin, true);
  assert.equal(result.remains, true);
  assert.equal(result.occupied, true);
  assert.equal(result.blocksMovement,false);
  assert.equal(result.salvage, 1);
  assert.equal(result.rebuild, 4);
});

test('an engineer repairs a damaged building during the day', () => {
  const result = runGameScenario(`
    const farm=new Building('farm',20,20);
    const engineer=new Resident(farm.center().x,farm.center().y);
    farm.hp=40; farm.assignedEngineer=engineer;
    engineer.isEngineer=true; engineer.buildTarget=farm; engineer.state='REPAIRING';
    G.buildings=[farm]; G.residents=[engineer]; G.phase='day';
    updateResidents(1);
    globalThis.__result={hp:farm.hp,state:engineer.state,rate:CFG.ENGINEER_REPAIR_RATE};
  `);
  assert.equal(result.rate, 12);
  assert.equal(result.hp, 52);
  assert.equal(result.state, 'REPAIRING');
});

test('resource costs render recognizable icon markup instead of resource text labels', () => {
  const result = runGameScenario(`
    globalThis.__result={cost:formatResourceCost({food:5,wood:10,stone:3})};
  `);
  assert.match(result.cost, /resource-mark food/);
  assert.match(result.cost, /resource-mark wood/);
  assert.match(result.cost, /resource-mark stone/);
  assert.doesNotMatch(result.cost.replace(/<[^>]*>/g,''), /食物|木材|石材/);
});

test('fruit planting command shows its configured wood cost with the resource icon', () => {
  const result=runGameScenario(`
    const costElement={innerHTML:''},button={title:''};
    document.getElementById=id=>id==='fruit-command-cost'?costElement:id==='fruit-btn'?button:elementStub();
    CFG.FRUIT_TREE_WOOD_COST=7;
    updateFruitPlantCommandCost();
    globalThis.__result={markup:costElement.innerHTML,title:button.title};
  `);
  assert.match(result.markup, />7<span class="resource-mark wood"/);
  assert.match(result.title, /7 木材/);
});

test('restoration tower has a building catalogue button', () => {
  assert.match(html, /data-type="restoration_tower"/);
});

test('fruit saplings consume wood and mature into harvestable fruit trees', () => {
  const result=runGameScenario(`
    const hall=new Building('town_hall',8,8),center=hall.center();G.townHall=hall;G.buildings=[hall];
    hall.stored.wood=10;hall.stored.food=0;updateAllResourceTotals();
    G.fogVisible=new Uint8Array(CFG.WORLD_COLS*CFG.WORLD_ROWS);G.fogVisible.fill(1);
    const previewAllowed=canPlantFruitTree(10,10);
    const planted=plantFruitTree(10,10),node=G.resourceNodes.at(-1),woodAfterPlacement=G.resources.wood,placedAsTask=node.type==='fruit_planting',occupiedRejected=!canPlantFruitTree(10,10);
    const worker=new Resident(center.x,center.y);G.residents=[worker];G.phase='day';
    updateResidents(0.1);const claimed=worker.state==='GOING_TO_PLANT_MATERIAL'&&worker.plantTarget===node;
    updateResidents(0.1);const woodAfterPickup=G.resources.wood,pickedUp=worker.state==='DELIVERING_PLANT_MATERIAL';
    worker.x=node.x;worker.y=node.y;updateResidents(0.1);updateResidents(0.1);updateResidents(CFG.FRUIT_TREE_PLANT_TIME);
    const plantedByWorker=node.type==='fruit_sapling';
    node.growTimer=0.01;updateBuildings(0.02);
    globalThis.__result={previewAllowed,planted,placedAsTask,claimed,pickedUp,plantedByWorker,occupiedRejected,woodAfterPlacement,woodAfterPickup,type:node.type,harvestable:canResidentHandHarvest(node),blocksMovement:isResourceObstacleNode(node)};
  `);
  assert.equal(result.previewAllowed,true);
  assert.equal(result.planted,true);
  assert.equal(result.placedAsTask,true);
  assert.equal(result.claimed,true);
  assert.equal(result.pickedUp,true);
  assert.equal(result.plantedByWorker,true);
  assert.equal(result.occupiedRejected,true);
  assert.equal(result.woodAfterPlacement,10);
  assert.equal(result.woodAfterPickup,8);
  assert.equal(result.type,'fruit_tree');
  assert.equal(result.harvestable,true);
  assert.equal(result.blocksMovement,false);
});

test('fruit planting tasks can be placed without wood and wait without over-reserving', () => {
  const result=runGameScenario(`
    const hall=new Building('town_hall',8,8);G.townHall=hall;G.buildings=[hall];hall.stored.wood=0;updateAllResourceTotals();
    G.fogVisible=new Uint8Array(CFG.WORLD_COLS*CFG.WORLD_ROWS);G.fogVisible.fill(1);G.phase='day';
    const previewWithoutWood=canPlantFruitTree(10,10),firstPlaced=plantFruitTree(10,10),secondPlaced=plantFruitTree(11,10);
    const first=G.resourceNodes[0],second=G.resourceNodes[1],workerA=new Resident(0,0),workerB=new Resident(0,0);G.residents=[workerA,workerB];
    updateResidents(0.1);const noneClaimed=!first.claimedBy&&!second.claimedBy;
    hall.stored.wood=CFG.FRUIT_TREE_WOOD_COST;updateAllResourceTotals();workerA.state='IDLE';workerB.state='IDLE';updateResidents(0.1);
    globalThis.__result={previewWithoutWood,firstPlaced,secondPlaced,noneClaimed,claimed:[first,second].filter(node=>!!node.claimedBy).length,wood:G.resources.wood};
  `);
  assert.equal(result.previewWithoutWood,true);
  assert.equal(result.firstPlaced,true);
  assert.equal(result.secondPlaced,true);
  assert.equal(result.noneClaimed,true);
  assert.equal(result.claimed,1);
  assert.equal(result.wood,2);
});

test('fruit planting progress persists when another idle villager takes over', () => {
  const result=runGameScenario(`
    const node={type:'fruit_planting',col:12,row:12,x:500,y:500,hp:1,alive:true,marked:false,claimedBy:null,plantProgress:0,requiredWood:2,deliveredWood:2,ownerForester:null};
    const first=new Resident(500,500);first.state='PLANTING';first.plantTarget=node;node.claimedBy=first;
    G.resourceNodes=[node];G.residents=[first];G.phase='day';G.fogVisible=new Uint8Array(CFG.WORLD_COLS*CFG.WORLD_ROWS);G.fogVisible.fill(1);
    updateResidents(0.75);const saved=node.plantProgress;releaseFruitPlanting(first);first.state='GOING_HOME';
    const second=new Resident(500,500);G.residents.push(second);updateResidents(0.1);updateResidents(0.1);updateResidents(CFG.FRUIT_TREE_PLANT_TIME-saved);
    globalThis.__result={saved,type:node.type,secondFinished:second.plantTarget===null};
  `);
  assert.equal(result.saved,0.75);
  assert.equal(result.type,'fruit_sapling');
  assert.equal(result.secondFinished,true);
});

test('a chopped fruit tree queues food after its wood delivery', () => {
  const result=runGameScenario(`
    const hall=new Building('town_hall',8,8),center=hall.center();G.townHall=hall;G.buildings=[hall];
    hall.stored.wood=0;hall.stored.food=0;updateAllResourceTotals();
    G.fogVisible=new Uint8Array(CFG.WORLD_COLS*CFG.WORLD_ROWS);G.fogVisible.fill(1);G.phase='day';
    const worker=new Resident(center.x+10,center.y),node={type:'fruit_tree',col:10,row:10,x:center.x+10,y:center.y,alive:true,marked:true};
    worker.state='CHOPPING';worker.chopTarget=node;worker.chopTimer=10;G.residents=[worker];G.resourceNodes=[node];
    const originalRandom=Math.random;Math.random=()=>0;updateResidents(0.1);Math.random=originalRandom;
    const queued=worker.carryQueue[0];
    globalThis.__result={alive:node.alive,carrying:worker.carrying,queued};
  `);
  assert.equal(result.alive,false);
  assert.equal(result.carrying.type,'wood');
  assert.equal(result.carrying.amount,1);
  assert.equal(result.queued.type,'food');
  assert.equal(result.queued.amount,1);
});

test('an idle villager claims a marked animal and turns it into food', () => {
  const result=runGameScenario(`
    const hall=new Building('town_hall',8,8),center=hall.center();G.townHall=hall;G.buildings=[hall];
    hall.stored.food=0;G.fogVisible=new Uint8Array(CFG.WORLD_COLS*CFG.WORLD_ROWS);G.fogVisible.fill(1);G.phase='day';
    const worker=new Resident(center.x,center.y),animal=new Animal(center.x+8,center.y);animal.marked=true;animal.hp=1;
    G.residents=[worker];G.animals=[animal];updateResidents(0.1);
    const claimed=worker.state==='GOING_TO_HUNT'&&worker.huntTarget===animal;
    updateResidents(0.1);updateResidents(0.1);
    globalThis.__result={claimed,alive:animal.alive,state:worker.state,carrying:worker.carrying};
  `);
  assert.equal(result.claimed,true);
  assert.equal(result.alive,false);
  assert.equal(result.state,'HAULING');
  assert.equal(result.carrying.type,'food');
  assert.ok(result.carrying.amount>=2&&result.carrying.amount<=4);
});

test('hunters do not continue pursuing animals hidden by fog', () => {
  const result=runGameScenario(`
    const worker=new Resident(100,100),animal=new Animal(200,200);animal.marked=true;
    worker.state='GOING_TO_HUNT';worker.huntTarget=animal;G.residents=[worker];G.animals=[animal];G.phase='day';
    G.fogVisible=new Uint8Array(CFG.WORLD_COLS*CFG.WORLD_ROWS);
    updateResidents(0.1);
    globalThis.__result={state:worker.state,target:worker.huntTarget};
  `);
  assert.equal(result.state,'IDLE');
  assert.equal(result.target,null);
});

test('hunted food is dropped on the ground when storage becomes full', () => {
  const result=runGameScenario(`
    const hall=new Building('town_hall',8,8),center=hall.center();G.townHall=hall;G.buildings=[hall];
    hall.stored.food=storageCapacity(hall,'food');updateAllResourceTotals();G.phase='day';
    const hunter=new Resident(center.x+20,center.y);hunter.state='HAULING';hunter.carrying={type:'food',amount:3};hunter.dropCarryingWhenBlocked=true;
    G.residents=[hunter];updateResidents(0.1);
    const item=G.groundItems[0];
    globalThis.__result={state:hunter.state,carrying:hunter.carrying,item:item&&{type:item.type,amount:item.amount,x:item.x,y:item.y}};
  `);
  assert.equal(result.state,'IDLE');
  assert.equal(result.carrying,null);
  assert.equal(result.item.type,'food');
  assert.equal(result.item.amount,3);
});

test('a hunter stores the available portion and drops only the remainder', () => {
  const result=runGameScenario(`
    const hall=new Building('town_hall',8,8),center=hall.center();G.townHall=hall;G.buildings=[hall];
    hall.stored.food=storageCapacity(hall,'food')-1;updateAllResourceTotals();G.phase='day';
    const hunter=new Resident(center.x+12,center.y);hunter.state='HAULING';hunter.carrying={type:'food',amount:4};hunter.dropCarryingWhenBlocked=true;
    G.residents=[hunter];updateResidents(0.1);
    globalThis.__result={stored:storedAmount(hall,'food'),capacity:storageCapacity(hall,'food'),state:hunter.state,carrying:hunter.carrying,dropped:G.groundItems[0]?.amount};
  `);
  assert.equal(result.stored,result.capacity);
  assert.equal(result.state,'IDLE');
  assert.equal(result.carrying,null);
  assert.equal(result.dropped,3);
});

test('an idle villager retrieves dropped food after storage space is available', () => {
  const result=runGameScenario(`
    const hall=new Building('town_hall',8,8),center=hall.center();G.townHall=hall;G.buildings=[hall];hall.stored.food=0;updateAllResourceTotals();
    G.fogVisible=new Uint8Array(CFG.WORLD_COLS*CFG.WORLD_ROWS);G.fogVisible.fill(1);G.phase='day';
    const worker=new Resident(center.x+12,center.y),item={type:'food',amount:3,x:center.x+12,y:center.y,alive:true,claimedBy:null};
    G.residents=[worker];G.groundItems=[item];updateResidents(0.1);const claimed=worker.state==='GOING_TO_PICKUP'&&item.claimedBy===worker;
    updateResidents(0.1);updateResidents(0.1);
    globalThis.__result={claimed,state:worker.state,stored:storedAmount(hall,'food'),items:G.groundItems.length};
  `);
  assert.equal(result.claimed,true);
  assert.equal(result.state,'IDLE');
  assert.equal(result.stored,3);
  assert.equal(result.items,0);
});

test('ground food pickup takes only the currently available storage amount', () => {
  const result=runGameScenario(`
    const hall=new Building('town_hall',8,8),center=hall.center();G.townHall=hall;G.buildings=[hall];
    hall.stored.food=storageCapacity(hall,'food')-1;updateAllResourceTotals();G.phase='day';
    G.fogVisible=new Uint8Array(CFG.WORLD_COLS*CFG.WORLD_ROWS);G.fogVisible.fill(1);
    const worker=new Resident(center.x+12,center.y),item={type:'food',amount:4,x:center.x+12,y:center.y,alive:true,claimedBy:null};
    G.residents=[worker];G.groundItems=[item];updateResidents(0.1);updateResidents(0.1);updateResidents(0.1);
    globalThis.__result={stored:storedAmount(hall,'food'),capacity:storageCapacity(hall,'food'),remaining:G.groundItems[0]?.amount||0,state:worker.state};
  `);
  assert.equal(result.stored,result.capacity);
  assert.equal(result.remaining,3);
  assert.equal(result.state,'IDLE');
});

test('animals stay upright and only flip horizontally from actual movement', () => {
  const result=runGameScenario(`
    const animal=new Animal(100,100);animal.facingRight=false;
    updateAnimalFacing(animal,3);const right=animal.facingRight;
    updateAnimalFacing(animal,0);const verticalKeepsRight=animal.facingRight;
    updateAnimalFacing(animal,-2);const left=animal.facingRight;
    globalThis.__result={right,verticalKeepsRight,left};
  `);
  assert.equal(result.right,true);
  assert.equal(result.verticalKeepsRight,true);
  assert.equal(result.left,false);
});

test('infinite resources fill the town hall actual storage for every resource', () => {
  const result=runGameScenario(`
    const hall=new Building('town_hall',8,8);G.townHall=hall;G.buildings=[hall];
    for(const type of RESOURCE_TYPES) hall.stored[type]=0;
    setAllRes();
    globalThis.__result={
      infinite:G.infiniteResources,
      stored:Object.fromEntries(RESOURCE_TYPES.map(type=>[type,storedAmount(hall,type)])),
      totals:{...G.resources},
      stoneStorage:findNearestStorage(hall.center(),'stone',{requireAmount:1})===hall
    };
  `);
  assert.equal(result.infinite,true);
  assert.equal(result.stoneStorage,true);
  for(const type of ['food','wood','stone','iron','charcoal','ingot']) {
    assert.equal(result.stored[type],9999);
    assert.equal(result.totals[type],9999);
  }
});

test('infinite resources refill withdrawn materials in the town hall', () => {
  const result=runGameScenario(`
    const hall=new Building('town_hall',8,8);G.townHall=hall;G.buildings=[hall];setAllRes();
    const withdrawn=withdrawFromStorage(hall,'stone',5),afterWithdraw=storedAmount(hall,'stone');
    refillInfiniteResources();
    globalThis.__result={withdrawn,afterWithdraw,afterRefill:storedAmount(hall,'stone'),total:G.resources.stone,free:storageFreeSpace(hall,'stone')};
  `);
  assert.equal(result.withdrawn,5);
  assert.equal(result.afterWithdraw,9994);
  assert.equal(result.afterRefill,9999);
  assert.equal(result.total,9999);
  assert.equal(result.free,0);
});
