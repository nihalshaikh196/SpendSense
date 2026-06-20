import { collection, doc, setDoc, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getExpenses, updateExpense, addExpense, deleteExpense } from '../lib/store';

/**
 * Pushes all unsynced local expenses to Firestore.
 */
export async function pushUnsyncedToFirestore(user) {
  if (!user) return;
  const localExpenses = await getExpenses();
  const unsynced = localExpenses.filter(e => !e.synced);
  
  if (unsynced.length === 0) return;

  const batch = writeBatch(db);
  const userExpensesRef = collection(db, 'users', user.uid, 'expenses');

  for (const exp of unsynced) {
    const docRef = doc(userExpensesRef, exp.id);
    const dataToSync = { ...exp, synced: true };
    batch.set(docRef, dataToSync);
  }

  try {
    await batch.commit();
    // Mark as synced locally
    for (const exp of unsynced) {
      await updateExpense(exp.id, { synced: true });
    }
    console.log(`Synced ${unsynced.length} records to Firestore`);
  } catch (error) {
    console.error("Error syncing to Firestore:", error);
  }
}

/**
 * Pulls all expenses from Firestore and merges them into IndexedDB.
 * Simple last-write-wins by createdAt.
 */
export async function pullFromFirestore(user) {
  if (!user) return;
  const userExpensesRef = collection(db, 'users', user.uid, 'expenses');
  
  try {
    const querySnapshot = await getDocs(userExpensesRef);
    const remoteDocs = querySnapshot.docs.map(doc => doc.data());
    
    const localExpenses = await getExpenses();
    const localMap = new Map(localExpenses.map(e => [e.id, e]));

    for (const remote of remoteDocs) {
      const local = localMap.get(remote.id);
      if (!local) {
        // Doesn't exist locally, add it
        await addExpense({ ...remote, synced: true });
      } else {
        // Compare createdAt or updatedAt
        // For simplicity, if remote exists, we assume it's up to date unless local is unsynced and newer.
        // If local is unsynced, we push it later. If local is synced, remote is identical or newer.
        if (local.synced) {
          await updateExpense(local.id, { ...remote, synced: true });
        }
      }
    }
  } catch (error) {
    console.error("Error pulling from Firestore:", error);
  }
}

/**
 * Syncs a single newly created or edited expense to Firestore immediately.
 */
export async function syncSingleExpense(user, expense) {
  if (!user) return;
  try {
    const docRef = doc(db, 'users', user.uid, 'expenses', expense.id);
    const dataToSync = { ...expense, synced: true };
    await setDoc(docRef, dataToSync);
    
    // Update local store to mark as synced
    await updateExpense(expense.id, { synced: true });
    console.log(`Synced expense ${expense.id} to Firestore`);
  } catch (error) {
    console.error(`Error syncing expense ${expense.id} to Firestore:`, error);
  }
}

/**
 * Syncs the deletion of an expense to Firestore immediately.
 */
export async function syncDeleteExpense(user, expenseId) {
  if (!user) return;
  try {
    const docRef = doc(db, 'users', user.uid, 'expenses', expenseId);
    await deleteDoc(docRef);
    console.log(`Deleted expense ${expenseId} from Firestore`);
  } catch (error) {
    console.error(`Error deleting expense ${expenseId} from Firestore:`, error);
  }
}
