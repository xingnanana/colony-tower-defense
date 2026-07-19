function resourceObstacle(node) {
  return {
    resourceNode: node,
    center() { return { x: node.x + CFG.CELL/2, y: node.y + CFG.CELL/2 }; },
    collisionRadius() { return 16; }
  };
}
function isResourceObstacleNode(node) {
  return node && node.alive && !['tree','sapling','fruit_tree','fruit_sapling','fruit_planting'].includes(node.type);
}
function buildingBlocksMovement(b) {
  return !!b && !b.ruin && b.hp > 0 && b.type !== 'farm';
}
function ensureObstacleSpatialHash() {
  if (!G.obstacleSpatial) G.obstacleSpatial = new SpatialHash(CFG.SPATIAL_CELL_SIZE);
  if (G.obstacleIndexRevision === G.navigationRevision) return;
  G.obstacleSpatial.clear();
  for (const b of G.buildings) {
    if (!buildingBlocksMovement(b)) continue;
    const c=b.center(), radius=b.collisionRadius()+RESIDENT_RADIUS+16;
    G.obstacleSpatial.insert(b,c.x-radius,c.y-radius,c.x+radius,c.y+radius);
  }
  for (const node of G.resourceNodes) {
    if (!isResourceObstacleNode(node)) continue;
    const obstacle=resourceObstacle(node), c=obstacle.center();
    const radius=obstacle.collisionRadius()+RESIDENT_RADIUS+16;
    G.obstacleSpatial.insert(obstacle,c.x-radius,c.y-radius,c.x+radius,c.y+radius);
  }
  G.obstacleIndexRevision = G.navigationRevision;
}
function rebuildResidentSpatialHash() {
  if (!G.residentSpatial) G.residentSpatial = new SpatialHash(CFG.SPATIAL_CELL_SIZE);
  G.residentSpatial.clear();
  for (const r of G.residents) {
    if (r.hidden) continue;
    G.residentSpatial.insert(r,r.x-RESIDENT_RADIUS,r.y-RESIDENT_RADIUS,r.x+RESIDENT_RADIUS,r.y+RESIDENT_RADIUS);
  }
}
function segmentHitsBuilding(x1, y1, x2, y2, b, r) {
  if (!b || (b.resourceNode ? !b.resourceNode.alive : !buildingBlocksMovement(b))) return false;
  if (b.resourceNode && !isResourceObstacleNode(b.resourceNode)) return false;
  if (b === r.workplace || b === r.home || b === r.buildTarget) return false;
  const goalDist = Math.hypot(x2 - b.center().x, y2 - b.center().y);
  if (goalDist < b.collisionRadius() + RESIDENT_RADIUS + 4) return false;
  const c = b.center();
  const vx = x2 - x1, vy = y2 - y1;
  const lenSq = vx * vx + vy * vy;
  const t = lenSq > 0 ? clamp(((c.x - x1) * vx + (c.y - y1) * vy) / lenSq, 0, 1) : 0;
  const px = x1 + vx * t, py = y1 + vy * t;
  return Math.hypot(px - c.x, py - c.y) < b.collisionRadius() + RESIDENT_RADIUS + 8;
}

