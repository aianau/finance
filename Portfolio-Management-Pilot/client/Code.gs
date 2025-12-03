
/**
 * Get a property for a ticker symbol
 * @param {string|Array} ticker - Ticker symbol (e.g., "IWDA.AS")
 * @param {string} targetCurrency - Target currency (e.g., from Summary!$U$5)
 * @param {string} property - Property name (e.g., "regularMarketPrice", "longName")
 * @return {*} Property value in target currency
 * @customfunction
 * 
 * Example: =yahooF("IWDA.AS", Summary!$U$5, "regularMarketPrice")
 */
function yahooF(ticker, targetCurrency, property) {
  return YahooFinanceCore.yahooF(ticker, targetCurrency, property);
}


/**
 * Get historical price for a ticker symbol
 * @param {string|Array} ticker - Ticker symbol (e.g., "IWDA.AS")
 * @param {string} targetCurrency - Target currency (e.g., from Summary!$U$5)
 * @param {Date} startDateParam - Start date (optional)
 * @param {Date} endDateParam - End date (optional)
 * @return {*} Historical price in target currency
 * @customfunction
 * 
 * Example: =yahooHistory("IWDA.AS", Summary!$U$5, TODAY())
 */
function yahooHistory(ticker, targetCurrency, startDateParam, endDateParam) {
  return YahooFinanceCore.yahooHistory(ticker, targetCurrency, startDateParam, endDateParam);
}
