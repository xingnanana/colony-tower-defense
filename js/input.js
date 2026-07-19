// ============================================================
// INPUT
// ============================================================
function issueManualGuardCommand(clientX, clientY) {
  const guards=G.selectedGuards.filter(guard=>guard.controlMode==='manual'&&!guard.hidden&&isWorldVisible(guard.x,guard.y));
  if (!guards.length) return false;
  const rect=canvas.getBoundingClientRect();
  if (clientX<rect.left || clientX>rect.right || clientY<rect.top || clientY>rect.bottom) return false;
  const wp=screenToWorld(clientX-rect.left,clientY-rect.top);
  if(!canIssueManualGuardMove(wp.x,wp.y)) {
    addGuardCommandMarker(wp.x,wp.y,'invalid');
    return true;
  }
  const enemy=G.enemies.find(e=>e.alive && isWorldVisible(e.x,e.y) && Math.hypot(e.x-wp.x,e.y-wp.y)<=e.size+8);
  if(!enemy) {
    assignGuardGroupMove(guards,wp);
    addGuardCommandMarker(wp.x,wp.y,'move');
    return true;
  }
  for (const guard of guards) {
    clearNavigation(guard);
    guard.manualTargetEnemy=enemy;
    guard.manualTarget=null;
    guard.formationCommandId=0;
    guard.targetX=enemy.x;guard.targetY=enemy.y;guard.navDebugTarget={x:enemy.x,y:enemy.y};guard.navDebugTick=G.tick;
  }
  addGuardCommandMarker(enemy.x,enemy.y,'attack');
  return true;
}

