// ============================================================
// SAVE GAME
// ============================================================
const SAVE_STATE_SCALARS = [
  'tick','day','dayTime','phase','totalTime','popGrowthTimer','engineerCount',
  'enemySpawnQueue','enemySpawnTimer','cam','treesChopped','resourceCleanupTimer',
  'wildTreeTarget','wildTreeSpawnTimer','animalSpawnTimer','guardMoveCommandSequence'
];
function copySaveFields(source, excluded=[]) {
  const blocked=new Set(excluded);
  const result={};
  for(const [key,value] of Object.entries(source||{})) {
    if(blocked.has(key)||key.startsWith('nav')||value instanceof Set||typeof value==='function'||value===undefined) continue;
    try { result[key]=JSON.parse(JSON.stringify(value)); } catch (_) {}
  }
  return result;
}
function saveEntityIndex(map,entity) { return entity&&map.has(entity)?map.get(entity):null; }
function saveRepairTarget(entry,buildingIds,residentIds) {
  if(!entry?.entity) return null;
  if(entry.kind==='building') return {kind:'building',id:saveEntityIndex(buildingIds,entry.entity)};
  return {kind:'resident',id:saveEntityIndex(residentIds,entry.entity)};
}
function encodeFloorMask(mask) {
  const runs=[];
  if(!mask?.length) return runs;
  let value=mask[0]?1:0,count=1;
  for(let i=1;i<mask.length;i++) {
    const next=mask[i]?1:0;
    if(next===value) count++;
    else { runs.push(count,value);value=next;count=1; }
  }
  runs.push(count,value);
  return runs;
}
function decodeFloorMask(state,expectedSize) {
  if(Array.isArray(state.floorMaskRle)) {
    if(state.floorMaskRle.length%2!==0) throw new Error('存档地板数据损坏');
    const mask=new Uint8Array(expectedSize);
    let offset=0;
    for(let i=0;i<state.floorMaskRle.length;i+=2) {
      const count=state.floorMaskRle[i],value=state.floorMaskRle[i+1];
      if(!Number.isInteger(count)||count<=0||(value!==0&&value!==1)||offset+count>expectedSize) throw new Error('存档地板数据损坏');
      if(value) mask.fill(1,offset,offset+count);
      offset+=count;
    }
    if(offset!==expectedSize) throw new Error('存档地板数据损坏');
    return mask;
  }
  if(Array.isArray(state.floorMask)&&state.floorMask.length===expectedSize) return Uint8Array.from(state.floorMask);
  return new Uint8Array(expectedSize);
}
function compactResourceNodeRecord(node,buildingIds,residentIds) {
  const fields=copySaveFields(node,['ownerForester','claimedBy']);
  if(Number.isInteger(fields.col)&&Number.isInteger(fields.row)) { delete fields.x;delete fields.y; }
  if(fields.alive===true) delete fields.alive;
  if(fields.marked===false) delete fields.marked;
  if(fields.hp===1) delete fields.hp;
  const refs={};
  const ownerForester=saveEntityIndex(buildingIds,node.ownerForester),claimedBy=saveEntityIndex(residentIds,node.claimedBy);
  if(ownerForester!==null) refs.ownerForester=ownerForester;
  if(claimedBy!==null) refs.claimedBy=claimedBy;
  return Object.keys(refs).length?{fields,refs}:{fields};
}
function restoreResourceNodeFields(fields) {
  const node={alive:true,marked:false,...fields};
  if(Number.isInteger(node.col)&&Number.isInteger(node.row)) {
    const centered=node.type!=='stone'&&node.type!=='iron';
    if(!Number.isFinite(node.x)) node.x=gridX(node.col)+(centered?CFG.CELL/2:0);
    if(!Number.isFinite(node.y)) node.y=gridY(node.row)+(centered?CFG.CELL/2:0);
  }
  if(node.hp===undefined&&node.type!=='stone'&&node.type!=='iron') node.hp=1;
  return node;
}
function serializeGameState() {
  const buildingIds=new Map(G.buildings.map((entity,index)=>[entity,index]));
  const residentIds=new Map(G.residents.map((entity,index)=>[entity,index]));
  const enemyIds=new Map(G.enemies.map((entity,index)=>[entity,index]));
  const animalIds=new Map(G.animals.map((entity,index)=>[entity,index]));
  const nodeIds=new Map(G.resourceNodes.map((entity,index)=>[entity,index]));
  const groundItemIds=new Map(G.groundItems.map((entity,index)=>[entity,index]));
  const scalars={};
  for(const key of SAVE_STATE_SCALARS) scalars[key]=copySaveFields({value:G[key]}).value;
  return {
    scalars,
    gameSpeed,
    townHall:saveEntityIndex(buildingIds,G.townHall),
    floorMaskRle:encodeFloorMask(G.floorMask||[]),
    buildings:G.buildings.map(building=>({
      fields:copySaveFields(building,['outputHauler','inputHaulers','assignedGuard','assignedEngineer','repairTarget']),
      refs:{
        outputHauler:saveEntityIndex(residentIds,building.outputHauler),
        inputHaulers:[...(building.inputHaulers||[])].map(entity=>saveEntityIndex(residentIds,entity)).filter(id=>id!==null),
        assignedGuard:saveEntityIndex(residentIds,building.assignedGuard),
        assignedEngineer:saveEntityIndex(residentIds,building.assignedEngineer),
        repairTarget:saveRepairTarget(building.repairTarget,buildingIds,residentIds),
      }
    })),
    residents:G.residents.map(resident=>({
      fields:copySaveFields(resident,['workplace','home','carryingFrom','productionInputTarget','pickupTarget','buildTarget','chopTarget','huntTarget','plantTarget','assignedTower','manningTower','manualTargetEnemy']),
      refs:{
        workplace:saveEntityIndex(buildingIds,resident.workplace), home:saveEntityIndex(buildingIds,resident.home),
        carryingFrom:saveEntityIndex(buildingIds,resident.carryingFrom), productionInputTarget:saveEntityIndex(buildingIds,resident.productionInputTarget), buildTarget:saveEntityIndex(buildingIds,resident.buildTarget),
        pickupTarget:saveEntityIndex(groundItemIds,resident.pickupTarget), chopTarget:saveEntityIndex(nodeIds,resident.chopTarget),
        huntTarget:saveEntityIndex(animalIds,resident.huntTarget), plantTarget:saveEntityIndex(nodeIds,resident.plantTarget),
        assignedTower:saveEntityIndex(buildingIds,resident.assignedTower), manningTower:saveEntityIndex(buildingIds,resident.manningTower),
        manualTargetEnemy:saveEntityIndex(enemyIds,resident.manualTargetEnemy),
      }
    })),
    enemies:G.enemies.map(enemy=>({
      fields:copySaveFields(enemy,['attacking','fightingGuard','guardTarget']),
      refs:{attacking:saveEntityIndex(buildingIds,enemy.attacking),fightingGuard:saveEntityIndex(residentIds,enemy.fightingGuard),guardTarget:saveEntityIndex(residentIds,enemy.guardTarget)}
    })),
    animals:G.animals.map(animal=>({fields:copySaveFields(animal)})),
    resourceNodes:G.resourceNodes.map(node=>compactResourceNodeRecord(node,buildingIds,residentIds)),
    groundItems:G.groundItems.map(item=>({
      fields:copySaveFields(item,['claimedBy']),refs:{claimedBy:saveEntityIndex(residentIds,item.claimedBy)}
    })),
  };
}
function saveRef(list,id) { return Number.isInteger(id)&&id>=0&&id<list.length?list[id]:null; }
function restoreGameState(state) {
  if(!state||!Array.isArray(state.buildings)||!Array.isArray(state.residents)||!Array.isArray(state.resourceNodes)) throw new Error('存档内容不完整');
  const recordsValid=list=>Array.isArray(list)&&list.every(record=>record&&record.fields&&typeof record.fields==='object');
  if(!recordsValid(state.buildings)||!recordsValid(state.residents)||!recordsValid(state.resourceNodes)||
     !recordsValid(state.enemies||[])||!recordsValid(state.animals||[])||!recordsValid(state.groundItems||[])) throw new Error('存档实体数据损坏');
  const buildings=state.buildings.map(record=>{
    const type=record?.fields?.type;
    if(!BLD_DEFS[type]) throw new Error('存档包含未知建筑：'+String(type));
    const building=new Building(type,Number(record.fields.col)||0,Number(record.fields.row)||0);
    Object.assign(building,record.fields);building.inputHaulers=new Set();
    if(building.upgrading&&!building.upgradeTargetLevel) building.upgradeTargetLevel=Math.min(BLD_DEFS[type].maxLevel||1,building.level+1);
    if(building.upgrading&&!building.constructCost&&building.constructionTimer<=0) {
      building.constructionDuration=constructionWorkDuration(building);
      building.constructionTimer=Math.max(0.1,building.constructionDuration*(1-clamp(Number(building.upgradeProgress)||0,0,1)));
      building.upgradeProgress=0;
    }
    return building;
  });
  const townHall=saveRef(buildings,state.townHall)||buildings.find(building=>building.type==='town_hall')||null;
  const residents=(state.residents||[]).map(record=>{
    const resident=new Resident(Number(record?.fields?.x)||0,Number(record?.fields?.y)||0);
    Object.assign(resident,record.fields);clearNavigation(resident);return resident;
  });
  const animals=(state.animals||[]).map(record=>{
    const animal=new Animal(Number(record?.fields?.x)||0,Number(record?.fields?.y)||0);
    Object.assign(animal,record.fields);clearNavigation(animal);return animal;
  });
  const resourceNodes=(state.resourceNodes||[]).map(record=>restoreResourceNodeFields(record.fields));
  const groundItems=(state.groundItems||[]).map(record=>({...record.fields}));
  const enemies=(state.enemies||[]).map(record=>{
    const enemy=new Enemy(Number(record?.fields?.x)||0,Number(record?.fields?.y)||0,record?.fields?.type);
    Object.assign(enemy,record.fields);clearNavigation(enemy);return enemy;
  });
  for(let i=0;i<buildings.length;i++) {
    const building=buildings[i],refs=state.buildings[i].refs||{};
    const inputHaulerIds=refs.inputHaulers===undefined?[]:refs.inputHaulers;
    if(!Array.isArray(inputHaulerIds)) throw new Error('存档建筑引用数据损坏');
    building.outputHauler=saveRef(residents,refs.outputHauler);
    building.inputHaulers=new Set(inputHaulerIds.map(id=>saveRef(residents,id)).filter(Boolean));
    building.assignedGuard=saveRef(residents,refs.assignedGuard);
    building.assignedEngineer=saveRef(residents,refs.assignedEngineer);
    const repair=refs.repairTarget;
    building.repairTarget=repair?.kind==='building'&&saveRef(buildings,repair.id)?{kind:'building',entity:saveRef(buildings,repair.id)}:
      repair?.kind==='resident'&&saveRef(residents,repair.id)?{kind:'unit',entity:saveRef(residents,repair.id)}:null;
  }
  for(let i=0;i<residents.length;i++) {
    const resident=residents[i],refs=state.residents[i].refs||{};
    resident.workplace=saveRef(buildings,refs.workplace);resident.home=saveRef(buildings,refs.home);
    resident.carryingFrom=saveRef(buildings,refs.carryingFrom);resident.productionInputTarget=saveRef(buildings,refs.productionInputTarget);resident.buildTarget=saveRef(buildings,refs.buildTarget);
    resident.pickupTarget=saveRef(groundItems,refs.pickupTarget);resident.chopTarget=saveRef(resourceNodes,refs.chopTarget);
    resident.huntTarget=saveRef(animals,refs.huntTarget);resident.plantTarget=saveRef(resourceNodes,refs.plantTarget);
    resident.assignedTower=saveRef(buildings,refs.assignedTower);resident.manningTower=saveRef(buildings,refs.manningTower);
    resident.manualTargetEnemy=saveRef(enemies,refs.manualTargetEnemy);
  }
  for(let i=0;i<enemies.length;i++) {
    const refs=state.enemies[i].refs||{};
    enemies[i].attacking=saveRef(buildings,refs.attacking);enemies[i].fightingGuard=saveRef(residents,refs.fightingGuard);enemies[i].guardTarget=saveRef(residents,refs.guardTarget);
  }
  for(let i=0;i<resourceNodes.length;i++) {
    const refs=state.resourceNodes[i].refs||{};
    resourceNodes[i].ownerForester=saveRef(buildings,refs.ownerForester);resourceNodes[i].claimedBy=saveRef(residents,refs.claimedBy);
  }
  for(let i=0;i<groundItems.length;i++) groundItems[i].claimedBy=saveRef(residents,state.groundItems[i].refs?.claimedBy);
  for(const building of buildings) { building.assignedWorkers=0;building.residentCount=0;building.guardResidentCount=0; }
  for(const resident of residents) {
    if(resident.workplace&&!resident.isGuard) resident.workplace.assignedWorkers++;
    if(resident.home) resident.isGuard?resident.home.guardResidentCount++:resident.home.residentCount++;
  }
  const scalars=state.scalars||{};
  const scalarValues={};
  for(const key of SAVE_STATE_SCALARS) if(Object.prototype.hasOwnProperty.call(scalars,key)) scalarValues[key]=JSON.parse(JSON.stringify(scalars[key]));
  const expectedMaskSize=CFG.WORLD_COLS*CFG.WORLD_ROWS;
  const floorMask=decodeFloorMask(state,expectedMaskSize);
  G.buildings=buildings;G.townHall=townHall;
  G.residents=residents;G.animals=animals;G.resourceNodes=resourceNodes;G.resourceCellIndex=null;G.groundItems=groundItems;G.enemies=enemies;
  for(const key of Object.keys(scalarValues)) G[key]=scalarValues[key];
  G.floorMask=floorMask;
  G.particles=[];G.projectiles=[];G.commandMarkers=[];G.farmLinks=[];G.navigationQueue=[];
  G.selectedBldType=null;G.selectedBuilding=null;G.selectedGuard=null;G.selectedGuards=[];G.hoveredCell=null;
  G.placingMode=false;G.movingBuilding=null;G.dragging=false;G.dragButton=null;G.dragMoved=false;
  G.guardSelectStart=null;G.guardSelectEnd=null;G.guardSelectMoved=false;G.drawingFloor=false;G.lastFloorCell='';
  G.chopMode=false;G.unchopMode=false;G.huntMode=false;G.unhuntMode=false;G.fruitPlantMode=false;
  G.infiniteResources=false;G.debugRevealAllFog=false;G.debugShowNavigation=true;G.debugTimeLock=null;G.resourceFullNotices=new Set();G.targetedTrees=new Set(residents.map(resident=>resident.chopTarget).filter(Boolean));
  G.targetedAnimals=new Set(residents.map(resident=>resident.huntTarget).filter(Boolean));
  G.navigationRevision=0;G.obstacleIndexRevision=-1;G.obstacleSpatial=null;G.navigationGridRevision=-1;G.navigationGrid=null;G.residentSpatial=null;
  recalculatePopulationLimits();refreshFarmAdjacency();updateAllResourceTotals();initFog();refreshFogVisibility();
  G.buildingPanelDirty=true;gameRunning=true;setSpeed([0,1,2,4,10,20].includes(state.gameSpeed)?state.gameSpeed:1);
  const gameover=document.getElementById('gameover-overlay');if(gameover) gameover.style.display='none';
  const debugNavigationButton=document.getElementById('debug-navigation-btn');
  if(debugNavigationButton){debugNavigationButton.classList.add('active');debugNavigationButton.textContent='隐藏寻路';}
  if(typeof updateDebugTimeLockButtons==='function') updateDebugTimeLockButtons();
  if(typeof hideContextMenu==='function') hideContextMenu();
  if(typeof updateBuildingPanel==='function') updateBuildingPanel();
  if(typeof updateTopBar==='function') updateTopBar();
  return true;
}
function readSaveSlots() {
  try {
    const parsed=JSON.parse(localStorage.getItem(SAVE_STORAGE_KEY));
    if(parsed?.version===SAVE_VERSION&&Array.isArray(parsed.slots)) return Array.from({length:MAX_SAVE_SLOTS},(_,index)=>parsed.slots[index]||null);
  } catch (_) {}
  return Array(MAX_SAVE_SLOTS).fill(null);
}
function writeSaveSlots(slots) {
  localStorage.setItem(SAVE_STORAGE_KEY,JSON.stringify({version:SAVE_VERSION,slots:slots.slice(0,MAX_SAVE_SLOTS)}));
}
function saveGameToSlot(index) {
  if(!Number.isInteger(index)||index<0||index>=MAX_SAVE_SLOTS) return false;
  try {
    const slots=readSaveSlots();
    slots[index]={version:SAVE_VERSION,savedAt:new Date().toISOString(),day:G.day,phase:G.phase,totalTime:G.totalTime,state:serializeGameState()};
    writeSaveSlots(slots);renderSaveSlots();settingsSetStatus(`存档 ${index+1} 已保存。`,'ok');return true;
  } catch(error) {
    console.warn('Game save failed.',error);settingsSetStatus('保存失败：'+error.message,'error');return false;
  }
}
function loadGameFromSlot(index) {
  try {
    const slot=readSaveSlots()[index];
    if(!slot||slot.version!==SAVE_VERSION) throw new Error('该槽位没有可用存档');
    restoreGameState(slot.state);renderSaveSlots();settingsSetStatus(`已读取存档 ${index+1}。`,'ok');return true;
  } catch(error) {
    console.warn('Game load failed.',error);settingsSetStatus('读取失败：'+error.message,'error');return false;
  }
}
function deleteGameSave(index) {
  if(!Number.isInteger(index)||index<0||index>=MAX_SAVE_SLOTS) return false;
  try {
    const slots=readSaveSlots();slots[index]=null;writeSaveSlots(slots);renderSaveSlots();settingsSetStatus(`存档 ${index+1} 已删除。`,'ok');return true;
  } catch(error) { settingsSetStatus('删除失败：'+error.message,'error');return false; }
}
function savePhaseName(phase) { return ({day:'白天',dusk:'黄昏',night:'夜晚',dawn:'黎明'})[phase]||phase; }
function renderSaveSlots() {
  const container=document.getElementById('settings-save-slots');if(!container) return;
  const slots=readSaveSlots();container.innerHTML='';
  slots.forEach((slot,index)=>{
    const row=document.createElement('div');row.className='save-slot';
    const label=document.createElement('span');label.className='save-slot-label';label.textContent='存档 '+(index+1);
    const meta=document.createElement('span');meta.className='save-slot-meta';
    meta.textContent=slot?`第 ${slot.day} 天 · ${savePhaseName(slot.phase)} · ${new Date(slot.savedAt).toLocaleString()}`:'空槽位';
    const actions=document.createElement('div');actions.className='save-slot-actions';
    const saveButton=document.createElement('button');saveButton.textContent=slot?'覆盖':'保存';saveButton.onclick=()=>saveGameToSlot(index);
    const loadButton=document.createElement('button');loadButton.textContent='读取';loadButton.disabled=!slot;loadButton.onclick=()=>loadGameFromSlot(index);
    const deleteButton=document.createElement('button');deleteButton.textContent='删除';deleteButton.disabled=!slot;deleteButton.onclick=()=>deleteGameSave(index);
    actions.append(saveButton,loadButton,deleteButton);row.append(label,meta,actions);container.appendChild(row);
  });
}
