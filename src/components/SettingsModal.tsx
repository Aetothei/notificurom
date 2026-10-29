import React, { useState, useEffect } from 'react';
import {
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Trash2,
  Bell,
  BellOff,
} from 'lucide-react';
import { GlassModal } from './GlassModal';
import { Button } from './ui/button';
import { UserSessionInfo } from './Navbar';
import {
  getNotificationPermission,
  requestNotificationPermission,
  notifyNewTask,
} from '@/lib/notifications';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess?: () => void;
}

export function SettingsModal({ isOpen, onClose, onSaveSuccess }: SettingsModalProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [user, setUser] = useState<UserSessionInfo | null>(null);

  const [autoArchive, setAutoArchive] = useState(true);
  const [syncInterval, setSyncInterval] = useState(2);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>('default');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setBrowserPermission(getNotificationPermission());

    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch('/api/settings');
        if (res.ok && isMounted) {
          const data = await res.json();
          setIsConnected(data.isConnected || false);
          setUser(data.user || null);
          setAutoArchive(data.autoArchiveClosed ?? true);
          setSyncInterval(data.syncIntervalMinutes || 2);
          setNotificationsEnabled(Boolean(data.notificationsEnabled));
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

  const handleToggleNotifications = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      setBrowserPermission(getNotificationPermission());
      if (granted) {
        setNotificationsEnabled(true);
      } else {
        setNotificationsEnabled(false);
        setStatusMessage({
          type: 'error',
          text: 'Browser notification permission was not granted.',
        });
      }
    } else {
      setNotificationsEnabled(false);
    }
  };

  const handleTestNotification = () => {
    const n = notifyNewTask({
      id: 'test-notification',
      source: 'github',
      sourceType: 'review_request',
      sourceId: '#1',
      title: 'Test Notification: Browser alerts are working cleanly!',
      url: window.location.href,
      repository: 'Aetothei/notificurom',
      author: user?.login || 'you',
      authorAvatarUrl: user?.avatarUrl || null,
      status: 'inbox',
      sortOrder: 0,
      isClosed: false,
      metadata: null,
      sourceCreatedAt: new Date().toISOString(),
      sourceUpdatedAt: null,
      statusUpdatedAt: new Date().toISOString(),
    });

    if (!n) {
      setStatusMessage({
        type: 'error',
        text: 'Could not send test notification. Check browser permissions.',
      });
    } else {
      setStatusMessage({
        type: 'success',
        text: 'Test notification sent!',
      });
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      const res = await fetch('/api/auth/github/disconnect', { method: 'POST' });
      if (res.ok) {
        setIsConnected(false);
        setUser(null);
        window.location.replace('/');
      } else {
        setStatusMessage({ type: 'error', text: 'Failed to disconnect.' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Network error during disconnect.' });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleWipeData = async () => {
    try {
      setWiping(true);
      const res = await fetch('/api/settings', { method: 'DELETE' });
      if (res.ok) {
        setStatusMessage({ type: 'success', text: 'Board data wiped successfully.' });
        setShowWipeConfirm(false);
        onSaveSuccess?.();
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({ type: 'error', text: 'Failed to wipe data.' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Network error while wiping data.' });
    } finally {
      setWiping(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setStatusMessage(null);

      const payload = {
        autoArchiveClosed: autoArchive,
        syncIntervalMinutes: Number(syncInterval),
        notificationsEnabled,
      };

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setStatusMessage({ type: 'success', text: 'Settings saved.' });
        setIsConnected(data.isConnected || false);
        setUser(data.user || null);
        setAutoArchive(data.autoArchiveClosed ?? true);
        setSyncInterval(data.syncIntervalMinutes || 2);
        setNotificationsEnabled(Boolean(data.notificationsEnabled));
        onSaveSuccess?.();
        setTimeout(() => setStatusMessage(null), 3000);
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

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Settings"
      icon="mdi:cog-outline"
      maxWidth="max-w-lg"
    >
      {loading ? (
        <div className="py-8 flex justify-center items-center text-zinc-400 text-xs">
          <RefreshCw className="w-4 h-4 animate-spin mr-2 text-amber-400" /> Loading settings...
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {statusMessage && (
            <div
              className={`p-3.5 rounded-2xl flex items-center gap-2 text-xs ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-rose-500/15 text-rose-300'
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

          {/* Connected Account */}
          <div className="space-y-2.5">
            <label className="block text-xs font-bold uppercase tracking-widest text-zinc-400">
              Account
            </label>
            {isConnected && user ? (
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.04]">
                <div className="flex items-center gap-3">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.login}
                      className="w-9 h-9 rounded-full"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-300">
                      {user.login.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-sm text-zinc-100">
                      {user.name || user.login}
                    </div>
                    <div className="text-xs font-mono text-zinc-400">@{user.login}</div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <LogOut className="w-3.5 h-3.5" />
                  )}
                  <span>Disconnect</span>
                </Button>
              </div>
            ) : (
              <div className="text-xs text-zinc-500">Not connected.</div>
            )}
          </div>

          {/* Sync Interval & Auto-archive */}
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-widest text-zinc-400">
              Sync & Notifications
            </label>

            {/* Desktop Notifications Toggle */}
            <div className="p-3.5 rounded-2xl bg-white/[0.04] flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  {notificationsEnabled ? (
                    <Bell className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <BellOff className="w-4 h-4 text-zinc-500 shrink-0" />
                  )}
                  <div>
                    <div className="text-xs font-semibold text-zinc-100">
                      Browser Desktop Notifications
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Alert when a new review request, PR, or issue arrives
                    </div>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={notificationsEnabled}
                    onChange={(e) => handleToggleNotifications(e.target.checked)}
                    disabled={browserPermission === 'unsupported'}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {notificationsEnabled && (
                <div className="pt-1 flex items-center justify-between border-t border-white/[0.06]">
                  <span className="text-[11px] text-emerald-400 font-medium">
                    ✓ Browser permission: {browserPermission}
                  </span>
                  <button
                    type="button"
                    onClick={handleTestNotification}
                    className="text-[11px] text-amber-400 hover:text-amber-300 underline font-medium transition-colors cursor-pointer"
                  >
                    Send test alert
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 p-3.5 rounded-2xl bg-white/[0.04]">
              <div>
                <div className="text-xs font-semibold text-zinc-100">Auto-sync Interval</div>
                <div className="text-[11px] text-zinc-400">
                  Background refresh frequency while open (minutes)
                </div>
              </div>
              <input
                type="number"
                min="1"
                max="1440"
                value={syncInterval}
                onChange={(e) => setSyncInterval(parseInt(e.target.value, 10) || 2)}
                className="w-20 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-center font-mono focus:outline-none focus:bg-white/[0.1] text-zinc-100"
              />
            </div>

            <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.06] transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={autoArchive}
                onChange={(e) => setAutoArchive(e.target.checked)}
                className="w-4 h-4 rounded bg-white/10 text-amber-500 focus:ring-amber-500"
              />
              <div>
                <div className="text-xs font-semibold text-zinc-100">
                  Show recently closed items in &quot;Done&quot;
                </div>
                <div className="text-[11px] text-zinc-400">
                  Include PRs and issues closed in the last 7 days
                </div>
              </div>
            </label>
          </div>

          {/* Danger Zone: Wipe Board Data */}
          <div className="space-y-2.5">
            <label className="block text-xs font-bold uppercase tracking-widest text-rose-400">
              Danger Zone
            </label>
            <div className="p-3.5 rounded-2xl bg-white/[0.04] flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-zinc-100">Wipe Board Data</div>
                <div className="text-[11px] text-zinc-400">
                  Clears your task statuses, column positions, and board state
                </div>
              </div>
              {!showWipeConfirm ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowWipeConfirm(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Wipe Data</span>
                </Button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleWipeData}
                    disabled={wiping}
                  >
                    {wiping ? 'Wiping...' : 'Confirm'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowWipeConfirm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="amber"
              size="sm"
              onClick={handleSave}
              disabled={saving || !isConnected}
            >
              {saving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Save</span>
            </Button>
          </div>
        </div>
      )}
    </GlassModal>
  );
}
