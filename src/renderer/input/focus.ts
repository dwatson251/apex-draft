import { pickNeighbour } from "./gamepad.ts";

/** Spatial focus for the DOM menus and the bottom bar, so a gamepad d-pad can walk them. Everything in them is a button. */

const SEL = "button:not([disabled]), input:not([disabled]), select:not([disabled])";

const visible = (el: HTMLElement): boolean => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
};

export function focusables(scopes: (HTMLElement | null)[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const s of scopes) if (s) s.querySelectorAll<HTMLElement>(SEL).forEach((el) => { if (visible(el)) out.push(el); });
  return out;
}

const centre = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

let lastId = "";

/** Move focus one step in a direction within these scopes. If nothing valid is focused yet, focus the remembered or first item. */
export function moveFocus(scopes: (HTMLElement | null)[], dir: "up" | "down" | "left" | "right"): HTMLElement | null {
  const items = focusables(scopes);
  if (!items.length) return null;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !items.includes(cur)) {
    const el = items.find((e) => e.id && e.id === lastId) ?? items[0]!;
    el.focus(); lastId = el.id; return el;
  }
  const n = pickNeighbour(centre(cur), items.map(centre), dir);
  if (n === null) return cur;
  const el = items[n]!;
  el.focus(); lastId = el.id;
  return el;
}

/** Click what is focused (if it is one of these scopes' items); returns whether anything was clicked. */
export function activateFocus(scopes: (HTMLElement | null)[]): boolean {
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !focusables(scopes).includes(cur)) return false;
  lastId = cur.id;
  cur.click();
  return true;
}

/** Drop focus so the next move starts fresh (used when going back to the cursor). */
export function clearFocus(): void { (document.activeElement as HTMLElement | null)?.blur?.(); }
