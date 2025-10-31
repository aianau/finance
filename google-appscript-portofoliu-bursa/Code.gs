// NEW HELPER FUNCTION FOR CURRENCY CONVERSION
/**
 * Fetches the exchange rate from a base currency to a target currency (EUR).
 * @param {string} fromCurrency The currency code to convert from (e.g., "USD").
 * @param {SafeCache} cache The cache instance to use.
 * @return {number|null} The exchange rate, or null if an error occurs.
 */
function getExchangeRate(fromCurrency, cache) {
  if (fromCurrency === "EUR") {
    return 1; // No conversion needed
  }
  const toCurrency = "EUR";
  const cacheKey = `rate_${fromCurrency}_${toCurrency}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`Cache hit (rate): ${cacheKey}`);
    return JSON.parse(cached);
  }

  // Using a free, no-key-required API: exchangerate.host
  let url = `https://api.exchangerate.host/latest?base=${fromCurrency}&symbols=${toCurrency}`;
  url += "&cacheBust=" + new Date().getTime(); // Cache busting

  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());

    if (data.success && data.rates && data.rates[toCurrency]) {
      const rate = data.rates[toCurrency];
      console.log(`Fetched exchange rate ${fromCurrency}->${toCurrency}: ${rate}`);
      // Cache for 1 hour, as rates don't change that frequently
      cache.put(cacheKey, JSON.stringify(rate), 3600);
      return rate;
    } else {
      console.error(`Failed to fetch exchange rate for ${fromCurrency}`);
      return null;
    }
  } catch (err) {
    console.error("Error fetching exchange rate:", err);
    return null;
  }
}


function isNullOrEmpty(str) {
  return !str || str.trim() === "";
}

function roundValue(value) {
  const number = Number(value);
  if (isNaN(number)) {
    return value; // return original if not a number
  }
  return value != null ? Math.round(number * 100) / 100 : null;
}

/**
 * SafeCache - versioned, user-aware, optionally disabled cache wrapper
 * for Google Apps Script.
 */
class SafeCache {
  constructor(cache, options = {}) {
    this.cache = cache;
    this.version = options.version || "1";
    this.perUser = options.perUser !== false; // default true
    this.enabled = options.enable !== false;  // default true

    let userKeyPart = "";
    if (this.perUser) {
      const fullUserKey = Session.getTemporaryActiveUserKey();
      // Create a short hash of the user key to avoid cache key length limits (250 chars max)
      const userHash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, fullUserKey)
        .map(byte => (byte + 256).toString(36).slice(1))
        .join('')
        .substring(0, 8); // Use first 8 chars of hash
      userKeyPart = userHash + "__";
    }
    this.globalPrefix = `v${this.version}_${userKeyPart}`;
    this.KEY_TRACKER = `${this.globalPrefix}SAFE_CACHE_KEYS__`;
  }

  /** Store a value and remember the key */
  put(key, value, ttlSeconds = 21600) {
    if (!this.enabled) return; // skip if disabled
    const fullKey = this.globalPrefix + key;
    // ttlSeconds = 30; // DECOMMENT if wat to debug
    this.cache.put(fullKey, value, ttlSeconds);
    // this._trackKey(fullKey, ttlSeconds);
  }

  /** Retrieve a value */
  get(key) {
    if (!this.enabled) return null;
    // console.log(this.globalPrefix + key);
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
    // this._untrackKeys(fullKeys);
  }

  /** Remove all tracked keys for this version/user */
  // clearAll() {
  //   if (!this.enabled) return;
  //   const tracked = this._getTrackedKeys();
  //   if (tracked.length > 0) {
  //     this.cache.removeAll(tracked);
  //   }
  //   this.cache.remove(this.KEY_TRACKER);
  // }

  /** Private: track new keys */
  // _trackKey(key, ttlSeconds) {
  //   const tracked = this._getTrackedKeys();
  //   if (!tracked.includes(key)) tracked.push(key);
  //   this.cache.put(this.KEY_TRACKER, JSON.stringify(tracked), ttlSeconds);
  // }

  /** Private: untrack removed keys */
  // _untrackKeys(keys) {
  //   let tracked = this._getTrackedKeys();
  //   tracked = tracked.filter(k => !keys.includes(k));
  //   this.cache.put(this.KEY_TRACKER, JSON.stringify(tracked), 21600);
  // }

  /** Private: get tracked keys */
  // _getTrackedKeys() {
  //   const json = this.cache.get(this.KEY_TRACKER);
  //   return json ? JSON.parse(json) : [];
  // }
}

