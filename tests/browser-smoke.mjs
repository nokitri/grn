// Dependency-free Chromium smoke test. Test hooks are injected by this temporary
// server only; the shipped game never exposes or loads them.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const delay = ms => new Promise(r => setTimeout(r, ms));
const hooks = `\nglobalThis.__game = {
  get state() { return { audio: ac?.state, paused, picking, gameOver, elapsed: run?.elapsed, harmony: run?.harmony, kills, elites, dashCooldown, levelsPending, voices: [...(progress?.voices || [])], effects: Object.fromEntries([...(progress?.voiceEffects || [])].map(([n, fx]) => [n, Object.fromEntries(fx)])), cards, player: {...player}, enemies: enemies.length, tracks: tracks.size }; },
  level() { levelsPending += gainXp(progress, xpToNext(progress.level)); },
  addVoice() { progress.voices.set('kick', 1); progress.voices.set('arp', 1); renderLoadout(); },
  killOne() { const e = makeEnemy('drifter', player.x + 100, player.y, 0); e.hp = 0; enemies.push(e); },
  end() { levelsPending = 2; run.harmony = 0; endRun(); },
  populate() { enemies.length = 0; for (let i=0;i<36;i++) { const a=i*2.399, r=160+i*7; const e=makeEnemy(Object.keys(ENEMIES)[i%6],player.x+Math.cos(a)*r,player.y+Math.sin(a)*r,4); enemies.push(e); } invuln=30; },
  fullMix() { progress.voices.clear(); for (const name of ['kick','arp','bass','lead','pad','hats']) { progress.voices.set(name,5); for (const fx of ['reverb','delay','distortion','unison','filter','sidechain']) applyChoice(progress,{kind:'fx',name:fx,target:name}); applyChoice(progress,{kind:'evolve',name}); track(name).setFx(Object.fromEntries(effectsFor(progress,name)),ac.currentTime); } renderLoadout(); },
  reset, choose
};`;
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    let body = await readFile(file);
    if (pathname === '/js/main.js') body = Buffer.from(body.toString() + hooks);
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const profile = await mkdtemp(join(tmpdir(), 'grn-browser-'));
let browser, ws;
const errors = [], pending = new Map(); let id = 0;
try {
  browser = spawn(process.env.CHROMIUM || 'chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let n = 0; n < 100; n++) { try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); } }
  assert.ok(port, 'Chromium must start');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) { clearTimeout(p.timeout); m.error ? p.reject(m.error) : p.resolve(m.result); } }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id, timeout = setTimeout(() => { pending.delete(n); reject(new Error(`Timeout: ${method}`)); }, 10000);
    pending.set(n, { resolve, reject, timeout }); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async expression => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const until = async expression => { for (let n = 0; n < 80; n++) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Not ready: ${expression}`); };
  const click = async selector => {
    const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
  };
  const key = async (key, code = key) => {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
  };
  const shot = async name => {
    const r = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(tmpdir(), `grn-${name}.png`), Buffer.from(r.data, 'base64'));
  };
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  await until('!!globalThis.__game');
  await shot('start');
  await click('#starters button:last-child'); await click('#play');
  await until('__game.state.audio === "running" && __game.state.elapsed > .3');
  assert.deepEqual((await evaluate('__game.state')).voices, [['arp', 1]]);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD' });
  await delay(250); await key(' ', 'Space'); await delay(100);
  assert.ok((await evaluate('__game.state')).dashCooldown > 0);
  assert.ok((await evaluate('__game.state')).player.x > 60);
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD' });
  await key('Escape'); await until('__game.state.audio === "suspended"');
  const elapsed = (await evaluate('__game.state')).elapsed; await delay(150);
  assert.equal((await evaluate('__game.state')).elapsed, elapsed);
  await click('#resume'); await until('__game.state.audio === "running"');
  await evaluate('__game.addVoice(); __game.level()'); await until('__game.state.picking');
  await shot('upgrades');
  const offered = (await evaluate('__game.state')).cards;
  const index = offered.findIndex(c => c.target); assert.ok(index >= 0);
  await key('Escape'); await until('__game.state.audio === "suspended"');
  await key(String(index + 1), `Digit${index + 1}`); assert.equal((await evaluate('__game.state')).picking, true);
  await click('#resume'); await key(String(index + 1), `Digit${index + 1}`);
  await until('!__game.state.picking');
  const after = await evaluate('__game.state'), chosen = offered[index];
  assert.equal(after.effects[chosen.target][chosen.name], 1);
  assert.equal(after.effects[chosen.target === 'arp' ? 'kick' : 'arp']?.[chosen.name], undefined);
  await evaluate('__game.killOne()'); await until('__game.state.kills > 0');
  await evaluate('__game.fullMix(); __game.populate()');
  for (let i = 0; i < 12; i++) { await delay(250); if ((await evaluate('__game.state')).picking) await key('1', 'Digit1'); }
  if ((await evaluate('__game.state')).picking) await key('1', 'Digit1');
  await shot('gameplay');
  assert.equal((await evaluate('__game.state')).tracks, 6);
  await evaluate('__game.end()'); await until('__game.state.gameOver');
  await click('#results .primary'); await delay(250);
  const reset = await evaluate('__game.state');
  assert.equal(reset.levelsPending, 0); assert.equal(reset.harmony, 1); assert.equal(reset.kills, 0); assert.equal(reset.paused, false); assert.deepEqual(reset.effects, {});
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('__game.addVoice(); __game.level()'); await until('__game.state.picking');
  await shot('mobile-upgrades');
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  const rect = await evaluate('(()=>{const r=document.querySelector("#levelup").getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom}})()');
  assert.ok(rect.x >= 0 && rect.right <= 390 && rect.y >= 0 && rect.bottom <= 844);
  await click('.card'); await until('!__game.state.picking');
  await call('Emulation.setTouchEmulationEnabled', { enabled: true });
  const beforeTouch = (await evaluate('__game.state')).player.x;
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{x:190,y:380}] });
  await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{x:270,y:380}] });
  await delay(200);
  // A second finger tapping must not cancel the original steering touch.
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{x:270,y:380,id:0},{x:310,y:500,id:1}] });
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{x:310,y:500,id:1}] });
  const afterSecondFinger = (await evaluate('__game.state')).player.x;
  await delay(150); assert.ok((await evaluate('__game.state')).player.x > afterSecondFinger);
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await evaluate('__game.state')).player.x > beforeTouch);
  await click('#dash-button'); await delay(100); assert.ok((await evaluate('__game.state')).dashCooldown > 0);
  await click('#pause-button'); await until('__game.state.paused');
  assert.deepEqual(errors, []);
  console.log('PASS: desktop/mobile startup, movement, dash, pause, targeted upgrades, six evolved audio channels, kills, replay reset, and responsive upgrade layout. No uncaught browser errors.');
  console.log('Screenshots: /tmp/grn-start.png, /tmp/grn-upgrades.png, /tmp/grn-gameplay.png, /tmp/grn-mobile-upgrades.png');
} finally {
  ws?.close(); for (const p of pending.values()) clearTimeout(p.timeout);
  if (browser && browser.exitCode === null) { const exited = new Promise(r => browser.once('exit', r)); browser.kill(); await exited; }
  server.closeAllConnections(); await new Promise(r => server.close(r));
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
