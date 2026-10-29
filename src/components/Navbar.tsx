import React, { useRef, useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import {
  RotateCw,
  Settings,
  Search,
  X,
  FilterX,
  Check,
  LogIn,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { formatRelativeShort } from '@/lib/date-utils';
import { StatBadge } from './StatBadge';

export interface UserSessionInfo {
  id?: string;
  login: string;
  name?: string | null;
  avatarUrl?: string | null;
}

interface NavbarProps {
  onSync: () => Promise<void>;
  isSyncing: boolean;
  justSynced?: boolean;
  lastSyncTime: string | null;
  searchFilter: string;
  onSearchChange: (value: string) => void;
  sourceFilter: string;
  onSourceFilterChange: (value: string) => void;
  onClearFilters: () => void;
  onOpenSettings: () => void;
  totalTaskCount: number;
  isConnected: boolean;
  isConfigured: boolean;
  user: UserSessionInfo | null;
}

const FILTER_PILLS: Array<{ id: string; label: string; icon: string }> = [
  { id: 'all', label: 'All', icon: 'mdi:view-grid-outline' },
  { id: 'github_pr', label: 'PRs', icon: 'mdi:source-pull' },
  { id: 'review_request', label: 'Reviews', icon: 'mdi:eye-outline' },
  { id: 'github_issue', label: 'Issues', icon: 'mdi:record-circle-outline' },
];

export function Navbar({
  onSync,
  isSyncing,
  justSynced = false,
  lastSyncTime,
  searchFilter,
  onSearchChange,
  sourceFilter,
  onSourceFilterChange,
  onClearFilters,
  onOpenSettings,
  totalTaskCount,
  isConnected,
  isConfigured,
  user,
}: NavbarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'r' && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onSync();
      } else if (e.key === 'Escape') {
        if (document.activeElement === searchInputRef.current) {
          if (searchFilter) {
            onSearchChange('');
          } else {
            searchInputRef.current?.blur();
          }
        } else if (searchFilter || sourceFilter !== 'all') {
          onClearFilters();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchFilter, sourceFilter, onSearchChange, onClearFilters, onSync]);

  const hasActiveFilters = Boolean(searchFilter.trim()) || sourceFilter !== 'all';

  const formatLastSyncText = () => {
    if (!lastSyncTime) return 'Sync from GitHub (r)';
    try {
      const relTime = formatRelativeShort(lastSyncTime);
      const exactTime = new Date(lastSyncTime).toLocaleTimeString();
      return `Last synced ${relTime} ago (${exactTime}) • Press 'r' to sync`;
    } catch {
      return 'Sync from GitHub (r)';
    }
  };

  const syncFreshnessLabel = lastSyncTime ? `Synced ${formatRelativeShort(lastSyncTime)} ago` : null;

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.replace('/');
    } catch {
      window.location.reload();
    }
  };

  return (
    <header className="w-full pb-2">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Brand Title & Active Count */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
            <Icon icon="mdi:source-pull" className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold tracking-tight text-zinc-100">Notificurom</h1>
            <StatBadge
              value={`${totalTaskCount} active`}
              variant="amber"
              className="px-2.5 py-0.5 text-[11px]"
            />
          </div>
        </div>

        {/* Center: Borderless Search Pill + Glass Filter Capsule */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-3xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Filter tasks by title, repo, or author... (/)"
              value={searchFilter}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-full bg-white/[0.04] hover:bg-white/[0.07] focus:bg-white/[0.08] backdrop-blur-xl pl-10 pr-9 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                title="Clear search text (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Borderless Inline Glass Filter Capsule */}
          <div
            role="group"
            aria-label="Filter by source"
            className="flex items-center gap-1 p-1 rounded-full bg-white/[0.04] backdrop-blur-xl shrink-0"
          >
            {FILTER_PILLS.map((pill) => {
              const isActive = sourceFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  data-filter-id={pill.id}
                  onClick={() => onSourceFilterChange(pill.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
                  }`}
                >
                  <Icon icon={pill.icon} className="w-3.5 h-3.5" />
                  <span>{pill.label}</span>
                </button>
              );
            })}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-medium transition-all shrink-0 cursor-pointer"
              title="Reset search and filters (Esc)"
            >
              <FilterX className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>

        {/* Right: User Pill, Sync Pill, Circular Settings Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          {isConnected && user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.04] hover:bg-white/[0.07] backdrop-blur-xl text-xs font-mono text-zinc-200 transition-all cursor-pointer"
                title={`Connected as @${user.login}`}
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.login}
                    className="w-4 h-4 rounded-full"
                  />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-300 text-[10px] flex items-center justify-center font-bold">
                    {user.login.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="hidden sm:inline font-semibold">@{user.login}</span>
                <ChevronDown className="w-3 h-3 text-zinc-400" />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-[#14151e]/95 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.65)] backdrop-blur-2xl py-1.5 text-xs z-50">
                  <div className="px-3.5 py-2">
                    <div className="font-semibold text-zinc-100 truncate">
                      {user.name || user.login}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">@{user.login}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUserDropdownOpen(false);
                      onOpenSettings();
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-white/[0.06] flex items-center gap-2 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5 text-amber-400" />
                    <span>Settings</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-3.5 py-2 hover:bg-rose-500/15 text-rose-300 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : isConfigured ? (
            <a
              href="/api/auth/github/login"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition-all"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Connect GitHub</span>
            </a>
          ) : null}

          <div className="flex items-center gap-2">
            {syncFreshnessLabel && (
              <span
                className="hidden xl:inline text-[11px] text-zinc-400 font-mono select-none"
                title={formatLastSyncText()}
              >
                {syncFreshnessLabel}
              </span>
            )}
            <button
              type="button"
              onClick={onSync}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold backdrop-blur-xl transition-all duration-200 disabled:opacity-60 cursor-pointer ${
                justSynced
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-white/[0.04] hover:bg-amber-500/20 hover:text-amber-300 text-zinc-200'
              }`}
              title={formatLastSyncText()}
            >
              {isSyncing ? (
                <RotateCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : justSynced ? (
                <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
              ) : (
                <RotateCw className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>{isSyncing ? 'Syncing...' : justSynced ? 'Synced!' : 'Sync'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            className="w-9 h-9 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-amber-300 flex items-center justify-center transition-colors cursor-pointer"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
