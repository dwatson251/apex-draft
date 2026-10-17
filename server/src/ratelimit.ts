/** A token bucket per key, in memory: `burst` requests at once, refilled to `per` requests over `windowMs`. Idle keys are forgotten. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  private last = Date.now();

  take(key: string, burst: number, per: number, windowMs: number, now = Date.now()): boolean {
    if (now - this.last > 60_000) { this.sweep(now); this.last = now; }
    const b = this.buckets.get(key) ?? { tokens: burst, at: now };
    b.tokens = Math.min(burst, b.tokens + ((now - b.at) / windowMs) * per);
    b.at = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    return ok;
  }

  private sweep(now: number): void { for (const [k, b] of this.buckets) if (now - b.at > 3600_000) this.buckets.delete(k); }
}
