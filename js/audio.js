let gameAudioContext=null;
let gameAudioMaster=null;
let gameAudioNoiseBuffer=null;
const gameAudioLastPlayed=new Map();

function ensureGameAudio() {
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass||!gameSettings.soundEnabled) return null;
  if(!gameAudioContext) {
    gameAudioContext=new AudioContextClass();
    gameAudioMaster=gameAudioContext.createGain();
    gameAudioMaster.connect(gameAudioContext.destination);
  }
  gameAudioMaster.gain.value=gameSettings.soundVolume;
  if(gameAudioContext.state==='suspended') gameAudioContext.resume().catch(()=>{});
  return gameAudioContext;
}

function gameSoundSpatialGain(x,y) {
  if(!Number.isFinite(x)||!Number.isFinite(y)||typeof G==='undefined'||!G.cam) return 1;
  const radius=Math.max(CFG.CANVAS_W,CFG.CANVAS_H)/(Math.max(0.3,G.cam.zoom)*1.35);
  return clamp(1-Math.hypot(x-G.cam.x,y-G.cam.y)/radius,0,1);
}

function gameSoundTone(frequency,duration,gain,type='sine',endFrequency=frequency,delay=0) {
  const context=gameAudioContext;
  if(!context||gain<=0) return;
  const start=context.currentTime+delay,oscillator=context.createOscillator(),envelope=context.createGain();
  oscillator.type=type;
  oscillator.frequency.setValueAtTime(Math.max(20,frequency),start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,endFrequency),start+duration);
  envelope.gain.setValueAtTime(0.0001,start);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001,gain),start+Math.min(0.012,duration*0.25));
  envelope.gain.exponentialRampToValueAtTime(0.0001,start+duration);
  oscillator.connect(envelope);envelope.connect(gameAudioMaster);
  oscillator.start(start);oscillator.stop(start+duration+0.01);
}

function gameSoundNoise(duration,gain,frequency=900,delay=0) {
  const context=gameAudioContext;
  if(!context||gain<=0) return;
  if(!gameAudioNoiseBuffer) {
    const length=Math.ceil(context.sampleRate*0.3);
    gameAudioNoiseBuffer=context.createBuffer(1,length,context.sampleRate);
    const data=gameAudioNoiseBuffer.getChannelData(0);
    for(let index=0;index<length;index++) data[index]=Math.random()*2-1;
  }
  const start=context.currentTime+delay,source=context.createBufferSource(),filter=context.createBiquadFilter(),envelope=context.createGain();
  source.buffer=gameAudioNoiseBuffer;
  filter.type='lowpass';filter.frequency.value=frequency;
  envelope.gain.setValueAtTime(Math.max(0.0001,gain),start);
  envelope.gain.exponentialRampToValueAtTime(0.0001,start+duration);
  source.connect(filter);filter.connect(envelope);envelope.connect(gameAudioMaster);
  source.start(start);source.stop(start+duration);
}

function playGameSound(name,x,y) {
  const context=ensureGameAudio();
  if(!context) return false;
  const limits={ui:0.025,deposit:0.08,chop:0.12,arrow:0.045,impact:0.05,damage:0.12,repair:0.15};
  const now=context.currentTime,last=gameAudioLastPlayed.get(name)??-Infinity;
  if(now-last<(limits[name]||0)) return false;
  const spatial=gameSoundSpatialGain(x,y);
  if(spatial<=0.01) return false;
  gameAudioLastPlayed.set(name,now);
  if(name==='ui') gameSoundTone(520,0.035,0.07*spatial,'triangle',430);
  else if(name==='place') { gameSoundNoise(0.09,0.12*spatial,650);gameSoundTone(150,0.11,0.1*spatial,'triangle',105); }
  else if(name==='complete') { gameSoundTone(440,0.16,0.1*spatial,'sine',660);gameSoundTone(660,0.18,0.07*spatial,'sine',880,0.08); }
  else if(name==='upgrade') { gameSoundTone(330,0.15,0.08*spatial,'triangle',495);gameSoundTone(495,0.2,0.08*spatial,'triangle',740,0.1); }
  else if(name==='chop') { gameSoundNoise(0.07,0.16*spatial,720);gameSoundTone(115,0.09,0.09*spatial,'square',75); }
  else if(name==='tree_fall') { gameSoundNoise(0.24,0.18*spatial,520);gameSoundTone(105,0.3,0.13*spatial,'sawtooth',42);gameSoundNoise(0.12,0.08*spatial,1200,0.16); }
  else if(name==='deposit') { gameSoundTone(310,0.06,0.055*spatial,'triangle',390);gameSoundTone(465,0.08,0.045*spatial,'triangle',520,0.045); }
  else if(name==='arrow') { gameSoundNoise(0.055,0.07*spatial,3000);gameSoundTone(1050,0.07,0.045*spatial,'sawtooth',520); }
  else if(name==='impact') { gameSoundNoise(0.055,0.1*spatial,1500);gameSoundTone(180,0.06,0.05*spatial,'square',110); }
  else if(name==='damage') { gameSoundNoise(0.11,0.13*spatial,520);gameSoundTone(95,0.13,0.08*spatial,'sawtooth',55); }
  else if(name==='destroy') { gameSoundNoise(0.28,0.2*spatial,430);gameSoundTone(120,0.32,0.13*spatial,'sawtooth',42); }
  else if(name==='command') { gameSoundTone(620,0.07,0.08*spatial,'triangle',760);gameSoundTone(840,0.06,0.05*spatial,'triangle',760,0.055); }
  else if(name==='dusk') { gameSoundTone(392,0.32,0.07,'sine',294);gameSoundTone(294,0.4,0.06,'sine',196,0.18); }
  else if(name==='dawn') { gameSoundTone(294,0.28,0.06,'sine',440);gameSoundTone(440,0.38,0.07,'sine',587,0.16); }
  return true;
}

function syncSoundSettingsPanel() {
  const enabled=document.getElementById('settings-sound-enabled');
  const volume=document.getElementById('settings-sound-volume');
  const label=document.getElementById('settings-sound-volume-value');
  if(enabled) enabled.checked=gameSettings.soundEnabled;
  if(volume) { volume.value=String(Math.round(gameSettings.soundVolume*100));volume.disabled=!gameSettings.soundEnabled; }
  if(label) label.textContent=Math.round(gameSettings.soundVolume*100)+'%';
}
function setSoundEnabled(enabled) {
  gameSettings.soundEnabled=!!enabled;
  saveGameSettings();syncSoundSettingsPanel();
  if(gameSettings.soundEnabled) { ensureGameAudio();playGameSound('complete'); }
}
function setSoundVolume(value) {
  gameSettings.soundVolume=clamp((Number(value)||0)/100,0,1);
  if(gameAudioMaster) gameAudioMaster.gain.value=gameSettings.soundVolume;
  saveGameSettings();syncSoundSettingsPanel();
}

document.addEventListener('pointerdown',event=>{
  ensureGameAudio();
  const button=event.target.closest?.('button,.tool-btn,.bar-action,.bld-btn');
  if(button&&!button.disabled) playGameSound('ui');
},true);
