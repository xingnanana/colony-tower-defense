function updateResidents(dt) {
  rebuildResidentSpatialHash();
  G.targetedTrees = new Set(G.residents.map(r=>r.chopTarget).filter(Boolean));
  G.targetedAnimals = new Set(G.residents.map(r=>r.huntTarget).filter(Boolean));

  for (const r of G.residents) {
    if (r.state==='SLEEPING') {
      if (G.phase==='day'||G.phase==='dawn') { r.state='IDLE'; r.hidden=false; }
      continue;
    }
    if (r.state==='GUARD_SLEEPING') {
      if (G.phase==='day'||G.phase==='dawn') { r.guardHP = r.guardMaxHP; }
      continue;
    }

    // === Guard AI ===
    if (r.isGuard) {
      guardUpdateAI(r, dt);
      continue;
    }
    activatePendingEngineer(r);

    // Priority 1: scheduled meal
    if (r.mealPending && r.state!=='GOING_TO_EAT' && r.state!=='EATING') {
      if (r.finishBeforeEating) {
        if (!isFinishableResidentTask(r)) eatAfterFinishingTask(r);
      } else if (isFinishableResidentTask(r)) {
        r.finishBeforeEating=true;
      } else {
        beginEating(r);
      }
    }
    if(r.starved) continue;

    // Priority 2: return home after work at dusk or night.
    if ((G.phase==='dusk'||G.phase==='night') && r.state!=='GOING_HOME' && r.state!=='SLEEPING'
        && r.state!=='GOING_TO_EAT' && r.state!=='EATING' && !r.finishBeforeEating && !r.pendingEngineer) {
      const home = r.home || findNearestHome(r, r.isGuard);
      if (home) {
        releaseGroundPickup(r);
        releaseFruitPlanting(r);
        releaseProductionInputTask(r);
        if(r.carrying) { r.state='HAULING'; }
        else r.state = 'GOING_HOME';
        const hc = home.center();
        if(!r.carrying) { r.targetX = hc.x; r.targetY = hc.y;assignHome(r, home); }
      }
    }

    const canRecoverGroundItem=(G.phase==='day'||G.phase==='dawn')&&!r.isEngineer&&!r.carrying&&!r.mealPending&&
      (r.state==='IDLE'||r.state==='PATROL'||r.state==='GOING_TO_WORK'||r.state==='WORKING');
    if(canRecoverGroundItem) claimNearestGroundItem(r);

    // Execute state
    switch (r.state) {
      case 'GOING_TO_EAT': {
        // Recalculate target each frame
        const storage = findNearestStorage(r, 'food', {requireAmount:1});
        if (!storage) { r.state='EATING'; r.eatTimer=0.5; break; }
        setBuildingInteractionTarget(r,storage);
        if (residentReachedBuilding(r,storage)) { r.state='EATING'; r.eatTimer=1.5; }
        else { moveViaFlow(r, r.targetX, r.targetY, CFG.RESIDENT_SPEED, dt); }
        break;
      }
      case 'EATING':
        if ((r.eatTimer-=dt)<=0) {
          const mealCost=residentMealCost(r);
          const consumed=withdrawFromAnyStorage('food',Math.min(mealCost,G.resources.food||0));
          if (consumed>0) completeResidentMeal(r,consumed);
          else recordMissedMeal(r);
          r.state = (G.phase==='night'||G.phase==='dusk') ? 'IDLE'
            : r.carrying?'HAULING' : r.workplace?'GOING_TO_WORK':'IDLE';
        }
        break;
      case 'GOING_HOME': {
        const home = r.home || findNearestHome(r, r.isGuard);
        if (home) setBuildingInteractionTarget(r,home);
        if (home && residentReachedBuilding(r,home)) { clearNavigation(r);r.state='SLEEPING'; r.hidden=true; }
        else { moveViaFlow(r, r.targetX, r.targetY, CFG.RESIDENT_SPEED, dt); }
        break;
      }
      case 'GOING_TO_WORK': {
        if (!r.workplace||r.workplace.hp<=0) { r.state='IDLE'; r.workplace=null; break; }
        const wc=workplaceInteriorPoint(r,r.workplace);
        const travelPoint=workplaceTravelPoint(r,r.workplace);
        r.targetX=travelPoint.x;r.targetY=travelPoint.y;
        const arrived=Math.hypot(r.x-wc.x,r.y-wc.y)<6;
        if (arrived) { r.state='WORKING'; r.prodTimer=0; }
        else { moveViaFlow(r,travelPoint.x,travelPoint.y,CFG.RESIDENT_SPEED,dt); }
        break;
      }
      case 'WORKING': {
        if (!r.workplace||r.workplace.hp<=0) { r.state='IDLE'; r.workplace=null; break; }
        const b=r.workplace, def=BLD_DEFS[b.type];
        const workPoint=workplaceInteriorPoint(r,b);
        r.targetX=workPoint.x;r.targetY=workPoint.y;
        if(Math.hypot(r.x-workPoint.x,r.y-workPoint.y)>4) moveViaFlow(r,workPoint.x,workPoint.y,CFG.RESIDENT_SPEED*0.5,dt);
        if (b.type==='forester') {
          if (r.carrying && r.carrying.amount >= productionBufferCapacity(b)) { r.state='HAULING'; break; }
          const tree=findForesterTree(r,b);
          if (tree) {
            r.chopTarget=tree; r.targetX=tree.x; r.targetY=tree.y; r.state='GOING_TO_CHOP';
            G.targetedTrees.add(tree);
          }
          else if (r.carrying) r.state='HAULING';
          break;
        }
        if (r.carrying) { r.state='HAULING'; break; }
        const batchCapacity=productionBufferCapacity(b);
        if (b.pendingOutput >= batchCapacity && !b.outputHauler) {
          const batch = batchCapacity;
          const storage = findNearestStorage(r, def.produces, {requireSpace:1});
          b.pendingOutput -= batch;
          b.outputHauler = r;
          r.state = 'HAULING';
          r.carrying = { type:def.produces, amount:batch };
          r.carryingFrom = b;
          if(storage) { const sc=storage.center();r.targetX=sc.x;r.targetY=sc.y; }
          else { r.targetX=r.x;r.targetY=r.y; }
          break;
        }
        if (def.inputs && !b.productionRoundActive && b.pendingOutput < batchCapacity) {
          const inputType=Object.keys(productionRoundRequirements(b)).find(type=>
            productionInputUnreservedNeed(b,type)>0&&availableProductionInputAmount(type)>0&&findNearestStorage(r,type,{requireAmount:1})
          )||null;
          const reserveAmount=inputType?Math.min(5,productionInputUnreservedNeed(b,inputType),availableProductionInputAmount(inputType)):0;
          if (inputType && reserveAmount>0) {
            b.inputHaulers.add(r);
            r.productionInputTarget=b;
            r.productionInputType=inputType;
            r.productionInputReservedAmount=reserveAmount;
            r.state='GOING_TO_PRODUCTION_INPUT';
          } else if (!inputType && productionInputsReady(b)) {
            b.productionRoundActive=true;
          }
        }
        break;
      }
      case 'GOING_TO_PRODUCTION_INPUT': {
        const b=r.productionInputTarget, inputType=r.productionInputType;
        if(!b||b.hp<=0||b.ruin||r.workplace!==b||!inputType) {
          releaseProductionInputTask(r);r.state=r.carrying?'HAULING':(r.workplace?'GOING_TO_WORK':'IDLE');break;
        }
        const need=Math.min(r.productionInputReservedAmount||0,productionInputNeed(b,inputType));
        if(need<=0) {
          releaseProductionInputTask(r);
          if(productionInputsReady(b)) b.productionRoundActive=true;
          r.state='GOING_TO_WORK';break;
        }
        const storage=findNearestStorage(r,inputType,{requireAmount:1});
        if(!storage) { releaseProductionInputTask(r);r.state='GOING_TO_WORK';break; }
        setBuildingInteractionTarget(r,storage);
        if(residentReachedBuilding(r,storage)) {
          const amount=withdrawFromStorage(storage,inputType,need);
          if(amount<=0) { releaseProductionInputTask(r);r.state='GOING_TO_WORK';break; }
          r.productionInputReservedAmount=amount;
          r.carrying={type:inputType,amount};
          r.state='DELIVERING_PRODUCTION_INPUT';
        } else moveViaFlow(r,sc.x,sc.y,CFG.RESIDENT_SPEED,dt);
        break;
      }
      case 'DELIVERING_PRODUCTION_INPUT': {
        const b=r.productionInputTarget;
        if(!b||b.hp<=0||b.ruin||r.workplace!==b||!r.carrying) {
          releaseProductionInputTask(r);r.state=r.carrying?'HAULING':(r.workplace?'GOING_TO_WORK':'IDLE');break;
        }
        const bc=workplaceInteriorPoint(r,b),travelPoint=workplaceTravelPoint(r,b);r.targetX=travelPoint.x;r.targetY=travelPoint.y;
        if(Math.hypot(r.x-bc.x,r.y-bc.y)<6) {
          b.productionInputs[r.carrying.type]=productionInputAmount(b,r.carrying.type)+r.carrying.amount;
          r.carrying=null;
          releaseProductionInputTask(r);
          if(productionInputsReady(b)) b.productionRoundActive=true;
          if(!eatAfterFinishingTask(r)) r.state='WORKING';
        } else moveViaFlow(r,travelPoint.x,travelPoint.y,CFG.RESIDENT_SPEED,dt);
        break;
      }
      case 'HAULING': {
        if (!r.carrying) {
          r.carryingFrom=null;r.dropCarryingWhenBlocked=false;
          if(nextQueuedCarry(r)) break;
          finishHaulingTask(r);break;
        }
        const storage = findNearestStorage(r, r.carrying.type, {requireSpace:1});
        if (!storage) {
          dropGroundItem(r);
          if(!nextQueuedCarry(r)) finishHaulingTask(r);
          break;
        }
        setBuildingInteractionTarget(r,storage);
        if (residentReachedBuilding(r,storage)) {
          const deposited = depositToStorage(storage, r.carrying.type, r.carrying.amount);
          r.carrying.amount -= deposited;
          if (r.carrying.amount > 0) {
            if(totalStorageFreeSpace(r.carrying.type)<1) {
              dropGroundItem(r);
              if(!nextQueuedCarry(r)) finishHaulingTask(r);
            }
            break;
          }
          const source = r.carryingFrom;
          if (source && source.outputHauler === r) source.outputHauler = null;
          r.carrying=null;
          r.carryingFrom=null;
          r.dropCarryingWhenBlocked=false;
          if(nextQueuedCarry(r)) break;
          finishHaulingTask(r);
        } else { moveViaFlow(r, r.targetX, r.targetY, CFG.RESIDENT_SPEED, dt); }
        break;
      }
      case 'GOING_TO_CHOP': {
        if (!r.chopTarget || !r.chopTarget.alive || !r.chopTarget.marked) {
          r.chopTarget=null;r.finishCurrentChopForWork=false;
          r.state=r.workplace&&r.workplace.hp>0?'GOING_TO_WORK':'IDLE';break;
        }
        const ctx = r.chopTarget.x, cty = r.chopTarget.y;
        if (Math.hypot(r.x - ctx, r.y - cty) < RESIDENT_RADIUS + 10) { r.state = 'CHOPPING'; r.chopTimer = 0; r.chopShakeBeat = -1; }
        else moveViaFlow(r, ctx, cty, CFG.RESIDENT_SPEED, dt);
        break;
      }
      case 'CHOPPING': {
        if (!r.chopTarget || !r.chopTarget.alive || !r.chopTarget.marked) {
          r.chopTarget=null;r.finishCurrentChopForWork=false;
          r.state=r.workplace&&r.workplace.hp>0?'GOING_TO_WORK':'IDLE';break;
        }
        r.chopTimer += dt*residentHungerMultiplier(r);
        const shakeBeat=Math.floor(r.chopTimer/0.55);
        if (shakeBeat !== r.chopShakeBeat) {
          r.chopShakeBeat=shakeBeat;
          r.chopTarget.shakeUntil=G.totalTime+0.12;
          playGameSound('chop',r.chopTarget.x,r.chopTarget.y);
        }
        const forester=!r.finishCurrentChopForWork&&r.workplace&&r.workplace.type==='forester' ? r.workplace : {type:'forester',level:1};
        const chopTime=Math.max(0.1,Number(CFG.TREE_CHOP_TIME)||3)/productionSpeedMultiplier(forester);
        if (r.chopTimer >= chopTime) {
          const carryCapacity=productionBufferCapacity(r.finishCurrentChopForWork?{level:1}:(r.workplace||{level:1}));
          const harvestedNode=r.chopTarget;
          r.chopTarget.alive = false; r.chopTarget.marked = false; invalidateResourceCellIndex();
          G.treesChopped++;
          G.buildingPanelDirty=true;
          spawnParticles(r.chopTarget.x, r.chopTarget.y, '#8B4513', 5);
          playGameSound('tree_fall',r.chopTarget.x,r.chopTarget.y);
          const woodYield=Math.max(1,Math.floor(CFG.TREE_WOOD_YIELD||1));
          if (!r.carrying) r.carrying = { type: 'wood', amount: woodYield };
          else r.carrying.amount+=woodYield;
          if(harvestedNode.type==='fruit_tree') {
            const foodAmount=Math.floor(CFG.FRUIT_TREE_FOOD_MIN+Math.random()*(CFG.FRUIT_TREE_FOOD_MAX-CFG.FRUIT_TREE_FOOD_MIN+1));
            r.carryQueue.push({type:'food',amount:foodAmount});
          }
          r.chopTarget = null;
          const nextTree = r.finishCurrentChopForWork ? null : findForesterTree(r, r.workplace);
          r.state = !r.finishBeforeEating && nextTree && r.carrying.amount < carryCapacity ? 'WORKING' : 'HAULING';
          if (r.state === 'HAULING') {
            const storage=findNearestStorage(r,'wood',{requireSpace:1});
            if(storage) { const sc=storage.center();r.targetX=sc.x;r.targetY=sc.y; }
            else { r.targetX=r.x;r.targetY=r.y; }
          }
        }
        break;
      }
      case 'GOING_TO_HUNT': {
        const animal=r.huntTarget;
        if(!animal||!animal.alive||!animal.marked||!isWorldVisible(animal.x,animal.y)) {
          r.huntTarget=null;r.state='IDLE';break;
        }
        r.targetX=animal.x;r.targetY=animal.y;
        if(Math.hypot(r.x-animal.x,r.y-animal.y)<RESIDENT_RADIUS+animal.size+7) { r.state='HUNTING';r.huntAttackTimer=0; }
        else moveViaFlow(r,animal.x,animal.y,CFG.RESIDENT_SPEED,dt);
        break;
      }
      case 'GOING_TO_PICKUP': {
        const item=r.pickupTarget;
        if(!item||!item.alive||item.claimedBy!==r||!isWorldVisible(item.x,item.y)||availableGroundPickupSpace(item.type)<1) {
          releaseGroundPickup(r);r.state='IDLE';break;
        }
        const access=groundItemInteractionPoint(r,item);r.targetX=access.x;r.targetY=access.y;
        if(residentReachedGroundItem(r,item,access)) {
          const takeAmount=Math.min(item.amount,availableGroundPickupSpace(item.type));
          r.carrying={type:item.type,amount:takeAmount};r.dropCarryingWhenBlocked=true;
          item.amount-=takeAmount;item.alive=item.amount>0;item.claimedBy=null;r.pickupTarget=null;r.state='HAULING';
        } else moveViaFlow(r,access.x,access.y,CFG.RESIDENT_SPEED,dt);
        break;
      }
      case 'GOING_TO_PLANT_MATERIAL': {
        const node=r.plantTarget;
        if(!node||!node.alive||node.type!=='fruit_planting'||node.claimedBy!==r||!isWorldVisible(node.x,node.y)) {
          releaseFruitPlanting(r);r.state=r.carrying?'HAULING':'IDLE';break;
        }
        const need=fruitPlantingWoodNeed(node)-fruitPlantingWoodInTransit(node);
        if(need<=0) { r.state='GOING_TO_PLANT';break; }
        const storage=findNearestStorage(r,'wood',{requireAmount:1});
        if(!storage) { releaseFruitPlanting(r);r.state='PATROL';break; }
        setBuildingInteractionTarget(r,storage);
        if(residentReachedBuilding(r,storage)) {
          const amount=Math.min(5,need,storedAmount(storage,'wood'));
          if(amount<=0) { releaseFruitPlanting(r);r.state='PATROL';break; }
          r.carrying={type:'wood',amount};r.carryingForPlanting=true;r.dropCarryingWhenBlocked=true;
          withdrawFromStorage(storage,'wood',amount);r.state='DELIVERING_PLANT_MATERIAL';
        } else moveViaFlow(r,r.targetX,r.targetY,CFG.RESIDENT_SPEED,dt);
        break;
      }
      case 'DELIVERING_PLANT_MATERIAL': {
        const node=r.plantTarget;
        if(!node||!node.alive||node.type!=='fruit_planting'||node.claimedBy!==r||!r.carryingForPlanting||r.carrying?.type!=='wood') {
          releaseFruitPlanting(r);r.state=r.carrying?'HAULING':'IDLE';break;
        }
        r.targetX=node.x;r.targetY=node.y;
        if(Math.hypot(r.x-node.x,r.y-node.y)<RESIDENT_RADIUS+9) {
          node.deliveredWood=(node.deliveredWood||0)+r.carrying.amount;
          r.carrying=null;r.carryingForPlanting=false;r.dropCarryingWhenBlocked=false;
          r.state=fruitPlantingWoodNeed(node)>0?'GOING_TO_PLANT_MATERIAL':'GOING_TO_PLANT';
        } else moveViaFlow(r,node.x,node.y,CFG.RESIDENT_SPEED,dt);
        break;
      }
      case 'GOING_TO_PLANT': {
        const node=r.plantTarget;
        if(!node||!node.alive||node.type!=='fruit_planting'||node.claimedBy!==r||!isWorldVisible(node.x,node.y)) {
          releaseFruitPlanting(r);r.state='IDLE';break;
        }
        if(fruitPlantingWoodNeed(node)>0) { r.state='GOING_TO_PLANT_MATERIAL';break; }
        r.targetX=node.x;r.targetY=node.y;
        if(Math.hypot(r.x-node.x,r.y-node.y)<RESIDENT_RADIUS+9) { r.state='PLANTING';r.plantTimer=0; }
        else moveViaFlow(r,node.x,node.y,CFG.RESIDENT_SPEED,dt);
        break;
      }
      case 'PLANTING': {
        const node=r.plantTarget;
        if(!node||!node.alive||node.type!=='fruit_planting'||node.claimedBy!==r) {
          releaseFruitPlanting(r);r.state='IDLE';break;
        }
        if(fruitPlantingWoodNeed(node)>0) { r.state='GOING_TO_PLANT_MATERIAL';break; }
        node.plantProgress=(node.plantProgress||0)+dt*residentHungerMultiplier(r);r.plantTimer=node.plantProgress;
        if(node.plantProgress>=CFG.FRUIT_TREE_PLANT_TIME) {
          completeFruitPlanting(node);r.plantTarget=null;r.plantTimer=0;
          if(!eatAfterFinishingTask(r)) r.state='IDLE';
        }
        break;
      }
      case 'HUNTING': {
        const animal=r.huntTarget;
        if(!animal||!animal.alive||!animal.marked||!isWorldVisible(animal.x,animal.y)) {
          r.huntTarget=null;r.state='IDLE';break;
        }
        r.targetX=animal.x;r.targetY=animal.y;
        const distance=Math.hypot(r.x-animal.x,r.y-animal.y);
        if(distance>RESIDENT_RADIUS+animal.size+9) { r.state='GOING_TO_HUNT';break; }
        r.huntAttackTimer-=dt*residentHungerMultiplier(r);
        if(r.huntAttackTimer<=0) {
          r.huntAttackTimer=0.7;animal.hp--;
          spawnParticles(animal.x,animal.y,'#b98962',2);
          if(animal.hp<=0) {
            animal.alive=false;animal.marked=false;
            const foodAmount=Math.floor(CFG.ANIMAL_FOOD_MIN+Math.random()*(CFG.ANIMAL_FOOD_MAX-CFG.ANIMAL_FOOD_MIN+1));
            r.carrying={type:'food',amount:foodAmount};r.dropCarryingWhenBlocked=true;r.huntTarget=null;r.state='HAULING';
          }
        }
        break;
      }
      case 'GATHERING': {
        if (!r.buildTarget || r.buildTarget.hp <= 0) { if(r.buildTarget?.assignedEngineer===r)r.buildTarget.assignedEngineer=null; r.buildTarget=null; r.state='IDLE'; break; }
        const need = neededMaterials(r.buildTarget,r);
        if (!need) { if(r.buildTarget.constructionTimer>0){r.state='CONSTRUCTING';}else{if(r.buildTarget.assignedEngineer===r)r.buildTarget.assignedEngineer=null;r.buildTarget=null;if(!eatAfterFinishingTask(r))r.state=(r.workplace&&r.workplace.hp>0)?'GOING_TO_WORK':'IDLE';} break; }
        const gs = findNearestStorage(r, need.type, {requireAmount:1});
        if (!gs) { if(r.buildTarget.assignedEngineer===r)r.buildTarget.assignedEngineer=null; r.buildTarget=null; r.state='PATROL'; break; }
        setBuildingInteractionTarget(r,gs);
        if (residentReachedBuilding(r,gs)) {
          const take = Math.min(5, need.amount, storedAmount(gs, need.type));
          if (take <= 0) break;
          if (!r.carrying) r.carrying = { type: need.type, amount: 0 };
          r.carrying.type = need.type; r.carrying.amount = take;
          withdrawFromStorage(gs, need.type, take);
          r.state = 'BUILDING'; break;
        }
        moveViaFlow(r, r.targetX, r.targetY, CFG.RESIDENT_SPEED, dt);
        break;
      }
      case 'BUILDING': {
        if (!r.buildTarget || r.buildTarget.hp <= 0) { if(r.buildTarget?.assignedEngineer===r)r.buildTarget.assignedEngineer=null; r.buildTarget=null; r.state=r.carrying?'HAULING':'IDLE'; break; }
        const bc=r.buildTarget.center(),access=buildingInteractionPoint(r,r.buildTarget);r.targetX=access.x;r.targetY=access.y;
        if (Math.hypot(r.x-bc.x, r.y-bc.y) < buildingInteractionRange(r.buildTarget)) {
          if (r.carrying && r.carrying.amount > 0) {
            const t = r.carrying.type;
            r.buildTarget.constructDelivered[t] = (r.buildTarget.constructDelivered[t]||0) + r.carrying.amount;
            r.carrying = null;
            let done = true;
            for (const [k, v] of Object.entries(r.buildTarget.constructCost)) {
              if ((r.buildTarget.constructDelivered[k]||0) < v) { done = false; break; }
            }
            if (done) {
              beginBuildingConstruction(r.buildTarget);
              r.state = 'CONSTRUCTING';
              break;
            }
          }
          r.state = 'GATHERING'; break;
        }
        moveViaFlow(r, r.targetX, r.targetY, CFG.RESIDENT_SPEED, dt);
        break;
      }
      case 'CONSTRUCTING': {
        if (!r.buildTarget || r.buildTarget.hp <= 0 || r.buildTarget.constructionTimer <= 0) {
          if (r.buildTarget?.assignedEngineer===r) r.buildTarget.assignedEngineer = null;
          r.buildTarget = null;
          if (eatAfterFinishingTask(r)) break;
          if(!assignEngineerBuildTask(r)) r.state='IDLE';
          break;
        }
        const cc=r.buildTarget.center(),access=buildingInteractionPoint(r,r.buildTarget);
        r.targetX=access.x;r.targetY=access.y;
        if (Math.hypot(r.x-cc.x, r.y-cc.y) < buildingInteractionRange(r.buildTarget)) {
          // Stay near building while timer counts down
        } else {
          moveViaFlow(r,access.x,access.y,CFG.RESIDENT_SPEED,dt);
        }
        break;
      }
      case 'GOING_TO_REPAIR': {
        const target=r.buildTarget;
        if(G.phase!=='day'||!target||target.ruin||target.hp<=0||target.hp>=target.maxHp) {
          if(target) target.assignedEngineer=null;
          r.buildTarget=null; r.state='IDLE'; break;
        }
        const center=target.center(),access=buildingInteractionPoint(r,target);r.targetX=access.x;r.targetY=access.y;
        if(Math.hypot(r.x-center.x,r.y-center.y)<buildingInteractionRange(target)) r.state='REPAIRING';
        else moveViaFlow(r,access.x,access.y,CFG.RESIDENT_SPEED,dt);
        break;
      }
      case 'REPAIRING': {
        const target=r.buildTarget;
        if(G.phase!=='day'||!target||target.ruin||target.hp<=0||target.hp>=target.maxHp) {
          if(target) target.assignedEngineer=null;
          r.buildTarget=null; r.state='IDLE'; break;
        }
        target.hp=Math.min(target.maxHp,target.hp+CFG.ENGINEER_REPAIR_RATE*dt*residentHungerMultiplier(r));
        break;
      }
      default: { // IDLE / PATROL
        if (G.phase==='night' || G.phase==='dusk') {
          const home = r.home || findNearestHome(r, r.isGuard);
          if (home) { r.state='GOING_HOME'; r.targetX=home.center().x; r.targetY=home.center().y; }
          else r.state='SLEEPING';
          break;
        }
        if (r.workplace && r.workplace.hp>0) { r.state='GOING_TO_WORK'; break; }
        if (r.isEngineer) {
          if (r.buildTarget && r.buildTarget.hp>0 && r.buildTarget.constructionTimer>0) { r.state='CONSTRUCTING'; break; }
          const unstaffedConstruction=findNearestConstruction(r,true);
          if (unstaffedConstruction) { r.buildTarget=unstaffedConstruction;r.state='CONSTRUCTING';break; }
          if(G.phase==='day') {
            const repairTarget=findNearestRepairTarget(r);
            if(repairTarget) { r.buildTarget=repairTarget; repairTarget.assignedEngineer=r; r.state='GOING_TO_REPAIR'; break; }
          }
          if(assignEngineerBuildTask(r)) break;
        }
        if(!r.isEngineer) {
          const planting=findNearestFruitPlanting(r);
          if(planting) {
            planting.claimedBy=r;r.plantTarget=planting;r.plantTimer=0;
            r.state=fruitPlantingWoodNeed(planting)>0?'GOING_TO_PLANT_MATERIAL':'GOING_TO_PLANT';r.targetX=planting.x;r.targetY=planting.y;
            break;
          }
        }
        if(!r.isEngineer) {
          let huntTarget=null,huntDistance=Infinity;
          for(const animal of G.animals) {
            if(!animal.alive||!animal.marked||!isWorldVisible(animal.x,animal.y)||G.targetedAnimals.has(animal)) continue;
            const distance=Math.hypot(r.x-animal.x,r.y-animal.y);
            if(distance<huntDistance){huntDistance=distance;huntTarget=animal;}
          }
          if(huntTarget) {
            r.huntTarget=huntTarget;r.state='GOING_TO_HUNT';r.targetX=huntTarget.x;r.targetY=huntTarget.y;
            G.targetedAnimals.add(huntTarget);break;
          }
        }
        // Only idle non-engineers chop trees
        if (!r.isEngineer) {
          let treeTarget = null, treeDist = Infinity;
          for (const node of G.resourceNodes) {
            if (canResidentHandHarvest(node) && node.marked && !node.ownerForester) {
              // Skip trees already targeted by another villager
              if (G.targetedTrees.has(node)) continue;
              const d = Math.hypot(r.x - node.x, r.y - node.y);
              if (d < treeDist) { treeDist = d; treeTarget = node; }
            }
          }
          if (treeTarget) {
            r.state = 'GOING_TO_CHOP'; r.targetX = treeTarget.x; r.targetY = treeTarget.y; r.chopTarget = treeTarget;
            G.targetedTrees.add(treeTarget); break;
          }
        }
        r.state='PATROL';r.patrolTimer-=dt;
        const targetInvalid=!r.patrolTarget||Math.hypot(r.x-r.patrolTarget.x,r.y-r.patrolTarget.y)<5||!isStaticPatrolVisible(r.patrolTarget.x,r.patrolTarget.y);
        if(r.patrolTimer<=0||targetInvalid) {
          r.patrolTarget=choosePatrolTarget(r);
          r.patrolTimer=2+Math.random()*4;
        }
        if(r.patrolTarget) {
          r.targetX=r.patrolTarget.x;r.targetY=r.patrolTarget.y;
          moveViaFlow(r,r.targetX,r.targetY,30,dt);
        }
        break;
      }
    }
  }

  for(const r of G.residents.filter(resident=>resident.starved)) removeResident(r);
  G.groundItems=G.groundItems.filter(item=>item.alive);

  // Population growth is manual via town hall recruitment
}
