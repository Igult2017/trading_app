import { SlidersHorizontal } from 'lucide-react';
import { C, FONT } from '@/components/admin-ui/tokens';
import { Panel } from '@/components/admin-ui/AdminUI';
import { StatsAndTableSkeleton } from '@/features/admin-data/AdminSkeleton';
import EngineSettingRow from './EngineSettingRow';
import { useEngineSettings } from './useEngineSettings';

/**
 * THE ENGINE SETTINGS (19 Nov 2026) — his ask: *"remove any settings we would need to change any time from coolify
 * and put it in admin where settings are."* One panel per group, under the trading switches. Each value is checked
 * by the server before it is saved, and the engine picks it up within a few seconds; no redeploy.
 */
export default function EngineSettings() {
  const { state, loading, error, saving, errors, saved, save } = useEngineSettings();

  if (loading) return <StatsAndTableSkeleton stats={0} rows={6} cols={2} />;
  if (error || !state) {
    return (
      <Panel title="Engine settings">
        <p role="alert" style={{ margin: 0, padding: '16px 24px', fontFamily: FONT, fontSize: 14, color: C.red }}>
          Could not read the engine settings ({error ?? 'no reply'}). Refresh the page to try again; nothing has changed.
        </p>
      </Panel>
    );
  }
  if (!state.settings.length) {
    return (
      <Panel title="Engine settings">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '24px', color: C.muted, fontFamily: FONT, fontSize: 14 }}>
          <SlidersHorizontal size={18} aria-hidden="true" /> No settings are offered here yet.
        </div>
      </Panel>
    );
  }

  return (
    <>
      {state.groups.map((g) => {
        const rows = state.settings.filter((s) => s.group === g.id);
        if (!rows.length) return null;
        return (
          <Panel key={g.id} title={g.title} hint={g.hint}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rows.map((s, i) => (
                <EngineSettingRow key={s.name} s={s} first={i === 0} saving={saving === s.name}
                                  error={errors[s.name] || undefined} saved={saved === s.name}
                                  onSave={(v) => save(s.name, v)} />
              ))}
            </div>
          </Panel>
        );
      })}
    </>
  );
}
