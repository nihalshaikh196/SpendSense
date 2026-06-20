import { parseExpense } from './src/lib/parser.js';

const tests = [
  "Wilson and I went for coffee 500",
  "Coffee with Raj, Amit and Priya 300",
  "Raj and Amit had lunch 600",
  "Spent 500rs on groceries with Alice and Bob",
  "Team lunch 1500",
  "Family dinner 2000 bucks"
];

tests.forEach(t => {
  console.log("Input:", t);
  console.log("Parsed:", parseExpense(t));
  console.log("---");
});
