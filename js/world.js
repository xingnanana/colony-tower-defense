// ============================================================
// UTILITY
// ============================================================
function dist(a,b) { return Math.hypot(a.x-b.x, a.y-b.y); }
function lerp(a,b,t) { return a+(b-a)*t; }
function clamp(v,lo,hi) { return Math.max(lo,Math.min(hi,v)); }
function gridCol(px) { return Math.floor(px/CFG.CELL); }
function gridRow(py) { return Math.floor(py/CFG.CELL); }
function gridX(col) { return col*CFG.CELL; }
function gridY(row) { return row*CFG.CELL; }
function invalidateNavigation() { G.navigationRevision++; }

function fogIndex(col,row) { return col+row*CFG.WORLD_COLS; }
function initFog() { G.fogVisible=new Uint8Array(CFG.WORLD_COLS*CFG.WORLD_ROWS); G.fogUpdateTimer=0; }
function isFogCellVisible(col,row) {
  if (!G.fogVisible) return true;
  return col>=0&&row>=0&&col<CFG.WORLD_COLS&&row<CFG.WORLD_ROWS&&G.fogVisible[fogIndex(col,row)]===1;
}
function isWorldVisible(x,y) { return isFogCellVisible(gridCol(x),gridRow(y)); }
function revealFogCircle(x,y,radius) {
  const minCol=Math.max(0,gridCol(x-radius)), maxCol=Math.min(CFG.WORLD_COLS-1,gridCol(x+radius));
  const minRow=Math.max(0,gridRow(y-radius)), maxRow=Math.min(CFG.WORLD_ROWS-1,gridRow(y+radius));
  for(let col=minCol;col<=maxCol;col++) for(let row=minRow;row<=maxRow;row++) {
    const cx=gridX(col)+CFG.CELL/2, cy=gridY(row)+CFG.CELL/2;
    if (Math.hypot(cx-x,cy-y)<=radius) G.fogVisible[fogIndex(col,row)]=1;
  }
}
function buildingVisionRadius(b) {
  if (b.type==='town_hall'||b.type==='lamp') return buildingLevelValue(b.type,b.level,'vision')*CFG.CELL;
  return Math.hypot(b.size[0],b.size[1])*CFG.CELL/2;
}
function buildingFogRadius(b) {
  return (b.type==='town_hall'||b.type==='lamp') ? buildingVisionRadius(b) : 0;
}
function nightLightRadius(b) {
  return (b.type==='town_hall'||b.type==='lamp') ? buildingVisionRadius(b) : 0;
}
function buildingCoverage(type, level=1) {
  const def=BLD_DEFS[type];
  if (!def) return null;
  const value=key=>buildingLevelValue(type,level,key);
  if (type==='lamp') return {radius:value('vision')*CFG.CELL, fill:'rgba(255,211,102,0.11)', stroke:'rgba(255,223,127,0.78)', dash:[5,5]};
  if (type==='town_hall') return {radius:value('vision')*CFG.CELL, fill:'rgba(255,226,142,0.07)', stroke:'rgba(255,226,142,0.62)', dash:[7,5]};
  if (value('foresterRadius')) return {radius:value('foresterRadius')*CFG.CELL, fill:'rgba(100,255,100,0.06)', stroke:'rgba(100,255,100,0.42)', dash:[3,6]};
  if (value('sourceRadius')) return {radius:value('sourceRadius')*CFG.CELL, fill:'rgba(225,190,105,0.05)', stroke:'rgba(225,190,105,0.58)', dash:[5,5]};
  if (value('repairRange')) return {radius:value('repairRange'), fill:'rgba(89,224,211,0.07)', stroke:'rgba(112,235,221,0.68)', dash:[5,4]};
  if (value('range')) return {radius:value('range'), fill:'rgba(255,255,255,0.08)', stroke:'rgba(255,255,255,0.38)', dash:null};
  return null;
}
function refreshFogVisibility() {
  if (!G.fogVisible) initFog();
  if (G.debugRevealAllFog) { G.fogVisible.fill(1); return; }
  G.fogVisible.fill(0);
  for(const b of G.buildings) {
    if (b.hp<=0||b.blueprint||(b.constructionTimer>0&&!b.upgrading)) continue;
    const radius=buildingFogRadius(b);
    if(radius>0) { const c=b.center();revealFogCircle(c.x,c.y,radius); }
  }
}
function isStaticPatrolVisible(x,y) {
  for(const b of G.buildings) {
    if (b.hp<=0||b.blueprint||(b.constructionTimer>0&&!b.upgrading)) continue;
    const radius=buildingFogRadius(b);
    if(radius>0) { const c=b.center();if(Math.hypot(x-c.x,y-c.y)<=radius) return true; }
  }
  return false;
}
function updateFogVisibility(dt) {
  G.fogUpdateTimer+=dt;
  if (G.fogUpdateTimer<CFG.FOG_UPDATE_INTERVAL) return;
  G.fogUpdateTimer=0;
  refreshFogVisibility();
}

