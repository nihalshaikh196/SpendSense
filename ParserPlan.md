# Parser Enhancement Plan

A phased plan to evolve SpendSense's expense parser from rule-based-only to a robust **rules + on-device NER** cascade, designed to remain free forever and work offline on mobile.

---

## Locked-In Decisions

| Decision | Choice |
|----------|--------|
| Mobile framework | **React Native + Expo** |
| NER model | **`Xenova/distilbert-base-NER`** (INT8 quantized → ~25MB) |
| Model delivery | **Bundle in app** (offline from first launch) |
| Test coverage target | **~100 sentence cases** (solid) |
| Parser API change | **Breaking change** — every field returns `{ value, confidence }` |
| Phase 1.4 vocabulary | **Partial** — typo fuzzy matching + 50-100 keyword additions, **skip** personalized learning |
| Phase 4 (BYOK Gemini) | **Dropped** — rules + NER is sufficient |
| Data migration (web → mobile) | **Use existing CSV export** in `SettingsPage.jsx` (no new work needed) |

---

## Strategic Approach

**Why rules + small NER (not a full LLM)?**

- ✅ Free forever (no API costs at any scale)
- ✅ Works offline (critical for mobile — restaurants, subway, flights)
- ✅ Privacy-first (nothing leaves the device)
- ✅ Mobile-friendly (~25MB bundled model, no platform AI APIs needed)
- ✅ Graceful degradation (rule-based always works; NER is bonus)
- ✅ Cross-platform (works on React Native via ONNX Runtime)

**Why React Native (not Flutter):**

- 70% code reuse from existing JS codebase (`parser.js`, `categories.js`, `currency.js` drop in unchanged)
- Zero learning curve — already know React
- `@react-native-firebase/*` is the gold-standard Firebase library
- ONNX Runtime performance is identical (both call same C++ runtime)
- Expo's tooling enables fastest iteration to first deployable build

---

## Mobile Stack

| Component | Choice | Notes |
|-----------|--------|-------|
| Framework | React Native + Expo | Managed workflow initially |
| Routing | Expo Router | File-based, similar to Next.js |
| Local DB | WatermelonDB or SQLite | Replaces IndexedDB |
| Sync | `@react-native-firebase/*` | Same Firestore schema as web |
| ML Runtime | `onnxruntime-react-native` | Official Microsoft package |
| NER Model | `Xenova/distilbert-base-NER` (INT8, ~25MB) | Bundled in app |
| Charts | Victory Native or react-native-gifted-charts | Replaces Chart.js |

---

## Phase 1: Strengthen the Rule-Based Parser

**Goal:** Get rule-based to 90%+ accuracy on common patterns. Build test infrastructure so future changes don't regress.

**Platform:** Current web codebase. No mobile work yet.

### 1.1 Build a real test suite ⭐ (foundational)

- Add **Vitest** as dev dependency (Vite-native, zero config)
- Create `src/lib/__tests__/parser.test.js` with **~100 sentence cases**
- Coverage matrix:
  - **Standard patterns (15):** `"Spent 300 on vadapav with wilson"`, etc.
  - **Inverted (10):** `"Had coffee with Raj for 150"`
  - **Multi-person (10):** `"Movie 500 with Priya and Amit"`, `"Dinner with Raj, Priya and me"`
  - **Date formats (20):** `today`, `yesterday`, `last monday`, `3 days ago`, `15th June`, `15/06`, `day before yesterday`, etc.
  - **Currencies (15):** all 4 currencies × keyword/symbol/code variations
  - **Edge cases (15):** empty, malformed, only amount, only item, very long sentences, special characters
  - **Number words (10):** `"fifty rupees"`, `"two hundred"`
  - **Approximate amounts (5):** `"around 500"`, `"about 100"`
  - **Known-fail cases:** documented as `.todo()` for tracking
- Add `npm run test` and `npm run test:watch` scripts
- Migrate logic from existing `test_parser.js` and **delete it**

### 1.2 Confidence scoring ⭐ (foundational — triggers Phase 3 NER fallback)

**Breaking API change.** Parser output changes from flat fields to `{ value, confidence }`:

```js
// Before
{ amount: 300, currency: 'INR', date: '2026-06-21', item: 'vadapav',
  people: ['Wilson'], category: 'food', raw: '...' }

// After
{
  amount:   { value: 300, confidence: 0.95 },
  currency: { value: 'INR', confidence: 1.0 },
  date:     { value: '2026-06-21', confidence: 0.9 },
  item:     { value: 'vadapav', confidence: 0.85 },
  people:   { value: ['Wilson'], confidence: 0.9 },
  category: { value: 'food', confidence: 0.95 },
  raw: '...',
  overallConfidence: 0.92
}
```

