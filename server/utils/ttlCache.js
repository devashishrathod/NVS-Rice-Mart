/**
 * Chhota in-process TTL cache.
 *
 * Ek pincode pe hazaron customers hote hain par uska vendor mapping bahut
 * kam badalta hai — isliye `zipcode → vendor` lookup cache karna sabse bada
 * scalability win hai (har listing call se 2-3 query bachti hain).
 *
 * Interface jaan-boojh ke Redis jaisa rakha hai. Multi-instance pe jaane ke
 * waqt sirf is file ka andar Redis se replace karna hoga — call sites nahi.
 *
 * ⚠️ Ye per-process hai. Do server instances chal rahe hon to invalidation
 *    sirf usi instance pe lagegi jisne write kiya. TTL chhota (5 min) isliye
 *    rakha hai ki worst case bhi 5 min me self-heal ho jaye.
 */
class TtlCache {
  constructor({ ttlMs = 5 * 60 * 1000, maxEntries = 5000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.store = new Map(); // key -> { value, expiresAt }
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    // touch — Map insertion order ko LRU ki tarah use kar rahe hain
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits++;
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (this.store.size >= this.maxEntries) {
      // sabse purani entry nikaalo
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.ttlMs),
    });
  }

  del(key) {
    this.store.delete(key);
  }

  /** Prefix se saari keys hatao (e.g. poore vendor ka cache). */
  delByPrefix(prefix) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear() {
    this.store.clear();
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total ? +((this.hits / total) * 100).toFixed(1) : 0,
    };
  }
}

// zipcode → { vendorId, shopName, ... }
const serviceAreaCache = new TtlCache({ ttlMs: 5 * 60 * 1000, maxEntries: 20000 });

module.exports = { TtlCache, serviceAreaCache };
