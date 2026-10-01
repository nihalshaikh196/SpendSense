/**
 * @module investmentStore
 * @description IndexedDB access for the investments section: holdings,
 * their transactions, and goals. One generic set of operations serves all
 * three stores; deletions leave a tombstone (tagged with its collection) so
 * the next sync can replay them remotely.
 */

import { v4 as uuidv4 } from 'uuid';
import { initDB, INVESTMENT_STORES, INVESTMENT_TOMBSTONES } from './store.js';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

function storeName(collection) {
  const name = INVESTMENT_STORES[collection];
  if (!name) throw new Error(`Unknown investment collection: ${collection}`);
  return name;
}

/** @returns {Promise<Object[]>} every record in the collection */
export async function getAllRecords(collection) {
  const db = await initDB();
  const tx = db.transaction(storeName(collection), 'readonly');
  return requestResult(tx.objectStore(storeName(collection)).getAll());
}

/**
 * Inserts a new record, or replaces one with the same id. New records get an
 * id and createdAt; every write stamps updatedAt and starts unsynced unless
 * the caller says otherwise (a pull from Firestore does).
 */
export async function putRecord(collection, record) {
  const now = Date.now();
  const full = {
    ...record,
    id: record.id || uuidv4(),
    createdAt: record.createdAt || now,
    updatedAt: record.synced ? record.updatedAt || now : now,
    synced: Boolean(record.synced),
  };
  const db = await initDB();
  const tx = db.transaction(storeName(collection), 'readwrite');
  tx.objectStore(storeName(collection)).put(full);
  await done(tx);
  return full;
}

/** Merges `updates` into an existing record; id and createdAt can't change. */
export async function updateRecord(collection, id, updates) {
  const db = await initDB();
  const tx = db.transaction(storeName(collection), 'readwrite');
  const store = tx.objectStore(storeName(collection));
  const existing = await requestResult(store.get(id));
  if (!existing) throw new Error(`Record not found: ${id}`);

  const updated = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: updates.synced ? existing.updatedAt : Date.now(),
  };
  store.put(updated);
  await done(tx);
  return updated;
}

/**
 * Deletes records and leaves a tombstone for each, in one transaction, so a
 * crash can't remove the record without also queuing the remote delete.
 */
export async function deleteRecords(collection, ids) {
  if (!ids.length) return;
  const db = await initDB();
  const tx = db.transaction([storeName(collection), INVESTMENT_TOMBSTONES], 'readwrite');
  const store = tx.objectStore(storeName(collection));
  const tombstones = tx.objectStore(INVESTMENT_TOMBSTONES);
  const deletedAt = Date.now();
  for (const id of ids) {
    store.delete(id);
    tombstones.put({ id, collection, deletedAt });
  }
  await done(tx);
}

/** Removes a record that's already gone remotely — no tombstone needed. */
export async function deleteRecordLocal(collection, id) {
  const db = await initDB();
  const tx = db.transaction(storeName(collection), 'readwrite');
  tx.objectStore(storeName(collection)).delete(id);
  await done(tx);
}

/** @returns {Promise<Array<{ id: string, collection: string, deletedAt: number }>>} */
export async function getInvestmentTombstones() {
  const db = await initDB();
  const tx = db.transaction(INVESTMENT_TOMBSTONES, 'readonly');
  return requestResult(tx.objectStore(INVESTMENT_TOMBSTONES).getAll());
}

export async function clearInvestmentTombstones(ids) {
  if (!ids?.length) return;
  const db = await initDB();
  const tx = db.transaction(INVESTMENT_TOMBSTONES, 'readwrite');
  const store = tx.objectStore(INVESTMENT_TOMBSTONES);
  for (const id of ids) store.delete(id);
  await done(tx);
}
