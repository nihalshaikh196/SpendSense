/**
 * @module parser
 * @description Natural language parser for expense input. Takes a free-form
 * sentence and extracts amount, currency, date, item description, people,
 * and category into a structured expense object.
 */

import { detectCurrency, CURRENCIES } from './currency.js';
import { detectCategory } from './categories.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Words to exclude from people extraction */
const EXCLUDED_PEOPLE = new Set([
  'everyone', 'all', 'people', 'guys'
]);

/** Prepositions and filler words to strip from item edges */
const EDGE_WORDS = new Set([
  'on', 'for', 'at', 'to', 'the', 'a', 'an', 'in', 'of', 'and', 'with',
  'spent', 'paid', 'had', 'bought', 'got', 'purchased', 'from', 'ordered'
]);

/** Day name → JS Date day index (0 = Sunday) */
const DAY_NAMES = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/** Month name → 0-indexed month number */
const MONTH_NAMES = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

/** Words that represent the number 1 in relative date expressions */
const ONE_WORDS = new Set(['a', 'an', 'one']);

// ─── Date Helpers ─────────────────────────────────────────────────────────────

/**
 * Formats a Date object as YYYY-MM-DD.
 * @param {Date} date
 * @returns {string}
 */
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Resolves a relative or absolute date expression from text.
 * Returns { dateStr, matched } where matched is the substring that was consumed.
 *
 * @param {string} text  - Lowercased input text
 * @param {Date}   today - Reference "today" date
 * @returns {{ dateStr: string, matched: string } | null}
 */
function resolveDate(text, today) {
  const lower = text.toLowerCase();

  // "day before yesterday"
  if (lower.includes('day before yesterday')) {
    const d = new Date(today);
    d.setDate(d.getDate() - 2);
    return { dateStr: toDateString(d), matched: 'day before yesterday' };
  }

  // "today"
  if (/\btoday\b/.test(lower)) {
    return { dateStr: toDateString(today), matched: 'today' };
  }

  // "yesterday"
  if (/\byesterday\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return { dateStr: toDateString(d), matched: 'yesterday' };
  }

  // "last <dayname>" — e.g. "last monday"
  const lastDayMatch = lower.match(/\blast\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/);
  if (lastDayMatch) {
    const targetDay = DAY_NAMES[lastDayMatch[1]];
    const d = new Date(today);
    const currentDay = d.getDay();
    let diff = currentDay - targetDay;
    if (diff <= 0) diff += 7; // Always go to the past occurrence
    d.setDate(d.getDate() - diff);
    return { dateStr: toDateString(d), matched: lastDayMatch[0] };
  }

  // "<N> days/weeks/months ago" or "a week ago"
  const agoMatch = lower.match(/\b(a|an|one|\d+)\s+(day|days|week|weeks|month|months)\s+ago\b/);
  if (agoMatch) {
    let count = ONE_WORDS.has(agoMatch[1]) ? 1 : parseInt(agoMatch[1], 10);
    if (isNaN(count)) count = 1;
    const unit = agoMatch[2].replace(/s$/, ''); // normalize plural
    const d = new Date(today);

    if (unit === 'day') {
      d.setDate(d.getDate() - count);
    } else if (unit === 'week') {
      d.setDate(d.getDate() - count * 7);
    } else if (unit === 'month') {
      d.setMonth(d.getMonth() - count);
    }

    return { dateStr: toDateString(d), matched: agoMatch[0] };
  }

  // Absolute: "15th June", "15 June", "June 15", "June 15th"
  const monthKeys = Object.keys(MONTH_NAMES).join('|');
  const absDateRegex1 = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthKeys})\\b`, 'i');
  const absDateRegex2 = new RegExp(`\\b(${monthKeys})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');

  const abs1 = lower.match(absDateRegex1);
  if (abs1) {
    const day = parseInt(abs1[1], 10);
    const month = MONTH_NAMES[abs1[2].toLowerCase()];
    if (day >= 1 && day <= 31 && month !== undefined) {
      const year = today.getFullYear();
      const d = new Date(year, month, day);
      // If the date is in the future, assume last year
      if (d > today) {
        d.setFullYear(year - 1);
      }
      return { dateStr: toDateString(d), matched: abs1[0] };
    }
  }

  const abs2 = lower.match(absDateRegex2);
  if (abs2) {
    const month = MONTH_NAMES[abs2[1].toLowerCase()];
    const day = parseInt(abs2[2], 10);
    if (day >= 1 && day <= 31 && month !== undefined) {
      const year = today.getFullYear();
      const d = new Date(year, month, day);
      if (d > today) {
        d.setFullYear(year - 1);
      }
      return { dateStr: toDateString(d), matched: abs2[0] };
    }
  }

  // DD/MM format: "15/06"
  const slashDate = lower.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slashDate) {
    const day = parseInt(slashDate[1], 10);
    const month = parseInt(slashDate[2], 10) - 1; // 0-indexed
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      const year = today.getFullYear();
      const d = new Date(year, month, day);
      if (d > today) {
        d.setFullYear(year - 1);
      }
      return { dateStr: toDateString(d), matched: slashDate[0] };
    }
  }

  return null;
}

