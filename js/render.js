// ============================================================
// RENDERER
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let nightOverlayCanvas=null, nightOverlayCtx=null;

function resizeCanvas() {
  const container = document.getElementById('game-container');
  const debugPanel = document.getElementById('debug-panel');
  const buildingPanel = document.getElementById('building-panel');
  const gap = 8 * 2; // gap between panels
  const availW = container.clientWidth - debugPanel.offsetWidth - buildingPanel.offsetWidth - gap;
  const availH = container.clientHeight;
  const w = Math.max(400, availW);
  const h = Math.max(300, availH);
  canvas.width = w;
  canvas.height = h;
  CFG.CANVAS_W = w;
  CFG.CANVAS_H = h;
}
window.addEventListener('resize', () => {
  clearTimeout(window._resizeTimer);
  window._resizeTimer = setTimeout(resizeCanvas, 200);
});
resizeCanvas();

function clampCamera() {
  const halfW = CFG.CANVAS_W / (2 * G.cam.zoom);
  const halfH = CFG.CANVAS_H / (2 * G.cam.zoom);
  if (halfW * 2 >= CFG.WORLD_W) {
    G.cam.x = CFG.WORLD_W / 2;
  } else {
    G.cam.x = clamp(G.cam.x, halfW, CFG.WORLD_W - halfW);
  }
  if (halfH * 2 >= CFG.WORLD_H) {
    G.cam.y = CFG.WORLD_H / 2;
  } else {
    G.cam.y = clamp(G.cam.y, halfH, CFG.WORLD_H - halfH);
  }
}

function getAlpha() {
  if (G.phase==='day') return 0;
  if (G.phase==='night') return 0.55;
  if (G.phase==='dusk') return 0.55*(G.dayTime/CFG.TRANSITION);
  return 0.55*(1-G.dayTime/CFG.TRANSITION);
}

function drawGroundDetails(vpL, vpT, vpR, vpB, nightAlpha) {
  if (G.cam.zoom < 0.48) return;
  ctx.strokeStyle = nightAlpha > 0.3 ? 'rgba(115,145,106,0.16)' : 'rgba(172,205,139,0.2)';
  ctx.lineWidth = 1 / G.cam.zoom;
  for (let col=vpL; col<=vpR; col++) {
    for (let row=vpT; row<=vpB; row++) {
      const hash = ((col * 73856093) ^ (row * 19349663)) >>> 0;
      if (hash % 5 !== 0) continue;
      const x = gridX(col) + 8 + (hash % 23);
      const y = gridY(row) + 12 + ((hash >>> 5) % 18);
      ctx.beginPath();
      ctx.moveTo(x, y + 3); ctx.lineTo(x - 2, y - 2);
      ctx.moveTo(x, y + 3); ctx.lineTo(x + 2, y - 3);
      ctx.stroke();
    }
  }
}

function drawFogOverlay(vpL,vpT,vpR,vpB) {
  if (!G.fogVisible) return;
  ctx.fillStyle='rgba(6,12,10,0.97)';
  for (let col=vpL; col<=vpR; col++) {
    for (let row=vpT; row<=vpB; row++) {
      if (!isFogCellVisible(col,row)) ctx.fillRect(gridX(col),gridY(row),CFG.CELL+0.5,CFG.CELL+0.5);
    }
  }
}

function drawNightLights(nightAlpha) {
  if (nightAlpha<=0) return;
  if (!nightOverlayCanvas) {
    nightOverlayCanvas=document.createElement('canvas');
    nightOverlayCtx=nightOverlayCanvas.getContext('2d');
  }
  if (nightOverlayCanvas.width!==CFG.CANVAS_W||nightOverlayCanvas.height!==CFG.CANVAS_H) {
    nightOverlayCanvas.width=CFG.CANVAS_W; nightOverlayCanvas.height=CFG.CANVAS_H;
  }
  nightOverlayCtx.clearRect(0,0,CFG.CANVAS_W,CFG.CANVAS_H);
  nightOverlayCtx.fillStyle=`rgba(10,10,40,${nightAlpha})`;
  nightOverlayCtx.fillRect(0,0,CFG.CANVAS_W,CFG.CANVAS_H);
  nightOverlayCtx.globalCompositeOperation='destination-out';
  for(const b of G.buildings) {
    if (b.hp<=0||b.blueprint||b.constructionTimer>0) continue;
    const radius=nightLightRadius(b);
    if (!radius) continue;
    const c=b.center(), screen=worldToScreen(c.x,c.y), screenRadius=radius*G.cam.zoom;
    if (screen.x+screenRadius<0||screen.x-screenRadius>CFG.CANVAS_W||screen.y+screenRadius<0||screen.y-screenRadius>CFG.CANVAS_H) continue;
    const gradient=nightOverlayCtx.createRadialGradient(screen.x,screen.y,0,screen.x,screen.y,screenRadius);
    gradient.addColorStop(0,'rgba(0,0,0,0.94)');
    gradient.addColorStop(0.38,'rgba(0,0,0,0.76)');
    gradient.addColorStop(0.78,'rgba(0,0,0,0.28)');
    gradient.addColorStop(0.94,'rgba(0,0,0,0.06)');
    gradient.addColorStop(1,'rgba(0,0,0,0)');
    nightOverlayCtx.fillStyle=gradient; nightOverlayCtx.fillRect(screen.x-screenRadius,screen.y-screenRadius,screenRadius*2,screenRadius*2);
  }
  nightOverlayCtx.globalCompositeOperation='source-over';
  ctx.drawImage(nightOverlayCanvas,0,0);
}

