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
  const c = b.center();
  const passRadius=b.collisionRadius()+RESIDENT_RADIUS+4;
  if ((b===r.workplace||b===r.home)&&Math.hypot(x1-c.x,y1-c.y)<passRadius) return false;
  const goalDist = Math.hypot(x2-c.x, y2-c.y);
  if (goalDist < b.collisionRadius() + RESIDENT_RADIUS + 4) return false;
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
function buildingInteractionRange(b) {
  return b.collisionRadius()+RESIDENT_RADIUS+16;
}
function residentReachedBuilding(unit,building) {
  if(!unit||!building) return false;
  const center=building.center();
  if(Math.hypot(unit.x-center.x,unit.y-center.y)<=building.collisionRadius()+RESIDENT_RADIUS+10) return true;
  const access=unit.buildingAccessBuilding===building?unit.buildingAccessTarget:null;
  return !!access&&Math.hypot(unit.x-access.x,unit.y-access.y)<=Math.max(10,CFG.NAV_CELL*0.75);
}
function setBuildingInteractionTarget(unit,building) {
  const target=buildingInteractionPoint(unit,building);
  unit.targetX=target.x;
  unit.targetY=target.y;
  return target;
}
function groundItemBlockingObstacle(item) {
  if(!item) return null;
  ensureObstacleSpatialHash();
  let blocker=null,bestDepth=0;
  for(const obstacle of G.obstacleSpatial.query(item.x,item.y,item.x,item.y)) {
    if(obstacle.resourceNode ? !isResourceObstacleNode(obstacle.resourceNode) : !buildingBlocksMovement(obstacle)) continue;
    const center=obstacle.center(),depth=obstacle.collisionRadius()-Math.hypot(item.x-center.x,item.y-center.y);
    if(depth>bestDepth) { blocker=obstacle;bestDepth=depth; }
  }
  return blocker;
}
function groundItemInteractionPoint(unit,item) {
  const blocker=groundItemBlockingObstacle(item);
  if(!blocker) return {x:item.x,y:item.y,blocker:null};
  const point=buildingInteractionPoint(unit,blocker);
  return {x:point.x,y:point.y,blocker};
}
function residentReachedGroundItem(unit,item,access) {
  if(Math.hypot(unit.x-item.x,unit.y-item.y)<RESIDENT_RADIUS+8) return true;
  return !!access?.blocker&&Math.hypot(unit.x-access.x,unit.y-access.y)<=Math.max(10,CFG.NAV_CELL*0.75);
}
function buildingInteractionPointClear(unit,building,point) {
  if(point.x<RESIDENT_RADIUS||point.y<RESIDENT_RADIUS||point.x>CFG.WORLD_W-RESIDENT_RADIUS||point.y>CFG.WORLD_H-RESIDENT_RADIUS) return false;
  const grid=ensureNavigationGrid(),col=Math.floor(point.x/CFG.NAV_CELL),row=Math.floor(point.y/CFG.NAV_CELL);
  if(!navigationCellOpen(col,row,grid)) return false;
  ensureObstacleSpatialHash();
  const padding=RESIDENT_RADIUS+3;
  for(const obstacle of G.obstacleSpatial.query(point.x-80,point.y-80,point.x+80,point.y+80)) {
    if(obstacle.resourceNode ? !isResourceObstacleNode(obstacle.resourceNode) : !buildingBlocksMovement(obstacle)) continue;
    const center=obstacle.center(),minimum=obstacle.collisionRadius()+padding;
    if(Math.hypot(point.x-center.x,point.y-center.y)<minimum) return false;
  }
  return true;
}
function navigationPlanDistance(unit,plan) {
  if(!plan?.points?.length) return Infinity;
  let distance=0,previous=unit;
  for(const point of plan.points) { distance+=Math.hypot(point.x-previous.x,point.y-previous.y);previous=point; }
  return distance;
}
function buildingInteractionPoint(unit,building) {
  const cached=unit.buildingAccessTarget;
  if(unit.buildingAccessBuilding===building&&unit.buildingAccessRevision===G.navigationRevision&&cached&&
      buildingInteractionPointClear(unit,building,cached)) return cached;
  const center=building.center(),radius=building.collisionRadius()+RESIDENT_RADIUS+8;
  const startAngle=Math.atan2(unit.y-center.y,unit.x-center.x),candidates=[];
  for(let index=0;index<24;index++) {
    const offset=index===0?0:(Math.ceil(index/2)*(index%2?1:-1));
    const angle=startAngle+offset*Math.PI/12;
    const point={x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius};
    if(buildingInteractionPointClear(unit,building,point)) candidates.push(point);
  }
  let best=null,bestScore=Infinity;
  for(const point of candidates) {
    if(firstBlockingObstacle(unit,point.x,point.y)) continue;
    const score=Math.hypot(point.x-unit.x,point.y-unit.y);
    if(score<bestScore){best=point;bestScore=score;}
  }
  if(!best) for(const point of candidates) {
    const plan=findNavigationPath(unit.x,unit.y,point.x,point.y);
    if(!plan?.reachedGoal||plan.blockedGoal) continue;
    const score=navigationPlanDistance(unit,plan);
    if(score<bestScore){best=point;bestScore=score;}
  }
  if(!best) {
    const angle=startAngle;
    const desired={x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius};
    const openCell=nearestOpenNavigationCell(desired.x,desired.y);
    const openPoint=openCell?navigationCellCenter(openCell.col,openCell.row):null;
    best=openPoint&&Math.hypot(openPoint.x-center.x,openPoint.y-center.y)<=buildingInteractionRange(building)+CFG.NAV_CELL
      ? openPoint
      : desired;
  }
  unit.buildingAccessTarget=best;
  unit.buildingAccessBuilding=building;
  unit.buildingAccessRevision=G.navigationRevision;
  return best;
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
function buildingUsesInteriorWorkers(building) {
  const def=building&&buildingRuntimeDef(building);
  return !!def&&(def.cat==='production'||def.recruits==='resident'||def.recruits==='guard');
}
function workplaceInteriorRange(building) {
  return Math.max(RESIDENT_RADIUS+4,building.collisionRadius()-RESIDENT_RADIUS);
}
function workplaceInteriorPoint(resident,building) {
  const workers=G.residents.filter(other=>!other.isGuard&&other.workplace===building);
  const index=Math.max(0,workers.indexOf(resident)),count=Math.max(1,workers.length),center=building.center();
  if(count===1) return center;
  const radius=Math.min(workplaceInteriorRange(building)-3,RESIDENT_RADIUS*2+4);
  const angle=-Math.PI/2+index*Math.PI*2/count;
  return {x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius};
}
function workplaceTravelPoint(resident,building) {
  if(residentReachedBuilding(resident,building)) {
    return workplaceInteriorPoint(resident,building);
  }
  return buildingInteractionPoint(resident,building);
}
function residentCanEnterOwnWorkplace(resident,building) {
  if(!resident||resident.workplace!==building||!buildingUsesInteriorWorkers(building)) return false;
  return true;
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
  if(!r.isGuard&&Object.prototype.hasOwnProperty.call(r,'missedMeals')) speed*=residentHungerMultiplier(r);
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
