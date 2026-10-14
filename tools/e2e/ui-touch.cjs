// Touch / phone-size checks: a landscape phone viewport with a finger instead of a mouse.
//
// 1. npm run dev:web
// 2. PLAYWRIGHT=/path/to/node_modules/playwright SHOTS=/some/dir node tools/e2e/ui-touch.cjs
//
// With CDP=http://localhost:9333 it attaches to a running Chrome (on WSL: the Windows Chrome, headless,
// --remote-debugging-port=9333); otherwise it launches its own Chromium. Not part of `npm test`.
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const BASE = process.env.APEX_URL || "http://localhost:5199/";
const OUT = process.env.SHOTS || "";
const SIZES = [{ w: 844, h: 390 }, { w: 667, h: 375 }];

(async () => {
  const browser = process.env.CDP ? await chromium.connectOverCDP(process.env.CDP) : await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  let failed = 0;
  const ok = (name, cond, extra = "") => { if (!cond) failed++; console.log(cond ? "PASS" : "FAIL", name, extra); };
  for (const sz of SIZES) {
    const ctx = await (process.env.CDP ? browser.newContext.bind(browser) : browser.newContext.bind(browser))({ viewport: { width: sz.w, height: sz.h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    const tag = `${sz.w}x${sz.h}`;
    const shot = async (n) => { if (OUT) await page.screenshot({ path: `${OUT}/${tag}-${n}.png` }); };
    const audit = async (label) => {
      const r = await page.evaluate(() => {
        const small = [...document.querySelectorAll("button, .switch, .dd-btn")].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== "hidden" && (r.height < 40 || r.width < 40); }).map((b) => `${b.id || b.className || b.textContent.trim().slice(0, 12)}:${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`);
        const off = [...document.querySelectorAll("#menu .panel, #bar, #hint, .panel, #tut")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1); }).map((e) => e.id || e.className);
        return { small, off, overflowX: document.documentElement.scrollWidth > innerWidth };
      });
      ok(`${tag} ${label}: no overflow`, !r.overflowX && r.off.length === 0, JSON.stringify(r.off));
      ok(`${tag} ${label}: tap targets >= 40px`, r.small.length === 0, r.small.join(" "));
    };
    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(2500);
    await shot("home");
    await audit("home");
    ok(`${tag} coarse pointer`, await page.evaluate(() => matchMedia("(pointer: coarse)").matches));
    ok(`${tag} canvas touch-action none`, await page.evaluate(() => getComputedStyle(document.querySelector("canvas")).touchAction === "none"));
    // settings screen shows the touch controls
    await page.tap("#h-settings").catch(() => {});
    await page.waitForTimeout(300);
    ok(`${tag} settings list touch controls`, (await page.textContent("#menu")).includes("Pinch"));
    await shot("settings");
    await audit("settings");
    // drawing: the bar, the tap tool, tap to place, hold to delete
    await page.goto(`${BASE}?draw=1`);
    await page.waitForTimeout(2500);
    await shot("draw");
    await audit("draw");
    const G = (fn, a) => page.evaluate(fn, a);
    const mid = () => G(() => { const g = window.__game, d = g.draw, j = g.joinPoint(d), e = g.exitPoint(d); const v = g.view, r = v.app.canvas.getBoundingClientRect(); const w = { x: (j.x + e.x) / 2, y: (j.y + e.y) / 2 }; return { x: r.left + v.root.position.x + w.x * v.root.scale.x - 85,y: r.top + v.root.position.y + w.y * v.root.scale.y }; });
    const npts = () => G(() => window.__game.draw.pts.length);
    const before = await npts();
    const m = await mid();
    await page.touchscreen.tap(m.x, m.y);
    ok(`${tag} tap places a point`, (await npts()) === before + 1);
    const label = () => page.textContent("#bar-tool");
    ok(`${tag} tool button shows`, (await label()) === "Tap: add", await label());
    await page.tap("#bar-tool"); await page.tap("#bar-tool");
    ok(`${tag} tool cycles to delete`, (await label()) === "Tap: delete", await label());
    const pt = await G(() => { const g = window.__game, d = g.draw, v = g.view, r = v.app.canvas.getBoundingClientRect(), p = d.pts.at(-1); return { x: r.left + v.root.position.x + p.x * v.root.scale.x, y: r.top + v.root.position.y + p.y * v.root.scale.y }; });
    await page.touchscreen.tap(pt.x, pt.y);
    ok(`${tag} delete tool removes the point`, (await npts()) === before);
    await page.tap("#bar-tool");
    ok(`${tag} tool back to add`, (await label()) === "Tap: add");
    await page.touchscreen.tap(m.x, m.y);
    const cdp = await ctx.newCDPSession(page);
    const pt2 = await G(() => { const g = window.__game, d = g.draw, v = g.view, r = v.app.canvas.getBoundingClientRect(), p = d.pts.at(-1); return { x: r.left + v.root.position.x + p.x * v.root.scale.x, y: r.top + v.root.position.y + p.y * v.root.scale.y }; });
    const n1 = await npts();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pt2.x, y: pt2.y }] });
    await page.waitForTimeout(800);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    ok(`${tag} holding a point deletes it`, (await npts()) === n1 - 1, `${n1} -> ${await npts()}`);
    // the race view
    await page.goto(`${BASE}?demo&t=12`);
    await page.waitForTimeout(3000);
    await shot("race");
    await audit("race");
    // pinch zooms the overview
    await page.goto(`${BASE}?demo&t=12&zoom=0`);
    await page.waitForTimeout(2500);
    const zoom = () => G(() => { const v = window.__game.view; return v.cameraMode === "follow" ? v.followZoom : v.user.zoom; });
    const z0 = await zoom();
    const cx = sz.w * 0.6, cy = sz.h * 0.5, c2 = await ctx.newCDPSession(page);
    await c2.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }] });
    for (let i = 1; i <= 6; i++) await c2.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx - 30 - i * 10, y: cy, id: 1 }, { x: cx + 30 + i * 10, y: cy, id: 2 }] });
    await c2.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const z1 = await zoom();
    ok(`${tag} pinch out zooms in`, z1 > z0 * 1.5, `${z0} -> ${z1}`);
    ok(`${tag} no page errors`, errs.length === 0, errs.join("|"));
    await ctx.close();
  }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : "all passed");
  process.exit(failed ? 1 : 0);
})();
