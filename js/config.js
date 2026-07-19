window.onerror = function(msg, src, line, col, err) {
  const stack = err ? err.stack : '';
  const panel=document.createElement('div');
  panel.style.cssText='position:fixed;top:0;left:0;right:0;background:#f44;color:#fff;padding:10px;z-index:9999;font-size:12px;';
  panel.append(document.createTextNode(`JS ERROR line ${line}: ${msg}`),document.createElement('br'));
  const details=document.createElement('textarea');
  details.value=stack;details.readOnly=true;
  details.style.cssText='width:100%;height:60px;background:#600;color:#fff;border:none;margin-top:4px;font-size:11px;';
  details.addEventListener('click',()=>details.select());
  panel.appendChild(details);document.body.appendChild(panel);
};
// ============================================================
// CONFIG
// ============================================================
const CFG = {
  CANVAS_W: 1200, CANVAS_H: 800,
  CELL: 40, WORLD_COLS: 150, WORLD_ROWS: 150,
  WORLD_W: 6000, WORLD_H: 6000,
  DAY_DURATION: 162, NIGHT_DURATION: 78, TRANSITION: 8,
  START_FOOD: 50, START_WOOD: 40, START_STONE: 20, START_IRON: 0, START_INGOT: 0,
  START_POP: 4, START_ENGINEERS: 1, MAX_POP_BASE: 4, MAX_GUARD_BASE: 2,
  MEAL_TIME_LUNCH: 12, MEAL_TIME_DINNER: 18,
  ENEMY_ATTACK_RANGE: 30,
  ENEMY_WAVE_BASE_COUNT: 3,
  ENEMY_WAVE_PER_DAY: 2,
  ENEMY_WAVE_MAX: 4,
  ENEMY_WAVE_DAY_STEP: 2,
  ENEMY_WAVE_DURATION: 7,
  ENEMY_WAVE_INTERVAL: 10,
  ENEMY_SPAWN_JITTER: 0.35,
  ENEMY_SPAWN_FOG_DEPTH: 2,
  TOWER_RANGE: 150, TOWER_DAMAGE: 15, TOWER_COOLDOWN: 0.8,
  ARROW_SPEED: 420,
  RESIDENT_SPEED: 60,
  TREE_INITIAL_COUNT: 150,
  STONE_CLUSTER_COUNT: 25,
  IRON_CLUSTER_COUNT: 15,
  TREE_MIN_SPAWN_RADIUS: 4,
  STONE_MIN_SPAWN_RADIUS: 10,
  IRON_MIN_SPAWN_RADIUS: 20,
  START_VISIBLE_TREE_MIN: 5,
  TREE_CLUSTER_AVERAGE: 4,
  TREE_CLUSTER_MAX: 10,
  TREE_WILD_MIN_COUNT: 120,
  TREE_WILD_MAX_COUNT: 180,
  WILD_TREE_SPAWN_INTERVAL_MIN: 12,
  WILD_TREE_SPAWN_INTERVAL_MAX: 28,
  WILD_TREE_GROW_TIME_MIN: 40,
  WILD_TREE_GROW_TIME_MAX: 80,
  STONE_CLUSTER_AVERAGE: 1.5,
  STONE_CLUSTER_MAX: 6,
  IRON_CLUSTER_AVERAGE: 1,
  IRON_CLUSTER_MAX: 4,
  IRON_RARE_CLUSTER_CHANCE: 0.04,
  NAV_CELL: 20,
  NAV_REQUESTS_PER_TICK: 2,
  NAV_EXPANSION_LIMIT: 4000,
  NAV_RECHECK_INTERVAL: 0.25,
  NAV_STUCK_WINDOW: 2,
  NAV_STUCK_MIN_DISTANCE: 10,
  SPATIAL_CELL_SIZE: 96,
  FOG_UPDATE_INTERVAL: 0.2,
  GUARD_MAX_HP: 80,
  GUARD_DAMAGE: 12,
  GUARD_SPEED: 60,
  GUARD_ATTACK_COOLDOWN: 0.6,
  ENEMY_GUARD_LEASH: 180,
  ENGINEER_REPAIR_RATE: 12,
  FRUIT_TREE_WOOD_COST: 2,
  FRUIT_TREE_PLANT_TIME: 2,
  FRUIT_TREE_GROW_TIME_MIN: 20,
  FRUIT_TREE_GROW_TIME_MAX: 35,
  FRUIT_TREE_FOOD_MIN: 1,
  FRUIT_TREE_FOOD_MAX: 3,
  ANIMAL_INITIAL_COUNT: 14,
  ANIMAL_MAX_COUNT: 20,
  ANIMAL_RESPAWN_INTERVAL: 35,
  ANIMAL_FOOD_MIN: 2,
  ANIMAL_FOOD_MAX: 4,
  ANIMAL_SPEED: 42,
  ANIMAL_HP: 3,
};

