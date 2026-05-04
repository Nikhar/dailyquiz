import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Navbar from './components/Navbar';
import Auth from './components/Auth';
import Quiz from './components/Quiz';
import Leaderboard from './components/Leaderboard';
import NotificationSettings from './components/NotificationSettings';
import Admin from './components/Admin';
import ChallengesDashboard from './components/ChallengesDashboard';
import { User, ChallengeSeries } from './types';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // In production, we might want to just log and show a friendly message
  // But per instructions, we throw the JSON string for diagnostics
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [view, setView] = useState<'dashboard' | 'quiz' | 'leaderboard' | 'notifs' | 'admin'>('dashboard');
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeSeries | null>(null);

  const localTimeStr = (() => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  })();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const userRef = doc(db, 'users', fbUser.uid);
        const adminRef = doc(db, 'admins', fbUser.uid);
        
        try {
          const [userSnap, adminSnap] = await Promise.all([
            getDoc(userRef),
            getDoc(adminRef)
          ]);
          
          if (userSnap.exists()) {
            const data = userSnap.data();
            setUser({
              id: fbUser.uid,
              username: data.username,
              score: data.score,
              solved_today: data.last_solved_at === new Date().toISOString().split('T')[0],
              isAdmin: adminSnap.exists()
            });
          }
        } catch (e) {
             console.error("Auth init error", e);
        }
      } else {
        setUser(null);
      }
      setIsInitializing(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAuthSuccess = (userData: User) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setSelectedChallenge(null);
    setView('dashboard');
  };

  const handleSelectChallenge = (challenge: ChallengeSeries) => {
    setSelectedChallenge(challenge);
    setView('quiz');
  };

  const handleBackToDashboard = () => {
    setSelectedChallenge(null);
    setView('dashboard');
  };

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      const newUser = { ...user, ...updates };
      setUser(newUser);
      localStorage.setItem('qd_user', JSON.stringify(newUser));
    }
  };

  if (isInitializing) return null;

  return (
    <div className="min-h-screen bg-paper flex flex-col animate-fadeIn">
      <Navbar 
        user={user} 
        onLogout={handleLogout} 
        onNavigate={setView}
        currentView={view}
        selectedChallenge={selectedChallenge}
        onBackToDashboard={handleBackToDashboard}
      />

      <main className="flex-grow">
        {!user ? (
          <div className="container mx-auto px-6 py-20 flex flex-col items-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center mb-12 space-y-4"
            >
              <h1 className="text-6xl md:text-7xl font-serif tracking-tighter">Quizzing with Nikhar</h1>
              <p className="text-xl text-muted italic max-w-lg mx-auto">One interesting question, every single day at {localTimeStr}. Test your knowledge and climb the leaderboard.</p>
            </motion.div>
            <Auth onSuccess={handleAuthSuccess} />
            <div className="mt-12 text-center text-[10px] uppercase tracking-[0.4em] text-ink/20 font-bold">Est. MMXXVI</div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              {view === 'dashboard' && <ChallengesDashboard onSelectChallenge={handleSelectChallenge} />}
              {view === 'quiz' && selectedChallenge && <Quiz user={user} onUpdateUser={updateUser} challenge={selectedChallenge} />}
              {view === 'leaderboard' && selectedChallenge && <Leaderboard challenge={selectedChallenge} />}
              {view === 'notifs' && <NotificationSettings user={user} />}
              {view === 'admin' && user.isAdmin && <Admin />}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      <footer className="py-12 border-t border-ink/5 mt-auto">
        <div className="max-w-6xl mx-auto px-6 text-center space-y-4">
          <div className="text-sm font-serif italic text-muted">"Learning is a lifelong journey."</div>
          <div className="text-[10px] uppercase tracking-widest text-ink/20">Developed by Nikhar &bull; &copy; 2026 All Rights Reserved.</div>
        </div>
      </footer>
    </div>
  );
}

