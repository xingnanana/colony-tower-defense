// ============================================================
// LOOP
// ============================================================
let lastTime=0;
let hudUpdateTimer=0;
function gameLoop(ts) {
  const rawDt=Math.min((ts-lastTime)/1000,0.1); lastTime=ts;
  const dt = rawDt * gameSpeed;
  updateCommandMarkers(rawDt);
  if (gameSpeed > 0) update(dt);
  render();
  hudUpdateTimer += rawDt;
  if (hudUpdateTimer >= 0.15) { hudUpdateTimer=0; updateTopBar(); }
  requestAnimationFrame(gameLoop);
}

initGame();
setSpeed(1);
updateBuildingPanel();
updateTopBar();
lastTime=performance.now();
requestAnimationFrame(gameLoop);
console.log('村庄模拟塔防游戏已就绪');