// ─── Amount Extraction ────────────────────────────────────────────────────────

function extractAmount(text) {
  // Match amounts that may have:
  //   - Optional currency symbol prefix: ₹, $, €, £
  //   - Comma grouping: 1,500 or 10,00,000 (Indian style)
  //   - Decimal part: .50
  const amountRegex = /(?:[₹$€£]\s*)?((?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?)(?:\s*(?:rs|rupees|inr|bucks|dollars|usd|eur|gbp))?\b/gi;

  let match;
  while ((match = amountRegex.exec(text)) !== null) {
    const raw = match[1];
    const numStr = raw.replace(/,/g, '');
    const num = parseFloat(numStr);
    if (Number.isFinite(num) && num > 0) {
      return { amount: num, matched: match[0].trim() };
    }
  }

  return null;
}

// ─── People Extraction ───────────────────────────────────────────────────────

function extractPeople(text) {
  const people = [];
  let matched = '';
  let namesStr = '';

  const verbs = 'went|had|bought|paid|spent|ordered';

  const withPattern = new RegExp(`\\bwith\\s+([A-Za-z\\s,&]+?)(?:\\s+(?:for|on|at|${verbs})\\b|\\s+\\d+|$)`, 'i');
  const startPattern = new RegExp(`^([A-Za-z\\s,&]+?)\\b(?:\\s+(?:${verbs})\\b)`, 'i');
  const startIAndPattern = new RegExp(`^([A-Za-z\\s,&]+?)\\s+(?:and|along with)\\s+(?:i|me)\\b(?:\\s+(?:${verbs})\\b)?`, 'i');
  const iAndPattern = new RegExp(`\\b(?:i|me)\\s+(?:and|along with)\\s+([A-Za-z\\s,&]+?)(?:\\s+(?:${verbs}|for|on)\\b|\\s+\\d+|$)`, 'i');

  let match;
  if ((match = text.match(startIAndPattern))) {
    matched = match[0];
    namesStr = match[1] + ' and me';
  } else if ((match = text.match(startPattern))) {
    matched = match[0];
    namesStr = match[1];
  } else if ((match = text.match(withPattern))) {
    matched = match[0];
    namesStr = match[1];
  } else if ((match = text.match(iAndPattern))) {
    matched = match[0];
    namesStr = 'me and ' + match[1];
  }

  if (namesStr) {
    const nameParts = namesStr.split(/\s*(?:,\s*(?:and\s+)?|(?:\s+and\s+)|\s*&\s*|(?:\s+along with\s+))\s*/i);

    for (const part of nameParts) {
      const name = part.trim();
      if (!name) continue;

      const subParts = name.split(/\s+/);
      for (const subPart of subParts) {
        if (!subPart) continue;
        if (EXCLUDED_PEOPLE.has(subPart.toLowerCase())) continue;
        if (/^\d/.test(subPart)) continue;
        if (isCurrencyKeyword(subPart.toLowerCase())) continue;

        people.push(subPart.charAt(0).toUpperCase() + subPart.slice(1));
      }
    }
  }

  return { people, matched: matched.trim() };
}

/**
 * Checks if a word is a known currency keyword.
 * @param {string} word - Lowercased word
 * @returns {boolean}
 */
function isCurrencyKeyword(word) {
  for (const def of Object.values(CURRENCIES)) {
    if (def.keywords.includes(word)) return true;
  }
  return false;
}

// ─── Item Extraction ──────────────────────────────────────────────────────────

/**
 * Extracts the item description by removing known parts (amount, date,
 * currency keywords, people) from the sentence and cleaning up edges.
 *
 * @param {string} text            - Original sentence
 * @param {string[]} partsToRemove - Substrings to remove
 * @returns {string} Cleaned item description
 */
function extractItem(text, partsToRemove) {
  let result = text;

  // Remove each matched part
  for (const part of partsToRemove) {
    if (part) {
      // Escape regex special characters in the part
      const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'gi'), ' ');
    }
  }

  // Remove currency keywords
  for (const def of Object.values(CURRENCIES)) {
    for (const kw of def.keywords) {
      // Only remove standalone words (not symbols embedded in other words)
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ');
    }
  }

  // Remove currency symbols
  result = result.replace(/[₹$€£]/g, ' ');

  // Clean up: collapse whitespace, trim
  result = result.replace(/\s+/g, ' ').trim();

  // Strip leading/trailing prepositions and filler words
  let words = result.split(/\s+/);

  // Remove from the start
  while (words.length > 0 && EDGE_WORDS.has(words[0].toLowerCase())) {
    words.shift();
  }

  // Remove from the end
  while (words.length > 0 && EDGE_WORDS.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }

  return words.join(' ');
}

