# SpendSense
Personal Expense Tracker

This project provides a simple, efficient expense tracking application that prioritizes ease of use through natural language processing (NLP). Built with React + Vite.

Live at https://spendsensein.web.app

## Features

- **Plain-language entry** — "chai 20", "uber 250 to airport yesterday", "coffee 120 and sandwich 80" (two expenses)
- **Monthly and yearly reports** on the Dashboard: totals vs the previous period, daily/monthly trend, running total vs budget, category and item breakdowns, recurring vs everyday spending
- **CSV export** — a summary report or every expense for any month or year, plus a full export in Settings
- **Search and filters** on the Expenses page; every dashboard figure links through to the expenses behind it
- **Investments, kept apart from spending** — stocks, mutual funds and SIPs, FD/RD, PPF, EPF, NPS, bonds,
  gold, real estate, crypto. Track money in and out, dividends and values; see gain, return % and XIRR;
  get reminders for due SIPs, maturities, lock-ins and stale values; allocation by asset class, platform
  and goal; goals with progress and the monthly amount needed. Typing "added 180 in zerodha" on Home
  offers to file it as an investment instead of an expense.
- **Works without an account**; sign in with Google to back up and sync across devices

## Development

Copy `.env.example` to `.env` and fill in your Firebase project's web app settings.
Deploying also needs your own `firebase.json` and `.firebaserc`, which aren't part of this repo.

```bash
npm install
npm run dev          # local dev server
npm test             # parser, analytics and CSV tests (node:test, no extra packages)
npm run lint
npm run deploy       # build + deploy hosting
```

## Notes

- Budgets are saved per device and are not synced. Investments and goals are synced when you sign in.
- Investment values are entered by you (or computed from an interest rate); nothing connects to a broker
  or fetches market prices, and nothing here is investment advice — a goal's "expected return" is your
  own assumption.