function firstBlockingObstacle(r, tx, ty) {
  let blocker = null, best = Infinity;
  ensureObstacleSpatialHash();
  const obstacles=G.obstacleSpatial.query(Math.min(r.x,tx),Math.min(r.y,ty),Math.max(r.x,tx),Math.max(r.y,ty));
  for (const b of obstacles) {
    if (!segmentHitsBuilding(r.x, r.y, tx, ty, b, r)) continue;
    const c = b.center();
    const d = Math.hypot(c.x - r.x, c.y - r.y);
    if (d < best) { best = d; blocker = b; }
  }
  return blocker;
}
function findAvoidanceWaypoint(r, tx, ty, blocker) {
  const c = blocker.center();
  const radius = blocker.collisionRadius() + RESIDENT_RADIUS + 16;
  const base = Math.atan2(r.y - c.y, r.x - c.x);
  const candidates = [];
  for (let i = 0; i < 8; i++) {
    const angle = base + (i - 3.5) * Math.PI / 4;
    candidates.push({
      x: clamp(c.x + Math.cos(angle) * radius, RESIDENT_RADIUS, CFG.WORLD_W - RESIDENT_RADIUS),
      y: clamp(c.y + Math.sin(angle) * radius, RESIDENT_RADIUS, CFG.WORLD_H - RESIDENT_RADIUS)
    });
  }
  let best = null, bestScore = Infinity;
  for (const p of candidates) {
    // The next leg may contain another obstacle; reaching this clear waypoint
    // lets the unit plan the next local detour instead of giving up in corridors.
    if (firstBlockingObstacle(r, p.x, p.y)) continue;
    const nextBlock = firstBlockingObstacle({x:p.x,y:p.y,workplace:r.workplace,home:r.home,buildTarget:r.buildTarget}, tx, ty);
    const score = Math.hypot(p.x - r.x, p.y - r.y) + Math.hypot(tx - p.x, ty - p.y) + (nextBlock ? 24 : 0);
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return best;
}

const NAV_DIRECTIONS = [
  [1,0,1],[-1,0,1],[0,1,1],[0,-1,1],
  [1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]
];
function navigationCols() { return Math.ceil(CFG.WORLD_W/CFG.NAV_CELL); }
function navigationRows() { return Math.ceil(CFG.WORLD_H/CFG.NAV_CELL); }
function navigationIndex(col,row) { return col+row*navigationCols(); }
function navigationCellCenter(col,row) {
  return {
    x:clamp((col+0.5)*CFG.NAV_CELL,RESIDENT_RADIUS,CFG.WORLD_W-RESIDENT_RADIUS),
    y:clamp((row+0.5)*CFG.NAV_CELL,RESIDENT_RADIUS,CFG.WORLD_H-RESIDENT_RADIUS)
  };
}
function blockNavigationCircle(grid, cx, cy, radius) {
  const cols=navigationCols(), rows=navigationRows(), cell=CFG.NAV_CELL;
  const minCol=clamp(Math.floor((cx-radius)/cell),0,cols-1), maxCol=clamp(Math.floor((cx+radius)/cell),0,cols-1);
  const minRow=clamp(Math.floor((cy-radius)/cell),0,rows-1), maxRow=clamp(Math.floor((cy+radius)/cell),0,rows-1);
  const radiusSq=radius*radius;
  for(let row=minRow;row<=maxRow;row++) for(let col=minCol;col<=maxCol;col++) {
    const point=navigationCellCenter(col,row), dx=point.x-cx, dy=point.y-cy;
    if(dx*dx+dy*dy<radiusSq) grid[navigationIndex(col,row)]=1;
  }
}
function ensureNavigationGrid() {
  if(G.navigationGrid && G.navigationGridRevision===G.navigationRevision) return G.navigationGrid;
  const grid=new Uint8Array(navigationCols()*navigationRows());
  for(const b of G.buildings) {
    if(!buildingBlocksMovement(b)) continue;
    const c=b.center();
    blockNavigationCircle(grid,c.x,c.y,b.collisionRadius()+RESIDENT_RADIUS+3);
  }
  for(const node of G.resourceNodes) {
    if(!isResourceObstacleNode(node)) continue;
    const obstacle=resourceObstacle(node), c=obstacle.center();
    blockNavigationCircle(grid,c.x,c.y,obstacle.collisionRadius()+RESIDENT_RADIUS+3);
  }
  G.navigationGrid=grid;
  G.navigationGridRevision=G.navigationRevision;
  return grid;
}
function navigationCellOpen(col,row,grid=ensureNavigationGrid()) {
  return col>=0&&row>=0&&col<navigationCols()&&row<navigationRows()&&grid[navigationIndex(col,row)]===0;
}
function nearestOpenNavigationCell(x,y,grid=ensureNavigationGrid()) {
  const cols=navigationCols(), rows=navigationRows();
  const originCol=clamp(Math.floor(x/CFG.NAV_CELL),0,cols-1), originRow=clamp(Math.floor(y/CFG.NAV_CELL),0,rows-1);
  if(navigationCellOpen(originCol,originRow,grid)) return {col:originCol,row:originRow};
  const maxRadius=Math.max(cols,rows);
  for(let radius=1;radius<maxRadius;radius++) {
    let best=null, bestDistance=Infinity;
    for(let col=originCol-radius;col<=originCol+radius;col++) for(const row of [originRow-radius,originRow+radius]) {
      if(!navigationCellOpen(col,row,grid)) continue;
      const p=navigationCellCenter(col,row), distance=Math.hypot(p.x-x,p.y-y);
      if(distance<bestDistance){bestDistance=distance;best={col,row};}
    }
    for(let row=originRow-radius+1;row<originRow+radius;row++) for(const col of [originCol-radius,originCol+radius]) {
      if(!navigationCellOpen(col,row,grid)) continue;
      const p=navigationCellCenter(col,row), distance=Math.hypot(p.x-x,p.y-y);
      if(distance<bestDistance){bestDistance=distance;best={col,row};}
    }
    if(best) return best;
  }
  return null;
}
function navigationLineClear(a,b,grid=ensureNavigationGrid()) {
  const distance=Math.hypot(b.x-a.x,b.y-a.y);
  const steps=Math.max(1,Math.ceil(distance/(CFG.NAV_CELL*0.4)));
  let previousCol=null, previousRow=null;
  for(let i=0;i<=steps;i++) {
    const t=i/steps, col=Math.floor((a.x+(b.x-a.x)*t)/CFG.NAV_CELL), row=Math.floor((a.y+(b.y-a.y)*t)/CFG.NAV_CELL);
    if(!navigationCellOpen(col,row,grid)) return false;
    if(previousCol!==null&&col!==previousCol&&row!==previousRow&&
        (!navigationCellOpen(col,previousRow,grid)||!navigationCellOpen(previousCol,row,grid))) return false;
    previousCol=col; previousRow=row;
  }
  return true;
}
function navigationHeuristic(col,row,goalCol,goalRow) {
  const dx=Math.abs(goalCol-col), dy=Math.abs(goalRow-row);
  return Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy);
}
function heapPush(heap,node) {
  heap.push(node);
  let index=heap.length-1;
  while(index>0) {
    const parent=(index-1)>>1;
    if(heap[parent].score<=node.score) break;
    heap[index]=heap[parent]; index=parent;
  }
  heap[index]=node;
}
function heapPop(heap) {
  if(!heap.length) return null;
  const root=heap[0], tail=heap.pop();
  if(heap.length) {
    let index=0;
    while(true) {
      const left=index*2+1;
      if(left>=heap.length) break;
      const right=left+1;
      const child=right<heap.length&&heap[right].score<heap[left].score?right:left;
      if(heap[child].score>=tail.score) break;
      heap[index]=heap[child]; index=child;
    }
    heap[index]=tail;
  }
  return root;
}
let navigationSearchBuffers=null;
function reusableNavigationSearchBuffers(total) {
  if(!navigationSearchBuffers||navigationSearchBuffers.costs.length!==total) {
    navigationSearchBuffers={costs:new Float64Array(total),parents:new Int32Array(total),closed:new Uint8Array(total)};
  }
  navigationSearchBuffers.costs.fill(Infinity);
  navigationSearchBuffers.parents.fill(-1);
  navigationSearchBuffers.closed.fill(0);
  return navigationSearchBuffers;
}
function simplifyNavigationPath(points,grid) {
  if(points.length<3) return points;
  const simplified=[points[0]];
  let anchor=0;
  while(anchor<points.length-1) {
    let next=points.length-1;
    while(next>anchor+1&&!navigationLineClear(points[anchor],points[next],grid)) next--;
    simplified.push(points[next]); anchor=next;
  }
  return simplified;
}
function findNavigationPath(startX,startY,targetX,targetY) {
  const grid=ensureNavigationGrid(), cols=navigationCols(), rows=navigationRows();
  const start=nearestOpenNavigationCell(startX,startY,grid), goal=nearestOpenNavigationCell(targetX,targetY,grid);
  if(!start||!goal) return null;
  const startId=navigationIndex(start.col,start.row), goalId=navigationIndex(goal.col,goal.row);
  if(startId===goalId) return {points:[navigationCellCenter(goal.col,goal.row)],reachedGoal:true,blockedGoal:!navigationLineClear(navigationCellCenter(goal.col,goal.row),{x:targetX,y:targetY},grid)};
  const total=cols*rows,{costs,parents,closed}=reusableNavigationSearchBuffers(total);
  costs[startId]=0;
  const heap=[];
  heapPush(heap,{id:startId,col:start.col,row:start.row,score:navigationHeuristic(start.col,start.row,goal.col,goal.row)*1.05});
  let bestId=startId, bestDistance=navigationHeuristic(start.col,start.row,goal.col,goal.row), reached=false, expanded=0;
  const expansionLimit=Math.min(total,CFG.NAV_EXPANSION_LIMIT);
  while(heap.length&&expanded<expansionLimit) {
    const current=heapPop(heap);
    if(closed[current.id]) continue;
    closed[current.id]=1; expanded++;
    const distance=navigationHeuristic(current.col,current.row,goal.col,goal.row);
    if(distance<bestDistance){bestDistance=distance;bestId=current.id;}
    if(current.id===goalId){bestId=goalId;reached=true;break;}
    for(const [dc,dr,stepCost] of NAV_DIRECTIONS) {
      const col=current.col+dc,row=current.row+dr;
      if(!navigationCellOpen(col,row,grid)) continue;
      if(dc&&dr&&(!navigationCellOpen(current.col+dc,current.row,grid)||!navigationCellOpen(current.col,current.row+dr,grid))) continue;
      const id=col+row*cols;
      if(closed[id]) continue;
      const nextCost=costs[current.id]+stepCost;
      if(nextCost>=costs[id]) continue;
      costs[id]=nextCost; parents[id]=current.id;
      heapPush(heap,{id,col,row,score:nextCost+navigationHeuristic(col,row,goal.col,goal.row)*1.05});
    }
  }
  if(bestId===startId&&!reached) return null;
  const ids=[];
  for(let id=bestId;id>=0;id=parents[id]) { ids.push(id); if(id===startId) break; }
  ids.reverse();
  const points=ids.map(id=>navigationCellCenter(id%cols,Math.floor(id/cols)));
  const simplified=simplifyNavigationPath(points,grid);
  if(simplified.length&&Math.hypot(simplified[0].x-startX,simplified[0].y-startY)<CFG.NAV_CELL) simplified.shift();
  const end=simplified[simplified.length-1]||navigationCellCenter(goal.col,goal.row);
  return {points:simplified.length?simplified:[end],reachedGoal:reached,blockedGoal:!reached||!navigationLineClear(end,{x:targetX,y:targetY},grid)};
}
function clearNavigation(r) {
  r.navWaypoint = null;
  r.navBlock = null;
  r.navPath = null;
  r.navPathIndex = 0;
  r.navBlockedGoal = false;
  r.navResolvedPoint = null;
  r.navPending = false;
  r.navCheckTimer = 0;
  r.navProgressTimer = 0;
  r.navProgressX = r.x;
  r.navProgressY = r.y;
}
function applyNavigationPlan(r,planned) {
  r.navPending=false;
  r.navWaypoint=null;
  if(!planned||!planned.points.length) return false;
  r.navPath=planned.points;
  r.navPathIndex=0;
  r.navBlockedGoal=planned.blockedGoal;
  r.navResolvedPoint=planned.points[planned.points.length-1];
  return true;
}
function queueNavigationRequest(r,targetX,targetY) {
  if(r.navPending) return;
  r.navPending=true;
  G.navigationQueue.push({unit:r,targetX,targetY,revision:G.navigationRevision});
}
function processNavigationRequests(limit=CFG.NAV_REQUESTS_PER_TICK) {
  let processed=0;
  while(G.navigationQueue.length&&processed<limit) {
    const request=G.navigationQueue.shift(),r=request.unit;
    if(!r||!r.navPending||request.revision!==G.navigationRevision||r.navRevision!==G.navigationRevision||
        Math.hypot(r.navTargetX-request.targetX,r.navTargetY-request.targetY)>1) continue;
    const planned=findNavigationPath(r.x,r.y,request.targetX,request.targetY);
    applyNavigationPlan(r,planned);
    processed++;
  }
  return processed;
}
function navigationBlockIsActive(block) {
  return !!block && (block.resourceNode ? isResourceObstacleNode(block.resourceNode) : buildingBlocksMovement(block));
}
function workplaceWorkRange(b) {
  const normalRange=b.collisionRadius()+RESIDENT_RADIUS+2;
  return b.type==='farm' ? normalRange*0.5 : normalRange;
}
function canPassArrivedFormationGuard(r,other) {
  return !!(r.isGuard&&r.controlMode==='manual'&&r.manualTarget&&r.formationCommandId&&
    other.isGuard&&other.controlMode==='manual'&&!other.manualTarget&&!other.manualTargetEnemy&&
    other.formationCommandId===r.formationCommandId);
}
function steerAroundResidents(r, nx, ny, speed, dt) {
  const dx=nx-r.x, dy=ny-r.y, moveDistance=Math.hypot(dx,dy);
  if (moveDistance<0.01) return {x:nx,y:ny};
  const ux=dx/moveDistance, uy=dy/moveDistance;
  const px=-uy, py=ux;
  const lookAhead=Math.max(RESIDENT_RADIUS*4,moveDistance+RESIDENT_RADIUS*2);
  const clearance=RESIDENT_RADIUS*2+4;
  const nearby=G.residentSpatial
    ? G.residentSpatial.query(r.x-lookAhead,r.y-lookAhead,r.x+lookAhead,r.y+lookAhead)
    : G.residents;
  let steer=0;
  for (const other of nearby) {
    if (other===r || other.hidden) continue;
    if (canPassArrivedFormationGuard(r,other)) continue;
    const ox=other.x-r.x, oy=other.y-r.y;
    const along=ox*ux+oy*uy;
    if (along < -RESIDENT_RADIUS || along > lookAhead) continue;
    const side=ox*px+oy*py;
    if (Math.abs(side)>=clearance) continue;
    const lateralNeed=1-Math.abs(side)/clearance;
    const forwardNeed=1-clamp(Math.max(0,along)/lookAhead,0,1);
    // When directly ahead, choose a stable local side so the mover commits to passing it.
    const direction=side>0.5 ? -1 : 1;
    steer+=direction*lateralNeed*(0.7+forwardNeed*0.3);
  }
  const maxSteer=speed*dt*1.2;
  steer=clamp(steer,-maxSteer,maxSteer);
  return {x:nx+px*steer,y:ny+py*steer};
}
function flowMove(r, tx, ty, speed, dt) {
  r.navDebugTarget={x:tx,y:ty};
  r.navDebugTick=G.tick;
  if (Math.hypot(tx - r.navTargetX, ty - r.navTargetY) > 18) {
    clearNavigation(r);
  }
  r.navTargetX = tx; r.navTargetY = ty;
  if (r.navRevision !== G.navigationRevision) {
    r.navRevision = G.navigationRevision;
    clearNavigation(r);
  }
  while(r.navPath&&r.navPathIndex<r.navPath.length&&Math.hypot(r.x-r.navPath[r.navPathIndex].x,r.y-r.navPath[r.navPathIndex].y)<10) r.navPathIndex++;
  if(r.navPath&&r.navPathIndex>=r.navPath.length) r.navPath=null;
  const blocker=firstBlockingObstacle(r,tx,ty);
  if(!r.navPath&&blocker&&!(r.navBlockedGoal&&r.navResolvedPoint&&Math.hypot(r.x-r.navResolvedPoint.x,r.y-r.navResolvedPoint.y)<10)) {
    queueNavigationRequest(r,tx,ty);
    if(!r.navWaypoint||Math.hypot(r.x-r.navWaypoint.x,r.y-r.navWaypoint.y)<10||firstBlockingObstacle(r,r.navWaypoint.x,r.navWaypoint.y)) {
      r.navWaypoint=findAvoidanceWaypoint(r,tx,ty,blocker);
    }
  }
  const fallbackTarget=r.navWaypoint||(r.navBlockedGoal?r.navResolvedPoint:null);
  const moveTarget=r.navPath&&r.navPathIndex<r.navPath.length?r.navPath[r.navPathIndex]:(fallbackTarget||{x:tx,y:ty});
  tx = moveTarget.x; ty = moveTarget.y;
  if (G.floorMask) {
    const gi = gridCol(r.x) + gridRow(r.y) * CFG.WORLD_COLS;
    if (gi < G.floorMask.length && G.floorMask[gi]) speed *= floorMovementMultiplier();
  }
  const dx = tx - r.x, dy = ty - r.y, mag = Math.hypot(dx, dy) || 1;
  const nx = r.x + (dx / mag) * speed * dt;
  const ny = r.y + (dy / mag) * speed * dt;
  const steered=steerAroundResidents(r,nx,ny,speed,dt);
  return resolveCollisions(r, steered.x, steered.y);
}
function moveViaFlow(r, tx, ty, speed, dt) {
  const rs = flowMove(r, tx, ty, speed, dt);
  r.x = rs.x; r.y = rs.y;
  updateNavigationProgress(r,tx,ty,dt);
}
function updateNavigationProgress(r,tx,ty,dt) {
  if (!Number.isFinite(r.navProgressTimer)||!Number.isFinite(r.navProgressX)||!Number.isFinite(r.navProgressY)) {
    r.navProgressTimer=0;r.navProgressX=r.x;r.navProgressY=r.y;
  }
  const remaining=Math.hypot(tx-r.x,ty-r.y);
  const stoppedAtReachableEnd=r.navBlockedGoal&&!r.navPath&&r.navResolvedPoint&&Math.hypot(r.x-r.navResolvedPoint.x,r.y-r.navResolvedPoint.y)<12;
  if (remaining<=Math.max(12,CFG.NAV_STUCK_MIN_DISTANCE)||stoppedAtReachableEnd) {
    r.navProgressTimer=0;r.navProgressX=r.x;r.navProgressY=r.y;
    return false;
  }
  r.navProgressTimer+=dt;
  if (r.navProgressTimer<CFG.NAV_STUCK_WINDOW) return false;
  const moved=Math.hypot(r.x-r.navProgressX,r.y-r.navProgressY);
  r.navProgressTimer=0;r.navProgressX=r.x;r.navProgressY=r.y;
  if (moved>=CFG.NAV_STUCK_MIN_DISTANCE) return false;
  clearNavigation(r);
  r.navTargetX=tx;r.navTargetY=ty;r.navRevision=G.navigationRevision;
  queueNavigationRequest(r,tx,ty);
  r.navForcedReplans=(r.navForcedReplans||0)+1;
  return true;
}
function navigationDebugPoints(unit) {
  const points=[];
  if(unit.navWaypoint) points.push(unit.navWaypoint);
  if(unit.navPath) for(let index=unit.navPathIndex||0;index<unit.navPath.length;index++) points.push(unit.navPath[index]);
  const recentlyMoving=Number.isFinite(unit.navDebugTick)&&G.tick-unit.navDebugTick<=2;
  const explicitTarget=unit.manualTargetEnemy?{x:unit.manualTargetEnemy.x,y:unit.manualTargetEnemy.y}:
    unit.manualTarget?unit.manualTarget:
    unit.guardTarget?{x:unit.guardTarget.x,y:unit.guardTarget.y}:
    unit.attacking?.center?unit.attacking.center():null;
  const target=explicitTarget||(recentlyMoving?unit.navDebugTarget:null)||(
    Number.isFinite(unit.targetX)&&Number.isFinite(unit.targetY)?{x:unit.targetX,y:unit.targetY}:null
  );
  if(target&&(!points.length||Math.hypot(points[points.length-1].x-target.x,points[points.length-1].y-target.y)>2)) points.push(target);
  if(!points.length) points.push({x:unit.x,y:unit.y});
  return points;
}
function navigationDebugUnits() {
  const combatPhase=G.phase==='night'||G.phase==='dusk';
  const residents=G.residents.filter(resident=>combatPhase?resident.isGuard:(!resident.isGuard||resident.state==='GUARD_GOING_HOME'));
  return combatPhase?[...residents,...G.enemies.filter(enemy=>enemy.alive&&isWorldVisible(enemy.x,enemy.y))]:residents;
}
function isCellBlocked(col, row, excludeBld) {
  if (col<0 || row<0 || col>=CFG.WORLD_COLS || row>=CFG.WORLD_ROWS) return true;
  for (const b of G.buildings) {
    if (b === excludeBld) continue;
    const def = BLD_DEFS[b.type];
    if (col>=b.col && col<b.col+def.sz[0] && row>=b.row && row<b.row+def.sz[1]) return true;
  }
  return ensureResourceCellIndex().has(col+row*CFG.WORLD_COLS);
}
