import React from 'react';
import { Shield, FileText, UploadCloud, Activity, Lock, User, LogOut, LogIn, Settings } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, user, onOpenAuth, onLogout }) {
  return (
    <header className="sticky top-0 z-40 glass-panel border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Brand Logo & HTTPS Badge */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="p-2 bg-gradient-to-tr from-sky-600 to-indigo-600 rounded-xl shadow-lg shadow-sky-500/20 text-white">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-indigo-300 to-amber-300">
                  LegalBot AI
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <Lock className="w-2.5 h-2.5" /> HTTPS SECURED
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Enterprise Contract Intelligence Engine</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'dashboard'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <FileText className="w-4 h-4" /> Dashboard & Library
            </button>

            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'upload'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <UploadCloud className="w-4 h-4" /> Upload & Analyze
            </button>

            {user && user.role === 'admin' && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === 'admin'
                    ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white shadow-md shadow-amber-900/30'
                    : 'text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10'
                }`}
              >
                <Settings className="w-4 h-4" /> Admin
              </button>
            )}

            <button
              onClick={() => setActiveTab('diagnostics')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'diagnostics'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Activity className="w-4 h-4" /> System Health
            </button>
          </nav>

          {/* User Auth Profile / Login Button */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-semibold text-slate-200">{user.full_name || user.email}</p>
                  <p className="text-[10px] text-sky-400 font-mono">Role: {user.role || 'user'}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shadow-md">
                  <User className="w-4 h-4" />
                </div>
                <button
                  onClick={onLogout}
                  title="Log out"
                  className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white px-4 py-1.5 rounded-lg text-xs font-semibold shadow-lg shadow-sky-900/40 transition cursor-pointer"
              >
                <LogIn className="w-4 h-4" /> Sign In / Register
              </button>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}
