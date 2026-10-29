import { Task } from '@/db/schema';

/**
 * Check if the browser supports notifications and what the current permission is.
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Request permission from the user for desktop notifications.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    return false;
  }

  try {
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  } catch (err) {
    console.error('Failed to request notification permission:', err);
    return false;
  }
}

/**
 * Send a desktop notification for a newly arrived task.
 */
export function notifyNewTask(task: Task): Notification | null {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  ) {
    return null;
  }

  let typeLabel = 'New Task';
  if (task.sourceType === 'review_request') {
    typeLabel = 'Review Requested';
  } else if (task.sourceType === 'pr') {
    typeLabel = 'New Pull Request';
  } else if (task.sourceType === 'issue') {
    typeLabel = 'Assigned Issue';
  }

  const repo = task.repository ? ` [${task.repository}]` : '';
  const title = `${typeLabel}${repo}`;
  const body = task.title;

  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: task.id, // prevents duplicates for the same task
      silent: false,
    });

    notification.onclick = () => {
      window.focus();
      if (task.url) {
        window.open(task.url, '_blank', 'noopener,noreferrer');
      }
      notification.close();
    };

    return notification;
  } catch (err) {
    console.error('Failed to trigger notification:', err);
    return null;
  }
}