// ─── Confidence Aggregation ───────────────────────────────────────────────────

/**
 * Per-field weights used to compute overallConfidence. Amount and item are
 * weighted highest because they're the most user-visible and most likely to
 * trigger NER fallback when uncertain.
 */
const FIELD_WEIGHTS = {
  amount: 3,
  item: 2,
  people: 2,
  date: 1,
  currency: 1,
  category: 1,
};

/**
 * Computes a weighted overall confidence (0..1) from individual field
 * confidences. Used by the Phase 3 NER fallback cascade — when overall < 0.7,
 * the on-device NER model is invoked to refine extraction.
 *
 * @param {Object} fields - { amount, currency, date, item, people, category }
 * @returns {number} Weighted average confidence in [0, 1]
 */
function computeOverallConfidence(fields) {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(FIELD_WEIGHTS)) {
    const c = fields[key]?.confidence;
    if (typeof c === 'number') {
      weightedSum += c * weight;
      totalWeight += weight;
    }
  }
  return totalWeight === 0 ? 0 : Math.round((weightedSum / totalWeight) * 100) / 100;
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

/**
 * Parses a natural language expense sentence into a structured object with
 * per-field confidence scores.
 *
 * Each extracted field returns `{ value, confidence }` where confidence is in
 * the range [0, 1]. An aggregate `overallConfidence` is also returned, used by
 * the Phase 3 NER fallback to decide whether to refine the parse with an
 * on-device model.
 *
 * Handles a wide variety of input patterns:
 * - Standard: "Spent 300 on vadapav with wilson"
 * - Amount first: "300 rupees on coffee with Raj"
 * - Inverted: "Had coffee with Raj for 150"
 * - Multi-person: "Movie 500 with Priya and Amit"
 * - Relative dates: "Paid 2000 for groceries yesterday"
 * - Absolute dates: "Lunch 400 on 15th June with team"
 * - Explicit currency: "Spent 50 dollars on souvenirs"
 * - Minimal: "chai 20"
 * - Formatted amounts: "1,500 on shopping", "1500.50 on dinner"
 *
 * @param {string} sentence         - Natural language expense description
 * @param {string} [defaultCurrency='INR'] - Fallback currency if none detected
 * @returns {{
 *   amount:   { value: number|null, confidence: number },
 *   currency: { value: string,      confidence: number },
 *   date:     { value: string,      confidence: number },
 *   item:     { value: string,      confidence: number },
 *   people:   { value: string[],    confidence: number },
 *   category: { value: string,      confidence: number },
 *   raw: string,
 *   overallConfidence: number
 * }} Parsed expense object with confidence scores
 *
 * @example
 * parseExpense('Spent 300 rupees on vadapav with wilson')
 * // → {
 * //     amount:   { value: 300, confidence: 1.0 },
 * //     currency: { value: 'INR', confidence: 1.0 },
 * //     date:     { value: '2026-06-21', confidence: 0.5 },
 * //     item:     { value: 'vadapav', confidence: 0.9 },
 * //     people:   { value: ['Wilson'], confidence: 0.9 },
 * //     category: { value: 'food', confidence: 0.9 },
 * //     raw: 'Spent 300 rupees on vadapav with wilson',
 * //     overallConfidence: 0.86
 * //   }
 */