function drawBuildingCoverage(type,cx,cy,valid=true,level=1) {
  const coverage=buildingCoverage(type,level);
  if (!coverage) return;
  ctx.save();
  ctx.fillStyle=valid?coverage.fill:'rgba(255,92,76,0.08)';
  ctx.beginPath(); ctx.arc(cx,cy,coverage.radius,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=valid?coverage.stroke:'rgba(255,105,90,0.72)'; ctx.lineWidth=1/G.cam.zoom;
  if (coverage.dash) ctx.setLineDash(coverage.dash);
  ctx.beginPath(); ctx.arc(cx,cy,coverage.radius,0,Math.PI*2); ctx.stroke();
  ctx.setLineDash([]); ctx.restore();
}

function drawNavigationDebug() {
  if(!G.debugShowNavigation) return;
  const units=navigationDebugUnits();
  ctx.save();ctx.lineWidth=1.35/G.cam.zoom;ctx.lineJoin='round';ctx.lineCap='round';
  for(const unit of units) {
    const points=navigationDebugPoints(unit);
    if(!points.length) continue;
    const color=unit.isGuard?'#75e69a':unit.type&&ENEMY_DEFS[unit.type]?'#ff7168':'#65c8f2';
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.globalAlpha=0.78;
    ctx.beginPath();ctx.arc(unit.x,unit.y,4.5/G.cam.zoom,0,Math.PI*2);ctx.stroke();
    ctx.setLineDash(unit.navPending?[5/G.cam.zoom,4/G.cam.zoom]:[]);
    ctx.beginPath();ctx.moveTo(unit.x,unit.y);
    for(const point of points) ctx.lineTo(point.x,point.y);
    ctx.stroke();ctx.setLineDash([]);
    for(let index=0;index<points.length-1;index++) {
      ctx.beginPath();ctx.arc(points[index].x,points[index].y,2.6/G.cam.zoom,0,Math.PI*2);ctx.fill();
    }
    const target=points[points.length-1],radius=5/G.cam.zoom;
    ctx.beginPath();ctx.arc(target.x,target.y,radius,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(target.x-radius*1.45,target.y);ctx.lineTo(target.x+radius*1.45,target.y);
    ctx.moveTo(target.x,target.y-radius*1.45);ctx.lineTo(target.x,target.y+radius*1.45);ctx.stroke();
  }
  ctx.restore();
}
function drawGuardCommandMarkers() {
  for(const marker of G.commandMarkers) {
    const progress=1-marker.life/marker.maxLife,alpha=clamp(marker.life/marker.maxLife,0,1);
    const radius=(9+progress*14)/G.cam.zoom;
    const rejected=marker.type==='invalid';
    ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=marker.type==='attack'||rejected?'#ef6d62':'#9ee68f';ctx.lineWidth=2/G.cam.zoom;
    ctx.beginPath();ctx.arc(marker.x,marker.y,radius,0,Math.PI*2);ctx.stroke();
    const arm=5/G.cam.zoom;
    ctx.beginPath();
    if(marker.type==='attack'||rejected) {
      ctx.moveTo(marker.x-arm,marker.y-arm);ctx.lineTo(marker.x+arm,marker.y+arm);
      ctx.moveTo(marker.x+arm,marker.y-arm);ctx.lineTo(marker.x-arm,marker.y+arm);
    } else {
      ctx.moveTo(marker.x-arm,marker.y);ctx.lineTo(marker.x+arm,marker.y);
      ctx.moveTo(marker.x,marker.y-arm);ctx.lineTo(marker.x,marker.y+arm);
    }
    ctx.stroke();ctx.restore();
  }
}

function render() {
  const alpha=getAlpha();
  ctx.clearRect(0,0,CFG.CANVAS_W,CFG.CANVAS_H);

  // Camera transform
  ctx.save();
  ctx.translate(CFG.CANVAS_W/2, CFG.CANVAS_H/2);
  ctx.scale(G.cam.zoom, G.cam.zoom);
  ctx.translate(-G.cam.x, -G.cam.y);

  // Ground
  ctx.fillStyle=lerpColor('#3d5a3d','#1a2a1a',alpha);
  ctx.fillRect(0,0,CFG.WORLD_W,CFG.WORLD_H);

  const vpW = CFG.CANVAS_W / G.cam.zoom, vpH = CFG.CANVAS_H / G.cam.zoom;
  const viewLeft = G.cam.x - vpW/2, viewTop = G.cam.y - vpH/2;
  const viewRight = G.cam.x + vpW/2, viewBottom = G.cam.y + vpH/2;
  const vpL = Math.max(0, Math.floor(viewLeft / CFG.CELL));
  const vpT = Math.max(0, Math.floor(viewTop / CFG.CELL));
  const vpR = Math.min(CFG.WORLD_COLS - 1, Math.ceil(viewRight / CFG.CELL));
  const vpB = Math.min(CFG.WORLD_ROWS - 1, Math.ceil(viewBottom / CFG.CELL));
  const inView = (x,y,pad=80) => x>=viewLeft-pad && x<=viewRight+pad && y>=viewTop-pad && y<=viewBottom+pad;

  drawGroundDetails(vpL, vpT, vpR, vpB, alpha);

  // Floor overlay (bottom layer, viewport-culled)
  if (G.floorMask) {
    ctx.fillStyle = '#9a8a6a';
    for (let c = vpL; c <= vpR; c++)
      for (let r = vpT; r <= vpB; r++)
        if (G.floorMask[c + r * CFG.WORLD_COLS])
          ctx.fillRect(gridX(c), gridY(r), CFG.CELL, CFG.CELL);
  }

  // Grid
  ctx.strokeStyle=alpha>0.3?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.08)';
  ctx.lineWidth=1/G.cam.zoom;
  for (let c=vpL;c<=vpR+1;c++) { ctx.beginPath(); ctx.moveTo(c*CFG.CELL,vpT*CFG.CELL); ctx.lineTo(c*CFG.CELL,(vpB+1)*CFG.CELL); ctx.stroke(); }
  for (let r=vpT;r<=vpB+1;r++) { ctx.beginPath(); ctx.moveTo(vpL*CFG.CELL,r*CFG.CELL); ctx.lineTo((vpR+1)*CFG.CELL,r*CFG.CELL); ctx.stroke(); }

  // Moving ghost
  if (G.placingMode && G.movingBuilding && G.hoveredCell) {
    const b=G.movingBuilding, def=BLD_DEFS[b.type];
    const wp=screenToWorld(G.mouseX, G.mouseY);
    const cp=pixelCenterPlacement(b.type, wp.x, wp.y);
    const ok=canPlaceBuilding(b.type, cp.col, cp.row, b);
    ctx.fillStyle=ok?'rgba(0,255,0,0.35)':'rgba(255,0,0,0.35)';
    ctx.fillRect(gridX(cp.col),gridY(cp.row),def.sz[0]*CFG.CELL,def.sz[1]*CFG.CELL);
    ctx.globalAlpha=0.5; drawBuilding(b,gridX(cp.col),gridY(cp.row)); ctx.globalAlpha=1;
    drawBuildingCoverage(b.type,gridX(cp.col)+def.sz[0]*CFG.CELL/2,gridY(cp.row)+def.sz[1]*CFG.CELL/2,ok);
  }

  // Buildings
  for (const b of G.buildings) {
    if (inView(b.center().x,b.center().y,100) && !(G.placingMode && b===G.movingBuilding)) drawBuilding(b,b.x,b.y);
  }

  // Farm links are cached when the layout changes.
  for (const [a,b] of G.farmLinks) {
    const c1 = a.center(), c2 = b.center();
    ctx.strokeStyle = 'rgba(181,220,104,0.5)'; ctx.lineWidth = 2 / G.cam.zoom;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Residents
  for(const item of G.groundItems) if(item.alive&&isWorldVisible(item.x,item.y)&&inView(item.x,item.y)) drawGroundItem(item);
  for(const animal of G.animals) if(animal.alive&&isWorldVisible(animal.x,animal.y)&&inView(animal.x,animal.y)) drawAnimal(animal);
  for (const r of G.residents) if (!r.hidden && inView(r.x,r.y)) drawResident(r);

  // Restoration beams stay visible above repaired buildings and friendly units.
  for(const b of G.buildings) if(b.type==='restoration_tower'&&inView(b.center().x,b.center().y,200)) drawRestorationBeam(b);

  // Enemies
  for (const e of G.enemies) if(e.alive && isWorldVisible(e.x,e.y) && inView(e.x,e.y)) drawEnemy(e);

  // Resource nodes
  for (const node of G.resourceNodes) {
    if (!node.alive || !inView(node.x,node.y)) continue;
    drawResourceNode(node);
  }

  // Chop selection box
  if ((G.chopMode||G.unchopMode||G.huntMode||G.unhuntMode) && G.chopStartX >= 0 && G.chopEndX >= 0) {
    const sx = Math.min(G.chopStartX, G.chopEndX), sy = Math.min(G.chopStartY, G.chopEndY);
    const ex = Math.max(G.chopStartX, G.chopEndX), ey = Math.max(G.chopStartY, G.chopEndY);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(gridX(sx), gridY(sy), (ex - sx + 1) * CFG.CELL, (ey - sy + 1) * CFG.CELL);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.strokeRect(gridX(sx), gridY(sy), (ex - sx + 1) * CFG.CELL, (ey - sy + 1) * CFG.CELL); ctx.setLineDash([]);
  }

  if (G.guardSelectStart && G.guardSelectEnd && G.guardSelectMoved) {
    const x=Math.min(G.guardSelectStart.x,G.guardSelectEnd.x), y=Math.min(G.guardSelectStart.y,G.guardSelectEnd.y);
    const w=Math.abs(G.guardSelectEnd.x-G.guardSelectStart.x), h=Math.abs(G.guardSelectEnd.y-G.guardSelectStart.y);
    ctx.fillStyle='rgba(120,184,237,0.12)'; ctx.fillRect(x,y,w,h);
    ctx.strokeStyle='rgba(120,184,237,0.9)'; ctx.lineWidth=1.5/G.cam.zoom; ctx.setLineDash([4,3]); ctx.strokeRect(x,y,w,h); ctx.setLineDash([]);
  }

  // Arrow projectiles
  for (const arrow of G.projectiles) {
    if (isWorldVisible(arrow.x,arrow.y) && inView(arrow.x,arrow.y)) drawArrowProjectile(arrow);
  }

  // Particles
  for (const p of G.particles) {
    if (!inView(p.x,p.y)) continue;
    ctx.fillStyle=p.color; ctx.globalAlpha=p.life/p.maxLife;
    ctx.beginPath(); ctx.arc(p.x,p.y,3,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
  }

  // Selection outline & range (world space)
  if (G.selectedBuilding && !G.placingMode) {
    const b=G.selectedBuilding;
    const center=b.center();
    drawBuildingCoverage(b.type,center.x,center.y,true,b.level);
    ctx.strokeStyle='#ffd700'; ctx.lineWidth=2/G.cam.zoom; ctx.setLineDash([4,4]);
    ctx.strokeRect(b.x-2,b.y-2,b.size[0]*CFG.CELL+4,b.size[1]*CFG.CELL+4);
    ctx.setLineDash([]);
  }

  // Placement hover (rendered on top of everything)
  if (G.hoveredCell && !G.placingMode && G.selectedBldType) {
    const def=BLD_DEFS[G.selectedBldType];
    const wp=screenToWorld(G.mouseX, G.mouseY);
    const cp=pixelCenterPlacement(G.selectedBldType, wp.x, wp.y);
    const ok= G.selectedBldType==='floor' ? true : canPlaceBuilding(G.selectedBldType, cp.col, cp.row);
    const pcx=gridX(cp.col)+def.sz[0]*CFG.CELL/2, pcy=gridY(cp.row)+def.sz[1]*CFG.CELL/2;
    drawBuildingCoverage(G.selectedBldType,pcx,pcy,ok);
    ctx.fillStyle=ok?'rgba(0,255,0,0.25)':'rgba(255,0,0,0.25)';
    ctx.fillRect(gridX(cp.col),gridY(cp.row),def.sz[0]*CFG.CELL,def.sz[1]*CFG.CELL);
  }
  if(G.hoveredCell&&G.fruitPlantMode) {
    const col=G.hoveredCell.col,row=G.hoveredCell.row,ok=canPlantFruitTree(col,row);
    const x=gridX(col),y=gridY(row),cx=x+CFG.CELL/2,cy=y+CFG.CELL/2;
    ctx.fillStyle=ok?'rgba(82,190,90,0.24)':'rgba(220,72,66,0.28)';ctx.fillRect(x,y,CFG.CELL,CFG.CELL);
    ctx.strokeStyle=ok?'rgba(132,225,133,0.9)':'rgba(244,104,94,0.95)';ctx.lineWidth=1.5/G.cam.zoom;
    ctx.setLineDash([4,3]);ctx.strokeRect(x+1,y+1,CFG.CELL-2,CFG.CELL-2);ctx.setLineDash([]);
    ctx.save();ctx.globalAlpha=0.72;
    drawResourceNode({type:'fruit_sapling',col,row,x:cx,y:cy,alive:true,marked:false,growTimer:1,growDuration:1});
    ctx.restore();
  }

  drawFogOverlay(vpL,vpT,vpR,vpB);
  drawNavigationDebug();
  drawGuardCommandMarkers();
  ctx.restore();

  drawCommandCursor();

  // Night overlay (screen space)
  if (alpha>0) drawNightLights(alpha);

  // Clock (screen space)
  drawClock();
}

function drawCommandCursor() {
  if (!G.hoveredCell || (!G.chopMode&&!G.unchopMode&&!G.huntMode&&!G.unhuntMode&&!G.fruitPlantMode)) return;
  const x=G.mouseX+15, y=G.mouseY+15;
  ctx.save();
  ctx.fillStyle='rgba(13,19,15,0.82)'; ctx.beginPath(); ctx.arc(x,y,11,0,Math.PI*2); ctx.fill();
  if (G.chopMode) {
    ctx.strokeStyle='#bf8146'; ctx.lineWidth=2.4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x-4,y+6); ctx.lineTo(x+5,y-5); ctx.stroke();
    ctx.fillStyle='#d6dfd8'; ctx.beginPath(); ctx.moveTo(x+1,y-7); ctx.quadraticCurveTo(x+9,y-8,x+8,y); ctx.lineTo(x+3,y+3); ctx.closePath(); ctx.fill();
  } else if(G.huntMode) {
    ctx.strokeStyle='#e5d19a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.moveTo(x-9,y);ctx.lineTo(x+9,y);ctx.moveTo(x,y-9);ctx.lineTo(x,y+9);ctx.stroke();
  } else if(G.fruitPlantMode) {
    ctx.fillStyle='#6cab57';ctx.beginPath();ctx.arc(x-3,y,4,0,Math.PI*2);ctx.arc(x+3,y-2,4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#85603d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y+7);ctx.lineTo(x,y-3);ctx.stroke();
  } else {
    ctx.strokeStyle='#e77869'; ctx.lineWidth=2.6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x-5,y-5); ctx.lineTo(x+5,y+5); ctx.moveTo(x+5,y-5); ctx.lineTo(x-5,y+5); ctx.stroke();
  }
  ctx.restore();
}

function drawResourceNode(node) {
  if(node.type==='fruit_planting') {
    ctx.fillStyle='rgba(0,0,0,0.2)';ctx.beginPath();ctx.ellipse(node.x,node.y+5,10,4,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#705139';ctx.beginPath();ctx.ellipse(node.x,node.y+2,8,3.5,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#b88a55';ctx.lineWidth=1.5/G.cam.zoom;ctx.beginPath();ctx.moveTo(node.x+4,node.y+3);ctx.lineTo(node.x+4,node.y-9);ctx.stroke();
    ctx.fillStyle='#d9c58d';ctx.beginPath();ctx.moveTo(node.x+4,node.y-9);ctx.lineTo(node.x+10,node.y-6);ctx.lineTo(node.x+4,node.y-3);ctx.closePath();ctx.fill();
    const requiredWood=node.requiredWood??CFG.FRUIT_TREE_WOOD_COST,deliveredWood=node.deliveredWood||0,materialsReady=deliveredWood>=requiredWood;
    ctx.strokeStyle=materialsReady?'#8fcf78':node.claimedBy?'#d2a45f':'rgba(225,205,142,0.72)';ctx.setLineDash([3,3]);ctx.strokeRect(node.x-13,node.y-14,26,24);ctx.setLineDash([]);
    ctx.fillStyle=materialsReady?'#9bd58a':'#e0a06a';ctx.font=`${8/G.cam.zoom}px sans-serif`;ctx.textAlign='center';ctx.fillText(`${deliveredWood}/${requiredWood}`,node.x,node.y+10);
    const progress=clamp((node.plantProgress||0)/Math.max(0.1,CFG.FRUIT_TREE_PLANT_TIME),0,1);
    ctx.fillStyle='rgba(20,28,22,0.82)';ctx.fillRect(node.x-12,node.y+13,24,3);
    ctx.fillStyle='#82bd68';ctx.fillRect(node.x-12,node.y+13,24*progress,3);
    return;
  }
  if (node.type === 'sapling'||node.type==='fruit_sapling') {
    ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(node.x,node.y+2,5,2,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#725036'; ctx.fillRect(node.x-1,node.y-5,2,8);
    ctx.fillStyle=node.type==='fruit_sapling'?'#8db65b':'#70a955'; ctx.beginPath(); ctx.arc(node.x-2,node.y-6,3,0,Math.PI*2); ctx.arc(node.x+2,node.y-7,3,0,Math.PI*2); ctx.fill();
    const growProgress = clamp(1-(node.growTimer/(node.growDuration||BLD_DEFS.forester.saplingGrowTime)),0,1);
    ctx.strokeStyle='rgba(235,240,220,0.7)'; ctx.lineWidth=1/G.cam.zoom;
    ctx.beginPath(); ctx.arc(node.x,node.y-6,6,-Math.PI/2,-Math.PI/2+Math.PI*2*growProgress); ctx.stroke();
    return;
  }
  if (node.type === 'tree'||node.type==='fruit_tree') {
    ctx.fillStyle='rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(node.x,node.y+7,11,4,0,0,Math.PI*2); ctx.fill();
    ctx.save();
    ctx.translate(node.x,node.y+7);
    if (node.shakeUntil > G.totalTime) ctx.rotate(Math.sin(G.totalTime*42)*0.07);
    ctx.translate(-node.x,-node.y-7);
    ctx.fillStyle='#65442d'; ctx.fillRect(node.x-3,node.y-7,6,14);
    ctx.fillStyle='#285d3c'; ctx.beginPath(); ctx.arc(node.x-5,node.y-10,7,0,Math.PI*2); ctx.arc(node.x+5,node.y-11,8,0,Math.PI*2); ctx.arc(node.x,node.y-17,9,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#3f7b4d'; ctx.beginPath(); ctx.arc(node.x-2,node.y-17,5,0,Math.PI*2); ctx.fill();
    if(node.type==='fruit_tree') {
      ctx.fillStyle='#d9574d';
      for(const [ox,oy] of [[-6,-13],[5,-15],[1,-22]]) { ctx.beginPath();ctx.arc(node.x+ox,node.y+oy,2.3,0,Math.PI*2);ctx.fill(); }
    }
    if (node.marked) {
      ctx.strokeStyle='#f4d77b'; ctx.lineWidth=1.5/G.cam.zoom; ctx.setLineDash([3,3]);
      ctx.strokeRect(node.x-12,node.y-27,24,36); ctx.setLineDash([]);
    }
    ctx.restore();
    return;
  }
  const cx=node.x+CFG.CELL/2, cy=node.y+CFG.CELL/2;
  ctx.fillStyle='rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx,cy+10,15,6,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx-14,cy+8); ctx.lineTo(cx-11,cy-7); ctx.lineTo(cx-2,cy-14);
  ctx.lineTo(cx+10,cy-8); ctx.lineTo(cx+15,cy+7); ctx.lineTo(cx+5,cy+12); ctx.closePath();
  ctx.fillStyle=node.type==='stone'?'#7c8580':'#765a50'; ctx.fill();
  ctx.strokeStyle=node.type==='stone'?'#aeb7b1':'#a87655'; ctx.lineWidth=1.5/G.cam.zoom; ctx.stroke();
  ctx.strokeStyle=node.type==='stone'?'rgba(225,235,228,0.45)':'rgba(224,133,73,0.75)';
  ctx.beginPath(); ctx.moveTo(cx-7,cy+4); ctx.lineTo(cx-1,cy-7); ctx.lineTo(cx+7,cy-2); ctx.stroke();
}

function drawAnimal(animal) {
  ctx.save();ctx.translate(animal.x,animal.y);ctx.scale(animal.facingRight?-1:1,1);
  ctx.fillStyle='#9f7657';ctx.beginPath();ctx.ellipse(0,1,9,6,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(-8,-2,4.5,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#806044';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-5,5);ctx.lineTo(-6,10);ctx.moveTo(4,5);ctx.lineTo(5,10);ctx.stroke();
  ctx.fillStyle='#d6b28d';ctx.beginPath();ctx.moveTo(-7,-6);ctx.lineTo(-5,-11);ctx.lineTo(-10,-7);ctx.fill();
  ctx.restore();
  if(animal.marked) {
    ctx.strokeStyle='#e8c86c';ctx.lineWidth=1.5/G.cam.zoom;ctx.setLineDash([3,3]);ctx.beginPath();ctx.arc(animal.x,animal.y,14,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  }
}

function drawGroundItem(item) {
  ctx.save();ctx.translate(item.x,item.y);
  ctx.fillStyle='rgba(0,0,0,0.24)';ctx.beginPath();ctx.ellipse(0,7,9,3,0,0,Math.PI*2);ctx.fill();
  if(item.type==='food') {
    ctx.fillStyle='#d9574d';ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#805338';ctx.lineWidth=1.5/G.cam.zoom;ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(1,-9);ctx.stroke();
    ctx.fillStyle='#6eaa5d';ctx.beginPath();ctx.ellipse(4,-7,3,1.6,-0.45,0,Math.PI*2);ctx.fill();
  } else {
    ctx.fillStyle=rc(item.type);ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.fill();
  }
  if(item.amount>1) {
    ctx.font=`${Math.max(8,10/G.cam.zoom)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='#fff';ctx.strokeStyle='rgba(0,0,0,0.8)';ctx.lineWidth=2/G.cam.zoom;ctx.strokeText(String(item.amount),9,-7);ctx.fillText(String(item.amount),9,-7);
  }
  ctx.restore();
}

function drawBlueprintBuilding(b,x,y,w,h,cx,cy,cr,def) {
  const inset=3/G.cam.zoom;
  ctx.save();
  ctx.fillStyle='rgba(20,74,105,0.76)';
  if(b.type==='farm') ctx.fillRect(x+2,y+2,w-4,h-4);
  else { ctx.beginPath();ctx.arc(cx,cy,cr,0,Math.PI*2);ctx.fill(); }

  ctx.save();
  if(b.type==='farm') { ctx.beginPath();ctx.rect(x+2,y+2,w-4,h-4);ctx.clip(); }
  else { ctx.beginPath();ctx.arc(cx,cy,cr,0,Math.PI*2);ctx.clip(); }
  ctx.strokeStyle='rgba(120,211,244,0.22)';ctx.lineWidth=1/G.cam.zoom;
  const grid=10;
  for(let gx=x;gx<=x+w;gx+=grid) { ctx.beginPath();ctx.moveTo(gx,y);ctx.lineTo(gx,y+h);ctx.stroke(); }
  for(let gy=y;gy<=y+h;gy+=grid) { ctx.beginPath();ctx.moveTo(x,gy);ctx.lineTo(x+w,gy);ctx.stroke(); }
  ctx.restore();

  ctx.strokeStyle='rgba(151,229,255,0.96)';ctx.lineWidth=2/G.cam.zoom;ctx.setLineDash([6/G.cam.zoom,4/G.cam.zoom]);
  if(b.type==='farm') ctx.strokeRect(x+inset,y+inset,w-inset*2,h-inset*2);
  else { ctx.beginPath();ctx.arc(cx,cy,Math.max(2,cr-inset),0,Math.PI*2);ctx.stroke(); }
  ctx.setLineDash([]);

  ctx.strokeStyle='rgba(190,239,255,0.82)';ctx.lineWidth=1.2/G.cam.zoom;
  ctx.beginPath();ctx.moveTo(x+7,cy);ctx.lineTo(x+w-7,cy);ctx.moveTo(cx,y+7);ctx.lineTo(cx,y+h-7);ctx.stroke();
  const frameW=Math.max(14,w*0.42),frameH=Math.max(14,h*0.42);
  ctx.strokeRect(cx-frameW/2,cy-frameH/2,frameW,frameH);
  ctx.beginPath();ctx.moveTo(cx-frameW/2,cy-frameH/2);ctx.lineTo(cx+frameW/2,cy+frameH/2);
  ctx.moveTo(cx+frameW/2,cy-frameH/2);ctx.lineTo(cx-frameW/2,cy+frameH/2);ctx.stroke();

  ctx.fillStyle='rgba(218,247,255,0.96)';ctx.font='700 8px Arial,sans-serif';ctx.textAlign='center';
  ctx.fillText(def.icon,cx,cy+3);
  const totalCost=Object.values(b.constructCost||{}).reduce((sum,value)=>sum+value,0);
  const totalDone=Object.values(b.constructDelivered||{}).reduce((sum,value)=>sum+value,0);
  const ratio=totalCost>0?clamp(totalDone/totalCost,0,1):0;
  const barW=w-8,barH=5;
  ctx.fillStyle='rgba(5,24,36,0.86)';ctx.fillRect(x+4,y+h-12,barW,barH);
  ctx.fillStyle='#74d8ff';ctx.fillRect(x+4,y+h-12,barW*ratio,barH);
  ctx.fillStyle='#e4f8ff';ctx.font='7px Arial,sans-serif';ctx.fillText(Math.floor(totalDone)+'/'+totalCost,cx,y+h-6);
  ctx.restore();
}

function drawBuilding(b, x, y) {
  const def=buildingRuntimeDef(b), w=def.sz[0]*CFG.CELL, h=def.sz[1]*CFG.CELL, cx=x+w/2, cy=y+h/2;
  const cr = b.collisionRadius();
  if (b.ruin) {
    drawRuin(b,x,y,w,h,cx,cy);
    return;
  }
  if(b.blueprint) {
    drawBlueprintBuilding(b,x,y,w,h,cx,cy,cr,def);
    return;
  }
  ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=1; ctx.setLineDash([3,6]); ctx.strokeRect(x+1,y+1,w-2,h-2); ctx.setLineDash([]);
  ctx.save(); ctx.shadowColor='rgba(0,0,0,0.42)'; ctx.shadowBlur=7/G.cam.zoom; ctx.shadowOffsetY=3/G.cam.zoom;
  ctx.fillStyle=buildingColor(b.type);
  if (b.type==='farm') ctx.fillRect(x+3,y+3,w-6,h-6);
  else { ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI*2); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle='rgba(238,238,220,0.5)'; ctx.lineWidth=1.5/G.cam.zoom;
  if (b.type==='farm') ctx.strokeRect(x+3,y+3,w-6,h-6);
  else { ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI*2); ctx.stroke(); }
  ctx.strokeStyle='rgba(255,255,255,0.13)'; ctx.lineWidth=3/G.cam.zoom;
  if (b.type==='farm') { ctx.beginPath(); ctx.moveTo(x+7,y+7); ctx.lineTo(x+w-7,y+7); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(cx-2,cy-2,Math.max(2,cr-5),Math.PI*1.05,Math.PI*1.8); ctx.stroke(); }
  drawBuildingDetails(b,cx,cy,cr,w,h);
  if (!b.blueprint && def.needsManning) {
    const post = b.guardSpot();
    const guard = b.assignedGuard;
    ctx.fillStyle = guard ? 'rgba(112,170,238,0.9)' : 'rgba(220,220,190,0.32)';
    ctx.beginPath(); ctx.arc(post.x, post.y, guard ? 3 : 2, 0, Math.PI*2); ctx.fill();
  }
  if (b.hp<b.maxHp && !b.blueprint && b.constructionTimer <= 0) {
    const bw=w-8, bh=4;
    ctx.fillStyle='#333'; ctx.fillRect(x+4,y-8,bw,bh);
    ctx.fillStyle=b.hp/b.maxHp>0.5?'#4a4':'#a44'; ctx.fillRect(x+4,y-8,bw*(b.hp/b.maxHp),bh);
  }
  // Construction progress (bottom-to-top fill)
  if (!b.blueprint && b.constructionTimer > 0) {
    const bt = b.constructionDuration||constructionWorkDuration(b);
    const prog = 1 - b.constructionTimer / bt;
    ctx.fillStyle = b.upgrading?'rgba(238,194,74,0.5)':'rgba(100,180,255,0.5)';
    ctx.fillRect(x, y + h*(1-prog), w, h*prog);
    ctx.fillStyle = '#fff'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText((b.upgrading?'升级 ':'')+Math.floor(prog*100)+'%', cx, cy);
  }
  if (!b.blueprint && b.constructionTimer <= 0) {
    ctx.fillStyle='rgba(245,240,218,0.88)'; ctx.font='700 8px Arial,sans-serif'; ctx.textAlign='center'; ctx.fillText(def.icon,cx,cy+3);
  }

  if (!b.blueprint && b.constructionTimer<=0 && def.cat==='production' && b.type!=='forester') {
    ctx.strokeStyle='rgba(226,200,120,0.75)'; ctx.lineWidth=2/G.cam.zoom;
    ctx.beginPath(); ctx.arc(cx,cy,cr+4,-Math.PI/2,-Math.PI/2+Math.PI*2*clamp(b.productionProgress,0,1)); ctx.stroke();
    let warning='';
    if (def.sourceType && !findResourceNode(b,def.sourceType)) warning='缺矿';
    else if (def.inputs && !b.productionRoundActive && b.pendingOutput < productionBufferCapacity(b)) {
      const inputType=nextProductionInputType(b);
      warning=inputType&&availableProductionInputAmount(inputType)<productionInputUnreservedNeed(b,inputType)?'缺料':'备料';
    }
    if (warning) {
      ctx.fillStyle='rgba(80,24,18,0.9)'; ctx.fillRect(cx-13,y-9,26,10);
      ctx.fillStyle='#ffd0b8'; ctx.font='8px sans-serif'; ctx.textAlign='center'; ctx.fillText(warning,cx,y-1);
    }
  }
  // Storage capacity bar (per-building) - skip for blueprints
  if (!b.blueprint && isStorage(b.type) && def.capacity && b.type!=='town_hall') {
    const stored = Object.values(b.stored||{}).reduce((a,v)=>a+v, 0);
    const cap = storageCapacity(b);
    const ratio = cap > 0 ? Math.min(1, stored / cap) : 0;
    const barW = w - 8, barH = 6;
    ctx.fillStyle = '#333'; ctx.fillRect(x+4, y+h-12, barW, barH);
    ctx.fillStyle = ratio > 0.8 ? '#f84' : ratio > 0.5 ? '#fa4' : '#4a4';
    ctx.fillRect(x+4, y+h-12, barW * ratio, barH);
    ctx.fillStyle = '#fff'; ctx.font = '7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${stored}/${cap}`, cx, y+h-7);
  }

  if (!b.blueprint && b.upgrading && b.constructionTimer<=0) {
    const total=Object.values(b.constructCost||{}).reduce((sum,value)=>sum+value,0);
    const delivered=Object.values(b.constructDelivered||{}).reduce((sum,value)=>sum+value,0);
    const ratio=total>0?clamp(delivered/total,0,1):0;
    ctx.strokeStyle='rgba(255,215,84,0.9)';ctx.lineWidth=3/G.cam.zoom;ctx.beginPath();ctx.arc(cx,cy,cr+3,-Math.PI/2,-Math.PI/2+Math.PI*2*ratio);ctx.stroke();
  }
  if (!b.blueprint && def.recruits && b.recruitQueue>0) {
    ctx.fillStyle=def.recruits==='guard'?'rgba(100,150,255,0.42)':'rgba(100,255,100,0.42)';
    ctx.beginPath(); ctx.arc(cx,cy,cr-3,-Math.PI/2,-Math.PI/2+Math.PI*2*b.recruitProgress); ctx.lineTo(cx,cy); ctx.fill();
  }
  if (!b.blueprint && b.constructionTimer <= 0 && def.maxWorkers>0) {
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(x+2,y+h-14,w-4,12);
    ctx.fillStyle='#fff'; ctx.font='9px sans-serif'; ctx.textAlign='center';
    ctx.fillText(`W ${b.assignedWorkers}/${def.maxWorkers}`,cx,cy+h/2-6);
  }
  if (!b.blueprint && b.type==='arrow_tower') {
    const guardAssigned = !!b.assignedGuard;
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(x+2,y+h-14,w-4,12);
    ctx.fillStyle=guardAssigned?'#e5c66c':'#aeb8ad'; ctx.font='8px sans-serif'; ctx.textAlign='center';
    ctx.fillText(`G ${guardAssigned?'1':'0'}/1`,cx,cy+h/2-6);
  }
  if (!b.blueprint && b.type==='house') {
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(x+2,y+h-14,w-4,12);
    ctx.fillStyle='#fff'; ctx.font='9px sans-serif'; ctx.textAlign='center';
    ctx.fillText(`H ${b.residentCount}/${houseCapacity(b)}`,cx,cy+h/2-6);
  }
  if (!b.blueprint && b.type==='barracks') {
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(x+2,y+h-14,w-4,12);
    ctx.fillStyle='#d3a06e'; ctx.font='9px sans-serif'; ctx.textAlign='center';
    ctx.fillText(`G ${b.guardResidentCount||0}/${guardCapacity(b)}`,cx,cy+h/2-6);
  }
  if (!b.blueprint && def.cat==='production' && b.pendingOutput > 0) {
    ctx.fillStyle='rgba(255,214,126,0.92)'; ctx.font='700 8px Arial,sans-serif'; ctx.textAlign='center';
    ctx.fillText(`产 ${b.pendingOutput}/${productionBufferCapacity(b)}`, cx, y-4);
  }
  const loadedInputs=Object.values(b.productionInputs||{}).reduce((sum,amount)=>sum+amount,0);
  if (!b.blueprint && def.inputs && loadedInputs>0) {
    const required=Object.values(def.inputs).reduce((sum,amount)=>sum+amount*productionBufferCapacity(b),0);
    ctx.fillStyle='rgba(187,224,255,0.94)';ctx.font='700 8px Arial,sans-serif';ctx.textAlign='center';
    ctx.fillText(`料 ${loadedInputs}/${required}`,cx,y-13);
  }
}

function drawRuin(b,x,y,w,h,cx,cy) {
  ctx.save();
  ctx.fillStyle='rgba(35,29,24,0.58)'; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle='rgba(164,117,79,0.64)'; ctx.lineWidth=1.4/G.cam.zoom;
  ctx.beginPath(); ctx.moveTo(x+4,y+h-5); ctx.lineTo(x+w*0.32,y+h*0.42); ctx.lineTo(x+w*0.55,y+h-7); ctx.lineTo(x+w-5,y+h*0.68); ctx.stroke();
  ctx.fillStyle='rgba(117,89,67,0.92)';
  for (const [ox,oy,r] of [[-10,6,5],[2,9,7],[12,3,4],[-2,-4,4]]) {
    ctx.beginPath(); ctx.arc(cx+ox,cy+oy,r,0,Math.PI*2); ctx.fill();
  }
  ctx.strokeStyle='rgba(229,183,119,0.68)'; ctx.lineWidth=1/G.cam.zoom; ctx.setLineDash([3,3]);
  ctx.strokeRect(x+2,y+2,w-4,h-4); ctx.setLineDash([]);
  ctx.fillStyle='rgba(239,207,155,0.92)'; ctx.font=`700 ${Math.max(9,10/G.cam.zoom)}px Arial,sans-serif`; ctx.textAlign='center';
  ctx.fillText('废墟',cx,y+h+11/G.cam.zoom);
  ctx.restore();
}

function drawArrowProjectile(arrow) {
  ctx.save();
  ctx.translate(arrow.x,arrow.y); ctx.rotate(arrow.angle);
  ctx.strokeStyle='#d8c28b'; ctx.lineWidth=1.4/G.cam.zoom;
  ctx.beginPath(); ctx.moveTo(-9,0); ctx.lineTo(5,0); ctx.stroke();
  ctx.fillStyle='#f0e2b0';
  ctx.beginPath(); ctx.moveTo(7,0); ctx.lineTo(2,-2.5); ctx.lineTo(2,2.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='#876d4b'; ctx.lineWidth=1/G.cam.zoom;
  ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(-11,-3); ctx.moveTo(-8,0); ctx.lineTo(-11,3); ctx.stroke();
  ctx.restore();
}

function drawRestorationBeam(tower) {
  if(!tower.repairTarget||!restorationTargetValid(tower,tower.repairTarget)) return;
  const start=tower.center(),end=restorationTargetPoint(tower.repairTarget);
  const pulse=(Math.sin(G.totalTime*8)+1)*0.5;
  ctx.save();ctx.lineCap='round';
  ctx.strokeStyle=`rgba(92,229,216,${0.25+pulse*0.12})`;ctx.lineWidth=5/G.cam.zoom;
  ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();
  ctx.strokeStyle='rgba(210,255,248,0.9)';ctx.lineWidth=1.2/G.cam.zoom;ctx.setLineDash([5/G.cam.zoom,4/G.cam.zoom]);ctx.lineDashOffset=-G.totalTime*18/G.cam.zoom;
  ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='rgba(205,255,246,0.9)';ctx.beginPath();ctx.arc(end.x,end.y,(2.5+pulse*1.5)/G.cam.zoom,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function drawBuildingDetails(b,cx,cy,cr,w,h) {
  const t=b.type;
  ctx.save(); ctx.lineWidth=1.2/G.cam.zoom;
  if (t==='farm') {
    ctx.strokeStyle='rgba(232,220,139,0.6)';
    const left=cx-w/2+7, right=cx+w/2-7, top=cy-h/2+9, bottom=cy+h/2-7;
    for (let y=top;y<=bottom;y+=6) { ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(right,y); ctx.stroke(); }
    ctx.strokeStyle='rgba(101,119,57,0.55)';
    for (let x=left+7;x<right;x+=9) { ctx.beginPath(); ctx.moveTo(x,top); ctx.lineTo(x,bottom); ctx.stroke(); }
  } else if (t==='forester') {
    ctx.fillStyle='rgba(16,64,37,0.7)';
    for (const [ox,oy,s] of [[-11,3,7],[0,-8,9],[11,4,7]]) { ctx.beginPath(); ctx.arc(cx+ox,cy+oy,s,0,Math.PI*2); ctx.fill(); }
  } else if (t==='town_hall') {
    ctx.fillStyle='rgba(52,42,31,0.55)'; ctx.fillRect(cx-18,cy-10,36,22);
    ctx.fillStyle='#d2b969'; ctx.beginPath(); ctx.moveTo(cx-22,cy-10); ctx.lineTo(cx,cy-24); ctx.lineTo(cx+22,cy-10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#eadb9b'; ctx.beginPath(); ctx.moveTo(cx,cy-24); ctx.lineTo(cx,cy-34); ctx.stroke();
    ctx.fillStyle='#a94c3d'; ctx.fillRect(cx,cy-34,10,6);
    ctx.strokeStyle='#d8e0d5';ctx.lineWidth=2/G.cam.zoom;ctx.beginPath();ctx.arc(cx+12,cy-13,4,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx+12,cy-13);ctx.lineTo(cx+25,cy-13);ctx.stroke();
  } else if (t==='house') {
    ctx.fillStyle='rgba(43,35,28,0.55)'; ctx.fillRect(cx-15,cy-8,30,20);
    ctx.fillStyle='#b96c4b'; ctx.beginPath(); ctx.moveTo(cx-19,cy-8); ctx.lineTo(cx,cy-21); ctx.lineTo(cx+19,cy-8); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#f0cf7b'; ctx.fillRect(cx-9,cy-2,5,6); ctx.fillRect(cx+4,cy-2,5,6);
  } else if (t==='nursery') {
    ctx.fillStyle='rgba(61,43,49,0.62)'; ctx.fillRect(cx-15,cy-8,30,20);
    ctx.fillStyle='#c47679'; ctx.beginPath(); ctx.moveTo(cx-19,cy-8); ctx.lineTo(cx,cy-21); ctx.lineTo(cx+19,cy-8); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#f0c6a0'; ctx.beginPath(); ctx.arc(cx,cy+2,6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#8a4d59'; ctx.fillRect(cx-2,cy+2,4,8);
  } else if (t==='barracks') {
    ctx.fillStyle='rgba(47,49,58,0.68)'; ctx.fillRect(cx-16,cy-9,32,22);
    ctx.fillStyle='#6e7f98'; ctx.beginPath(); ctx.moveTo(cx-20,cy-9); ctx.lineTo(cx,cy-22); ctx.lineTo(cx+20,cy-9); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#d8c28b'; ctx.beginPath(); ctx.moveTo(cx-8,cy-15); ctx.lineTo(cx-8,cy+5); ctx.moveTo(cx+2,cy-15); ctx.lineTo(cx+2,cy+5); ctx.stroke();
  } else if (t==='training_ground') {
    ctx.strokeStyle='rgba(233,196,119,0.74)'; ctx.strokeRect(cx-15,cy-11,30,24);
    ctx.beginPath(); ctx.moveTo(cx-11,cy+8); ctx.lineTo(cx+11,cy-8); ctx.moveTo(cx-11,cy-8); ctx.lineTo(cx+11,cy+8); ctx.stroke();
    ctx.fillStyle='#b96c4b'; ctx.fillRect(cx-3,cy-18,6,9);
  } else if (t==='lamp') {
    ctx.fillStyle='rgba(255,211,102,0.16)'; ctx.beginPath(); ctx.arc(cx,cy-5,17,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#70563a'; ctx.lineWidth=2/G.cam.zoom; ctx.beginPath(); ctx.moveTo(cx,cy+13); ctx.lineTo(cx,cy-4); ctx.stroke();
    ctx.fillStyle='#ffd56a'; ctx.beginPath(); ctx.arc(cx,cy-7,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff3c1'; ctx.beginPath(); ctx.arc(cx-1,cy-8,2,0,Math.PI*2); ctx.fill();
  } else if (t.includes('storage')) {
    ctx.strokeStyle='rgba(235,220,174,0.55)'; ctx.strokeRect(cx-15,cy-13,30,26);
    ctx.beginPath(); ctx.moveTo(cx-15,cy); ctx.lineTo(cx+15,cy); ctx.moveTo(cx,cy-13); ctx.lineTo(cx,cy+13); ctx.stroke();
  } else if (t==='quarry'||t==='iron_mine') {
    ctx.fillStyle=t==='quarry'?'rgba(210,218,211,0.45)':'rgba(207,112,67,0.5)';
    for (const [ox,oy,s] of [[-10,6,8],[2,-5,10],[12,8,7]]) { ctx.beginPath(); ctx.arc(cx+ox,cy+oy,s,0,Math.PI*2); ctx.fill(); }
  } else if (t==='charcoal_kiln') {
    ctx.fillStyle='rgba(43,39,35,0.78)';ctx.beginPath();ctx.moveTo(cx-17,cy+12);ctx.lineTo(cx-13,cy-10);ctx.lineTo(cx+12,cy-10);ctx.lineTo(cx+17,cy+12);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(148,139,126,0.72)';ctx.stroke();
    ctx.fillStyle='rgba(31,34,33,0.95)';ctx.beginPath();ctx.arc(cx,cy+2,7,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(127,134,129,0.34)';ctx.beginPath();ctx.arc(cx+7,cy-18,5,0,Math.PI*2);ctx.arc(cx+11,cy-25,4,0,Math.PI*2);ctx.fill();
  } else if (t==='smelter') {
    ctx.fillStyle='rgba(48,37,30,0.7)'; ctx.fillRect(cx-15,cy-8,30,21); ctx.fillRect(cx+7,cy-23,8,18);
    ctx.fillStyle='rgba(255,190,70,0.8)'; ctx.beginPath(); ctx.arc(cx-4,cy+2,7,0,Math.PI*2); ctx.fill();
  } else if (t==='arrow_tower'||t==='auto_arrow_tower') {
    ctx.strokeStyle='rgba(240,226,185,0.65)'; ctx.beginPath(); ctx.arc(cx,cy,cr*0.55,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-cr*0.65,cy); ctx.lineTo(cx+cr*0.65,cy); ctx.moveTo(cx,cy-cr*0.65); ctx.lineTo(cx,cy+cr*0.65); ctx.stroke();
  } else if (t==='restoration_tower') {
    ctx.strokeStyle='rgba(139,244,228,0.82)';ctx.lineWidth=2/G.cam.zoom;
    ctx.beginPath();ctx.arc(cx,cy,cr*0.58,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx-cr*0.38,cy);ctx.lineTo(cx+cr*0.38,cy);ctx.moveTo(cx,cy-cr*0.38);ctx.lineTo(cx,cy+cr*0.38);ctx.stroke();
    ctx.fillStyle='rgba(118,226,214,0.28)';ctx.beginPath();ctx.arc(cx,cy,cr*0.4,0,Math.PI*2);ctx.fill();
  } else if (t==='wall') {
    ctx.strokeStyle='rgba(238,238,225,0.38)';
    for (let yy=-6;yy<=6;yy+=6) { ctx.beginPath(); ctx.moveTo(cx-cr*0.65,cy+yy); ctx.lineTo(cx+cr*0.65,cy+yy); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx,cy-12); ctx.lineTo(cx,cy-6); ctx.moveTo(cx-7,cy-6); ctx.lineTo(cx-7,cy); ctx.moveTo(cx+7,cy); ctx.lineTo(cx+7,cy+6); ctx.stroke();
  }
  ctx.restore();
}

function buildingColor(t) {
  return {town_hall:'#8a7a4a',house:'#5b8c5a',nursery:'#8b5961',barracks:'#58697b',training_ground:'#765a4b',lamp:'#806d42',farm:'#8b9a4b',forester:'#3d7a3d',quarry:'#8a8a8a',iron_mine:'#6a5a4a',charcoal_kiln:'#4f4b45',smelter:'#c86428',food_storage:'#8a6a3a',wood_storage:'#8a7a3a',stone_storage:'#7a7a6a',iron_storage:'#6a5a3a',charcoal_storage:'#4b514e',ingot_storage:'#5a6a7a',arrow_tower:'#8a5a4a',auto_arrow_tower:'#4a8afa',restoration_tower:'#387c78',wall:'#7a7a6a'}[t]||'#777';
}

function drawResidentAxeIcon(x, y) {
  ctx.save();
  ctx.fillStyle='rgba(19,27,22,0.78)'; ctx.beginPath(); ctx.arc(x,y,9,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#b77d45'; ctx.lineWidth=2; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x-3,y+5); ctx.lineTo(x+4,y-5); ctx.stroke();
  ctx.fillStyle='#c7d1cb'; ctx.beginPath(); ctx.moveTo(x+1,y-6); ctx.quadraticCurveTo(x+8,y-7,x+7,y); ctx.lineTo(x+3,y+2); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawResidentFoodIcon(x, y, hungerLevel=0) {
  ctx.save();
  ctx.fillStyle='rgba(19,27,22,0.78)'; ctx.beginPath(); ctx.arc(x,y,9,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=hungerLevel>=2?'#e0524d':hungerLevel===1?'#d8873f':'#d9574d'; ctx.beginPath(); ctx.arc(x,y+1,4.8,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=hungerLevel>=2?'#ff8c83':hungerLevel===1?'#f0bd66':'#f39a86'; ctx.lineWidth=hungerLevel?1.4:0.9; ctx.beginPath(); ctx.arc(x,y+1,4.8,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle='#805338'; ctx.lineWidth=1.5; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(x,y-3); ctx.lineTo(x+0.4,y-6); ctx.stroke();
  ctx.fillStyle='#6eaa5d'; ctx.beginPath(); ctx.ellipse(x+3,y-4,2.4,1.3,-0.5,0,Math.PI*2); ctx.fill();
  if(hungerLevel>=2) { ctx.strokeStyle='#ff726b';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.stroke(); }
  ctx.restore();
}
function drawResidentHungerBadge(x,y,hungerLevel) {
  if(hungerLevel<=0) return;
  ctx.save();
  ctx.fillStyle='rgba(19,27,22,0.88)';ctx.beginPath();ctx.arc(x,y,5.5,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=hungerLevel>=2?'#ff665f':'#e4a34d';ctx.lineWidth=hungerLevel>=2?1.4:1;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle=hungerLevel>=2?'#e0524d':'#d8873f';ctx.beginPath();ctx.arc(x,y+0.7,2.7,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#805338';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y-1.5);ctx.lineTo(x+0.3,y-3.7);ctx.stroke();
  ctx.fillStyle='#77ad58';ctx.beginPath();ctx.ellipse(x+1.8,y-2.8,1.5,0.8,-0.45,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function drawResidentSleepIcon(x, y) {
  ctx.save();
  ctx.fillStyle='rgba(19,27,22,0.78)'; ctx.beginPath(); ctx.arc(x,y,9,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#a9c5d8'; ctx.beginPath(); ctx.arc(x-1,y,4.8,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(19,27,22,0.92)'; ctx.beginPath(); ctx.arc(x+1.8,y-1.8,4.8,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#d7e7ef'; ctx.beginPath(); ctx.arc(x+4,y+4,1,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawResidentHuntIcon(x,y) {
  ctx.save();ctx.fillStyle='rgba(19,27,22,0.78)';ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#e5d19a';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.moveTo(x-7,y);ctx.lineTo(x+7,y);ctx.moveTo(x,y-7);ctx.lineTo(x,y+7);ctx.stroke();ctx.restore();
}
function drawResidentPlantIcon(x,y) {
  ctx.save();ctx.fillStyle='rgba(19,27,22,0.78)';ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#9a7048';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(x+4,y+6);ctx.lineTo(x-3,y-4);ctx.stroke();
  ctx.fillStyle='#77ad58';ctx.beginPath();ctx.ellipse(x-4,y-5,3.5,2,-0.5,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawResident(r) {
  const hungerLevel=r.isGuard?0:Math.min(2,Math.max(0,Math.floor(r.missedMeals||0)));
  const bodyColor = r.isGuard
    ? {GUARD_SLEEPING:'#6688aa',GUARD_FIND_TOWER:'#ff6644',GUARD_MANNING:'#4488ff',
       GUARD_FIGHTING:'#ff3333',GUARD_RETURNING:'#ff8800',GUARD_HEALING:'#44cc44',GUARD_GOING_HOME:'#8294c8'}[r.state]||'#ff6644'
    : !r.home && (G.phase==='night'||G.phase==='dusk')?'#ff4444'
    :r.state==='SLEEPING'||r.state==='GOING_HOME'?'#8899cc'
    :r.state==='GOING_TO_EAT'||r.state==='EATING'?'#ffcc44'
    :r.state==='HAULING'?'#44ccff'
    :r.state==='WORKING'||r.state==='GOING_TO_WORK'?'#44cc88'
	    :r.state==='GATHERING'?'#ff8800'
	    :r.state==='BUILDING'?'#ff6600'
    :r.state==='CONSTRUCTING'?'#cc6600'
    :r.state==='GOING_TO_REPAIR'||r.state==='REPAIRING'?'#57b9c1'
	    :r.isEngineer?'#ff8800'
    :'#aaaaaa';
  const cr = RESIDENT_RADIUS;
  if (G.selectedGuards.includes(r)) {
    ctx.strokeStyle=r.controlMode==='manual'?'#f2d06b':'#78b8ed';
    ctx.lineWidth=2/G.cam.zoom; ctx.setLineDash(r.controlMode==='manual'?[3,3]:[]);
    ctx.beginPath(); ctx.arc(r.x,r.y,cr+5,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.fillStyle='rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(r.x,r.y,cr,0,Math.PI*2); ctx.fill();
  ctx.save(); ctx.translate(r.x, r.y + cr/2 - 10); ctx.scale(0.5, 1.0);
  ctx.fillStyle=bodyColor; ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=hungerLevel>=2?'#ff665f':hungerLevel===1?'#e4a34d':'rgba(255,255,255,0.5)'; ctx.lineWidth=hungerLevel?1.4:0.8; ctx.stroke();
  ctx.restore();
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(r.x+2, r.y-14, 1.5, 0, Math.PI*2); ctx.fill();
  if (r.carrying) { ctx.fillStyle=rc(r.carrying.type); ctx.beginPath(); ctx.arc(r.x, r.y-22, 3, 0, Math.PI*2); ctx.fill(); }
  if (r.isGuard) {
    // Compact shield silhouette above guards.
    ctx.fillStyle='#e6d49a'; ctx.beginPath(); ctx.moveTo(r.x,r.y-29); ctx.lineTo(r.x+5,r.y-26); ctx.lineTo(r.x+4,r.y-20); ctx.lineTo(r.x,r.y-17); ctx.lineTo(r.x-4,r.y-20); ctx.lineTo(r.x-5,r.y-26); ctx.closePath(); ctx.fill();
    // Guard HP bar
    const gbw = 14, gbh = 2;
    ctx.fillStyle = '#333'; ctx.fillRect(r.x - gbw/2, r.y + cr + 4, gbw, gbh);
    const gpct = Math.max(0, r.guardHP / r.guardMaxHP);
    ctx.fillStyle = gpct > 0.5 ? '#4a4' : gpct > 0.25 ? '#fa4' : '#f44';
    ctx.fillRect(r.x - gbw/2, r.y + cr + 4, gbw * gpct, gbh);
  }
  const iconY=r.y-31;
  if (r.state==='GOING_TO_EAT'||r.state==='EATING') drawResidentFoodIcon(r.x,iconY,hungerLevel);
  else if (r.state==='GOING_HOME' || r.state==='SLEEPING' || r.state==='GUARD_GOING_HOME') drawResidentSleepIcon(r.x,iconY);
  else if(['GOING_TO_PLANT_MATERIAL','DELIVERING_PLANT_MATERIAL','GOING_TO_PLANT','PLANTING'].includes(r.state)) drawResidentPlantIcon(r.x,iconY);
  else if(r.state==='GOING_TO_HUNT'||r.state==='HUNTING') drawResidentHuntIcon(r.x,iconY);
  else if (!r.workplace && r.state==='GOING_TO_CHOP') drawResidentAxeIcon(r.x,iconY);
  if(hungerLevel>0&&r.state!=='GOING_TO_EAT'&&r.state!=='EATING') drawResidentHungerBadge(r.x+10,r.y-7,hungerLevel);
}

function drawEnemy(e) {
  const facing=enemyFacingPoint(e);
  const a=Math.atan2(facing.y-e.y,facing.x-e.x), s=e.size;
  if(e.bloodMoon) {
    ctx.save();ctx.strokeStyle='rgba(255,54,54,0.72)';ctx.lineWidth=2/G.cam.zoom;
    ctx.beginPath();ctx.arc(e.x,e.y,s*1.45,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  ctx.save(); ctx.translate(e.x,e.y); ctx.rotate(a);
  const def=ENEMY_DEFS[e.type] || ENEMY_DEFS.normal;
  ctx.fillStyle=e.attacking?'#ff4444':def.color;
  ctx.beginPath();
  if (e.type==='fast') {
    ctx.moveTo(s,0); ctx.lineTo(0,-s*0.78); ctx.lineTo(-s,0); ctx.lineTo(0,s*0.78); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle='rgba(255,230,255,0.72)'; ctx.lineWidth=1/G.cam.zoom;
    ctx.beginPath(); ctx.moveTo(-s*1.65,-s*0.35); ctx.lineTo(-s*0.55,-s*0.35); ctx.moveTo(-s*1.65,s*0.35); ctx.lineTo(-s*0.55,s*0.35); ctx.stroke();
  } else if (e.type==='breaker') {
    for(let i=0;i<6;i++) {
      const angle=Math.PI/6+i*Math.PI/3, px=Math.cos(angle)*s, py=Math.sin(angle)*s;
      if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(255,210,170,0.68)'; ctx.lineWidth=1.25/G.cam.zoom; ctx.stroke();
    ctx.fillStyle='rgba(61,24,18,0.68)'; ctx.fillRect(-s*0.25,-s*0.25,s*0.5,s*0.5);
  } else {
    ctx.moveTo(s,0); ctx.lineTo(-s,-s*0.7); ctx.lineTo(-s,s*0.7); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1/G.cam.zoom; ctx.stroke(); ctx.restore();

  if (e.hp<e.maxHp) {
    const bw=16; ctx.fillStyle='#333'; ctx.fillRect(e.x-bw/2,e.y-s-8,bw,3);
    ctx.fillStyle='#f44'; ctx.fillRect(e.x-bw/2,e.y-s-8,bw*(e.hp/e.maxHp),3);
  }
}

function rc(t) { return {food:'#d9574d',wood:'#aa8844',stone:'#aaaaaa',iron:'#cc8866',charcoal:'#4f5753',ingot:'#8fb4c5'}[t]||'#fff'; }

function lerpColor(c1,c2,t) {
  const r1=parseInt(c1.slice(1,3),16),g1=parseInt(c1.slice(3,5),16),b1=parseInt(c1.slice(5,7),16);
  const r2=parseInt(c2.slice(1,3),16),g2=parseInt(c2.slice(3,5),16),b2=parseInt(c2.slice(5,7),16);
  return `rgb(${Math.round(lerp(r1,r2,t))},${Math.round(lerp(g1,g2,t))},${Math.round(lerp(b1,b2,t))})`;
}

function drawClock() {
  const cx = CFG.CANVAS_W - 55, cy = 55, r = 38;
  const hour12=gameClockHour(),nightStart=nightStartHourForDay(G.day),nightEnd=CFG.NIGHT_END_HOUR,bloodMoon=isBloodMoonDay(G.day);

  // Clock face background
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#888'; ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = bloodMoon ? '#571c22' : '#222';
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r-3, -Math.PI/2 + (nightStart/CLOCK_HOURS)*Math.PI*2, -Math.PI/2 + (nightEnd/CLOCK_HOURS)*Math.PI*2);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = '#999';
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r-3, -Math.PI/2 + (nightEnd/CLOCK_HOURS)*Math.PI*2, -Math.PI/2 + (nightStart/CLOCK_HOURS)*Math.PI*2);
  ctx.closePath(); ctx.fill();

  // Hour markers
  ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
  for (let h=0; h<CLOCK_HOURS; h+=3) {
    const a = -Math.PI/2 + (h/CLOCK_HOURS)*Math.PI*2;
    const lx = cx + Math.cos(a)*(r-14), ly = cy + Math.sin(a)*(r-14);
    const label = h===0?String(CLOCK_HOURS):String(h);
    const isNight = clockHourInRange(h,nightStart,nightEnd);
    ctx.fillStyle = isNight ? '#fff' : '#000';
    ctx.fillText(label, lx, ly+3);
  }

  // Hour hand — pure white
  const ha = -Math.PI/2 + (hour12/CLOCK_HOURS)*Math.PI*2;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(cx,cy);
  ctx.lineTo(cx+Math.cos(ha)*(r-18), cy+Math.sin(ha)*(r-18)); ctx.stroke();

  // Center dot — pure white
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI*2); ctx.fill();
}
