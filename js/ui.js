// ============================================================
// UI
// ============================================================
const contextMenu = document.getElementById('context-menu');
const buildingPanel = document.getElementById('building-panel');

function updateTopBar() {
  for(const type of RESOURCE_TYPES) {
    const status=resourceStorageStatus(type);
    document.getElementById('r-'+type).textContent=`${Math.floor(G.resources[type]||0)}/${Math.floor(status.capacity)}`;
    const item=document.getElementById('top-res-'+type);
    item.style.display=isResourceAvailable(type)?'':'none';
    item.classList.toggle('full',status.full);
    if(status.full) showResourceFullNotice(type);
    else G.resourceFullNotices.delete(type);
  }
  if (G.buildingPanelDirty) { updateBuildingPanel(); G.buildingPanelDirty=false; }
  updateBuildingCostAffordability();
  let homeless=0, engActive=0, engTotal=0, guardTotal=0, hasIdle=false;
  for (const r of G.residents) {
    if (!r.home && !r.isGuard) homeless++;
    if (r.isGuard) guardTotal++;
    if (r.isEngineer||r.pendingEngineer) {
      engTotal++;
      if (r.isEngineer&&(r.state==='GATHERING'||r.state==='BUILDING'||r.state==='CONSTRUCTING'||r.state==='GOING_TO_REPAIR'||r.state==='REPAIRING')) engActive++;
    }
  }
  hasIdle=getAssignableResidents().length>0;
  document.getElementById('eng-plus').style.display = hasIdle ? '' : 'none';
  document.getElementById('eng-minus').style.display = engTotal > 0 ? '' : 'none';
  document.getElementById('r-eng').textContent = engActive+'/'+engTotal;
  document.getElementById('r-guard-top').textContent = `${guardTotal}/${G.maxGuards}`;
  document.getElementById('r-pop').textContent = `${residentCount(false)}/${G.maxPop}` + (homeless>0?` !${homeless}`:'');
  const bloodMoon=isBloodMoonDay(G.day),nightLabel=bloodMoon?`第 ${G.day} 夜 · 血月`:`第 ${G.day} 夜`;
  document.getElementById('r-time').textContent = G.phase==='day'?`第 ${G.day} 天`:G.phase==='night'?nightLabel:`第 ${G.day} 天 · 过渡${bloodMoon?' · 血月':''}`;
  const dayIcon=document.getElementById('day-icon');
  dayIcon.className='resource-mark '+(G.phase==='day'?'day':'day '+G.phase);
}

