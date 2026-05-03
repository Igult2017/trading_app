import type { AdminNotifCategory } from './types';

export const CATEGORY_META: Record<AdminNotifCategory, {
  label: string;
  color: string;
  bg: string;
  border: string;
}> = {
  message: {
    label: 'Message',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.10)',
    border: 'rgba(59,130,246,0.25)',
  },
  alert: {
    label: 'Alert',
    color: '#f43f5e',
    bg: 'rgba(244,63,94,0.10)',
    border: 'rgba(244,63,94,0.25)',
  },
  signup: {
    label: 'New User',
    color: '#22d3a5',
    bg: 'rgba(34,211,165,0.10)',
    border: 'rgba(34,211,165,0.25)',
  },
  system: {
    label: 'System',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.10)',
    border: 'rgba(245,158,11,0.25)',
  },
  campaign: {
    label: 'Campaign',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.10)',
    border: 'rgba(167,139,250,0.25)',
  },
};

export const ADMIN_NOTIF_REFETCH_MS = 20_000;
