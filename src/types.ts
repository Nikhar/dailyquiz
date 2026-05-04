export interface User {
  id: string;
  username: string;
  score: number;
  solved_today?: boolean;
  isAdmin?: boolean;
}

export interface QuizData {
  id: number;
  challengeId?: string;
  question: string;
  correctAnswers: string[];
  date: string;
  explanation?: string;
}

export interface LeaderboardEntry {
  username: string;
  score: number;
}

export interface AdminReviewFlag {
  id: string;
  challengeId: string;
  userId: string;
  username: string;
  quizDate: string;
  question: string;
  submittedAnswer: string;
  flaggedAt: any;
  isPending: boolean;
  approved: boolean;
}

export interface ChallengeSeries {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isTimed?: boolean;
  createdAt: any;
}