// ============================================================
// BUILDING DEFINITIONS
// ============================================================
const BLD_DEFS = {
  floor:       { name:'地板', icon:'', cat:'facility',  sz:[5,5], cost:{wood:1},        hp:50,  maxWorkers:0, moveSpeedMultiplier:1.5, maxLevel:1, unlock:1 , buildTime:0 },

  house:       { name:'住房', icon:'', cat:'facility',  sz:[2,2], cost:{wood:10,stone:5}, hp:200, maxWorkers:0, popBonus:4, unlock:2 , buildTime:5 },

  nursery:     { name:'产房', icon:'产', cat:'facility', sz:[2,2], cost:{wood:10}, hp:150, maxWorkers:2, recruits:'resident', recruitTime:10, recruitCost:{food:5}, unlock:1, buildTime:2 },

  barracks:    { name:'兵营', icon:'兵', cat:'facility', sz:[2,2], cost:{wood:10,stone:5}, hp:200, maxWorkers:0, guardBonus:4, unlock:2, buildTime:5 },

  training_ground:{ name:'练兵房', icon:'练', cat:'facility', sz:[2,2], cost:{wood:15,stone:10}, hp:160, maxWorkers:0, recruits:'guard', recruitTime:15, recruitCost:{food:20}, unlock:2, buildTime:5 },

  farm:        { name:'农场', icon:'农', cat:'production',sz:[2,2], cost:{wood:5},          hp:100, maxWorkers:2, produces:'food',  baseTime:8, batchSize:5, levelSpeedBonus:0.2, levelBufferBonus:2, unlock:1 , buildTime:2 },

  forester:    { name:'护林员小屋',icon:'林', cat:'production',sz:[2,2], cost:{wood:15,stone:10},hp:150, maxWorkers:3, produces:'wood', baseTime:10, batchSize:5, levelSpeedBonus:0.2, levelBufferBonus:2, chopTime:3, saplingGrowTime:5, growJitter:0.2, unlock:2, buildTime:5, foresterRadius:4 },

  quarry:      { name:'采石场',icon:'石', cat:'production',sz:[2,2], cost:{wood:10,stone:5}, hp:120, maxWorkers:3, produces:'stone', sourceType:'stone', sourceRadius:3, baseTime:10, batchSize:5, levelSpeedBonus:0.2, levelBufferBonus:2, unlock:3 , buildTime:8 },

  iron_mine:   { name:'铁矿', icon:'矿', cat:'production',sz:[2,2], cost:{wood:15,stone:10},hp:150, maxWorkers:4, produces:'iron', sourceType:'iron', sourceRadius:3, baseTime:12, batchSize:5, levelSpeedBonus:0.2, levelBufferBonus:2, unlock:4 , buildTime:11 },

  charcoal_kiln:{ name:'炭窑',icon:'炭', cat:'production',sz:[2,2], cost:{wood:15,stone:15},hp:120, maxWorkers:2, inputs:{wood:2}, produces:'charcoal', baseTime:8, batchSize:5, levelSpeedBonus:0.2, levelBufferBonus:2, unlock:6, buildTime:10 },

  smelter:     { name:'炼铁机',icon:'炉', cat:'production',sz:[2,2], cost:{wood:20,stone:15},hp:120, maxWorkers:2, inputs:{iron:1,charcoal:1}, produces:'ingot', baseTime:8, batchSize:5, levelSpeedBonus:0.2, levelBufferBonus:2, unlock:7 , buildTime:11 },

  food_storage:{ name:'食物仓库',icon:'食', cat:'storage', sz:[2,2], cost:{wood:10,stone:5}, hp:150, maxWorkers:0, capacity:50, levelCapacityBonus:25, unlock:2 , buildTime:5 },

  wood_storage:{ name:'木材仓库',icon:'木', cat:'storage', sz:[2,2], cost:{wood:10,stone:5}, hp:150, maxWorkers:0, capacity:50, levelCapacityBonus:25, unlock:1, unlockTreesChopped:10, buildTime:5 },

  stone_storage:{name:'石材仓库',icon:'石', cat:'storage', sz:[2,2], cost:{wood:10,stone:5}, hp:150, maxWorkers:0, capacity:50, levelCapacityBonus:25, unlock:3 , buildTime:8 },

  iron_storage:{ name:'铁矿仓库',icon:'铁', cat:'storage', sz:[2,2], cost:{wood:10,stone:10},hp:150, maxWorkers:0, capacity:50, levelCapacityBonus:25, unlock:4 , buildTime:11 },

  charcoal_storage:{name:'木炭仓库',icon:'炭', cat:'storage', sz:[2,2], cost:{wood:10,stone:10},hp:150, maxWorkers:0, capacity:50, levelCapacityBonus:25, unlock:6, buildTime:10 },

  ingot_storage:{name:'铁锭仓库',icon:'锭', cat:'storage', sz:[2,2], cost:{wood:10,stone:10},hp:150, maxWorkers:0, capacity:50, levelCapacityBonus:25, unlock:7 , buildTime:11 },

  arrow_tower: { name:'箭塔', icon:'塔', cat:'defense',   sz:[1,1], cost:{wood:20,stone:10},hp:120, maxWorkers:0, range:150, damage:15, cooldown:0.8, levelDamageBonus:0.25, unlock:1 , buildTime:2, needsManning:1 },

  auto_arrow_tower:{ name:'自动箭塔',icon:'自', cat:'defense', sz:[1,1], cost:{wood:30,stone:20},hp:150, maxWorkers:0, range:160, damage:18, cooldown:0.7, levelRangeBonus:20, unlock:5 , buildTime:14 },

  restoration_tower:{ name:'恢复塔',icon:'复', cat:'defense', sz:[1,1], cost:{wood:20,stone:15},hp:140, maxWorkers:0, repairRange:160, buildingRepairRate:8, unitRepairRate:12, levelRepairBonus:0.2, unlock:4, buildTime:10 },

  town_hall:   { name:'大本营',icon:'', cat:'facility',  sz:[2,2], cost:{},           hp:500, maxWorkers:0, capacity:200, vision:8, range:180, damage:12, cooldown:1, startResources:{food:5,wood:5,stone:0,iron:0,charcoal:0,ingot:0}, storageCaps:{food:200,wood:200,stone:200,iron:200,charcoal:200,ingot:200}, unlock:1 , buildTime:2 },

  lamp:        { name:'灯', icon:'灯', cat:'facility',  sz:[1,1], cost:{wood:5}, hp:50, maxWorkers:0, unlock:1, buildTime:2, vision:5, levelVisionBonus:1 },

  wall:        { name:'城墙', icon:'墙', cat:'defense',   sz:[1,1], cost:{stone:5},         hp:250, maxWorkers:0, levelDamageReduction:0.15, unlock:3 , buildTime:8 },

};