function showContextMenu(building, mx, my) {
  const b=building, def=buildingRuntimeDef(b);
  if (b.ruin) {
    const canManage=G.phase==='day';
    const salvage=ruinSalvage(b), rebuild=ruinRebuildCost(b);
    let h=`<div class="info-line">废墟 · ${def.name}</div>`;
    h+=`<div class="info-line" style="font-size:10px">${canManage?'可回收或重建':'只能在白天处理'}</div>`;
    h+=`<button onclick="actionSalvageRuin()"${canManage?'':' disabled'}>移除 +${formatResourceCost(salvage)}</button>`;
    h+=`<button onclick="actionRebuildRuin()"${!canManage||!canAfford(rebuild)?' disabled':''}>重建 ${formatResourceCost(rebuild)}</button>`;
    contextMenu.innerHTML=h;
    contextMenu.style.display='flex';
    const cr=canvas.getBoundingClientRect();
    contextMenu.style.left=Math.min(mx,cr.right-150)+'px';
    contextMenu.style.top=Math.min(my,cr.bottom-220)+'px';
    return;
  }
  if(b.blueprint) {
    const totalCost=Object.values(b.constructCost||{}).reduce((sum,value)=>sum+value,0);
    const delivered=Object.values(b.constructDelivered||{}).reduce((sum,value)=>sum+value,0);
    let h=`<div class="info-line">蓝图 · ${def.name}</div>`;
    h+=`<div class="info-line" style="font-size:10px">材料: ${Math.floor(delivered)}/${totalCost}</div>`;
    h+=`<button onclick="actionMove()">移动</button>`;
    h+=`<button onclick="actionDemolish()" style="color:#f66">删除</button>`;
    contextMenu.innerHTML=h;
    contextMenu.style.display='flex';
    const cr=canvas.getBoundingClientRect();
    contextMenu.style.left=Math.min(mx,cr.right-150)+'px';
    contextMenu.style.top=Math.min(my,cr.bottom-220)+'px';
    return;
  }
  let h=`<div class="info-line">${def.icon} ${def.name} Lv.${b.level}</div>`;
  h+=`<div class="info-line" style="font-size:10px">HP: ${Math.ceil(b.hp)}/${b.maxHp}</div>`;
  if(b.upgrading) {
    const total=Object.values(b.constructCost||{}).reduce((sum,value)=>sum+value,0);
    const delivered=Object.values(b.constructDelivered||{}).reduce((sum,value)=>sum+value,0);
    h+=`<div class="info-line" style="font-size:10px;color:#e5c66c">${b.constructionTimer>0?'升级施工中':`升级材料: ${Math.floor(delivered)}/${total}`}</div>`;
  }
  if (b.type==='house') h+=`<div class="info-line" style="font-size:10px">村民床位: ${b.residentCount}/${houseCapacity(b)}</div>`;
  if (b.type==='barracks') h+=`<div class="info-line" style="font-size:10px">守卫床位: ${b.guardResidentCount||0}/${guardCapacity(b)}</div>`;
  if(def.maxWorkers>0 && !b.blueprint) h+=`<div class="info-line" style="font-size:10px">工人: ${b.assignedWorkers}/${def.maxWorkers}</div>`;
  const upgradeSummary=buildingUpgradeSummary(b);
  if (upgradeSummary && !b.blueprint) h+=`<div class="info-line" style="font-size:10px;color:#d8dcba">${upgradeSummary}</div>`;

  // Town hall manages housing and technology only; dedicated buildings recruit units.
  if(b.type==='town_hall') {
    h+=`<div class="info-line" style="font-size:10px">村民: ${residentCount(false)}/${G.maxPop} | 守卫: ${residentCount(true)}/${G.maxGuards}</div>`;
    const nextLv = b.level + 1;
    const unlocks = [];
    for (const [k, d] of Object.entries(BLD_DEFS)) {
      if (d.unlock === nextLv && k !== 'town_hall') unlocks.push(d.icon+d.name);
    }
    const capped=b.level>=maxBuildingLevel('town_hall');
    const cost=upgradeCostForLevel('town_hall',b.level+1);
    const costStr=formatResourceCost(cost);
    const capText = `建筑等级上限 → Lv.${nextLv}`;
    const unlockText = unlocks.length ? '解锁: '+unlocks.join(' ') : '';
    h+=`<div class="info-line" style="font-size:10px;color:#ffd700;">⬆ 升级后: ${capText}${unlockText?' | '+unlockText:''}</div>`;
    h+=`<button onclick="actionUpgrade()"${capped||b.upgrading?' disabled':''}>升级 Lv.${b.level}→${nextLv} ${costStr}${b.upgrading?' [进行中]':''}${capped?' [已达上限]':''}</button>`;
  } else {
    const maxLv = maxBuildingLevel(b.type);
    const capped = b.level >= maxLv;
    const nextUpgradeSummary=!capped ? buildingUpgradeSummary(b,true) : null;
    if (nextUpgradeSummary) h+=`<div class="info-line" style="font-size:10px;color:#e5c66c">升级后: ${nextUpgradeSummary}</div>`;
    const upgradeCost=!capped ? formatResourceCost(upgradeCostForLevel(b.type,b.level+1)) : '';
    h+=`<button onclick="actionUpgrade()"${capped||b.upgrading?' disabled':''}>升级 ${upgradeCost}${b.upgrading?' [进行中]':''}${capped?` [需大本营Lv.${b.level+1}]`:''}</button>`;
    if (def.recruits && !b.blueprint) {
      const full=availableRecruitSlots(def.recruits)<=0;
      const isGuard=def.recruits==='guard';
      const label='招募';
      const activeRecruitWorkers=b.type==='nursery'?G.residents.filter(r=>r.workplace===b&&r.state==='WORKING').length:0;
      const recruitState=b.type==='nursery'&&b.recruitQueue>0
        ? ` | ${activeRecruitWorkers>=def.maxWorkers?'生产中':`等待工人 ${activeRecruitWorkers}/${def.maxWorkers}`}`:'';
      h+=`<div class="info-line" style="font-size:10px">${label}队列: ${b.recruitQueue}${recruitState}</div>`;
      h+=`<button onclick="${isGuard?'actionRecruitGuard()':'actionRecruit()'}"${full?' disabled':''}>${label} ${formatResourceCost(def.recruitCost)}${b.recruitQueue>0?` (${b.recruitQueue})`:''}${full?isGuard?' [守卫已满]':' [村民已满]':''}</button>`;
      if(b.type==='nursery') h+=`<button onclick="actionCancelRecruit()"${b.recruitQueue>0?'':' disabled'}>取消招募 +${formatResourceCost(def.recruitCost)}${b.recruitQueue>0?` (${b.recruitQueue})`:' [空]'}</button>`;
    }
    if (b.type==='arrow_tower' && !b.blueprint) {
      const assignedGuard = b.assignedGuard;
      const availableGuard = G.residents.some(r=>r.isGuard && !r.assignedTower && !r.manningTower && r.state!=='GUARD_RETURNING' && r.state!=='GUARD_HEALING' && r.state!=='GUARD_GOING_HOME');
      h+=`<div class="info-line" style="font-size:10px">守卫岗位: ${assignedGuard?'1/1':'0/1'}</div>`;
      h+=`<button onclick="actionAddGuard()"${assignedGuard||!availableGuard?' disabled':''}>增加守卫${assignedGuard?' [已分配]':!availableGuard?' [无可用守卫]':''}</button>`;
      h+=`<button onclick="actionRemoveGuard()"${assignedGuard?'':' disabled'}>减少守卫${assignedGuard?'':' [空]'}</button>`;
    }
    if(def.maxWorkers>0 && !b.blueprint) {
      const full = b.assignedWorkers >= def.maxWorkers;
      const none = b.assignedWorkers <= 0;
      h+=`<button onclick="actionAddWorker()"${full?' disabled':''}>增加工人${full?' [满]':''}</button>`;
      h+=`<button onclick="actionRemoveWorker()"${none?' disabled':''}>减少工人${none?' [空]':''}</button>`;
    }
    h+=`<button onclick="actionMove()">移动</button>`;
    h+=`<button onclick="actionDemolish()" style="color:#f66">拆除</button>`;
  }
  contextMenu.innerHTML=h;
  contextMenu.style.display='flex';
  const cr = canvas.getBoundingClientRect();
  contextMenu.style.left = Math.min(mx, cr.right - 150) + 'px';
  contextMenu.style.top = Math.min(my, cr.bottom - 220) + 'px';
}