/**
 * YahooFinanceAPI - Class-based Yahoo Finance data fetcher with intelligent caching
 * Manages its own cache internally to avoid parameter passing and unnecessary instantiation
 */
class YahooFinanceAPI {
  constructor(options = {}) {
    this.cache = new SafeCache(CacheService.getScriptCache(), {
      version: "12", // Enhanced caching version
      perUser: true,
      enable: true,
      ...options
    });

    // Define property categories for intelligent caching
    this.staticProperties = ['currency', 'symbol', 'longName', 'shortName',
      'instrumentType', 'exchangeName', 'fullExchangeName',
      'firstTradeDate', 'timezone', 'exchangeTimezoneName'];

    this.dynamicProperties = ['regularMarketPrice', 'regularMarketVolume',
      'regularMarketDayHigh', 'regularMarketDayLow',
      'fiftyTwoWeekHigh', 'fiftyTwoWeekLow', 'changePct',
      'regularMarketTime', 'previousClose', 'chartPreviousClose'];
  }

  /**
   * Get a property for a ticker (supports both single values and arrays)
   * @param {string|Array} ticker - Single ticker or array of tickers
   * @param {string} property - Property to fetch (e.g., 'regularMarketPrice', 'longName')
   * @return {*} Property value or array of values
   */
  getProperty(ticker, property) {
    if (!ticker || !property) {
      console.error(`Invalid ticker: ${ticker} or property: ${property}`);
      return null;
    }

    // Handle array input (ARRAYFORMULA)
    if (Array.isArray(ticker)) {
      const results = [];
      for (let i = 0; i < ticker.length; i++) {
        const t = ticker[i][0];
        if (!t) {
          results.push([""]);
          continue;
        }
        const val = this._fetchSingleProperty(t, property);
        results.push([val]);
      }
      return results;
    }

    // Single ticker case
    return this._fetchSingleProperty(ticker, property);
  }

