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

export interface AdminUnreadCounts {
  messages: number;
  alerts: number;
  total: number;
}