function hideContextMenu() { contextMenu.style.display='none'; }

function actionUpgrade() {
  if(startBuildingUpgrade(G.selectedBuilding)) hideContextMenu();
}
function actionAddWorker() {
  const b=G.selectedBuilding; if(!b) return;
  if(b.assignedWorkers>=buildingRuntimeDef(b).maxWorkers) return;
  const candidates=getAssignableResidents(); if(candidates.length===0) return;
  if(!assignResidentToWorkplace(candidates[0],b)) return;
  // Refresh menu to show updated count
  const menu=document.getElementById('context-menu');
  showContextMenu(b, parseInt(menu.style.left), parseInt(menu.style.top));
}
function actionRemoveWorker() {
  const b=G.selectedBuilding; if(!b||b.assignedWorkers<=0) return;
  const workers=G.residents.filter(r=>r.workplace===b&&!r.isGuard);
  const w=workers.find(residentHasFiniteIndependentTask)||workers.find(r=>r.state==='GOING_TO_WORK')||workers.find(r=>r.state==='WORKING')||workers[0];
  if(w){
    const finishingTask=residentHasFiniteIndependentTask(w);
    if (b.outputHauler===w) b.outputHauler=null;
    releaseProductionInputTask(w);w.workplace=null;w.finishCurrentChopForWork=false;
    if(!finishingTask) w.state=w.carrying?'HAULING':'IDLE';
  }
  b.assignedWorkers=Math.max(0,b.assignedWorkers-1);
  const menu=document.getElementById('context-menu');
  showContextMenu(b, parseInt(menu.style.left), parseInt(menu.style.top));
}
function actionAddGuard() {
  const b=G.selectedBuilding;
  if(!b || b.type!=='arrow_tower' || b.blueprint || b.assignedGuard) return;
  const guard=G.residents.find(r=>r.isGuard && !r.assignedTower && !r.manningTower && r.state!=='GUARD_RETURNING' && r.state!=='GUARD_HEALING' && r.state!=='GUARD_GOING_HOME');
  if(!guard) return;
  for (const enemy of G.enemies) if (enemy.fightingGuard===guard) enemy.fightingGuard=null;
  guard.assignedTower=b; b.assignedGuard=guard;
  if(G.phase==='night'||G.phase==='dusk') { guard.state='GUARD_FIND_TOWER'; guard.hidden=false; }
  else if(guard.state!=='GUARD_SLEEPING') sendGuardHomeForDay(guard);
  const menu=document.getElementById('context-menu');
  showContextMenu(b, parseInt(menu.style.left), parseInt(menu.style.top));
}
function actionRemoveGuard() {
  const b=G.selectedBuilding; if(!b||b.type!=='arrow_tower') return;
  const guard=G.residents.find(r=>r.isGuard && (r.assignedTower===b || r.manningTower===b));
  if(!guard) return;
  for (const enemy of G.enemies) {
    if (enemy.fightingGuard===guard) enemy.fightingGuard=null;
    if (enemy.guardTarget===guard) enemy.guardTarget=null;
  }
  if(guard.manningTower===b) guard.manningTower=null;
  guard.assignedTower=null; b.assignedGuard=null;
  if(G.phase==='night'||G.phase==='dusk') { guard.state='GUARD_FIGHTING';guard.hidden=false; }
  else if(guard.state!=='GUARD_SLEEPING') sendGuardHomeForDay(guard);
  const menu=document.getElementById('context-menu');
  showContextMenu(b, parseInt(menu.style.left), parseInt(menu.style.top));
}
function actionRecruit() {
  const b=G.selectedBuilding, def=b&&buildingRuntimeDef(b);
  if(!b||!def||def.recruits!=='resident'||availableRecruitSlots('resident')<=0) return;
  const cost=def.recruitCost;
  if(!canAfford(cost)) return;
  payCost(cost);
  b.recruitQueue++;
  if (b.recruitProgress <= 0) b.recruitProgress = 0;
  const menu=document.getElementById('context-menu');
  showContextMenu(b, parseInt(menu.style.left), parseInt(menu.style.top));
}
function actionCancelRecruit() {
  const b=G.selectedBuilding;
  if(!cancelNurseryRecruit(b)) return;
  const menu=document.getElementById('context-menu');
  showContextMenu(b,parseInt(menu.style.left),parseInt(menu.style.top));
}
function actionRecruitGuard() {
  const b=G.selectedBuilding, def=b&&buildingRuntimeDef(b);
  if(!b||!def||def.recruits!=='guard'||availableRecruitSlots('guard')<=0) return;
  const cost=def.recruitCost;
  if(!canAfford(cost)) return;
  payCost(cost);
  b.recruitQueue++;
  if (b.recruitProgress <= 0) b.recruitProgress = 0;
  const menu=document.getElementById('context-menu');
  showContextMenu(b, parseInt(menu.style.left), parseInt(menu.style.top));
}
function actionMove() {
  const b=G.selectedBuilding; if(!b||b.ruin||b.type==='town_hall') return;
  G.placingMode=true; G.movingBuilding=b; G.selectedBldType=null;
  document.querySelectorAll('.bld-btn').forEach(b=>b.classList.remove('selected')); hideContextMenu();
}
function actionDemolish() {
  const b=G.selectedBuilding; if(!b) return;
  demolishBuilding(b); G.selectedBuilding=null; hideContextMenu();
}
function actionSalvageRuin() {
  const b=G.selectedBuilding;
  if(!b||!b.ruin||G.phase!=='day') return;
  addRuinSalvage(b);
  const idx=G.buildings.indexOf(b);
  if(idx!==-1) G.buildings.splice(idx,1);
  G.selectedBuilding=null;
  invalidateNavigation(); refreshFarmAdjacency(); updateAllResourceTotals(); refreshFogVisibility(); hideContextMenu();
}
function actionRebuildRuin() {
  const b=G.selectedBuilding;
  if(!b||!b.ruin||G.phase!=='day') return;
  const cost=ruinRebuildCost(b);
  if(!canAfford(cost)) return;
  b.ruin=false; b.ruinCost=null; b.hp=1;
  b.maxHp=Math.floor(buildingLevelValue(b.type,b.level,'hp'));
  b.blueprint=true; b.constructionTimer=0; b.assignedEngineer=null;
  b.constructCost=cloneResourceMap(cost); b.constructDelivered={};
  for(const type of Object.keys(cost)) b.constructDelivered[type]=0;
  invalidateNavigation(); refreshFogVisibility(); hideContextMenu();
}