  /**
   * Get historical data for a ticker
   * @param {string} ticker - Ticker symbol
   * @param {Date} startDate - Start date (optional)
   * @param {Date} endDate - End date (optional)
   * @return {*} Historical price data
   */
  getHistory(ticker, startDate, endDate) {
    // console.log("test:");
    // ticker = "IWDA.AS";
    // // ticker = "TLV.RO";
    // let todayTest = new Date();
    // todayTest.setHours(0, 0, 0, 0);
    // startDate = new Date();
    // startDate.setHours(0, 0, 0, 0);

    // // test: today test
    // // startDateParam.setDate(todayTest.getDate());

    // // test: another day in the past 
    // // startDateParam.setDate(todayTest.getDate()-30);

    // // test: range last 10 days
    // startDate.setDate(todayTest.getDate() - 5);
    // endDate = new Date();
    // endDate.setHours(0, 0, 0, 0);
    // endDate.setDate(todayTest.getDate());



    if (isNullOrEmpty(ticker)) {
      console.error("ticker required");
      return "ERR[getHistory]: Ticker parameter is required (empty or null)";
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start = startDate ? sheetDateToJS(startDate) : null;
    let end = endDate ? sheetDateToJS(endDate) : null;

    // Case 1: Fetching for today's current price
    if (start && !end && start.getTime() === today.getTime()) {
      return this._fetchTodaysPrice(ticker);
    }

    // Case 2: Single historical day (completed trading day)
    if (start && !end && start.getTime() < today.getTime()) {
      return this._fetchSingleHistoricalDay(ticker, start);
    }

    // Case 3: Historical range or default range
    if (!start) {
      start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      end = today;
    }
    if (start && !end) {
      end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    }

    return this._fetchHistoricalRange(ticker, start, end, !endDate && !!startDate);
  }

  /**
   * Private method to fetch a single property with intelligent caching
   */
  _fetchSingleProperty(ticker, property) {
    // First check if we have cached static metadata (30-day cache)
    const staticCacheKey = `static_${ticker}`;
    // If requesting static property we try to get it from cache
    let staticData = this.staticProperties.includes(property) ? this.cache.get(staticCacheKey) : null;

    if (staticData) {
      staticData = JSON.parse(staticData);
      // if we have it cached, return immediately
      if (staticData[property] !== undefined) {
        console.log(`Static cache hit for ${ticker}.${property}: ${staticData[property]}`);
        return roundValue(staticData[property]);
      }
    }

    // For dynamic properties, check recent cache (2-minute cache)
    const dynamicCacheKey = `dynamic_${ticker}`;
    // If requesting dynamic property we try to get it from cache
    let dynamicData = this.dynamicProperties.includes(property) ? this.cache.get(dynamicCacheKey) : null;

    if (dynamicData) {
      dynamicData = JSON.parse(dynamicData);
      // if we have it cached, return immediately
      if (dynamicData[property] !== undefined) {
        console.log(`Dynamic cache hit for ${ticker}.${property}: ${dynamicData[property]}`);
        return roundValue(dynamicData[property]);
      }
    }

    // Need to fetch from API
    let url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
    url += "?cacheBust=" + new Date().getTime();
    console.log(`API call for ${ticker}.${property}: ${url}`);

    try {
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const data = JSON.parse(res.getContentText());

      if (!data.chart?.result?.[0]) {
        console.error(`ERR[_fetchSingleProperty]: No chart data returned from API for ticker ${ticker}, property ${property}`);
        return `ERR[_fetchSingleProperty]: No chart data for ${ticker}.${property} - URL: ${url}`;
      }

      const meta = data.chart.result[0].meta;

      // Cache static data indefinitely (30 days TTL) - only if we don't have it already
      if (!staticData) {
        const staticInfo = {};
        this.staticProperties.forEach(prop => {
          if (meta[prop] !== undefined) {
            staticInfo[prop] = meta[prop];
          }
        });
        this.cache.put(staticCacheKey, JSON.stringify(staticInfo), 30 * 24 * 60 * 60); // 30 days
        console.log(`Cached static data for ${ticker}`);
        staticData = staticInfo;
      }

      // Cache dynamic data for 2 minutes
      const dynamicInfo = {};
      this.dynamicProperties.forEach(prop => {
        if (meta[prop] !== undefined) {
          dynamicInfo[prop] = meta[prop];
        }
      });

      // Handle special cases
      if (!dynamicInfo.previousClose && meta.chartPreviousClose) {
        dynamicInfo.previousClose = meta.chartPreviousClose;
      }

      this.cache.put(dynamicCacheKey, JSON.stringify(dynamicInfo), 120); // 2 minutes
      console.log(`Cached dynamic data for ${ticker}`);

      // Get the requested value
      let value = null;
      if (property === "changePct") {
        const price = meta.regularMarketPrice;
        const prev = meta.previousClose || meta.chartPreviousClose;
        if (prev && price) value = ((price - prev) / prev) * 100;
      } else {
        // Try static data first, then dynamic, then meta directly
        value = staticData[property] ?? dynamicInfo[property] ?? meta[property] ?? null;
      }

      value = roundValue(value);
      console.log(`API fetch result for ${ticker}.${property}: ${value}`);
      return value;

    } catch (err) {
      console.error(`Error fetching ${ticker}.${property}:`, err);
      return `ERR[_fetchSingleProperty]: Exception fetching ${ticker}.${property} - ${err.toString()} - URL: ${url}`;
    }
  }

  /**
   * Private method to fetch today's current market price
   */
  _fetchTodaysPrice(ticker) {
    // Use the dynamic cache from _fetchSingleProperty for consistency
    const dynamicCacheKey = `dynamic_${ticker}`;
    // Always fetch from dynamic cache since regularMarketPrice is always a dynamic property
    let dynamicData = this.cache.get(dynamicCacheKey);

    if (dynamicData) {
      dynamicData = JSON.parse(dynamicData);
      // if we have it cached, return immediately
      if (dynamicData.regularMarketPrice !== undefined) {
        console.log(`Dynamic cache hit for today's price ${ticker}: ${dynamicData.regularMarketPrice}`);
        return roundValue(dynamicData.regularMarketPrice);
      }
    }

    // If not in cache, fetch via the enhanced method
    console.log(`Fetching today's price for ${ticker} via _fetchSingleProperty`);
    return this._fetchSingleProperty(ticker, 'regularMarketPrice');
  }

  /**
   * Private method to fetch and permanently cache a single historical day's closing price
   */
  _fetchSingleHistoricalDay(ticker, date) {
    const historicalCacheKey = `hist_day_${ticker}_${date.getTime()}`;
    const cachedPrice = this.cache.get(historicalCacheKey);

    if (cachedPrice) {
      console.log(`Permanent historical cache hit for ${ticker} on ${date.toDateString()}: ${cachedPrice}`);
      return JSON.parse(cachedPrice);
    }

    // Handle weekends by looking back to previous trading day
    if (isWeekend(date)) {
      const prevDay = new Date(date);
      const daysToSubtract = isSunday(date) ? 2 : 1;
      prevDay.setDate(date.getDate() - daysToSubtract);
      console.log(`${date.toDateString()} is a weekend, trying ${prevDay.toDateString()} instead.`);
      return this._fetchSingleHistoricalDay(ticker, prevDay);
    }

    // Fetch from API
    const endDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    const startTs = Math.floor(date.getTime() / 1000);
    const endTs = Math.floor(endDate.getTime() / 1000);

    let url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${startTs}&period2=${endTs}&interval=1d`;
    url += "&cacheBust=" + new Date().getTime();
    console.log(`Fetching single historical day ${ticker} for ${date.toDateString()}: ${url}`);

    try {
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const data = JSON.parse(res.getContentText());

      if (!data.chart?.result?.[0]?.timestamp) {
        const dateStr = date.toDateString();
        console.error(`ERR[_fetchSingleHistoricalDay]: No timestamp data for ${ticker} on ${dateStr}`);
        return `ERR[_fetchSingleHistoricalDay]: No timestamp data for ${ticker} on ${dateStr} - URL: ${url}`;
      }

      const timestamps = data.chart.result[0].timestamp;
      const closes = data.chart.result[0].indicators.quote[0].close;

      if (!closes || closes.length === 0 || closes[0] == null) {
        const dateStr = date.toDateString();
        console.error(`ERR[_fetchSingleHistoricalDay]: No close price available for ${ticker} on ${dateStr}`);
        return `ERR[_fetchSingleHistoricalDay]: No close price for ${ticker} on ${dateStr} - URL: ${url}`;
      }

      const closePrice = roundValue(closes[0]);

      // Cache permanently (1 year TTL) since historical data never changes
      this.cache.put(historicalCacheKey, JSON.stringify(closePrice), 365 * 24 * 60 * 60);
      console.log(`Permanently cached historical price for ${ticker} on ${date.toDateString()}: ${closePrice}`);

      return closePrice;

    } catch (err) {
      const dateStr = date.toDateString();
      console.error(`ERR[_fetchSingleHistoricalDay]: Exception for ${ticker} on ${dateStr}:`, err);
      return `ERR[_fetchSingleHistoricalDay]: Exception for ${ticker} on ${dateStr} - ${err.toString()} - URL: ${url}`;
    }
  }

  /**
   * Private method to fetch historical close prices with intelligent caching
   * OPTIMIZED with smart intervals and flexible range matching for maximum cache efficiency
   */
  _fetchHistoricalRange(ticker, start, end, isSingleDayRequest) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // For single day requests, use the dedicated single day function
    if (isSingleDayRequest) {
      return this._fetchSingleHistoricalDay(ticker, start);
    }

    const rangeContainsToday = end.getTime() >= today.getTime();
    const startTs = Math.floor(start.getTime() / 1000);
    const endTs = Math.floor(end.getTime() / 1000);

    // Calculate interval using valid Yahoo Finance intervals
    // Valid intervals: [1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 4h, 1d, 5d, 1wk, 1mo, 3mo]
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    const interval = totalDays > 31 ? "1wk" : "1d";

    console.log(`Range analysis for ${ticker}: ${totalDays} days → ${interval} interval`);

    // STEP 1: Smart cache lookup with flexible range matching
    // For large ranges (1wk), check flexible cache even if range contains today
    // For small ranges (1d), only check if range doesn't contain today (precision matters)
    const shouldCheckFlexibleCache = interval === "1wk" || !rangeContainsToday;

    if (shouldCheckFlexibleCache) {
      const cachedData = this._findCachedRangeData(ticker, start, end, interval);
      if (cachedData) {
        console.log(`Flexible range cache hit for ${ticker} ${start.toDateString()} to ${end.toDateString()} (${interval})`);
        return cachedData;
      }
    } else {
      console.log(`Skipping flexible cache for ${ticker} - small range containing today requires fresh data`);
    }

    // STEP 2: For small ranges (1d interval), check individual day cache for precision
    if (interval === "1d") {
      console.log(`Small range - checking individual day cache for ${ticker}`);

      // OPTIMIZATION: Pre-calculate all trading days and batch cache operations
      const tradingDays = this._getTradingDaysInRange(start, end, today);
      console.log(`Checking cache for ${tradingDays.length} trading days for ${ticker}`);

      if (tradingDays.length > 0) {
        // OPTIMIZATION: Batch cache lookup instead of individual calls
        const cacheKeys = tradingDays.map(day => `hist_day_${ticker}_${day.getTime()}`);
        const cachedData = this.cache.getAll(cacheKeys);

        let allCached = true;
        const dayResults = [];

        for (let i = 0; i < tradingDays.length; i++) {
          const day = tradingDays[i];
          const dayKey = cacheKeys[i];
          const cachedDay = cachedData[dayKey];

          if (cachedDay) {
            const price = JSON.parse(cachedDay);
            // Skip error messages (they start with "ERR[")
            if (typeof price === 'string' && price.startsWith("ERR[")) {
              // Skip error messages
            } else {
              // Include valid data (numbers, valid strings, etc.)
              dayResults.push([new Date(day), price]);
            }
          } else if (day.getTime() < today.getTime()) {
            // Missing historical data - need API fetch
            allCached = false;
            break;
          } else {
            // Today or future dates need fresh fetch
            allCached = false;
            break;
          }
        }

        // If we have all historical days cached and no today data needed, return cached result
        if (allCached && dayResults.length > 0) {
          const output = [["Date", "Close"]];
          dayResults.forEach(dayResult => output.push(dayResult));
          console.log(`Built range from batch cached days for ${ticker}: ${dayResults.length} days`);

          // Cache the complete range permanently if it's all historical
          const cacheKey = `hist_range_${ticker}_${start.getTime()}_${end.getTime()}`;
          if (!rangeContainsToday) {
            this.cache.put(cacheKey, JSON.stringify(output), 365 * 24 * 60 * 60); // 1 year
          }
          return output;
        }
      }
    } else {
      console.log(`Large range for ${ticker} - using ${interval} interval for efficiency`);
    }

    // STEP 3: Fetch from API using smart interval
    let url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${startTs}&period2=${endTs}&interval=${interval}`;
    url += "&cacheBust=" + new Date().getTime();
    console.log(`API fetch for ${ticker}: ${start.toDateString()} to ${end.toDateString()} using ${interval} (${totalDays} days)`);

    try {
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const data = JSON.parse(res.getContentText());

      if (!data.chart?.result?.[0]?.timestamp) {
        const startStr = start.toDateString();
        const endStr = end.toDateString();
        console.error(`ERR[_fetchHistoricalRange]: No timestamp data for ${ticker} from ${startStr} to ${endStr} (interval: ${interval})`);
        return `ERR[_fetchHistoricalRange]: No timestamp data for ${ticker} from ${startStr} to ${endStr} - URL: ${url}`;
      }

      const timestamps = data.chart.result[0].timestamp;
      const closes = data.chart.result[0].indicators.quote[0].close;
      const output = [["Date", "Close"]];

      // Build output from API data
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] != null) {
          const dateObj = new Date(timestamps[i] * 1000);
          const price = roundValue(closes[i]);
          output.push([dateObj, price]);
        }
      }

