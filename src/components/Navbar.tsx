import React from 'react';
import { User } from '../types';
import { LogOut, BookOpen, BarChart3, Bell, Send } from 'lucide-react';
import { motion } from 'motion/react';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  onNavigate: (view: 'quiz' | 'leaderboard' | 'notifs' | 'admin') => void;
  currentView: string;
}

export default function Navbar({ user, onLogout, onNavigate, currentView }: NavbarProps) {
  return (
    <nav className="border-b border-ink/10 bg-paper/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
        <div 
          onClick={() => onNavigate('quiz')}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <div className="w-10 h-10 bg-ink text-paper flex items-center justify-center rounded-lg font-serif text-2xl font-bold group-hover:bg-accent transition-colors">DQ</div>
          <h1 className="hidden md:block text-2xl font-serif tracking-tight">Daily Quiz</h1>
        </div>

        {user && (
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1 md:gap-4 h-full">
              <NavButton 
                active={currentView === 'quiz'} 
                onClick={() => onNavigate('quiz')}
                icon={<BookOpen size={20} />}
                label="Daily Quiz"
              />
              <NavButton 
                active={currentView === 'leaderboard'} 
                onClick={() => onNavigate('leaderboard')}
                icon={<BarChart3 size={20} />}
                label="Leaderboard"
              />
              <NavButton 
                active={currentView === 'notifs'} 
                onClick={() => onNavigate('notifs')}
                icon={<Bell size={20} />}
                label="Notifications"
              />
              {user.isAdmin && (
                <NavButton 
                  active={currentView === 'admin'} 
                  onClick={() => onNavigate('admin')}
                  icon={<Send size={20} />}
                  label="Admin"
                />
              )}
            </div>

            <div className="h-8 w-px bg-ink/10"></div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <div className="text-sm font-serif line-clamp-1">{user.username}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted">{user.score} Points</div>
              </div>
              <button 
                onClick={onLogout}
                className="p-2 hover:bg-ink/5 rounded-full transition-colors text-muted hover:text-ink"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all relative
        ${active ? 'text-ink' : 'text-muted hover:text-ink'}
      `}
    >
      {icon}
      <span className="hidden md:inline text-sm font-serif">{label}</span>
      {active && (
        <motion.div 
          layoutId="nav-pill"
          className="absolute inset-0 bg-ink/5 rounded-lg -z-10"
        />
      )}
    </button>
  );
}
