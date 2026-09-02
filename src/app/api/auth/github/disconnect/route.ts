import { NextResponse } from 'next/server';
import { destroySession, getCurrentUser } from '@/lib/auth';
import { db } from '@/db';
import { accounts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const authContext = await getCurrentUser();
    if (authContext) {
      db.delete(accounts)
        .where(and(eq(accounts.userId, authContext.user.id), eq(accounts.provider, 'github')))
        .run();
    }
    await destroySession();
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to disconnect';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
