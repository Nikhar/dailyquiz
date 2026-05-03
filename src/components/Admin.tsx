import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { doc, setDoc, collection, query, orderBy, getDocs, deleteDoc, where, updateDoc, arrayUnion, runTransaction } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../App';
import { Send, Calendar, List, Plus, Trash2, ChevronRight, ShieldAlert, Check, X } from 'lucide-react';
import { AdminReviewFlag } from '../types';

interface PastQuiz {
  id: string;
  date: string;
  question: string;
}

export default function Admin() {
  const [activeTab, setActiveTab] = useState<'create' | 'list' | 'reviews'>('list');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [question, setQuestion] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [explanation, setExplanation] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [pastQuizzes, setPastQuizzes] = useState<PastQuiz[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  
  const [pendingFlags, setPendingFlags] = useState<AdminReviewFlag[]>([]);
  const [loadingFlags, setLoadingFlags] = useState(false);

  useEffect(() => {
    if (activeTab === 'list') {
      fetchPastQuizzes();
    } else if (activeTab === 'reviews') {
      fetchPendingFlags();
    }
  }, [activeTab]);

  const fetchPastQuizzes = async () => {
    setLoadingQuizzes(true);
    try {
      const q = query(collection(db, 'quizzes'), orderBy('date', 'desc'));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    
    const answersArray = correctAnswer.split(',').map(a => a.trim()).filter(Boolean);
    try {
      await setDoc(doc(db, 'quizzes', date), {
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
      }, 1500);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `quizzes/${date}`);
      setStatus('idle');
    }
  };

  const resetForm = () => {
    setQuestion('');
    setCorrectAnswer('');
    setExplanation('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this quiz?")) return;
    try {
      await deleteDoc(doc(db, 'quizzes', id));
      setPastQuizzes(prev => prev.filter(q => q.id !== id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `quizzes/${id}`);
    }
  };

  const handleApproveSynonym = async (flag: AdminReviewFlag) => {
    try {
      await runTransaction(db, async (transaction) => {
        const quizRef = doc(db, 'quizzes', flag.quizDate);
        const flagRef = doc(db, 'admin_reviews', flag.id);
        const userRef = doc(db, 'users', flag.userId);
        const leaderboardRef = doc(db, 'leaderboard', flag.userId);
        const responseRef = doc(db, 'quizzes', flag.quizDate, 'responses', flag.userId);

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

        const currentScore = userSnap.data().score || 0;
        const newScore = currentScore + 10;
        transaction.update(userRef, { score: newScore });
        transaction.update(leaderboardRef, { score: newScore });
      });

      setPendingFlags(prev => prev.filter(f => f.id !== flag.id));
      alert("Synonym approved, scores updated, and response marked correct successfully!");
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
          <p className="text-muted italic text-lg">Manage questions and quiz history.</p>
        </div>
        
        <div className="flex bg-paper border border-ink/10 rounded-xl p-1 gap-1 flex-wrap shadow-sm">
          <TabButton 
            active={activeTab === 'list'} 
            onClick={() => setActiveTab('list')}
            icon={<List size={18} />}
            label="Quiz List"
          />
          <TabButton 
            active={activeTab === 'reviews'} 
            onClick={() => setActiveTab('reviews')}
            icon={<ShieldAlert size={18} />}
            label="Pending Reviews"
          />
          <TabButton 
            active={activeTab === 'create'} 
            onClick={() => setActiveTab('create')}
            icon={<Plus size={18} />}
            label="Create New"
          />
        </div>
      </header>

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
              <div className="text-center py-20 italic opacity-50">Loading quizzes...</div>
            ) : pastQuizzes.length > 0 ? (
              <div className="grid gap-4">
                {pastQuizzes.map((q) => (
                  <div key={q.id} className="bg-white border border-ink/5 p-6 rounded-2xl flex items-center justify-between group hover:border-accent/30 transition-colors shadow-sm">
                    <div className="space-y-1 flex-grow pr-8">
                      <div className="text-xs uppercase tracking-widest text-accent font-bold">{new Date(q.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      <h3 className="font-serif text-xl line-clamp-1">{q.question}</h3>
                    </div>
                    <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleDelete(q.id)}
                        className="p-3 text-muted hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 size={20} />
                      </button>
                      <div className="text-muted"><ChevronRight size={20} /></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-white border border-dashed border-ink/10 rounded-3xl">
                <p className="text-muted italic mb-4">No quizzes found.</p>
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

        {activeTab === 'create' && (
          <motion.form
            key="create"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            onSubmit={handleSubmit}
            className="bg-white border border-ink/10 rounded-3xl p-10 shadow-xl shadow-ink/5 space-y-10"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <label className="block text-xs uppercase tracking-[0.2em] text-muted font-bold">Quiz Date</label>
                <div className="flex items-center gap-3 p-5 bg-paper border border-ink/5 rounded-2xl focus-within:border-accent transition-colors">
                  <Calendar className="text-accent" size={24} />
                  <input 
                    type="date" 
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-transparent focus:outline-none font-serif text-xl w-full"
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
                required
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Explain the correct answer..."
                className="w-full h-40 p-8 bg-paper border border-ink/5 rounded-3xl focus:outline-none focus:border-accent font-serif text-xl leading-relaxed shadow-inner"
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              disabled={status === 'loading'}
              type="submit"
              className={`w-full py-8 rounded-2xl font-serif text-3xl flex items-center justify-center gap-4 transition-all shadow-2xl
                ${status === 'success' ? 'bg-green-600 text-white' : 'bg-ink text-paper'}
              `}
            >
              {status === 'loading' ? 'Saving...' : status === 'success' ? 'Quiz Published' : (
                <>
                  <Send size={28} />
                  Save Quiz
                </>
              )}
            </motion.button>
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
