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
  onClick: () => void;
}

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
  }

  /** Show these buttons (and this hint, as HTML) and nothing else. */
  set(buttons: BarButton[], hintHtml = ""): void {
    this.bar.innerHTML = "";
    for (const b of buttons) {
      const el = document.createElement("button");
      el.className = `big ${b.color}${b.wide ? " wide" : ""}`;
      el.id = `bar-${b.id}`;
      el.textContent = b.label;
      el.disabled = !!b.disabled;
      el.addEventListener("click", () => { this.hideTip(); b.onClick(); });
      el.addEventListener("mouseenter", () => this.showTip(el, b.tip));
      el.addEventListener("mouseleave", () => this.hideTip());
      this.bar.appendChild(el);
    }
    this.bar.style.display = buttons.length ? "flex" : "none";
    this.hint.innerHTML = hintHtml;
    this.hint.style.display = hintHtml ? "block" : "none";
    this.hideTip();
  }

  /** Update only the hint, leaving the buttons (and any hover in progress) alone. */
  setHint(hintHtml: string): void {
    if (this.hint.innerHTML !== hintHtml) this.hint.innerHTML = hintHtml;
    this.hint.style.display = hintHtml ? "block" : "none";
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
