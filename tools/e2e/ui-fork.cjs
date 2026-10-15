const { chromium } = require(process.env.PLAYWRIGHT);
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9333");
  const page = await (browser.contexts()[0] ?? (await browser.newContext())).newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  page.on("pageerror", (e) => console.log("PAGEERR", e.message));
  await page.goto("http://localhost:5199/"); await page.evaluate(() => localStorage.clear()); await page.goto("http://localhost:5199/?t=1"); await page.waitForSelector(".home");
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const s = window.__sim, g = window.__game;
    for (let i = 0; i < 400; i++) {
      const p = "fun-" + s.randomPhrase(new s.Rng(i + 11));
      const t = s.generateTrack(p);
      if (t.branches.length) return { p, fork: t.branches[0].fork, alt: t.segments[t.branches[0].fork].alt, n: t.segments.length };
    }
  });
  console.log("track", JSON.stringify(info));
  await page.evaluate((info) => {
    const g = window.__game, s = window.__sim;
    g.settings = { ...g.settings, phrase: info.p, mode: "race", muted: true };
    g.run = g.runFor("quick", "race"); g.startGame();
    const ring = Array.from({ length: g.track.segments.length }, (_, i) => i);
    const guide = s.botLine(g.track, 99, 0.9, { route: ring });
    g.currentLine = guide;
    g.draw = { mode: "amend", line: guide, seg: info.fork, id: info.fork, pts: guide.segs[info.fork].slice(0, -1), end: guide.segs[info.fork].at(-1), queue: [], drag: null, warn: "" };
    g.renderDraw();
  }, info);
  await page.waitForTimeout(4000);
  const state = () => page.evaluate(() => { const d = window.__game.draw; return { id: d.id, end: d.end && { x: +d.end.x.toFixed(1), y: +d.end.y.toFixed(1) }, drag: d.drag && d.drag.kind }; });
  const toScreen = (w) => page.evaluate((w) => { const v = window.__game.view; const r = v.app.canvas.getBoundingClientRect(); return { x: r.left + v.root.position.x + w.x * v.root.scale.x, y: r.top + v.root.position.y + w.y * v.root.scale.y }; }, w);
  const pts = await page.evaluate(() => { const g = window.__game, t = g.track, d = g.draw; const ex = g.exitPoint(d); return { end: ex, exits: [d.id, ...(t.allSegments[d.id].alt || [])].map((c) => ({ c, mid: t.allSegments[c].exit.mid, n: t.allSegments[c].exit.n, half: t.allSegments[c].exit.half })) }; });
  console.log("start", JSON.stringify(await state()), JSON.stringify(pts));
  // drag the end node from its own exit toward the other exit's gate
  const from = await toScreen(pts.end), other = pts.exits[1].mid, to = await toScreen(other);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  const steps = 12;
  for (let k = 1; k <= steps; k++) { await page.mouse.move(from.x + ((to.x - from.x) * k) / steps, from.y + ((to.y - from.y) * k) / steps); if (k % 3 === 0) console.log("step", k, JSON.stringify(await state())); }
  await page.mouse.up();
  console.log("after", JSON.stringify(await state()));
  const fin = await page.evaluate(() => { const g = window.__game, d = g.draw; d.pts = []; g.finishSegment(); const L = g.currentLine, s = window.__sim; return { drawNull: g.draw === null, path: L.path && L.path.slice(0, 12), forkId: s.idAt(L, 6), complete: s.isComplete(g.track, L), warn: d.warn }; });
  console.log("finish", JSON.stringify(fin));
  await page.close(); await browser.close(); return;
  // and back again, from the new end node to the first exit
  const st2 = await page.evaluate(() => { const g = window.__game, d = g.draw; return { end: g.exitPoint(d), other: g.track.allSegments[6].exit.mid }; });
  const f2 = await toScreen(st2.end), t2 = await toScreen(st2.other);
  await page.waitForTimeout(3500);
  const f2b = await toScreen(st2.end), t2b = await toScreen(st2.other);
  await page.mouse.move(f2b.x, f2b.y); await page.mouse.down();
  for (let k = 1; k <= 12; k++) { await page.mouse.move(f2b.x + ((t2b.x - f2b.x) * k) / 12, f2b.y + ((t2b.y - f2b.y) * k) / 12); if (k % 3 === 0) console.log("back step", k, JSON.stringify(await state())); }
  await page.mouse.up();
  console.log("after back", JSON.stringify(await state()));
  await page.screenshot({ path: process.env.SHOT });
  await page.close(); await browser.close();
})();