class SpatialHash {
  constructor(cellSize) { this.cellSize = cellSize; this.buckets = new Map(); }
  clear() { this.buckets.clear(); }
  key(col, row) { return col+','+row; }
  insert(item, minX, minY, maxX, maxY) {
    const minCol=Math.floor(minX/this.cellSize), maxCol=Math.floor(maxX/this.cellSize);
    const minRow=Math.floor(minY/this.cellSize), maxRow=Math.floor(maxY/this.cellSize);
    for (let col=minCol; col<=maxCol; col++) for (let row=minRow; row<=maxRow; row++) {
      const key=this.key(col,row);
      if (!this.buckets.has(key)) this.buckets.set(key,[]);
      this.buckets.get(key).push(item);
    }
  }
  query(minX, minY, maxX, maxY) {
    const found=[], seen=new Set();
    const minCol=Math.floor(minX/this.cellSize), maxCol=Math.floor(maxX/this.cellSize);
    const minRow=Math.floor(minY/this.cellSize), maxRow=Math.floor(maxY/this.cellSize);
    for (let col=minCol; col<=maxCol; col++) for (let row=minRow; row<=maxRow; row++) {
      const bucket=this.buckets.get(this.key(col,row));
      if (!bucket) continue;
      for (const item of bucket) if (!seen.has(item)) { seen.add(item); found.push(item); }
    }
    return found;
  }
}

