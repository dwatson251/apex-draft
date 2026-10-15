import { VEHICLES, type VehicleId } from "@apex/sim";
import { CarAudio } from "./audio.ts";

const audio = new CarAudio();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ids = Object.keys(VEHICLES) as VehicleId[];
for (const id of ids) $<HTMLSelectElement>("veh").add(new Option(VEHICLES[id].name, id));
const val = (id: string) => Number($<HTMLInputElement>(id).value);
const veh = () => $<HTMLSelectElement>("veh").value as VehicleId;
/** a mid-stat car of this type, which is what the engine assumes without being told */
const topOf = () => 110 * VEHICLES[veh()].top;
let sweep: number | null = null;

const fitSpeed = () => { const s = $<HTMLInputElement>("speed"); s.max = String(Math.round(topOf() * 1.05)); s.value = String(Math.min(val("speed"), Number(s.max))); };
fitSpeed();

setInterval(() => {
  $("sv").textContent = String(val("speed")); $("av").textContent = String(val("accel")); $("lv").textContent = String(val("slip"));
  audio.update("lab", veh(), { speed: val("speed"), accel: val("accel"), slip: val("slip") / 100, vol: 1, pan: 0, top: topOf() }, true);
  const g = audio.gearOf("lab");
  $("gv").textContent = g ? String(g) : "-";
}, 33);

$("start").onclick = () => { audio.setMusic(false); audio.unlock(); };
$("stop").onclick = () => audio.stopAll();
$("veh").onchange = () => { audio.stopAll(); fitSpeed(); audio.unlock(); }; // a new voice for the new engine
$("sweep").onclick = () => {
  if (sweep !== null) { clearInterval(sweep); sweep = null; return; }
  audio.unlock();
  let t = 0;
  sweep = window.setInterval(() => {
    t += 0.033 / 14; // a 14 second run up through the gears and back down on the brakes
    const up = t < 0.55, x = up ? t / 0.55 : 1 - (t - 0.55) / 0.45;
    $<HTMLInputElement>("speed").value = String(Math.round(x * topOf()));
    $<HTMLInputElement>("accel").value = String(up ? 90 : -70);
    if (t >= 1) { clearInterval(sweep!); sweep = null; $<HTMLInputElement>("accel").value = "0"; }
  }, 33);
};
