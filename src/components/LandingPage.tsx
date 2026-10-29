import React, { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { AlertCircle } from 'lucide-react';
import { GitHubIcon } from './GitHubIcon';
import { THEME } from '@/config/theme';

interface LandingPageProps {
  isConfigured: boolean;
  initialBanner?: { type: 'info' | 'success' | 'error'; message: string } | null;
}

export function LandingPage({ isConfigured, initialBanner = null }: LandingPageProps) {
  const [banner] = useState(initialBanner);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const checkLogin = async () => {
      try {
        const res = await fetch('/api/auth/github/status');
        if (res.ok) {
          const data = await res.json();
          if (data.isConnected) {
            window.location.replace('/');
            return;
          }
        }
      } catch {
        // ignore
      }
      timer = setTimeout(checkLogin, 3000);
    };

    timer = setTimeout(checkLogin, 3000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkLogin();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <div
      className="relative min-h-screen w-full bg-[#0c0d12] text-zinc-100 flex flex-col justify-center items-center p-4 overflow-hidden select-none font-sans"
      style={{ backgroundColor: THEME.canvasBg }}
    >
      {/* Ambient Glassmorphic Glow Blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className={`absolute -top-32 -left-32 ${THEME.ambientBlobs.topLeft.size} ${THEME.ambientBlobs.topLeft.blur} rounded-full`}
          style={{ backgroundColor: THEME.ambientBlobs.topLeft.color }}
        />
        <div
          className={`absolute -bottom-32 -right-32 ${THEME.ambientBlobs.bottomRight.size} ${THEME.ambientBlobs.bottomRight.blur} rounded-full`}
          style={{ backgroundColor: THEME.ambientBlobs.bottomRight.color }}
        />
        <div
          className={`absolute -bottom-32 left-1/4 ${THEME.ambientBlobs.bottomLeft.size} ${THEME.ambientBlobs.bottomLeft.blur} rounded-full`}
          style={{ backgroundColor: THEME.ambientBlobs.bottomLeft.color }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm bg-white/[0.04] rounded-3xl p-7 shadow-[0_24px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)] shrink-0">
            <Icon icon="mdi:source-pull" className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-base text-zinc-100 tracking-tight leading-tight">
              Notificurom
            </div>
            <div className="text-xs text-zinc-400">Internal PR & Issue Board</div>
          </div>
        </div>

        {/* Banner */}
        {banner && (
          <div
            className={`p-3.5 rounded-2xl text-xs flex items-center gap-2 ${
              banner.type === 'error'
                ? 'bg-rose-500/15 text-rose-300'
                : 'bg-white/[0.06] text-zinc-300'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{banner.message}</span>
          </div>
        )}

        {/* Action */}
        {isConfigured ? (
          <a
            href="/api/auth/github/login"
            className="w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)] font-semibold text-xs transition-all"
          >
            <GitHubIcon className="w-4 h-4" />
            <span>Sign in with GitHub</span>
          </a>
        ) : (
          <div className="p-3.5 rounded-2xl bg-white/[0.04] text-xs text-zinc-400 space-y-1">
            <div className="font-semibold text-zinc-200">Configuration Required</div>
            <p>
              Set <code className="text-amber-300 font-mono">GITHUB_CLIENT_ID</code> and{' '}
              <code className="text-amber-300 font-mono">GITHUB_CLIENT_SECRET</code> in the environment.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
