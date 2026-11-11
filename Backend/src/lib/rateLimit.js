/**
 * Counts failures per key inside a time window (in memory; resets when the server restarts).
 * Used to slow down password guessing and OTP guessing.
 */
export class FailureCounter {
  #entries = new Map();

  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  #current(key) {
    const entry = this.#entries.get(key);
    if (entry && Date.now() - entry.start >= this.windowMs) {
      this.#entries.delete(key);
      return null;
    }
    return entry ?? null;
  }

  isBlocked(key) {
    const entry = this.#current(key);
    return Boolean(entry && entry.count >= this.limit);
  }

  /** Whole minutes until the key is allowed again (at least 1). */
  minutesLeft(key) {
    const entry = this.#current(key);
    if (!entry) return 0;
    return Math.max(1, Math.ceil((entry.start + this.windowMs - Date.now()) / 60_000));
  }

  /** Records a failure and returns the failure count in the current window. */
  fail(key) {
    const entry = this.#current(key) ?? { count: 0, start: Date.now() };
    entry.count += 1;
    this.#entries.set(key, entry);
    if (this.#entries.size > 10_000) this.#prune();
    return entry.count;
  }

  reset(key) {
    this.#entries.delete(key);
  }

  #prune() {
    const now = Date.now();
    for (const [key, entry] of this.#entries) if (now - entry.start >= this.windowMs) this.#entries.delete(key);
  }
}
