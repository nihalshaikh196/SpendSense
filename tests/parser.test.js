import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseExpense, parseExpenses } from '../src/lib/parser.js';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('parseExpense — end to end', () => {
  const cases = [
    ['Spent 300 on vadapav with wilson', { amount: 300, item: 'vadapav', category: 'food', people: ['Wilson'] }],
    ['300 rupees on coffee with Raj', { amount: 300, currency: 'INR', item: 'coffee', people: ['Raj'] }],
    ['Had coffee with Raj for 150', { amount: 150, item: 'coffee', people: ['Raj'] }],
    ['Movie 500 with Priya and Amit', { amount: 500, category: 'entertainment', people: ['Priya', 'Amit'] }],
    ['50 dollars on souvenirs', { amount: 50, currency: 'USD', item: 'souvenirs' }],
    ['$15 for lunch with Sarah', { amount: 15, currency: 'USD', item: 'lunch', people: ['Sarah'] }],
    ['chai 20', { amount: 20, item: 'chai', category: 'food', people: [] }],
    ['1,500 on shopping', { amount: 1500, category: 'shopping' }],
    ['1500.50 on dinner', { amount: 1500.5, item: 'dinner' }],
    ['Spent 500rs on groceries with Alice and Bob', { amount: 500, item: 'groceries', people: ['Alice', 'Bob'] }],
    ['Wilson and I went for coffee 500', { amount: 500, item: 'coffee', people: ['Wilson'] }],
    ['uber 250 to airport', { amount: 250, category: 'transport' }],
  ];

  for (const [input, expected] of cases) {
    test(input, () => {
      const parsed = parseExpense(input);
      for (const [key, value] of Object.entries(expected)) {
        assert.deepEqual(parsed[key], value, `${key} for "${input}"`);
      }
    });
  }

  test('relative dates', () => {
    assert.equal(parseExpense('Paid 2000 for groceries yesterday').date, daysAgo(1));
    assert.equal(parseExpense('3 days ago spent 200 on cab').date, daysAgo(3));
    assert.equal(parseExpense('chai 20').date, daysAgo(0));
  });

  test('empty input', () => {
    const parsed = parseExpense('');
    assert.equal(parsed.amount, null);
    assert.equal(parsed.category, 'other');
  });
});

describe('amount extraction (P0 #2)', () => {
  test('a leading quantity is not the price', () => {
    assert.equal(parseExpense('2 chairs 8000').amount, 8000);
    assert.equal(parseExpense('Spent 300 on 2 pizzas').amount, 300);
    assert.equal(parseExpense('dinner for 4 people 2400').amount, 2400);
  });

  test('the price can come after a larger quantity', () => {
    assert.equal(parseExpense('100 pens for 50').amount, 50);
  });

  test('digits in a date are not the price', () => {
    const parsed = parseExpense('15/06 dinner 800');
    assert.equal(parsed.amount, 800);
    assert.equal(parsed.item, 'dinner');
    assert.equal(parseExpense('2 day ago dinner 700').amount, 700);
  });

  test('a currency marker wins over position', () => {
    assert.equal(parseExpense('2 coffees ₹240').amount, 240);
  });

  test('digits inside a word are not a price', () => {
    assert.equal(parseExpense('mp3 player 900').amount, 900);
  });

  test('a lone number is still used even if it looks like a count', () => {
    assert.equal(parseExpense('500 lunch').amount, 500);
  });
});

describe('item extraction (P0 #4)', () => {
  test('filler that introduced a removed amount is dropped', () => {
    assert.equal(parseExpense('Bought a shirt for 2000 from Zara').item, 'shirt from Zara');
    assert.equal(parseExpense('Bought groceries for 850 at DMart').item, 'groceries at DMart');
  });

  test('quantities stay in the item', () => {
    assert.equal(parseExpense('2 chairs 8000').item, '2 chairs');
  });
});

describe('parseExpenses — multi-item (P0 #3)', () => {
  test('splits two priced items', () => {
    const items = parseExpenses('coffee 120 and sandwich 80');
    assert.equal(items.length, 2);
    assert.deepEqual(items.map((i) => [i.amount, i.item]), [[120, 'coffee'], [80, 'sandwich']]);
    assert.deepEqual(items.map((i) => i.raw), ['coffee 120', 'sandwich 80']);
  });

  test('splits on commas and plus', () => {
    assert.deepEqual(
      parseExpenses('rent 15000, electricity 1200, wifi 700').map((i) => i.amount),
      [15000, 1200, 700],
    );
    assert.deepEqual(parseExpenses('uber 250 + metro 40').map((i) => i.amount), [250, 40]);
  });

  test('a shared date applies to every item', () => {
    const items = parseExpenses('coffee 120 and sandwich 80 yesterday');
    assert.deepEqual(items.map((i) => i.date), [daysAgo(1), daysAgo(1)]);
  });

  test('a shared currency applies to every item', () => {
    assert.deepEqual(parseExpenses('coffee $5 and bagel 3').map((i) => i.currency), ['USD', 'USD']);
  });

  test('"and" between names does not split', () => {
    const items = parseExpenses('Movie 500 with Priya and Amit');
    assert.equal(items.length, 1);
    assert.deepEqual(items[0].people, ['Priya', 'Amit']);
  });

  test('names trailing the last item stay with it', () => {
    const items = parseExpenses('coffee 120 and sandwich 80 with Raj and Amit');
    assert.equal(items.length, 2);
    assert.deepEqual(items[1].people, ['Raj', 'Amit']);
  });

  test('comma grouping in a number is not a separator', () => {
    assert.equal(parseExpenses('1,500 on shopping').length, 1);
  });

  test('a count and a price is one item', () => {
    assert.equal(parseExpenses('Tickets 500 for 2').length, 1);
    assert.equal(parseExpenses('coffee 120 and 2 samosas').length, 1);
  });
});
