import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminData } from '@/features/admin-data/useAdminData';

/**
 * THE ENGINE SETTINGS on the Autotrade page (19 Nov 2026) — the values he changes from time to time, moved off
 * Coolify. The list, the limits and the wording all come from the server (`server/lib/engineSettings.ts`, which
 * reads the one list the signal engine also uses), so this page never holds a second copy that could drift.
 */
export type Kind = 'pairs' | 'strategies' | 'sessions' | 'hhmm' | 'overrides' | 'number' | 'int' | 'bool';
export interface EngineSetting {
  name: string; group: string; kind: Kind; label: string; help: string; default: string;
  min?: number; max?: number;
  value: string; source: 'admin' | 'coolify' | 'default'; updatedAt: string | null; updatedBy: string | null;
}
export interface EngineSettingsState {
  groups: { id: string; title: string; hint: string }[];
  settings: EngineSetting[];
}

export const ENGINE_SETTINGS_URL = '/api/admin/engine-settings';

export function useEngineSettings() {
  const qc = useQueryClient();
  const { data, loading, error } = useAdminData<EngineSettingsState | null>(ENGINE_SETTINGS_URL, { fallback: null });
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  /** Save one setting; `value` null = Reset (the Coolify / code value applies again). True when it saved. */
  const save = async (name: string, value: string | boolean | null): Promise<boolean> => {
    setSaving(name);
    setSaved(null);
    setErrors((e) => ({ ...e, [name]: '' }));
    try {
      const { authFetch } = await import('@/lib/queryClient');
      const r = await authFetch(ENGINE_SETTINGS_URL, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, value }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok || !Array.isArray(body?.settings)) {
        setErrors((e) => ({ ...e, [name]: body?.error ?? `the server answered ${r.status}. Nothing changed.` }));
        return false;
      }
      qc.setQueryData([ENGINE_SETTINGS_URL], body);
      setSaved(name);
      return true;
    } catch (err: any) {
      setErrors((e) => ({ ...e, [name]: `the server could not be reached (${err?.message ?? 'network error'}). Nothing changed.` }));
      return false;
    } finally {
      setSaving(null);
    }
  };

  return { state: data, loading, error, saving, errors, saved, save };
}
