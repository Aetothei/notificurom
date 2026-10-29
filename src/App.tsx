import React, { useEffect, useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { LandingPage } from './components/LandingPage';
import { UserSessionInfo } from './components/Navbar';
import { Task } from './db/schema';
import { THEME } from './config/theme';

export function App() {
  const [loading, setLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [user, setUser] = useState<UserSessionInfo | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [initialBanner, setInitialBanner] = useState<{
    type: 'info' | 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      setInitialBanner({
        type: 'success',
        message: 'Successfully signed in with GitHub!',
      });
    } else if (params.get('auth') === 'error') {
      const errorMsg = params.get('error') || params.get('message') || 'Authentication failed';
      setInitialBanner({
        type: 'error',
        message: `GitHub sign-in failed: ${errorMsg}`,
      });
    }

    let isMounted = true;

    async function bootstrap() {
      try {
        const statusRes = await fetch('/api/auth/github/status');
        if (!statusRes.ok) {
          if (isMounted) setLoading(false);
          return;
        }
        const statusData = await statusRes.json();
        if (!isMounted) return;

        setIsConfigured(Boolean(statusData.isConfigured));
        setIsConnected(Boolean(statusData.isConnected));
        setUser(statusData.user || null);

        if (statusData.isConnected) {
          const tasksRes = await fetch('/api/tasks');
          if (tasksRes.ok && isMounted) {
            const tasksData = await tasksRes.json();
            setTasks(tasksData.tasks || []);
            setLastSyncTime(tasksData.lastSyncTime || null);
          }
        }
      } catch {
        // ignore
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div
        className="min-h-screen w-full bg-[#0c0d12] flex items-center justify-center text-zinc-400 text-xs font-sans"
        style={{ backgroundColor: THEME.canvasBg }}
      />
    );
  }

  if (!isConnected) {
    return <LandingPage isConfigured={isConfigured} initialBanner={initialBanner} />;
  }

  return (
    <Dashboard
      initialTasks={tasks}
      initialIsConnected={true}
      initialIsConfigured={isConfigured}
      initialUser={user}
      initialLastSync={lastSyncTime}
      initialBanner={initialBanner}
    />
  );
}

export default App;