function canAfford(cost) {
  for (const [k,v] of Object.entries(cost||{}))
    if ((G.resources[k]||0) < v) return false;
  return true;
}
function payCost(cost) {
  if (G.infiniteResources) return;
  for (const [k,v] of Object.entries(cost||{})) withdrawFromAnyStorage(k, v);
}
function productionSpeedMultiplier(b) {
  const def=buildingRuntimeDef(b);
  return 1+(b.level-1)*(def.levelSpeedBonus||0);
}
function productionBufferCapacity(b) {
  const def=buildingRuntimeDef(b);
  return (def.batchSize||1)+(b.level-1)*(def.levelBufferBonus||0);
}
function productionRoundRequirements(b) {
  const def=buildingRuntimeDef(b);
  const remaining=Math.max(0,productionBufferCapacity(b)-(b.pendingOutput||0));
  const requirements={};
  for(const [type,amount] of Object.entries(def.inputs||{})) {
    if(amount>0&&remaining>0) requirements[type]=amount*remaining;
  }
  return requirements;
}
function productionInputAmount(b,type) { return b.productionInputs?.[type]||0; }
function productionInputNeed(b,type) {
  return Math.max(0,(productionRoundRequirements(b)[type]||0)-productionInputAmount(b,type));
}
function reservedProductionInputAmount(b,type,{exclude=null,unwithdrawnOnly=false}={}) {
  return G.residents.reduce((total,resident)=>{
    if(resident===exclude||resident.productionInputTarget!==b||resident.productionInputType!==type) return total;
    if(unwithdrawnOnly&&resident.carrying) return total;
    return total+(resident.productionInputReservedAmount||0);
  },0);
}
function productionInputUnreservedNeed(b,type) {
  return Math.max(0,productionInputNeed(b,type)-reservedProductionInputAmount(b,type));
}
function availableProductionInputAmount(type) {
  let unwithdrawnReservations=0;
  for(const b of G.buildings) unwithdrawnReservations+=reservedProductionInputAmount(b,type,{unwithdrawnOnly:true});
  return Math.max(0,(G.resources[type]||0)-unwithdrawnReservations);
}
function productionInputsReady(b) {
  const requirements=productionRoundRequirements(b);
  const entries=Object.entries(requirements);
  return entries.length>0&&entries.every(([type,amount])=>productionInputAmount(b,type)>=amount);
}
function nextProductionInputType(b) {
  return Object.keys(productionRoundRequirements(b)).find(type=>productionInputUnreservedNeed(b,type)>0)||null;
}
function consumeProductionInputs(b) {
  const inputs=buildingRuntimeDef(b).inputs||{};
  if(!Object.entries(inputs).every(([type,amount])=>productionInputAmount(b,type)>=amount)) return false;
  for(const [type,amount] of Object.entries(inputs)) b.productionInputs[type]=productionInputAmount(b,type)-amount;
  return true;
}
function storageCapacity(b, type) {
  if (b.type==='town_hall'&&type) return G.infiniteResources
    ? Math.max(DEBUG_INFINITE_RESOURCE_AMOUNT,townHallResourceCapacity(type,b.level))
    : townHallResourceCapacity(type,b.level);
  if (type&&!storageAcceptsResource(b,type)) return 0;
  return buildingLevelValue(b.type,b.level,'capacity')||0;
}
function towerDamage(b) {
  return buildingLevelValue(b.type,b.level,'damage')||0;
}
function towerRange(b) {
  return buildingLevelValue(b.type,b.level,'range')||0;
}
function buildingDamageTaken(b, amount) {
  if (b.type!=='wall') return amount;
  const reduction=clamp((b.level-1)*(buildingRuntimeDef(b).levelDamageReduction||0),0,0.75);
  return amount*(1-reduction);
}
function buildingUpgradeSummary(b, next=false) {
  const level=b.level+(next?1:0);
  const levelLabel='Lv.'+level;
  const def=buildingRuntimeDef(b);
  if (def.cat==='production') return levelLabel+' 生产速度 '+Math.round((1+(level-1)*(def.levelSpeedBonus||0))*100)+'% | 暂存 '+((def.batchSize||1)+(level-1)*(def.levelBufferBonus||0));
  if (def.cat==='storage' && def.capacity) return levelLabel+' 容量 '+buildingLevelValue(b.type,level,'capacity');
  if (b.type==='arrow_tower') return levelLabel+' 伤害 '+Math.round(buildingLevelValue(b.type,level,'damage'));
  if (b.type==='auto_arrow_tower') return levelLabel+' 射程 '+buildingLevelValue(b.type,level,'range');
  if (b.type==='lamp') return levelLabel+' 视野 '+buildingLevelValue(b.type,level,'vision')+' 格';
  if (b.type==='restoration_tower') return levelLabel+' 修复效率 '+Math.round((1+(level-1)*(def.levelRepairBonus||0))*100)+'%';
  if (b.type==='wall') return levelLabel+' 减伤 '+Math.round(clamp((level-1)*(def.levelDamageReduction||0),0,0.75)*100)+'%';
  return null;
}
function storedAmount(b, type) { return b.stored[type] || 0; }
function storageAcceptsResource(b, type) { return !!b&&isResourceAvailable(type)&&isStorage(b.type)&&(b.type==='town_hall'||RESOURCE_STORAGE_TYPES[type]===b.type); }
function storageUsedSpace(b) { return Object.values(b.stored || {}).reduce((sum, value) => sum + value, 0); }
function storageFreeSpace(b, type) {
  if (!storageAcceptsResource(b,type)) return 0;
  if (b.type==='town_hall') return Math.max(0,storageCapacity(b,type)-storedAmount(b,type));
  return Math.max(0, storageCapacity(b,type) - storedAmount(b,type));
}
function resourceStorageStatus(type) {
  let capacity=0, stored=0;
  for(const b of G.buildings) {
    if(!storageAcceptsResource(b,type)||b.hp<=0||b.blueprint||b.constructionTimer>0) continue;
    capacity+=storageCapacity(b,type);
    stored+=storedAmount(b,type);
  }
  return {capacity,stored,full:capacity>0&&stored>=capacity-0.001};
}
function resourceStorageCapacity(type) { return resourceStorageStatus(type).capacity; }
function totalStorageFreeSpace(type) {
  const status=resourceStorageStatus(type);
  return Math.max(0,status.capacity-status.stored);
}
function availableGroundPickupSpace(type) {
  const reserved=G.residents.reduce((total,resident)=>total+(resident.state==='HAULING'&&resident.carrying?.type===type?resident.carrying.amount:0),0);
  return Math.max(0,totalStorageFreeSpace(type)-reserved);
}
function updateResourceTotal(type) {
  G.resources[type] = G.buildings.reduce((total, b) => total + (storageAcceptsResource(b,type) ? storedAmount(b, type) : 0), 0);
}
function updateAllResourceTotals() {
  for (const type of RESOURCE_TYPES) updateResourceTotal(type);
}
function depositToStorage(b, type, amount) {
  if (!storageAcceptsResource(b,type)) return 0;
  const deposited = Math.min(amount, storageFreeSpace(b, type));
  if (deposited <= 0) return 0;
  b.stored[type] = storedAmount(b, type) + deposited;
  G.resources[type] = (G.resources[type] || 0) + deposited;
  const center=b.center();playGameSound('deposit',center.x,center.y);
  return deposited;
}
function storeOrDropResources(resources, origin) {
  const point=typeof origin?.center==='function'?origin.center():origin;
  const x=Number.isFinite(point?.x)?point.x:0, y=Number.isFinite(point?.y)?point.y:0;
  for(const [type,total] of Object.entries(resources||{})) {
    let remaining=Math.max(0,total||0);
    const stores=G.buildings
      .filter(b=>b.hp>0&&!b.ruin&&!b.blueprint&&b.constructionTimer<=0&&storageAcceptsResource(b,type))
      .sort((a,b)=>Math.hypot(a.center().x-x,a.center().y-y)-Math.hypot(b.center().x-x,b.center().y-y));
    for(const store of stores) {
      remaining-=depositToStorage(store,type,remaining);
      if(remaining<=0) break;
    }
    if(remaining<=0) continue;
    const nearby=G.groundItems.find(item=>item.alive&&!item.claimedBy&&item.type===type&&Math.hypot(item.x-x,item.y-y)<=20);
    if(nearby) nearby.amount+=remaining;
    else G.groundItems.push({type,amount:remaining,x,y,alive:true,claimedBy:null});
  }
}
function withdrawFromStorage(b, type, amount) {
  if (!storageAcceptsResource(b,type)) return 0;
  const withdrawn = Math.min(amount, storedAmount(b, type));
  if (withdrawn <= 0) return 0;
  b.stored[type] = storedAmount(b, type) - withdrawn;
  G.resources[type] = Math.max(0, (G.resources[type] || 0) - withdrawn);
  return withdrawn;
}
function withdrawFromAnyStorage(type, amount) {
  let remaining = amount;
  for (const b of G.buildings) {
    if (!storageAcceptsResource(b,type) || remaining <= 0) continue;
    remaining -= withdrawFromStorage(b, type, remaining);
  }
  return amount - remaining;
}
function setStartingResource(type, amount) {
  if (!G.townHall) return;
  for (const b of G.buildings) if (isStorage(b.type)) b.stored[type] = 0;
  G.townHall.stored[type] = Math.max(0, amount);
  updateResourceTotal(type);
}

