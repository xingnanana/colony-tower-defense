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

test('a hungry resident leaves a continuous workplace immediately to eat', () => {
  const result = runGameScenario(`
    const farm=new Building('farm', 10, 10);
    const hall=new Building('town_hall', 20, 20); hall.stored.food=2;
    const worker=new Resident(0, 0); worker.workplace=farm; worker.state='WORKING'; worker.hunger=CFG.HUNGER_THRESHOLD;
    G.buildings=[farm,hall]; G.residents=[worker]; G.resources={food:2,wood:0,stone:0,iron:0,ingot:0}; G.phase='day';
    updateResidents(0.01); globalThis.__result=worker.state;
  `);
  assert.equal(result, 'GOING_TO_EAT');
});

test('a hungry resident delivers the current chopped tree before eating', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall', 20, 20); hall.stored.food=2;
    const worker=new Resident(100, 100); worker.state='CHOPPING'; worker.hunger=CFG.HUNGER_THRESHOLD; worker.chopTimer=2.99;
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

test('local navigation chains detours around multiple buildings', () => {
  const result = runGameScenario(`
    const a = new Building('farm', 2, 2), b = new Building('farm', 5, 2);
    const worker = new Resident(30, 140);
    G.buildings = [a, b]; G.resourceNodes = []; G.residents = [worker]; G.floorMask = null;
    for (let i=0; i<260; i++) moveViaFlow(worker, 360, 140, CFG.RESIDENT_SPEED, 0.05);
    globalThis.__result = Math.hypot(360-worker.x, 140-worker.y);
  `);
  assert.ok(result < 8, `remaining distance was ${result}`);
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
    for (let i=0; i<80; i++) G.buildings.push(new Building('farm', i*3, i*3));
    G.resourceNodes = []; G.navigationRevision = 1; G.obstacleIndexRevision = -1;
    ensureObstacleSpatialHash();
    const nearby = G.obstacleSpatial.query(0,0,240,240);
    globalThis.__result = {nearby:nearby.length, total:G.buildings.length};
  `);
  assert.ok(result.nearby > 0);
  assert.ok(result.nearby < result.total / 4, `${result.nearby} of ${result.total} obstacles were returned`);
});

test('fog visibility is provided by town halls and residents', () => {
  const result = runGameScenario(`
    const hall = new Building('town_hall', 30, 30);
    const resident = new Resident(20, 20);
    G.buildings = [hall]; G.residents = [resident]; G.resourceNodes = [];
    initFog(); refreshFogVisibility();
    const center = hall.center();
    globalThis.__result = {
      hall:isWorldVisible(center.x, center.y),
      resident:isWorldVisible(resident.x, resident.y),
      distant:isFogCellVisible(0, 40)
    };
  `);
  assert.equal(result.hall, true);
  assert.equal(result.resident, true);
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

test('coverage metadata exposes lamp, forester, mine, and tower ranges', () => {
  const result = runGameScenario(`
    globalThis.__result = {
      lamp:buildingCoverage('lamp').radius,
      forester:buildingCoverage('forester').radius,
      quarry:buildingCoverage('quarry').radius,
      tower:buildingCoverage('arrow_tower').radius,
      floor:buildingCoverage('floor')
    };
  `);
  assert.equal(result.lamp, 200);
  assert.equal(result.forester, 160);
  assert.equal(result.quarry, 120);
  assert.equal(result.tower, 150);
  assert.equal(result.floor, null);
});

test('idle patrol uses completed building vision instead of its own dynamic vision', () => {
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
  assert.equal(result.selfVisible, true);
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

test('a breaker prioritizes a route-blocking defense while normal enemies take the first blocker', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall', 20, 10);
    const frontFarm=new Building('farm', 4, 10);
    const laterWall=new Building('wall', 9, 10);
    G.townHall=hall; G.buildings=[hall,frontFarm,laterWall];
    const normal=new Enemy(100, 420, 'normal');
    const breaker=new Enemy(100, 420, 'breaker');
    globalThis.__result={normal:enemyRouteBlocker(normal)?.type, breaker:enemyRouteBlocker(breaker)?.type};
  `);
  assert.equal(result.normal, 'farm');
  assert.equal(result.breaker, 'wall');
});

test('town hall starts with one guard and separate worker and guard capacity', () => {
  const result = runGameScenario(`
    initGame();
    globalThis.__result={
      workers:residentCount(false), guards:residentCount(true), workerCap:G.maxPop, guardCap:G.maxGuards,
      guardHome:G.residents.find(r=>r.isGuard).home.type, startPop:CFG.START_POP, startCap:CFG.MAX_POP_BASE
    };
  `);
  assert.equal(result.guards, 1);
  assert.equal(result.guardCap, 2);
  assert.equal(result.workers, result.startPop);
  assert.equal(result.workerCap, result.startCap);
  assert.equal(result.guardHome, 'town_hall');
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
    const worker=new Resident(0,0); const guard=new Resident(0,0); guard.isGuard=true;
    assignHome(worker, house); assignHome(guard, barracks); G.residents.push(worker,guard);
    nursery.recruitQueue=1; training.recruitQueue=1;
    updateBuildings(20);
    globalThis.__result={
      workerHome:worker.home.type, guardHome:guard.home.type, workers:residentCount(false), guards:residentCount(true),
      nurseryQueue:nursery.recruitQueue, trainingQueue:training.recruitQueue, hallCanRecruit:!!BLD_DEFS.town_hall.recruits
    };
  `);
  assert.equal(result.workerHome, 'house');
  assert.equal(result.guardHome, 'barracks');
  assert.equal(result.workers, 2);
  assert.equal(result.guards, 2);
  assert.equal(result.nurseryQueue, 0);
  assert.equal(result.trainingQueue, 0);
  assert.equal(result.hallCanRecruit, false);
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
      lampVision:buildingVisionRadius(lamp)/CFG.CELL,
    };
  `);
  assert.match(result.lampFields, /vision/);
  assert.doesNotMatch(result.lampFields, /maxWorkers/);
  assert.match(result.farmFields, /maxWorkers/);
  assert.match(result.farmFields, /baseTime/);
  assert.match(result.farmFields, /unlock/);
  assert.doesNotMatch(result.storageFields, /maxWorkers/);
  assert.match(result.storageFields, /capacity/);
  assert.match(result.lampFields, /unlock/);
  assert.doesNotMatch(result.townHallFields, /unlock/);
  assert.equal(result.lampVision, 8);
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

test('a destroyed building remains as a blocking ruin with salvage and rebuild costs', () => {
  const result = runGameScenario(`
    const hall=new Building('town_hall',10,10);
    const farm=new Building('farm',20,20);
    G.townHall=hall; G.buildings=[hall,farm]; G.residents=[]; G.resourceNodes=[];
    farm.hp=0;
    updateBuildings(0);
    globalThis.__result={
      ruin:farm.ruin,
      remains:G.buildings.includes(farm),
      blocked:isCellBlocked(farm.col,farm.row),
      salvage:ruinSalvage(farm).wood,
      rebuild:ruinRebuildCost(farm).wood,
    };
  `);
  assert.equal(result.ruin, true);
  assert.equal(result.remains, true);
  assert.equal(result.blocked, true);
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