function updateBuildingPanel() {
  updateFruitPlantCommandCost();
  const th = G.townHall; const lv = th ? th.level : 1;
  const buttons=[...document.querySelectorAll('.bld-btn')];
  const nextTierSection=document.getElementById('next-tier-building-section');
  const nextTierLabel=document.getElementById('next-tier-building-label');
  for (const [index,btn] of buttons.entries()) {
    if(!btn.dataset.catalogHome) btn.dataset.catalogHome=btn.parentElement?.dataset.buildingGroup||'';
    if(!btn.dataset.catalogOrder) btn.dataset.catalogOrder=String(index);
    const def = BLD_DEFS[btn.dataset.type];
    if (!def) continue;
    const status=buildingUnlockStatus(def,lv);
    const sectionKey=buildingPanelSectionKey(btn.dataset.type,lv);
    const targetSection=sectionKey==='next-tier'
      ? nextTierSection
      : document.querySelector(`[data-building-group="${btn.dataset.catalogHome}"]`);
    if(targetSection&&btn.parentElement!==targetSection) targetSection.appendChild(btn);
    btn.style.display = status.visible ? '' : 'none';
    btn.disabled=!status.unlocked;
    btn.classList.toggle('locked',!status.unlocked);
    btn.title=status.unlocked ? '' : status.text;
    let condition=btn.querySelector('.unlock-condition');
    if(!condition) {
      condition=document.createElement('div'); condition.className='unlock-condition';
      const copy=btn.querySelector('.bld-copy'); if(copy) copy.appendChild(condition);
    }
    if(condition) { condition.textContent=status.text; condition.style.display=status.unlocked?'none':''; }
    if(!status.unlocked&&G.selectedBldType===btn.dataset.type) clearBlueprintCommand();
    const cost=btn.querySelector('.cost');
    if(cost) cost.innerHTML=formatResourceCost(def.cost);
  }
  for(const section of document.querySelectorAll('#building-panel .panel-section[data-building-group]')) {
    const sectionButtons=[...section.querySelectorAll(':scope > .bld-btn')]
      .sort((a,b)=>Number(a.dataset.catalogOrder)-Number(b.dataset.catalogOrder));
    for(const button of sectionButtons) section.appendChild(button);
  }
  const nextTierCount=buttons.filter(button=>button.parentElement===nextTierSection&&button.style.display!=='none').length;
  if(nextTierLabel) nextTierLabel.textContent=`${lv+1}本解锁`;
  if(nextTierSection) nextTierSection.style.display=nextTierCount?'':'none';
  G.buildingPanelDirty=false;
}
buildingPanel.addEventListener('click', e => {
  const btn=e.target.closest('.bld-btn'); if(!btn) return;
  const type=btn.dataset.type;
  if(btn.disabled) return;
  clearChopCommand();
  if(G.placingMode){G.placingMode=false;G.movingBuilding=null;}
  if(G.selectedBldType===type){
    G.selectedBldType=null; btn.classList.remove('selected');
  } else {
    document.querySelectorAll('.bld-btn').forEach(b=>b.classList.remove('selected'));
    G.selectedBldType=type; btn.classList.add('selected');
    G.selectedBuilding=null; hideContextMenu();
  }
});
