import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA9D0Gt1B0p5z_Nuj8gIaMRAxakeO5QDMI",
  authDomain: "expensesense-5050f.firebaseapp.com",
  projectId: "expensesense-5050f",
  storageBucket: "expensesense-5050f.firebasestorage.app",
  messagingSenderId: "871701910988",
  appId: "1:871701910988:web:180f2844536659f8b43969",
  measurementId: "G-RJ991NXB2G"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};

// Initialize Firestore
export const db = getFirestore(app);
