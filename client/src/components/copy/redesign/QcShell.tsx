import { Fragment, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Radio, Users, X, Check } from 'lucide-react';
import { QC_CSS } from '../qcTheme';

export interface StepDef { id: string; label: string; }

interface Props {
  steps: StepDef[];
  current: number;
  onExit?: () => void;
  onProviders?: () => void;
  onFollowers?: () => void;
  onBack?: () => void;
  onNext?: () => void;
  backDisabled?: boolean;
  nextLabel?: string;
  hideFooter?: boolean;
  contentWidth?: number;
  children: ReactNode;
}

/** Quiet Capital wizard shell: top bar + horizontal stepper + centered content + sticky footer. */
export default function QcShell({
  steps, current, onExit, onProviders, onFollowers, onBack, onNext,
  backDisabled, nextLabel = 'Continue', hideFooter, contentWidth = 760, children,
}: Props) {
  return (
    <div className="qc-root" style={{ display: 'flex', flexDirection: 'column' }}>
      <style>{QC_CSS}</style>

      <div className="qc-top">
        <div className="qc-brand">Trade<b>Sync</b></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="qc-toplink" onClick={onProviders}><Radio size={14} /> Providers</button>
          <button className="qc-toplink" onClick={onFollowers}><Users size={14} /> Followers</button>
          <button className="qc-toplink" onClick={onExit}><X size={14} /> Exit</button>
        </div>
      </div>

      <div className="qc-stepwrap"><div className="qc-stepper">
        {steps.map((s, i) => (
          <Fragment key={s.id}>
            {i > 0 && <div className={`qc-conn${i <= current ? ' fill' : ''}`} />}
            <div className={`qc-step${i === current ? ' on' : ''}`}>
              <div className={`qc-dot ${i < current ? 'done' : i === current ? 'active' : 'next'}`}>
                {i < current ? <Check size={15} strokeWidth={2.5} /> : i + 1}
              </div>
              <div className="lbl">{s.label}</div>
            </div>
          </Fragment>
        ))}
      </div></div>

      <div className="qc-body"><div className="qc-content" style={{ maxWidth: contentWidth }}>{children}</div></div>

      {!hideFooter && (
        <div className="qc-foot"><div className="inner" style={{ maxWidth: contentWidth }}>
          <button className={`qc-btn qc-btn-ghost${backDisabled ? ' dis' : ''}`} onClick={backDisabled ? undefined : onBack}>
            <ArrowLeft size={16} /> Back
          </button>
          <button className="qc-btn qc-btn-pri" onClick={onNext}>{nextLabel} <ArrowRight size={16} /></button>
        </div></div>
      )}
    </div>
  );
}
