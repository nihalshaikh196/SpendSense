import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectCategory, getCategoryLabel } from '../src/lib/categories.js';

const CASES = {
  food: [
    'vadapav', 'chai', 'coffee', 'lunch with team', 'biryani', 'pizza', 'ice cream',
    'pav bhaji', 'swiggy order', 'sandwiches', 'burgers', 'eggs',
  ],
  transport: ['uber', 'ola ride', 'petrol', 'metro card', 'flight to goa', 'tyres', 'parking'],
  shopping: [
    'groceries', 'shoes', 'amazon order', 'table', 'tables', 'chairs', 'coffee table',
    'dining table', 'washing machine',
  ],
  entertainment: ['netflix', 'movie', 'watch movie', 'movie tickets', 'concert tickets', 'bowling'],
  health: ['medicine', 'doctor visit', 'gym', 'blood test', 'dental checkup'],
  bills: ['electricity', 'rent', 'wifi', 'gas cylinder', 'phone bill', 'water bill', 'emi'],
  education: ['books', 'school fees', 'udemy course', 'stationery'],
  personal: ['haircut', 'salon', 'laundry', 'perfume'],
  other: ['something random', ''],
};

for (const [category, inputs] of Object.entries(CASES)) {
  for (const input of inputs) {
    test(`"${input}" → ${category}`, () => {
      assert.equal(detectCategory(input), category);
    });
  }
}

test('unknown category keys get a title-cased label', () => {
  assert.equal(getCategoryLabel('food'), 'Food');
  assert.equal(getCategoryLabel('xyz'), 'Xyz');
  assert.equal(getCategoryLabel(undefined), 'Other');
});
