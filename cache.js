/**
 * Simple in-memory cache with TTL.
 * In production, swap this for Redis or a lightweight SQLite store.
 */

class Cache {
  constructor() {
    this.store = new Map();
  }

  set(key, value, ttlMs) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      cachedAt: new Date().toISOString(),
    });
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  has(key) {
    return !!this.get(key);
  }

  meta(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    return { cachedAt: entry.cachedAt, expiresAt: new Date(entry.expiresAt).toISOString() };
  }

  clear(key) {
    this.store.delete(key);
  }
}

// Singleton
const cache = new Cache();
module.exports = cache;
