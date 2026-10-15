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
  const home = async (url) => { await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.goto(url); await page.waitForSelector(".home"); };
  const setup = async (id) => { await page.click(id); await page.waitForSelector("#go"); };
  await home(BASE + "?t=1"); await settle(2500);
  ok("the title has a real track behind it, blurred, with bots going round", await G(() => window.__game.track.segments.length > 8 && document.querySelector("canvas").classList.contains("blurred") && window.__game.ambient.race.cars.length === 6));
  ok("the Menu button is hidden on the title", (await G(() => getComputedStyle(document.getElementById("menubtn")).display)) === "none");
  ok("the home screen has the six choices (no Quit outside Electron)", JSON.stringify(await page.$$eval(".hb b", (e) => e.map((x) => x.textContent))) === JSON.stringify(["Solo Time Trial", "Quick Race", "Race Weekend", "Tutorial", "Garage", "Settings"]));
  await setup("#h-quick");
  const p0 = await G(() => window.__game.settings.phrase);
  await page.click("#rand"); await settle(1500);
  ok("Random with nothing drawn just changes the track", (await G(() => window.__game.settings.phrase)) !== p0 && (await G(() => getComputedStyle(document.getElementById("modal")).display)) === "none");
  await shot("title");

  // ---------------- realism covers tyres, fuel, weather and the choice of tyre ----------------
  ok("realism is off by default", !(await page.$eval("#realism", (b) => b.classList.contains("on"))));
  ok("so there are no wear options, mandatory tyres or forecast, and no obstacles box or starting tyre", (await page.$(".cchips")) === null && (await page.$(".chip-wx")) === null && (await page.$("#obstacles")) === null && (await page.$(".tyrepick")) === null);
  await page.click("#realism"); await page.waitForTimeout(400);
  ok("switching it on brings fuel and tyre multipliers, mandatory tyres and the forecast", (await page.$$(".cchips .cchip")).length === 3 && (await page.$("#wearFuel")) !== null && (await page.$("#wearTyre")) !== null && (await page.$(".chip-wx")) !== null);
  await page.click("#wearTyre"); await page.click('[data-dd="wearTyre"] .dd-opt[data-v="40"]'); await page.click('.cchip[data-v="soft"]'); await page.waitForTimeout(300);
  ok("the multiplier goes up to 40x and a mandatory tyre can be picked", await G(() => window.__game.settings.wearTyre === 40 && window.__game.settings.mandatory.join() === "soft"));
  await page.click("#realism"); await page.waitForTimeout(400);
  ok("and off again takes them away", (await page.$(".cchips")) === null && (await page.$(".chip-wx")) === null);
  await page.click("#phrase-copy"); await page.waitForTimeout(200);
  ok("the phrase box has a copy button inside it", await G(() => document.querySelector("#phrase-copy").parentElement.classList.contains("field")));
  {
    // a rainy seed with realism off: no rain, no wet road, no rain in the sim at all
    const rainy = await G(() => { const s = window.__sim; for (let i = 0; i < 4000; i++) { const p = s.randomPhrase(new s.Rng(i + 5)); const t = s.generateTrack(p); if (s.weatherFor(t.seed, 6, t.biome).showers.length) return p; } return null; });
    const hash = (real) => G(([p, real]) => { const s = window.__sim; const t = s.generateTrack(p); return "#" + s.encodeShare({ phrase: t.phrase, laps: 6, mode: "race", rivals: 3, car: { name: "Standard", accel: 6, top: 6, grip: 6, brake: 6 }, obstacles: true, realism: real, playing: true, line: s.botLine(t, 5, 1), startTyre: "wet", pitPlan: [] }); }, [rainy, real]);
    for (const real of [false, true]) {
      await open(BASE + (await hash(real))); await page.waitForSelector("#bar-go"); await settle(1800);
      await page.click("#bar-go"); await page.waitForSelector("#bar-skip");
      const r = await G(() => { const race = window.__game.race; return { rain: race.events.some((e) => e.type === "rain"), wet: Math.max(0, ...race.wetSnaps.map((s) => Math.max(...s.slice(0, race.field.cells)))), showers: race.weather.showers.length }; });
      ok(`weather ${real ? "happens with realism on" : "does not happen with realism off"}`, real ? r.rain && r.wet > 20 : !r.rain && r.wet === 0 && r.showers === 0, JSON.stringify(r));
    }
  }
  await home(BASE + "?t=2"); await settle(2500); await setup("#h-quick");

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
  ok("the pause menu offers resume, redraw, settings and quit", !!(await page.$("#resume")) && !!(await page.$("#restart")) && !!(await page.$("#p-settings")) && !!(await page.$("#quit")) && (await page.$("#phrase")) === null);
  await page.click("#restart"); await page.waitForSelector("#modal .dialog");
  await page.click("#no"); await page.waitForTimeout(300);
  ok("answering no keeps the drawing", (await G(() => window.__game.shareLine.segs.length)) === 1);
  await page.click("#restart"); await page.waitForSelector("#modal .dialog"); await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  ok("Esc on the dialog also means no", (await G(() => window.__game.shareLine.segs.length)) === 1 && (await G(() => window.__game.menuOpen)));
  await page.click("#quit"); await page.waitForSelector("#modal .dialog"); await page.click("#yes"); await page.waitForSelector(".home");
  ok("quitting goes to the home screen", !(await G(() => window.__game.inGame)));

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
  ok("in the pit stop the whole map is back and you can edit", Math.abs((await G(() => window.__game.view.cam.zoom)) - 1) < 0.03 && (await page.textContent("#hint")).includes("You are in the pits"));
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

  // ---------------- hidden circuits ----------------
  for (const [phrase, name, biome] of [["donington-park", "Donington Park", "Countryside"], ["oval", "The Oval", "Countryside"], ["daytona", "Daytona", "Countryside"], ["willow-springs", "Willow Springs", "Desert"], ["le-mans", "Circuit de la Sarthe", "Countryside"], ["lago-maggiore", "Autodrome Lago Maggiore", "Countryside"]]) {
    await home(BASE + "?t=1"); await setup("#h-quick");
    await page.fill("#phrase", phrase); await page.keyboard.press("Enter"); await page.waitForTimeout(600);
    const chips = await page.textContent(".chips");
    ok(`typing ${phrase} shows its circuit and setting`, chips.includes(name) && chips.includes(biome), chips.replace(/\s+/g, " "));
    ok(`${phrase} is the track behind the menu`, await G((n) => window.__game.track.circuit?.name === n, name));
    await settle(2500); await shot(`circuit-${phrase}`);
  }
  await home(BASE + "?t=1"); await setup("#h-quick");
  ok("up to 31 rivals can be picked", (await page.$$eval('[data-dd="rivals"] .dd-opt', (o) => o.length)) === 31);
  ok("a random phrase shows no circuit", !(await page.textContent(".chips")).includes("km"));
  // a circuit plays like any track: a shared line on the oval loads, races and finishes
  await open(BASE + (await linkFor({ phrase: "oval", laps: 2 }))); await page.waitForSelector("#bar-go"); await settle(1800);
  ok("a shared link to the oval loads the circuit", await G(() => window.__game.track.circuit?.id === "oval"));
  await page.click("#bar-go"); await page.waitForSelector("#bar-skip"); await page.click("#bar-skip"); await page.waitForSelector("#again", { timeout: 30000 });
  ok("and the race on it reaches the results", true);

  // ---------------- the modes ----------------
  const finishPlay = async () => { await G(() => { const p = window.__game.play; if (p) p.tick = p.end; }); await page.waitForTimeout(500); };
  const drawBot = async () => { await G(() => { const g = window.__game; g.draw = null; g.finishedLine(window.__sim.botLine(g.track, 99, 0.9)); }); await page.waitForTimeout(300); };
  await home(BASE); await setup("#h-trial"); await page.click("#go"); await page.waitForSelector("#bar-fin"); await settle(1500);
  ok("time trial: out lap, one timed lap, cool-down lap", await G(() => window.__game.run.kind === "trial" && window.__game.run.laps === 3 && window.__game.run.rivals === 0 && !window.__game.run.realism));
  await drawBot(); await page.click("#bar-go"); await page.waitForSelector("#bar-skip");
  ok("with no rivals", await G(() => window.__game.race.cars.length === 1));
  await finishPlay();
  ok("its time is stored against the track", await G(() => Object.keys(JSON.parse(localStorage.getItem("apex-draft-best") || "{}")).some((k) => k.startsWith("tt:"))));
  await page.click("#again"); await page.waitForSelector("#bar-go");
  ok("the line carries over to another go", await G(() => !!window.__game.pick && !window.__game.race));
  await page.click("#bar-go"); await page.waitForTimeout(400); await finishPlay(); await page.click("#res-menu"); await page.waitForSelector(".home");
  await setup("#h-quick"); await page.click("#go"); await page.waitForSelector("#bar-go");
  ok("quick race starts from the carried line, no redrawing", await G(() => !!window.__game.pick && !window.__game.draw));
  await page.click("#bar-go"); await page.waitForTimeout(400);
  ok("and the grid comes from the time trial", await G(() => { const r = window.__game.race; return r.cars.length === 6 && r.cars.find((c) => c.entrant.isPlayer).entrant.gridTime < 1000; }));
  await finishPlay(); await page.click("#res-menu"); await page.waitForSelector(".home");
  await setup("#h-weekend"); await page.click("#go"); await page.waitForSelector("#bar-go");
  ok("weekend starts with practice", await G(() => window.__game.run.kind === "practice" && !window.__game.run.realism));
  await page.click("#bar-go"); await page.waitForTimeout(500);
  ok("others are spread round the track", await G(() => window.__game.race.cars.filter((c) => c.entrant.startFrac !== undefined).length === 5));
  await finishPlay(); await page.click("#next"); await page.waitForSelector("#bar-go");
  ok("then the qualifier: out lap, three timed laps, cool-down", await G(() => window.__game.run.kind === "qualifying" && window.__game.run.laps === 5));
  await page.click("#bar-go"); await page.waitForTimeout(500); await finishPlay();
  ok("it sets the grid for the race", await G(() => Object.keys(window.__game.weekend.grid).length === 6));
  await page.click("#next"); await page.waitForSelector("#bar-go");
  await page.click("#bar-go"); await page.waitForTimeout(500);
  ok("the race starts from the qualifying order, with realism", await G(() => window.__game.run.realism && window.__game.race.cars.every((c) => c.slot === window.__game.weekend.grid[c.entrant.id])));
  await finishPlay();
  for (let i = 0; i < 8 && (await G(() => !!window.__game.race && !!window.__game.pick)); i++) { await page.click("#bar-go"); await page.waitForTimeout(500); await finishPlay(); }
  await page.click("#res-menu"); await page.waitForSelector(".home");
  await page.click("#h-tutorial"); await page.waitForSelector("#bar-fin"); await settle(1200);
  ok("the tutorial runs on the oval with a tooltip", await G(() => window.__game.track.circuit?.id === "oval" && document.getElementById("tut").style.display === "block" && /start line/.test(document.getElementById("tut").innerText)));
  await page.click("#tut-skip"); await page.waitForSelector(".home");
  ok("skipping puts your own settings back", await G(() => window.__game.settings.phrase !== "oval" && document.getElementById("tut").style.display === "none"));
  await page.click("#h-settings"); await page.waitForSelector("#sound"); await page.click("#sound");
  ok("settings holds the sound switch", await G(() => window.__game.settings.muted === true));

  ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
  await page.close(); await browser.close();
  if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
})().catch((e) => { console.error("SCRIPT FAIL", e.message); process.exit(1); });
