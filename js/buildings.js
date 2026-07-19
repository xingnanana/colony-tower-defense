function restorationUnitHealth(unit) {
  if(unit.isGuard) return {current:unit.guardHP,max:unit.guardMaxHP};
  if(Number.isFinite(unit.hp)&&Number.isFinite(unit.maxHp)) return {current:unit.hp,max:unit.maxHp};
  return null;
}
function restorationTargetPoint(entry) {
  if(!entry?.entity) return null;
  return entry.kind==='building' ? entry.entity.center() : {x:entry.entity.x,y:entry.entity.y};
}
function restorationTargetHealth(entry) {
  if(!entry?.entity) return null;
  return entry.kind==='building'
    ? {current:entry.entity.hp,max:entry.entity.maxHp}
    : restorationUnitHealth(entry.entity);
}
function restorationTargetValid(tower,entry) {
  if(!entry?.entity) return false;
  const entity=entry.entity;
  if(entry.kind==='building') {
    if(entity===tower||!G.buildings.includes(entity)||entity.ruin||entity.blueprint||entity.constructionTimer>0) return false;
  } else if(!G.residents.includes(entity)||entity.hidden) return false;
  const health=restorationTargetHealth(entry),point=restorationTargetPoint(entry);
  return !!health&&health.max>0&&health.current>0&&health.current<health.max&&
    Math.hypot(point.x-tower.center().x,point.y-tower.center().y)<=buildingRuntimeDef(tower).repairRange;
}
function findRestorationTarget(tower) {
  const center=tower.center(),range=buildingRuntimeDef(tower).repairRange;
  let best=null,bestRatio=Infinity,bestDistance=Infinity;
  const consider=(kind,entity,point,health)=>{
    if(!health||health.max<=0||health.current<=0||health.current>=health.max) return;
    const distance=Math.hypot(point.x-center.x,point.y-center.y);
    if(distance>range) return;
    const ratio=health.current/health.max;
    if(ratio<bestRatio-0.0001||(Math.abs(ratio-bestRatio)<=0.0001&&distance<bestDistance)) {
      best={kind,entity};bestRatio=ratio;bestDistance=distance;
    }
  };
  for(const building of G.buildings) {
    if(building===tower||building.ruin||building.blueprint||building.constructionTimer>0) continue;
    consider('building',building,building.center(),{current:building.hp,max:building.maxHp});
  }
  for(const unit of G.residents) {
    if(unit.hidden) continue;
    consider('unit',unit,{x:unit.x,y:unit.y},restorationUnitHealth(unit));
  }
  return best;
}
function updateRestorationTower(tower,dt) {
  if(tower.type!=='restoration_tower'||tower.ruin||tower.blueprint||tower.constructionTimer>0||tower.hp<=0) {
    tower.repairTarget=null;return;
  }
  if(!restorationTargetValid(tower,tower.repairTarget)) tower.repairTarget=findRestorationTarget(tower);
  const entry=tower.repairTarget;
  if(!entry) return;
  const def=buildingRuntimeDef(tower),multiplier=1+(tower.level-1)*(def.levelRepairBonus||0);
  if(entry.kind==='building') entry.entity.hp=Math.min(entry.entity.maxHp,entry.entity.hp+def.buildingRepairRate*multiplier*dt);
  else if(entry.entity.isGuard) entry.entity.guardHP=Math.min(entry.entity.guardMaxHP,entry.entity.guardHP+def.unitRepairRate*multiplier*dt);
  else entry.entity.hp=Math.min(entry.entity.maxHp,entry.entity.hp+def.unitRepairRate*multiplier*dt);
  if(!restorationTargetValid(tower,entry)) tower.repairTarget=null;
}