for (const def of Object.values(BLD_DEFS)) if (!Number.isInteger(def.maxLevel) || def.maxLevel<1) def.maxLevel=5;
const RESOURCE_TYPES=['food','wood','stone','iron','charcoal','ingot'];
const DEBUG_INFINITE_RESOURCE_AMOUNT=9999;
const RESOURCE_NAMES={food:'食物',wood:'木材',stone:'石材',iron:'铁矿',charcoal:'木炭',ingot:'铁锭'};
const RESOURCE_STORAGE_TYPES={food:'food_storage',wood:'wood_storage',stone:'stone_storage',iron:'iron_storage',charcoal:'charcoal_storage',ingot:'ingot_storage'};
function resourceIcon(type) { return `<span class="resource-mark ${type}" title="${RESOURCE_NAMES[type]||type}" aria-label="${RESOURCE_NAMES[type]||type}"></span>`; }
function formatResourceCost(cost) {
  return Object.entries(cost||{}).filter(([,amount])=>amount>0).map(([type,amount])=>`<span class="resource-cost" data-resource="${type}" data-amount="${amount}" title="${amount} ${RESOURCE_NAMES[type]||type}">${amount}${resourceIcon(type)}</span>`).join('');
}
function resourceCostIsInsufficient(type,amount,resources=G.resources) { return (resources?.[type]||0)<Number(amount); }
function updateBuildingCostAffordability() {
  for(const cost of document.querySelectorAll('#building-panel .bld-btn .resource-cost')) {
    cost.classList.toggle('insufficient',resourceCostIsInsufficient(cost.dataset.resource,cost.dataset.amount));
  }
}
function parseResourceMapInput(raw) {
  const value={};
  if(!raw.trim()) return {value};
  for(const part of raw.trim().split(/[,;\s]+/)) {
    const [resource,amount,...extra]=part.split(':');
    const key=resource?.trim(),number=Number(amount);
    if(extra.length||!RESOURCE_TYPES.includes(key)) return {error:`未知资源键“${key||part}”`};
    if(Object.prototype.hasOwnProperty.call(value,key)) return {error:`资源“${RESOURCE_NAMES[key]}”重复填写`};
    if(amount===undefined||amount.trim()===''||!Number.isFinite(number)||number<0) return {error:`资源“${RESOURCE_NAMES[key]}”数量无效`};
    value[key]=number;
  }
  return {value};
}
function updateFruitPlantCommandCost() {
  const cost=Math.max(0,CFG.FRUIT_TREE_WOOD_COST||0);
  const costElement=document.getElementById('fruit-command-cost');
  if(costElement) costElement.innerHTML=formatResourceCost({wood:cost});
  const button=document.getElementById('fruit-btn');
  if(button) button.title=`种植果树，需要 ${cost} 木材`;
}
function cloneResourceMap(value) { return {...(value||{})}; }
function buildingUnlockStatus(def, townHallLevel=1) {
  const unlockLevel=Math.max(1,Math.floor(Number(def?.unlock)||1));
  const treeNeed=Math.max(0,Math.floor(Number(def?.unlockTreesChopped)||0));
  const treesChopped=Math.min(treeNeed,Math.max(0,G.treesChopped||0));
  const levelMet=townHallLevel>=unlockLevel;
  const extraMet=treesChopped>=treeNeed;
  let text='';
  if(!levelMet) text=`需要${unlockLevel}级大本营${treeNeed>0?'与？':''}`;
  else if(!extraMet) text=`砍伐树木 ${treesChopped}/${treeNeed}`;
  return {visible:unlockLevel<=townHallLevel+1,unlocked:levelMet&&extraMet,text};
}
function buildingPanelSectionKey(type,townHallLevel=1) {
  const def=BLD_DEFS[type];
  if(!def) return '';
  const unlockLevel=Math.max(1,Math.floor(Number(def.unlock)||1));
  return unlockLevel===townHallLevel+1?'next-tier':(def.cat||'facility');
}
function buildingLevelOverrides(type, level) { return BLD_DEFS[type]?.levels?.[level]||{}; }
function defaultBuildingLevelValue(type, level, key) {
  const def=BLD_DEFS[type];
  if (!def) return undefined;
  const base=def[key];
  if (level<=1) return base;
  if (key==='hp') return Math.floor(def.hp*Math.pow(1.3,level-1));
  if (key==='capacity' && def.capacity) return def.capacity+(level-1)*(def.levelCapacityBonus||0);
  if (key==='damage' && type==='arrow_tower') return def.damage*(1+(level-1)*(def.levelDamageBonus||0));
  if (key==='range' && type==='auto_arrow_tower') return def.range+(level-1)*(def.levelRangeBonus||0);
  if (key==='vision' && type==='lamp') return def.vision+(level-1)*(def.levelVisionBonus||0);
  if (key==='popBonus' && type==='house') return def.popBonus+(level-1)*2;
  if (key==='guardBonus' && type==='barracks') return def.guardBonus+(level-1)*2;
  return base;
}
function buildingLevelValue(type, level, key) {
  const override=buildingLevelOverrides(type,level);
  const value=Object.prototype.hasOwnProperty.call(override,key) ? override[key] : defaultBuildingLevelValue(type,level,key);
  return (value && typeof value==='object' && !Array.isArray(value)) ? cloneResourceMap(value) : value;
}
function buildingRuntimeDef(b) {
  const def=BLD_DEFS[b.type];
  const runtime={...def,...buildingLevelOverrides(b.type,b.level)};
  for (const key of ['hp','maxWorkers','baseTime','capacity','range','damage','cooldown','vision','foresterRadius','sourceRadius','repairRange','buildingRepairRate','unitRepairRate','levelRepairBonus','popBonus','guardBonus','recruitTime','buildTime','startResources','storageCaps','batchSize','levelSpeedBonus','levelBufferBonus','levelCapacityBonus','levelDamageBonus','levelRangeBonus','levelVisionBonus','levelDamageReduction','chopTime','saplingGrowTime','growJitter']) runtime[key]=buildingLevelValue(b.type,b.level,key);
  return runtime;
}
function townHallResourceCapacity(type, level=1) { return buildingLevelValue('town_hall',level,'storageCaps')?.[type]||0; }
function isResourceAvailable(type) {
  return G.infiniteResources || !G.townHall || townHallResourceCapacity(type,G.townHall.level)>0;
}
function townHallStartingResources() {
  const resources=cloneResourceMap(buildingLevelValue('town_hall',1,'startResources'));
  for(const type of RESOURCE_TYPES) if (townHallResourceCapacity(type,1)<=0) resources[type]=0;
  return resources;
}
function floorMovementMultiplier() { return Math.max(0,buildingLevelValue('floor',1,'moveSpeedMultiplier')||1); }
function defaultUpgradeCost(type, nextLevel) {
  if (type==='town_hall') return ({2:{wood:20},3:{wood:50},4:{wood:200,stone:50}})[nextLevel]||{wood:500,stone:200};
  return {wood:10*(nextLevel-1),stone:5*(nextLevel-1)};
}
function upgradeCostForLevel(type, nextLevel) {
  const override=buildingLevelOverrides(type,nextLevel).upgradeCost;
  return cloneResourceMap(override||defaultUpgradeCost(type,nextLevel));
}

