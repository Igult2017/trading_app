import { Ban } from 'lucide-react';
import { C, cs, btn, FONT, HFONT } from '@/components/admin-ui/tokens';

/** Confirm suspending an account, reached from a conversation's actions. */
export default function BanDialog({ name, onCancel, onConfirm }: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 60,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ ...cs, padding: 28, maxWidth: 360, width: '100%', fontFamily: FONT }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, margin: '0 auto 14px',
                      background: 'rgba(220,38,38,0.10)', color: C.red,
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ban size={20} />
        </div>
        <p style={{ fontFamily: HFONT, fontSize: 18, fontWeight: 600, color: C.text,
                    textAlign: 'center', margin: '0 0 8px' }}>Suspend this account?</p>
        <p style={{ fontSize: 14, color: C.muted, textAlign: 'center', margin: '0 0 20px', lineHeight: 1.6 }}>
          <strong style={{ color: C.text }}>{name}</strong> will not be able to sign in until you lift it.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={onCancel}
            style={{ ...btn, padding: '11px', background: 'transparent', color: C.muted,
                     border: `1px solid ${C.border2}`, borderRadius: 999, fontFamily: FONT, fontSize: 14 }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            style={{ ...btn, padding: '11px', background: C.red, color: '#fff', borderRadius: 999,
                     fontFamily: FONT, fontSize: 14 }}>
            Suspend
          </button>
        </div>
      </div>
    </div>
  );
}
