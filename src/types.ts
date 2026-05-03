export interface User {
  id: string;
  username: string;
  score: number;
  solved_today?: boolean;
  isAdmin?: boolean;
}

export interface QuizData {
  id: number;
  question: string;
  options: string[];
  date: string;
}

export interface LeaderboardEntry {
  username: string;
  score: number;
}
