function centerPlacement(type, col, row) {
  const def = BLD_DEFS[type];
  return { col: col - Math.floor(def.sz[0]/2), row: row - Math.floor(def.sz[1]/2) };
}
// World <-> Screen coordinate conversion
function worldToScreen(wx, wy) {
  return {
    x: (wx - G.cam.x) * G.cam.zoom + CFG.CANVAS_W/2,
    y: (wy - G.cam.y) * G.cam.zoom + CFG.CANVAS_H/2
  };
}
function screenToWorld(sx, sy) {
  return {
    x: (sx - CFG.CANVAS_W/2) / G.cam.zoom + G.cam.x,
    y: (sy - CFG.CANVAS_H/2) / G.cam.zoom + G.cam.y
  };
}

function pixelCenterPlacement(type, mx, my) {
  const def = BLD_DEFS[type];
  return {
    col: Math.round((mx - def.sz[0]*CFG.CELL/2) / CFG.CELL),
    row: Math.round((my - def.sz[1]*CFG.CELL/2) / CFG.CELL)
  };
}
function canPlaceBuilding(type, col, row, excludeBld) {
  const def = BLD_DEFS[type];
  for (let dc=0; dc<def.sz[0]; dc++)
    for (let dr=0; dr<def.sz[1]; dr++)
      if (!isFogCellVisible(col+dc,row+dr)||isCellBlocked(col+dc, row+dr, excludeBld)) return false;
  if (def.sourceType) {
    const preview = {
      type, col, row, x:gridX(col), y:gridY(row), size:def.sz,
      center() { return { x:this.x+def.sz[0]*CFG.CELL/2, y:this.y+def.sz[1]*CFG.CELL/2 }; }
    };
    if (!findResourceNode(preview, def.sourceType)) return false;
  }
  return true;
}

function isStorage(type) { return BLD_DEFS[type] && (BLD_DEFS[type].cat==='storage' || type==='town_hall'); }
const RESIDENT_RADIUS = 7;


