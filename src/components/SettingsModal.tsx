'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  LogIn,
  LogOut,
  Info,
  Radio,
} from 'lucide-react';
import { useMounted } from '@/lib/date-utils';
import { GitHubIcon } from './GitHubIcon';
import { UserSessionInfo } from './Navbar';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess?: () => void;
}

interface ConnectedAccount {
  id: string;
  provider: string;
  providerAccountId: string;
  hasRefreshToken: boolean;
  tokenExpiresAt: string | null;
}

export function SettingsModal({ isOpen, onClose, onSaveSuccess }: SettingsModalProps) {
  const mounted = useMounted();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [hasClientSecret, setHasClientSecret] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [user, setUser] = useState<UserSessionInfo | null>(null);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);

  const [queries, setQueries] = useState<string[]>([]);
  const [queryInput, setQueryInput] = useState('');
  const [autoArchive, setAutoArchive] = useState(true);
  const [syncInterval, setSyncInterval] = useState(15);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch('/api/settings');
        if (res.ok && isMounted) {
          const data = await res.json();
          setIsConnected(data.isConnected || false);
          setIsConfigured(data.isConfigured || false);
          setUser(data.user || null);
          setAccounts(data.accounts || []);
          setClientId(data.githubClientId || '');
          setHasClientSecret(data.hasClientSecret || false);
          setQueries(data.githubQueries || []);
          setAutoArchive(data.autoArchiveClosed ?? true);
          setSyncInterval(data.syncIntervalMinutes || 15);
        }
      } catch (err) {
        console.error('Failed to load settings', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      const res = await fetch('/api/auth/github/disconnect', { method: 'POST' });
      if (res.ok) {
        setIsConnected(false);
        setUser(null);
        setAccounts([]);
        setStatusMessage({ type: 'success', text: 'Disconnected from GitHub.' });
        onSaveSuccess?.();
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({ type: 'error', text: 'Failed to disconnect.' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Network error during disconnect.' });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleAddQuery = () => {
    if (queryInput.trim() && !queries.includes(queryInput.trim())) {
      setQueries([...queries, queryInput.trim()]);
      setQueryInput('');
    }
  };

  const handleRemoveQuery = (index: number) => {
    setQueries(queries.filter((_, idx) => idx !== index));
  };

  const handleAddPreset = (preset: string) => {
    if (!queries.includes(preset)) {
      setQueries([...queries, preset]);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setStatusMessage(null);

      const payload: Record<string, unknown> = {
        githubClientId: clientId.trim(),
        githubQueries: queries,
        autoArchiveClosed: autoArchive,
        syncIntervalMinutes: Number(syncInterval),
      };

      if (clientSecret.trim()) {
        payload.githubClientSecret = clientSecret.trim();
      }

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setStatusMessage({ type: 'success', text: 'Settings saved successfully!' });
        setClientSecret('');
        setIsConnected(data.isConnected || false);
        setIsConfigured(data.isConfigured || false);
        setUser(data.user || null);
        setAccounts(data.accounts || []);
        setClientId(data.githubClientId || '');
        setHasClientSecret(data.hasClientSecret || false);
        setQueries(data.githubQueries || []);
        setAutoArchive(data.autoArchiveClosed ?? true);
        setSyncInterval(data.syncIntervalMinutes || 15);
        onSaveSuccess?.();
        setTimeout(() => {
          setStatusMessage(null);
        }, 3000);
      } else {
        const err = await res.json();
        setStatusMessage({ type: 'error', text: err.error || 'Failed to save settings' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to communicate with server' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const origin = mounted && typeof window !== 'undefined' ? window.location.origin : '';
  const callbackUrl = origin ? `${origin}/api/auth/github/callback` : '/api/auth/github/callback';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col text-zinc-100 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-2">
            <GitHubIcon className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-base">Configuration & Integrations</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-6">
          {loading ? (
            <div className="py-12 flex justify-center items-center text-zinc-400 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading settings...
            </div>
          ) : (
            <>
              {statusMessage && (
                <div
                  className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
                    statusMessage.type === 'success'
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                      : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                  }`}
                >
                  {statusMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{statusMessage.text}</span>
                </div>
              )}

              {/* GitHub OAuth Account Status */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    GitHub App / OAuth Integration
                  </label>
                  {isConnected ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full">
                      Not Connected
                    </span>
                  )}
                </div>

                {isConnected && user ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                    <div className="flex items-center gap-3">
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatarUrl}
                          alt={user.login}
                          className="w-9 h-9 rounded-full ring-1 ring-zinc-700"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">
                          {user.login.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-sm text-zinc-100 flex items-center gap-2">
                          <span>{user.name || user.login}</span>
                          <span className="text-xs font-mono text-zinc-400">@{user.login}</span>
                        </div>
                        <div className="text-xs text-zinc-400">
                          OAuth session active • {accounts.find((a) => a.provider === 'github')?.hasRefreshToken ? 'Refresh token stored' : 'Standard token'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 rounded-lg text-xs font-medium transition-colors"
                    >
                      {disconnecting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LogOut className="w-3.5 h-3.5" />
                      )}
                      <span>Disconnect</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-zinc-400">
                      {isConfigured
                        ? 'GitHub App is configured. Click below to sign in with GitHub.'
                        : 'Configure Client ID and Secret below, then connect your account.'}
                    </div>
                    <a
                      href="/api/auth/github/login"
                      className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shrink-0 shadow-sm transition-colors"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Sign in with GitHub</span>
                    </a>
                  </div>
                )}

                {/* Multi-Source Integrations Preview */}
                <div className="p-3 rounded-lg bg-zinc-950/50 border border-zinc-800/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <Radio className="w-4 h-4 text-purple-400" />
                    <div>
                      <span className="font-medium text-zinc-300">Slack & Custom Ingestors</span>
                      <span className="text-zinc-500 block text-[11px]">Multi-source schema active. Direct webhook/OAuth connect coming soon.</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">Ready</span>
                </div>

                {/* GitHub App Credentials */}
                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-zinc-300">
                      GitHub Client ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Iv1.1234567890abcdef"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-100 placeholder:text-zinc-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-zinc-300">
                      GitHub Client Secret
                    </label>
                    <input
                      type="password"
                      placeholder={
                        hasClientSecret
                          ? '•••••••••••••••• (Leave blank to keep current)'
                          : 'Enter Client Secret...'
                      }
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-100 placeholder:text-zinc-600"
                    />
                  </div>

                  <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 text-xs text-zinc-400 space-y-1">
                    <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
                      <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span>OAuth App Setup Instructions:</span>
                    </div>
                    <p>
                      Set <strong className="text-zinc-300">Authorization callback URL</strong> in GitHub App / OAuth App settings to:
                    </p>
                    <code className="block p-1.5 rounded bg-zinc-900 border border-zinc-800 text-indigo-300 font-mono text-[11px] select-all">
                      {callbackUrl}
                    </code>
                    <p className="text-[11px] text-zinc-500">
                      Scopes requested: <code className="text-zinc-400 font-mono">repo, read:user, user:email</code>
                    </p>
                  </div>
                </div>
              </div>

              {/* GitHub Search Queries */}
              <div className="space-y-3 pt-2 border-t border-zinc-800/70">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    GitHub Search Queries (User Scoped)
                  </label>
                  <span className="text-[11px] text-zinc-400 font-mono">
                    {queries.length} active {queries.length === 1 ? 'query' : 'queries'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Customize search filters to ingest exactly what you need. Supports all GitHub search syntax.
                </p>

                {/* Preset helpers */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[11px] text-zinc-500 mr-1">Quick presets:</span>
                  <button
                    type="button"
                    onClick={() => handleAddPreset('is:open is:issue assignee:@me')}
                    className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono transition-colors"
                  >
                    + Assigned Issues
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddPreset('is:open is:pr assignee:@me')}
                    className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono transition-colors"
                  >
                    + Assigned PRs
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddPreset('is:open is:pr review-requested:@me')}
                    className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono transition-colors"
                  >
                    + Review Requested
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddPreset('is:open mentions:@me')}
                    className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono transition-colors"
                  >
                    + Mentions
                  </button>
                </div>

                {/* Active Queries List */}
                <div className="space-y-2">
                  {queries.map((q, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        <span className="text-zinc-200 truncate">{q}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveQuery(idx)}
                        className="text-zinc-500 hover:text-rose-400 p-1 rounded transition-colors"
                        title="Remove query"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Add query input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. is:open author:@me org:mycompany"
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddQuery();
                        }
                      }}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-100 placeholder:text-zinc-600"
                    />
                    <button
                      type="button"
                      onClick={handleAddQuery}
                      disabled={!queryInput.trim()}
                      className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium rounded-lg transition-colors text-zinc-200"
                    >
                      Add Query
                    </button>
                  </div>
                </div>
              </div>

              {/* Sync & Automation Settings */}
              <div className="space-y-4 pt-2 border-t border-zinc-800/70">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Automation & Resolution
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoArchive}
                    onChange={(e) => setAutoArchive(e.target.checked)}
                    className="w-4 h-4 rounded bg-zinc-950 border-zinc-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-zinc-900"
                  />
                  <div>
                    <div className="text-sm font-medium text-zinc-200">
                      Auto-move closed/merged PRs and issues to &quot;Done&quot;
                    </div>
                    <div className="text-xs text-zinc-400">
                      When polled items are closed or merged remotely, automatically mark them completed.
                    </div>
                  </div>
                </label>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">
                      Polling Interval (minutes)
                    </div>
                    <div className="text-xs text-zinc-400">
                      Frequency for in-browser and scheduled background checks.
                    </div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    value={syncInterval}
                    onChange={(e) => setSyncInterval(parseInt(e.target.value, 10) || 15)}
                    className="w-20 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-100"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 flex items-center justify-end gap-2 bg-zinc-900/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg shadow-sm transition-colors"
          >
            {saving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Save Configuration</span>
          </button>
        </div>
      </div>
    </div>
  );
}
