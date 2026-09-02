import { NextResponse } from 'next/server';
import { syncUser, syncAllUsers } from '@/lib/sync';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    const isCronAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);

    if (isCronAuthorized) {
      const results = await syncAllUsers();
      return NextResponse.json({ success: true, mode: 'all_users', results });
    }

    const authContext = await getCurrentUser();
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results = await syncUser(authContext.user.id);
    return NextResponse.json({ success: true, mode: 'user', results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
