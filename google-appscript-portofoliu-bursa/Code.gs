
function isNullOrEmpty(str) {
  return !str || str.trim() === "";
}

function roundValue(value) {
  if (typeof value !== "number") {
    return value; // return original if not a number
  }
  return value != null ? Math.round(value * 100) / 100 : null;
}

/**
 * Example: https://query1.finance.yahoo.com/v8/finance/chart/IWDA.AS
 */
function yahooF(ticker, property) {
  // ticker = "IWDA.AS";
  // property = "regularMarketPrice";

  if (!ticker || !property) {
    console.log(`invalid ticker${ticker} or property ${property}`);
    return null;
  }
  // Handle range input (ARRAYFORMULA)
  if (Array.isArray(ticker)) {
    const results = [];
    for (let i = 0; i < ticker.length; i++) {
      const t = ticker[i][0];
      if (!t) {
        results.push([""]);
        continue;
      }
      const val = yahooF_single_cached(t, property);
      results.push([val]);
    }
    return results;
  }

  // Single ticker case
  return yahooF_single_cached(ticker, property);
}

function yahooF_single_cached(ticker, property) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `yahooF_${ticker}_${property}`;
  // cache.remove(cacheKey);
  let cached = cache.get(cacheKey);
  cached = cached ? Number(cached) : null;

  // ? Return cached value if available
  if (cached) {
    console.log(`return cached: ${cached}. type: ${typeof(cached)}`);
    return cached;
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());

    if (!data.chart?.result?.[0]) return null;

    const meta = data.chart.result[0].meta;
    let value = null;

    if (property === "changePct") {
      const price = meta.regularMarketPrice;
      const prev = meta.previousClose;
      if (prev) value = ((price - prev) / prev) * 100;
    } else {
      value = meta[property] ?? null;
    }
    value = roundValue(value);
    cache.put(cacheKey, value, 60); // 1 minutes

    console.log(`return: ${value}. type: ${typeof(value)}`);
    return value;
  } catch (err) {
    console.error(err);
    return null;
  }
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
  // 1. --- SETUP & VALIDATION ---
  if (isNullOrEmpty(ticker)) {
    return "Ticker required";
  }

  // Instantiate the cache. Remove clearAll() for production use.
  const cache = new SafeCache(CacheService.getScriptCache(), {
    version: "9", // Increment version to invalidate old caches
    perUser: true,
    enable: true,
  });
  // cache.clearAll(); // Only use for debugging, then comment out

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let start = startDateParam ? sheetDateToJS(startDateParam) : null;
  let end = endDateParam ? sheetDateToJS(endDateParam) : null;

  // 2. --- DETERMINE FETCH TYPE (TODAY, SINGLE DAY, OR RANGE) ---

  // Case 1: Fetching for today's current price
  if (start && !end && start.getTime() === today.getTime()) {
    return fetchTodaysPrice(ticker, cache);
  }

  // Case 2: Fetching for a historical range or single day
  // Default to last 30 days if no start date is provided
  if (!start) {
    start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    end = today;
  }
  // If only start date is provided, set end date to be one day after for the query
  if (start && !end) {
    end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }

  return fetchHistoricalData(ticker, start, end, cache, !endDateParam && !!startDateParam);
}

/**
 * Fetches the current market price for a given ticker.
 */
function fetchTodaysPrice(ticker, cache) {
  const cacheKey = `price_${ticker}_today`;
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`Cache hit (today): ${cacheKey}`);
    return JSON.parse(cached);
  }

  let url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`;
  url += "&cacheBust=" + new Date().getTime(); // <-- FIX: Cache Busting
  console.log("Fetching today's price from URL: " + url);

  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());
    const meta = data.chart.result[0].meta;
    const currentPrice = roundValue(meta.regularMarketPrice);

    cache.put(cacheKey, JSON.stringify(currentPrice), 60); // cache 1 minute
    console.log(`Fetched and cached today's price: ${currentPrice}`);
    return currentPrice;
  } catch (err) {
    console.error("Error fetching today's price:", err);
    return "Error fetching price";
  }
}

/**
 * Fetches historical close prices for a ticker between two dates.
 */
function fetchHistoricalData(ticker, start, end, cache, isSingleDayRequest) {
  const startTs = Math.floor(start.getTime() / 1000);
  const endTs = Math.floor(end.getTime() / 1000);

  const cacheKey = `hist_${ticker}_${start.getTime()}_${end.getTime()}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`Cache hit (historical): ${cacheKey}`);
    return JSON.parse(cached);
  }

  let url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${startTs}&period2=${endTs}&interval=1d`;
  url += "&cacheBust=" + new Date().getTime(); // <-- FIX: Cache Busting
  console.log("Fetching historical data from URL: " + url);

  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());

    if (!data.chart?.result?.[0]?.timestamp) {
      // Handle weekends for single day requests by looking back
      if (isSingleDayRequest && isWeekend(start)) {
        const prevDay = new Date(start);
        const daysToSubtract = isSunday(start) ? 2 : 1;
        prevDay.setDate(start.getDate() - daysToSubtract);
        console.log(`${start.toDateString()} is a weekend, trying ${prevDay.toDateString()} instead.`);
        // Call itself recursively for the previous non-weekend day
        return fetchHistoricalData(ticker, prevDay, start, cache, true);
      }
      return "No data";
    }

    const timestamps = data.chart.result[0].timestamp;
    const closes = data.chart.result[0].indicators.quote[0].close;

    // If it was a single day request, return just the value
    if (isSingleDayRequest) {
      const output = roundValue(closes[0]);
      cache.put(cacheKey, JSON.stringify(output), 60 * 60 * 6); // cache 6 hours
      return output;
    }

    // Otherwise, build the 2D array for a range
    const output = [["Date", "Close"]];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        output.push([new Date(timestamps[i] * 1000), roundValue(closes[i])]);
      }
    }
    
    if (output.length > 1) {
      cache.put(cacheKey, JSON.stringify(output), 60 * 60 * 6); // cache 6 hours
    }
    return output;

  } catch (err) {
    console.error("Error fetching historical data:", err);
    return "Error fetching data";
  }
}


