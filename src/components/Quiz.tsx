import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QuizData, User } from '../types';
import { CheckCircle2, XCircle, Trophy } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../App';

interface QuizProps {
  user: User;
  onUpdateUser: (updates: Partial<User>) => void;
}

export default function Quiz({ user, onUpdateUser }: QuizProps) {
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [solved, setSolved] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [result, setResult] = useState<{ isCorrect: boolean; explanation: string; correctIndex: number } | null>(null);
  const [loading, setLoading] = useState(true);

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
              explanation: quizData.explanation,
              correctIndex: quizData.correctIndex
            });
          }
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, responsePath);
        }
      } else {
        // Optional: Seed for demo if no quiz exists
        await seedDefaultQuiz(today);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, quizPath);
    } finally {
      setLoading(false);
    }
  };

  const seedDefaultQuiz = async (date: string) => {
    const verboseQuestion = `In the grand tapestry of human endeavor, few disciplines offer as profound a reconciliation between the abstract and the tangible as architecture... [Truncated for brevity in seeding code, but you get the idea]`;
    const defaultQuiz = {
      date,
      question: "Considering the architectural evolution of the Renaissance, which structural element allowed for massive domes to be placed upon square bases, essentially reconciling circular and rectilinear geometries through curved triangular sections?",
      options: ['The Flying Buttress', 'The Pointed Arch', 'The Pendentive', 'The Groin Vault'],
      correctIndex: 2,
      explanation: 'The pendentive is a constructive device permitting the placing of a circular dome over a square room or an elliptical dome over a rectangular room.'
    };
    try {
      await setDoc(doc(db, 'quizzes', date), defaultQuiz);
      setQuiz({ id: 0, ...defaultQuiz } as any);
    } catch (e) {
        console.error("Failed to seed", e);
    }
  };

  const handleSubmit = async () => {
    if (selectedIdx === null || !quiz) return;
    const today = new Date().toISOString().split('T')[0];
    const writePath = `multiple: users/${user.id}, leaderboard/${user.id}, quizzes/${today}/responses/${user.id}`;
    
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', user.id);
        const leaderboardRef = doc(db, 'leaderboard', user.id);
        const responseRef = doc(db, 'quizzes', today, 'responses', user.id);

        const isCorrect = selectedIdx === quiz.correctIndex;
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
          explanation: quiz.explanation,
          correctIndex: quiz.correctIndex
        });
        setSolved(true);
        onUpdateUser({ score: newScore, solved_today: true });
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, writePath);
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
          {quiz.options.map((option, idx) => {
            const isCorrect = result?.correctIndex === idx;
            const isSelected = selectedIdx === idx;
            const isIncorrect = result && isSelected && !isCorrect;

            return (
              <motion.button
                key={idx}
                disabled={solved}
                whileHover={!solved ? { x: 5 } : {}}
                onClick={() => setSelectedIdx(idx)}
                className={`w-full text-left p-6 border rounded-xl transition-all flex items-center justify-between group
                  ${isSelected ? 'border-accent bg-accent/5' : 'border-ink/5 bg-white hover:border-ink/20 shadow-sm'}
                  ${result && isCorrect ? 'border-green-500 bg-green-50' : ''}
                  ${isIncorrect ? 'border-red-500 bg-red-50' : ''}
                  ${solved && !isSelected && !isCorrect ? 'opacity-50 grayscale' : ''}
                `}
              >
                <span className="text-lg font-serif">{option}</span>
                {result && isCorrect && <CheckCircle2 className="text-green-500 w-6 h-6" />}
                {isIncorrect && <XCircle className="text-red-500 w-6 h-6" />}
              </motion.button>
            );
          })}
        </div>

        {!solved && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSubmit}
            disabled={selectedIdx === null}
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
                  <div className="text-red-700">Not quite right.</div>
                )}
              </div>
              <p className="text-ink/70 leading-relaxed italic text-lg border-l-4 border-ink/10 pl-6">
                {result.explanation}
              </p>
              <div className="text-center pt-4">
                <div className="text-xs uppercase tracking-widest text-muted">Points</div>
                <div className="text-3xl font-serif mt-1">+{result.isCorrect ? 10 : 0}</div>
              </div>
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
