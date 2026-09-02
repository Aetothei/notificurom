'use client';

import React, { useState } from 'react';
import {
  CheckSquare,
  LogIn,
  Settings,
  Layers,
  GitPullRequest,
  Clock,
  Radio,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { GitHubIcon } from './GitHubIcon';
import { SettingsModal } from './SettingsModal';

interface LandingPageProps {
  isConfigured: boolean;
  initialBanner?: { type: 'info' | 'success' | 'error'; message: string } | null;
}

export function LandingPage({ isConfigured, initialBanner = null }: LandingPageProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [configured, setConfigured] = useState(isConfigured);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Top Bar */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <CheckSquare className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-zinc-100 tracking-tight">Notificurom</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-semibold uppercase">
                GTD
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg border border-zinc-800/80 transition-colors"
              title="Configure Settings & OAuth"
            >
              <Settings className="w-4 h-4" />
            </button>
            {configured ? (
              <a
                href="/api/auth/github/login"
                className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign in with GitHub</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-semibold transition-colors"
              >
                <Settings className="w-3.5 h-3.5 text-zinc-400" />
                <span>Configure OAuth</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Optional Banner */}
      {initialBanner && (
        <div
          className={`px-4 py-2.5 border-b text-xs flex items-center justify-center text-center ${
            initialBanner.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
              : initialBanner.type === 'error'
              ? 'bg-rose-950/60 border-rose-800/60 text-rose-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-300'
          }`}
        >
          <span>{initialBanner.message}</span>
        </div>
      )}

      {/* Main Hero */}
      <main className="flex-1 flex flex-col justify-center items-center px-4 py-16 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/60 border border-indigo-800/50 text-indigo-300 text-xs font-medium mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Multi-User & Multi-Source GTD Workflow</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white mb-5 leading-tight">
          Achieve <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-300 to-indigo-200">Zero-Inbox</span> for your Code Reviews & Tasks
        </h1>

        <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mb-10 leading-relaxed">
          Automatically pull assigned pull requests, review requests, and issues into an actionable Getting Things Done Kanban board. No registration required — just sign in with GitHub and start working.
        </p>

        {/* CTA Card */}
        <div className="w-full max-w-md bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 shadow-2xl backdrop-blur-xl mb-14">
          {configured ? (
            <div className="space-y-4">
              <a
                href="/api/auth/github/login"
                className="w-full flex items-center justify-center gap-3 px-5 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-indigo-600/20 hover:scale-[1.01]"
              >
                <GitHubIcon className="w-5 h-5" />
                <span>Continue with GitHub</span>
              </a>
              <p className="text-xs text-zinc-500">
                Instant login • User-scoped board • Automatic token refresh
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-left space-y-1">
                <div className="text-sm font-semibold text-zinc-200">GitHub App Setup Required</div>
                <div className="text-xs text-zinc-400">
                  Please configure your GitHub Client ID & Secret to enable one-click OAuth login.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 rounded-xl font-semibold text-sm transition-all"
              >
                <Settings className="w-4 h-4 text-indigo-400" />
                <span>Configure OAuth Credentials</span>
              </button>
            </div>
          )}
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left w-full">
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center text-indigo-400">
              <GitPullRequest className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-sm text-zinc-100">Automated Ingestion</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Auto-discovers your assigned PRs, issues, and review requests across all repositories.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-purple-950/80 border border-purple-800/60 flex items-center justify-center text-purple-400">
              <Layers className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-sm text-zinc-100">GTD Kanban Flow</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Prioritize with Inbox, Next Actions, In Progress, Waiting On, and Done columns.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
              <Clock className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-sm text-zinc-100">Age & Stale Tracking</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Real-time age badges highlight neglected reviews and tasks before they turn stale.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-sky-950/80 border border-sky-800/60 flex items-center justify-center text-sky-400">
              <Radio className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-sm text-zinc-100">Multi-Source Ready</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Architected for GitHub today, and ready to ingest Slack, Linear, and Jira notifications.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-6 text-center text-xs text-zinc-600">
        <div className="flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-zinc-500" />
          <span>Notificurom GTD • Isolated User Data & DB Refresh Token Storage</span>
        </div>
      </footer>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaveSuccess={() => {
          fetch('/api/auth/github/status')
            .then((res) => res.json())
            .then((data) => setConfigured(data.isConfigured || false))
            .catch(() => {});
        }}
      />
    </div>
  );
}
