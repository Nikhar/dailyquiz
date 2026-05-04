import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { ChallengeSeries } from '../types';
import { Calendar, Trophy, Play, CheckCircle } from 'lucide-react';

interface DashboardProps {
  onSelectChallenge: (challenge: ChallengeSeries) => void;
}

export default function ChallengesDashboard({ onSelectChallenge }: DashboardProps) {
  const [challenges, setChallenges] = useState<ChallengeSeries[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'challenges'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChallengeSeries[];
      setChallenges(list);
      setLoading(false);
    }, (error) => {
      console.error("Failed to subscribe to challenges", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];

  const activeChallenges = challenges.filter(c => c.isActive && todayStr <= c.endDate);
  const completedChallenges = challenges.filter(c => !c.isActive || todayStr > c.endDate);

  if (loading) {
    return <div className="text-center py-20 font-serif italic opacity-50">Consulting our archives...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto py-12 px-6 space-y-16">
      <header className="text-center space-y-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-4"
        >
          <h1 className="text-5xl md:text-6xl font-serif tracking-tight">Challenges &amp; Series</h1>
          <p className="text-xl text-muted italic max-w-xl mx-auto">
            Select an active challenge to participate, score points, and compete on the series-scoped leaderboard.
          </p>
        </motion.div>
      </header>

      {/* Active Challenges Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl uppercase tracking-widest text-ink/40 font-bold text-[12px]">Active Series</h2>
          <div className="flex-grow h-px bg-ink/5"></div>
        </div>

        {activeChallenges.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {activeChallenges.map((c) => (
              <ChallengeCard 
                key={c.id} 
                challenge={c} 
                onSelect={onSelectChallenge}
                isActiveSeries={true}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white border border-dashed border-ink/10 rounded-3xl">
            <p className="text-muted italic">No active challenges running right now.</p>
            <p className="text-[10px] uppercase tracking-widest text-ink/20 mt-2 font-bold">Check back later or review completed archives!</p>
          </div>
        )}
      </section>

      {/* Completed Challenges Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl uppercase tracking-widest text-ink/40 font-bold text-[12px]">Completed Series</h2>
          <div className="flex-grow h-px bg-ink/5"></div>
        </div>

        {completedChallenges.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {completedChallenges.map((c) => (
              <ChallengeCard 
                key={c.id} 
                challenge={c} 
                onSelect={onSelectChallenge}
                isActiveSeries={false}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-paper rounded-2xl border border-ink/5 text-muted italic">
            No completed archives found.
          </div>
        )}
      </section>
    </div>
  );
}

interface CardProps {
  key?: string;
  challenge: ChallengeSeries;
  onSelect: (challenge: ChallengeSeries) => void;
  isActiveSeries: boolean;
}

function ChallengeCard({ challenge, onSelect, isActiveSeries }: CardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      onClick={() => onSelect(challenge)}
      className={`bg-white border rounded-3xl p-8 transition-all shadow-sm flex flex-col justify-between gap-6 cursor-pointer group hover:shadow-xl
        ${isActiveSeries ? 'border-ink/10 hover:border-accent' : 'border-ink/5 hover:border-ink/20 grayscale-[40%] opacity-80 hover:opacity-100 hover:grayscale-0'}
      `}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-sans text-muted uppercase tracking-widest">
            <Calendar size={14} className="text-accent" />
            <span>
              {new Date(challenge.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} 
              {" — "}
              {new Date(challenge.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          
          <div className={`px-3 py-1 rounded-full text-[9px] uppercase tracking-widest font-bold border shadow-sm
            ${isActiveSeries ? 'bg-accent/10 border-accent/20 text-accent animate-pulse' : 'bg-ink/5 border-ink/10 text-muted'}
          `}>
            {isActiveSeries ? 'Live Challenge' : 'Completed'}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-2xl md:text-3xl font-serif tracking-tight leading-tight group-hover:text-accent transition-colors">{challenge.title}</h3>
          <p className="text-muted font-serif italic text-sm leading-relaxed line-clamp-2 pr-4">"{challenge.description}"</p>
          {challenge.isTimed && (
            <p 
              onClick={(e) => {
                e.stopPropagation();
                alert("⏱️ Timed Challenge Speed Scoring Breakdown:\n\n• Under 45 seconds: 15 Points (Full score)\n• After 45 seconds: Loses 1 point every 20 seconds\n• 5+ minutes: 3 Points (Guaranteed minimum floor)");
              }}
              className="text-xs text-accent font-serif font-bold mt-2 hover:underline cursor-pointer flex items-center gap-1"
            >
              ⚡ This is a timed challenge, faster you are, higher you score. Click here for scoring formula/explanation
            </p>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-ink/5 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted">
          <Trophy size={16} className="text-amber-500" />
          <span className="font-serif">Series Podium enabled</span>
        </div>
        
        <div className="flex items-center gap-1 font-serif font-bold text-ink group-hover:text-accent group-hover:translate-x-1 transition-all">
          <span>{isActiveSeries ? 'Participate' : 'Review Quizzes'}</span>
          <Play size={12} fill="currentColor" className="ml-1" />
        </div>
      </div>
    </motion.div>
  );
}