const ENEMY_DEFS = {
  normal:  { name:'普通敌人', hp:40,  speed:50, damage:8,  size:10, unlockDay:1, spawnWeight:1,    color:'#ff6633' },
  fast:    { name:'快速敌人', hp:24,  speed:88, damage:5,  size:7,  unlockDay:3, spawnWeight:0.5,  color:'#c978df' },
  breaker: { name:'破坏者',   hp:110, speed:30, damage:16, size:14, unlockDay:6, spawnWeight:0.28, color:'#a94c38' },
};

const SETTINGS_STORAGE_KEY = 'colony-game-settings-v1';
const SETTINGS_VERSION = 3;
const SAVE_STORAGE_KEY = 'village-game-saves-v1';
const SAVE_VERSION = 1;
const MAX_SAVE_SLOTS = 10;
const SHORTCUT_ACTIONS = [
  { id:'pause', label:'暂停 / 继续', defaultCode:'Space' },
  { id:'speedNormal', label:'正常速度', defaultCode:'Digit1' },
  { id:'speed2', label:'2 倍速度', defaultCode:'Digit2' },
  { id:'speed4', label:'4 倍速度', defaultCode:'Digit3' },
  { id:'cancel', label:'取消当前操作', defaultCode:'Escape' },
  { id:'chop', label:'伐木标记', defaultCode:'KeyC' },
  { id:'unchop', label:'取消伐木标记', defaultCode:'KeyX' },
  { id:'hunt', label:'狩猎标记', defaultCode:'KeyH' },
  { id:'settings', label:'打开游戏设置', defaultCode:'F1' },
  { id:'config', label:'打开数值编辑器', defaultCode:'F2' },
];
const DEFAULT_SHORTCUTS = Object.fromEntries(SHORTCUT_ACTIONS.map(action => [action.id, action.defaultCode]));
const DEFAULT_CAMERA_DRAG_THRESHOLD = 12;
let gameSettings = { version:SETTINGS_VERSION, shortcuts:{...DEFAULT_SHORTCUTS}, cameraDragThreshold:DEFAULT_CAMERA_DRAG_THRESHOLD };
let pendingShortcutAction = null;

