import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Task } from '@/db/schema';
import { SyncResult } from '@/lib/types';
import { Navbar, UserSessionInfo } from './Navbar';
import { KanbanBoard } from './KanbanBoard';
import { SettingsModal } from './SettingsModal';
import { THEME } from '@/config/theme';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { notifyNewTask } from '@/lib/notifications';

interface DashboardProps {
  initialTasks: Task[];
  initialIsConnected: boolean;
  initialIsConfigured: boolean;
  initialUser: UserSessionInfo | null;
  initialLastSync: string | null;
  initialBanner?: { type: 'info' | 'success' | 'error'; message: string } | null;
}

export function Dashboard({
  initialTasks,
  initialIsConnected,
  initialIsConfigured,
  initialUser,
  initialLastSync,
  initialBanner = null,
}: DashboardProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [isConnected, setIsConnected] = useState(initialIsConnected);
  const [isConfigured, setIsConfigured] = useState(initialIsConfigured);
  const [user, setUser] = useState<UserSessionInfo | null>(initialUser);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(initialLastSync);
  const [syncIntervalMins, setSyncIntervalMins] = useState(2);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [banner, setBanner] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(
    initialBanner
  );

  // Keep track of tasks we have already seen to only notify for brand-new ones
  const knownTaskIdsRef = useRef<Set<string>>(new Set(initialTasks.map((t) => t.id)));
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    if (!initialLoadDoneRef.current) {
      initialTasks.forEach((t) => knownTaskIdsRef.current.add(t.id));
      initialLoadDoneRef.current = true;
    }
  }, [initialTasks]);

  const checkAndNotifyNewTasks = useCallback(
    (newTasks: Task[]) => {
      if (!initialLoadDoneRef.current) {
        newTasks.forEach((t) => knownTaskIdsRef.current.add(t.id));
        initialLoadDoneRef.current = true;
        return;
      }

      const brandNew = newTasks.filter((t) => !knownTaskIdsRef.current.has(t.id));
      newTasks.forEach((t) => knownTaskIdsRef.current.add(t.id));

      if (notificationsEnabled && brandNew.length > 0) {
        // Notify for incoming new tasks
        brandNew.forEach((task) => {
          notifyNewTask(task);
        });
      }
    },
    [notificationsEnabled]
  );

  const handleClearFilters = useCallback(() => {
    setSearchFilter('');
    setSourceFilter('all');
  }, []);

  const refreshTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      if (res.status === 401) {
        window.location.replace('/');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const incomingTasks = data.tasks || [];
        setTasks(incomingTasks);
        checkAndNotifyNewTasks(incomingTasks);
        if (data.lastSyncTime) {
          setLastSyncTime(data.lastSyncTime);
        }
      }
    } catch (err) {
      console.error('Failed to reload tasks', err);
    }
  }, [checkAndNotifyNewTasks]);

  const handleSync = useCallback(async () => {
    try {
      setIsSyncing(true);
      setBanner(null);

      const res = await fetch('/api/sync', { method: 'POST' });
      if (res.status === 401) {
        window.location.replace('/');
        return;
      }

      const data = await res.json();

      if (res.ok && data.success) {
        const githubRes = (data.results as SyncResult[])?.find((r) => r.source === 'github');
        if (githubRes) {
          if (githubRes.errors && githubRes.errors.length > 0) {
            setBanner({
              type: 'error',
              message: `Sync issue: ${githubRes.errors.join(', ')}`,
            });
          } else {
            const parts = [
              `${githubRes.fetched} fetched`,
              `${githubRes.created} new`,
              `${githubRes.updated} updated`,
              `${githubRes.autoResolved} resolved`,
            ];
            setBanner({
              type: 'success',
              message: `Synced with GitHub: ${parts.join(', ')}.`,
            });
            setTimeout(() => setBanner(null), 4000);
          }
          if (githubRes.tasks) {
            setTasks(githubRes.tasks);
            checkAndNotifyNewTasks(githubRes.tasks);
          } else {
            await refreshTasks();
          }
        }
        setLastSyncTime(new Date().toISOString());
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 2500);
      } else {
        setBanner({
          type: 'error',
          message: data.error || 'Failed to sync with GitHub',
        });
      }
    } catch {
      setBanner({
        type: 'error',
        message: 'Network error occurred while syncing.',
      });
    } finally {
      setIsSyncing(false);
    }
  }, [checkAndNotifyNewTasks, refreshTasks]);

  const checkSettingsAndStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/github/status');
      if (res.ok) {
        const data = await res.json();
        if (!data.isConnected) {
          window.location.replace('/');
          return;
        }
        setIsConnected(true);
        setIsConfigured(data.isConfigured || false);
        setUser(data.user || null);
      }

      const settingsRes = await fetch('/api/settings');
      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        if (typeof sData.syncIntervalMinutes === 'number') {
          setSyncIntervalMins(sData.syncIntervalMinutes);
        }
        if (typeof sData.notificationsEnabled === 'boolean') {
          setNotificationsEnabled(sData.notificationsEnabled);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/api/auth/github/status');
        if (res.ok) {
          const data = await res.json();
          if (!data.isConnected) {
            window.location.replace('/');
            return;
          }
          if (!isCancelled) {
            setIsConnected(true);
            setIsConfigured(data.isConfigured || false);
            setUser(data.user || null);
          }
        }

        const settingsRes = await fetch('/api/settings');
        if (settingsRes.ok) {
          const sData = await settingsRes.json();
          if (!isCancelled && typeof sData.syncIntervalMinutes === 'number') {
            setSyncIntervalMins(sData.syncIntervalMinutes);
          }
          if (!isCancelled && typeof sData.notificationsEnabled === 'boolean') {
            setNotificationsEnabled(sData.notificationsEnabled);
          }
        }
      } catch {
        // ignore
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        check();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);

    check();

    return () => {
      isCancelled = true;
      window.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    const intervalMs = Math.max(1, syncIntervalMins) * 60 * 1000;
    const interval = setInterval(() => {
      if (isConnected) {
        handleSync();
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isConnected, syncIntervalMins, handleSync]);

  return (
    <div
      className="relative min-h-screen w-full bg-[#0c0d12] text-zinc-100 overflow-x-hidden select-none font-sans"
      style={{ backgroundColor: THEME.canvasBg }}
    >
      {/* 1. Ambient Glassmorphic Glow Blobs (matching ha-dashboard) */}
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

      {/* 2. Main Dashboard Container */}
      <div className="relative z-10 w-full max-w-[1920px] mx-auto px-4 py-4 flex flex-col gap-4">
        <Navbar
          onSync={handleSync}
          isSyncing={isSyncing}
          justSynced={justSynced}
          lastSyncTime={lastSyncTime}
          searchFilter={searchFilter}
          onSearchChange={setSearchFilter}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          onClearFilters={handleClearFilters}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isConnected={isConnected}
          isConfigured={isConfigured}
          user={user}
        />

        {/* Sync Status Banner */}
        {banner && (
          <div
            className={`px-4 py-2.5 rounded-full backdrop-blur-xl text-xs flex items-center gap-2 ${
              banner.type === 'success'
                ? 'bg-emerald-500/15 text-emerald-300'
                : banner.type === 'error'
                ? 'bg-rose-500/15 text-rose-300'
                : 'bg-white/[0.05] text-zinc-300'
            }`}
          >
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{banner.message}</span>
          </div>
        )}

        {/* Kanban Board Canvas */}
        <main className="flex-1 w-full">
          <KanbanBoard
            tasks={tasks}
            setTasks={setTasks}
            searchFilter={searchFilter}
            sourceFilter={sourceFilter}
            onClearFilters={handleClearFilters}
          />
        </main>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaveSuccess={() => {
          checkSettingsAndStatus();
          refreshTasks();
        }}
      />
    </div>
  );
}
