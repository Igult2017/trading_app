import { useEffect, useState } from 'react';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { C, FONT } from '@/components/admin-ui/tokens';
import { Pill } from '@/components/admin-ui/AdminUI';
import type { EngineSetting } from './useEngineSettings';

/** Where the value in use comes from — so it is obvious whether the page or Coolify is in charge of it. */
const SOURCE: Record<EngineSetting['source'], { tone: 'accent' | 'neutral' | 'warn'; text: string }> = {
  admin: { tone: 'accent', text: 'Set here' },
  coolify: { tone: 'warn', text: 'From Coolify' },
  default: { tone: 'neutral', text: 'Default' },
};

function stamp(s: EngineSetting): string {
  if (s.source !== 'admin' || !s.updatedAt) return '';
  const when = new Date(s.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return ` Changed ${when}${s.updatedBy ? ` by ${s.updatedBy}` : ''}.`;
}

/** ONE SETTING: its name, what it does, the value in use, and Save / Reset. A switch saves the moment it flips. */
export default function EngineSettingRow({ s, first, saving, error, saved, onSave }: {
  s: EngineSetting; first: boolean; saving: boolean; error?: string; saved: boolean;
  onSave: (value: string | boolean | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(s.value);
  useEffect(() => setDraft(s.value), [s.value]);
  const id = `engine-${s.name}`;
  const isBool = s.kind === 'bool';
  const changed = !isBool && draft.trim() !== s.value;

  return (
    <div style={{ padding: '16px 24px', borderTop: first ? 'none' : `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontFamily: FONT,
                                       fontSize: 15, fontWeight: 600, color: C.text, cursor: 'pointer' }}>
            {s.label} <Pill tone={SOURCE[s.source].tone}>{SOURCE[s.source].text}</Pill>
          </label>
          <p style={{ margin: '4px 0 0', fontFamily: FONT, fontSize: 14, color: C.muted }}>
            {s.help}{stamp(s)}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: isBool ? '0 0 auto' : '1 1 280px' }}>
          {isBool ? (
            <Switch id={id} checked={s.value === 'true'} disabled={saving}
                    onCheckedChange={(v) => onSave(v)} aria-label={`${s.label} ${s.value === 'true' ? 'on' : 'off'}`}
                    className="transition-all duration-200" />
          ) : (
            <form style={{ display: 'flex', gap: 8, flex: 1, minWidth: 0 }}
                  onSubmit={(e) => { e.preventDefault(); if (changed) onSave(draft); }}>
              <Input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={saving}
                     inputMode={s.kind === 'number' || s.kind === 'int' ? 'decimal' : 'text'}
                     placeholder={s.kind === 'hhmm' ? 'e.g. 16:00, or empty for none' : 'empty = no limit'}
                     aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}
                     className="rounded-lg transition-all duration-200"
                     style={{ background: C.card, color: C.text, borderColor: error ? C.red : C.border2, fontFamily: FONT }} />
              {/* Outlined in the panel's own palette, like "Send a test card": white text on the accent
                  measured unreadable on the dark themes' bright cyan. The border turns accent when there
                  is something to save. */}
              <Button type="submit" variant="outline" size="sm" disabled={!changed || saving} aria-label={`Save ${s.label}`}
                      className="transition-all duration-200 hover:-translate-y-0.5"
                      style={{ background: C.card, color: C.text, borderColor: changed ? C.indigo : C.border2, fontFamily: FONT }}>
                {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
                Save
              </Button>
            </form>
          )}
          {s.source === 'admin' ? (
            <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => onSave(null)}
                    aria-label={`Reset ${s.label} to the default`} title="Reset to the Coolify / default value"
                    className="transition-all duration-200 hover:-translate-y-0.5"
                    style={{ background: C.card, color: C.text, borderColor: C.border2, fontFamily: FONT }}>
              <RotateCcw aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" style={{ margin: '8px 0 0', fontFamily: FONT, fontSize: 14, color: C.red }}>
          Not saved — {error}
        </p>
      ) : saved ? (
        <p role="status" style={{ margin: '8px 0 0', fontFamily: FONT, fontSize: 14, color: C.green }}>
          Saved. The engine uses it within a few seconds.
        </p>
      ) : null}
    </div>
  );
}
