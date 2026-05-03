import React, { useState } from 'react';
import { motion } from 'motion/react';
import { User } from '../types';
import { auth, db } from '../lib/firebase';
import { 
  GoogleAuthProvider, 
  signInWithPopup 
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface AuthProps {
  onSuccess: (user: User) => void;
}

export default function Auth({ onSuccess }: AuthProps) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    const provider = new GoogleAuthProvider();

    try {
      const result = await signInWithPopup(auth, provider);
      const fbUser = result.user;

      // Sync Firestore profile
      const userRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userRef);
      
      let userData: User;
      if (!userSnap.exists()) {
        userData = {
          id: fbUser.uid,
          username: fbUser.displayName || fbUser.email?.split('@')[0] || 'Anonymous',
          score: 0,
          solved_today: false
        };
        await setDoc(userRef, userData);
      } else {
        const data = userSnap.data();
        userData = {
          id: fbUser.uid,
          username: data.username,
          score: data.score,
          solved_today: data.last_solved_at === new Date().toISOString().split('T')[0]
        };
      }
      
      onSuccess(userData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-8 bg-white border border-ink/10 rounded-2xl shadow-xl shadow-ink/5">
      <h2 className="text-3xl font-serif mb-6 text-center">Join the Quiz</h2>
      <p className="text-muted text-center mb-8 italic">We use Google accounts to maintain the integrity of our community and leaderboard.</p>
      
      <div className="space-y-4">
        {error && <p className="text-red-500 text-sm mb-4 text-center font-serif">{error}</p>}
        
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full py-4 bg-ink text-paper rounded-lg font-serif text-lg flex items-center justify-center gap-3 disabled:opacity-50 transition-opacity"
        >
          {loading ? 'Processing...' : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </>
          )}
        </motion.button>
      </div>

      <p className="text-center mt-8 text-[10px] uppercase tracking-widest text-muted opacity-50">
        Secure Auth via Firebase
      </p>
    </div>
  );
}