      // STEP 4: Cache individual days ONLY for 1d intervals (maintains granular cache)
      if (interval === "1d") {
        console.log(`Caching individual days for ${ticker} (1d interval)`);

        for (let i = 0; i < timestamps.length; i++) {
          if (closes[i] != null) {
            const dateObj = new Date(timestamps[i] * 1000);
            const price = roundValue(closes[i]);

            // Cache individual historical days permanently (not today)
            dateObj.setHours(0, 0, 0, 0);
            if (dateObj.getTime() < today.getTime()) {
              const dayKey = `hist_day_${ticker}_${dateObj.getTime()}`;
              this.cache.put(dayKey, JSON.stringify(price), 365 * 24 * 60 * 60); // 1 year
            }
          }
        }
      } else {
        console.log(`Skipping individual day caching for ${ticker} (${interval} interval - range caching only)`);
      }

      // STEP 5: Cache the range data (no interval in key - it's deterministically calculated)
      if (output.length > 1) {
        const cacheKey = `hist_range_${ticker}_${start.getTime()}_${end.getTime()}`;
        const cacheTtl = rangeContainsToday ? (60 * 60 * 2) : (365 * 24 * 60 * 60); // 2 hours vs 1 year
        this.cache.put(cacheKey, JSON.stringify(output), cacheTtl);
        console.log(`Cached range for ${ticker}: ${output.length - 1} points (${interval}), TTL: ${rangeContainsToday ? '2h' : '1yr'}`);
      }