function loadGameSettings() {
  let migrated=false;
  try {
    const saved=JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
    if (saved && saved.shortcuts && typeof saved.shortcuts==='object') {
      for (const action of SHORTCUT_ACTIONS) {
        if (typeof saved.shortcuts[action.id]==='string') gameSettings.shortcuts[action.id]=saved.shortcuts[action.id];
      }
      if (saved.shortcuts.speedNormal==='Numpad1') { gameSettings.shortcuts.speedNormal='Digit1'; migrated=true; }
      if (saved.shortcuts.speed2==='Numpad2') { gameSettings.shortcuts.speed2='Digit2'; migrated=true; }
      if (saved.shortcuts.speed4==='Numpad3') { gameSettings.shortcuts.speed4='Digit3'; migrated=true; }
    }
    if (saved && Number.isFinite(Number(saved.cameraDragThreshold))) {
      gameSettings.cameraDragThreshold=clamp(Math.round(Number(saved.cameraDragThreshold)),4,32);
    }
  } catch (error) { console.warn('Game settings could not be loaded.', error); }
  if (migrated) saveGameSettings();
}
function saveGameSettings() {
  try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(gameSettings)); }
  catch (error) { console.warn('Game settings could not be saved.', error); }
}
function cameraDragThreshold() { return gameSettings.cameraDragThreshold||DEFAULT_CAMERA_DRAG_THRESHOLD; }
function cameraDragExceeded(dx,dy) { return Math.hypot(dx,dy)>=cameraDragThreshold(); }
function setCameraDragThreshold(value) {
  gameSettings.cameraDragThreshold=clamp(Math.round(Number(value)||DEFAULT_CAMERA_DRAG_THRESHOLD),4,32);
  const input=document.getElementById('settings-camera-drag');
  const label=document.getElementById('settings-camera-drag-value');
  if (input) input.value=String(gameSettings.cameraDragThreshold);
  if (label) label.textContent=gameSettings.cameraDragThreshold+' px';
  saveGameSettings();
}
function shortcutLabel(code) {
  const labels={Space:'空格',Escape:'Esc',Digit1:'1',Digit2:'2',Digit3:'3',KeyC:'C',KeyX:'X'};
  return labels[code] || code.replace(/^Key/, '').replace(/^Digit/, '');
}
loadGameSettings();

