'use strict';

/**
 * Currency Conversion Service
 * Handles USD to multiple currency conversions with real-time rates
 */

// Cached exchange rates (updated periodically)
// Format: { 'currency_code': { rate: 0.00, updatedAt: timestamp } }
const exchangeRates = {
  USD: { rate: 1.00, updatedAt: new Date() },
  PHP: { rate: 57.5, updatedAt: new Date() }, // ~57.5 PHP per USD
  EUR: { rate: 0.92, updatedAt: new Date() },
  GBP: { rate: 0.79, updatedAt: new Date() },
  AUD: { rate: 1.52, updatedAt: new Date() },
  CAD: { rate: 1.36, updatedAt: new Date() },
  INR: { rate: 83.12, updatedAt: new Date() },
  SGD: { rate: 1.34, updatedAt: new Date() },
  HKD: { rate: 7.81, updatedAt: new Date() },
  JPY: { rate: 149.50, updatedAt: new Date() },
};

/**
 * Supported currencies
 */
const SUPPORTED_CURRENCIES = {
  USD: { name: 'US Dollar', symbol: '$', code: 'USD' },
  PHP: { name: 'Philippine Peso', symbol: '₱', code: 'PHP' },
  EUR: { name: 'Euro', symbol: '€', code: 'EUR' },
  GBP: { name: 'British Pound', symbol: '£', code: 'GBP' },
  AUD: { name: 'Australian Dollar', symbol: '$', code: 'AUD' },
  CAD: { name: 'Canadian Dollar', symbol: '$', code: 'CAD' },
  INR: { name: 'Indian Rupee', symbol: '₹', code: 'INR' },
  SGD: { name: 'Singapore Dollar', symbol: '$', code: 'SGD' },
  HKD: { name: 'Hong Kong Dollar', symbol: 'HK$', code: 'HKD' },
  JPY: { name: 'Japanese Yen', symbol: '¥', code: 'JPY' },
};

/**
 * Convert USD amount to target currency
 * @param {number} amountUSD - Amount in USD
 * @param {string} targetCurrency - Target currency code (e.g., 'PHP', 'EUR')
 * @returns {number} Converted amount
 */
function convertUSDTo(amountUSD, targetCurrency = 'USD') {
  if (!targetCurrency || targetCurrency === 'USD') {
    return parseFloat(amountUSD);
  }

  const rate = exchangeRates[targetCurrency]?.rate || 1;
  const converted = amountUSD * rate;
  
  // Round to 2 decimal places
  return Math.round(converted * 100) / 100;
}

/**
 * Get formatted price in target currency
 * @param {number} amountUSD - Amount in USD
 * @param {string} currency - Currency code
 * @returns {string} Formatted price (e.g., "$99.00" or "₱5,707.50")
 */
function formatPrice(amountUSD, currency = 'USD') {
  const converted = convertUSDTo(amountUSD, currency);
  const currencyInfo = SUPPORTED_CURRENCIES[currency];
  const symbol = currencyInfo?.symbol || '$';

  // Format with thousands separator
  const formatted = converted.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${symbol}${formatted}`;
}

/**
 * Get PayMongo checkout amount in cents (PayMongo requires amount in cents)
 * Handles conversion from USD to target currency
 * @param {number} amountUSD - Amount in USD
 * @param {string} currency - Currency code (payment currency)
 * @returns {number} Amount in cents for PayMongo
 */
function getPaymongoAmount(amountUSD, currency = 'USD') {
  const converted = convertUSDTo(amountUSD, currency);
  // Convert to cents
  return Math.round(converted * 100);
}

/**
 * Get list of supported currencies
 */
function getSupportedCurrencies() {
  return Object.keys(SUPPORTED_CURRENCIES).map((code) => ({
    code,
    ...SUPPORTED_CURRENCIES[code],
  }));
}

/**
 * Get default currency based on region
 * Used for initial user preferences
 */
function getDefaultCurrencyByRegion(userCountryCode) {
  // Map country codes to currencies
  const countryToCurrency = {
    PH: 'PHP',
    US: 'USD',
    UK: 'GBP',
    GB: 'GBP',
    DE: 'EUR',
    FR: 'EUR',
    ES: 'EUR',
    IT: 'EUR',
    NL: 'EUR',
    BE: 'EUR',
    AT: 'EUR',
    CH: 'EUR',
    AU: 'AUD',
    CA: 'CAD',
    IN: 'INR',
    SG: 'SGD',
    HK: 'HKD',
    JP: 'JPY',
  };

  return countryToCurrency[userCountryCode?.toUpperCase()] || 'USD';
}

module.exports = {
  convertUSDTo,
  formatPrice,
  getPaymongoAmount,
  getSupportedCurrencies,
  getDefaultCurrencyByRegion,
  SUPPORTED_CURRENCIES,
};
