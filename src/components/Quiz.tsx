import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QuizData, User, ChallengeSeries } from '../types';
import { CheckCircle2, XCircle, Trophy, Flag, AlertCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc, getDocs, addDoc, collection, query, where, serverTimestamp, runTransaction, orderBy, onSnapshot } from 'firebase/firestore';
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
  challenge: ChallengeSeries;
}

export default function Quiz({ user, onUpdateUser, challenge }: QuizProps) {
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [solved, setSolved] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [result, setResult] = useState<{ isCorrect: boolean; explanation: string } | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [flagged, setFlagged] = useState(false);
  const [flagLoading, setFlagLoading] = useState(false);
  
  // Completed/Past series archive states
  const [pastQuizzesList, setPastQuizzesList] = useState<QuizData[]>([]);
  const [isPastChallenge, setIsPastChallenge] = useState(false);

  // Websocket Unsubscription reference states to safeguard memory stability
  const unsubQuiz = useRef<(() => void) | null>(null);
  const unsubResp = useRef<(() => void) | null>(null);
  const unsubFlag = useRef<(() => void) | null>(null);

  const cleanSubscriptions = () => {
    if (unsubQuiz.current) { unsubQuiz.current(); unsubQuiz.current = null; }
    if (unsubResp.current) { unsubResp.current(); unsubResp.current = null; }
    if (unsubFlag.current) { unsubFlag.current(); unsubFlag.current = null; }
  };

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const ended = !challenge.isActive || todayStr > challenge.endDate;
    setIsPastChallenge(ended);
    
    cleanSubscriptions();

    if (ended) {
      fetchPastQuizzesArchive();
    } else {
      fetchTodayQuiz();
    }

    return () => cleanSubscriptions();
  }, [challenge.id]);

  const fetchPastQuizzesArchive = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'challenges', challenge.id, 'quizzes'), orderBy('date', 'asc'));
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as unknown as QuizData[];
      setPastQuizzesList(list);
      if (list.length > 0) {
        loadQuizResponsesForDate(list[0]);
      }
    } catch (e) {
      console.error("Failed to fetch past quizzes archive", e);
    } finally {
      setLoading(false);
    }
  };

  const loadQuizResponsesForDate = (targetQuiz: QuizData) => {
    cleanSubscriptions();
    
    setQuiz(targetQuiz);
    setSolved(false);
    setTypedAnswer('');
    setResult(null);
    setFlagged(false);

    const responseRef = doc(db, 'challenges', challenge.id, 'quizzes', targetQuiz.date, 'responses', user.id);
    unsubResp.current = onSnapshot(responseRef, (responseSnap) => {
      if (responseSnap.exists()) {
        setSolved(true);
        const respData = responseSnap.data();
        setResult({
          isCorrect: respData.isCorrect,
          explanation: targetQuiz.explanation || ''
        });
      }
    }, (e) => {
      console.error("Failed Archived responses onSnapshot subscriber stream", e);
    });

    const flagQuery = query(
      collection(db, 'admin_reviews'),
      where('userId', '==', user.id),
      where('quizDate', '==', targetQuiz.date)
    );
    unsubFlag.current = onSnapshot(flagQuery, (flagSnap) => {
      setFlagged(!flagSnap.empty);
    }, (e) => {
      console.error("Failed Archived flags onSnapshot subscriber stream", e);
    });
  };

  const handleSwitchPastQuiz = (dateStr: string) => {
    const foundQuiz = pastQuizzesList.find(q => q.date === dateStr);
    if (foundQuiz) {
      loadQuizResponsesForDate(foundQuiz);
    }
  };

  const fetchTodayQuiz = () => {
    const today = new Date().toISOString().split('T')[0];
    const quizPath = `challenges/${challenge.id}/quizzes/${today}`;
    const quizRef = doc(db, 'challenges', challenge.id, 'quizzes', today);
    
    unsubQuiz.current = onSnapshot(quizRef, (quizSnap) => {
      if (quizSnap.exists()) {
        const quizData = { id: 0, ...quizSnap.data() } as QuizData;
        setQuiz(quizData);
        
        // Listen to Player response document in real-time Cache-First
        const responseRef = doc(db, 'challenges', challenge.id, 'quizzes', today, 'responses', user.id);
        unsubResp.current = onSnapshot(responseRef, (responseSnap) => {
          if (responseSnap.exists()) {
            setSolved(true);
            const respData = responseSnap.data();
            setResult({
              isCorrect: respData.isCorrect,
              explanation: quizData.explanation || ''
            });
          }
        }, (e) => {
          console.error("Failed response onSnapshot subscriber stream", e);
        });

        // Listen to User Flag reviews today in real-time Cache-First
        const flagQuery = query(
          collection(db, 'admin_reviews'),
          where('userId', '==', user.id),
          where('quizDate', '==', today)
        );
        unsubFlag.current = onSnapshot(flagQuery, (flagSnap) => {
          setFlagged(!flagSnap.empty);
        }, (e) => {
          console.error("Failed flagged reviews onSnapshot subscriber stream", e);
        });
      } else {
        setQuiz(null);
      }
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, quizPath);
      setLoading(false);
    });
  };

  const handleSubmit = async () => {
    if (!typedAnswer.trim() || !quiz) return;

    const correctAnswers: string[] = quiz.correctAnswers || [];
    const lowerInput = typedAnswer.trim().toLowerCase();
    const isCorrect = correctAnswers.some(ans => checkSimilarity(lowerInput, ans.toLowerCase()) > 0.85);

    // 🛡️ Freezing database score updates if solving an archived/past challenge quiz
    if (isPastChallenge) {
      setResult({
        isCorrect,
        explanation: quiz.explanation || ''
      });
      setSolved(true);
      return;
    }

    // Otherwise, proceed with live Firestore score submission transaction:
    const today = new Date().toISOString().split('T')[0];
    const writePath = `multiple: users/${user.id}, challenges/${challenge.id}/leaderboard/${user.id}, challenges/${challenge.id}/quizzes/${today}/responses/${user.id}`;
    
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', user.id);
        const leaderboardRef = doc(db, 'challenges', challenge.id, 'leaderboard', user.id);
        const responseRef = doc(db, 'challenges', challenge.id, 'quizzes', today, 'responses', user.id);

        const scoreInc = isCorrect ? 10 : 0;
        
        // 1. Perform ALL reads first
        const userSnap = await transaction.get(userRef);
        const leaderboardSnap = await transaction.get(leaderboardRef);

        // 2. Process data state calculations
        const newGlobalScore = (userSnap.exists() ? (userSnap.data().score || 0) : user.score) + scoreInc;
        const currentChallengeScore = leaderboardSnap.exists() ? (leaderboardSnap.data().score || 0) : 0;
        const newChallengeScore = currentChallengeScore + scoreInc;

        // 3. Queue standard database writes
        transaction.set(responseRef, {
          userId: user.id,
          quizId: today,
          isCorrect,
          answeredAt: serverTimestamp()
        });

        transaction.update(userRef, {
          score: newGlobalScore,
          last_solved_at: today
        });

        transaction.set(leaderboardRef, {
          username: user.username,
          score: newChallengeScore
        }, { merge: true });

        setResult({
          isCorrect,
          explanation: quiz.explanation || ''
        });
        setSolved(true);
        onUpdateUser({ score: newGlobalScore, solved_today: true });
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, writePath);
    }
  };

  const handleFlagForReview = async () => {
    if (flagged || !quiz) return;
    setFlagLoading(true);
    
    // Target either past quiz date or today dynamically
    const flagDate = isPastChallenge ? quiz.date : new Date().toISOString().split('T')[0];
    try {
      await addDoc(collection(db, 'admin_reviews'), {
        userId: user.id,
        challengeId: challenge.id,
        username: user.username,
        quizDate: flagDate,
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

  if (loading) return <div className="text-center py-20 font-serif italic opacity-50">Loading series questions...</div>;
  if (!quiz) return <div className="text-center py-20 font-serif opacity-50">No question found for this challenge series. Check back later!</div>;

  return (
    <div className="max-w-3xl mx-auto py-12 px-6 animate-fadeIn">
      {isPastChallenge && pastQuizzesList.length > 0 && (
        <div className="flex items-center gap-4 mb-12 p-4 bg-white rounded-xl border border-ink/5 shadow-sm max-w-md mx-auto">
          <span className="text-xs uppercase tracking-wider text-muted font-bold shrink-0">Select Question:</span>
          <select
            value={quiz?.date}
            onChange={(e) => handleSwitchPastQuiz(e.target.value)}
            className="bg-transparent font-serif font-bold text-accent text-lg focus:outline-none w-full cursor-pointer"
          >
            {pastQuizzesList.map((q, idx) => (
              <option key={q.date} value={q.date}>
                Day {idx + 1} ({new Date(q.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
              </option>
            ))}
          </select>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-12"
      >
        <header className="text-center space-y-4">
          <div className="text-xs uppercase tracking-[0.3em] text-muted">Quiz for {new Date(quiz.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
          <h2 className="text-4xl md:text-5xl font-serif text-ink leading-tight">✍️ Series Question</h2>
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
              
              {result.explanation && (
                <p className="text-ink/70 leading-relaxed italic text-lg border-l-4 border-ink/10 pl-6">
                  {result.explanation}
                </p>
              )}
              
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
