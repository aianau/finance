
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

class DummyCache {
  constructor() {
  }
  put(key, content, timeMs = null) {
  }
  get(key) {
    return 0;
  }
}


function yahooHistory(ticker, startDateParam, endDateParam) {
  const USE_CACHE = true;
  const userKey = 'result_' + Session.getTemporaryActiveUserKey(); // unique per user
  const globalKey = userKey
                    // + new Date().getTime();
  console.log(globalKey);


  // console.log("test:");
  // // ticker = "IWDA.AS";
  // ticker = "TLV.RO";
  // let todayTest = new Date();
  // todayTest.setHours(0,0,0,0);
  // startDateParam = new Date();
  // startDateParam.setHours(0,0,0,0);
  
  // test: today test
  // startDateParam.setDate(todayTest.getDate());
  
  // test: another day in the past 
  // startDateParam.setDate(todayTest.getDate()-10);

  // test: range last 10 days
  // startDateParam.setDate(todayTest.getDate()-5);
  // endDateParam = new Date();
  // endDateParam.setHours(0,0,0,0);
  // endDateParam.setDate(todayTest.getDate());
  
  // let cache = CacheService.getScriptCache();
  let cache = CacheService.getUserCache();
  if (USE_CACHE == false)
    cache = new DummyCache();

  console.log(ticker, "-----", startDateParam, "-----", endDateParam);

  if (!ticker) {
    console.log("ticker required");
    return null;
    // return [["Ticker required"]];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0); // normalize to midnight

  let start = startDateParam ? sheetDateToJS(startDateParam) : new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days
  let end;

  if (!endDateParam) {
    if (startDateParam) {
      // Only startDate provided ? single-day fetch
      const isToday = start.getTime() === today.getTime();

      if (isToday) {
        const cacheKey = `price_${ticker}_today`;
        // cache.remove(cacheKey);
        const cached = cache.get(cacheKey);
        if (cached) {
          const returnVal = JSON.parse(cached);
          console.log(`Cache hit: ${cacheKey}, value: ${returnVal}, type: ${typeof(returnVal)}`);
          return returnVal;
        }
        // Fetch current market price
        const urlPrice = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`;
        console.log(urlPrice);
        try {
          const resPrice = UrlFetchApp.fetch(urlPrice);
          const dataPrice = JSON.parse(resPrice.getContentText());
          const meta = dataPrice.chart.result[0].meta;
          const currentPrice = roundValue(meta.regularMarketPrice);
          cache.put(cacheKey, JSON.stringify(currentPrice), 60); // cache 1 minute
          console.log(`fetched current price: ${currentPrice}, type: ${typeof(currentPrice)}`);

          return currentPrice;
        } catch (err) {
          return [["Unable to fetch current price: " + err.toString()]];
        }
      } else {
        // Historical day ? fetch that day
        end = new Date(start.getTime() + 24 * 60 * 60 * 1000); // one day after
      }
    } else {
      // No dates ? last 30 days
      end = today;
    }
  } else {
    // Both dates provided ? normal behavior
    end = sheetDateToJS(endDateParam);
  }

  // If we reach here, fetch historical data
  const startTs = Math.floor(start.getTime() / 1000);
  const endTs = Math.floor(end.getTime() / 1000);

  
  // !!!!!!!!!!!!!!!!   TODO some other time. nu inteleg de ce imi intra pe cached desi eu nu fac cache.put si dau cache.remove la cacheKey. 
  const cacheKey = `${globalKey}_hist_${ticker}_${start.getTime()}_${end.getTime()}`;
  // cache.remove(cacheKey); 
  const cached = cache.get(cacheKey);
  if (cached) { 
    const returnVal = JSON.parse(cached);
    console.log(`Cache hit: ${cacheKey}, type: ${typeof(returnVal)}`);
    console.log(returnVal);
    return returnVal;
  }

  let url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${startTs}&period2=${endTs}&interval=1d`;
  console.log(url);
  try {
    let res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    let data = JSON.parse(res.getContentText());

    if (!data.chart || !data.chart.result || !data.chart.result[0]) {
      return [["No data"]];
    }

    let result = data.chart.result[0];
    let timestamps = result.timestamp;
    let closes = result.indicators.quote[0].close;

    // Single day historical ? return value
    if (!endDateParam && startDateParam && start.getTime() !== today.getTime()) {
      if (!closes && isWeekend(start)) {
        console.log(`day is weekend`);
        const one_day = 24 * 60 * 60;
        let diff = one_day;
        if (isSunday(start))
          diff = one_day * 2;
        url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${startTs-diff}&period2=${endTs-diff}&interval=1d`;
        console.log(url);
        res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        data = JSON.parse(res.getContentText());

        if (!data.chart || !data.chart.result || !data.chart.result[0]) {
          return [["No data"]];
        }

        result = data.chart.result[0];
        timestamps = result.timestamp;
        closes = result.indicators.quote[0].close;
      }
      
      const output = roundValue(closes[0]);
      cache.put(cacheKey, JSON.stringify(output), 60 * 60 * 6); // cache 6 hours
      console.log(`fetched current price: ${output}, type: ${typeof(output)}`);
      return output;
    }

    // Range ? return 2D array
    const output = [["Date", "Close"]];
    for (let i = 0; i < timestamps.length; i++) {
      const date = new Date(timestamps[i] * 1000);
      const price = closes[i];
      if (price != null) output.push([date, price]);
    }

    cache.put(cacheKey, JSON.stringify(output), 60 * 60 * 6); // cache 6 hours
    console.log(`fetched current prices, type: ${typeof(output)}`);
    console.log(output);
    return output;

  } catch (err) {
    console.error(err.toString());
    return [[err.toString()]];
  }
}


