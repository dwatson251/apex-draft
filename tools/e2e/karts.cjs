// End-to-end checks of the Kart Tracks picker, over the Chrome DevTools protocol (see ui.cjs for how to start the browser and the dev server).
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
    await page.click("#h-race");
    ok(`${tag}: the Race group has a Kart Tracks tile`, !!(await page.$("#h-karts")));
    await page.click("#h-karts"); await page.waitForSelector("#kg-smk"); await shot(`${tag}-games`);
    ok(`${tag}: every game with courses is a tile`, (await page.$$("[id^=kg-]")).length === 8);
    await page.click("#kg-mk8"); await page.waitForSelector("#kc-0"); await shot(`${tag}-cups`);
    await page.click("#kc-0"); await page.waitForSelector("[id^=kr-]"); await shot(`${tag}-courses`);
    ok(`${tag}: a cup lists its courses with a lap drawing and stars`, (await page.$$("[id^=kr-] svg")).length >= 3 && (await page.$$("[id^=kr-] .tstars")).length >= 3);
    const fits = await page.evaluate(() => { const p = document.querySelector(".menu-panel").getBoundingClientRect(); return p.right <= window.innerWidth + 1; });
    ok(`${tag}: it fits the width`, fits);
    await page.click("[id^=kr-]"); await page.waitForSelector("#d-easy");
    await page.click("#d-easy"); await page.waitForSelector("#go"); await page.waitForTimeout(800);
    const info = await page.evaluate(() => { const g = window.__game, p = g.settings.phrase, c = window.__sim.placeFor(p).choices; return { p, v: g.pickVehicle(c), c }; });
    ok(`${tag}: the course is the phrase, and a kart is the default among four classes`, info.p === "mario-kart-stadium" && info.v === "kart" && info.c.length === 4, JSON.stringify(info));
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
