import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { doc, setDoc, getDoc, collection, query, orderBy, getDocs, deleteDoc, where, updateDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../App';
import { Send, Calendar, List, Plus, Trash2, ChevronRight, ShieldAlert, Check, X, Trophy, Edit3 } from 'lucide-react';
import { AdminReviewFlag, ChallengeSeries } from '../types';

interface PastQuiz {
  id: string;
  date: string;
  question: string;
}

export default function Admin() {
  const [activeTab, setActiveTab] = useState<'create' | 'list' | 'reviews' | 'create_series'>('list');
  
  // Series management states
  const [seriesTitle, setSeriesTitle] = useState('');
  const [seriesDesc, setSeriesDesc] = useState('');
  const [seriesStart, setSeriesStart] = useState(new Date().toISOString().split('T')[0]);
  const [seriesEnd, setSeriesEnd] = useState(new Date().toISOString().split('T')[0]);
  const [seriesStatus, setSeriesStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [seriesIsTimed, setSeriesIsTimed] = useState(false);
  
  // Quizzes States
  const [challengesList, setChallengesList] = useState<ChallengeSeries[]>([]);
  const [targetChallengeId, setTargetChallengeId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [question, setQuestion] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [explanation, setExplanation] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  
  // Past Quizzes editing states
  const [editingDate, setEditingDate] = useState<string | null>(null);
  
  const [pastQuizzes, setPastQuizzes] = useState<PastQuiz[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  
  const [pendingFlags, setPendingFlags] = useState<AdminReviewFlag[]>([]);
  const [loadingFlags, setLoadingFlags] = useState(false);

  // General startup fetching
  useEffect(() => {
    fetchChallenges();
  }, []);

  useEffect(() => {
    if (activeTab === 'list') {
      fetchPastQuizzes();
    } else if (activeTab === 'reviews') {
      fetchPendingFlags();
    }
  }, [activeTab, targetChallengeId]);

  const fetchChallenges = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'challenges'), orderBy('createdAt', 'desc')));
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ChallengeSeries[];
      setChallengesList(list);
      if (list.length > 0 && !targetChallengeId) {
        setTargetChallengeId(list[0].id);
      }
    } catch (e) {
      console.error("Failed to fetch challenge series", e);
    }
  };

  const fetchPastQuizzes = async () => {
    if (!targetChallengeId) return;
    setLoadingQuizzes(true);
    try {
      const q = query(collection(db, 'challenges', targetChallengeId, 'quizzes'), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      const quizzes = snap.docs.map(doc => ({
        id: doc.id,
        date: doc.data().date,
        question: doc.data().question
      }));
      setPastQuizzes(quizzes);
    } catch (err) {
      console.error("Failed to fetch past quizzes", err);
    } finally {
      setLoadingQuizzes(false);
    }
  };

  const fetchPendingFlags = async () => {
    setLoadingFlags(true);
    try {
      const q = query(collection(db, 'admin_reviews'), where('isPending', '==', true));
      const snap = await getDocs(q);
      const flagsData = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AdminReviewFlag[];
      setPendingFlags(flagsData);
    } catch (err) {
      console.error("Failed to fetch pending reviews", err);
    } finally {
      setLoadingFlags(false);
    }
  };

  const handleCreateSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    setSeriesStatus('loading');
    const seriesId = seriesTitle.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

    try {
      await setDoc(doc(db, 'challenges', seriesId), {
        title: seriesTitle,
        description: seriesDesc,
        startDate: seriesStart,
        endDate: seriesEnd,
        isActive: true,
        isTimed: seriesIsTimed,
        createdAt: serverTimestamp()
      });
      setSeriesStatus('success');
      setTimeout(() => {
        setSeriesStatus('idle');
        setSeriesTitle('');
        setSeriesDesc('');
        setSeriesStart(new Date().toISOString().split('T')[0]);
        setSeriesEnd(new Date().toISOString().split('T')[0]);
        setSeriesIsTimed(false);
        fetchChallenges();
        setActiveTab('list');
      }, 1500);
    } catch (e) {
      console.error("Failed to create series", e);
      setSeriesStatus('idle');
    }
  };

  const handleEditTrigger = async (quizId: string) => {
    if (!targetChallengeId) return;
    try {
      const snap = await getDoc(doc(db, 'challenges', targetChallengeId, 'quizzes', quizId));
      if (snap.exists()) {
        const data = snap.data();
        setQuestion(data.question || '');
        setCorrectAnswer((data.correctAnswers || []).join(', '));
        setExplanation(data.explanation || '');
        setDate(data.date || quizId);
        setEditingDate(data.date || quizId); // Activates Edit mode locks
        setActiveTab('create');
      }
    } catch (e) {
      console.error("Failed to fetch question snapshot for edit", e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetChallengeId) {
      alert("Please create a Challenge Series first.");
      return;
    }
    setStatus('loading');
    
    try {
      // 🛡️ Overwrite Collision Validation Guard (Bypassed in Edit mode)
      const quizRef = doc(db, 'challenges', targetChallengeId, 'quizzes', date);
      if (editingDate !== date) {
        const quizSnap = await getDoc(quizRef);
        if (quizSnap.exists()) {
          alert("A question already exists for this date in the selected challenge series! Please choose a different date, or delete the existing question first.");
          setStatus('idle');
          return;
        }
      }

      const answersArray = correctAnswer.split(',').map(a => a.trim()).filter(Boolean);
      await setDoc(quizRef, {
        date,
        question,
        correctAnswers: answersArray,
        explanation
      });
      setStatus('success');
      setTimeout(() => {
        setStatus('idle');
        setActiveTab('list');
        resetForm();
        fetchPastQuizzes();
      }, 1500);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `challenges/${targetChallengeId}/quizzes/${date}`);
      setStatus('idle');
    }
  };

  const resetForm = () => {
    setQuestion('');
    setCorrectAnswer('');
    setExplanation('');
    setDate(new Date().toISOString().split('T')[0]);
    setEditingDate(null);
  };

  const handleDelete = async (id: string) => {
    if (!targetChallengeId) return;
    const confirmPrompt = `🚨 WARNING: You are about to delete this question. This will permanently erase it from the challenge.\n\nExisting user response logs and leaderboard scores might remain. Are you absolutely sure you want to proceed?`;
    if (!confirm(confirmPrompt)) return;

    try {
      await deleteDoc(doc(db, 'challenges', targetChallengeId, 'quizzes', id));
      setPastQuizzes(prev => prev.filter(q => q.id !== id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `challenges/${targetChallengeId}/quizzes/${id}`);
    }
  };

  const handleDeleteSeries = async (seriesId: string) => {
    const confirmPrompt1 = `🚨🚨 CRITICAL WARNING: You are about to delete the ENTIRE Challenge Series "${seriesId}" and all its leaderboard entries. This action is highly destructive and CANNOT be undone.\n\nProceed with caution?`;
    if (!confirm(confirmPrompt1)) return;

    const seriesObj = challengesList.find(c => c.id === seriesId);
    const confirmPrompt2 = `To confirm deletion of the series "${seriesObj?.title}", you must type the Series ID "${seriesId}" in the next input prompt.`;
    alert(confirmPrompt2);
    
    const userTypedInput = prompt(`Type "${seriesId}" to confirm delete series:`);
    if (userTypedInput !== seriesId) {
      alert("Deletion aborted. Typed confirmation input did not match the Challenge Series ID.");
      return;
    }

    try {
      await deleteDoc(doc(db, 'challenges', seriesId));
      setChallengesList(prev => prev.filter(c => c.id !== seriesId));
      if (targetChallengeId === seriesId) {
        setTargetChallengeId('');
      }
      alert("Challenge Series and parent endpoints safely deleted!");
    } catch (e) {
      console.error("Failed to delete challenge series", e);
    }
  };

  const handleApproveSynonym = async (flag: AdminReviewFlag) => {
    try {
      await runTransaction(db, async (transaction) => {
        const quizRef = doc(db, 'challenges', flag.challengeId, 'quizzes', flag.quizDate);
        const flagRef = doc(db, 'admin_reviews', flag.id);
        const userRef = doc(db, 'users', flag.userId);
        const leaderboardRef = doc(db, 'challenges', flag.challengeId, 'leaderboard', flag.userId);
        const responseRef = doc(db, 'challenges', flag.challengeId, 'quizzes', flag.quizDate, 'responses', flag.userId);

        const quizSnap = await transaction.get(quizRef);
        const userSnap = await transaction.get(userRef);
        if (!quizSnap.exists() || !userSnap.exists()) {
          throw new Error("Quiz or User documents do not exist.");
        }

        const correctAnswers: string[] = quizSnap.data().correctAnswers || [];
        const lowerAnswer = flag.submittedAnswer.toLowerCase();
        if (!correctAnswers.some(ans => ans.toLowerCase() === lowerAnswer)) {
          correctAnswers.push(flag.submittedAnswer);
        }

        transaction.update(quizRef, { correctAnswers });
        transaction.update(flagRef, { isPending: false, approved: true });
        transaction.update(responseRef, { isCorrect: true });

        const leaderboardSnap = await transaction.get(leaderboardRef);
        const currentChallengeScore = leaderboardSnap.exists() ? (leaderboardSnap.data().score || 0) : 0;
        const newChallengeScore = currentChallengeScore + 10;

        transaction.set(leaderboardRef, {
          username: flag.username,
          score: newChallengeScore
        }, { merge: true });

        const globalScore = userSnap.data().score || 0;
        transaction.update(userRef, {
          score: globalScore + 10
        });
      });

      setPendingFlags(prev => prev.filter(f => f.id !== flag.id));
      alert("Synonym approved, scores updated, and response marked correct!");
    } catch (err) {
      console.error("Approve transaction failed", err);
      alert("Failed to approve synonym. Please try again.");
    }
  };

  const handleDismissFlag = async (flagId: string) => {
    try {
      await updateDoc(doc(db, 'admin_reviews', flagId), {
        isPending: false,
        approved: false
      });
      setPendingFlags(prev => prev.filter(f => f.id !== flagId));
    } catch (err) {
      console.error("Dismiss flag failed", err);
    }
  };

  const wordCount = question.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="max-w-5xl mx-auto py-12 px-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h2 className="text-5xl font-serif mb-2 tracking-tight">Admin Dashboard</h2>
          <p className="text-muted italic text-lg">Manage challenges, questions, and moderation review queues.</p>
        </div>
        
        <div className="flex bg-paper border border-ink/10 rounded-xl p-1 gap-1 flex-wrap shadow-sm">
          <TabButton 
            active={activeTab === 'list'} 
            onClick={() => { setEditingDate(null); setActiveTab('list'); }}
            icon={<List size={18} />}
            label="Quiz List"
          />
          <TabButton 
            active={activeTab === 'reviews'} 
            onClick={() => { setEditingDate(null); setActiveTab('reviews'); }}
            icon={<ShieldAlert size={18} />}
            label="Pending Reviews"
          />
          <TabButton 
            active={activeTab === 'create_series'} 
            onClick={() => { setEditingDate(null); setActiveTab('create_series'); }}
            icon={<Trophy size={18} />}
            label="Manage Series"
          />
          <TabButton 
            active={activeTab === 'create'} 
            onClick={() => setActiveTab('create')}
            icon={<Plus size={18} />}
            label={editingDate ? 'Edit Question' : 'Create Quiz'}
          />
        </div>
      </header>

      {/* Active Tab Filtering Info for Questions Browsing */}
      {activeTab === 'list' && challengesList.length > 0 && (
        <div className="flex items-center gap-4 mb-8 p-4 bg-white rounded-xl border border-ink/5 shadow-sm max-w-md">
          <span className="text-xs uppercase tracking-wider text-muted font-bold shrink-0">Active Filter:</span>
          <select
            value={targetChallengeId}
            onChange={(e) => setTargetChallengeId(e.target.value)}
            className="bg-transparent font-serif font-bold text-accent text-lg focus:outline-none w-full cursor-pointer"
          >
            {challengesList.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeTab === 'list' && (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-6"
          >
            {loadingQuizzes ? (
              <div className="text-center py-20 italic opacity-50">Loading quizzes for selected series...</div>
            ) : pastQuizzes.length > 0 ? (
              <div className="grid gap-4">
                {pastQuizzes.map((q) => (
                  <div key={q.id} className="bg-white border border-ink/5 p-6 rounded-2xl flex items-center justify-between group hover:border-accent/30 transition-colors shadow-sm">
                    <div className="space-y-1 flex-grow pr-8">
                      <div className="text-xs uppercase tracking-widest text-accent font-bold">{new Date(q.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      <h3 className="font-serif text-xl line-clamp-1">{q.question}</h3>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button 
                        onClick={() => handleEditTrigger(q.id)}
                        title="Edit Question"
                        className="p-3 text-muted hover:text-accent hover:bg-accent/5 rounded-xl transition-all"
                      >
                        <Edit3 size={20} />
                      </button>
                      <button 
                        onClick={() => handleDelete(q.id)}
                        title="Delete Question"
                        className="p-3 text-muted hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 size={20} />
                      </button>
                      <div className="text-muted px-1"><ChevronRight size={20} /></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-white border border-dashed border-ink/10 rounded-3xl">
                <p className="text-muted italic mb-4">No questions published under this series yet.</p>
                <button onClick={() => setActiveTab('create')} className="text-accent underline underline-offset-4">Create the first one</button>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'reviews' && (
          <motion.div
            key="reviews"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {loadingFlags ? (
              <div className="text-center py-20 italic opacity-50">Fetching flags for review...</div>
            ) : pendingFlags.length > 0 ? (
              <div className="bg-white border border-ink/10 rounded-2xl overflow-hidden shadow-xl shadow-ink/5">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-paper border-b border-ink/5">
                    <tr>
                      <th className="px-6 py-4 text-xs uppercase tracking-widest text-muted font-bold">Date</th>
                      <th className="px-6 py-4 text-xs uppercase tracking-widest text-muted font-bold">User</th>
                      <th className="px-6 py-4 text-xs uppercase tracking-widest text-muted font-bold">Flagged Answer</th>
                      <th className="px-6 py-4 text-xs uppercase tracking-widest text-muted font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {pendingFlags.map((flag) => (
                      <tr key={flag.id} className="hover:bg-paper transition-colors">
                        <td className="px-6 py-5 font-serif text-sm text-accent">{new Date(flag.quizDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                        <td className="px-6 py-5">
                          <div className="font-serif font-bold">{flag.username}</div>
                          <div className="text-[10px] text-muted leading-tight font-sans max-w-sm line-clamp-1 italic">"{flag.question}"</div>
                        </td>
                        <td className="px-6 py-5 text-lg font-serif font-bold text-ink">"{flag.submittedAnswer}"</td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleApproveSynonym(flag)}
                              title="Approve Synonym"
                              className="p-3 bg-green-50 hover:bg-green-600 text-green-600 hover:text-white rounded-xl transition-all border border-green-100 shadow-sm flex items-center gap-1 font-serif text-sm"
                            >
                              <Check size={16} />
                              <span>Approve</span>
                            </button>
                            <button 
                              onClick={() => handleDismissFlag(flag.id)}
                              title="Dismiss Review"
                              className="p-3 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-xl transition-all border border-red-100 shadow-sm flex items-center gap-1 font-serif text-sm"
                            >
                              <X size={16} />
                              <span>Reject</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-20 bg-white border border-dashed border-ink/10 rounded-3xl shadow-inner">
                <p className="text-muted italic">The moderation queue is completely clean!</p>
                <p className="text-[10px] uppercase tracking-widest text-ink/20 mt-2 font-bold">No pending response flags for synonym review.</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'create_series' && (
          <motion.div
            key="create_series"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-12"
          >
            {/* Challenge Creation Form */}
            <form
              onSubmit={handleCreateSeries}
              className="bg-white border border-ink/10 rounded-3xl p-10 shadow-xl shadow-ink/5 space-y-10"
            >
              <h3 className="text-2xl font-serif mb-4 border-b border-ink/5 pb-3">Create New Challenge</h3>
              
              <div className="space-y-4">
                <label className="block text-xs uppercase tracking-[0.2em] text-muted font-bold">Series Title</label>
                <div className="flex items-center gap-3 p-5 bg-paper border border-ink/5 rounded-2xl focus-within:border-accent transition-colors">
                  <Trophy className="text-accent" size={24} />
                  <input 
                    type="text" 
                    required
                    value={seriesTitle}
                    onChange={(e) => setSeriesTitle(e.target.value)}
                    placeholder="e.g. March Challenge, 7-Day Difficult Challenge..."
                    className="bg-transparent focus:outline-none font-serif text-xl w-full"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="block text-xs uppercase tracking-[0.2em] text-muted font-bold">Series Description</label>
                <textarea 
                  required
                  value={seriesDesc}
                  onChange={(e) => setSeriesDesc(e.target.value)}
                  placeholder="Enter the challenge series description and goal..."
                  className="w-full h-32 p-6 bg-paper border border-ink/5 rounded-2xl focus:outline-none focus:border-accent font-serif text-lg leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="block text-xs uppercase tracking-[0.2em] text-muted font-bold">Start Date</label>
                  <div className="flex items-center gap-3 p-5 bg-paper border border-ink/5 rounded-2xl focus-within:border-accent transition-colors">
                    <Calendar className="text-accent" size={24} />
                    <input 
                      type="date" 
                      required
                      value={seriesStart}
                      onChange={(e) => setSeriesStart(e.target.value)}
                      className="bg-transparent focus:outline-none font-serif text-xl w-full"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-xs uppercase tracking-[0.2em] text-muted font-bold">End Date</label>
                  <div className="flex items-center gap-3 p-5 bg-paper border border-ink/5 rounded-2xl focus-within:border-accent transition-colors">
                    <Calendar className="text-accent" size={24} />
                    <input 
                      type="date" 
                      required
                      value={seriesEnd}
                      onChange={(e) => setSeriesEnd(e.target.value)}
                      className="bg-transparent focus:outline-none font-serif text-xl w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-6 bg-paper border border-ink/5 rounded-2xl">
                <div className="space-y-1">
                  <label className="block text-xs uppercase tracking-[0.2em] text-muted font-bold">Timed Challenge Mode</label>
                  <p className="text-xs text-muted italic">Enable linear speed decay scoring (Max 15 pts down to Min 3 pts after a 45s grace window).</p>
                </div>
                <input 
                  type="checkbox"
                  checked={seriesIsTimed}
                  onChange={(e) => setSeriesIsTimed(e.target.checked)}
                  className="w-5 h-5 accent-ink cursor-pointer rounded"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                disabled={seriesStatus === 'loading'}
                type="submit"
                className={`w-full py-8 rounded-2xl font-serif text-3xl flex items-center justify-center gap-4 transition-all shadow-2xl
                  ${seriesStatus === 'success' ? 'bg-green-600 text-white' : 'bg-ink text-paper'}
                `}
              >
                {seriesStatus === 'loading' ? 'Creating Series...' : seriesStatus === 'success' ? 'Series Created!' : (
                  <>
                    <Plus size={28} />
                    Create Challenge Series
                  </>
                )}
              </motion.button>
            </form>

            {/* Challenge deletion and listing queue */}
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <h3 className="text-xs uppercase tracking-widest font-bold text-muted">Active Challenge Endpoints</h3>
                <div className="flex-grow h-px bg-ink/5"></div>
              </div>
              
              {challengesList.length > 0 ? (
                <div className="grid gap-4">
                  {challengesList.map((c) => (
                    <div key={c.id} className="bg-white p-6 border border-ink/5 rounded-2xl flex items-center justify-between group hover:border-red-500/20 transition-all shadow-sm">
                      <div className="space-y-1 pr-8">
                        <div className="text-xs text-accent tracking-widest uppercase font-bold">ID: {c.id}</div>
                        <h4 className="font-serif font-bold text-xl text-ink leading-none">{c.title}</h4>
                        <p className="text-muted font-serif text-sm italic max-w-xl">"{c.description}"</p>
                      </div>
                      <button
                        onClick={() => handleDeleteSeries(c.id)}
                        title="Delete Challenge Series"
                        className="p-3 text-muted hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 shrink-0 border border-transparent hover:border-red-100"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 italic text-muted text-sm">No active series databases created yet.</div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'create' && (
          <motion.form
            key="create"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            onSubmit={handleSubmit}
            className="bg-white border border-ink/10 rounded-3xl p-10 shadow-xl shadow-ink/5 space-y-10"
          >
            <h3 className="text-2xl font-serif border-b border-ink/5 pb-3">
              {editingDate ? '✏️ Edit Quiz Question' : '✍️ Publish Daily Question'}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Dynamic Target Series Selector */}
              <div className="space-y-4">
                <label className="block text-xs uppercase tracking-[0.2em] text-muted font-bold">Target Challenge Series</label>
                <div className="flex items-center gap-3 p-5 bg-paper border border-ink/5 rounded-2xl focus-within:border-accent transition-colors">
                  <Trophy className="text-accent" size={24} />
                  <select
                    required
                    disabled={!!editingDate}
                    value={targetChallengeId}
                    onChange={(e) => setTargetChallengeId(e.target.value)}
                    className="bg-transparent focus:outline-none font-serif text-xl w-full cursor-pointer disabled:opacity-50"
                  >
                    {challengesList.length > 0 ? challengesList.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    )) : (
                      <option value="">-- Create a Series First --</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <label className="block text-xs uppercase tracking-[0.2em] text-muted font-bold">Quiz Date</label>
                <div className="flex items-center gap-3 p-5 bg-paper border border-ink/5 rounded-2xl focus-within:border-accent transition-colors">
                  <Calendar className="text-accent" size={24} />
                  <input 
                    type="date" 
                    required
                    disabled={!!editingDate}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-transparent focus:outline-none font-serif text-xl w-full disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block text-xs uppercase tracking-[0.2em] text-muted font-bold">Question</label>
              <textarea 
                required
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Enter the quiz question..."
                className="w-full h-56 p-8 bg-paper border border-ink/5 rounded-3xl focus:outline-none focus:border-accent font-serif text-2xl leading-relaxed shadow-inner"
              />
              <div className={`text-[10px] text-right uppercase tracking-[0.2em] font-bold ${wordCount > 200 ? 'text-red-500' : 'text-muted'}`}>
                {wordCount} / 200 Words
              </div>
            </div>

            <div className="space-y-4">
              <label className="block text-xs uppercase tracking-[0.2em] text-muted font-bold">Correct Answers / Synonyms</label>
              <div className="flex items-center gap-3 p-5 bg-paper border border-ink/5 rounded-2xl focus-within:border-accent transition-colors shadow-inner">
                <input 
                  type="text" 
                  required
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  placeholder="Enter accepted synonyms, separated by commas (e.g. car, auto, automobile)..."
                  className="bg-transparent focus:outline-none font-serif text-xl w-full"
                />
              </div>
            </div>

            <div className="space-y-4">
              <label className="block text-xs uppercase tracking-[0.2em] text-muted font-bold">Explanation</label>
              <textarea 
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Explain the correct answer (optional)..."
                className="w-full h-40 p-8 bg-paper border border-ink/5 rounded-3xl focus:outline-none focus:border-accent font-serif text-xl leading-relaxed shadow-inner"
              />
            </div>

            <div className="flex items-center gap-4 pt-4">
              {editingDate && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-8 py-8 border border-ink/10 hover:bg-ink/5 text-ink font-serif text-2xl rounded-2xl transition-all shadow-sm"
                >
                  Cancel Edit
                </button>
              )}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                disabled={status === 'loading'}
                type="submit"
                className={`flex-grow py-8 rounded-2xl font-serif text-3xl flex items-center justify-center gap-4 transition-all shadow-2xl
                  ${status === 'success' ? 'bg-green-600 text-white' : 'bg-ink text-paper'}
                `}
              >
                {status === 'loading' ? 'Saving...' : status === 'success' ? 'Quiz Published' : (
                  <>
                    <Send size={28} />
                    <span>{editingDate ? 'Update Quiz Question' : 'Save Quiz'}</span>
                  </>
                )}
              </motion.button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-all font-serif
        ${active ? 'bg-ink text-paper shadow-md' : 'text-muted hover:text-ink'}
      `}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
