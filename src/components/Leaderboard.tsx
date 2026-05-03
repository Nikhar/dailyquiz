import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { LeaderboardEntry, ChallengeSeries } from '../types';
import { Medal } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../App';

interface LeaderboardProps {
  challenge: ChallengeSeries;
}

export default function Leaderboard({ challenge }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaders = async () => {
      const path = `challenges/${challenge.id}/leaderboard`;
      try {
        const q = query(collection(db, 'challenges', challenge.id, 'leaderboard'), orderBy('score', 'desc'), limit(10));
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => doc.data() as LeaderboardEntry);
        setEntries(data);
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, path);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaders();
  }, [challenge.id]);

  if (loading) return <div className="text-center py-20 font-serif italic opacity-50">Consulting the leaderboard...</div>;

  return (
    <div className="max-w-2xl mx-auto py-12 px-6">
      <header className="text-center mb-12">
        <h2 className="text-4xl font-serif mb-2 tracking-tight">Series Leaderboard</h2>
        <p className="text-muted italic text-center">Top players for {challenge.title}.</p>
      </header>

      <div className="bg-white border border-ink/10 rounded-2xl overflow-hidden shadow-xl shadow-ink/5">
        <table className="w-full text-left">
          <thead className="bg-paper border-bottom border-ink/5">
            <tr>
              <th className="px-8 py-4 text-xs uppercase tracking-widest text-muted">Rank</th>
              <th className="px-8 py-4 text-xs uppercase tracking-widest text-muted">Player</th>
              <th className="px-8 py-4 text-xs uppercase tracking-widest text-muted text-right">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {entries.length > 0 ? entries.map((entry, idx) => (
              <motion.tr
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                key={entry.username}
                className="group hover:bg-paper transition-colors"
              >
                <td className="px-8 py-6 font-serif text-xl">
                  {idx === 0 && <Medal className="w-6 h-6 text-amber-500 inline-block mr-2" />}
                  {idx === 1 && <Medal className="w-6 h-6 text-slate-400 inline-block mr-2" />}
                  {idx === 2 && <Medal className="w-6 h-6 text-amber-700 inline-block mr-2" />}
                  {idx + 1}
                </td>
                <td className="px-8 py-6">
                  <div className="font-serif text-lg">{entry.username}</div>
                  {idx < 3 && <span className="text-[10px] uppercase tracking-tighter text-accent font-bold">Top Player</span>}
                </td>
                <td className="px-8 py-6 text-right font-serif text-2xl tabular-nums">
                  {entry.score}
                </td>
              </motion.tr>
            )) : (
               <tr>
                <td colSpan={3} className="px-8 py-12 text-center text-muted italic">The halls are quiet today...</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
