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
      outside:isStaticPatrolVisible(center.x + CFG.TOWN_HALL_VISION * CFG.CELL + 1, center.y)
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
      visibleTrees:trees.filter(node=>distance(node)<=CFG.TOWN_HALL_VISION).length,
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