canvas.addEventListener('mousemove', e => {
  const r=canvas.getBoundingClientRect();
  const mx=e.clientX-r.left, my=e.clientY-r.top;
  G.mouseX=mx; G.mouseY=my;
  const wp=screenToWorld(mx, my);
  G.hoveredCell={col:gridCol(wp.x),row:gridRow(wp.y)};

  // Chop/Unchop drag
  if ((G.chopMode||G.unchopMode||G.huntMode||G.unhuntMode) && G.chopStartX >= 0) { G.chopEndX = gridCol(wp.x); G.chopEndY = gridRow(wp.y); return; }

  // Camera drag
  if (G.dragging) {
    const dx=mx-G.dragStartX, dy=my-G.dragStartY;
    if (!G.dragMoved && (G.dragButton===1 ? Math.hypot(dx,dy)>0 : cameraDragExceeded(dx,dy))) {
      G.dragMoved=true;
      G.dragStartX=mx; G.dragStartY=my;
      G.dragCamStartX=G.cam.x; G.dragCamStartY=G.cam.y;
    }
    if (G.dragMoved) {
      G.cam.x = G.dragCamStartX - (mx - G.dragStartX) / G.cam.zoom;
      G.cam.y = G.dragCamStartY - (my - G.dragStartY) / G.cam.zoom;
      clampCamera();
    }
  }
  if (G.guardSelectStart) {
    G.guardSelectEnd={x:wp.x,y:wp.y};
    if (Math.hypot(mx-G.guardSelectScreenX,my-G.guardSelectScreenY)>4) G.guardSelectMoved=true;
  }
});
canvas.addEventListener('mousedown', e => {
  if (e.button === 2 || e.button === 1) {
    e.preventDefault();
    const r=canvas.getBoundingClientRect();
    const mx=e.clientX-r.left, my=e.clientY-r.top;
    G.dragging=true; G.dragButton=e.button; G.dragMoved=false;
    G.dragStartX=mx; G.dragStartY=my;
    G.dragCamStartX=G.cam.x; G.dragCamStartY=G.cam.y;
    hideContextMenu();
    return;
  }
  if (e.button !== 0) return;
  const r=canvas.getBoundingClientRect();
  const mx=e.clientX-r.left, my=e.clientY-r.top;

  const wp=screenToWorld(mx, my);
  const col=gridCol(wp.x), row=gridRow(wp.y);

  // Chop/Unchop mode drag-select
  if (G.chopMode||G.unchopMode||G.huntMode||G.unhuntMode) {
    G.chopStartX = col; G.chopStartY = row; G.chopEndX = -1; G.chopEndY = -1;
    G.dragging = false;
  } else if (!G.fruitPlantMode&&!G.selectedBldType && !G.placingMode) {
    G.guardSelectStart={x:wp.x,y:wp.y}; G.guardSelectEnd={x:wp.x,y:wp.y};
    G.guardSelectScreenX=mx; G.guardSelectScreenY=my; G.guardSelectMoved=false;
  }
});
canvas.addEventListener('click', e => {
  const r=canvas.getBoundingClientRect();
  const mx=e.clientX-r.left, my=e.clientY-r.top;
  const wp=screenToWorld(mx, my);
  const col=gridCol(wp.x), row=gridRow(wp.y);

  if (G.guardSelectStart && G.guardSelectMoved) {
    const start=G.guardSelectStart, end=G.guardSelectEnd||start;
    const minX=Math.min(start.x,end.x), maxX=Math.max(start.x,end.x), minY=Math.min(start.y,end.y), maxY=Math.max(start.y,end.y);
    setSelectedGuards(G.residents.filter(resident=>resident.isGuard&&!resident.hidden&&isWorldVisible(resident.x,resident.y)&&resident.x>=minX&&resident.x<=maxX&&resident.y>=minY&&resident.y<=maxY));
    G.guardSelectStart=null; G.guardSelectEnd=null; G.guardSelectMoved=false;
    G.selectedBuilding=null; hideContextMenu();
    return;
  }
  G.guardSelectStart=null; G.guardSelectEnd=null; G.guardSelectMoved=false;

  // Apply chop/unchop selection on mouse release
  if ((G.chopMode||G.unchopMode||G.huntMode||G.unhuntMode) && G.chopStartX >= 0) {
    const ex = G.chopEndX >= 0 ? G.chopEndX : G.chopStartX;
    const ey = G.chopEndY >= 0 ? G.chopEndY : G.chopStartY;
    const minC = Math.min(G.chopStartX, ex), maxC = Math.max(G.chopStartX, ex);
    const minR = Math.min(G.chopStartY, ey), maxR = Math.max(G.chopStartY, ey);
    if(G.huntMode||G.unhuntMode) {
      for(const animal of G.animals) {
        if(!animal.alive||!isWorldVisible(animal.x,animal.y)) continue;
        const animalCol=gridCol(animal.x),animalRow=gridRow(animal.y);
        if(animalCol>=minC&&animalCol<=maxC&&animalRow>=minR&&animalRow<=maxR) animal.marked=G.huntMode;
      }
    } else {
      for (const node of G.resourceNodes) {
        if (canResidentHandHarvest(node) && isWorldVisible(node.x,node.y) && node.col >= minC && node.col <= maxC && node.row >= minR && node.row <= maxR) {
          if (G.chopMode) node.marked = true;
          else if (node.marked) node.marked = false;
        }
      }
    }
    G.chopStartX = -1; G.chopEndX = -1;
    return;
  }

  if(G.fruitPlantMode) {
    plantFruitTree(col,row);
    return;
  }

  // Floor placement on click
  if (G.selectedBldType === 'floor') {
    paintFloorCell(col, row);
    return;
  }

  if (G.dragging) {
    G.dragging = false;
    if (G.dragMoved) {
      hideContextMenu(); // close menu on drag
      return;
    }
  }
  G.dragging = false;

  const clickedGuard=G.residents.find(resident=>resident.isGuard && !resident.hidden && isWorldVisible(resident.x,resident.y) && Math.hypot(resident.x-wp.x,resident.y-wp.y)<=RESIDENT_RADIUS+5);
  if (clickedGuard) {
    setSelectedGuards([clickedGuard]); G.selectedBuilding=null; G.selectedBldType=null;
    document.querySelectorAll('.bld-btn').forEach(button=>button.classList.remove('selected'));
    hideContextMenu();
    return;
  }

  if(G.placingMode && G.movingBuilding) {
    const b=G.movingBuilding;
    const cp=pixelCenterPlacement(b.type, wp.x, wp.y);
    if(canPlaceBuilding(b.type,cp.col,cp.row,b)){
      b.col=cp.col;b.row=cp.row;b.x=gridX(cp.col);b.y=gridY(cp.row);
      invalidateNavigation();
      if (b.type==='farm') refreshFarmAdjacency();
      G.placingMode=false;G.movingBuilding=null;G.selectedBuilding=null;hideContextMenu();
      for (const r of G.residents) {
        if (r.workplace === b) r.state = 'GOING_TO_WORK';
        if (r.home === b) r.state = 'IDLE';
      }
    }
    return;
  }

  let clicked=null;
  for(const b of G.buildings){
    const d=BLD_DEFS[b.type];
    if(col>=b.col&&col<b.col+d.sz[0]&&row>=b.row&&row<b.row+d.sz[1]){clicked=b;break;}
  }

  if(clicked){
    G.selectedBuilding=clicked; clearSelectedGuards(); G.selectedBldType=null;
    document.querySelectorAll('.bld-btn').forEach(b=>b.classList.remove('selected'));
    showContextMenu(clicked,e.clientX,e.clientY);
  } else if(G.selectedBldType && !G.placingMode){
    const cp=pixelCenterPlacement(G.selectedBldType, wp.x, wp.y);
    addBuilding(G.selectedBldType,cp.col,cp.row);
  } else { G.selectedBuilding=null; clearSelectedGuards(); hideContextMenu(); }
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const newZoom = clamp(G.cam.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.3, 3);
  // Zoom toward mouse position
  const r=canvas.getBoundingClientRect();
  const mx=e.clientX-r.left, my=e.clientY-r.top;
  const wp=screenToWorld(mx, my);
  G.cam.zoom = newZoom;
  const wp2=screenToWorld(mx, my);
  G.cam.x += wp.x - wp2.x;
  G.cam.y += wp.y - wp2.y;
  clampCamera();
}, {passive: false});
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
});
canvas.addEventListener('mouseleave', () => { G.dragging = false; G.dragButton=null; G.guardSelectStart=null; G.guardSelectEnd=null; G.guardSelectMoved=false; });
window.addEventListener('mouseup', e => {
  if (e.button !== 2 && e.button !== 1) return;
  const isCancelClick=G.dragging && !G.dragMoved;
  G.dragging=false; G.dragButton=null; G.dragMoved=false;
  if (e.button===2 && isCancelClick && !issueManualGuardCommand(e.clientX,e.clientY)) cancelCurrentAction();
});
contextMenu.addEventListener('click', e => e.stopPropagation());
document.addEventListener('mousedown', e => {
  if(!e.target.closest('#context-menu')) hideContextMenu();
});
document.addEventListener('wheel', () => hideContextMenu());
document.addEventListener('keydown', event => {
  if (pendingShortcutAction) {
    event.preventDefault();
    if (event.code==='Escape') {
      pendingShortcutAction=null;
      renderShortcutSettings();
      settingsSetStatus('已取消录制。');
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) {
      settingsSetStatus('请使用不带 Ctrl、Alt 或 Meta 的单个按键。','error');
      return;
    }
    assignShortcut(pendingShortcutAction, event.code);
    return;
  }
  const target=event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
  const settingsOpen=document.getElementById('settings-overlay').style.display==='flex';
  const configOpen=document.getElementById('config-overlay').style.display==='flex';
  if (settingsOpen || configOpen) {
    if (event.code==='Escape') { event.preventDefault(); closeAllOverlays(); }
    return;
  }
  if (event.code==='KeyE' && G.selectedGuards.length) {
    event.preventDefault();
    const nextMode=G.selectedGuards.every(guard=>guard.controlMode==='manual')?'auto':'manual';
    for (const guard of G.selectedGuards) setGuardControlMode(guard,nextMode);
    return;
  }
  const action=Object.keys(gameSettings.shortcuts).find(id => gameSettings.shortcuts[id]===event.code);
  if (!action || event.ctrlKey || event.altKey || event.metaKey) return;
  event.preventDefault();
  runShortcut(action);
});
