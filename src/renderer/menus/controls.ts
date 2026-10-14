import { COMPOUNDS, COMPOUND_IDS, type Compound } from "@apex/sim";

/** Hand-built form controls for the menus: plain strings in, and one `wireControls` call out to make them live. */

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface Opt { value: string; label: string }

/** A dropdown that opens a list of bubbles. `id` comes back with the chosen value. */
export function dropdown(id: string, value: string, opts: Opt[], o: { disabled?: boolean; label?: string } = {}): string {
  const cur = opts.find((x) => x.value === value) ?? opts[0];
  return `<div class="dd ${o.disabled ? "off" : ""}" data-dd="${id}" data-value="${esc(cur?.value ?? "")}">
    <button type="button" class="dd-btn" id="${id}" ${o.disabled ? "disabled" : ""} aria-haspopup="listbox" ${o.label ? `aria-label="${esc(o.label)}"` : ""}><span>${esc(cur?.label ?? "")}</span><i aria-hidden="true"></i></button>
    <div class="dd-list" role="listbox">${opts.map((x) => `<button type="button" class="dd-opt ${x.value === cur?.value ? "on" : ""}" role="option" data-v="${esc(x.value)}">${esc(x.label)}</button>`).join("")}</div>
  </div>`;
}

/** − value + */
export function stepper(id: string, value: number, min: number, max: number, o: { disabled?: boolean; unit?: string } = {}): string {
  return `<div class="stepper ${o.disabled ? "off" : ""}" data-step="${id}" data-min="${min}" data-max="${max}" data-value="${value}">
    <button type="button" data-d="-1" ${o.disabled || value <= min ? "disabled" : ""} aria-label="less">−</button>
    <b id="${id}">${value}${o.unit ?? ""}</b>
    <button type="button" data-d="1" ${o.disabled || value >= max ? "disabled" : ""} aria-label="more">+</button>
  </div>`;
}

/** An on/off switch. */
export function toggle(id: string, on: boolean, o: { disabled?: boolean } = {}): string {
  return `<button type="button" class="switch ${on ? "on" : ""}" id="${id}" data-switch="${id}" role="switch" aria-checked="${on}" ${o.disabled ? "disabled" : ""}><i></i></button>`;
}

/** A text entry with a copy button inside it, for the track phrase. */
export function copyField(id: string, value: string, o: { disabled?: boolean } = {}): string {
  return `<div class="field"><input id="${id}" class="fancy" type="text" value="${esc(value)}" spellcheck="false" autocomplete="off" ${o.disabled ? "disabled" : ""} />
    <button type="button" class="field-copy" id="${id}-copy" title="Copy the track phrase to share it" aria-label="Copy the track phrase">⧉<span>Copy</span></button></div>`;
}

/** Tyre compounds that can each be on or off. */
export function compoundChips(id: string, selected: Compound[], o: { disabled?: boolean } = {}): string {
  return `<div class="cchips" data-chips="${id}">${COMPOUND_IDS.map((c) => {
    const col = `#${COMPOUNDS[c].color.toString(16).padStart(6, "0")}`;
    return `<button type="button" class="cchip ${selected.includes(c) ? "on" : ""}" data-v="${c}" style="--c:${col}" title="${esc(COMPOUNDS[c].blurb)}" ${o.disabled ? "disabled" : ""}><i></i>${COMPOUNDS[c].name}</button>`;
  }).join("")}</div>`;
}

export interface Wiring {
  /** a dropdown, stepper or switch changed: `value` is the option, the number, or "1"/"0" */
  change(id: string, value: string): void;
  /** the chips changed: the set that is now on */
  chips?(id: string, on: Compound[]): void;
}

let docWired = false;
function closeDropdowns(except?: Element | null): void {
  document.querySelectorAll(".dd.open").forEach((d) => { if (d !== except) d.classList.remove("open"); });
}

/** Make everything `root` contains work. Call it after every render. */
export function wireControls(root: HTMLElement, w: Wiring): void {
  if (!docWired) {
    docWired = true;
    document.addEventListener("pointerdown", (e) => closeDropdowns((e.target as Element | null)?.closest?.(".dd")));
  }
  root.querySelectorAll<HTMLElement>(".dd").forEach((dd) => {
    const id = dd.dataset["dd"]!, btn = dd.querySelector<HTMLButtonElement>(".dd-btn")!;
    const opts = [...dd.querySelectorAll<HTMLButtonElement>(".dd-opt")];
    btn.addEventListener("click", () => {
      const open = !dd.classList.contains("open");
      closeDropdowns(dd);
      dd.classList.toggle("open", open);
      if (open) dd.querySelector(".dd-opt.on")?.scrollIntoView({ block: "nearest" });
    });
    opts.forEach((o) => o.addEventListener("click", () => { dd.classList.remove("open"); w.change(id, o.dataset["v"]!); }));
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dd.classList.contains("open")) { e.stopPropagation(); dd.classList.remove("open"); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const i = opts.findIndex((o) => o.dataset["v"] === dd.dataset["value"]);
      const next = opts[Math.min(opts.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))];
      if (next && next.dataset["v"] !== dd.dataset["value"]) w.change(id, next.dataset["v"]!);
    });
  });
  root.querySelectorAll<HTMLElement>(".stepper").forEach((st) => {
    const id = st.dataset["step"]!, min = Number(st.dataset["min"]), max = Number(st.dataset["max"]), v = Number(st.dataset["value"]);
    st.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.addEventListener("click", (e) => {
      const big = (e as MouseEvent).shiftKey ? 5 : 1;
      w.change(id, String(Math.min(max, Math.max(min, v + Number(b.dataset["d"]) * big))));
    }));
  });
  root.querySelectorAll<HTMLButtonElement>(".switch").forEach((sw) => sw.addEventListener("click", () => w.change(sw.dataset["switch"]!, sw.classList.contains("on") ? "0" : "1")));
  root.querySelectorAll<HTMLElement>(".cchips").forEach((box) => {
    const id = box.dataset["chips"]!;
    box.querySelectorAll<HTMLButtonElement>(".cchip").forEach((b) => b.addEventListener("click", () => {
      const now = new Set([...box.querySelectorAll<HTMLElement>(".cchip.on")].map((x) => x.dataset["v"] as Compound));
      const c = b.dataset["v"] as Compound;
      if (now.has(c)) now.delete(c); else now.add(c);
      w.chips?.(id, COMPOUND_IDS.filter((x) => now.has(x)));
    }));
  });
}

/** Copy text; true if the browser let us. */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
