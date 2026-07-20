const BLD_COMMON_EDIT_FIELDS = [
  { k:'name', label:'名称', type:'text' },
  { k:'icon', label:'图标', type:'text' },
  { k:'sz', label:'占地面积', type:'sz' },
  { k:'maxLevel', label:'等级上限', type:'num', min:1, step:1 },
  { k:'unlock', label:'解锁所需大本营等级', type:'num', min:1, step:1 },
  { k:'hp', label:'生命', type:'num', min:1, step:1 },
  { k:'buildTime', label:'建造时间', type:'num', min:0, step:0.5, unit:'秒' },
  { k:'cost', label:'建造消耗', type:'resources' },
];
const BLD_TYPE_EDIT_FIELDS = {
  floor: [{ k:'moveSpeedMultiplier', label:'移动速度倍率', type:'num', min:0, step:0.1, unit:'倍' }],
  town_hall: [
    { k:'vision', label:'迷雾驱散范围', type:'num', min:1, step:1, unit:'格' },
    { k:'range', label:'攻击射程', type:'num', min:1, step:1, unit:'像素' },
    { k:'damage', label:'箭矢伤害', type:'num', min:0, step:1 },
    { k:'cooldown', label:'攻击间隔', type:'num', min:0.05, step:0.05, unit:'秒' },
    { k:'popBonus', label:'该级村民上限', type:'num', min:0, step:1, unit:'人' },
    { k:'guardBonus', label:'该级守卫上限', type:'num', min:0, step:1, unit:'人' },
    { k:'startResources', label:'初始拥有资源', type:'resources' },
    { k:'storageCaps', label:'各资源仓储上限', type:'resources' },
  ],
  house: [{ k:'popBonus', label:'村民床位', type:'num', min:0, step:1 }],
  nursery: [
    { k:'maxWorkers', label:'生产所需工人', type:'num', min:2, max:2, step:1 },
    { k:'recruitTime', label:'招募村民时间', type:'num', min:0.5, step:0.5, unit:'秒' },
    { k:'recruitCost', label:'招募消耗', type:'resources' },
  ],
  barracks: [{ k:'guardBonus', label:'守卫床位', type:'num', min:0, step:1 }],
  training_ground: [
    { k:'recruitTime', label:'训练守卫时间', type:'num', min:0.5, step:0.5, unit:'秒' },
    { k:'recruitCost', label:'训练消耗', type:'resources' },
  ],
  farm: [
    { k:'maxWorkers', label:'最大工人', type:'num', min:0, step:1 },
    { k:'baseTime', label:'基础生产时间', type:'num', min:0.5, step:0.5, unit:'秒' },
    { k:'batchSize', label:'搬运批量', type:'num', min:1, step:1, unit:'件' },
    { k:'levelSpeedBonus', label:'每级生产效率', type:'num', min:0, max:2, step:0.05, unit:'倍率' },
    { k:'levelBufferBonus', label:'每级暂存加成', type:'num', min:0, step:1, unit:'件' },
    { k:'produces', label:'产物', type:'resource' },
  ],
  forester: [
    { k:'maxWorkers', label:'最大工人', type:'num', min:0, step:1 },
    { k:'foresterRadius', label:'育林范围', type:'num', min:1, step:1, unit:'格' },
    { k:'batchSize', label:'搬运批量', type:'num', min:1, step:1, unit:'件' },
    { k:'levelSpeedBonus', label:'每级伐木效率', type:'num', min:0, max:2, step:0.05, unit:'倍率' },
    { k:'levelBufferBonus', label:'每级暂存加成', type:'num', min:0, step:1, unit:'件' },
    { k:'saplingGrowTime', label:'树苗成长时间', type:'num', min:0.5, step:0.1, unit:'秒' },
    { k:'growJitter', label:'树苗成长波动', type:'num', min:0, max:0.9, step:0.05, unit:'比例' },
  ],
  quarry: [
    { k:'maxWorkers', label:'最大工人', type:'num', min:0, step:1 },
    { k:'baseTime', label:'基础生产时间', type:'num', min:0.5, step:0.5, unit:'秒' },
    { k:'sourceRadius', label:'矿点搜寻范围', type:'num', min:1, step:1, unit:'格' },
    { k:'batchSize', label:'搬运批量', type:'num', min:1, step:1, unit:'件' },
    { k:'levelSpeedBonus', label:'每级生产效率', type:'num', min:0, max:2, step:0.05, unit:'倍率' },
    { k:'levelBufferBonus', label:'每级暂存加成', type:'num', min:0, step:1, unit:'件' },
  ],
  iron_mine: [
    { k:'maxWorkers', label:'最大工人', type:'num', min:0, step:1 },
    { k:'baseTime', label:'基础生产时间', type:'num', min:0.5, step:0.5, unit:'秒' },
    { k:'sourceRadius', label:'矿点搜寻范围', type:'num', min:1, step:1, unit:'格' },
    { k:'batchSize', label:'搬运批量', type:'num', min:1, step:1, unit:'件' },
    { k:'levelSpeedBonus', label:'每级生产效率', type:'num', min:0, max:2, step:0.05, unit:'倍率' },
    { k:'levelBufferBonus', label:'每级暂存加成', type:'num', min:0, step:1, unit:'件' },
  ],
  charcoal_kiln: [
    { k:'maxWorkers', label:'最大工人', type:'num', min:0, step:1 },
    { k:'baseTime', label:'基础生产时间', type:'num', min:0.5, step:0.5, unit:'秒' },
    { k:'batchSize', label:'搬运批量', type:'num', min:1, step:1, unit:'件' },
    { k:'levelSpeedBonus', label:'每级生产效率', type:'num', min:0, max:2, step:0.05, unit:'倍率' },
    { k:'levelBufferBonus', label:'每级暂存加成', type:'num', min:0, step:1, unit:'件' },
    { k:'inputs', label:'每份产物消耗', type:'resources' },
    { k:'produces', label:'产物', type:'resource' },
  ],
  smelter: [
    { k:'maxWorkers', label:'最大工人', type:'num', min:0, step:1 },
    { k:'baseTime', label:'基础生产时间', type:'num', min:0.5, step:0.5, unit:'秒' },
    { k:'batchSize', label:'搬运批量', type:'num', min:1, step:1, unit:'件' },
    { k:'levelSpeedBonus', label:'每级生产效率', type:'num', min:0, max:2, step:0.05, unit:'倍率' },
    { k:'levelBufferBonus', label:'每级暂存加成', type:'num', min:0, step:1, unit:'件' },
    { k:'inputs', label:'每份产物消耗', type:'resources' },
    { k:'produces', label:'产物', type:'resource' },
  ],
  food_storage: [{ k:'capacity', label:'基础仓储容量', type:'num', min:0, step:1 }, { k:'levelCapacityBonus', label:'每级容量加成', type:'num', min:0, step:1, unit:'件' }],
  wood_storage: [{ k:'capacity', label:'基础仓储容量', type:'num', min:0, step:1 }, { k:'levelCapacityBonus', label:'每级容量加成', type:'num', min:0, step:1, unit:'件' }, { k:'unlockTreesChopped', label:'砍伐树木解锁要求', type:'num', min:0, step:1, unit:'棵' }],
  stone_storage: [{ k:'capacity', label:'基础仓储容量', type:'num', min:0, step:1 }, { k:'levelCapacityBonus', label:'每级容量加成', type:'num', min:0, step:1, unit:'件' }],
  iron_storage: [{ k:'capacity', label:'基础仓储容量', type:'num', min:0, step:1 }, { k:'levelCapacityBonus', label:'每级容量加成', type:'num', min:0, step:1, unit:'件' }],
  charcoal_storage: [{ k:'capacity', label:'基础仓储容量', type:'num', min:0, step:1 }, { k:'levelCapacityBonus', label:'每级容量加成', type:'num', min:0, step:1, unit:'件' }],
  ingot_storage: [{ k:'capacity', label:'基础仓储容量', type:'num', min:0, step:1 }, { k:'levelCapacityBonus', label:'每级容量加成', type:'num', min:0, step:1, unit:'件' }],
  arrow_tower: [
    { k:'range', label:'射程', type:'num', min:1, step:1, unit:'像素' },
    { k:'damage', label:'箭矢伤害', type:'num', min:0, step:1 },
    { k:'cooldown', label:'攻击间隔', type:'num', min:0.05, step:0.05, unit:'秒' },
    { k:'levelDamageBonus', label:'每级伤害加成', type:'num', min:0, max:2, step:0.05, unit:'倍率' },
  ],
  auto_arrow_tower: [
    { k:'range', label:'射程', type:'num', min:1, step:1, unit:'像素' },
    { k:'damage', label:'箭矢伤害', type:'num', min:0, step:1 },
    { k:'cooldown', label:'攻击间隔', type:'num', min:0.05, step:0.05, unit:'秒' },
    { k:'levelRangeBonus', label:'每级射程加成', type:'num', min:0, step:1, unit:'像素' },
  ],
  restoration_tower: [
    { k:'repairRange', label:'修复范围', type:'num', min:1, step:1, unit:'像素' },
    { k:'buildingRepairRate', label:'建筑修复速度', type:'num', min:0, step:0.5, unit:'生命/秒' },
    { k:'unitRepairRate', label:'友军修复速度', type:'num', min:0, step:0.5, unit:'生命/秒' },
    { k:'levelRepairBonus', label:'每级修复效率', type:'num', min:0, max:2, step:0.05, unit:'倍率' },
  ],
  lamp: [{ k:'vision', label:'迷雾驱散范围', type:'num', min:1, step:1, unit:'格' }, { k:'levelVisionBonus', label:'每级视野加成', type:'num', min:0, step:1, unit:'格' }],
  wall: [{ k:'levelDamageReduction', label:'每级减伤', type:'num', min:0, max:0.75, step:0.05, unit:'比例' }],
};
function buildingEditFields(type, level=1) {
  const common=type==='town_hall' ? BLD_COMMON_EDIT_FIELDS.filter(field=>field.k!=='buildTime'&&field.k!=='unlock') : BLD_COMMON_EDIT_FIELDS;
  const typeFields=(BLD_TYPE_EDIT_FIELDS[type]||[]).filter(field=>!(type==='town_hall'&&level>1&&field.k==='startResources'));
  return [...common, ...typeFields];
}
const GLOBAL_EDIT_FIELDS = [
  { k:'DAY_LENGTH', label:'一天时长', min:30, step:1, unit:'秒', restart:true },
  { k:'NIGHT_START_HOUR', label:'夜晚开始', type:'nightRange', min:0, max:11.5, step:0.5, unit:'时', restart:true },
  { k:'NIGHT_END_HOUR', label:'夜晚结束', type:'nightRange', min:0, max:11.5, step:0.5, unit:'时', restart:true },
  { k:'BLOOD_MOON_INTERVAL_DAYS', label:'血月周期', min:1, step:1, unit:'天' },
  { k:'NIGHT_GROWTH_HOURS', label:'血月后夜晚增长', min:0, max:6, step:0.5, unit:'时' },
  { k:'NIGHT_MAX_HOURS', label:'夜晚时长上限', min:0.5, max:11.5, step:0.5, unit:'时' },
  { k:'MEAL_TIME_LUNCH', label:'第一餐时间', min:0, max:11.5, step:0.5, unit:'时' },
  { k:'MEAL_TIME_DINNER', label:'第二餐时间', min:0, max:11.5, step:0.5, unit:'时' },
  { k:'HUNGER_LEVEL_ONE_MULTIPLIER', label:'一级饥饿效率', min:0.05, max:1, step:0.05, unit:'倍率' },
  { k:'HUNGER_LEVEL_TWO_MULTIPLIER', label:'二级饥饿效率', min:0.05, max:1, step:0.05, unit:'倍率' },
  { k:'HUNGER_DEATH_MISSED_MEALS', label:'饿死所需连续缺餐', min:1, step:1, unit:'次' },
  { k:'RESIDENT_SPEED', label:'居民速度', min:1, step:1, unit:'像素/秒' },
  { k:'TREE_CHOP_TIME', label:'单棵砍伐时间', min:0.1, step:0.1, unit:'秒' },
  { k:'TREE_WOOD_YIELD', label:'单棵树木材产量', min:1, step:1, unit:'木材' },
  { k:'FRUIT_TREE_CHOP_TIME', label:'果树砍伐时间', min:0.1, step:0.1, unit:'秒' },
  { k:'FRUIT_TREE_WOOD_YIELD', label:'果树木材产量', min:0, step:1, unit:'木材' },
  { k:'FRUIT_TREE_WOOD_COST', label:'果树苗木材消耗', min:0, step:1, unit:'木材' },
  { k:'FRUIT_TREE_PLANT_TIME', label:'果树种植时间', min:0.1, step:0.1, unit:'秒' },
  { k:'FRUIT_TREE_GROW_TIME_MIN', label:'果树成长时间下限', min:1, step:1, unit:'秒' },
  { k:'FRUIT_TREE_GROW_TIME_MAX', label:'果树成长时间上限', min:1, step:1, unit:'秒' },
  { k:'FRUIT_TREE_FOOD_MIN', label:'果树食物产量下限', min:0, step:1, unit:'食物' },
  { k:'FRUIT_TREE_FOOD_MAX', label:'果树食物产量上限', min:0, step:1, unit:'食物' },
  { k:'ANIMAL_INITIAL_COUNT', label:'初始猎物数量', min:0, step:1, unit:'只', restart:true },
  { k:'ANIMAL_MAX_COUNT', label:'猎物数量上限', min:0, step:1, unit:'只' },
  { k:'ANIMAL_RESPAWN_INTERVAL', label:'猎物补充间隔', min:1, step:1, unit:'秒' },
  { k:'ANIMAL_FOOD_MIN', label:'狩猎食物产量下限', min:0, step:1, unit:'食物' },
  { k:'ANIMAL_FOOD_MAX', label:'狩猎食物产量上限', min:0, step:1, unit:'食物' },
  { k:'ANIMAL_SPEED', label:'猎物移动速度', min:1, step:1, unit:'像素/秒' },
  { k:'ANIMAL_HP', label:'猎物生命', min:1, step:1, unit:'生命', restart:true },
  { k:'NAV_STUCK_WINDOW', label:'停滞检测时长', min:0.25, step:0.25, unit:'秒' },
  { k:'NAV_STUCK_MIN_DISTANCE', label:'停滞最小位移', min:1, step:1, unit:'像素' },
];
const GLOBAL_EDIT_GROUPS=[
  {key:'time',label:'时间与居民作息',description:'夜晚区间决定初始夜长；每次血月结束后，后续夜晚逐步延长至设定上限。',fields:['DAY_LENGTH','NIGHT_START_HOUR','NIGHT_END_HOUR','BLOOD_MOON_INTERVAL_DAYS','NIGHT_GROWTH_HOURS','NIGHT_MAX_HOURS','MEAL_TIME_LUNCH','MEAL_TIME_DINNER','HUNGER_LEVEL_ONE_MULTIPLIER','HUNGER_LEVEL_TWO_MULTIPLIER','HUNGER_DEATH_MISSED_MEALS']},
  {key:'movement',label:'移动与寻路',description:'居民基础速度，以及移动单位停滞后强制重新寻路的条件。',fields:['RESIDENT_SPEED','NAV_STUCK_WINDOW','NAV_STUCK_MIN_DISTANCE']},
  {key:'logging',label:'树木砍伐',description:'普通树的砍伐时间和木材产量。',fields:['TREE_CHOP_TIME','TREE_WOOD_YIELD']},
  {key:'fruitTrees',label:'果树种植与收获',description:'果树砍伐时间、木材产量、种植成本、施工时间、成长时间和食物产量。',fields:['FRUIT_TREE_CHOP_TIME','FRUIT_TREE_WOOD_YIELD','FRUIT_TREE_WOOD_COST','FRUIT_TREE_PLANT_TIME','FRUIT_TREE_GROW_TIME_MIN','FRUIT_TREE_GROW_TIME_MAX','FRUIT_TREE_FOOD_MIN','FRUIT_TREE_FOOD_MAX']},
  {key:'hunting',label:'猎物与狩猎',description:'地图猎物数量、补充速度、属性和狩猎产量。',fields:['ANIMAL_INITIAL_COUNT','ANIMAL_MAX_COUNT','ANIMAL_RESPAWN_INTERVAL','ANIMAL_FOOD_MIN','ANIMAL_FOOD_MAX','ANIMAL_SPEED','ANIMAL_HP']},
];
function globalEditGroup(key) { return GLOBAL_EDIT_GROUPS.find(group=>group.key===key)||GLOBAL_EDIT_GROUPS[0]; }
function globalEditFields(key) {
  const keys=new Set(globalEditGroup(key).fields);
  return GLOBAL_EDIT_FIELDS.filter(field=>keys.has(field.k));
}
const PROFESSION_EDIT_FIELDS = {
  guard: [
    { k:'GUARD_MAX_HP', label:'生命', min:1, step:1, unit:'生命' },
    { k:'GUARD_DAMAGE', label:'攻击', min:0, step:1, unit:'伤害' },
    { k:'GUARD_SPEED', label:'移动速度', min:1, step:1, unit:'像素/秒' },
    { k:'GUARD_ATTACK_COOLDOWN', label:'攻击间隔', min:0.05, step:0.05, unit:'秒' },
  ],
  engineer: [
    { k:'ENGINEER_REPAIR_RATE', label:'修理速度', min:1, step:1, unit:'生命/秒' },
  ],
};
const ENEMY_SPAWN_EDIT_FIELDS = [
  { k:'ENEMY_WAVE_BASE_COUNT', label:'每夜基础敌人数', min:0, step:1, unit:'个' },
  { k:'ENEMY_WAVE_PER_DAY', label:'每天额外敌人数', min:0, step:1, unit:'个/天' },
  { k:'ENEMY_WAVE_MAX', label:'每夜最大波数', min:1, step:1, unit:'波' },
  { k:'ENEMY_WAVE_DAY_STEP', label:'增加一波所需天数', min:1, step:1, unit:'天' },
  { k:'ENEMY_WAVE_DURATION', label:'波次生成持续时间', min:0.5, step:0.5, unit:'秒' },
  { k:'ENEMY_WAVE_INTERVAL', label:'波次之间间隔', min:0, step:0.5, unit:'秒' },
  { k:'ENEMY_SPAWN_JITTER', label:'单位生成随机扰动', min:0, max:1, step:0.05, unit:'比例' },
  { k:'ENEMY_SPAWN_FOG_DEPTH', label:'迷雾生成最小深度', min:1, step:1, unit:'格' },
  { k:'BLOOD_MOON_COUNT_MULTIPLIER', label:'血月敌人数量', min:1, step:0.05, unit:'倍率' },
  { k:'BLOOD_MOON_HP_MULTIPLIER', label:'血月敌人生命', min:0.1, step:0.05, unit:'倍率' },
  { k:'BLOOD_MOON_DAMAGE_MULTIPLIER', label:'血月敌人伤害', min:0.1, step:0.05, unit:'倍率' },
  { k:'BLOOD_MOON_SPEED_MULTIPLIER', label:'血月敌人移速', min:0.1, step:0.05, unit:'倍率' },
];
const ENEMY_EDIT_FIELDS = [
  { k:'name', label:'名称', type:'text' },
  { k:'hp', label:'生命', type:'num', min:1, step:1 },
  { k:'speed', label:'移动速度', type:'num', min:1, step:1 },
  { k:'damage', label:'攻击伤害', type:'num', min:0, step:1 },
  { k:'size', label:'体型', type:'num', min:2, step:1 },
  { k:'unlockDay', label:'出现天数', type:'num', min:1, step:1 },
  { k:'spawnWeight', label:'生成权重', type:'num', min:0, step:0.05 },
  { k:'bloodMoonUnlockDay', label:'血月出现天数', type:'num', min:1, step:1 },
  { k:'bloodMoonSpawnWeight', label:'血月生成权重', type:'num', min:0, step:0.05 },
];
const WORLD_RESOURCE_EDIT_FIELDS = [
  { k:'TREE_INITIAL_COUNT', label:'初始树木总数', min:5, step:1, unit:'棵' },
  { k:'STONE_CLUSTER_COUNT', label:'石头簇数量', min:0, step:1, unit:'簇' },
  { k:'IRON_CLUSTER_COUNT', label:'铁矿簇数量', min:0, step:1, unit:'簇' },
  { k:'TREE_MIN_SPAWN_RADIUS', label:'树木最小生成半径', min:0, step:1, unit:'格' },
  { k:'STONE_MIN_SPAWN_RADIUS', label:'石头最小生成半径', min:0, step:1, unit:'格' },
  { k:'IRON_MIN_SPAWN_RADIUS', label:'铁矿最小生成半径', min:0, step:1, unit:'格' },
  { k:'START_VISIBLE_TREE_MIN', label:'初始可见树木下限', min:0, step:1, unit:'棵' },
  { k:'TREE_CLUSTER_AVERAGE', label:'树木簇平均数量', min:1, max:10, step:0.1, unit:'棵' },
  { k:'TREE_CLUSTER_MAX', label:'树木簇最大数量', min:1, step:1, unit:'棵' },
  { k:'TREE_WILD_MIN_COUNT', label:'野生树木补充下限', min:0, step:1, unit:'棵' },
  { k:'TREE_WILD_MAX_COUNT', label:'野生树木补充上限', min:1, step:1, unit:'棵' },
  { k:'WILD_TREE_SPAWN_INTERVAL_MIN', label:'野生树苗间隔下限', min:1, step:1, unit:'秒' },
  { k:'WILD_TREE_SPAWN_INTERVAL_MAX', label:'野生树苗间隔上限', min:1, step:1, unit:'秒' },
  { k:'WILD_TREE_GROW_TIME_MIN', label:'野生树苗成长下限', min:1, step:1, unit:'秒' },
  { k:'WILD_TREE_GROW_TIME_MAX', label:'野生树苗成长上限', min:1, step:1, unit:'秒' },
  { k:'STONE_CLUSTER_AVERAGE', label:'石头簇平均数量', min:1, max:6, step:0.1, unit:'块' },
  { k:'STONE_CLUSTER_MAX', label:'石头簇最大数量', min:1, step:1, unit:'块' },
  { k:'IRON_CLUSTER_AVERAGE', label:'铁矿簇平均数量', min:1, max:4, step:0.1, unit:'块' },
  { k:'IRON_CLUSTER_MAX', label:'铁矿簇最大数量', min:1, step:1, unit:'块' },
  { k:'IRON_RARE_CLUSTER_CHANCE', label:'铁矿稀有成簇概率', min:0, max:1, step:0.01, unit:'比例' },
];
function settingsSetStatus(message, kind='normal') {
  const el=document.getElementById('settings-status');
  el.textContent=message;
  el.style.color=kind==='error'?'#f07162':kind==='ok'?'#70c080':'#9aa7b8';
}
function renderShortcutSettings() {
  const container=document.getElementById('settings-shortcuts');
  container.innerHTML='';
  for (const action of SHORTCUT_ACTIONS) {
    const row=document.createElement('div');
    row.style.cssText='display:grid;grid-template-columns:1fr 110px;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #344038;';
    const label=document.createElement('span'); label.textContent=action.label;
    const button=document.createElement('button');
    button.type='button'; button.dataset.action=action.id;
    button.textContent=pendingShortcutAction===action.id?'请按按键...':shortcutLabel(gameSettings.shortcuts[action.id]);
    button.style.cssText='background:#2d3a32;color:#e5c66c;border:1px solid #536158;padding:6px 8px;cursor:pointer;font:inherit;';
    button.onclick=()=>beginShortcutCapture(action.id);
    row.append(label,button); container.appendChild(row);
  }
}
function openSettingsPanel() {
  pendingShortcutAction=null;
  document.getElementById('settings-overlay').style.display='flex';
  setCameraDragThreshold(gameSettings.cameraDragThreshold);
  syncSoundSettingsPanel();
  renderSaveSlots();
  renderShortcutSettings();
  settingsSetStatus('存档保存在当前浏览器中；设置修改会自动保存。');
}
function closeSettingsPanel() {
  pendingShortcutAction=null;
  document.getElementById('settings-overlay').style.display='none';
}
function beginShortcutCapture(actionId) {
  pendingShortcutAction=actionId;
  renderShortcutSettings();
  settingsSetStatus('按下新的按键，按 Esc 取消录制。');
}
function assignShortcut(actionId, code) {
  const conflict=Object.keys(gameSettings.shortcuts).find(id => id!==actionId && gameSettings.shortcuts[id]===code);
  if (conflict) gameSettings.shortcuts[conflict]=DEFAULT_SHORTCUTS[conflict];
  gameSettings.shortcuts[actionId]=code;
  saveGameSettings();
  pendingShortcutAction=null;
  renderShortcutSettings();
  const conflictText=conflict ? '；原快捷键已恢复默认。' : '。';
  settingsSetStatus('已保存“'+SHORTCUT_ACTIONS.find(a=>a.id===actionId).label+'”快捷键'+conflictText,'ok');
}
function resetShortcuts() {
  gameSettings.shortcuts={...DEFAULT_SHORTCUTS};
  saveGameSettings();
  pendingShortcutAction=null;
  renderShortcutSettings();
  settingsSetStatus('已恢复默认快捷键并自动保存。','ok');
}
function closeAllOverlays() {
  closeSettingsPanel();
  closeConfigPanel();
}
function cancelCurrentAction() {
  clearBlueprintCommand();
  clearChopCommand();
  hideContextMenu();
}
function runShortcut(actionId) {
  if (actionId==='pause') togglePause();
  else if (actionId==='speedNormal') setSpeed(1);
  else if (actionId==='speed2') setSpeed(2);
  else if (actionId==='speed4') setSpeed(4);
  else if (actionId==='cancel') cancelCurrentAction();
  else if (actionId==='chop') toggleChopMode();
  else if (actionId==='unchop') toggleUnchopMode();
  else if (actionId==='hunt') toggleHuntMode();
  else if (actionId==='settings') openSettingsPanel();
  else if (actionId==='config') openConfigPanel();
}
function cfgSetStatus(message, kind='normal') {
  const el=document.getElementById('cfg-status');
  el.textContent=message;
  el.style.color=kind==='error'?'#f07162':kind==='ok'?'#70c080':'#9aa7b8';
}
function cfgSetDevelopmentServerLink() {
  const el=document.getElementById('cfg-status');
  el.innerHTML='当前页面不支持写入项目。<a href="http://127.0.0.1:3010/game.html" style="color:#8ed7e0;text-decoration:underline;">打开可保存的开发版本</a>';
  el.style.color='#f0c979';
}
let cfgEditSession=null;
function cfgPanelKey(view) { return `${view.cat}|${view.key}|${view.level||1}`; }
function cfgPanelFields(view) {
  if(view.cat==='globals') return globalEditFields(view.key).map(field=>({id:'cfg-global-'+field.k,field}));
  if(view.cat==='professions') return (PROFESSION_EDIT_FIELDS[view.key]||[]).map(field=>({id:'cfg-profession-'+field.k,field}));
  if(view.cat==='enemySpawns') return ENEMY_SPAWN_EDIT_FIELDS.map(field=>({id:'cfg-spawn-'+field.k,field}));
  if(view.cat==='enemies') return ENEMY_EDIT_FIELDS.map(field=>({id:'cfg-enemy-'+field.k,field}));
  if(view.cat==='worldResources') return WORLD_RESOURCE_EDIT_FIELDS.map(field=>({id:'cfg-world-'+field.k,field}));
  if(view.cat==='buildings'&&BLD_DEFS[view.key]) {
    const level=view.level||1;
    const fields=buildingEditFields(view.key,level).filter(field=>level===1||!['name','icon','sz','maxLevel','cost'].includes(field.k));
    if(level>1) fields.push({k:'upgradeCost',label:'升至本级消耗',type:'resources'});
    return fields.map(field=>({id:'cfg-fld-'+field.k,field}));
  }
  if(view.cat==='initialResources') return [
    {id:'cfg-initial-POP',field:{k:'START_POP',label:'初始人口'}},
    {id:'cfg-initial-ENGINEERS',field:{k:'START_ENGINEERS',label:'初始工程师'}},
  ];
  return [];
}
function cfgCaptureCurrentPanel() {
  if(!cfgEditSession?.view) return;
  const values={};
  for(const {id} of cfgPanelFields(cfgEditSession.view)) {
    const element=document.getElementById(id);
    if(element) values[id]=element.value;
  }
  cfgEditSession.panels.set(cfgPanelKey(cfgEditSession.view),{view:{...cfgEditSession.view},values});
}
function cfgRestoreCurrentPanel(view) {
  if(!cfgEditSession) return;
  cfgEditSession.view={...view};
  const panel=cfgEditSession.panels.get(cfgPanelKey(view));
  if(!panel) return;
  for(const [id,value] of Object.entries(panel.values)) {
    const element=document.getElementById(id);
    if(element) element.value=value;
  }
}
function cfgFormatHour(value) {
  const totalMinutes=Math.round((Number(value)||0)*60)%(CLOCK_HOURS*60);
  const hour=Math.floor(totalMinutes/60)||CLOCK_HOURS;
  return String(hour).padStart(2,'0')+':'+String(totalMinutes%60).padStart(2,'0');
}
function cfgUpdateNightRangePreview() {
  const start=document.getElementById('cfg-global-NIGHT_START_HOUR');
  const end=document.getElementById('cfg-global-NIGHT_END_HOUR');
  const track=document.getElementById('cfg-night-range-track');
  if(!start||!end||!track) return;
  const startValue=Number(start.value),endValue=Number(end.value);
  const low=Math.min(startValue,endValue)/CLOCK_HOURS*100,high=Math.max(startValue,endValue)/CLOCK_HOURS*100;
  track.style.background=startValue>endValue
    ? `linear-gradient(to right,#334653 0%,#334653 ${low}%,#6b6540 ${low}%,#6b6540 ${high}%,#334653 ${high}%,#334653 100%)`
    : `linear-gradient(to right,#6b6540 0%,#6b6540 ${low}%,#334653 ${low}%,#334653 ${high}%,#6b6540 ${high}%,#6b6540 100%)`;
  const startLabel=document.getElementById('cfg-night-start-label'),endLabel=document.getElementById('cfg-night-end-label');
  if(startLabel) startLabel.textContent='开始 '+cfgFormatHour(startValue);
  if(endLabel) endLabel.textContent='结束 '+cfgFormatHour(endValue);
}
function cfgNightRangeHtml() {
  return `<div class="cfg-night-range-row"><label>夜晚区间</label><div class="cfg-night-range-control"><div id="cfg-night-range-track" class="cfg-night-range-track"><input id="cfg-global-NIGHT_START_HOUR" aria-label="夜晚开始" type="range" min="0" max="11.5" step="0.5" value="${CFG.NIGHT_START_HOUR}" oninput="cfgUpdateNightRangePreview()"><input id="cfg-global-NIGHT_END_HOUR" aria-label="夜晚结束" type="range" min="0" max="11.5" step="0.5" value="${CFG.NIGHT_END_HOUR}" oninput="cfgUpdateNightRangePreview()"></div><div class="cfg-night-range-values"><span id="cfg-night-start-label"></span><span id="cfg-night-end-label"></span></div></div><span class="cfg-restart-label">重开生效</span></div>`;
}
function closeConfigPanel() {
  cfgEditSession=null;
  document.getElementById('config-overlay').style.display='none';
}
function openConfigPanel() {
  cfgEditSession={panels:new Map(),view:null};
  document.getElementById('config-overlay').style.display='flex';
  cfgSelectCategory();
  cfgSetStatus('本次打开期间的修改会暂存；应用会一次处理全部修改，保存到项目会写入完整配置表。');
}
function syncCfgBuildingLevelOptions(type) {
  const select=document.getElementById('cfg-building-level');
  const def=BLD_DEFS[type];
  if (!def) { select.style.display='none'; return 1; }
  const previous=Number(select.value)||1;
  select.innerHTML='';
  for(let level=1;level<=def.maxLevel;level++) {
    const option=document.createElement('option'); option.value=level; option.textContent='等级 '+level;
    if(level===Math.min(previous,def.maxLevel)) option.selected=true;
    select.appendChild(option);
  }
  select.style.display='block';
  return Number(select.value)||1;
}
function sortedBuildingEntries() {
  return Object.entries(BLD_DEFS)
    .map(([key,def],index)=>({key,def,index}))
    .sort((a,b)=>(Number(a.def.unlock)||1)-(Number(b.def.unlock)||1)||a.index-b.index)
    .map(({key,def})=>[key,def]);
}
const CFG_BUILDING_FILTER_TYPES=[
  {key:'production',label:'生产'},
  {key:'defense',label:'塔防'},
  {key:'storage',label:'仓储'},
  {key:'other',label:'其他'},
];
const cfgBuildingFilters={levels:new Set(),types:new Set()};
function cfgBuildingFilterType(type,def=BLD_DEFS[type]) {
  if(type==='nursery'||type==='training_ground') return 'production';
  if(type==='house'||type==='barracks') return 'storage';
  if(def?.cat==='production') return 'production';
  if(def?.cat==='defense') return 'defense';
  if(def?.cat==='storage') return 'storage';
  return 'other';
}
function buildingMatchesCfgFilters(type,def) {
  const level=Math.max(1,Math.floor(Number(def.unlock)||1));
  const levelMatches=!cfgBuildingFilters.levels.size||cfgBuildingFilters.levels.has(level);
  const typeMatches=!cfgBuildingFilters.types.size||cfgBuildingFilters.types.has(cfgBuildingFilterType(type,def));
  return levelMatches&&typeMatches;
}
function filteredCfgBuildingEntries() {
  return sortedBuildingEntries().filter(([type,def])=>buildingMatchesCfgFilters(type,def));
}
function renderCfgBuildingFilters() {
  const levelContainer=document.getElementById('cfg-filter-levels');
  const typeContainer=document.getElementById('cfg-filter-types');
  levelContainer.innerHTML='';typeContainer.innerHTML='';
  const levels=[...new Set(sortedBuildingEntries().map(([,def])=>Math.max(1,Math.floor(Number(def.unlock)||1))))].sort((a,b)=>a-b);
  for(const selected of [...cfgBuildingFilters.levels]) if(!levels.includes(selected)) cfgBuildingFilters.levels.delete(selected);
  for(const level of levels) {
    const button=document.createElement('button');button.type='button';button.className='cfg-filter-btn';
    button.textContent=level+'级';button.classList.toggle('active',cfgBuildingFilters.levels.has(level));
    button.onclick=()=>toggleCfgBuildingFilter('levels',level);levelContainer.appendChild(button);
  }
  for(const item of CFG_BUILDING_FILTER_TYPES) {
    const button=document.createElement('button');button.type='button';button.className='cfg-filter-btn';
    button.textContent=item.label;button.classList.toggle('active',cfgBuildingFilters.types.has(item.key));
    button.onclick=()=>toggleCfgBuildingFilter('types',item.key);typeContainer.appendChild(button);
  }
}
function toggleCfgBuildingFilter(group,value) {
  const selected=cfgBuildingFilters[group];
  if(selected.has(value)) selected.delete(value); else selected.add(value);
  const previous=document.getElementById('cfg-item').value;
  renderCfgBuildingFilters();syncCfgBuildingOptions(previous);cfgSelectItem();
}
function renderCfgBuildingResults(selectedType='') {
  const container=document.getElementById('cfg-building-results');
  container.innerHTML='';
  const entries=filteredCfgBuildingEntries();
  if(!entries.length) {
    const empty=document.createElement('div');empty.className='cfg-building-results-empty';empty.textContent='无匹配建筑';container.appendChild(empty);return;
  }
  for(const [key,def] of entries) {
    const button=document.createElement('button');button.type='button';
    button.className='cfg-building-result'+(key===selectedType?' active':'');
    button.textContent=def.name;button.onclick=()=>selectCfgBuilding(key);container.appendChild(button);
  }
}
function selectCfgBuilding(type) {
  const select=document.getElementById('cfg-item');
  if(!BLD_DEFS[type]||!filteredCfgBuildingEntries().some(([key])=>key===type)) return false;
  select.value=type;renderCfgBuildingResults(type);cfgSelectItem();return true;
}
function syncCfgBuildingOptions(selectedType='') {
  const select=document.getElementById('cfg-item');
  select.innerHTML='';
  const entries=filteredCfgBuildingEntries();
  for(const [key,def] of entries) {
    const option=document.createElement('option');
    option.value=key;option.textContent=def.name;
    if(key===selectedType) option.selected=true;
    select.appendChild(option);
  }
  if(!entries.length) {
    const option=document.createElement('option');option.value='';option.textContent='无匹配建筑';option.disabled=true;option.selected=true;select.appendChild(option);
  }
  const active=entries.some(([key])=>key===selectedType)?selectedType:(entries[0]?.[0]||'');
  if(active) select.value=active;
  renderCfgBuildingResults(active);
}
function cfgSelectCategory() {
  cfgCaptureCurrentPanel();
  const cat=document.getElementById('cfg-category').value;
  const sel=document.getElementById('cfg-item');
  const filters=document.getElementById('cfg-building-filters');
  filters.style.display=cat==='buildings'?'block':'none';
  sel.style.display=cat==='buildings'?'none':'';
  document.getElementById('cfg-building-level').style.display=cat==='buildings'?'block':'none';
  sel.innerHTML='';
  if(cat==='globals') {
    for(const group of GLOBAL_EDIT_GROUPS) {
      const opt=document.createElement('option');opt.value=group.key;opt.textContent=group.label;sel.appendChild(opt);
    }
  } else if(cat==='professions') {
    const guard=document.createElement('option'); guard.value='guard'; guard.textContent='守卫'; sel.appendChild(guard);
    const engineer=document.createElement('option'); engineer.value='engineer'; engineer.textContent='工程师'; sel.appendChild(engineer);
  } else if(cat==='enemySpawns') {
    const opt=document.createElement('option'); opt.value='nightRaids'; opt.textContent='夜袭波次'; sel.appendChild(opt);
  } else if(cat==='enemies') {
    for(const [key,def] of Object.entries(ENEMY_DEFS)) {
      const opt=document.createElement('option'); opt.value=key; opt.textContent=def.name+' ('+key+')'; sel.appendChild(opt);
    }
  } else if(cat==='buildings') {
    renderCfgBuildingFilters();
    syncCfgBuildingOptions();
  } else if(cat==='initialResources') {
    const opt=document.createElement('option'); opt.value='all'; opt.textContent='初始人口'; sel.appendChild(opt);
  } else if(cat==='worldResources') {
    const opt=document.createElement('option'); opt.value='generation'; opt.textContent='资源分布'; sel.appendChild(opt);
  }
  cfgSelectItem();
}
function cfgSelectItem() {
  cfgCaptureCurrentPanel();
  const cat=document.getElementById('cfg-category').value;
  const key=document.getElementById('cfg-item').value;
  const container=document.getElementById('cfg-fields');
  let html='';
  if(cat==='buildings'&&BLD_DEFS[key]) renderCfgBuildingResults(key);
  if(cat==='buildings'&&!BLD_DEFS[key]) {
    document.getElementById('cfg-building-level').style.display='none';
    container.innerHTML='<div style="padding:18px;text-align:center;color:#819087;">没有符合当前筛选条件的建筑</div>';
    return;
  }
  if(cat==='unlocks') {
    const maxUnlockLevel=Math.max(10,...Object.values(BLD_DEFS).map(def=>def.unlock||1));
    html='<div style="color:#9aa7b8;line-height:18px;margin-bottom:4px;">为每种建筑选择首次可建造时所需的大本营等级。</div>';
    for(const [type,def] of Object.entries(BLD_DEFS)) {
      if(type==='town_hall') continue;
      let options='';
      for(let level=1;level<=maxUnlockLevel;level++) options+=`<option value="${level}" ${def.unlock===level?'selected':''}>大本营 ${level} 级</option>`;
      html+=`<div style="display:grid;grid-template-columns:1fr 132px;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #344038;"><span>${def.name}</span><select id="cfg-unlock-${type}" style="background:#2a2a3a;color:#fff;border:1px solid #555;padding:4px 6px;border-radius:3px;font-size:12px;font-family:inherit;">${options}</select></div>`;
    }
  } else if(cat==='globals') {
    const group=globalEditGroup(key);
    html=`<div style="color:#9aa7b8;line-height:18px;margin-bottom:4px;">${group.description}</div>`;
    for(const f of globalEditFields(key)) {
      if(f.k==='NIGHT_START_HOUR') { html+=cfgNightRangeHtml();continue; }
      if(f.k==='NIGHT_END_HOUR') continue;
      html+=`<div style="display:grid;grid-template-columns:120px 1fr 72px;align-items:center;gap:8px;"><label style="text-align:right;color:#aaa;">${f.label}</label><input id="cfg-global-${f.k}" type="number" min="${f.min}" step="${f.step}" value="${CFG[f.k]}" style="background:#2a2a3a;color:#fff;border:1px solid #555;padding:4px 6px;border-radius:3px;font-size:12px;font-family:inherit;"><span style="color:${f.restart?'#d5a85c':'#788898'}">${f.restart?'重开生效':f.unit}</span></div>`;
    }
  } else if(cat==='professions') {
    const fields=PROFESSION_EDIT_FIELDS[key]||[];
    html=`<div style="color:#9aa7b8;line-height:18px;margin-bottom:4px;">${key==='guard'?'守卫参数会立即作用于当前与后续守卫。':'工程师修理速度会立即作用于当前游戏。'}</div>`;
    for(const f of fields) {
      html+=`<div style="display:grid;grid-template-columns:120px 1fr 72px;align-items:center;gap:8px;"><label style="text-align:right;color:#aaa;">${f.label}</label><input id="cfg-profession-${f.k}" type="number" min="${f.min}" ${f.max!==undefined?`max="${f.max}"`:''} step="${f.step}" value="${CFG[f.k]}" style="background:#2a2a3a;color:#fff;border:1px solid #555;padding:4px 6px;border-radius:3px;font-size:12px;font-family:inherit;"><span style="color:#788898">${f.unit}</span></div>`;
    }
  } else if(cat==='enemySpawns') {
    html='<div style="color:#9aa7b8;line-height:18px;margin-bottom:4px;">修改后将在下一次进入夜晚时使用。血月会放大总数量和单位属性，但不会改变当前夜晚已固定的生成队列。</div>';
    for(const f of ENEMY_SPAWN_EDIT_FIELDS) {
      html+=`<div style="display:grid;grid-template-columns:150px 1fr 72px;align-items:center;gap:8px;"><label style="text-align:right;color:#aaa;">${f.label}</label><input id="cfg-spawn-${f.k}" type="number" min="${f.min}" ${f.max!==undefined?`max="${f.max}"`:''} step="${f.step}" value="${CFG[f.k]}" style="background:#2a2a3a;color:#fff;border:1px solid #555;padding:4px 6px;border-radius:3px;font-size:12px;font-family:inherit;"><span style="color:#788898">${f.unit}</span></div>`;
    }
  } else if(cat==='enemies'&&ENEMY_DEFS[key]) {
    const d=ENEMY_DEFS[key];
    html='<div style="color:#9aa7b8;line-height:18px;margin-bottom:4px;">普通夜晚和血月可分别配置敌人的首次出现天数与生成权重。破坏者会优先攻击路线上的防御建筑。</div>';
    for(const f of ENEMY_EDIT_FIELDS) {
      const inputType=f.type==='text'?'text':'number';
      const limits=f.type==='num'?`min="${f.min}" step="${f.step}"`:'';
      html+=`<div style="display:grid;grid-template-columns:120px 1fr;align-items:center;gap:8px;padding:4px 0;"><label style="text-align:right;color:#aaa;">${f.label}</label><input id="cfg-enemy-${f.k}" type="${inputType}" ${limits} value="${d[f.k]??''}" style="background:#2a2a3a;color:#fff;border:1px solid #555;padding:4px 6px;border-radius:3px;font-size:12px;font-family:inherit;"></div>`;
    }
  } else if(cat==='worldResources') {
    html='<div style="color:#9aa7b8;line-height:18px;margin-bottom:4px;">重新开始游戏后生成新地图资源。半径以大本营中心计算，树木会优先保证初始视野内的数量。</div>';
    for(const f of WORLD_RESOURCE_EDIT_FIELDS) {
      html+=`<div style="display:grid;grid-template-columns:150px 1fr 72px;align-items:center;gap:8px;"><label style="text-align:right;color:#aaa;">${f.label}</label><input id="cfg-world-${f.k}" type="number" min="${f.min}" ${f.max!==undefined?`max="${f.max}"`:''} step="${f.step}" value="${CFG[f.k]}" style="background:#2a2a3a;color:#fff;border:1px solid #555;padding:4px 6px;border-radius:3px;font-size:12px;font-family:inherit;"><span style="color:#d5a85c">重开生效</span></div>`;
    }
  } else if(cat==='buildings'&&BLD_DEFS[key]) {
    const d=BLD_DEFS[key];
    const level=syncCfgBuildingLevelOptions(key);
    const fields=buildingEditFields(key,level).filter(field=>level===1||!['name','icon','sz','maxLevel','cost'].includes(field.k));
    if(level>1) fields.push({k:'upgradeCost',label:'升至本级消耗',type:'resources'});
    html=`<div style="color:#9aa7b8;line-height:18px;margin-bottom:8px;">正在编辑 ${d.name} 的等级 ${level} 参数。未单独填写的等级会沿用默认升级曲线；范围、射程和容量会立即作用于当前游戏。</div>`;
    for(const f of fields) {
      let val=f.k==='upgradeCost' ? upgradeCostForLevel(key,level) : (level===1||['name','icon','sz','maxLevel','cost'].includes(f.k) ? d[f.k] : buildingLevelValue(key,level,f.k));
      if(f.type==='sz') {
        const [w,h]=Array.isArray(val)?val:[1,1];
        html+=`<div style="display:grid;grid-template-columns:132px 72px 16px 72px 52px;align-items:center;gap:8px;padding:3px 0;"><label style="text-align:right;color:#aaa;">${f.label}</label><input id="cfg-fld-sz-w" type="number" min="1" step="1" value="${w}" style="min-width:0;background:#2a2a3a;color:#fff;border:1px solid #555;padding:4px 6px;border-radius:3px;font-size:12px;font-family:inherit;"><span style="text-align:center;color:#aaa;">×</span><input id="cfg-fld-sz-h" type="number" min="1" step="1" value="${h}" style="min-width:0;background:#2a2a3a;color:#fff;border:1px solid #555;padding:4px 6px;border-radius:3px;font-size:12px;font-family:inherit;"><span></span></div>`;
        continue;
      }
      if(f.type==='resources') val=Object.entries(val||{}).map(([resource,amount])=>resource+':'+amount).join(',');
      if(f.type==='resource') {
        const options=RESOURCE_TYPES.map(resource=>`<option value="${resource}" ${resource===val?'selected':''}>${RESOURCE_NAMES[resource]}</option>`).join('');
        html+=`<div style="display:grid;grid-template-columns:132px 1fr 52px;align-items:center;gap:8px;padding:3px 0;"><label style="text-align:right;color:#aaa;">${f.label}</label><select id="cfg-fld-${f.k}" style="min-width:0;background:#2a2a3a;color:#fff;border:1px solid #555;padding:4px 6px;border-radius:3px;font-size:12px;font-family:inherit;">${options}</select><span></span></div>`;
        continue;
      }
      const inputType=f.type==='num'?'number':'text';
      const limits=f.type==='num'?`min="${f.min}" ${f.max!==undefined?`max="${f.max}"`:''} step="${f.step??1}"`:'';
      const resourceHint=f.type==='resources'?'placeholder="wood:10,stone:5" title="资源键：food, wood, stone, iron, charcoal, ingot"':'';
      html+=`<div style="display:grid;grid-template-columns:132px 1fr 52px;align-items:center;gap:8px;padding:3px 0;"><label style="text-align:right;color:#aaa;">${f.label}</label><input id="cfg-fld-${f.k}" type="${inputType}" ${limits} ${resourceHint} value="${val??''}" style="min-width:0;background:#2a2a3a;color:#fff;border:1px solid #555;padding:4px 6px;border-radius:3px;font-size:12px;font-family:inherit;"><span style="color:#788898;font-size:11px;">${f.unit||''}</span></div>`;
    }
  } else if(cat==='initialResources') {
    html='<div style="color:#9aa7b8;line-height:18px;margin-bottom:4px;">重新开始游戏时将使用以下初始人口配置。大本营每级村民/守卫上限、初始资源和仓储上限请在“建筑 → 大本营”对应等级中编辑。</div>';
    html+=`<div style="display:grid;grid-template-columns:120px 1fr;align-items:center;gap:8px;padding:4px 0;"><label style="text-align:right;color:#aaa;">初始人口</label><input id="cfg-initial-POP" type="number" min="0" step="1" value="${CFG.START_POP}" style="background:#2a2a3a;color:#fff;border:1px solid #555;padding:4px 6px;border-radius:3px;font-size:12px;font-family:inherit;"></div>`;
    html+=`<div style="display:grid;grid-template-columns:120px 1fr;align-items:center;gap:8px;padding:4px 0;"><label style="text-align:right;color:#aaa;">初始工程师</label><input id="cfg-initial-ENGINEERS" type="number" min="0" step="1" value="${CFG.START_ENGINEERS}" style="background:#2a2a3a;color:#fff;border:1px solid #555;padding:4px 6px;border-radius:3px;font-size:12px;font-family:inherit;"></div>`;
  }
  container.innerHTML=html;
  const level=cat==='buildings'?(Number(document.getElementById('cfg-building-level').value)||1):1;
  cfgRestoreCurrentPanel({cat,key,level});
  if(cat==='globals'&&key==='time') cfgUpdateNightRangePreview();
}
function cfgConfigSnapshot() {
  const globals={...CFG};
  return {globals,enemies:JSON.parse(JSON.stringify(ENEMY_DEFS)),buildings:JSON.parse(JSON.stringify(BLD_DEFS))};
}
function cfgParseNumber(raw,field) {
  const value=Number(raw);
  if(!Number.isFinite(value)||value<field.min||(field.max!==undefined&&value>field.max)) return {error:field.label+'不是有效数值'};
  return {value};
}
function cfgMergePanelIntoCandidate(panel,candidate) {
  const {view,values}=panel;
  const read=id=>String(values[id]??'').trim();
  if(view.cat==='globals') {
    for(const field of globalEditFields(view.key)) {
      const parsed=cfgParseNumber(read('cfg-global-'+field.k),field);
      if(parsed.error) return parsed.error;
      candidate.globals[field.k]=parsed.value;
    }
  } else if(view.cat==='professions') {
    for(const field of PROFESSION_EDIT_FIELDS[view.key]||[]) {
      const parsed=cfgParseNumber(read('cfg-profession-'+field.k),field);
      if(parsed.error) return parsed.error;
      candidate.globals[field.k]=parsed.value;
    }
  } else if(view.cat==='enemySpawns') {
    for(const field of ENEMY_SPAWN_EDIT_FIELDS) {
      const parsed=cfgParseNumber(read('cfg-spawn-'+field.k),field);
      if(parsed.error) return parsed.error;
      candidate.globals[field.k]=parsed.value;
    }
  } else if(view.cat==='enemies'&&candidate.enemies[view.key]) {
    for(const field of ENEMY_EDIT_FIELDS) {
      const raw=read('cfg-enemy-'+field.k);
      if(field.type==='text') candidate.enemies[view.key][field.k]=raw;
      else {
        const parsed=cfgParseNumber(raw,field);
        if(parsed.error) return parsed.error;
        candidate.enemies[view.key][field.k]=parsed.value;
      }
    }
  } else if(view.cat==='worldResources') {
    for(const field of WORLD_RESOURCE_EDIT_FIELDS) {
      const parsed=cfgParseNumber(read('cfg-world-'+field.k),field);
      if(parsed.error) return parsed.error;
      candidate.globals[field.k]=parsed.value;
    }
  } else if(view.cat==='buildings'&&candidate.buildings[view.key]) {
    const level=view.level||1;
    const target=level===1?candidate.buildings[view.key]:((candidate.buildings[view.key].levels||(candidate.buildings[view.key].levels={}))[level]||((candidate.buildings[view.key].levels||(candidate.buildings[view.key].levels={}))[level]={}));
    for(const {id,field} of cfgPanelFields(view)) {
      const raw=read(id);
      if(field.type==='sz') {
        const w=cfgParseNumber(read('cfg-fld-sz-w'),{min:1,step:1});
        const h=cfgParseNumber(read('cfg-fld-sz-h'),{min:1,step:1});
        if(w.error) return candidate.buildings[view.key].name+'：'+w.error;
        if(h.error) return candidate.buildings[view.key].name+'：'+h.error;
        target[field.k]=[w.value,h.value];
      } else if(field.type==='num') {
        const parsed=cfgParseNumber(raw,field);
        if(parsed.error) return candidate.buildings[view.key].name+'：'+parsed.error;
        target[field.k]=parsed.value;
      } else if(field.type==='resources') {
        const parsed=parseResourceMapInput(raw);
        if(parsed.error) return candidate.buildings[view.key].name+' '+field.label+'：'+parsed.error;
        target[field.k]=parsed.value;
      } else if(field.type==='resource') {
        if(!RESOURCE_TYPES.includes(raw)) return candidate.buildings[view.key].name+' '+field.label+'不是有效资源';
        target[field.k]=raw;
      } else target[field.k]=raw;
    }
  } else if(view.cat==='initialResources') {
    const fields=[
      ['cfg-initial-POP','START_POP','初始人口',0],
      ['cfg-initial-ENGINEERS','START_ENGINEERS','初始工程师',0],
    ];
    for(const [id,key,label,min] of fields) {
      const value=Number(read(id));
      if(!Number.isFinite(value)||value<min) return label+'不是有效数值';
      candidate.globals[key]=Math.floor(value);
    }
  }
  return '';
}
function cfgValidateCandidate(candidate) {
  const cfg=candidate.globals;
  const nightHours=cyclicHourSpan(cfg.NIGHT_START_HOUR,cfg.NIGHT_END_HOUR);
  if(nightHours<=0) return '夜晚开始与结束时间不能相同';
  if(cfg.DAY_LENGTH*nightHours/CLOCK_HOURS<=cfg.TRANSITION*2) return '夜晚区间过短，无法容纳黄昏和黎明过渡';
  if(cfg.NIGHT_MAX_HOURS<nightHours) return '夜晚时长上限不能小于初始夜晚时长';
  if(cfg.DAY_LENGTH*cfg.NIGHT_MAX_HOURS/CLOCK_HOURS<=cfg.TRANSITION*2) return '夜晚时长上限无法容纳黄昏和黎明过渡';
  if(cfg.MEAL_TIME_LUNCH===cfg.MEAL_TIME_DINNER) return '两次用餐时间不能相同';
  if(cfg.HUNGER_LEVEL_TWO_MULTIPLIER>cfg.HUNGER_LEVEL_ONE_MULTIPLIER) return '二级饥饿效率不能高于一级饥饿效率';
  if(cfg.FRUIT_TREE_GROW_TIME_MIN>cfg.FRUIT_TREE_GROW_TIME_MAX||cfg.FRUIT_TREE_FOOD_MIN>cfg.FRUIT_TREE_FOOD_MAX) return '果树的随机下限不能大于上限';
  if(cfg.ANIMAL_INITIAL_COUNT>cfg.ANIMAL_MAX_COUNT||cfg.ANIMAL_FOOD_MIN>cfg.ANIMAL_FOOD_MAX) return '猎物数量或产量下限不能大于上限';
  if(cfg.START_ENGINEERS>cfg.START_POP) return '初始工程师必须介于 0 和初始人口之间';
  if(cfg.TREE_CLUSTER_AVERAGE>cfg.TREE_CLUSTER_MAX||cfg.STONE_CLUSTER_AVERAGE>cfg.STONE_CLUSTER_MAX||cfg.IRON_CLUSTER_AVERAGE>cfg.IRON_CLUSTER_MAX) return '资源簇平均数量不能大于对应最大数量';
  if(cfg.TREE_WILD_MIN_COUNT>cfg.TREE_WILD_MAX_COUNT) return '野生树木补充下限不能大于上限';
  if(cfg.WILD_TREE_SPAWN_INTERVAL_MIN>cfg.WILD_TREE_SPAWN_INTERVAL_MAX||cfg.WILD_TREE_GROW_TIME_MIN>cfg.WILD_TREE_GROW_TIME_MAX) return '野生树木的随机时间下限不能大于上限';
  if(cfg.START_VISIBLE_TREE_MIN>cfg.TREE_INITIAL_COUNT) return '初始可见树木下限不能大于初始树木总数';
  const townHallVision=Number(candidate.buildings.town_hall?.vision)||0;
  if(cfg.START_VISIBLE_TREE_MIN>0&&cfg.TREE_MIN_SPAWN_RADIUS>=townHallVision) return '树木最小半径必须小于大本营视野，才能保证初始可见树木';
  return '';
}
function cfgReplaceConfigObject(target,source) {
  for(const key of Object.keys(target)) if(!Object.prototype.hasOwnProperty.call(source,key)) delete target[key];
  for(const [key,value] of Object.entries(source)) target[key]=JSON.parse(JSON.stringify(value));
}
function cfgCommitCandidate(candidate) {
  Object.assign(CFG,candidate.globals);
  syncDayNightDurations();
  cfgReplaceConfigObject(ENEMY_DEFS,candidate.enemies);
  cfgReplaceConfigObject(BLD_DEFS,candidate.buildings);
  for(const resident of G.residents) if(resident.isGuard) {
    resident.guardMaxHP=CFG.GUARD_MAX_HP;
    resident.guardHP=Math.min(resident.guardHP,resident.guardMaxHP);
  }
  for(const building of G.buildings) {
    building.maxHp=Math.floor(buildingLevelValue(building.type,building.level,'hp'));
    building.hp=Math.min(building.hp,building.maxHp);
  }
  recalculatePopulationLimits();
  updateAllResourceTotals();
  updateFruitPlantCommandCost();
  refreshFogVisibility();
  updateBuildingPanel();
}
function cfgApply() {
  if(!cfgEditSession) cfgEditSession={panels:new Map(),view:null};
  if(!cfgEditSession.view) {
    const cat=document.getElementById('cfg-category')?.value;
    const key=document.getElementById('cfg-item')?.value;
    const level=cat==='buildings'?(Number(document.getElementById('cfg-building-level')?.value)||1):1;
    cfgEditSession.view={cat,key,level};
  }
  cfgCaptureCurrentPanel();
  const candidate=cfgConfigSnapshot();
  for(const panel of cfgEditSession.panels.values()) {
    const error=cfgMergePanelIntoCandidate(panel,candidate);
    if(error) { cfgSetStatus(error,'error'); return false; }
  }
  const validationError=cfgValidateCandidate(candidate);
  if(validationError) { cfgSetStatus(validationError,'error'); return false; }
  cfgCommitCandidate(candidate);
  cfgEditSession={panels:new Map(),view:null};
  cfgSelectItem();
  cfgSetStatus('本次打开编辑器所做的全部修改已应用；标记“重开生效”的项目需要重新开始。','ok');
  showTimeIndicator('配置已全部应用');
  return true;
}
function collectBalanceData() {
  const globals={};
  for(const field of GLOBAL_EDIT_FIELDS) globals[field.k]=CFG[field.k];
  for(const fields of Object.values(PROFESSION_EDIT_FIELDS)) for(const field of fields) globals[field.k]=CFG[field.k];
  for(const field of ENEMY_SPAWN_EDIT_FIELDS) globals[field.k]=CFG[field.k];
  for(const field of WORLD_RESOURCE_EDIT_FIELDS) globals[field.k]=CFG[field.k];
  globals.START_POP=CFG.START_POP; globals.START_ENGINEERS=CFG.START_ENGINEERS;
  return {version:BALANCE_VERSION, savedAt:new Date().toISOString(), globals, enemies:ENEMY_DEFS, buildings:BLD_DEFS};
}
async function cfgSaveProject() {
  if(!cfgApply()) return;
  if(location.protocol==='file:') { cfgSetStatus('请通过 tools/dev-server.js 启动游戏后再保存到项目。','error'); return; }
  const button=document.getElementById('cfg-save-btn'); button.disabled=true; button.textContent='保存中...';
  try {
    const response=await fetch('/api/balance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(collectBalanceData())});
    const result=await response.json();
    if(!response.ok) throw new Error(result.error||'保存失败');
    cfgSetStatus('已写入 data/balance.json，刷新页面后仍会保留。','ok');
  } catch(error) {
    if (location.port!=='3010') cfgSetDevelopmentServerLink();
    else cfgSetStatus('保存失败：'+error.message,'error');
  }
  finally { button.disabled=false; button.textContent='保存到项目'; }
}
