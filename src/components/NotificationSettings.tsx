import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Bell, BellOff, Info } from 'lucide-react';
import { User } from '../types';
import { db } from '../lib/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

interface NotificationSettingsProps {
  user: User;
}

export default function NotificationSettings({ user }: NotificationSettingsProps) {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
    const fetchPref = async () => {
      const snap = await getDoc(doc(db, 'users', user.id));
      if (snap.exists()) {
        setEnabled(!!snap.data().notif_opt_in);
      }
    };
    fetchPref();
  }, [user.id]);

  const toggleNotifs = async () => {
    if (!('Notification' in window)) {
      alert("This browser does not support notifications.");
      return;
    }

    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return;
    }

    const nextState = !enabled;
    try {
      await updateDoc(doc(db, 'users', user.id), {
        notif_opt_in: nextState
      });
      setEnabled(nextState);
    } catch (err) {
      console.error('Failed to update notification settings', err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-6">
      <div className="bg-white border border-ink/10 rounded-3xl p-12 shadow-xl shadow-ink/5 space-y-8">
        <header className="text-center space-y-4">
          <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center mx-auto mb-4">
            {enabled ? <Bell className="w-8 h-8" /> : <BellOff className="w-8 h-8" />}
          </div>
          <h2 className="text-4xl font-serif">Notifications</h2>
          <p className="text-muted italic max-w-sm mx-auto">Get notified when a new question is published.</p>
        </header>

        <div className="space-y-6">
          <div className="p-6 bg-paper rounded-2xl border border-ink/5 flex items-start gap-4">
            <Info className="w-6 h-6 text-accent shrink-0 mt-1" />
            <div className="text-sm leading-relaxed text-ink/70">
              We will send you one notification each day when a new question is published.
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={toggleNotifs}
            className={`w-full py-6 rounded-2xl font-serif text-xl transition-colors shadow-lg
              ${enabled ? 'bg-ink/5 text-ink border border-ink/10' : 'bg-ink text-paper'}
            `}
          >
            {enabled ? 'Disable Notifications' : 'Enable Notifications'}
          </motion.button>

          {permission === 'denied' && (
             <p className="text-center text-xs text-red-500 font-serif italic">
               Notifications are blocked by your browser. Please enable them in your settings.
             </p>
          )}
        </div>
      </div>
    </div>
  );
}