      return output;

    } catch (err) {
      const startStr = start.toDateString();
      const endStr = end.toDateString();
      console.error(`ERR[_fetchHistoricalRange]: Exception for ${ticker} from ${startStr} to ${endStr}:`, err);
      return `ERR[_fetchHistoricalRange]: Exception for ${ticker} from ${startStr} to ${endStr} - ${err.toString()} - URL: ${url}`;
    }
  }

  /**
   * OPTIMIZATION HELPER: Pre-calculate all trading days in a range
   * This avoids repetitive weekend checks and date calculations
   */
  _getTradingDaysInRange(start, end, today) {
    const tradingDays = [];
    const currentDate = new Date(start);

    while (currentDate.getTime() < end.getTime()) {
      if (!isWeekend(currentDate)) {
        tradingDays.push(new Date(currentDate));
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return tradingDays;
  }

  /**
   * OPTIMIZATION HELPER: Find cached range data with flexible matching for large intervals
   * For large ranges, we don't need exact date accuracy, so we check nearby date ranges
   */
  _findCachedRangeData(ticker, start, end, interval) {
    // For small ranges (1d interval), only check exact match
    if (interval === "1d") {
      const exactKey = `hist_range_${ticker}_${start.getTime()}_${end.getTime()}`;
      const cached = this.cache.get(exactKey);
      if (cached) {
        console.log(`Exact range cache hit for ${ticker}`);
        return JSON.parse(cached);
      }
      return null;
    }

    // For large ranges (1wk interval), check flexible nearby ranges
    // We check -1, -2, -3, -4, -5, -6 days shifts since date accuracy isn't critical for large ranges
    const maxShiftDays = 6;
    const msPerDay = 24 * 60 * 60 * 1000;

    console.log(`Checking flexible range cache for ${ticker} (-${maxShiftDays} days)`);

    for (let shiftDays = 0; shiftDays <= maxShiftDays; shiftDays++) {
      const shifts = shiftDays === 0 ? [0] : [-shiftDays, 0]; // Check only in past

      for (const shift of shifts) {
        const shiftedStart = new Date(start.getTime() + (shift * msPerDay));
        const shiftedEnd = new Date(end.getTime() + (shift * msPerDay));
        const shiftedKey = `hist_range_${ticker}_${shiftedStart.getTime()}_${shiftedEnd.getTime()}`;

        const cached = this.cache.get(shiftedKey);
        if (cached) {
          console.log(`Flexible range cache hit for ${ticker} (shifted ${shift} days)`);
          return JSON.parse(cached);
        }
      }
    }

    console.log(`No flexible cache match found for ${ticker}`);
    return null;
  }
}

// Global instance - single cache instance shared across all calls
const yahooAPI = new YahooFinanceAPI();

/**
 * Example: https://query1.finance.yahoo.com/v8/finance/chart/IWDA.AS
 */
function yahooF(ticker, property) {
  return yahooAPI.getProperty(ticker, property);
}






// Helper: convert Sheets date serial or JS Date
function sheetDateToJS(dateValue) {
  if (!dateValue) return null;
  if (dateValue instanceof Date) return dateValue;
  // Sheets counts days from 1899-12-30, JS from 1970-01-01
  return new Date((dateValue - 25569) * 24 * 60 * 60 * 1000);
}

function isWeekend(date) {
  if (!(date instanceof Date)) return false; // handle invalid input
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}
function isSaturday(date) {
  if (!(date instanceof Date)) return false; // handle invalid input
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  return day === 6;
}
function isSunday(date) {
  if (!(date instanceof Date)) return false; // handle invalid input
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  return day === 0;
}


function yahooHistory(ticker, startDateParam, endDateParam) {
  return yahooAPI.getHistory(ticker, startDateParam, endDateParam);
}



// All Yahoo Finance functionality is now handled by the YahooFinanceAPI class


