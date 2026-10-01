/**
 * Firestore sync for the investments section. Same reconciliation rules as
 * expenses (see sync.js): push offline deletions and unsynced records first,
 * then pull; the remote is authoritative for records already marked synced,
 * and unsynced local records are never overwritten.
 */

import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import {
  getAllRecords,
  putRecord,
  updateRecord,
  deleteRecordLocal,
  getInvestmentTombstones,
  clearInvestmentTombstones,
} from '../lib/investmentStore.js';

/** Every field each document may hold. */
export const REMOTE_FIELDS = Object.freeze({
  holdings: [
    'id', 'name', 'type', 'platform', 'currency', 'goalId', 'notes', 'rate', 'compounding',
    'maturityDate', 'lockInUntil', 'sipAmount', 'sipDay', 'closed', 'createdAt', 'updatedAt',
  ],
  investmentTxns: ['id', 'holdingId', 'kind', 'date', 'amount', 'units', 'note', 'createdAt', 'updatedAt'],
  goals: ['id', 'name', 'target', 'targetDate', 'expectedReturn', 'createdAt', 'updatedAt'],
});

export const COLLECTIONS = Object.keys(REMOTE_FIELDS);

const BATCH_LIMIT = 500;

function chunks(list, size = BATCH_LIMIT) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * The stored shape of a record: known fields only, with empty optional
 * values left out rather than stored as null.
 */
export function toRemote(name, record) {
  const out = { synced: true };
  for (const field of REMOTE_FIELDS[name]) {
    const value = record[field];
    if (value !== undefined && value !== null && value !== '') out[field] = value;
  }
  return out;
}

function refFor(user, name) {
  return collection(db, 'users', user.uid, name);
}

async function pushCollection(user, name, tombstones) {
  const ref = refFor(user, name);

  const mine = tombstones.filter((t) => t.collection === name);
  for (const chunk of chunks(mine)) {
    const batch = writeBatch(db);
    for (const { id } of chunk) batch.delete(doc(ref, id));
    await batch.commit();
    await clearInvestmentTombstones(chunk.map((t) => t.id));
  }

  const unsynced = (await getAllRecords(name)).filter((r) => !r.synced);
  for (const chunk of chunks(unsynced)) {
    const batch = writeBatch(db);
    for (const record of chunk) batch.set(doc(ref, record.id), toRemote(name, record));
    await batch.commit();
    for (const record of chunk) await updateRecord(name, record.id, { synced: true });
  }
}

async function pullCollection(user, name) {
  const snapshot = await getDocs(refFor(user, name));
  const remoteDocs = snapshot.docs.map((d) => d.data());
  const remoteIds = new Set(remoteDocs.map((d) => d.id));

  const pendingDeletes = new Set((await getInvestmentTombstones()).map((t) => t.id));
  const local = await getAllRecords(name);
  const localMap = new Map(local.map((r) => [r.id, r]));

  for (const remote of remoteDocs) {
    if (pendingDeletes.has(remote.id)) continue;
    const existing = localMap.get(remote.id);
    if (!existing || existing.synced) {
      await putRecord(name, { ...remote, synced: true });
    }
  }

  for (const record of local) {
    if (record.synced && !remoteIds.has(record.id)) await deleteRecordLocal(name, record.id);
  }
}

/** Full two-way sync of every investment collection. */
export async function syncInvestments(user) {
  if (!user) return;
  const tombstones = await getInvestmentTombstones();
  for (const name of COLLECTIONS) await pushCollection(user, name, tombstones);
  for (const name of COLLECTIONS) await pullCollection(user, name);
}

/** Uploads one record right after a local write. */
export async function syncInvestmentRecord(user, name, record) {
  if (!user) return;
  await setDoc(doc(db, 'users', user.uid, name, record.id), toRemote(name, record));
  await updateRecord(name, record.id, { synced: true });
}

/** Deletes records remotely; tombstones survive a failure and retry later. */
export async function syncInvestmentDeletes(user, name, ids) {
  if (!user || !ids.length) return;
  for (const chunk of chunks(ids)) {
    const batch = writeBatch(db);
    for (const id of chunk) batch.delete(doc(db, 'users', user.uid, name, id));
    await batch.commit();
    await clearInvestmentTombstones(chunk);
  }
}