function updateBuildings(dt) {
  const activeWorkersByBuilding = new Map();
  const growingSaplingCount = new Map();
  for (const r of G.residents) {
    if (r.isGuard || r.state!=='WORKING' || !r.workplace) continue;
    if (!activeWorkersByBuilding.has(r.workplace)) activeWorkersByBuilding.set(r.workplace, []);
    activeWorkersByBuilding.get(r.workplace).push(r);
  }
  for (const node of G.resourceNodes) {
    if (!node.alive || node.type!=='sapling' || !node.ownerForester) continue;
    growingSaplingCount.set(node.ownerForester, (growingSaplingCount.get(node.ownerForester)||0)+1);
  }
  for (const b of G.buildings) {
    if (b.constructionTimer > 0) {
      const center=b.center();
      const activeEngineers=G.residents.filter(r=>r.isEngineer&&r.buildTarget===b&&r.state==='CONSTRUCTING'&&
        Math.hypot(r.x-center.x,r.y-center.y)<buildingInteractionRange(b));
      if (activeEngineers.length>0) {
        b.constructionTimer -= dt*activeEngineers.reduce((sum,engineer)=>sum+residentHungerMultiplier(engineer),0);
        if (b.constructionTimer <= 0) {
          b.constructionTimer=0;b.constructionDuration=0;b.assignedEngineer=null;
          if(b.upgrading) {
            const oldPop=houseCapacity(b),oldGuard=guardCapacity(b);
            b.level=Math.min(maxBuildingLevel(b.type),b.upgradeTargetLevel||b.level+1);
            b.upgrading=false;b.upgradeTargetLevel=0;b.upgradeProgress=0;
            b.maxHp=Math.floor(buildingLevelValue(b.type,b.level,'hp'));b.hp=b.maxHp;
            if(b.type==='house'||b.type==='town_hall') G.maxPop+=houseCapacity(b)-oldPop;
            if(b.type==='barracks'||b.type==='town_hall') G.maxGuards+=guardCapacity(b)-oldGuard;
            if(b.type==='town_hall') updateBuildingPanel();
            refreshFogVisibility();
            if(b.type==='farm') refreshFarmAdjacency();
            if(isStorage(b.type)) updateAllResourceTotals();
            playGameSound('upgrade',center.x,center.y);
          } else {
            b.hp=b.maxHp;
            if(b.type==='house') G.maxPop+=houseCapacity(b);
            if(b.type==='barracks') G.maxGuards+=guardCapacity(b);
            if(b.type==='farm') refreshFarmAdjacency();
            if(isStorage(b.type)) updateAllResourceTotals();
            playGameSound('complete',center.x,center.y);
          }
        }
      }
    }
    // Recruitment belongs to its dedicated building, not the town hall.
    const recruitDef=buildingRuntimeDef(b);
    if (recruitDef.recruits && b.recruitQueue > 0 && !b.blueprint && b.constructionTimer<=0 && b.hp>0) {
      const isGuard=recruitDef.recruits==='guard';
      if(residentCount(isGuard)>=(isGuard?G.maxGuards:G.maxPop)) continue;
      const activeRecruitWorkers=activeWorkersByBuilding.get(b)||[];
      const hasRecruitWorkers=b.type!=='nursery'||activeRecruitWorkers.length>=recruitDef.maxWorkers;
      if(!hasRecruitWorkers) continue;
      const recruitEfficiency=b.type==='nursery' ? activeRecruitWorkers.reduce((sum,worker)=>sum+residentHungerMultiplier(worker),0)/recruitDef.maxWorkers : 1;
      b.recruitProgress += dt / recruitDef.recruitTime*recruitEfficiency;
      if (b.recruitProgress >= 1) {
        b.recruitProgress = 0; b.recruitQueue--;
        const hc = b.center();
        const nr = new Resident(hc.x+(Math.random()-0.5)*40, hc.y+(Math.random()-0.5)*40);
        if (isGuard) {
          nr.isGuard = true;
          nr.state = (G.phase==='night'||G.phase==='dusk') ? 'GUARD_FIND_TOWER' : 'GUARD_SLEEPING';
          nr.hidden = (G.phase!=='night'&&G.phase!=='dusk');
        }
        G.residents.push(nr);
        playGameSound('complete',hc.x,hc.y);
        assignHome(nr, findNearestHome(nr, nr.isGuard));
        if(isGuard&&(G.phase==='night'||G.phase==='dusk')) wakeGuardAtHome(nr);
        if(b.type==='nursery'&&b.recruitQueue===0) releaseNurseryWorkers(b);
      }
    }
    // Production advances once per building, based on workers currently on site.
    const def = buildingRuntimeDef(b);
    if (def.cat === 'production' && b.type !== 'forester' && !b.blueprint && b.constructionTimer <= 0 && b.hp > 0) {
      const activeWorkers = activeWorkersByBuilding.get(b) || [];
      const workforce=activeWorkers.reduce((sum,worker)=>sum+residentHungerMultiplier(worker),0);
      const efficiency = def.maxWorkers > 0 ? Math.min(1, workforce / def.maxWorkers) : 0;
      const needsInputs=Object.values(def.inputs||{}).some(amount=>amount>0);
      if(needsInputs&&!b.productionRoundActive&&productionInputsReady(b)) b.productionRoundActive=true;
      if (efficiency > 0 && b.pendingOutput < productionBufferCapacity(b) && (!needsInputs||b.productionRoundActive)) {
        const adjacency = b.type === 'farm' ? getFarmAdjacencyBonus(b) : 1;
        b.productionProgress += dt / def.baseTime * efficiency * adjacency * productionSpeedMultiplier(b);
        if (b.productionProgress >= 1) {
          const sourceNode = def.sourceType ? findResourceNode(b, def.sourceType) : null;
          const hasSource = !def.sourceType || !!sourceNode;
          const hasInputs = !needsInputs || (hasSource&&consumeProductionInputs(b));
          if (hasSource && hasInputs) {
            b.productionProgress -= 1;
            b.pendingOutput++;
            if(b.pendingOutput>=productionBufferCapacity(b)) b.productionRoundActive=false;
          } else {
            if(needsInputs) b.productionRoundActive=false;
            b.productionProgress = 1;
          }
        }
      }
    }
    // Forester: automatically refill empty cells with staggered saplings.
    if (b.type==='forester' && !b.blueprint && b.constructionTimer<=0 && b.hp>0) {
      const def=buildingRuntimeDef(b), growthSlots=foresterGrowthSlots(b);
      if ((growingSaplingCount.get(b)||0) < growthSlots) {
        b.foresterPlantCooldown-=dt;
        if (b.foresterPlantCooldown<=0) {
          const cell=findForesterPlantCell(b);
          if (cell) {
            const growDuration=def.saplingGrowTime*(1+(Math.random()*2-1)*def.growJitter);
            addResourceNode({type:'sapling',col:cell.col,row:cell.row,x:cell.x,y:cell.y,hp:1,alive:true,marked:false,growTimer:growDuration,growDuration,ownerForester:b});
            growingSaplingCount.set(b,(growingSaplingCount.get(b)||0)+1);
            b.foresterPlantCooldown=foresterPlantInterval(b);
          } else {
            b.foresterPlantCooldown=1;
          }
        }
      }
    }
    if(b.type==='restoration_tower') updateRestorationTower(b,dt);
  }
  // Grow saplings
  updateWildTreeRegrowth(dt);
  for (const node of G.resourceNodes) {
    if ((node.type==='sapling'||node.type==='fruit_sapling') && node.alive) {
      node.growTimer -= dt;
      if (node.growTimer <= 0) {
        node.type = node.type==='fruit_sapling'?'fruit_tree':'tree'; node.marked = !!node.ownerForester;
      }
    }
  }
  G.resourceCleanupTimer += dt;
  if (G.resourceCleanupTimer >= 5) {
    G.resourceCleanupTimer = 0;
    G.resourceNodes = G.resourceNodes.filter(node => node.alive);
    invalidateResourceCellIndex();
  }
  for(const b of G.buildings) {
    if(b.hp>0||b.ruin) continue;
    if(b.type==='town_hall') { gameOver('大本营被摧毁！'); continue; }
    turnBuildingIntoRuin(b);
  }
}
