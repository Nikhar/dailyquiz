import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QuizData, User } from '../types';
import { CheckCircle2, XCircle, Trophy, Flag, AlertCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc, getDocs, addDoc, collection, query, where, serverTimestamp, runTransaction } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../App';

function calculateLevenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // Deletion
          matrix[i][j - 1] + 1,      // Insertion
          matrix[i - 1][j - 1] + 1   // Substitution
        );
      }
    }
  }
  return matrix[a.length][b.length];
}

function checkSimilarity(wordA: string, wordB: string): number {
  const dist = calculateLevenshteinDistance(wordA, wordB);
  const maxLen = Math.max(wordA.length, wordB.length);
  if (maxLen === 0) return 1.0;
  return 1.0 - dist / maxLen;
}

interface QuizProps {
  user: User;
  onUpdateUser: (updates: Partial<User>) => void;
}

export default function Quiz({ user, onUpdateUser }: QuizProps) {
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [solved, setSolved] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [result, setResult] = useState<{ isCorrect: boolean; explanation: string } | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [flagged, setFlagged] = useState(false);
  const [flagLoading, setFlagLoading] = useState(false);

  useEffect(() => {
    fetchTodayQuiz();
  }, []);

  const fetchTodayQuiz = async () => {
    const today = new Date().toISOString().split('T')[0];
    const quizPath = `quizzes/${today}`;
    try {
      const quizRef = doc(db, 'quizzes', today);
      const quizSnap = await getDoc(quizRef);
      
      if (quizSnap.exists()) {
        setQuiz({ id: 0, ...quizSnap.data() } as any);
        
        // Check if user solved this specific quiz
        const responsePath = `quizzes/${today}/responses/${user.id}`;
        try {
          const responseRef = doc(db, 'quizzes', today, 'responses', user.id);
          const responseSnap = await getDoc(responseRef);
          if (responseSnap.exists()) {
            setSolved(true);
            const respData = responseSnap.data();
            const quizData = quizSnap.data();
            setResult({
              isCorrect: respData.isCorrect,
              explanation: quizData.explanation
            });
          }
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, responsePath);
        }

        // Check if user flagged a flag today
        try {
          const flagQuery = query(
            collection(db, 'admin_reviews'),
            where('userId', '==', user.id),
            where('quizDate', '==', today)
          );
          const flagSnap = await getDocs(flagQuery);
          if (!flagSnap.empty) {
            setFlagged(true);
          }
        } catch (e) {
          console.error("Failed to fetch user flagged flags", e);
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, quizPath);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!typedAnswer.trim() || !quiz) return;
    const today = new Date().toISOString().split('T')[0];
    const writePath = `multiple: users/${user.id}, leaderboard/${user.id}, quizzes/${today}/responses/${user.id}`;
    
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', user.id);
        const leaderboardRef = doc(db, 'leaderboard', user.id);
        const responseRef = doc(db, 'quizzes', today, 'responses', user.id);

        const correctAnswers: string[] = quiz.correctAnswers || [];
        const lowerInput = typedAnswer.trim().toLowerCase();
        const isCorrect = correctAnswers.some(ans => checkSimilarity(lowerInput, ans.toLowerCase()) > 0.85);

        const scoreInc = isCorrect ? 10 : 0;
        const newScore = user.score + scoreInc;

        transaction.set(responseRef, {
          userId: user.id,
          quizId: today,
          isCorrect,
          answeredAt: serverTimestamp()
        });

        transaction.update(userRef, {
          score: newScore,
          last_solved_at: today
        });

        transaction.update(leaderboardRef, {
          score: newScore
        });

        setResult({
          isCorrect,
          explanation: quiz.explanation
        });
        setSolved(true);
        onUpdateUser({ score: newScore, solved_today: true });
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, writePath);
    }
  };

  const handleFlagForReview = async () => {
    if (flagged || !quiz) return;
    setFlagLoading(true);
    const today = new Date().toISOString().split('T')[0];
    try {
      await addDoc(collection(db, 'admin_reviews'), {
        userId: user.id,
        username: user.username,
        quizDate: today,
        question: quiz.question,
        submittedAnswer: typedAnswer,
        flaggedAt: serverTimestamp(),
        isPending: true,
        approved: false
      });
      setFlagged(true);
      alert("Your answer has been flagged for synonym review! If approved, you will automatically receive points.");
    } catch (e) {
      console.error("Failed to submit flag", e);
      alert("Failed to flag answer. Please try again.");
    } finally {
      setFlagLoading(false);
    }
  };

  if (loading) return <div className="text-center py-20 font-serif italic opacity-50">Loading today's quiz...</div>;
  if (!quiz) return <div className="text-center py-20 font-serif opacity-50">No question found for today. Check back later!</div>;

  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-12"
      >
        <header className="text-center space-y-4">
          <div className="text-xs uppercase tracking-[0.3em] text-muted">Quiz for {new Date(quiz.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
          <h2 className="text-4xl md:text-5xl font-serif text-ink leading-tight">Today's Question</h2>
          <div className="w-24 h-px bg-ink/10 mx-auto"></div>
        </header>

        <section className="prose prose-xl max-w-none">
          <p className="text-xl md:text-2xl font-serif leading-relaxed text-ink/90 italic">
            {quiz.question}
          </p>
        </section>

        <div className="space-y-4 pt-12">
          <div className="flex items-center gap-3 p-5 bg-white border border-ink/10 rounded-2xl focus-within:border-accent transition-colors shadow-sm">
            <input 
              type="text" 
              disabled={solved}
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              placeholder={solved ? "Quiz completed for today" : "Type your answer here..."}
              className="bg-transparent focus:outline-none font-serif text-xl w-full disabled:opacity-50"
            />
          </div>
        </div>

        {!solved && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSubmit}
            disabled={!typedAnswer.trim()}
            className="w-full py-5 bg-ink text-paper rounded-xl font-serif text-xl disabled:opacity-50 shadow-lg"
          >
            Submit Answer
          </motion.button>
        )}

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-8 bg-paper border border-ink/10 rounded-2xl space-y-6"
            >
              <div className="flex items-center gap-4 text-2xl font-serif">
                {result.isCorrect ? (
                  <div className="flex items-center gap-3 text-green-700">
                    <Trophy className="w-8 h-8" />
                    <span>Correct!</span>
                  </div>
                ) : (
                  <div className="text-red-700 space-y-1 w-full">
                    <div>Not quite right.</div>
                    <div className="text-lg font-sans text-muted leading-relaxed">
                      Accepted answers: <span className="font-serif font-bold text-ink">{(quiz.correctAnswers || []).join(', ')}</span>
                    </div>
                  </div>
                )}
              </div>
              
              <p className="text-ink/70 leading-relaxed italic text-lg border-l-4 border-ink/10 pl-6">
                {result.explanation}
              </p>
              
              <div className="text-center pt-4">
                <div className="text-xs uppercase tracking-widest text-muted">Points</div>
                <div className="text-3xl font-serif mt-1">+{result.isCorrect ? 10 : 0}</div>
              </div>

              {!result.isCorrect && (
                <div className="pt-6 border-t border-ink/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
                  <div className="text-sm text-muted flex items-center gap-2">
                    <AlertCircle size={16} className="text-accent shrink-0" />
                    <span>Think your synonym should be accepted?</span>
                  </div>
                  <button
                    disabled={flagged || flagLoading}
                    onClick={handleFlagForReview}
                    className={`px-5 py-3 rounded-xl font-serif text-sm border transition-all flex items-center gap-2 shadow-sm shrink-0
                      ${flagged ? 'bg-ink/5 border-ink/10 text-muted cursor-not-allowed' : 'bg-paper hover:bg-ink/5 border-ink/10 text-ink'}
                    `}
                  >
                    <Flag size={14} className={flagged ? 'text-muted' : 'text-accent'} />
                    <span>{flagged ? 'Response Flagged' : flagLoading ? 'Submitting Flag...' : 'Flag Answer for Review'}</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {solved && !result && (
             <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-8 bg-ink/5 border border-ink/10 rounded-2xl text-center space-y-4"
             >
               <h3 className="text-2xl font-serif">You've finished today's quiz.</h3>
               <p className="text-muted italic">Check back tomorrow for a new question.</p>
             </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
