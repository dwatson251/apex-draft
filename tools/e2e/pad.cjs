// End-to-end check of gamepad play: a fake standard pad is injected, then it draws a segment with sticks and buttons.
//
// 1. npm run dev:web                       (serves the renderer on :5199)
// 2. start Chrome with --remote-debugging-port=9333 (on WSL, the Windows Chrome: see AGENTS.md)
// 3. PLAYWRIGHT=/path/to/node_modules/playwright node tools/e2e/pad.cjs
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const BASE = process.env.APEX_URL || "http://localhost:5199/";
const CDP = process.env.CDP || "http://localhost:9333";
const OUT = process.env.SHOTS || "";

(async () => {
  const browser = await chromium.connectOverCDP(CDP);
  const page = await (browser.contexts()[0] ?? (await browser.newContext())).newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.addInitScript(() => {
    window.__pad = { axes: [0, 0, 0, 0], down: new Set(), on: false };
    navigator.getGamepads = () => {
      if (!window.__pad.on) return [null, null, null, null];
      const btn = (i) => ({ pressed: window.__pad.down.has(i), touched: false, value: window.__pad.down.has(i) ? 1 : 0 });
      return [{ index: 0, connected: true, id: "Xbox 360 Controller (STANDARD GAMEPAD)", axes: window.__pad.axes, buttons: Array.from({ length: 17 }, (_, i) => btn(i)) }, null, null, null];
    };
  });
  let failed = 0;
  const ok = (name, cond, extra = "") => { if (!cond) failed++; console.log(cond ? "PASS" : "FAIL", name, extra); };
  const G = (fn, a) => page.evaluate(fn, a);
  const shot = async (name) => { if (OUT) await page.screenshot({ path: `${OUT}/${name}.png` }); };
  const tap = async (b, ms = 250) => { await G((b) => window.__pad.down.add(b), b); await page.waitForTimeout(ms); await G((b) => window.__pad.down.delete(b), b); await page.waitForTimeout(ms); };
  const stick = async (x, y, ms) => { await G(([x, y]) => { window.__pad.axes[0] = x; window.__pad.axes[1] = y; }, [x, y]); await page.waitForTimeout(ms); await G(() => { window.__pad.axes[0] = 0; window.__pad.axes[1] = 0; }); await page.waitForTimeout(100); };
  const pts = () => G(() => window.__game.draw?.pts.length ?? -1);

  await page.goto(BASE); await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + "?draw=1"); await page.waitForTimeout(3500);
  ok("drawing a segment", (await pts()) >= 0, `pts=${await pts()}`);
  await G(() => { window.__pad.on = true; });
  await page.waitForTimeout(300);
  await tap(14); // d-pad left: pad becomes active
  ok("pad mode turns the pad class on", await G(() => document.body.classList.contains("pad")));
  const n0 = await pts();
  await stick(0.9, -0.5, 500);
  await tap(0); // A: place
  ok("A places a point", (await pts()) === n0 + 1, `pts=${await pts()}`);
  const hovering = () => G(() => { const g = window.__game; return !!g.hit(g.draw, g.view.toWorld(g.cur.x, g.cur.y), true); });
  for (let i = 0; i < 6 && ((await hovering()) || i === 0); i++) await stick(0.8, 0.6, 500); // off any handle: an A there would grab it
  await tap(0);
  ok("a second point", (await pts()) === n0 + 2, `pts=${await pts()}`);
  await tap(1); // B: undo
  ok("B undoes", (await pts()) === n0 + 1);
  await tap(15); // d-pad right cycles to a handle
  const over = await G(() => { const g = window.__game, d = g.draw, p = g.view.toWorld(g.cur.x, g.cur.y); return !!g.hit(d, p, true); });
  ok("d-pad cycles the cursor onto a handle", over);
  await shot("pad-draw");
  await tap(3); // Y: finish segment (may be disabled if the line leaves the road)
  await page.waitForTimeout(500);
  await tap(9); // Start: menu
  ok("Start opens the pause menu", await G(() => window.__game.menuOpen));
  await page.waitForTimeout(300);
  await tap(0); await page.waitForTimeout(200);
  ok("A focuses a menu button", await G(() => document.activeElement?.tagName === "BUTTON"), await G(() => String(document.activeElement?.id) + " menu=" + window.__game.menuOpen));
  await tap(1); // B: back
  await tap(9);
  ok("mouse takes over again", await (async () => { await page.mouse.move(10, 10); await page.mouse.move(300, 300); return !(await G(() => document.body.classList.contains("pad"))); })());
  ok("no page errors", errs.length === 0, errs.join(" | "));
  await page.close();
  process.exit(failed ? 1 : 0);
})();
