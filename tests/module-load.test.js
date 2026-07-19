const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'game.html'), 'utf8');
const scriptFiles = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);

function canvasContextStub() {
  return new Proxy({}, {
    get(target, property) {
      if (!(property in target)) target[property] = () => {};
      return target[property];
    },
    set(target, property, value) { target[property] = value; return true; },
  });
}

function elementStub() {
  return {
    addEventListener() {}, appendChild() {}, append() {}, remove() {}, focus() {}, select() {},
    querySelector() { return elementStub(); }, querySelectorAll() { return []; }, closest() { return null; },
    getContext() { return canvasContextStub(); }, getBoundingClientRect() { return {left:0,top:0,width:1200,height:800}; },
    style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {},
    setAttribute() {}, value: '', innerHTML: '', textContent: '', disabled: false,
    clientWidth: 1600, clientHeight: 900, offsetWidth: 180, width: 1200, height: 800,
  };
}

test('browser scripts load in declared order and initialize the game', () => {
  assert.deepEqual(scriptFiles, [
    'js/config.js', 'js/audio.js', 'js/world.js', 'js/navigation.js', 'js/tasks.js', 'js/entities.js',
    'js/save-game.js', 'js/simulation.js', 'js/combat.js', 'js/residents.js',
    'js/buildings.js', 'js/game-controls.js', 'js/developer-ui.js', 'js/render.js',
    'js/ui.js', 'js/input.js', 'js/main.js',
  ]);
  const sandbox = {
    console, Math, JSON, Date, Uint8Array, Object, Array, Map, Set, Number, String,
    Boolean, parseInt, setTimeout() {}, clearTimeout() {}, requestAnimationFrame() {},
    addEventListener() {},
    performance: { now() { return 0; } }, location: { protocol: 'file:' },
    localStorage: { getItem() { return null; }, setItem() {} },
    FileReader: function FileReader() {}, HTMLInputElement: function HTMLInputElement() {},
    HTMLSelectElement: function HTMLSelectElement() {}, HTMLTextAreaElement: function HTMLTextAreaElement() {},
  };
  sandbox.document = {
    body: elementStub(), getElementById: elementStub, querySelectorAll() { return []; },
    createElement: elementStub, createTextNode(text) { return {textContent:text}; }, addEventListener() {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const relativePath of scriptFiles) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    vm.runInContext(source, sandbox, {filename:relativePath});
  }
  assert.ok(vm.runInContext('G.townHall && G.buildings.length > 0 && G.residents.length > 0', sandbox));
});
