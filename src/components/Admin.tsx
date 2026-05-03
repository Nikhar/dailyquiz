import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { doc, setDoc, collection, query, orderBy, getDocs, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../App';
import { Send, Calendar, List, Plus, Trash2, Edit3, ChevronRight } from 'lucide-react';

interface PastQuiz {
  id: string;
  date: string;
  question: string;
}

export default function Admin() {
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('list');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [pastQuizzes, setPastQuizzes] = useState<PastQuiz[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);

  useEffect(() => {
    if (activeTab === 'list') {
      fetchPastQuizzes();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    
    try {
      await setDoc(doc(db, 'quizzes', date), {
        date,
        question,
        options,
        correctIndex,
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
    setOptions(['', '', '', '']);
    setCorrectIndex(0);
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

  const updateOption = (idx: number, val: string) => {
    const newOptions = [...options];
    newOptions[idx] = val;
    setOptions(newOptions);
  };

  const wordCount = question.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="max-w-5xl mx-auto py-12 px-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h2 className="text-5xl font-serif mb-2 tracking-tight">Admin Dashboard</h2>
          <p className="text-muted italic text-lg">Manage questions and quiz history.</p>
        </div>
        
        <div className="flex bg-paper border border-ink/10 rounded-xl p-1 p-x-2">
          <TabButton 
            active={activeTab === 'list'} 
            onClick={() => setActiveTab('list')}
            icon={<List size={18} />}
            label="Quiz List"
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
        {activeTab === 'list' ? (
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
        ) : (
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

            <div className="space-y-6">
              <label className="block text-xs uppercase tracking-[0.2em] text-muted font-bold">Options</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-5 p-2 pr-4 bg-paper rounded-2xl border border-ink/5">
                    <div className="relative flex items-center justify-center pl-4">
                      <input 
                        type="radio" 
                        name="correct" 
                        required
                        checked={correctIndex === idx}
                        onChange={() => setCorrectIndex(idx)}
                        className="w-6 h-6 accent-accent cursor-pointer"
                      />
                    </div>
                    <input 
                      type="text" 
                      required
                      value={opt}
                      onChange={(e) => updateOption(idx, e.target.value)}
                      placeholder={`Option ${idx + 1}`}
                      className="flex-grow p-4 bg-transparent focus:outline-none font-serif text-lg"
                    />
                  </div>
                ))}
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
