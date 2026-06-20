# 💸 Expense Tracking App — Phase 1 Implementation Plan

## Firebase Setup Instructions (To be done together)

> [!IMPORTANT]
> Since no Firebase project exists yet, we will follow these steps:
> 1. You will create a new project at [console.firebase.google.com](https://console.firebase.google.com).
> 2. Enable **Firestore Database** (in Test Mode or with proper security rules).
> 3. Enable **Authentication** and add the **Google** sign-in provider.
> 4. Register a web app in Firebase and grab the `firebaseConfig` object.
> 5. We will paste that config into `src/services/firebase.js` to connect the app.

---

## Decisions Locked In

| Decision | Choice |
|----------|--------|
| Platform | **React Web app** (mobile-first responsive) |
| Storage | **Local-first (IndexedDB) + Firebase Firestore sync** |
| Auth | **Google Authentication via Firebase** |
| Splitting | Phase 2 — just track who was present for now |
| Currency | **Multi-currency**, default ₹ (INR), configurable in Settings |
| NLP | Rule-based parser (free, offline, instant) |

---

## App Structure Overview

```
ExpenseTrackingApp/
├── index.html              # Entry point, SPA shell
├── css/
│   └── styles.css          # Design system + all styles
├── js/
│   ├── app.js              # App init, routing, page management
│   ├── parser.js           # NLP sentence parser
│   ├── store.js            # IndexedDB local storage layer
│   ├── firebase-config.js  # Firebase init + Firestore sync
│   ├── currency.js         # Currency definitions & formatting
│   ├── categories.js       # Auto-category detection
│   └── ui/
│       ├── home.js         # Home page (input + recent expenses)
│       ├── dashboard.js    # Dashboard page (totals + charts)
│       └── settings.js     # Settings page (currency, name)
├── assets/
│   └── icons/              # App icons (PWA-ready)
├── firebase.json           # Firebase hosting config
├── firestore.rules         # Firestore security rules
└── package.json
```

---

## Proposed Changes

### NLP Parser Engine

#### [NEW] [parser.js](file:///Users/nihalshaikh/Documents/Projects/ExpenseTrackingApp/js/parser.js)
The core brain of the app. Takes a natural sentence and returns a structured expense object.

**Input/Output contract:**
```js
parse("Spent 300 rupees today on vadapav with wilson")
// Returns:
{
  amount: 300,
  currency: "INR",        // from user's default setting
  date: "2026-06-20",     // resolved "today"
  item: "vadapav",        // what was the spend on
  people: ["wilson"],     // who was involved
  category: "food",       // auto-detected from item
  raw: "Spent 300 rupees today on vadapav with wilson"
}
```

**Patterns to handle:**
| Pattern | Example |
|---------|---------|
| Standard | `"Spent 300 on vadapav with wilson"` |
| Amount first | `"300 rupees on coffee with Raj"` |
| Inverted | `"Had coffee with Raj for 150"` |
| Multi-person | `"Movie 500 with Priya and Amit"` |
| With date | `"Paid 2000 for groceries yesterday"` |
| Absolute date | `"Lunch 400 on 15th June with team"` |
| Currency explicit | `"Spent 50 dollars on souvenirs"` |
| Minimal | `"chai 20"` (just item + amount) |

**Date resolution logic:**
- `today` → current date
- `yesterday` → current date - 1
- `last monday/tuesday/...` → most recent past occurrence
- `3 days ago` → current date - 3
- `15th June` / `June 15` / `15/06` → absolute date
- No date mentioned → defaults to today

---

### Currency System

#### [NEW] [currency.js](file:///Users/nihalshaikh/Documents/Projects/ExpenseTrackingApp/js/currency.js)
Manages currency definitions, formatting, and keyword detection.

**Supported currencies (Phase 1):**
| Currency | Symbol | Keywords detected in sentences |
|----------|--------|-------------------------------|
| INR (default) | ₹ | `rupees`, `rs`, `inr`, `₹` |
| USD | $ | `dollars`, `usd`, `$` |
| EUR | € | `euros`, `eur`, `€` |
| GBP | £ | `pounds`, `gbp`, `£` |

- If no currency keyword found in sentence → uses default from settings
- `formatAmount(300, "INR")` → `"₹300"`

---

### Category Auto-Detection

#### [NEW] [categories.js](file:///Users/nihalshaikh/Documents/Projects/ExpenseTrackingApp/js/categories.js)
Maps items/keywords to categories using a lookup dictionary.

| Category | Keywords |
|----------|----------|
| 🍔 Food | vadapav, chai, coffee, lunch, dinner, biryani, pizza, restaurant, snacks, breakfast... |
| 🚗 Transport | uber, ola, auto, rickshaw, petrol, bus, train, metro, parking, toll... |
| 🛒 Shopping | clothes, shoes, amazon, flipkart, mall, groceries... |
| 🎬 Entertainment | movie, netflix, tickets, games, concert, popcorn... |
| 💊 Health | medicine, doctor, pharmacy, gym, hospital... |
| 📱 Bills | recharge, electricity, wifi, rent, emi, insurance... |
| 📦 Other | anything that doesn't match above |

---

### Data Storage Layer

#### [NEW] [store.js](file:///Users/nihalshaikh/Documents/Projects/ExpenseTrackingApp/js/store.js)
Local-first storage using **IndexedDB** (via a thin wrapper) with a sync queue for Firebase.

**Expense schema:**
```js
{
  id: "uuid-v4",
  amount: 300,
  currency: "INR",
  date: "2026-06-20",
  item: "vadapav",
  people: ["wilson"],
  category: "food",
  raw: "Spent 300 rupees today on vadapav with wilson",
  createdAt: 1750447200000,  // timestamp
  synced: false              // sync status for Firebase
}
```

**Operations:**
- `addExpense(expense)` → saves locally, queues for sync
- `getExpenses(filters?)` → retrieves from IndexedDB
- `updateExpense(id, updates)` → updates locally + queues sync
- `deleteExpense(id)` → soft delete locally + queues sync
- `getStats(period)` → computes totals for today/week/month

---

### Firebase Integration & Authentication

#### [NEW] [src/services/firebase.js](file:///Users/nihalshaikh/Documents/Projects/ExpenseTrackingApp/src/services/firebase.js)
Firebase Firestore and Auth setup for cloud sync and user identity. 

**Authentication Strategy:**
1. **Google Sign-In**: Users get a Google Login prompt when they first open the app, but they can skip it to use the app locally.
2. If skipped, the app functions purely offline via IndexedDB.

**Sync strategy: Local-first with background push**
1. Every write goes to IndexedDB **first** (instant, offline-capable).
2. If the user logs in, the app instantly syncs any existing local data to their Firebase collection.
3. A background sync process pushes unsynced records to Firestore. A cloud sync icon will be displayed in the top right corner indicating sync status.
4. On app load (and upon login), pull any remote changes not yet local from the user's collection.
5. Conflict resolution: last-write-wins by `updatedAt` / `createdAt` timestamp.

**Firestore Data Model:**
Data will be stored in a subcollection under each user to ensure strict isolation:
`/users/{userId}/expenses/{expenseId}`

#### [NEW] [firestore.rules](file:///Users/nihalshaikh/Documents/Projects/ExpenseTrackingApp/firestore.rules)
Security rules ensuring users can only read/write their own data.
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/expenses/{document=**} {
      // Only the authenticated user can read or write their own expenses
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

### UI Pages

#### [NEW] [index.html](file:///Users/nihalshaikh/Documents/Projects/ExpenseTrackingApp/index.html)
Single Page App shell with:
- Bottom navigation bar (Home | Dashboard | Settings)
- Page container for SPA routing
- Mobile-first viewport meta tags
- Google Fonts (Inter) loaded

#### [NEW] [styles.css](file:///Users/nihalshaikh/Documents/Projects/ExpenseTrackingApp/css/styles.css)
Complete design system:
- **Dark theme** with accent gradients (deep navy → violet)
- CSS custom properties for all tokens (colors, spacing, radius, shadows)
- Glassmorphism cards with backdrop-filter
- Smooth micro-animations on interactions
- Mobile-first responsive breakpoints
- Bottom nav bar styled like a native app

---

#### [NEW] [home.js](file:///Users/nihalshaikh/Documents/Projects/ExpenseTrackingApp/js/ui/home.js) — Home Page

The main screen. Contains:

0. **Header / Auth Banner**
   - Cloud sync icon in the top right corner (indicates background sync status).
   - If user skipped login, a thin banner at the top asks them to "Login to sync in the cloud".

1. **Hero Input Area**
   - Large, inviting text input: *"What did you spend on?"*
   - As user types, a **live preview card** below shows parsed result
   - Preview shows: amount, date, item, people, category (all editable inline)
   - "Add Expense" button to confirm

2. **Recent Expenses**
   - Scrollable list of last 10 expenses
   - Each card shows: emoji category icon, item, amount, date, people tags
   - Swipe to delete (or delete button)
   - Tap to edit

---

#### [NEW] [dashboard.js](file:///Users/nihalshaikh/Documents/Projects/ExpenseTrackingApp/js/ui/dashboard.js) — Dashboard Page

Expense analytics at a glance:

1. **Summary Cards Row**
   - Today's total | This week | This month (animated counters)

2. **Category Breakdown**
   - Donut chart (Chart.js) showing spend per category
   - Tappable segments to see expenses in that category

3. **People Spending** (simple list)
   - Who you've spent the most with
   - Total amount per person

4. **Daily Trend**
   - Bar chart of daily spending for the current month

---

#### [NEW] [settings.js](file:///Users/nihalshaikh/Documents/Projects/ExpenseTrackingApp/js/ui/settings.js) — Settings Page

1. **Default Currency**
   - Dropdown to select: INR, USD, EUR, GBP
   - Persisted in localStorage

2. **Your Name**
   - Used to exclude yourself from the "with" list if mentioned

3. **Data Management**
   - Export all expenses as CSV
   - Clear local data

4. **About**
   - App version, credits

---

### App Router

#### [NEW] [app.js](file:///Users/nihalshaikh/Documents/Projects/ExpenseTrackingApp/js/app.js)
Simple hash-based SPA router (`#/home`, `#/dashboard`, `#/settings`).
- Initializes IndexedDB store
- Initializes Firebase (lazy, non-blocking)
- Manages page transitions with fade animations
- Handles bottom nav active states

---

## Verification Plan

### Automated Tests
```bash
# We'll create a parser test file that validates all sentence patterns
node js/parser.test.js
```

### Manual Verification
- **NLP Parser**: Test with 20+ varied sentences, verify preview card shows correct extraction
- **CRUD**: Add, edit, delete expenses — verify persistence across page refreshes
- **Dashboard**: Verify totals, charts update in real-time after adding expenses
- **Settings**: Change currency → new expenses use new default → old expenses unaffected
- **Responsive**: Test on mobile viewport (375px) and desktop (1440px)
- **Offline**: Disconnect network → add expenses → reconnect → verify sync to Firestore
- **Performance**: Parsing should feel instant (< 50ms), page transitions smooth (60fps)