**Confidence factors:**
- **amount.confidence:** 1.0 if explicit currency keyword present, 0.9 if symbol, 0.7 if number-word, 0.5 if multiple amounts, 0 if missing
- **currency.confidence:** 1.0 if keyword/symbol matched, 0.5 if defaulted from settings
- **date.confidence:** 1.0 if explicit date matched, 0.5 if defaulted to today
- **item.confidence:** 0.9 if subtraction yielded clean text, 0.6 if very short or empty
- **people.confidence:** 0.9 if `with` pattern matched, 0.7 if start-of-sentence pattern, 0.0 if empty
- **category.confidence:** 1.0 if multi-word phrase matched, 0.9 if single keyword, 0.4 if defaulted to `other`
- **overallConfidence:** weighted average (amount weighted highest)

**Update consumers:**
- `src/pages/HomePage.jsx` — preview card shows uncertain fields with yellow border (`confidence < 0.7`)
- `src/context/ExpenseContext.jsx` — `addNewExpense` strips confidence wrapping before persisting (DB schema unchanged)
- Any tests depending on flat structure

**Phase 3 trigger threshold:** `overallConfidence < 0.7` will fire NER fallback.

### 1.3 Fix known parser weaknesses

- **People false positives:** `"Movie at PVR with Priya"` wrongly captures "PVR"
  - Only capture names after explicit `with` / start-of-sentence patterns
  - Exclude words after `at`, `from`, `to` (likely locations)
- **Multi-amount detection:** `"coffee 50 and croissant 80"`
  - Detect multiple amounts; mark as low-confidence (`amount.confidence: 0.5`)
  - Phase 3 NER can help disambiguate; for now, take first amount and flag for user review
- **Empty amount handling:** currently returns `null` silently
  - Set `amount.confidence: 0`, UI prompts user to enter amount
- **Number words:** `"fifty rupees"`, `"two hundred"`, `"twenty five"`
  - Word→number map covering 0-999 (one, two, ..., ninety-nine, one hundred, ...)
  - Compound parsing: `"two hundred fifty"` → 250
- **Approximate amounts:** `"around 500"`, `"about 100"`, `"roughly 200"`
  - Strip qualifier, set `amount.confidence: 0.7`

### 1.4 Vocabulary expansion (partial)

**Included:**
- Add 50-100 more category keywords:
  - International foods (sushi, taco, ramen, kebab, pho, sushi, falafel, etc.)
  - More brands (DoorDash, Grab, Lyft, Careem, Bolt, Deliveroo, etc.)
  - Indian-specific gaps (jio, airtel, vi, tatasky, etc.)
- Fuzzy matching for typos (Levenshtein distance ≤ 1):
  - `"cofee"` → `"coffee"`, `"ubr"` → `"uber"`, `"chia"` → `"chai"`
  - Only applied when no exact match found (performance)
  - Cap fuzzy candidates to ≤ 3 to avoid false matches

**Skipped (future consideration):**
- ❌ Personalized vocabulary learning from user history

**Estimated effort:** 1-2 weekends.

---

## Phase 2: Mobile Foundation (React Native + Expo)

**Goal:** Working mobile app with rule-based parser. NER comes in Phase 3.

### 2.1 Project setup

```bash
npx create-expo-app SpendSenseMobile --template blank
cd SpendSenseMobile
npx expo install expo-router @react-native-firebase/app @react-native-firebase/auth @react-native-firebase/firestore
```

- Set up Expo Router with file-based routing
- Match web routes: `/` (home), `/expenses`, `/dashboard`, `/settings`
- Configure Firebase via `@react-native-firebase/app`
  - Note: `@react-native-firebase` requires bare workflow or Expo Dev Client (not Expo Go)
- Set up bottom tab navigation matching the web `App.jsx` shell

### 2.2 Port `src/lib/` to mobile

**Direct port (zero changes):**
- `parser.js` — pure JS, regex-based
- `categories.js` — pure data + lookup logic
- `currency.js` — pure logic

**Replace:**
- `store.js` (IndexedDB) → **WatermelonDB** (reactive, works well with React)
  - Same expense schema: `{ id, amount, currency, date, item, people, category, raw, createdAt, synced }`
  - WatermelonDB `Model` class wrapping the schema
  - Same public API: `addExpense`, `getExpenses`, `updateExpense`, `deleteExpense`, `getStats`

**Adapt:**
- `services/sync.js` — switch Firestore imports from `firebase/firestore` to `@react-native-firebase/firestore`
- `services/firebase.js` — RN-specific Firebase initialization

