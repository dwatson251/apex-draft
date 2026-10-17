import { EDIT_ICON, FLAG_ICON, TYRE_ICON } from "./hudicons.ts";

/** The row of big colour buttons at the bottom centre of the screen, with a hint line above it and hover text. */
export type BarColor = "yellow" | "orange" | "pink" | "cyan" | "green" | "violet" | "blue" | "grey";

export interface BarButton {
  id: string;
  label: string;
  color: BarColor;
  /** what it does: shown when the mouse is over it */
  tip: string;
  disabled?: boolean;
  /** bigger and in the middle: the button you are most likely to want */
  wide?: boolean;
  /** shown instead of the label on small screens (a default is picked from the id) */
  icon?: string;
  onClick: () => void;
  /** right click (the browser's own menu is kept away from the button either way) */
  onSecondary?: () => void;
}

/** What each button looks like with no room for words. */
const ICONS: Record<string, string> = {
  undo: "↶", tool: "✎", clear: "⌫", pits: TYRE_ICON, fin: "✔", cancel: "✖", edit: EDIT_ICON, go: FLAG_ICON, skip: "⏭", revert: "⟲", sound: "♪", speed: "⏩", again: "↻", next: "➜", back: "←",
};

const iconFor = (b: BarButton): string => b.id === "speed" ? b.label : b.id === "sound" ? (/off/i.test(b.label) ? "🔇" : "🔊") : ICONS[b.id] ?? b.label.slice(0, 1);

const icon = (s: string): string => (s.startsWith("<svg") ? s : esc(s));

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export class Bar {
  private bar: HTMLElement;
  private hint: HTMLElement;
  private tip: HTMLElement;

  constructor(host: HTMLElement) {
    this.hint = document.createElement("div"); this.hint.id = "hint"; this.hint.style.display = "none";
    this.bar = document.createElement("div"); this.bar.id = "bar"; this.bar.style.display = "none";
    this.tip = document.createElement("div"); this.tip.id = "tip"; this.tip.style.display = "none";
    host.append(this.hint, this.bar, this.tip);
    // the hint sits just above the top of the buttons, wherever they wrap to
    if (typeof ResizeObserver !== "undefined") { const ro = new ResizeObserver(() => this.layout()); ro.observe(this.bar); ro.observe(this.hint); }
    window.addEventListener("resize", () => this.layout());
  }

  /** Put the hint (and the panels above it) clear of the buttons: --bar-clear is the room under them, --hint-h the hint's height. */
  private layout = (): void => {
    const root = document.documentElement.style;
    const r = this.bar.getBoundingClientRect();
    const atBottom = this.bar.style.display !== "none" && r.height > 0 && r.top > window.innerHeight / 2;
    root.setProperty("--bar-clear", `${Math.round(atBottom ? window.innerHeight - r.top + 10 : 10)}px`);
    root.setProperty("--hint-h", `${Math.round(this.hint.style.display === "none" ? 0 : this.hint.offsetHeight)}px`);
  };

  /** Show these buttons (and this hint, as HTML) and nothing else. */
  set(buttons: BarButton[], hintHtml = ""): void {
    this.bar.innerHTML = "";
    for (const b of buttons) {
      const el = document.createElement("button");
      el.className = `big ${b.color}${b.wide ? " wide" : ""}`;
      el.id = `bar-${b.id}`;
      el.innerHTML = `<span class="ic" aria-hidden="true">${icon(b.icon ?? iconFor(b))}</span><span class="tx">${esc(b.label)}</span>`;
      el.title = b.label; el.setAttribute("aria-label", b.label);
      el.disabled = !!b.disabled;
      el.addEventListener("click", () => { this.hideTip(); b.onClick(); });
      el.addEventListener("contextmenu", (e) => { e.preventDefault(); if (b.onSecondary) { this.hideTip(); b.onSecondary(); } });
      el.addEventListener("mouseenter", () => this.showTip(el, b.tip));
      el.addEventListener("mouseleave", () => this.hideTip());
      this.bar.appendChild(el);
    }
    this.bar.style.display = buttons.length ? "flex" : "none";
    this.hint.innerHTML = hintHtml;
    this.hint.style.display = hintHtml ? "block" : "none";
    this.hideTip();
    this.layout();
  }

  /** Update only the hint, leaving the buttons (and any hover in progress) alone. */
  setHint(hintHtml: string): void {
    if (this.hint.innerHTML !== hintHtml) this.hint.innerHTML = hintHtml;
    this.hint.style.display = hintHtml ? "block" : "none";
    this.layout();
  }

  /** Change a button's label in place (its icon follows: the speed shows its rate, sound its state). */
  setLabel(id: string, label: string): void {
    const el = this.button(id);
    if (!el) return;
    const tx = el.querySelector(".tx"), ic = el.querySelector(".ic");
    if (tx) tx.textContent = label;
    if (ic) ic.innerHTML = icon(iconFor({ id, label } as BarButton));
    el.title = label; el.setAttribute("aria-label", label);
  }

  clear(): void { this.set([]); }

  button(id: string): HTMLButtonElement | null { return this.bar.querySelector(`#bar-${id}`); }

  private showTip(el: HTMLElement, text: string): void {
    if (!text) return;
    this.tip.innerHTML = esc(text);
    this.tip.style.display = "block";
    const r = el.getBoundingClientRect(), w = this.tip.offsetWidth;
    this.tip.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    this.tip.style.top = `${r.top - this.tip.offsetHeight - 12}px`;
  }

  private hideTip(): void { this.tip.style.display = "none"; }
}