function initFloorMask() {
  G.floorMask = new Uint8Array(CFG.WORLD_COLS * CFG.WORLD_ROWS);
}
function paintFloorCell(col, row) {
  if (!G.floorMask) initFloorMask();
  const key = col + ',' + row;
  if (key === G.lastFloorCell) return;
  if ((G.resources.wood || 0) < 1) return;
  const def = BLD_DEFS.floor;
  for (let dc = 0; dc < def.sz[0]; dc++) for (let dr = 0; dr < def.sz[1]; dr++) {
    const nc = col - Math.floor(def.sz[0]/2) + dc, nr = row - Math.floor(def.sz[1]/2) + dr;
    if (nc < 0 || nr < 0 || nc >= CFG.WORLD_COLS || nr >= CFG.WORLD_ROWS || !isFogCellVisible(nc,nr)) return;
  }
  for (let dc = 0; dc < def.sz[0]; dc++) {
    for (let dr = 0; dr < def.sz[1]; dr++) {
      const nc = col - Math.floor(def.sz[0]/2) + dc, nr = row - Math.floor(def.sz[1]/2) + dr;
      if (nc < 0 || nr < 0 || nc >= CFG.WORLD_COLS || nr >= CFG.WORLD_ROWS) continue;
      G.floorMask[nc + nr * CFG.WORLD_COLS] = 1;
    }
  }
  payCost({wood:1});
  G.lastFloorCell = key;
}
function invalidateResourceCellIndex() { G.resourceCellIndex=null; }
function addResourceNode(node) {
  G.resourceNodes.push(node);
  invalidateResourceCellIndex();
  return node;
}
function ensureResourceCellIndex() {
  if(G.resourceCellIndex) return G.resourceCellIndex;
  const index=new Map();
  for(const node of G.resourceNodes) if(node.alive) index.set(node.col+node.row*CFG.WORLD_COLS,node);
  G.resourceCellIndex=index;
  return index;
}
function generateResources() {
  G.resourceNodes = [];
  invalidateResourceCellIndex();
  G.wildTreeTarget=null; G.wildTreeSpawnTimer=0;
  const townCenter=G.townHall ? G.townHall.center() : {x:CFG.WORLD_W/2,y:CFG.WORLD_H/2};
  const treeVisibleRadius=buildingLevelValue('town_hall',1,'vision');
  let visibleTrees=0;
  let attempts=0;
  while (visibleTrees<CFG.START_VISIBLE_TREE_MIN && attempts++<2000) {
    const col=Math.floor(Math.random()*CFG.WORLD_COLS), row=Math.floor(Math.random()*CFG.WORLD_ROWS);
    if (tryAddInitialResource('tree',col,row,townCenter,CFG.TREE_MIN_SPAWN_RADIUS,treeVisibleRadius)) visibleTrees++;
  }
  let treeCount=G.resourceNodes.filter(node=>node.type==='tree').length;
  while (treeCount<CFG.TREE_INITIAL_COUNT && attempts++<12000) {
    const added=spawnInitialResourceCluster('tree',townCenter,CFG.TREE_MIN_SPAWN_RADIUS,Infinity,CFG.TREE_CLUSTER_AVERAGE,CFG.TREE_CLUSTER_MAX,CFG.TREE_INITIAL_COUNT-treeCount);
    treeCount+=added;
  }
  for(let i=0;i<CFG.STONE_CLUSTER_COUNT;i++) {
    spawnInitialResourceCluster('stone',townCenter,CFG.STONE_MIN_SPAWN_RADIUS,Infinity,CFG.STONE_CLUSTER_AVERAGE,CFG.STONE_CLUSTER_MAX);
  }
  for(let i=0;i<CFG.IRON_CLUSTER_COUNT;i++) {
    spawnInitialResourceCluster('iron',townCenter,CFG.IRON_MIN_SPAWN_RADIUS,Infinity,CFG.IRON_CLUSTER_AVERAGE,CFG.IRON_CLUSTER_MAX);
  }
}
function findAnimalSpawnPoint(requireVisible=false) {
  const center=G.townHall?.center()||{x:CFG.WORLD_W/2,y:CFG.WORLD_H/2};
  for(let attempt=0;attempt<240;attempt++) {
    const angle=Math.random()*Math.PI*2;
    const radius=(2+Math.random()*10)*CFG.CELL;
    const x=clamp(center.x+Math.cos(angle)*radius,CFG.CELL,CFG.WORLD_W-CFG.CELL);
    const y=clamp(center.y+Math.sin(angle)*radius,CFG.CELL,CFG.WORLD_H-CFG.CELL);
    const col=gridCol(x),row=gridRow(y);
    if(isCellBlocked(col,row)||(requireVisible&&!isWorldVisible(x,y))) continue;
    if(G.animals.some(animal=>animal.alive&&Math.hypot(animal.x-x,animal.y-y)<CFG.CELL)) continue;
    return {x,y};
  }
  return null;
}
function spawnAnimal(requireVisible=false) {
  const point=findAnimalSpawnPoint(requireVisible);
  if(!point) return null;
  const animal=new Animal(point.x,point.y);G.animals.push(animal);return animal;
}
function generateAnimals() {
  G.animals=[];
  for(let i=0;i<CFG.ANIMAL_INITIAL_COUNT;i++) spawnAnimal(true);
  G.animalSpawnTimer=CFG.ANIMAL_RESPAWN_INTERVAL;
}
function randomVisibleAnimalDestination(animal,distance=100) {
  for(let attempt=0;attempt<12;attempt++) {
    const angle=Math.random()*Math.PI*2;
    const x=clamp(animal.x+Math.cos(angle)*distance,RESIDENT_RADIUS,CFG.WORLD_W-RESIDENT_RADIUS);
    const y=clamp(animal.y+Math.sin(angle)*distance,RESIDENT_RADIUS,CFG.WORLD_H-RESIDENT_RADIUS);
    if(isWorldVisible(x,y)&&!isCellBlocked(gridCol(x),gridRow(y))) return {x,y};
  }
  return {x:animal.x,y:animal.y};
}
function updateAnimalFacing(animal,moveX) {
  if(Math.abs(moveX)>0.05) animal.facingRight=moveX>0;
}
function updateAnimals(dt) {
  for(const animal of G.animals) {
    if(!animal.alive) continue;
    const previousX=animal.x,previousY=animal.y;
    const hunter=G.residents.find(resident=>resident.huntTarget===animal&&(resident.state==='GOING_TO_HUNT'||resident.state==='HUNTING'));
    if(hunter&&isWorldVisible(animal.x,animal.y)) {
      const dx=animal.x-hunter.x,dy=animal.y-hunter.y,distance=Math.hypot(dx,dy)||1;
      if(distance<95) {
        const fleeDistance=110;
        const fx=clamp(animal.x+dx/distance*fleeDistance,RESIDENT_RADIUS,CFG.WORLD_W-RESIDENT_RADIUS);
        const fy=clamp(animal.y+dy/distance*fleeDistance,RESIDENT_RADIUS,CFG.WORLD_H-RESIDENT_RADIUS);
        if(isWorldVisible(fx,fy)&&!isCellBlocked(gridCol(fx),gridRow(fy))) { animal.targetX=fx;animal.targetY=fy; }
      }
    } else {
      animal.wanderTimer-=dt;
      if(animal.wanderTimer<=0||Math.hypot(animal.x-animal.targetX,animal.y-animal.targetY)<8) {
        const target=randomVisibleAnimalDestination(animal,40+Math.random()*80);
        animal.targetX=target.x;animal.targetY=target.y;animal.wanderTimer=3+Math.random()*5;
      }
    }
    if(Math.hypot(animal.x-animal.targetX,animal.y-animal.targetY)>5) moveViaFlow(animal,animal.targetX,animal.targetY,CFG.ANIMAL_SPEED,dt);
    updateAnimalFacing(animal,animal.x-previousX);
  }
  G.animals=G.animals.filter(animal=>animal.alive);
  G.animalSpawnTimer-=dt;
  if(G.animalSpawnTimer<=0) {
    if(G.animals.length<CFG.ANIMAL_MAX_COUNT) spawnAnimal(false);
    G.animalSpawnTimer=CFG.ANIMAL_RESPAWN_INTERVAL*(0.75+Math.random()*0.5);
  }
}
function initialResourceDistance(col,row,townCenter) {
  const x=gridX(col)+CFG.CELL/2, y=gridY(row)+CFG.CELL/2;
  return Math.hypot(x-townCenter.x,y-townCenter.y)/CFG.CELL;
}
function tryAddInitialResource(type,col,row,townCenter,minRadius,maxRadius=Infinity) {
  if (col<0||row<0||col>=CFG.WORLD_COLS||row>=CFG.WORLD_ROWS) return false;
  const distance=initialResourceDistance(col,row,townCenter);
  if (distance<=minRadius||distance>maxRadius||isCellBlocked(col,row)) return false;
  const centered=type==='tree';
  addResourceNode({type,col,row,x:gridX(col)+(centered?CFG.CELL/2:0),y:gridY(row)+(centered?CFG.CELL/2:0),hp:centered?1:undefined,alive:true,marked:false});
  return true;
}
function randomBetween(min,max) { return min+Math.random()*(max-min); }
function wildTreeCount() {
  return G.resourceNodes.filter(node=>node.alive&&!node.ownerForester&&(node.type==='tree'||node.type==='sapling')).length;
}
function findWildTreePlantCell() {
  const townCenter=G.townHall ? G.townHall.center() : {x:CFG.WORLD_W/2,y:CFG.WORLD_H/2};
  for(let attempt=0;attempt<160;attempt++) {
    const col=Math.floor(Math.random()*CFG.WORLD_COLS), row=Math.floor(Math.random()*CFG.WORLD_ROWS);
    if(initialResourceDistance(col,row,townCenter)<=CFG.TREE_MIN_SPAWN_RADIUS||isCellBlocked(col,row)) continue;
    return {col,row,x:gridX(col)+CFG.CELL/2,y:gridY(row)+CFG.CELL/2};
  }
  return null;
}
function updateWildTreeRegrowth(dt) {
  const min=Math.max(0,Math.floor(CFG.TREE_WILD_MIN_COUNT));
  const max=Math.max(min,Math.floor(CFG.TREE_WILD_MAX_COUNT));
  const count=wildTreeCount();
  if(G.wildTreeTarget===null&&count<min) {
    G.wildTreeTarget=Math.floor(randomBetween(min,max+1));
    G.wildTreeSpawnTimer=randomBetween(CFG.WILD_TREE_SPAWN_INTERVAL_MIN,CFG.WILD_TREE_SPAWN_INTERVAL_MAX);
  }
  if(G.wildTreeTarget===null||count>=G.wildTreeTarget) {
    if(G.wildTreeTarget!==null&&count>=G.wildTreeTarget) G.wildTreeTarget=null;
    return;
  }
  G.wildTreeSpawnTimer-=dt;
  if(G.wildTreeSpawnTimer>0) return;
  const cell=findWildTreePlantCell();
  if(cell) {
    const growTimer=randomBetween(CFG.WILD_TREE_GROW_TIME_MIN,CFG.WILD_TREE_GROW_TIME_MAX);
    addResourceNode({type:'sapling',col:cell.col,row:cell.row,x:cell.x,y:cell.y,hp:1,alive:true,marked:false,growTimer,growDuration:growTimer,ownerForester:null});
  }
  G.wildTreeSpawnTimer=randomBetween(CFG.WILD_TREE_SPAWN_INTERVAL_MIN,CFG.WILD_TREE_SPAWN_INTERVAL_MAX);
}
function sampleClusterSize(average,max,rareClusterChance=0) {
  if (average<=1) {
    if (max>1&&Math.random()<rareClusterChance) return 2+Math.floor(Math.random()*(max-1));
    return 1;
  }
  const target=clamp(average,1,max);
  let low=-12, high=12;
  for(let pass=0;pass<24;pass++) {
    const lambda=(low+high)/2;
    let total=0, weighted=0;
    for(let n=1;n<=max;n++) { const weight=Math.exp(-lambda*(n-1)); total+=weight; weighted+=n*weight; }
    if (weighted/total>target) low=lambda; else high=lambda;
  }
  const lambda=(low+high)/2;
  let total=0;
  for(let n=1;n<=max;n++) total+=Math.exp(-lambda*(n-1));
  let roll=Math.random()*total;
  for(let n=1;n<=max;n++) { roll-=Math.exp(-lambda*(n-1)); if(roll<=0) return n; }
  return max;
}
function spawnInitialResourceCluster(type,townCenter,minRadius,maxRadius,average,max,limit=Infinity) {
  const count=Math.min(limit,sampleClusterSize(average,max,type==='iron'?CFG.IRON_RARE_CLUSTER_CHANCE:0));
  const baseCol=Math.floor(Math.random()*CFG.WORLD_COLS), baseRow=Math.floor(Math.random()*CFG.WORLD_ROWS);
  let added=0;
  for(let i=0;i<count;i++) {
    const spread=Math.max(1,Math.ceil(Math.sqrt(count)));
    const col=baseCol+Math.round((Math.random()-0.5)*spread*2);
    const row=baseRow+Math.round((Math.random()-0.5)*spread*2);
    if (tryAddInitialResource(type,col,row,townCenter,minRadius,maxRadius)) added++;
  }
  return added;
}
function clearChopCommand() {
  G.chopMode=false; G.unchopMode=false; G.huntMode=false; G.unhuntMode=false; G.fruitPlantMode=false;
  G.chopStartX=-1; G.chopStartY=-1; G.chopEndX=-1; G.chopEndY=-1;
  const chopButton=document.getElementById('chop-btn');
  const unchopButton=document.getElementById('unchop-btn');
  const huntButton=document.getElementById('hunt-btn'),unhuntButton=document.getElementById('unhunt-btn'),fruitButton=document.getElementById('fruit-btn');
  for(const button of [chopButton,unchopButton,huntButton,unhuntButton,fruitButton]) {
    if(!button) continue;
    button.classList.remove('active');button.style.background='';
  }
}
function clearBlueprintCommand() {
  G.selectedBldType=null; G.selectedBuilding=null; G.placingMode=false; G.movingBuilding=null;
  document.querySelectorAll('.bld-btn').forEach(button=>button.classList.remove('selected'));
}
function setSelectedGuards(guards) {
  G.selectedGuards=[...new Set(guards||[])].filter(guard=>guard?.isGuard&&!guard.hidden&&G.residents.includes(guard));
  G.selectedGuard=G.selectedGuards[0]||null;
}
function clearSelectedGuards() { setSelectedGuards([]); }
function toggleChopMode() {
  const activate=!G.chopMode;
  if (activate) clearBlueprintCommand();
  clearChopCommand(); G.chopMode=activate; G.drawingFloor=false;
  document.getElementById('chop-btn').classList.toggle('active',activate);
}
function toggleUnchopMode() {
  const activate=!G.unchopMode;
  if (activate) clearBlueprintCommand();
  clearChopCommand(); G.unchopMode=activate; G.drawingFloor=false;
  document.getElementById('unchop-btn').classList.toggle('active',activate);
}
function toggleFruitPlantMode() {
  const activate=!G.fruitPlantMode;
  if(activate) clearBlueprintCommand();
  clearChopCommand();G.fruitPlantMode=activate;G.drawingFloor=false;
  document.getElementById('fruit-btn').classList.toggle('active',activate);
}
function toggleHuntMode() {
  const activate=!G.huntMode;
  if(activate) clearBlueprintCommand();
  clearChopCommand();G.huntMode=activate;G.drawingFloor=false;
  document.getElementById('hunt-btn').classList.toggle('active',activate);
}
function toggleUnhuntMode() {
  const activate=!G.unhuntMode;
  if(activate) clearBlueprintCommand();
  clearChopCommand();G.unhuntMode=activate;G.drawingFloor=false;
  document.getElementById('unhunt-btn').classList.toggle('active',activate);
}
function canPlantFruitTree(col,row) {
  return isFogCellVisible(col,row)&&!isCellBlocked(col,row);
}
function plantFruitTree(col,row) {
  if(!canPlantFruitTree(col,row)) return false;
  addResourceNode({type:'fruit_planting',col,row,x:gridX(col)+CFG.CELL/2,y:gridY(row)+CFG.CELL/2,hp:1,alive:true,marked:false,claimedBy:null,plantProgress:0,requiredWood:CFG.FRUIT_TREE_WOOD_COST,deliveredWood:0,ownerForester:null});
  return true;
}
