/**
 * @module store
 * @description IndexedDB storage layer for expense records. Provides CRUD
 * operations and filtering using native IndexedDB API wrapped in Promises.
 * Aggregation lives in `analytics.js` and runs on the in-memory list.
 */

import { v4 as uuidv4 } from 'uuid';

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = 'ExpenseTrackerDB';
const DB_VERSION = 3;
const STORE_NAME = 'expenses';
const TOMBSTONE_STORE = 'tombstones';

/**
 * v3: the investments section. Kept in their own stores — with their own
 * tombstone store — so expense sync never sees or clears investment
 * deletions. Accessed through investmentStore.js.
 */
export const INVESTMENT_STORES = Object.freeze({
  holdings: 'holdings',
  investmentTxns: 'investmentTxns',
  goals: 'goals',
});
export const INVESTMENT_TOMBSTONES = 'investmentTombstones';

/**
 * Cached database connection. Reused across calls to avoid
 * repeatedly opening the database.
 * @type {IDBDatabase|null}
 */
let dbInstance = null;

// ─── Database Initialization ──────────────────────────────────────────────────

/**
 * Opens (or creates) the IndexedDB database and sets up the object store
 * with the required indexes. Returns a cached connection on subsequent calls.
 *
 * Object store: 'expenses'
 *   - keyPath: 'id'
 *   - Indexes: 'date', 'category', 'createdAt'
 *
 * @returns {Promise<IDBDatabase>} The opened database instance
 * @throws {Error} If IndexedDB is not available or the database cannot be opened
 *
 * @example
 * const db = await initDB();
 */
