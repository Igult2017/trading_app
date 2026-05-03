import { db } from '../db';
import { sql } from 'drizzle-orm';

export type AdminNotifCategory = 'message' | 'alert' | 'signup' | 'system' | 'campaign';

export interface AdminNotification {
  id: string;
  category: AdminNotifCategory;
  title: string;
  body: string;
  meta?: string;
  is_read: boolean;
  created_at: string;
}

export async function createAdminNotification(opts: {
  category: AdminNotifCategory;
  title: string;
  body: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO admin_notifications (category, title, body, meta, is_read, created_at)
      VALUES (
        ${opts.category},
        ${opts.title},
        ${opts.body},
        ${opts.meta ? JSON.stringify(opts.meta) : null},
        false,
        NOW()
      )
    `);
  } catch (err: any) {
    console.warn('[AdminNotif] Failed to create notification:', err?.message);
  }
}

export async function getAdminNotifications(limit = 60): Promise<AdminNotification[]> {
  try {
    const r = await db.execute(sql`
      SELECT id, category, title, body, meta, is_read, created_at
      FROM admin_notifications
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    return (r.rows ?? []) as AdminNotification[];
  } catch {
    return [];
  }
}

export async function getAdminUnreadCounts(): Promise<{ messages: number; alerts: number; total: number }> {
  try {
    const r = await db.execute(sql`
      SELECT category, COUNT(*)::int AS cnt
      FROM admin_notifications
      WHERE is_read = false
      GROUP BY category
    `);
    const rows = (r.rows ?? []) as { category: string; cnt: number }[];
    const messages = rows.filter(r => r.category === 'message').reduce((s, r) => s + Number(r.cnt), 0);
    const alerts   = rows.filter(r => r.category !== 'message').reduce((s, r) => s + Number(r.cnt), 0);
    return { messages, alerts, total: messages + alerts };
  } catch {
    return { messages: 0, alerts: 0, total: 0 };
  }
}

export async function markAdminNotificationRead(id: string): Promise<void> {
  try {
    await db.execute(sql`UPDATE admin_notifications SET is_read = true WHERE id = ${id}`);
  } catch {}
}

export async function markAllAdminNotificationsRead(category?: AdminNotifCategory): Promise<void> {
  try {
    if (category) {
      await db.execute(sql`UPDATE admin_notifications SET is_read = true WHERE is_read = false AND category = ${category}`);
    } else {
      await db.execute(sql`UPDATE admin_notifications SET is_read = true WHERE is_read = false`);
    }
  } catch {}
}

export async function deleteAdminNotification(id: string): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM admin_notifications WHERE id = ${id}`);
  } catch {}
}

export async function clearAdminNotifications(category?: AdminNotifCategory): Promise<void> {
  try {
    if (category) {
      await db.execute(sql`DELETE FROM admin_notifications WHERE category = ${category}`);
    } else {
      await db.execute(sql`DELETE FROM admin_notifications`);
    }
  } catch {}
}