export function parseExpense(sentence, defaultCurrency = 'INR') {
  if (!sentence || typeof sentence !== 'string') {
    const fields = {
      amount:   { value: null, confidence: 0 },
      currency: { value: defaultCurrency, confidence: 0.5 },
      date:     { value: toDateString(new Date()), confidence: 0.5 },
      item:     { value: '', confidence: 0 },
      people:   { value: [], confidence: 0 },
      category: { value: 'other', confidence: 0.4 },
    };
    return {
      ...fields,
      raw: sentence || '',
      overallConfidence: computeOverallConfidence(fields),
    };
  }

  const raw = sentence.trim();
  const today = new Date();

  // ── 1. Currency ──
  const detectedCurrency = detectCurrency(raw);
  const currencyValue = detectedCurrency || defaultCurrency;
  // 1.0 if we found a keyword/symbol, 0.5 if we defaulted from settings.
  const currencyConfidence = detectedCurrency ? 1.0 : 0.5;

  // ── 2. Amount ──
  const amountResult = extractAmount(raw);
  const amountValue = amountResult ? amountResult.amount : null;
  // Confidence factors:
  //   - Missing entirely → 0
  //   - Found + explicit currency keyword/symbol nearby → 1.0
  //   - Found but currency was defaulted (no explicit signal) → 0.8
  let amountConfidence;
  if (amountValue === null) {
    amountConfidence = 0;
  } else if (detectedCurrency) {
    amountConfidence = 1.0;
  } else {
    amountConfidence = 0.8;
  }

  // ── 3. Date ──
  const dateResult = resolveDate(raw, today);
  const dateValue = dateResult ? dateResult.dateStr : toDateString(today);
  // 1.0 if we matched an explicit date phrase, 0.5 if we defaulted to today.
  const dateConfidence = dateResult ? 1.0 : 0.5;

  // ── 4. People ──
  const peopleResult = extractPeople(raw);
  const peopleValue = peopleResult.people;
  // Confidence by which extraction pattern matched:
  //   - Empty (no pattern matched) → 0 (signals "we didn't try to extract")
  //   - "with X" pattern (most reliable) → 0.9
  //   - "X had/went/..." or "X and I" start patterns → 0.7
  //     (less reliable — capitalized words at start can be other things)
  let peopleConfidence;
  if (peopleValue.length === 0) {
    peopleConfidence = 0;
  } else if (/\bwith\b/i.test(peopleResult.matched)) {
    peopleConfidence = 0.9;
  } else {
    peopleConfidence = 0.7;
  }

  // ── 5. Item (extract by removing known parts) ──
  const removals = [
    amountResult?.matched,
    dateResult?.matched,
    peopleResult.matched ? peopleResult.matched : null,
  ].filter(Boolean);

  const itemValue = extractItem(raw, removals);
  // 0.9 if we got a non-trivial item; 0.6 if it's very short or empty.
  let itemConfidence;
  if (!itemValue || itemValue.length < 2) {
    itemConfidence = 0.6;
  } else {
    itemConfidence = 0.9;
  }

  // ── 6. Category (detect from item + original text for context) ──
  let categoryValue = detectCategory(itemValue);
  let categoryFromRaw = false;
  if (categoryValue === 'other') {
    const fromRaw = detectCategory(raw);
    if (fromRaw !== 'other') {
      categoryValue = fromRaw;
      categoryFromRaw = true;
    }
  }
  // 0.9 if matched directly from item, 0.7 if matched from raw fallback,
  // 0.4 if defaulted to 'other'.
  let categoryConfidence;
  if (categoryValue === 'other') {
    categoryConfidence = 0.4;
  } else if (categoryFromRaw) {
    categoryConfidence = 0.7;
  } else {
    categoryConfidence = 0.9;
  }

  const fields = {
    amount:   { value: amountValue,   confidence: amountConfidence },
    currency: { value: currencyValue, confidence: currencyConfidence },
    date:     { value: dateValue,     confidence: dateConfidence },
    item:     { value: itemValue,     confidence: itemConfidence },
    people:   { value: peopleValue,   confidence: peopleConfidence },
    category: { value: categoryValue, confidence: categoryConfidence },
  };

  return {
    ...fields,
    raw,
    overallConfidence: computeOverallConfidence(fields),
  };
}

export default parseExpense;
