/**
 * @module currency
 * @description Manages currency definitions, formatting, and keyword detection
 * for the expense tracking app. Supports INR (default), USD, EUR, and GBP.
 */

/**
 * @typedef {Object} CurrencyDefinition
 * @property {string} code     - ISO 4217 currency code
 * @property {string} symbol   - Display symbol (e.g. ₹, $)
 * @property {string} name     - Human-readable currency name
 * @property {string} locale   - BCP 47 locale tag for number formatting
 * @property {string[]} keywords - Lowercase keywords that trigger detection
 */

/**
 * All supported currency definitions keyed by ISO code.
 * @type {Record<string, CurrencyDefinition>}
 */
export const CURRENCIES = Object.freeze({
  INR: {
    code: 'INR',
    symbol: '₹',
    name: 'Indian Rupee',
    locale: 'en-IN',
    keywords: ['rupees', 'rupee', 'rs', 'inr', '₹'],
  },
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    locale: 'en-US',
    keywords: ['dollars', 'dollar', 'usd', '$'],
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    locale: 'de-DE',
    keywords: ['euros', 'euro', 'eur', '€'],
  },
  GBP: {
    code: 'GBP',
    symbol: '£',
    name: 'British Pound',
    locale: 'en-GB',
    keywords: ['pounds', 'pound', 'gbp', '£'],
  },
});

/**
 * Pre-built lookup map: keyword → currency code.
 * Built once at module load for O(1) detection.
 * @type {Map<string, string>}
 */
const keywordMap = new Map();
for (const [code, def] of Object.entries(CURRENCIES)) {
  for (const kw of def.keywords) {
    keywordMap.set(kw, code);
  }
}

/**
 * Detects a currency from free-form text by scanning for known keywords.
 * Returns the first matching currency code, or `null` if none found.
 *
 * Detection order: checks each word of the input against the keyword map,
 * and also checks for symbol characters (₹, $, €, £) anywhere in the text.
 *
 * @param {string} text - Natural language input to scan
 * @returns {string|null} ISO currency code (e.g. 'INR') or null
 *
 * @example
 * detectCurrency('Spent 50 dollars on lunch') // → 'USD'
 * detectCurrency('₹300 chai')                 // → 'INR'
 * detectCurrency('bought groceries')           // → null
 */
export function detectCurrency(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const lower = text.toLowerCase();

  // Check for currency symbols anywhere in the string.
  // Order matters: check less-ambiguous symbols first.
  const symbolMap = [
    ['₹', 'INR'],
    ['€', 'EUR'],
    ['£', 'GBP'],
    // '$' is checked last because it's more common as a generic character
    ['$', 'USD'],
  ];

  for (const [symbol, code] of symbolMap) {
    if (lower.includes(symbol)) {
      return code;
    }
  }

  // Tokenize and check each word against the keyword map
  const words = lower.split(/\s+/);
  for (const word of words) {
    // Strip punctuation from edges (e.g. "rupees," → "rupees")
    const cleaned = word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
    if (keywordMap.has(cleaned)) {
      return keywordMap.get(cleaned);
    }
  }

  return null;
}

/**
 * Formats a numeric amount with the appropriate currency symbol.
 * Uses locale-aware number formatting (e.g. Indian grouping for INR).
 *
 * @param {number} amount       - The amount to format
 * @param {string} currencyCode - ISO currency code (defaults to 'INR')
 * @returns {string} Formatted string like '₹1,500' or '$50.75'
 *
 * @example
 * formatAmount(1500, 'INR')   // → '₹1,500'
 * formatAmount(50.75, 'USD')  // → '$50.75'
 * formatAmount(0, 'EUR')      // → '€0'
 */
export function formatAmount(amount, currencyCode = 'INR') {
  const code = (currencyCode || 'INR').toUpperCase();
  const currency = CURRENCIES[code];

  if (!currency) {
    // Fallback: just prefix the code
    return `${code} ${Number(amount).toLocaleString()}`;
  }

  const num = Number(amount);

  if (!Number.isFinite(num)) {
    return `${currency.symbol}0`;
  }

  // Format with locale-aware grouping; strip trailing ".00" for whole numbers
  const hasDecimals = num % 1 !== 0;
  const formatted = num.toLocaleString(currency.locale, {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });

  return `${currency.symbol}${formatted}`;
}

/**
 * Returns the display symbol for a given currency code.
 *
 * @param {string} code - ISO currency code (e.g. 'INR', 'USD')
 * @returns {string} Currency symbol, or the code itself if unknown
 *
 * @example
 * getCurrencySymbol('INR') // → '₹'
 * getCurrencySymbol('JPY') // → 'JPY'
 */
export function getCurrencySymbol(code) {
  if (!code || typeof code !== 'string') {
    return '₹'; // Default to INR
  }

  const upper = code.toUpperCase();
  return CURRENCIES[upper]?.symbol ?? upper;
}

/**
 * Formats per-currency totals without ever adding them together. The
 * preferred currency comes first, then the rest by code.
 *
 * @param {Record<string, number>} totals - e.g. { INR: 1200, USD: 50 }
 * @param {string} preferred             - Currency to lead with
 * @returns {string} e.g. '₹1,200 + $50', or '₹0' when there's nothing
 *
 * @example
 * formatTotals({ INR: 1200, USD: 50 }, 'INR') // → '₹1,200 + $50'
 * formatTotals({}, 'INR')                     // → '₹0'
 */
export function formatTotals(totals, preferred = 'INR') {
  const codes = Object.keys(totals).filter((code) => totals[code] !== 0);
  if (codes.length === 0) return formatAmount(0, preferred);
  codes.sort((a, b) => (a === preferred ? -1 : b === preferred ? 1 : a.localeCompare(b)));
  return codes.map((code) => formatAmount(totals[code], code)).join(' + ');
}

/**
 * Compact form for chart axes: '₹12K', '$1.2M'. Uses international
 * K/M suffixes rather than lakh/crore so axis ticks stay short.
 *
 * @param {number} amount
 * @param {string} currencyCode
 * @returns {string} e.g. '₹12K', '$1.2M'
 */
export function formatCompact(amount, currencyCode = 'INR') {
  const currency = CURRENCIES[(currencyCode || 'INR').toUpperCase()];
  const num = Number(amount);
  if (!Number.isFinite(num)) return `${currency?.symbol ?? ''}0`;
  const formatted = num.toLocaleString('en', { notation: 'compact', maximumFractionDigits: 1 });
  return `${currency?.symbol ?? `${currencyCode} `}${formatted}`;
}
