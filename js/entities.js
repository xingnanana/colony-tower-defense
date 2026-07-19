// ============================================================
// BUILDING CLASS
// ============================================================
class Building {
  constructor(type, col, row) {
    const def = BLD_DEFS[type];
    this.type = type; this.col = col; this.row = row;
    this.x = gridX(col); this.y = gridY(row);
    this.hp = def.hp; this.maxHp = def.hp;
    this.level = 1;
    this.assignedWorkers = 0;
    this.productionProgress = 0;
    this.pendingOutput = 0;
    this.outputHauler = null;
    this.productionInputs = {};
    this.inputHaulers = new Set();
    this.productionRoundActive = false;
    this.upgradeProgress = 0; this.upgrading = false;
    this.stored = {};
    this.attackCooldown = 0;
    this.size = def.sz;
    this.recruitQueue = 0;
    this.recruitProgress = 0;
    this.guardRecruitQueue = 0;
    this.guardRecruitProgress = 0;
    this.residentCount = 0;
    this.guardResidentCount = 0;
    this.assignedGuard = null;
    this.blueprint = false;
    this.constructCost = null;
    this.constructDelivered = null;
    this.assignedEngineer = null;
    this.constructionTimer = 0;
    this.foresterPlantCooldown = 0;
    this.repairTarget = null;
    this.ruin = false;
    this.ruinCost = null;
  }
  center() {
    return { x:this.x+this.size[0]*CFG.CELL/2, y:this.y+this.size[1]*CFG.CELL/2 };
  }
  guardSpot() {
    const c = this.center();
    return { x:c.x, y:c.y+28 };
  }
  collisionRadius() {
    return Math.min(this.size[0], this.size[1]) * CFG.CELL / 2 - 6;
  }
  efficiency() {
    const def = buildingRuntimeDef(this);
    if (!def.maxWorkers) return 0;
    let eff = Math.min(1, this.assignedWorkers/def.maxWorkers);
    return eff;
  }
  def() { return BLD_DEFS[this.type]; }
}

// ============================================================
// RESIDENT CLASS
// ============================================================
class Resident {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.state = 'IDLE';
    this.workplace = null; this.home = null;
    this.carrying = null;
    this.carryQueue = [];
    this.carryingFrom = null;
    this.productionInputTarget = null;
    this.productionInputType = null;
    this.productionInputReservedAmount = 0;
    this.dropCarryingWhenBlocked = false;
    this.pickupTarget = null;
    this.targetX = x; this.targetY = y;
    this.navWaypoint = null; this.navBlock = null; this.navTargetX = x; this.navTargetY = y;
    this.navPath = null; this.navPathIndex = 0; this.navBlockedGoal = false; this.navResolvedPoint = null; this.navPending = false;
    this.navRevision = G.navigationRevision; this.navCheckTimer = 0;
    this.navProgressTimer = 0; this.navProgressX = x; this.navProgressY = y; this.navForcedReplans = 0;
    this.patrolAngle = Math.random()*Math.PI*2;
    this.patrolTimer = 0; this.patrolTarget = null;
    this.eatTimer = 0; this.prodTimer = 0;
    this.hidden = false;
    this.buildTarget = null;
    this.isEngineer = false;
    this.chopTarget = null; this.chopTimer = 0; this.chopShakeBeat = -1;
    this.huntTarget = null; this.huntAttackTimer = 0;
    this.plantTarget = null; this.plantTimer = 0;
    this.carryingForPlanting = false;
    this.finishCurrentChopForWork = false;
    this.finishBeforeEating = false;
    this.mealPending = false;
    // Guard properties
    this.isGuard = false;
    this.guardHP = CFG.GUARD_MAX_HP;
    this.guardMaxHP = CFG.GUARD_MAX_HP;
    this.guardAttackCD = 0;
    this.manningTower = null;
    this.assignedTower = null;
    this.guardHealTimer = 0;
    this.controlMode = 'auto';
    this.manualTarget = null;
    this.manualTargetEnemy = null;
    this.formationCommandId = 0;
  }
}

class Animal {
  constructor(x,y) {
    this.x=x;this.y=y;this.hp=CFG.ANIMAL_HP;this.maxHp=CFG.ANIMAL_HP;
    this.alive=true;this.marked=false;this.size=8;
    this.targetX=x;this.targetY=y;this.wanderTimer=Math.random()*4;
    this.facingRight=Math.random()>=0.5;
    this.navWaypoint=null;this.navBlock=null;this.navTargetX=x;this.navTargetY=y;
    this.navPath=null;this.navPathIndex=0;this.navBlockedGoal=false;this.navResolvedPoint=null;this.navPending=false;
    this.navRevision=G.navigationRevision;this.navCheckTimer=0;
    this.navProgressTimer=0;this.navProgressX=x;this.navProgressY=y;this.navForcedReplans=0;
  }
}

// ============================================================
// ENEMY CLASS
// ============================================================
class Enemy {
  constructor(x, y, type='normal') {
    const def=ENEMY_DEFS[type] || ENEMY_DEFS.normal;
    this.x = x; this.y = y;
    this.type=ENEMY_DEFS[type] ? type : 'normal';
    this.hp = def.hp; this.maxHp = def.hp;
    this.speed = def.speed * (0.9+Math.random()*0.2);
    this.damage = def.damage; this.attackRange=CFG.ENEMY_ATTACK_RANGE;
    // 目标：大本营位置
    const th = G.townHall;
    if (th) { this.targetX = th.x+th.size[0]*CFG.CELL/2; this.targetY = th.y+th.size[1]*CFG.CELL/2; }
    else { this.targetX = CFG.WORLD_W/2; this.targetY = CFG.WORLD_H/2; }
    this.navWaypoint = null; this.navBlock = null; this.navTargetX = this.targetX; this.navTargetY = this.targetY;
    this.navPath = null; this.navPathIndex = 0; this.navBlockedGoal = false; this.navResolvedPoint = null; this.navPending = false;
    this.navRevision = G.navigationRevision; this.navCheckTimer = 0;
    this.navProgressTimer = 0; this.navProgressX = x; this.navProgressY = y; this.navForcedReplans = 0;
    this.attacking = null; this.attackTimer = 0;
    this.fightingGuard = null;
    this.guardTarget = null;
    this.alive = true;
    this.size = def.size * (0.9+Math.random()*0.15);
  }
}

// ============================================================
// PARTICLE CLASS
// ============================================================
class Particle {
  constructor(x,y,color,life) {
    this.x=x; this.y=y; this.color=color; this.life=life; this.maxLife=life;
    this.vx=(Math.random()-0.5)*60; this.vy=(Math.random()-0.5)*60;
  }
}