function reservedConstructionMaterial(bp, type, excludeResident=null) {
  return G.residents.reduce((total,resident)=>{
    if(resident===excludeResident||resident.buildTarget!==bp||resident.carrying?.type!==type) return total;
    return total+Math.max(0,resident.carrying.amount||0);
  },0);
}
function neededMaterials(bp, excludeResident=null) {
  if (!bp.constructCost) return null;
  for (const [k, v] of Object.entries(bp.constructCost)) {
    const delivered = bp.constructDelivered[k] || 0;
    const reserved=reservedConstructionMaterial(bp,k,excludeResident);
    if (delivered+reserved < v) return { type: k, amount: v-delivered-reserved };
  }
  return null;
}
function assignedEngineerCount(building) {
  return G.residents.reduce((count,resident)=>count+(resident.isEngineer&&resident.buildTarget===building?1:0),0);
}
function findNearestBlueprint(resident, onlyUnstaffed=false) {
  let best = null, bestD = Infinity;
  for (const b of G.buildings) {
    if (!b.blueprint || b.hp <= 0 || (onlyUnstaffed&&assignedEngineerCount(b)>0)) continue;
    const need=neededMaterials(b);
    if (need && (G.resources[need.type]||0)<1) continue;
    if(!need) continue;
    const bc = b.center();
    const d = Math.hypot(resident.x - bc.x, resident.y - bc.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}
function findNearestConstruction(resident, onlyUnstaffed=false) {
  let best = null, bestD = Infinity;
  for (const b of G.buildings) {
    if (b.ruin || b.blueprint || b.hp <= 0 || b.constructionTimer <= 0 || (onlyUnstaffed&&assignedEngineerCount(b)>0)) continue;
    const bc=b.center();
    const d=Math.hypot(resident.x-bc.x,resident.y-bc.y);
    if (d<bestD) { bestD=d; best=b; }
  }
  return best;
}
function assignEngineerBuildTask(engineer) {
  if(!engineer?.isEngineer) return false;
  const construction=findNearestConstruction(engineer,true);
  if(construction) { engineer.buildTarget=construction;engineer.state='CONSTRUCTING';return true; }
  const blueprint=findNearestBlueprint(engineer,true);
  if(blueprint) { engineer.buildTarget=blueprint;engineer.state='GATHERING';return true; }
  const sharedConstruction=findNearestConstruction(engineer);
  if(sharedConstruction) { engineer.buildTarget=sharedConstruction;engineer.state='CONSTRUCTING';return true; }
  const sharedBlueprint=findNearestBlueprint(engineer);
  if(sharedBlueprint) { engineer.buildTarget=sharedBlueprint;engineer.state='GATHERING';return true; }
  return false;
}
function resolveCollisions(r, nx, ny) {
  ensureObstacleSpatialHash();
  for (const b of G.obstacleSpatial.query(nx,ny,nx,ny)) {
    if (b.resourceNode) {
      if (!isResourceObstacleNode(b.resourceNode)) continue;
    } else if (!buildingBlocksMovement(b)) continue;
    const c = b.center();
    if (!b.resourceNode && r.buildTarget === b) continue; // always allow approaching build target
    // Only allow leaving own home/workplace, not entering.
    if (!b.resourceNode && (r.workplace === b || r.home === b) &&
        Math.hypot(nx - c.x, ny - c.y) > Math.hypot(r.x - c.x, r.y - c.y)) continue;
    const minDist = b.collisionRadius() + RESIDENT_RADIUS;
    const dx = nx - c.x, dy = ny - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist < minDist && dist > 0.01) {
      nx = c.x + (dx / dist) * minDist;
      ny = c.y + (dy / dist) * minDist;
    }
  }
  const nearbyResidents=G.residentSpatial
    ? G.residentSpatial.query(nx-RESIDENT_RADIUS*2,ny-RESIDENT_RADIUS*2,nx+RESIDENT_RADIUS*2,ny+RESIDENT_RADIUS*2)
    : G.residents;
  for (const other of nearbyResidents) {
    if (other === r || other.hidden) continue;
    if (canPassArrivedFormationGuard(r,other)) continue;
    const minDist = RESIDENT_RADIUS * 2;
    const dx = nx - other.x, dy = ny - other.y;
    const dist = Math.hypot(dx, dy);
    if (dist < minDist && dist > 0.01) {
      // Push apart along collision axis
      const overlap = minDist - dist;
      nx += (dx / dist) * overlap * 0.5;
      ny += (dy / dist) * overlap * 0.5;
      // Slide: add perpendicular offset to help pass each other
      const px = -dy / dist;
      const py = dx / dist;
      nx += px * overlap * 0.3;
      ny += py * overlap * 0.3;
    }
  }
  nx = clamp(nx, RESIDENT_RADIUS, CFG.WORLD_W - RESIDENT_RADIUS);
  ny = clamp(ny, RESIDENT_RADIUS, CFG.WORLD_H - RESIDENT_RADIUS);
  return { x: nx, y: ny };
}
function findNearestStorage(pos, resType, options={}) {
  const { requireAmount=0, requireSpace=0 } = options;
  let best=null, bestD=Infinity;
  for (const b of G.buildings) {
    if (!storageAcceptsResource(b,resType) || b.hp<=0 || b.blueprint || b.constructionTimer>0) continue;
    if (requireAmount > 0 && storedAmount(b, resType) < requireAmount) continue;
    if (requireSpace > 0 && storageFreeSpace(b, resType) < requireSpace) continue;
    const access = b.center();
    const d=Math.hypot(pos.x-access.x, pos.y-access.y);
    if (d<bestD) { bestD=d; best=b; }
  }
  return best;
}

function findResourceNode(b, type) {
  const def = buildingRuntimeDef(b);
  if (!def.sourceType) return null;
  const center = b.center();
  const maxDist = (def.sourceRadius || 0) * CFG.CELL;
  let best = null, bestDist = Infinity;
  for (const node of G.resourceNodes) {
    if (!node.alive || node.type !== type) continue;
    const nodeX = node.x + (type === 'tree' ? 0 : CFG.CELL / 2);
    const nodeY = node.y + (type === 'tree' ? 0 : CFG.CELL / 2);
    const d = Math.hypot(center.x - nodeX, center.y - nodeY);
    if (d <= maxDist && d < bestDist) { best = node; bestDist = d; }
  }
  return best;
}

function canResidentHandHarvest(node) {
  // Trees are the only natural resource residents can harvest directly.
  return !!node && node.alive && (node.type === 'tree'||node.type==='fruit_tree');
}
function harvestStorageAvailable(resident,node) {
  if(totalStorageFreeSpace('wood')<1) return false;
  return node?.type!=='fruit_tree'||totalStorageFreeSpace('food')>=CFG.FRUIT_TREE_FOOD_MAX;
}
function nextQueuedCarry(resident) {
  const next=resident.carryQueue?.shift();
  if(!next) return false;
  resident.carrying=next;resident.carryingFrom=null;resident.state='HAULING';return true;
}
function dropGroundItem(resident) {
  if(!resident.carrying||resident.carrying.amount<=0) return null;
  const item={type:resident.carrying.type,amount:resident.carrying.amount,x:resident.x,y:resident.y,alive:true,claimedBy:null};
  G.groundItems.push(item);
  resident.carrying=null;resident.carryingFrom=null;resident.dropCarryingWhenBlocked=false;
  return item;
}
function releaseGroundPickup(resident) {
  if(resident.pickupTarget?.claimedBy===resident) resident.pickupTarget.claimedBy=null;
  resident.pickupTarget=null;
}
function releaseFruitPlanting(resident) {
  if(resident.plantTarget?.claimedBy===resident) resident.plantTarget.claimedBy=null;
  resident.plantTarget=null;resident.plantTimer=0;resident.carryingForPlanting=false;
}
function fruitPlantingWoodNeed(node) {
  return Math.max(0,(node.requiredWood??CFG.FRUIT_TREE_WOOD_COST)-(node.deliveredWood||0));
}
function fruitPlantingWoodInTransit(node) {
  return G.residents.reduce((total,resident)=>total+(resident.plantTarget===node&&resident.carryingForPlanting&&resident.carrying?.type==='wood'?resident.carrying.amount:0),0);
}
function reservedFruitPlantingWood() {
  return G.resourceNodes.reduce((total,node)=>{
    if(!node.alive||node.type!=='fruit_planting'||!node.claimedBy) return total;
    return total+Math.max(0,fruitPlantingWoodNeed(node)-fruitPlantingWoodInTransit(node));
  },0);
}
function canFundFruitPlanting(node) {
  const need=fruitPlantingWoodNeed(node);
  return need<=0||(G.resources.wood||0)-reservedFruitPlantingWood()>=need;
}
function findNearestFruitPlanting(resident) {
  let best=null,bestDistance=Infinity;
  for(const node of G.resourceNodes) {
    if(!node.alive||node.type!=='fruit_planting'||node.claimedBy||!isWorldVisible(node.x,node.y)||!canFundFruitPlanting(node)) continue;
    const distance=Math.hypot(resident.x-node.x,resident.y-node.y);
    if(distance<bestDistance){bestDistance=distance;best=node;}
  }
  return best;
}
function completeFruitPlanting(node) {
  if(!node||!node.alive||node.type!=='fruit_planting'||fruitPlantingWoodNeed(node)>0) return false;
  const growDuration=CFG.FRUIT_TREE_GROW_TIME_MIN+Math.random()*(CFG.FRUIT_TREE_GROW_TIME_MAX-CFG.FRUIT_TREE_GROW_TIME_MIN);
  node.type='fruit_sapling';node.claimedBy=null;node.plantProgress=undefined;node.requiredWood=undefined;node.deliveredWood=undefined;node.growTimer=growDuration;node.growDuration=growDuration;
  return true;
}
function findNearestGroundItem(resident) {
  let best=null,bestDistance=Infinity;
  for(const item of G.groundItems) {
    if(!item.alive||item.claimedBy||!isWorldVisible(item.x,item.y)) continue;
    if(availableGroundPickupSpace(item.type)<1) continue;
    const distance=Math.hypot(resident.x-item.x,resident.y-item.y);
    if(distance<bestDistance){bestDistance=distance;best=item;}
  }
  return best;
}

function isFinishableResidentTask(r) {
  return r.state==='CHOPPING' || r.state==='HAULING' || r.state==='GATHERING' ||
    r.state==='BUILDING' || r.state==='CONSTRUCTING' || r.state==='HUNTING' ||
    r.state==='GOING_TO_PLANT_MATERIAL' || r.state==='DELIVERING_PLANT_MATERIAL' || r.state==='PLANTING' ||
    r.state==='DELIVERING_PRODUCTION_INPUT';
}
function beginEating(r) {
  if ((G.resources.food||0) <= 0) return false;
  releaseGroundPickup(r);
  releaseFruitPlanting(r);
  releaseProductionInputTask(r);
  const storage=findNearestStorage(r, 'food', {requireAmount:1});
  if (storage) {
    r.state='GOING_TO_EAT';
    const sc=storage.center(); r.targetX=sc.x; r.targetY=sc.y;
  } else {
    r.state='EATING'; r.eatTimer=1.5;
  }
  return true;
}
function eatAfterFinishingTask(r) {
  if (!r.finishBeforeEating || !r.mealPending) return false;
  r.finishBeforeEating=false;
  return beginEating(r);
}

function findForesterTree(r, forester) {
  if (!forester || forester.type!=='forester' || forester.hp<=0) return null;
  const carryCapacity=productionBufferCapacity(forester);
  const carried=r.carrying?.amount||0;
  if (totalStorageFreeSpace('wood')<Math.max(1,carryCapacity-carried)) return null;
  const radius = (buildingRuntimeDef(forester).foresterRadius || 4) * CFG.CELL;
  const center = forester.center();
  let best=null, bestDist=Infinity;
  for (const node of G.resourceNodes) {
    if (!node.alive || node.type!=='tree' || !node.marked || node.ownerForester!==forester) continue;
    if (Math.hypot(node.x-center.x,node.y-center.y)>radius) continue;
    if (G.targetedTrees.has(node) && r.chopTarget!==node) continue;
    const d=Math.hypot(r.x-node.x,r.y-node.y);
    if (d<bestDist) { best=node; bestDist=d; }
  }
  return best;
}
function foresterGrowthSlots(b) {
  const def=buildingRuntimeDef(b);
  return Math.max(1, Math.ceil(def.maxWorkers * def.saplingGrowTime / (def.chopTime/productionSpeedMultiplier(b))));
}
function foresterPlantInterval(b) {
  return buildingRuntimeDef(b).saplingGrowTime / foresterGrowthSlots(b);
}
function findForesterPlantCell(b) {
  const def=buildingRuntimeDef(b), radius=(def.foresterRadius||4)*CFG.CELL, center=b.center();
  const candidates=[];
  const minCol=Math.max(0,Math.floor((center.x-radius)/CFG.CELL)), maxCol=Math.min(CFG.WORLD_COLS-1,Math.floor((center.x+radius)/CFG.CELL));
  const minRow=Math.max(0,Math.floor((center.y-radius)/CFG.CELL)), maxRow=Math.min(CFG.WORLD_ROWS-1,Math.floor((center.y+radius)/CFG.CELL));
  for(let col=minCol;col<=maxCol;col++) for(let row=minRow;row<=maxRow;row++) {
    const x=gridX(col)+CFG.CELL/2, y=gridY(row)+CFG.CELL/2;
    if (Math.hypot(x-center.x,y-center.y)>radius-CFG.CELL*0.5 || isCellBlocked(col,row)) continue;
    candidates.push({col,row,x,y});
  }
  return candidates.length ? candidates[Math.floor(Math.random()*candidates.length)] : null;
}
function maxBuildingLevel(type) {
  const th = G.townHall;
  const cap=BLD_DEFS[type]?.maxLevel||1;
  return type==='town_hall' ? cap : Math.min(th ? th.level : 1,cap);
}

function houseCapacity(h) {
  if (h.type==='town_hall') return CFG.MAX_POP_BASE + (h.level-1)*4;
  if (h.type==='house') return buildingLevelValue('house',h.level,'popBonus');
  if (h.type==='barracks') return buildingLevelValue('barracks',h.level,'guardBonus');
  return 0;
}
function guardCapacity(h) {
  if (h.type==='town_hall') return CFG.MAX_GUARD_BASE;
  return h.type==='barracks' ? houseCapacity(h) : 0;
}
function recalculatePopulationLimits() {
  G.maxPop=0; G.maxGuards=0;
  for (const b of G.buildings) {
    if (b.blueprint||b.constructionTimer>0||b.hp<=0) continue;
    if (b.type==='town_hall'||b.type==='house') G.maxPop+=houseCapacity(b);
    if (b.type==='town_hall'||b.type==='barracks') G.maxGuards+=guardCapacity(b);
  }
}
function findNearestHome(pos, isGuard=false, excludeBld=null) {
  let best=null, bestD=Infinity;
  for (const b of G.buildings) {
    const validHome=isGuard ? (b.type==='town_hall'||b.type==='barracks') : (b.type==='town_hall'||b.type==='house');
    if (!validHome || b===excludeBld || b.ruin || b.blueprint || b.constructionTimer>0 || b.hp<=0) continue;
    const capacity=isGuard ? guardCapacity(b) : houseCapacity(b);
    const occupied=isGuard ? (b.guardResidentCount||0) : b.residentCount;
    if (occupied >= capacity) continue;
    const cx=b.x+BLD_DEFS[b.type].sz[0]*CFG.CELL/2;
    const cy=b.y+BLD_DEFS[b.type].sz[1]*CFG.CELL/2;
    const d=Math.hypot(pos.x-cx, pos.y-cy);
    if (d<bestD) { bestD=d; best=b; }
  }
  return best;
}

function getFarmAdjacencyBonus(b) {
  return b.type === 'farm' && !b.blueprint ? (b.farmAdjacencyBonus || 1) : 1;
}
function refreshFarmAdjacency() {
  const farms = G.buildings.filter(b => b.type === 'farm' && b.hp > 0 && !b.blueprint && b.constructionTimer <= 0);
  G.farmLinks = [];
  for (const farm of farms) farm.farmAdjacencyBonus = 1;
  for (let i=0; i<farms.length; i++) {
    for (let j=i+1; j<farms.length; j++) {
      const a=farms[i], b=farms[j];
      const horizontal = a.row === b.row && (a.col + 2 === b.col || b.col + 2 === a.col);
      const vertical = a.col === b.col && (a.row + 2 === b.row || b.row + 2 === a.row);
      if (!horizontal && !vertical) continue;
      a.farmAdjacencyBonus += 0.15;
      b.farmAdjacencyBonus += 0.15;
      G.farmLinks.push([a,b]);
    }
  }
}
function getIdleResidents() {
  return G.residents.filter(r=>(r.state==='IDLE'||r.state==='PATROL') && !r.workplace && !r.isEngineer && !r.isGuard);
}
function isIndependentWoodTask(r) {
  if(!r||r.workplace||r.isEngineer||r.isGuard) return false;
  if((r.state==='GOING_TO_CHOP'||r.state==='CHOPPING')&&r.chopTarget&&!r.chopTarget.ownerForester) return true;
  return r.state==='HAULING'&&r.carrying?.type==='wood'&&!r.carryingFrom;
}
function getAssignableResidents() {
  return [...getIdleResidents(),...G.residents.filter(isIndependentWoodTask)];
}
function assignResidentToWorkplace(worker,b) {
  if(!worker||!b||worker.workplace||b.assignedWorkers>=buildingRuntimeDef(b).maxWorkers) return false;
  const finishingWoodTask=isIndependentWoodTask(worker);
  worker.workplace=b;
  worker.finishCurrentChopForWork=finishingWoodTask;
  if(!finishingWoodTask) worker.state='GOING_TO_WORK';
  b.assignedWorkers++;
  return true;
}
function residentCount(isGuard) {
  return G.residents.filter(r=>r.isGuard===isGuard).length;
}
function queuedRecruitCount(role) {
  return G.buildings.reduce((sum,b)=>sum+(!b.ruin&&b.hp>0&&buildingRuntimeDef(b).recruits===role?(b.recruitQueue||0):0),0);
}
function availableRecruitSlots(role) {
  const isGuard=role==='guard';
  const capacity=isGuard ? G.maxGuards : G.maxPop;
  return capacity-residentCount(isGuard)-queuedRecruitCount(role);
}
function releaseNurseryWorkers(nursery) {
  if(!nursery||nursery.type!=='nursery') return 0;
  let released=0;
  for(const resident of G.residents) {
    if(resident.isGuard||resident.workplace!==nursery) continue;
    resident.workplace=null;
    resident.finishCurrentChopForWork=false;
    resident.chopTarget=null;
    resident.state=resident.carrying?'HAULING':'IDLE';
    released++;
  }
  nursery.assignedWorkers=0;
  return released;
}
function cancelNurseryRecruit(nursery) {
  if(!nursery||nursery.type!=='nursery'||nursery.recruitQueue<=0) return false;
  nursery.recruitQueue--;
  if(nursery.recruitQueue===0) {
    nursery.recruitProgress=0;
    releaseNurseryWorkers(nursery);
  }
  return true;
}
function assignHome(r, house) {
  if (r.home && r.home.hp>0) {
    if (r.isGuard) r.home.guardResidentCount=Math.max(0,(r.home.guardResidentCount||0)-1);
    else r.home.residentCount=Math.max(0,r.home.residentCount-1);
  }
  r.home = house;
  if (house) {
    if (r.isGuard) house.guardResidentCount=(house.guardResidentCount||0)+1;
    else house.residentCount++;
  }
}
function removeHome(r) {
  if (r.home) {
    if (r.isGuard) r.home.guardResidentCount=Math.max(0,(r.home.guardResidentCount||0)-1);
    else r.home.residentCount=Math.max(0,r.home.residentCount-1);
  }
  r.home = null;
}
function validGuardHome(home) {
  return !!(home&&!home.ruin&&!home.blueprint&&home.constructionTimer<=0&&home.hp>0&&(home.type==='town_hall'||home.type==='barracks'));
}
function ensureGuardHome(guard) {
  if(validGuardHome(guard.home)) return guard.home;
  if(guard.home) assignHome(guard,null);
  const home=findNearestHome(guard,true)||((G.townHall&&G.townHall.hp>0)?G.townHall:null);
  if(home) assignHome(guard,home);
  return home;
}
function guardHomeSpawnPoint(guard,home) {
  const center=home.center();
  const residents=G.residents.filter(resident=>resident.isGuard&&resident.home===home);
  const index=Math.max(0,residents.indexOf(guard));
  const angle=(index%8)*Math.PI/4+Math.PI/2;
  const radius=home.collisionRadius()+RESIDENT_RADIUS+5+Math.floor(index/8)*RESIDENT_RADIUS*2;
  return {
    x:clamp(center.x+Math.cos(angle)*radius,RESIDENT_RADIUS,CFG.WORLD_W-RESIDENT_RADIUS),
    y:clamp(center.y+Math.sin(angle)*radius,RESIDENT_RADIUS,CFG.WORLD_H-RESIDENT_RADIUS),
  };
}
function wakeGuardAtHome(guard) {
  const home=ensureGuardHome(guard);
  if(home) {
    const spawn=guardHomeSpawnPoint(guard,home);
    guard.x=spawn.x;guard.y=spawn.y;
  }
  clearNavigation(guard);guard.patrolTarget=null;guard.formationCommandId=0;
  guard.controlMode='auto';guard.manualTarget=null;guard.manualTargetEnemy=null;
  guard.hidden=false;guard.guardHP=guard.guardMaxHP;guard.guardHealTimer=0;
  guard.state='GUARD_FIND_TOWER';
  return home;
}
function sendGuardHomeForDay(guard) {
  const home=ensureGuardHome(guard);
  clearNavigation(guard);guard.patrolTarget=null;guard.formationCommandId=0;
  guard.controlMode='auto';guard.manualTarget=null;guard.manualTargetEnemy=null;
  if(guard.manningTower) guard.manningTower=null;
  guard.hidden=false;
  if(!home) { guard.state='GUARD_SLEEPING';guard.hidden=true;return null; }
  const center=home.center();guard.targetX=center.x;guard.targetY=center.y;
  guard.state='GUARD_GOING_HOME';
  return home;
}
function returnCarriedOutput(r) {
  const source = r.carryingFrom;
  if (r.carrying && source && source.hp > 0) {
    source.pendingOutput += r.carrying.amount;
    if (source.outputHauler === r) source.outputHauler = null;
  }
  r.carrying = null;
  r.carryingFrom = null;
}
function releaseProductionInputTask(r) {
  const target=r?.productionInputTarget;
  target?.inputHaulers?.delete(r);
  if(r) {
    r.productionInputTarget=null;
    r.productionInputType=null;
    r.productionInputReservedAmount=0;
  }
}
function returnCarriedProductionInput(r) {
  const target=r?.productionInputTarget;
  if(!target||target.hp<=0||!r.carrying||r.carrying.type!==r.productionInputType) return false;
  target.productionInputs[r.carrying.type]=productionInputAmount(target,r.carrying.type)+r.carrying.amount;
  r.carrying=null;
  releaseProductionInputTask(r);
  if(productionInputsReady(target)) target.productionRoundActive=true;
  return true;
}
function removeResident(r) {
  releaseGroundPickup(r);
  releaseFruitPlanting(r);
  const returnedProductionInput=returnCarriedProductionInput(r);
  if(!returnedProductionInput) {
    releaseProductionInputTask(r);
    if(r.dropCarryingWhenBlocked) dropGroundItem(r); else returnCarriedOutput(r);
  }
  if (r.workplace) {
    r.workplace.assignedWorkers = Math.max(0, r.workplace.assignedWorkers - 1);
    if (r.workplace.outputHauler === r) r.workplace.outputHauler = null;
  }
  if (r.assignedTower && r.assignedTower.assignedGuard === r) r.assignedTower.assignedGuard = null;
  if (r.manningTower && r.manningTower.assignedGuard === r) r.manningTower.assignedGuard = null;
  for (const enemy of G.enemies) {
    if (enemy.fightingGuard === r) enemy.fightingGuard = null;
    if (enemy.guardTarget === r) enemy.guardTarget = null;
  }
  if (G.selectedGuards.includes(r)) setSelectedGuards(G.selectedGuards.filter(guard=>guard!==r));
  if (r.buildTarget?.assignedEngineer===r) r.buildTarget.assignedEngineer = null;
  r.hidden = true;
  removeHome(r);
  G.residents = G.residents.filter(other => other !== r);
}