// The development server serves the saved overrides. Direct file opening keeps
// using the defaults above, so the game remains portable.
function applyBalanceData(data) {
  if (!data || typeof data !== 'object') return;
  if (data.globals && typeof data.globals === 'object') {
    for (const [key, value] of Object.entries(data.globals)) {
      if (Object.prototype.hasOwnProperty.call(CFG, key) && Number.isFinite(value)) CFG[key] = value;
    }
  }
  if (data.buildings && typeof data.buildings === 'object') {
    for (const [key, values] of Object.entries(data.buildings)) {
      if (!BLD_DEFS[key] || !values || typeof values !== 'object') continue;
      Object.assign(BLD_DEFS[key], values);
      if (values.cost && typeof values.cost === 'object') BLD_DEFS[key].cost = {...values.cost};
      if (Array.isArray(values.sz)) BLD_DEFS[key].sz = [...values.sz];
      if (values.levels && typeof values.levels==='object') BLD_DEFS[key].levels=JSON.parse(JSON.stringify(values.levels));
    }
  }
  if (data.enemies && typeof data.enemies === 'object') {
    for (const [key, values] of Object.entries(data.enemies)) {
      if (!ENEMY_DEFS[key] || !values || typeof values !== 'object') continue;
      Object.assign(ENEMY_DEFS[key], values);
    }
  }
}
function loadSavedBalance() {
  if (typeof location === 'undefined' || location.protocol === 'file:') return;
  try {
    const request = new XMLHttpRequest();
    request.open('GET', '/api/balance', false);
    request.send();
    if (request.status === 200) applyBalanceData(JSON.parse(request.responseText));
  } catch (error) {
    console.warn('Saved balance could not be loaded; using inline defaults.', error);
  }
}
loadSavedBalance();

