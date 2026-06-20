/**
 * @module store
 * @description IndexedDB storage layer for expense records. Provides CRUD
 * operations, filtering, and aggregation stats using native IndexedDB API
 * wrapped in Promises.
 */

import { v4 as uuidv4 } from 'uuid';

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = 'ExpenseTrackerDB';
const DB_VERSION = 1;
const STORE_NAME = 'expenses';

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
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;

      // Handle connection closing unexpectedly (e.g. version upgrade from another tab)
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
      };

      resolve(dbInstance);
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
 * Deletes an expense from the database.
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
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  // Verify the expense exists before deleting
  const existing = await promisifyRequest(store.get(id));
  if (!existing) {
    throw new Error(`Expense not found: ${id}`);
  }

  store.delete(id);
  await promisifyTransaction(tx);
}

// ─── Stats / Aggregation ─────────────────────────────────────────────────────

/**
 * Computes aggregated statistics for a given time period.
 *
 * @param {'today'|'week'|'month'} period - The period to aggregate over
 * @returns {Promise<{
 *   total: number,
 *   count: number,
 *   byCategory: Record<string, number>
 * }>} Aggregated stats
 *
 * @example
 * const stats = await getStats('week');
 * // → { total: 2500, count: 8, byCategory: { food: 1200, transport: 500, ... } }
 */
export async function getStats(period = 'month') {
  const today = new Date();
  let startDate;

  switch (period) {
    case 'today':
      startDate = toDateString(today);
      break;

    case 'week': {
      const weekStart = new Date(today);
      const dayOfWeek = weekStart.getDay();
      // Start from Monday (adjust for Sunday = 0)
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      weekStart.setDate(weekStart.getDate() - diff);
      startDate = toDateString(weekStart);
      break;
    }

    case 'month':
    default: {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      startDate = toDateString(monthStart);
      break;
    }
  }

  const endDate = toDateString(today);

  const expenses = await getExpenses({ startDate, endDate });

  const stats = {
    total: 0,
    count: expenses.length,
    byCategory: {},
  };

  for (const expense of expenses) {
    const amount = expense.amount || 0;
    stats.total += amount;

    const cat = expense.category || 'other';
    stats.byCategory[cat] = (stats.byCategory[cat] || 0) + amount;
  }

  // Round to 2 decimal places to avoid floating-point drift
  stats.total = Math.round(stats.total * 100) / 100;
  for (const cat of Object.keys(stats.byCategory)) {
    stats.byCategory[cat] = Math.round(stats.byCategory[cat] * 100) / 100;
  }

  return stats;
}
