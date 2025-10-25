/**
 * SafeCache — versioned, user-aware, optionally disabled cache wrapper
 * for Google Apps Script.
 *
 * Features:
 *  - Tracks all keys you set (so you can clear all later)
 *  - Supports global versioning (cache invalidation across deployments)
 *  - Optionally user-specific (per logged-in user)
 *  - Can be globally disabled (enable=false)
 */
class SafeCache {
  /**
   * @param {GoogleAppsScript.Cache.Cache} cache - Cache instance from CacheService
   * @param {Object} [options]
   * @param {string} [options.version="1"] - Version tag for all cache keys
   * @param {boolean} [options.perUser=true] - Whether to isolate cache per user
   * @param {boolean} [options.enable=true] - Whether caching is active
   */
  constructor(cache, options = {}) {
    this.cache = cache;
    this.version = options.version || "1";
    this.perUser = options.perUser !== false; // default true
    this.enabled = options.enable !== false;  // default true

    const userKeyPart = this.perUser ? Session.getTemporaryActiveUserKey() + "__" : "";
    this.globalPrefix = `v${this.version}_${userKeyPart}`;
    this.KEY_TRACKER = `${this.globalPrefix}SAFE_CACHE_KEYS__`;
  }

  /** Store a value and remember the key */
  put(key, value, ttlSeconds = 21600) {
    if (!this.enabled) return; // skip if disabled
    const fullKey = this.globalPrefix + key;
    this.cache.put(fullKey, value, ttlSeconds);
    this._trackKey(fullKey, ttlSeconds);
  }

  /** Retrieve a value */
  get(key) {
    if (!this.enabled) return null;
    console.log(this.globalPrefix + key);
    return this.cache.get(this.globalPrefix + key);
  }

  /** Retrieve multiple values */
  getAll(keys) {
    if (!this.enabled) return {};
    const mappedKeys = keys.map(k => this.globalPrefix + k);
    return this.cache.getAll(mappedKeys);
  }

  /** Remove specific key(s) */
  remove(keys) {
    if (!this.enabled) return;
    if (!Array.isArray(keys)) keys = [keys];
    const fullKeys = keys.map(k => this.globalPrefix + k);
    this.cache.removeAll(fullKeys);
    this._untrackKeys(fullKeys);
  }

  /** Remove all tracked keys for this version/user */
  clearAll() {
    if (!this.enabled) return;
    const tracked = this._getTrackedKeys();
    if (tracked.length > 0) {
      this.cache.removeAll(tracked);
    }
    this.cache.remove(this.KEY_TRACKER);
  }

  /** Private: track new keys */
  _trackKey(key, ttlSeconds) {
    const tracked = this._getTrackedKeys();
    if (!tracked.includes(key)) tracked.push(key);
    this.cache.put(this.KEY_TRACKER, JSON.stringify(tracked), ttlSeconds);
  }

  /** Private: untrack removed keys */
  _untrackKeys(keys) {
    let tracked = this._getTrackedKeys();
    tracked = tracked.filter(k => !keys.includes(k));
    this.cache.put(this.KEY_TRACKER, JSON.stringify(tracked), 21600);
  }

  /** Private: get tracked keys */
  _getTrackedKeys() {
    const json = this.cache.get(this.KEY_TRACKER);
    return json ? JSON.parse(json) : [];
  }
}



function testSafeCache() {
  // Script-wide cache with versioning
  const cache = new SafeCache(CacheService.getScriptCache(), {
    version: "3",
    perUser: true,
    enable: true, // toggle to false to disable caching
  });

  // cache.put("foo", "bar", 300);
  Logger.log(cache.get("foo2")); // ? "bar"

  cache.clearAll(); // clears only versioned/user-specific cache
}