export async function initDB() {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error?.message || 'Unknown error'}`));
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create the expenses object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

        // Create indexes for efficient querying
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // v2: records deleted while offline, so the next sync can delete them
      // remotely instead of the next pull resurrecting them.
      if (!db.objectStoreNames.contains(TOMBSTONE_STORE)) {
        db.createObjectStore(TOMBSTONE_STORE, { keyPath: 'id' });
      }

      // v3: investments. Adding stores leaves existing expense data intact.
      for (const name of Object.values(INVESTMENT_STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
      if (!db.objectStoreNames.contains(INVESTMENT_TOMBSTONES)) {
        db.createObjectStore(INVESTMENT_TOMBSTONES, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      dbInstance = db;

      // Another tab opening a newer version (an app update) needs this
      // connection closed or its upgrade stays blocked. Close *this*
      // connection — the shared variable may already be null or newer.
      db.onclose = () => {
        if (dbInstance === db) dbInstance = null;
      };
      db.onversionchange = () => {
        db.close();
        if (dbInstance === db) dbInstance = null;
      };

      resolve(db);
    };
  });
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Opens a transaction and returns the object store.
 * @param {'readonly'|'readwrite'} mode
 * @returns {Promise<IDBObjectStore>}
 */
async function getStore(mode = 'readonly') {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, mode);
  return tx.objectStore(STORE_NAME);
}

/**
 * Wraps an IDBRequest in a Promise.
 * @param {IDBRequest} request
 * @returns {Promise<*>}
 */
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Wraps an IDBTransaction's completion in a Promise.
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
function promisifyTransaction(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

/**
 * Formats a Date as YYYY-MM-DD.
 * @param {Date} date
 * @returns {string}
 */
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── CRUD Operations ─────────────────────────────────────────────────────────

/**
 * Adds a new expense to the database. Automatically generates an id,
 * createdAt timestamp, and sets synced to false.
 *
 * @param {Object} expense - Partial expense data from the parser
 * @param {number} expense.amount   - Expense amount
 * @param {string} expense.currency - Currency code
 * @param {string} expense.date     - Date string (YYYY-MM-DD)
 * @param {string} expense.item     - Item description
 * @param {string[]} expense.people - List of people involved
 * @param {string} expense.category - Category key
 * @param {string} expense.raw      - Original raw input
 * @returns {Promise<Object>} The complete expense object with id, createdAt, synced
 *
 * @example
 * const expense = await addExpense({
 *   amount: 300, currency: 'INR', date: '2026-06-20',
 *   item: 'vadapav', people: ['Wilson'], category: 'food',
 *   raw: 'Spent 300 on vadapav with wilson'
 * });
 * console.log(expense.id); // → 'a1b2c3d4-...'
 */
export async function addExpense(expense) {
  const fullExpense = {
    id: expense.id || uuidv4(),
    amount: expense.amount ?? 0,
    currency: expense.currency || 'INR',
    date: expense.date || toDateString(new Date()),
    item: expense.item || '',
    people: Array.isArray(expense.people) ? [...expense.people] : [],
    category: expense.category || 'other',
    raw: expense.raw || '',
    createdAt: expense.createdAt || Date.now(),
    synced: expense.synced || false,
  };

  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  store.add(fullExpense);
  await promisifyTransaction(tx);

  return fullExpense;
}

/**
 * Retrieves expenses from the database with optional filtering.
 * Results are sorted by date DESC, then createdAt DESC.
 *
 * @param {Object} [filters]            - Optional filter criteria
 * @param {string} [filters.startDate]  - Start date inclusive (YYYY-MM-DD)
 * @param {string} [filters.endDate]    - End date inclusive (YYYY-MM-DD)
 * @param {string} [filters.category]   - Category key to filter by
 * @returns {Promise<Object[]>} Array of expense objects, sorted by date DESC
 *
 * @example
 * // Get all expenses
 * const all = await getExpenses();
 *
 * // Get food expenses from this month
 * const food = await getExpenses({
 *   startDate: '2026-06-01',
 *   endDate: '2026-06-30',
 *   category: 'food'
 * });
 */
export async function getExpenses(filters = {}) {
  const store = await getStore('readonly');
  const request = store.getAll();
  let expenses = await promisifyRequest(request);

  // Apply filters
  const { startDate, endDate, category } = filters;

  if (startDate) {
    expenses = expenses.filter((e) => e.date >= startDate);
  }
  if (endDate) {
    expenses = expenses.filter((e) => e.date <= endDate);
  }
  if (category) {
    expenses = expenses.filter((e) => e.category === category);
  }

  // Sort: date DESC, then createdAt DESC
  expenses.sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return b.createdAt - a.createdAt;
  });

  return expenses;
}

/**
 * Retrieves a single expense by its ID.
 *
 * @param {string} id - The expense UUID
 * @returns {Promise<Object|undefined>} The expense object, or undefined if not found
 *
 * @example
 * const expense = await getExpenseById('a1b2c3d4-...');
 */
export async function getExpenseById(id) {
  if (!id) {
    return undefined;
  }

  const store = await getStore('readonly');
  const request = store.get(id);
  return promisifyRequest(request);
}

/**
 * Updates an existing expense by merging the provided updates.
 * The `id` and `createdAt` fields cannot be changed.
 *
 * @param {string} id      - The expense UUID to update
 * @param {Object} updates - Partial object with fields to update
 * @returns {Promise<Object>} The updated expense object
 * @throws {Error} If the expense is not found
 *
 * @example
 * const updated = await updateExpense('a1b2c3d4-...', {
 *   amount: 350,
 *   item: 'vadapav combo'
 * });
 */
export async function updateExpense(id, updates) {
  if (!id) {
    throw new Error('Expense ID is required for update');
  }

  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const existing = await promisifyRequest(store.get(id));

  if (!existing) {
    throw new Error(`Expense not found: ${id}`);
  }

  // Merge updates, but protect immutable fields
  const updated = {
    ...existing,
    ...updates,
    id: existing.id,           // Immutable
    createdAt: existing.createdAt, // Immutable
  };

  // Ensure people is always an array
  if (updates.people) {
    updated.people = Array.isArray(updates.people) ? [...updates.people] : [];
  }

  store.put(updated);
  await promisifyTransaction(tx);

  return updated;
}

/**
 * Deletes an expense from the database and records a tombstone so the
 * deletion can be replayed against Firestore on the next sync.
 *
 * @param {string} id - The expense UUID to delete
 * @returns {Promise<void>}
 * @throws {Error} If the expense is not found
 *
 * @example
 * await deleteExpense('a1b2c3d4-...');
 */
export async function deleteExpense(id) {
  if (!id) {
    throw new Error('Expense ID is required for deletion');
  }

  const db = await initDB();
  const tx = db.transaction([STORE_NAME, TOMBSTONE_STORE], 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  // Verify the expense exists before deleting
  const existing = await promisifyRequest(store.get(id));
  if (!existing) {
    throw new Error(`Expense not found: ${id}`);
  }

  store.delete(id);
  tx.objectStore(TOMBSTONE_STORE).put({ id, deletedAt: Date.now() });
  await promisifyTransaction(tx);
}

/**
 * Removes an expense locally without recording a tombstone. Used when the
 * pull already knows the record is gone remotely — writing a tombstone there
 * would push a redundant delete back to a document that no longer exists.
 *
 * @param {string} id - The expense UUID to remove
 * @returns {Promise<void>}
 */
export async function deleteExpenseLocal(id) {
  if (!id) return;

  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  await promisifyTransaction(tx);
}

/**
 * Deletes every expense, recording a tombstone for each so the wipe
 * propagates to Firestore on the next sync instead of being undone by it.
 *
 * @returns {Promise<number>} How many expenses were removed
 */
export async function clearAllExpenses() {
  const db = await initDB();
  const tx = db.transaction([STORE_NAME, TOMBSTONE_STORE], 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const tombstones = tx.objectStore(TOMBSTONE_STORE);

  const ids = await promisifyRequest(store.getAllKeys());
  const deletedAt = Date.now();
  for (const id of ids) {
    tombstones.put({ id, deletedAt });
  }
  store.clear();

  await promisifyTransaction(tx);
  return ids.length;
}

// ─── Tombstones ──────────────────────────────────────────────────────────────

/**
 * Returns all pending deletion tombstones.
 * @returns {Promise<Array<{ id: string, deletedAt: number }>>}
 */
export async function getTombstones() {
  const db = await initDB();
  const tx = db.transaction(TOMBSTONE_STORE, 'readonly');
  return promisifyRequest(tx.objectStore(TOMBSTONE_STORE).getAll());
}

/**
 * Clears tombstones whose deletions have been applied remotely.
 * @param {string[]} ids
 * @returns {Promise<void>}
 */
export async function clearTombstones(ids) {
  if (!ids?.length) return;

  const db = await initDB();
  const tx = db.transaction(TOMBSTONE_STORE, 'readwrite');
  const store = tx.objectStore(TOMBSTONE_STORE);
  for (const id of ids) {
    store.delete(id);
  }
  await promisifyTransaction(tx);
}