// ============================================================
// GAME STATE
// ============================================================
const G = {
  tick: 0, dt: 0, day: 1, dayTime: 0, phase: 'day', totalTime: 0,
  resources: { food:CFG.START_FOOD, wood:CFG.START_WOOD, stone:CFG.START_STONE, iron:CFG.START_IRON, charcoal:0, ingot:CFG.START_INGOT },
  buildings: [], residents: [], enemies: [], animals: [], groundItems: [], particles: [], projectiles: [], commandMarkers: [],
  selectedBldType: null, selectedBuilding: null, selectedGuard: null, selectedGuards: [], hoveredCell: null,
  mouseX: 0, mouseY: 0,
  placingMode: false, movingBuilding: null,
  maxPop: CFG.MAX_POP_BASE, maxGuards: CFG.MAX_GUARD_BASE, popGrowthTimer: 0,
  engineerCount: 0,
  enemySpawnQueue: [], enemySpawnTimer: 0,
  cam: { x:CFG.WORLD_W/2, y:CFG.WORLD_H/2, zoom:1 },
  dragging: false, dragButton:null, dragMoved:false, dragStartX:0, dragStartY:0, dragCamStartX:0, dragCamStartY:0,
  guardSelectStart: null, guardSelectEnd: null, guardSelectMoved: false,
  floorMask: null, drawingFloor: false, lastFloorCell: '',
  resourceNodes: [],
  resourceCellIndex: null,
  treesChopped: 0,
  buildingPanelDirty: true,
  resourceFullNotices: new Set(),
  chopMode: false, unchopMode: false, huntMode:false, unhuntMode:false, fruitPlantMode:false,
  chopStartX: -1, chopStartY: -1, chopEndX: -1, chopEndY: -1,
  infiniteResources: false,
  farmLinks: [],
  resourceCleanupTimer: 0,
  wildTreeTarget: null, wildTreeSpawnTimer: 0,
  navigationRevision: 0,
  obstacleIndexRevision: -1,
  obstacleSpatial: null,
  navigationGridRevision: -1,
  navigationGrid: null,
  navigationQueue: [],
  residentSpatial: null,
  targetedTrees: new Set(),
  targetedAnimals: new Set(),
  animalSpawnTimer: 0,
  fogVisible: null,
  fogUpdateTimer: 0,
  debugRevealAllFog: false,
  debugShowNavigation: true,
  guardMoveCommandSequence: 0,
};
