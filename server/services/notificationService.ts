import { db } from '../db';
import { notifications, InsertNotification } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

export class NotificationService {
  async createNotification(data: InsertNotification) {
    try {
      const [notification] = await db
        .insert(notifications)
        .values(data)
        .returning();
      
      console.log(`Created notification: ${data.type} - ${data.title}`);
      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  async getNotifications(limit: number = 50) {
    try {
      return await db
        .select()
        .from(notifications)
        .orderBy(desc(notifications.createdAt))
        .limit(limit);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    }
  }

  async getUnreadNotifications() {
    try {
      return await db
        .select()
        .from(notifications)
        .where(eq(notifications.isRead, false))
        .orderBy(desc(notifications.createdAt));
    } catch (error) {
      console.error('Error fetching unread notifications:', error);
      throw error;
    }
  }

  async markAsRead(notificationId: string) {
    try {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, notificationId));
      
      console.log(`Marked notification ${notificationId} as read`);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  async markAllAsRead() {
    try {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.isRead, false));
      
      console.log('Marked all notifications as read');
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  async deleteNotification(notificationId: string) {
    try {
      await db
        .delete(notifications)
        .where(eq(notifications.id, notificationId));
      
      console.log(`Deleted notification ${notificationId}`);
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }

  async clearAllNotifications() {
    try {
      await db.delete(notifications);
      console.log('Cleared all notifications');
    } catch (error) {
      console.error('Error clearing all notifications:', error);
      throw error;
    }
  }
}

export const notificationService = new NotificationService();
