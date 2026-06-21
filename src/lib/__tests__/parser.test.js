/**
 * @file Parser test suite — covers the rule-based NLP expense parser.
 *
 * Date-dependent tests use a fixed "today" via vi.setSystemTime so they
 * remain deterministic across runs.
 *
 * Tests marked with `.todo()` are known-fail cases targeted by Phase 1.3
 * (parser weakness fixes) and Phase 1.4 (number words / fuzzy matching).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { parseExpense } from '../parser.js';

// Fixed reference date: Monday, June 15 2026
const FIXED_TODAY = new Date(2026, 5, 15, 12, 0, 0);

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_TODAY);
});

afterAll(() => {
  vi.useRealTimers();
});

// ─── Standard patterns ────────────────────────────────────────────────────────

describe('parser › standard patterns', () => {
  it('parses "Spent 300 on vadapav with wilson"', () => {
    const r = parseExpense('Spent 300 on vadapav with wilson');
    expect(r.amount.value).toBe(300);
    expect(r.currency.value).toBe('INR');
    expect(r.item.value).toBe('vadapav');
    expect(r.people.value).toEqual(['Wilson']);
    expect(r.category.value).toBe('food');
  });

  it('parses "Paid 500 for groceries"', () => {
    const r = parseExpense('Paid 500 for groceries');
    expect(r.amount.value).toBe(500);
    expect(r.item.value).toBe('groceries');
    expect(r.category.value).toBe('shopping');
  });

  it('parses "Bought a coffee for 80"', () => {
    const r = parseExpense('Bought a coffee for 80');
    expect(r.amount.value).toBe(80);
    expect(r.category.value).toBe('food');
  });

  it('parses "Spent 200 on uber"', () => {
    const r = parseExpense('Spent 200 on uber');
    expect(r.amount.value).toBe(200);
    expect(r.category.value).toBe('transport');
  });

  it('parses "Movie ticket 350"', () => {
    const r = parseExpense('Movie ticket 350');
    expect(r.amount.value).toBe(350);
    expect(r.category.value).toBe('entertainment');
  });

  it('parses "Lunch at restaurant 450"', () => {
    const r = parseExpense('Lunch at restaurant 450');
    expect(r.amount.value).toBe(450);
    expect(r.category.value).toBe('food');
  });

  it('parses minimal "chai 20"', () => {
    const r = parseExpense('chai 20');
    expect(r.amount.value).toBe(20);
    expect(r.category.value).toBe('food');
  });

  it('parses minimal "20 chai"', () => {
    const r = parseExpense('20 chai');
    expect(r.amount.value).toBe(20);
    expect(r.category.value).toBe('food');
  });

  it('parses "Spent 1000 on petrol"', () => {
    const r = parseExpense('Spent 1000 on petrol');
    expect(r.amount.value).toBe(1000);
    expect(r.category.value).toBe('transport');
  });

  it('parses formatted amount "1,500 on shopping"', () => {
    const r = parseExpense('1,500 on shopping');
    expect(r.amount.value).toBe(1500);
    expect(r.category.value).toBe('shopping');
  });

  it('parses decimal amount "Spent 50.75 on coffee"', () => {
    const r = parseExpense('Spent 50.75 on coffee');
    expect(r.amount.value).toBe(50.75);
  });

  it('parses Indian-style grouping "10,00,000 on car"', () => {
    const r = parseExpense('10,00,000 on car');
    expect(r.amount.value).toBe(1000000);
  });

  it('parses "got medicine for 250"', () => {
    const r = parseExpense('got medicine for 250');
    expect(r.amount.value).toBe(250);
    expect(r.category.value).toBe('health');
  });

  it('parses "Paid electricity bill 2000"', () => {
    const r = parseExpense('Paid electricity bill 2000');
    expect(r.amount.value).toBe(2000);
    expect(r.category.value).toBe('bills');
  });

  it('parses "Spent 500 on netflix subscription"', () => {
    const r = parseExpense('Spent 500 on netflix subscription');
    expect(r.amount.value).toBe(500);
    expect(r.category.value).toBe('entertainment');
  });
});

// ─── Inverted patterns ───────────────────────────────────────────────────────

describe('parser › inverted patterns', () => {
  it('parses "Had coffee with Raj for 150"', () => {
    const r = parseExpense('Had coffee with Raj for 150');
    expect(r.amount.value).toBe(150);
    expect(r.people.value).toEqual(['Raj']);
    expect(r.category.value).toBe('food');
  });

  it('parses "Went for dinner 800"', () => {
    const r = parseExpense('Went for dinner 800');
    expect(r.amount.value).toBe(800);
    expect(r.category.value).toBe('food');
  });

  it('parses "Got groceries 1200"', () => {
    const r = parseExpense('Got groceries 1200');
    expect(r.amount.value).toBe(1200);
    expect(r.category.value).toBe('shopping');
  });

  it('parses "Bought shoes for 3000"', () => {
    const r = parseExpense('Bought shoes for 3000');
    expect(r.amount.value).toBe(3000);
    expect(r.category.value).toBe('shopping');
  });

  it('parses "Ordered pizza 600"', () => {
    const r = parseExpense('Ordered pizza 600');
    expect(r.amount.value).toBe(600);
    expect(r.category.value).toBe('food');
  });

  it('parses "Had a haircut for 200"', () => {
    const r = parseExpense('Had a haircut for 200');
    expect(r.amount.value).toBe(200);
    expect(r.category.value).toBe('personal');
  });

  it('parses "Took an uber 250"', () => {
    const r = parseExpense('Took an uber 250');
    expect(r.amount.value).toBe(250);
    expect(r.category.value).toBe('transport');
  });

  it('parses "Paid 5000 for rent"', () => {
    const r = parseExpense('Paid 5000 for rent');
    expect(r.amount.value).toBe(5000);
    expect(r.category.value).toBe('bills');
  });

  it('parses "Got biryani for 250"', () => {
    const r = parseExpense('Got biryani for 250');
    expect(r.amount.value).toBe(250);
    expect(r.category.value).toBe('food');
  });

  it('parses "Bought a book for 400"', () => {
    const r = parseExpense('Bought a book for 400');
    expect(r.amount.value).toBe(400);
    expect(r.category.value).toBe('entertainment');
  });
});

// ─── Multi-person patterns ───────────────────────────────────────────────────

describe('parser › multi-person patterns', () => {
  it('parses "Movie 500 with Priya and Amit"', () => {
    const r = parseExpense('Movie 500 with Priya and Amit');
    expect(r.amount.value).toBe(500);
    expect(r.people.value).toEqual(expect.arrayContaining(['Priya', 'Amit']));
    expect(r.people.value).toHaveLength(2);
  });

  it('parses "Coffee with Raj, Amit and Priya 300"', () => {
    const r = parseExpense('Coffee with Raj, Amit and Priya 300');
    expect(r.amount.value).toBe(300);
    expect(r.people.value).toEqual(expect.arrayContaining(['Raj', 'Amit', 'Priya']));
    expect(r.people.value).toHaveLength(3);
  });

  it('parses "Wilson and I went for coffee 500"', () => {
    const r = parseExpense('Wilson and I went for coffee 500');
    expect(r.amount.value).toBe(500);
    expect(r.people.value).toEqual(expect.arrayContaining(['Wilson']));
  });

  it('parses "I and Raj had lunch 400"', () => {
    const r = parseExpense('I and Raj had lunch 400');
    expect(r.amount.value).toBe(400);
    expect(r.people.value).toEqual(expect.arrayContaining(['Raj']));
  });

  it('parses "Raj and Amit had lunch 600"', () => {
    const r = parseExpense('Raj and Amit had lunch 600');
    expect(r.amount.value).toBe(600);
    expect(r.people.value).toEqual(expect.arrayContaining(['Raj', 'Amit']));
    expect(r.people.value).toHaveLength(2);
  });

  it('parses "Dinner with Priya & Amit 1200"', () => {
    const r = parseExpense('Dinner with Priya & Amit 1200');
    expect(r.amount.value).toBe(1200);
    expect(r.people.value).toEqual(expect.arrayContaining(['Priya', 'Amit']));
  });

  it('parses "Spent 500 with Alice and Bob on groceries"', () => {
    const r = parseExpense('Spent 500 with Alice and Bob on groceries');
    expect(r.amount.value).toBe(500);
    expect(r.people.value).toEqual(expect.arrayContaining(['Alice', 'Bob']));
  });

  it('parses "Lunch with team 1500"', () => {
    const r = parseExpense('Lunch with team 1500');
    expect(r.amount.value).toBe(1500);
    expect(r.people.value).toContain('Team');
  });

  it('excludes "everyone" from people extraction', () => {
    const r = parseExpense('Spent 500 with everyone on dinner');
    expect(r.people.value).toEqual([]);
  });

  it('handles no people (empty list)', () => {
    const r = parseExpense('Spent 100 on chai');
    expect(r.people.value).toEqual([]);
  });
});

// ─── Date formats ────────────────────────────────────────────────────────────

describe('parser › date formats', () => {
  it('defaults to today when no date is mentioned', () => {
    const r = parseExpense('Spent 100 on chai');
    expect(r.date.value).toBe('2026-06-15');
  });

  it('resolves "today"', () => {
    const r = parseExpense('Spent 100 on chai today');
    expect(r.date.value).toBe('2026-06-15');
  });

  it('resolves "yesterday"', () => {
    const r = parseExpense('Spent 100 on chai yesterday');
    expect(r.date.value).toBe('2026-06-14');
  });

  it('resolves "day before yesterday"', () => {
    const r = parseExpense('Spent 100 on chai day before yesterday');
    expect(r.date.value).toBe('2026-06-13');
  });

  it('resolves "last monday" (today is Monday → previous Monday)', () => {
    const r = parseExpense('Spent 100 on chai last monday');
    expect(r.date.value).toBe('2026-06-08');
  });

  it('resolves "last friday"', () => {
    const r = parseExpense('Spent 100 on chai last friday');
    expect(r.date.value).toBe('2026-06-12');
  });

  it('resolves "last sunday"', () => {
    const r = parseExpense('Spent 100 on chai last sunday');
    expect(r.date.value).toBe('2026-06-14');
  });

  it('resolves "3 days ago"', () => {
    const r = parseExpense('Spent 100 on chai 3 days ago');
    expect(r.date.value).toBe('2026-06-12');
  });

  it('resolves "a week ago"', () => {
    const r = parseExpense('Spent 100 on chai a week ago');
    expect(r.date.value).toBe('2026-06-08');
  });

  it('resolves "2 weeks ago"', () => {
    const r = parseExpense('Spent 100 on chai 2 weeks ago');
    expect(r.date.value).toBe('2026-06-01');
  });

  it('resolves "a month ago"', () => {
    const r = parseExpense('Spent 100 on chai a month ago');
    expect(r.date.value).toBe('2026-05-15');
  });

  it('resolves "one day ago"', () => {
    const r = parseExpense('Spent 100 on chai one day ago');
    expect(r.date.value).toBe('2026-06-14');
  });

  it('resolves "15th June" (assumes current year)', () => {
    const r = parseExpense('Lunch 400 on 15th June');
    expect(r.date.value).toBe('2026-06-15');
  });

  it('resolves "June 15"', () => {
    const r = parseExpense('Lunch 400 on June 15');
    expect(r.date.value).toBe('2026-06-15');
  });

  it('resolves "5 jan" (rolls back to last year if future)', () => {
    const r = parseExpense('Lunch 400 on 5 jan');
    expect(r.date.value).toBe('2026-01-05');
  });

  it('resolves "1st january" as current year', () => {
    const r = parseExpense('Spent 100 on chai 1st january');
    expect(r.date.value).toBe('2026-01-01');
  });

  it('rolls back future absolute dates to previous year', () => {
    // FIXED_TODAY is June 15. "December 1" would be future → rolls to 2025
    const r = parseExpense('Spent 100 on chai december 1');
    expect(r.date.value).toBe('2025-12-01');
  });

  it('resolves slash date "10/06"', () => {
    const r = parseExpense('Spent 100 on chai 10/06');
    expect(r.date.value).toBe('2026-06-10');
  });

  it('resolves "5/01" as January 5', () => {
    const r = parseExpense('Spent 100 on chai 5/01');
    expect(r.date.value).toBe('2026-01-05');
  });

  it('honors explicit year in "5th January 2025"', () => {
    const r = parseExpense('Lunch 400 on 5th January 2025');
    expect(r.date.value).toBe('2025-01-05');
  });

  it('honors explicit year in "January 5 2025"', () => {
    const r = parseExpense('Spent 100 on chai January 5 2025');
    expect(r.date.value).toBe('2025-01-05');
  });

  it('honors explicit year in slash date "5/1/2025"', () => {
    const r = parseExpense('Spent 100 on chai 5/1/2025');
    expect(r.date.value).toBe('2025-01-05');
  });

  it('honors 2-digit year in slash date "5/1/25"', () => {
    const r = parseExpense('Spent 100 on chai 5/1/25');
    expect(r.date.value).toBe('2025-01-05');
  });

  it('combines amount, item, and date correctly', () => {
    const r = parseExpense('Paid 2000 for groceries yesterday');
    expect(r.amount.value).toBe(2000);
    expect(r.item.value).toBe('groceries');
    expect(r.date.value).toBe('2026-06-14');
  });
});

// ─── Currency detection ─────────────────────────────────────────────────────

describe('parser › currency detection', () => {
  it('defaults to INR with no currency keyword', () => {
    const r = parseExpense('Spent 300 on chai');
    expect(r.currency.value).toBe('INR');
  });

  it('detects "rupees" → INR', () => {
    const r = parseExpense('Spent 300 rupees on chai');
    expect(r.currency.value).toBe('INR');
  });

  it('detects "rs" → INR', () => {
    const r = parseExpense('Spent 300rs on chai');
    expect(r.currency.value).toBe('INR');
  });

  it('detects "₹" symbol → INR', () => {
    const r = parseExpense('Spent ₹300 on chai');
    expect(r.currency.value).toBe('INR');
  });

  it('detects "inr" code → INR', () => {
    const r = parseExpense('Spent 300 inr on chai');
    expect(r.currency.value).toBe('INR');
  });

  it('detects "dollars" → USD', () => {
    const r = parseExpense('Spent 50 dollars on souvenirs');
    expect(r.currency.value).toBe('USD');
  });

  it('detects "dollar" (singular) → USD', () => {
    const r = parseExpense('Spent 1 dollar on candy');
    expect(r.currency.value).toBe('USD');
  });

  it('detects "$" symbol → USD', () => {
    const r = parseExpense('Spent $50 on souvenirs');
    expect(r.currency.value).toBe('USD');
  });

  it('detects "usd" code → USD', () => {
    const r = parseExpense('Spent 50 usd on souvenirs');
    expect(r.currency.value).toBe('USD');
  });

  it('detects "euros" → EUR', () => {
    const r = parseExpense('Spent 30 euros on lunch');
    expect(r.currency.value).toBe('EUR');
  });

  it('detects "€" symbol → EUR', () => {
    const r = parseExpense('Spent €30 on lunch');
    expect(r.currency.value).toBe('EUR');
  });

  it('detects "eur" code → EUR', () => {
    const r = parseExpense('Spent 30 eur on lunch');
    expect(r.currency.value).toBe('EUR');
  });

  it('detects "pounds" → GBP', () => {
    const r = parseExpense('Spent 25 pounds on lunch');
    expect(r.currency.value).toBe('GBP');
  });

  it('detects "£" symbol → GBP', () => {
    const r = parseExpense('Spent £25 on lunch');
    expect(r.currency.value).toBe('GBP');
  });

  it('respects defaultCurrency parameter', () => {
    const r = parseExpense('Spent 300 on chai', 'USD');
    expect(r.currency.value).toBe('USD');
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('parser › edge cases', () => {
  it('handles empty string', () => {
    const r = parseExpense('');
    expect(r.amount.value).toBeNull();
    expect(r.item.value).toBe('');
    expect(r.people.value).toEqual([]);
    expect(r.category.value).toBe('other');
  });

  it('handles null input', () => {
    const r = parseExpense(null);
    expect(r.amount.value).toBeNull();
    expect(r.item.value).toBe('');
  });

  it('handles undefined input', () => {
    const r = parseExpense(undefined);
    expect(r.amount.value).toBeNull();
  });

  it('handles non-string input', () => {
    const r = parseExpense(12345);
    expect(r.amount.value).toBeNull();
  });

  it('handles input with only an amount', () => {
    const r = parseExpense('300');
    expect(r.amount.value).toBe(300);
    expect(r.category.value).toBe('other');
  });

  it('handles input with only an item (no amount)', () => {
    const r = parseExpense('coffee');
    expect(r.amount.value).toBeNull();
    expect(r.category.value).toBe('food');
  });

  it('handles whitespace-only input', () => {
    const r = parseExpense('   ');
    expect(r.amount.value).toBeNull();
    expect(r.item.value).toBe('');
  });

  it('preserves the raw input field', () => {
    const raw = 'Spent 300 on vadapav with wilson';
    const r = parseExpense(raw);
    expect(r.raw).toBe(raw);
  });

  it('handles very long sentences', () => {
    const long = 'Spent 500 on a really really really really really really long description of an expense';
    const r = parseExpense(long);
    expect(r.amount.value).toBe(500);
  });

  it('handles trailing/leading whitespace', () => {
    const r = parseExpense('   Spent 100 on chai   ');
    expect(r.amount.value).toBe(100);
    expect(r.item.value).toBe('chai');
  });

  it('handles mixed casing', () => {
    const r = parseExpense('SPENT 100 ON CHAI');
    expect(r.amount.value).toBe(100);
  });

  it('returns valid date when no date mentioned', () => {
    const r = parseExpense('chai 20');
    expect(r.date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles unknown category gracefully', () => {
    const r = parseExpense('Spent 100 on xyzabc123');
    expect(r.category.value).toBe('other');
  });

  it('handles amount with currency suffix "500rs"', () => {
    const r = parseExpense('500rs on groceries');
    expect(r.amount.value).toBe(500);
    expect(r.currency.value).toBe('INR');
  });

  it('handles "bucks" colloquial USD-like (but parser allows it as keyword-less amount)', () => {
    const r = parseExpense('Family dinner 2000 bucks');
    expect(r.amount.value).toBe(2000);
  });
});

// ─── Category detection ─────────────────────────────────────────────────────

describe('parser › category detection', () => {
  it('detects multi-word phrase "ice cream" → food', () => {
    const r = parseExpense('Spent 100 on ice cream');
    expect(r.category.value).toBe('food');
  });

  it('detects multi-word phrase "pav bhaji" → food', () => {
    const r = parseExpense('Spent 80 on pav bhaji');
    expect(r.category.value).toBe('food');
  });

  it('detects "doctor" → health', () => {
    const r = parseExpense('Paid 500 to doctor');
    expect(r.category.value).toBe('health');
  });

  it('detects "wifi" → bills', () => {
    const r = parseExpense('Paid 1000 for wifi');
    expect(r.category.value).toBe('bills');
  });

  it('detects "tuition" → education', () => {
    const r = parseExpense('Paid 5000 for tuition');
    expect(r.category.value).toBe('education');
  });

  it('detects "salon" → personal', () => {
    const r = parseExpense('Spent 800 at salon');
    expect(r.category.value).toBe('personal');
  });

  it('falls back to category detection from raw when item is generic', () => {
    // Item extraction may strip context; raw retains it
    const r = parseExpense('Spent 250 with friends on movie');
    expect(r.category.value).toBe('entertainment');
  });
});

// ─── Combined complexity ────────────────────────────────────────────────────
// Sentences that exercise multiple parser features at once. These catch
// interaction bugs that isolated tests miss.

describe('parser › combined complexity', () => {
  it('parses currency-symbol + comma-amount + people + relative date', () => {
    const r = parseExpense('Spent ₹1,500 on dinner with Raj and Priya last friday');
    expect(r.amount.value).toBe(1500);
    expect(r.currency.value).toBe('INR');
    expect(r.people.value).toEqual(expect.arrayContaining(['Raj', 'Priya']));
    expect(r.date.value).toBe('2026-06-12');
    expect(r.category.value).toBe('food');
  });

  it('parses inverted + currency keyword + person + yesterday', () => {
    const r = parseExpense('Had 50 dollars worth of coffee with Sarah yesterday');
    expect(r.amount.value).toBe(50);
    expect(r.currency.value).toBe('USD');
    expect(r.people.value).toContain('Sarah');
    expect(r.date.value).toBe('2026-06-14');
    expect(r.category.value).toBe('food');
  });

  it('parses absolute date + currency symbol + multi-person', () => {
    const r = parseExpense('Movie 500 on 10/06 with Priya, Amit and Wilson');
    expect(r.amount.value).toBe(500);
    expect(r.date.value).toBe('2026-06-10');
    expect(r.people.value).toEqual(expect.arrayContaining(['Priya', 'Amit', 'Wilson']));
    expect(r.category.value).toBe('entertainment');
  });

  it('parses pound currency + N-days-ago + category', () => {
    const r = parseExpense('Bought groceries for £75 3 days ago');
    expect(r.amount.value).toBe(75);
    expect(r.currency.value).toBe('GBP');
    expect(r.date.value).toBe('2026-06-12');
    expect(r.category.value).toBe('shopping');
  });

  it('parses minimal pattern + currency + person', () => {
    const r = parseExpense('chai 20 with Wilson');
    expect(r.amount.value).toBe(20);
    expect(r.currency.value).toBe('INR');
    expect(r.people.value).toContain('Wilson');
    expect(r.category.value).toBe('food');
  });

  it('parses month-name absolute date + decimal amount + euro', () => {
    const r = parseExpense('Lunch 24.50 euros on June 5');
    expect(r.amount.value).toBe(24.5);
    expect(r.currency.value).toBe('EUR');
    expect(r.date.value).toBe('2026-06-05');
    expect(r.category.value).toBe('food');
  });

  it('parses uber + amount + person + date', () => {
    const r = parseExpense('Took uber for 350 with Amit yesterday');
    expect(r.amount.value).toBe(350);
    expect(r.people.value).toContain('Amit');
    expect(r.date.value).toBe('2026-06-14');
    expect(r.category.value).toBe('transport');
  });

  it('parses Indian-grouped amount + rupees keyword + date', () => {
    const r = parseExpense('Paid 1,25,000 rupees for rent on 1st june');
    expect(r.amount.value).toBe(125000);
    expect(r.currency.value).toBe('INR');
    expect(r.date.value).toBe('2026-06-01');
    expect(r.category.value).toBe('bills');
  });

  it('parses dollar symbol + multi-person + category keyword', () => {
    const r = parseExpense('Dinner $80 with Alice and Bob at restaurant');
    expect(r.amount.value).toBe(80);
    expect(r.currency.value).toBe('USD');
    expect(r.people.value).toEqual(expect.arrayContaining(['Alice', 'Bob']));
    expect(r.category.value).toBe('food');
  });

  it('parses multi-word category + amount + a-week-ago', () => {
    const r = parseExpense('Spent 200 on ice cream with Priya a week ago');
    expect(r.amount.value).toBe(200);
    expect(r.people.value).toContain('Priya');
    expect(r.date.value).toBe('2026-06-08');
    expect(r.category.value).toBe('food');
  });
});

// ─── Boundary amounts ───────────────────────────────────────────────────────
// Numerical edge cases — values at the extremes of what the parser should
// handle, plus inputs that should be rejected.

describe('parser › boundary amounts', () => {
  it('rejects amount of 0 (treated as no amount found)', () => {
    // Current parser requires num > 0, so 0 is not extracted
    const r = parseExpense('Spent 0 on chai');
    expect(r.amount.value).toBeNull();
  });

  it('handles smallest meaningful amount (1)', () => {
    const r = parseExpense('Spent 1 on candy');
    expect(r.amount.value).toBe(1);
  });

  it('handles small decimal "0.50"', () => {
    const r = parseExpense('Spent 0.50 on candy');
    expect(r.amount.value).toBe(0.5);
  });

  it('handles very large amount "1,00,00,000" (1 crore)', () => {
    const r = parseExpense('Bought a flat for 1,00,00,000');
    expect(r.amount.value).toBe(10000000);
  });

  it('handles 7-digit amount with US grouping "1,000,000"', () => {
    const r = parseExpense('Lottery win 1,000,000');
    expect(r.amount.value).toBe(1000000);
  });

  it('handles maximum precision decimal "99.99"', () => {
    const r = parseExpense('Spent 99.99 on shoes');
    expect(r.amount.value).toBe(99.99);
  });

  it('handles leading zero "0.99"', () => {
    const r = parseExpense('Spent 0.99 on app');
    expect(r.amount.value).toBe(0.99);
  });

  it('extracts first amount when multiple are present', () => {
    // Phase 1.3 will improve this; for now we lock in current behavior
    const r = parseExpense('Coffee 50 and croissant 80');
    expect(r.amount.value).toBe(50);
  });

  it('does not parse standalone non-numeric currency-like words as amount', () => {
    const r = parseExpense('rupees on chai');
    expect(r.amount.value).toBeNull();
  });

  it('handles amount glued to currency symbol "₹250"', () => {
    const r = parseExpense('₹250 on biryani');
    expect(r.amount.value).toBe(250);
    expect(r.currency.value).toBe('INR');
  });

  it('handles amount glued to currency keyword "500rs"', () => {
    const r = parseExpense('500rs on snacks');
    expect(r.amount.value).toBe(500);
    expect(r.currency.value).toBe('INR');
  });

  it('ignores negative sign and extracts positive amount', () => {
    // The regex matches digits without sign — "-500" yields 500
    const r = parseExpense('Refund -500 on shopping');
    expect(r.amount.value).toBe(500);
  });
});

// ─── Confidence scoring ─────────────────────────────────────────────────────
// Phase 1.2: every parsed field returns { value, confidence } and the result
// includes overallConfidence (weighted aggregate). NER fallback in Phase 3
// triggers when overallConfidence < 0.7.

describe('parser › confidence: shape', () => {
  it('every field has { value, confidence } structure', () => {
    const r = parseExpense('Spent 300 on chai');
    for (const key of ['amount', 'currency', 'date', 'item', 'people', 'category']) {
      expect(r[key]).toHaveProperty('value');
      expect(r[key]).toHaveProperty('confidence');
      expect(typeof r[key].confidence).toBe('number');
      expect(r[key].confidence).toBeGreaterThanOrEqual(0);
      expect(r[key].confidence).toBeLessThanOrEqual(1);
    }
  });

  it('result includes overallConfidence in [0, 1]', () => {
    const r = parseExpense('Spent 300 on chai');
    expect(typeof r.overallConfidence).toBe('number');
    expect(r.overallConfidence).toBeGreaterThanOrEqual(0);
    expect(r.overallConfidence).toBeLessThanOrEqual(1);
  });

  it('preserves raw at the top level (not wrapped)', () => {
    const r = parseExpense('Spent 300 on chai');
    expect(r.raw).toBe('Spent 300 on chai');
  });
});

describe('parser › confidence: amount', () => {
  it('amount.confidence is 0 when amount is missing', () => {
    const r = parseExpense('coffee with Raj');
    expect(r.amount.value).toBeNull();
    expect(r.amount.confidence).toBe(0);
  });

  it('amount.confidence is 1.0 with explicit currency keyword', () => {
    const r = parseExpense('Spent 300 rupees on chai');
    expect(r.amount.confidence).toBe(1.0);
  });

  it('amount.confidence is 1.0 with currency symbol', () => {
    const r = parseExpense('₹300 on chai');
    expect(r.amount.confidence).toBe(1.0);
  });

  it('amount.confidence is 0.8 when currency is defaulted', () => {
    const r = parseExpense('Spent 300 on chai');
    expect(r.amount.confidence).toBe(0.8);
  });
});

describe('parser › confidence: currency', () => {
  it('currency.confidence is 1.0 when keyword is matched', () => {
    const r = parseExpense('Spent 50 dollars on coffee');
    expect(r.currency.confidence).toBe(1.0);
  });

  it('currency.confidence is 1.0 when symbol is matched', () => {
    const r = parseExpense('Spent $50 on coffee');
    expect(r.currency.confidence).toBe(1.0);
  });

  it('currency.confidence is 0.5 when defaulted from settings', () => {
    const r = parseExpense('Spent 300 on chai');
    expect(r.currency.confidence).toBe(0.5);
  });
});

describe('parser › confidence: date', () => {
  it('date.confidence is 1.0 for explicit relative date', () => {
    const r = parseExpense('Spent 300 on chai yesterday');
    expect(r.date.confidence).toBe(1.0);
  });

  it('date.confidence is 1.0 for explicit absolute date', () => {
    const r = parseExpense('Spent 300 on chai 15th june');
    expect(r.date.confidence).toBe(1.0);
  });

  it('date.confidence is 0.5 when defaulted to today', () => {
    const r = parseExpense('Spent 300 on chai');
    expect(r.date.confidence).toBe(0.5);
  });
});

describe('parser › confidence: people', () => {
  it('people.confidence is 0 when no people are extracted', () => {
    const r = parseExpense('Spent 300 on chai');
    expect(r.people.value).toEqual([]);
    expect(r.people.confidence).toBe(0);
  });

  it('people.confidence is 0.9 when "with X" pattern matches', () => {
    const r = parseExpense('Spent 300 with Wilson on chai');
    expect(r.people.confidence).toBe(0.9);
  });

  it('people.confidence is 0.7 for start-of-sentence pattern', () => {
    const r = parseExpense('Wilson and I had coffee 500');
    expect(r.people.confidence).toBe(0.7);
  });
});

describe('parser › confidence: category', () => {
  it('category.confidence is 0.4 when defaulted to other', () => {
    const r = parseExpense('Spent 300 on xyzabc');
    expect(r.category.value).toBe('other');
    expect(r.category.confidence).toBe(0.4);
  });

  it('category.confidence is 0.9 when matched directly from item', () => {
    const r = parseExpense('Spent 300 on coffee');
    expect(r.category.confidence).toBe(0.9);
  });
});

describe('parser › confidence: overall', () => {
  it('overallConfidence is high (>0.85) for fully explicit input', () => {
    const r = parseExpense('Spent ₹300 on coffee with Wilson yesterday');
    expect(r.overallConfidence).toBeGreaterThan(0.85);
  });

  it('overallConfidence is low (<0.7) when amount is missing', () => {
    const r = parseExpense('coffee with Raj');
    expect(r.overallConfidence).toBeLessThan(0.7);
  });

  it('overallConfidence is moderate for minimal input', () => {
    const r = parseExpense('chai 20');
    expect(r.overallConfidence).toBeGreaterThan(0.4);
    expect(r.overallConfidence).toBeLessThan(0.85);
  });

  it('overallConfidence is low for empty input', () => {
    const r = parseExpense('');
    expect(r.overallConfidence).toBeLessThan(0.5);
  });
});

// ─── Phase 1.3 Known Failures (todo) ────────────────────────────────────────
// These document parser weaknesses to be fixed in Phase 1.3.
// Marked .todo() so the suite stays green; convert to .it() when fixed.

describe('parser › Phase 1.3 known weaknesses', () => {
  it('does not capture location after "at" as a person — "Movie at PVR with Priya"', () => {
    const r = parseExpense('Movie at PVR with Priya 500');
    expect(r.amount.value).toBe(500);
    expect(r.people.value).toEqual(['Priya']);
  });

  it('does not capture location after "at" when no person mentioned — "Dinner at Starbucks 200"', () => {
    const r = parseExpense('Dinner at Starbucks 200');
    expect(r.amount.value).toBe(200);
    expect(r.people.value).toEqual([]);
  });

  it.todo('signals confidence:0 when amount is missing — "cab to airport"');

  it('flags multiple amounts as low-confidence — "coffee 50 and croissant 80"', () => {
    const r = parseExpense('coffee 50 and croissant 80');
    expect(r.amount.value).toBe(50);
    expect(r.amount.confidence).toBeLessThanOrEqual(0.5);
    expect(r.amount.confidence).toBeGreaterThan(0);
  });

  it('flags multiple amounts as low-confidence — "lunch 200 dinner 300"', () => {
    const r = parseExpense('lunch 200 dinner 300');
    expect(r.amount.value).toBe(200);
    expect(r.amount.confidence).toBeLessThanOrEqual(0.5);
  });

  it('flags multiple amounts as low-confidence — "spent 100 on coffee 200 on lunch"', () => {
    const r = parseExpense('spent 100 on coffee 200 on lunch');
    expect(r.amount.value).toBe(100);
    expect(r.amount.confidence).toBeLessThanOrEqual(0.5);
  });

  it('keeps single-amount confidence high — regression guard for "coffee 50"', () => {
    const r = parseExpense('coffee 50');
    expect(r.amount.value).toBe(50);
    expect(r.amount.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('handles "around 500" — extracts amount, lowers confidence, strips qualifier from item', () => {
    const r = parseExpense('Spent around 500 on dinner');
    expect(r.amount.value).toBe(500);
    expect(r.amount.confidence).toBeLessThanOrEqual(0.7);
    expect(r.amount.confidence).toBeGreaterThan(0);
    expect(r.item.value).toBe('dinner');
  });

  it('handles "about 100" — extracts amount and lowers confidence', () => {
    const r = parseExpense('about 100 for chai');
    expect(r.amount.value).toBe(100);
    expect(r.amount.confidence).toBeLessThanOrEqual(0.7);
    expect(r.item.value).toBe('chai');
  });

  it('handles "roughly 200" — extracts amount and lowers confidence', () => {
    const r = parseExpense('roughly 200 on groceries');
    expect(r.amount.value).toBe(200);
    expect(r.amount.confidence).toBeLessThanOrEqual(0.7);
    expect(r.item.value).toBe('groceries');
  });

  it('handles "approximately 50" — extracts amount and lowers confidence', () => {
    const r = parseExpense('approximately 50 on coffee');
    expect(r.amount.value).toBe(50);
    expect(r.amount.confidence).toBeLessThanOrEqual(0.7);
    expect(r.item.value).toBe('coffee');
  });

  it('handles tilde shorthand "~200" — extracts amount and lowers confidence', () => {
    const r = parseExpense('~200 on petrol');
    expect(r.amount.value).toBe(200);
    expect(r.amount.confidence).toBeLessThanOrEqual(0.7);
    expect(r.item.value).toBe('petrol');
  });
});

// ─── Phase 1.4 Number words (todo) ──────────────────────────────────────────

describe('parser › Phase 1.4 number words', () => {
  it.todo('parses "fifty rupees" as amount 50');
  it.todo('parses "two hundred" as amount 200');
  it.todo('parses "twenty five" as amount 25');
  it.todo('parses "one hundred fifty" as amount 150');
  it.todo('parses "five hundred dollars" as amount 500 USD');
});

// ─── Phase 1.4 Fuzzy matching (todo) ────────────────────────────────────────

describe('parser › Phase 1.4 fuzzy matching', () => {
  it.todo('matches typo "cofee" → coffee → food');
  it.todo('matches typo "ubr" → uber → transport');
  it.todo('matches typo "chia" → chai → food');
  it.todo('matches typo "groceris" → groceries → shopping');
});
