// End-to-end checks that the Mario Kart courses are secret tracks (no menu tile, no picker) but still raceable by typing a name, over the Chrome DevTools protocol (see ui.cjs for how to start the browser and the dev server).
//   PLAYWRIGHT=/path/to/node_modules/playwright SHOTS=/some/dir node tools/e2e/karts.cjs
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const BASE = process.env.APEX_URL || "http://localhost:5199/";
const CDP = process.env.CDP || "http://localhost:9333";
const OUT = process.env.SHOTS || "";

(async () => {
  const browser = await chromium.connectOverCDP(CDP);
  const page = await (browser.contexts()[0] ?? (await browser.newContext())).newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  let failed = 0;
  const ok = (name, cond, extra = "") => { if (!cond) failed++; console.log(cond ? "PASS" : "FAIL", name, extra); };
  const shot = async (n) => { if (OUT) await page.screenshot({ path: `${OUT}/${n}.png` }); };
  for (const [w, h, tag] of [[1280, 800, "desktop"], [844, 390, "phone"]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(BASE + "?t=1"); await page.evaluate(() => localStorage.clear()); await page.goto(BASE + "?t=1");
    await page.waitForSelector(".tilegrid"); await page.waitForTimeout(1200);
    await page.click("#h-race"); await page.waitForSelector("#h-quick"); await shot(`${tag}-race`);
    ok(`${tag}: the Race group has no Kart Tracks tile`, !(await page.$("#h-karts")) && !(await page.$("[id^=kg-]")));
    ok(`${tag}: the Race group is just Quick Race, Race Weekend and Championship`, (await page.$$(".tilegrid.group .tile")).length === 3);
    const fits = await page.evaluate(() => { const p = document.querySelector(".menu-panel").getBoundingClientRect(); return p.right <= window.innerWidth + 1; });
    ok(`${tag}: it fits the width`, fits);
    // a course typed into the phrase box is still the course, with a kart as the default among four classes
    await page.evaluate(() => { const g = window.__game; g.settings.phrase = "mario-kart-stadium"; });
    const info = await page.evaluate(() => { const g = window.__game, p = g.settings.phrase, c = window.__sim.placeFor(p).choices; return { p, v: g.pickVehicle(c), c, kart: window.__sim.circuitFor(p)?.kart === true }; });
    ok(`${tag}: a typed course name is still a kart course, with a kart as the default among four classes`, info.kart && info.v === "kart" && info.c.length === 4, JSON.stringify(info));
    await page.click("#back").catch(() => {});
  }
  // a machine chosen for another track is not carried over to a kart course
  await page.evaluate(() => { const g = window.__game; g.settings.phrase = "brave-owl-rides-melons"; g.settings.vehicle = "rally"; g.settings.vehiclePhrase = "brave-owl-rides-melons"; g.settings.phrase = "luigi-raceway"; });
  ok("a machine picked for another track is ignored on a kart course", await page.evaluate(() => window.__game.pickVehicle(window.__sim.placeFor("luigi-raceway").choices) === "kart"));
  ok("Random on a kart course goes to another kart course", await page.evaluate(() => { const n = window.__sim.nextCircuit("luigi-raceway"); return !!n && window.__sim.CIRCUITS.find((c) => c.id === n).kart === true; }));
  ok("no errors in the page", errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await page.close(); await browser.close();
  console.log(failed ? `${failed} FAILED` : "all passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("SCRIPT FAIL", e.message); process.exit(1); });