### 2.3 Port React contexts

- `AuthContext.jsx` — switch from `firebase/auth` to `@react-native-firebase/auth`; replace `localStorage` with `@react-native-async-storage/async-storage`
- `SettingsContext.jsx` — replace `localStorage` with `AsyncStorage`
- `ExpenseContext.jsx` — direct port; only the underlying store import changes

### 2.4 UI parity

- Recreate four screens using React Native components
- Charts: **Victory Native** (closest to Chart.js API) or **react-native-gifted-charts**
- Match design system: dark theme, glassmorphism cards (use `expo-blur` for `backdrop-filter` equivalent)
- Use platform-native components for native feel

### 2.5 Data migration path

- Existing **Firestore-synced users:** sign in on mobile with same Google account → data syncs down automatically
- Existing **local-only web users:** export CSV from web Settings page (already implemented in `SettingsPage.jsx`), then import on mobile
- Add **CSV import** in mobile Settings page (parses the same format the web export produces)

**Estimated effort:** 2-4 weeks.

---

## Phase 3: On-Device NER Fallback

**Goal:** When rule-based parser has low confidence (`overallConfidence < 0.7`), use the NER model. Free, offline, private.

### 3.1 Model preparation

- Source: `Xenova/distilbert-base-NER` from Hugging Face
- Already in ONNX format (Xenova models are pre-converted)
- Apply INT8 dynamic quantization to reduce ~65MB → ~25MB:
  ```python
  from onnxruntime.quantization import quantize_dynamic, QuantType
  quantize_dynamic("model.onnx", "model_quantized.onnx", weight_type=QuantType.QInt8)
  ```
- Validate accuracy on 50 expense-like sentences before bundling
- Bundle the quantized `.onnx` file in the app's assets folder
- Bundle BERT WordPiece tokenizer vocab (`vocab.txt` from the model repo, ~250KB)

### 3.2 Runtime integration

- Add `onnxruntime-react-native` dependency
- Implement BERT tokenizer in JS (or use `@xenova/transformers` if RN-compatible build exists)
- Create `src/lib/ner.js` with clean API:

```js
// One-time initialization on app start
await initNER();

// Called when rule-based parser has low confidence
const entities = await extractEntities("Spent 300 with Wilson at Starbucks");
// → { people: [{ name: 'Wilson', confidence: 0.98 }],
//     locations: [{ name: 'Starbucks', confidence: 0.92 }],
//     orgs: [] }
```

### 3.3 Cascade logic

```
parseExpense(sentence)              [rule-based, instant]
  ↓
overallConfidence ≥ 0.7?
  YES → return rule-based result
  NO  → run NER model (~50-100ms)
        ↓
        Merge entities:
          NER PERSON entities → people field (overrides rule-based people)
          NER ORG/LOC entities → keep in item, exclude from people
        ↓
        Re-detect category with refined item
        ↓
        Boost overallConfidence based on NER agreement
        ↓
        Return merged result
```

### 3.4 Performance budget

- **Model load:** lazy on first use, ~200-500ms (one-time, cached after)
- **Per-inference:** ~50-100ms on mid-range phones
- **UX rule:** NER runs only on submit/blur, **never on keystroke**
- Live preview-as-you-type stays rule-based-only for snappy UX

### 3.5 Graceful degradation

- If model fails to load (low memory, corrupt download, unsupported device): silently fall back to rule-based only
- Never block the user's ability to add an expense
- Log failures to console for debugging; don't surface in UI
- Add a Settings toggle: "Use AI to improve parsing" (default ON, lets users disable if needed)

**Estimated effort:** 1-2 weeks.

---

## Recommended Execution Order

1. **Now (Phase 1):** Tests, confidence scoring, weakness fixes, vocabulary on web. Foundational and immediately useful.
2. **Next (Phase 2):** RN + Expo project, port lib/ and contexts, ship MVP mobile app with rule-based parser only.
3. **Then (Phase 3):** Add DistilBERT NER fallback once mobile app is stable.

---

## Out of Scope (Explicitly Not Doing)

- ❌ Running large LLMs (3B+) on-device — too heavy for mobile
- ❌ Backend AI service — defeats "free forever" goal
- ❌ Chrome Built-in AI / WebLLM — incompatible with mobile WebView
- ❌ Cloud LLM fallback (BYOK Gemini) — dropped from plan
- ❌ Personalized vocabulary learning — Phase 5+ consideration
- ❌ Recurring expense patterns ("rent every month") — Phase 5+ feature
- ❌ Voice input / speech-to-text — separate concern
- ❌ Multi-language / Hinglish support — future consideration if needed
