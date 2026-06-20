import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, loginWithGoogle, logout } from '../services/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const loginTimestamp = localStorage.getItem('loginTimestamp');
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
        
        if (loginTimestamp) {
          if (Date.now() - parseInt(loginTimestamp, 10) > thirtyDaysInMs) {
            // Session expired
            await logout();
            localStorage.removeItem('loginTimestamp');
            setUser(null);
            setLoading(false);
            return;
          }
        } else {
          // Set initial timestamp if it doesn't exist (e.g. legacy logins)
          localStorage.setItem('loginTimestamp', Date.now().toString());
        }
      } else {
        localStorage.removeItem('loginTimestamp');
      }

      setUser(currentUser);
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const loggedInUser = await loginWithGoogle();
    localStorage.setItem('loginTimestamp', Date.now().toString());
    return loggedInUser;
  };

  const handleLogout = async () => {
    await logout();
    localStorage.removeItem('loginTimestamp');
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle: handleLogin, logout: handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
