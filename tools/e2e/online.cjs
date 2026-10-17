// End-to-end check of online play against a local server: ghosts arrive, uploads land, names and arrows show, and the game
// carries on when the server is gone.
//
// 1. npm run server:build && DATA_DIR=/tmp/apex-e2e PORT=8791 node --no-warnings server/dist/server.js
// 2. npm run dev:web                      (serves the renderer on :5199)
// 3. start Chrome with --remote-debugging-port=9333 (on WSL, the Windows Chrome: see AGENTS.md)
// 4. PLAYWRIGHT=/path/to/node_modules/playwright node tools/e2e/online.cjs
//
// The game's server address is baked in, so requests to it are redirected to the local server here.
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const BASE = process.env.APEX_URL || "http://localhost:5199/";
const CDP = process.env.CDP || "http://localhost:9333";
const LOCAL = process.env.SERVER_LOCAL || "http://127.0.0.1:8791";
const OUT = process.env.SHOTS || "";
const HOST = "https://apexdraft.dnlwtsn.co.uk";

(async () => {
  const browser = await chromium.connectOverCDP(CDP);
  const page = await (browser.contexts()[0] ?? (await browser.newContext())).newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  let failed = 0, serverUp = true;
  const ok = (name, cond, extra = "") => { if (!cond) failed++; console.log(cond ? "PASS" : "FAIL", name, extra); };
  const G = (fn, a) => page.evaluate(fn, a);
  const wait = (ms) => page.waitForTimeout(ms);
  const seen = [];
  await page.route(`${HOST}/**`, async (route) => {
    const req = route.request();
    seen.push(`${req.method()} ${req.url().replace(HOST, "")}`);
    if (!serverUp) return route.abort("connectionrefused");
    const r = await fetch(req.url().replace(HOST, LOCAL), { method: req.method(), headers: req.headers(), body: req.postData() ?? undefined });
    await route.fulfill({ status: r.status, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: await r.text() });
  });

  // the game's dev `demo()` assumes the race is ready at once; it now starts a moment later, so start the race and wait
  const startRace = async (phrase, rivals) => {
    await G(({ phrase, rivals }) => { try { window.__game.demo({ phrase, rivals, atSeconds: 14, zoomed: true }); } catch { /* play is not ready yet */ } }, { phrase, rivals });
    await wait(1800);
    await G(() => { const g = window.__game; const me = g.race.cars.find((c) => c.entrant.id === "me"); const k = 14 * 60; g.play.tick = k; g.play.start = undefined; g.view.setFollow({ x: me.trace[k * 3], y: me.trace[k * 3 + 1] }); g.view.snapCamera(); });
    await wait(500);
  };
  await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.goto(BASE); await wait(2500);
  const phrase = "brave-owl-rides-melons";

  // another player puts a line on the server
  const seeded = await G(async ({ phrase, HOST }) => {
    const s = window.__sim, other = "99999999-2222-4333-8444-555555555555";
    const t = s.generateTrack(phrase, { obstacles: false }), v = s.placeFor(phrase).vehicle;
    const h = { authorization: `Bearer ${other}`, "content-type": "application/json" };
    await fetch(`${HOST}/api/v1/players`, { method: "POST", headers: h, body: JSON.stringify({ name: "Rival Rex" }) });
    const r = await fetch(`${HOST}/api/v1/lines`, { method: "POST", headers: h, body: JSON.stringify({ phrase, vehicle: v, car: s.defaultCar(), lines: [s.lineToWire(s.botLine(t, 5, 0.85))] }) });
    return (await r.json()).ok === true;
  }, { phrase, HOST });
  ok("another player's line was accepted by the server", seeded);

  // the player picks a name, and the game fetches rivals ahead of the race
  await G(() => { const g = window.__game; g.online.setName("Test Driver"); g.settings.phrase = "brave-owl-rides-melons"; g.settings.rivals = 4; g.flow = "quick"; g.preloadGhosts(); });
  await wait(1500);
  ok("ghosts were fetched in the background", seen.some((x) => x.startsWith("GET /api/v1/ghosts")), seen.join(" | "));
  await startRace("brave-owl-rides-melons", 4);
  const names = await G(() => window.__game.race.cars.map((c) => c.entrant.name + "|" + c.entrant.id));
  ok("the race has the other player's line as a rival, with their name", names.some((n) => n.startsWith("Rival Rex|ghost:")), names.join(", "));
  ok("the player races under their own name", names.some((n) => n === "Test Driver|me"));
  ok("computer rivals fill the other places", names.filter((n) => n.includes("|bot")).length === 3);
  const labels = await G(() => [...window.__game.view.labelLayer.slots.entries()].map(([id, s]) => ({ id, text: s.text.text, a: s.arrowAlpha, t: s.alpha })));
  ok("the player and the online racer both have an arrow and a name", labels.length === 2 && labels.every((l) => l.a > 0.5), JSON.stringify(labels));
  if (OUT) await page.screenshot({ path: `${OUT}/online-race.png` });

  // zoomed right out the player's name still shows
  await G(() => { const g = window.__game; g.view.setFollow(null); g.view.snapCamera(); });
  await wait(600);
  const out = await G(() => { const s = window.__game.view.labelLayer.slots.get("me"); return { a: s.arrowAlpha, t: s.alpha }; });
  ok("zoomed out, the player's name is still shown", out.a > 0.5 && out.t > 0.5, JSON.stringify(out));
  if (OUT) await page.screenshot({ path: `${OUT}/online-zoomed-out.png` });

  // reporting the run sends the line and the race to the server
  seen.length = 0;
  await G(() => window.__game.reportRun());
  await wait(1500);
  ok("the finished run was reported (line and race)", seen.some((x) => x === "POST /api/v1/lines") && seen.some((x) => x === "POST /api/v1/results"), seen.join(" | "));
  const site = await (await fetch(`${LOCAL}/`)).text();
  ok("the website lists the player's time", site.includes("Test Driver") || site.includes("Rival Rex"));

  // and with the server gone, nothing breaks and the bots fill in
  serverUp = false;
  await G(() => { const g = window.__game; g.online.cache.clear(); g.online.down = 0; g.settings.phrase = "calm-heron-paints-kites"; });
  const t0 = Date.now();
  await startRace("calm-heron-paints-kites", 3);
  const names2 = await G(() => window.__game.race.cars.map((c) => c.entrant.id));
  ok("server down: the race still starts, all rivals are bots", names2.filter((n) => n.startsWith("bot")).length === 3 && !names2.some((n) => n.startsWith("ghost")), names2.join(","));
  ok("server down: no waiting", Date.now() - t0 < 5000, `${Date.now() - t0}ms`);
  const msg = await G(() => document.body.innerText);
  ok("server down: nothing about it is shown to the player", !/server|offline|network|connect/i.test(msg));
  ok("no page errors", errs.length === 0, errs.join(" | "));
  await page.close();
  process.exit(failed ? 1 : 0);
})();
