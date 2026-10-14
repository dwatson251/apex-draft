// End-to-end checks of the UI, driven over the Chrome DevTools protocol.
//
// 1. npm run dev:web                       (serves the renderer on :5199)
// 2. start Chrome with --remote-debugging-port=9333 (on WSL, use the Windows Chrome: see AGENTS.md)
// 3. PLAYWRIGHT=/path/to/node_modules/playwright node tools/e2e/ui.cjs
//
// It is not part of `npm test` because it needs a browser and a running server.
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
  let failed = 0;
  const ok = (name, cond, extra = "") => { if (!cond) failed++; console.log(cond ? "PASS" : "FAIL", name, extra); };
  const G = (fn, a) => page.evaluate(fn, a);
  const shot = async (name) => { if (OUT) await page.screenshot({ path: `${OUT}/${name}.png` }); };
  const settle = (ms = 3800) => page.waitForTimeout(ms);
  const toScreen = (w) => G((w) => { const v = window.__game.view; const r = v.app.canvas.getBoundingClientRect(); return { x: r.left + v.root.position.x + w.x * v.root.scale.x, y: r.top + v.root.position.y + w.y * v.root.scale.y }; }, w);
  const click = async (w, opts) => { const s = await toScreen(w); await page.mouse.click(s.x, s.y, opts); };
  const drag = async (from, to) => { const a = await toScreen(from), b = await toScreen(to); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 }); await page.mouse.move(b.x, b.y, { steps: 3 }); await page.mouse.up(); };
  const open = async (url) => { await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.goto(url); await page.reload(); };
  const linkFor = (o) => G((o) => { const s = window.__sim; const t = s.generateTrack(o.phrase); return "#" + s.encodeShare({ phrase: t.phrase, laps: o.laps ?? 3, mode: "race", rivals: 5, car: { name: "Standard", accel: 6, top: 6, grip: 6, brake: 6 }, obstacles: true, realism: true, playing: true, line: o.segs === undefined ? s.botLine(t, 5, 1) : { start: s.botLine(t, 5, 1).start, segs: s.botLine(t, 5, 1).segs.slice(0, o.segs) }, startTyre: "medium", pitPlan: o.plan ?? [] }); }, o);

  // ---------------- the title ----------------
  await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.goto(BASE + "?t=1"); await page.waitForSelector("#go"); await settle(2500);
  ok("the title has a real track behind it, blurred, with bots going round", await G(() => window.__game.track.segments.length > 8 && document.querySelector("canvas").classList.contains("blurred") && window.__game.ambient.race.cars.length === 6));
  ok("the Menu button is hidden on the title", (await G(() => getComputedStyle(document.getElementById("menubtn")).display)) === "none");
  const p0 = await G(() => window.__game.settings.phrase);
  await page.click("#rand"); await settle(1500);
  ok("Random with nothing drawn just changes the track", (await G(() => window.__game.settings.phrase)) !== p0 && (await G(() => getComputedStyle(document.getElementById("modal")).display)) === "none");
  await shot("title");

  // ---------------- start, draw, reload ----------------
  await page.click("#go"); await page.waitForSelector("#bar-fin"); await settle();
  ok("starting closes the menu and shows the Menu button and the bottom bar", (await G(() => getComputedStyle(document.getElementById("menu")).display)) === "none" && (await G(() => getComputedStyle(document.getElementById("menubtn")).display)) === "block" && !!(await page.$("#bar-undo")));
  ok("editing zooms in to fill the screen with the segment", await G(() => window.__game.view.cameraMode === "focus" && window.__game.view.cam.zoom > 3));
  const guide = await G(() => window.__sim.botLine(window.__game.track, 5, 1));
  const h0 = await G(() => location.hash);
  await click(guide.start); for (const p of guide.segs[0].slice(0, -1)) await click(p);
  await page.keyboard.press("Enter"); await settle(2000);
  ok("completing a segment writes a new hash", (await G(() => location.hash)) !== h0 && (await G(() => window.__game.shareLine.segs.length)) === 1);
  await page.reload(); await page.waitForSelector("#bar-fin"); await settle(2500);
  ok("a reload brings back the half-drawn lap, with no race", await G(() => window.__game.draw && window.__game.draw.seg === 1 && !window.__game.race));

  // ---------------- menu over a game, and the seed-change confirmation ----------------
  await page.keyboard.press("Escape"); await page.waitForSelector("#resume");
  ok("Esc opens the menu over the game, which keeps its drawing", await G(() => window.__game.menuOpen && window.__game.shareLine.segs.length === 1));
  const phrase = await G(() => window.__game.settings.phrase);
  await page.click("#rand"); await page.waitForSelector("#modal .dialog");
  await page.click("#no"); await page.waitForTimeout(300);
  ok("answering no keeps the track and the drawing", (await G(() => window.__game.settings.phrase)) === phrase && (await G(() => window.__game.shareLine.segs.length)) === 1);
  await page.click("#obstacles"); await page.waitForSelector("#modal .dialog"); await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  ok("Esc on the dialog also means no, and the obstacles box is put back", (await page.isChecked("#obstacles")) && (await G(() => window.__game.menuOpen)));
  await page.click("#rand"); await page.waitForSelector("#modal .dialog"); await page.click("#yes"); await settle(1800);
  ok("yes discards the drawing and goes to the title", !(await G(() => window.__game.inGame)) && (await G(() => window.__game.settings.phrase)) !== phrase);

  // ---------------- editing points ----------------
  await open(BASE + "?draw=5"); await page.waitForSelector("#bar-fin"); await settle();
  const handles = () => G(() => { const g = window.__game; return g.handles(g.draw).map((h) => ({ kind: h.kind, i: h.i, p: h.p })); });
  let hs = await handles();
  ok("the join, the points and the end node are all handles", hs[0].kind === "join" && hs.at(-1).kind === "end" && hs.filter((h) => h.kind === "pt").length === 3);
  const p1 = hs[2].p, target = { x: p1.x + 6, y: p1.y - 5 };
  await drag(p1, target);
  let pts = await G(() => window.__game.draw.pts);
  ok("dragging a point moves it", Math.abs(pts[1].x - target.x) < 0.6 && Math.abs(pts[1].y - target.y) < 0.6);
  hs = await handles(); const gate = await G(() => { const g = window.__game.track.segments[5].exit; return { mid: g.mid, dir: g.dir, n: g.n }; });
  await drag(hs.at(-1).p, { x: hs.at(-1).p.x + gate.n.x * 6 + gate.dir.x * 20, y: hs.at(-1).p.y + gate.n.y * 6 + gate.dir.y * 20 });
  const end = await G(() => window.__game.draw.end);
  ok("the end node stays on the road edge", Math.abs((end.x - gate.mid.x) * gate.dir.x + (end.y - gate.mid.y) * gate.dir.y) < 1e-6);
  hs = await handles(); await page.mouse.click((await toScreen(hs[1].p)).x, (await toScreen(hs[1].p)).y, { button: "right" });
  ok("right-click deletes a point", (await G(() => window.__game.draw.pts.length)) === 2);
  hs = await handles(); const mid = { x: (hs[1].p.x + hs[2].p.x) / 2, y: (hs[1].p.y + hs[2].p.y) / 2 };
  await page.keyboard.down("Shift"); await click(mid); await page.keyboard.up("Shift");
  ok("Shift+click inserts between two points", (await G(() => window.__game.draw.pts.length)) === 3);

  // ---------------- the picker: overview zoom and pan ----------------
  await open(BASE + (await linkFor({ phrase: "brave-owl-rides-melons" }))); await page.waitForSelector("#bar-go"); await settle(2500);
  ok("the picker is the overview at the default zoom, with the bar and no side panel", await G(() => window.__game.view.cameraMode === "overview" && Math.abs(window.__game.view.cam.zoom - 1) < 0.05) && (await page.$$(".panel.side")).length === 0);
  await page.mouse.move(640, 400); await page.mouse.wheel(0, -600); await page.waitForTimeout(800);
  ok("the wheel zooms in", (await G(() => window.__game.view.cam.zoom)) > 1.5);
  const x0 = await G(() => window.__game.view.root.position.x);
  await page.mouse.move(500, 400); await page.mouse.down(); await page.mouse.move(380, 330, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(600);
  ok("dragging pans, and does not select a segment", Math.abs((await G(() => window.__game.view.root.position.x)) - x0) > 60 && (await G(() => window.__game.pick.selected.size)) === 0);

  // ---------------- racing: camera, controls, and editing only in the pits ----------------
  await open(BASE + (await linkFor({ phrase: "brave-owl-rides-melons", laps: 4, plan: [{ lap: 1, tyre: "wet" }] }))); await page.waitForSelector("#bar-go"); await settle(1800);
  ok("the menu has no edit-every setting any more", (await G(() => window.__game.settings.editEvery)) === undefined && (await page.$("#editevery")) === null);
  await page.click("#bar-go"); await page.waitForSelector("#bar-skip");
  const z0 = await G(() => window.__game.view.cam.zoom); await page.waitForTimeout(2500); const z1 = await G(() => window.__game.view.cam.zoom);
  ok("the camera eases in on the car", z1 > z0 && z1 < 2.5, `${z0.toFixed(2)} -> ${z1.toFixed(2)}`);
  ok("the race is running to the player's stop, which comes at the end of lap 2", await G(() => window.__game.play && window.__game.play.atStop && window.__game.lapNo === 1));
  await page.click("#bar-skip"); await page.waitForSelector("#bar-go", { timeout: 25000 }); await settle(2500);
  ok("in the pit stop the whole map is back and you can edit", Math.abs((await G(() => window.__game.view.cam.zoom)) - 1) < 0.03 && (await page.textContent(".panel.top")).includes("In the pits after lap 2"));
  ok("the button says Back out", (await page.textContent("#bar-go")).includes("Back out"));
  ok("the car is stopped in its box", await G(() => { const g = window.__game, me = g.race.cars.find((c) => c.entrant.id === "me"); return me.dwell > 0 && me.v === 0; }));
  // edit three segments (the limit), then leave
  const sel = await G(() => { const g = window.__game, line = g.currentLine; return [2, 3, 4].map((i) => ({ i, p: line.segs[i][0] })); });
  for (const q of sel) { await click(q.p); }
  ok("three segments can be selected", (await G(() => window.__game.pick.selected.size)) === 3);
  await click((await G(() => window.__game.currentLine.segs[5][0])));
  ok("a fourth is refused", (await G(() => window.__game.pick.selected.size)) === 3);
  await page.click("#bar-go"); await page.waitForSelector("#bar-skip"); await page.click("#bar-skip"); await page.waitForSelector("#again", { timeout: 30000 });
  ok("after the only stop it runs to the results without stopping again", true);

  // no stops: no chance to edit once the race has started
  await open(BASE + (await linkFor({ phrase: "brave-owl-rides-melons", laps: 3 }))); await page.waitForSelector("#bar-go"); await settle(1800);
  await page.click("#bar-go"); await page.waitForSelector("#bar-skip");
  ok("with no stops queued the race runs straight to the end", await G(() => window.__game.play && !window.__game.play.atStop));
  await page.click("#bar-skip"); await page.waitForSelector("#again", { timeout: 30000 });
  ok("and goes to the results", true);

  ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
  await page.close(); await browser.close();
  if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
})().catch((e) => { console.error("SCRIPT FAIL", e.message); process.exit(1); });
