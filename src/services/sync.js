import { collection, doc, setDoc, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
  getExpenses,
  updateExpense,
  addExpense,
  deleteExpenseLocal,
  getTombstones,
  clearTombstones,
} from '../lib/store';

function expensesRef(user) {
  return collection(db, 'users', user.uid, 'expenses');
}

/**
 * Replays deletions that happened while offline, then pushes every unsynced
 * local expense. Runs before a pull so the remote is accurate when we
 * reconcile against it.
 */
export async function pushUnsyncedToFirestore(user) {
  if (!user) return;

  const userExpensesRef = expensesRef(user);

  const tombstones = await getTombstones();
  if (tombstones.length > 0) {
    const batch = writeBatch(db);
    for (const { id } of tombstones) {
      batch.delete(doc(userExpensesRef, id));
    }
    await batch.commit();
    await clearTombstones(tombstones.map((t) => t.id));
  }

  const unsynced = (await getExpenses()).filter((e) => !e.synced);
  if (unsynced.length === 0) return;

  const batch = writeBatch(db);
  for (const exp of unsynced) {
    batch.set(doc(userExpensesRef, exp.id), { ...exp, synced: true });
  }
  await batch.commit();

  for (const exp of unsynced) {
    await updateExpense(exp.id, { synced: true });
  }
}

/**
 * Pulls the remote collection and reconciles it into IndexedDB.
 *
 * Firestore is treated as authoritative for records already marked synced:
 * if such a record is absent remotely it was deleted on another device, so it
 * is removed here too. Unsynced local records are never touched — they are
 * pending uploads, not stale copies.
 */
export async function pullFromFirestore(user) {
  if (!user) return;

  const snapshot = await getDocs(expensesRef(user));
  const remoteDocs = snapshot.docs.map((d) => d.data());
  const remoteIds = new Set(remoteDocs.map((d) => d.id));

  const pendingDeletes = new Set((await getTombstones()).map((t) => t.id));
  const localExpenses = await getExpenses();
  const localMap = new Map(localExpenses.map((e) => [e.id, e]));

  for (const remote of remoteDocs) {
    if (pendingDeletes.has(remote.id)) continue;

    const local = localMap.get(remote.id);
    if (!local) {
      await addExpense({ ...remote, synced: true });
    } else if (local.synced) {
      await updateExpense(local.id, { ...remote, synced: true });
    }
  }

  for (const local of localExpenses) {
    if (local.synced && !remoteIds.has(local.id)) {
      await deleteExpenseLocal(local.id);
    }
  }
}

/**
 * Syncs a single newly created or edited expense to Firestore immediately.
 */
export async function syncSingleExpense(user, expense) {
  if (!user) return;

  await setDoc(doc(db, 'users', user.uid, 'expenses', expense.id), {
    ...expense,
    synced: true,
  });
  await updateExpense(expense.id, { synced: true });
}

/**
 * Syncs the deletion of an expense to Firestore immediately. On success the
 * tombstone is cleared; if it throws, the tombstone survives and the next
 * pushUnsyncedToFirestore retries the delete.
 */
export async function syncDeleteExpense(user, expenseId) {
  if (!user) return;

  await deleteDoc(doc(db, 'users', user.uid, 'expenses', expenseId));
  await clearTombstones([expenseId]);
}
