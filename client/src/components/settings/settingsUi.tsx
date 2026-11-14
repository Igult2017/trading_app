import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * settingsUi — the Settings page's shared look: a section card and an inline status line.
 *
 * Every colour is a journal variable (--jr-*, set on .journal-root for BOTH themes), so the page
 * follows the light/dark switch without knowing which is on.
 */
export const INK = 'text-[var(--jr-ink,#ECEEF2)]';
export const CAP = 'text-[var(--jr-cap,#A8AEB8)]';
export const FIELD =
  'h-10 rounded-lg border-0 bg-[var(--jr-bg,#0b0f17)] text-[var(--jr-ink,#ECEEF2)] ring-1 ring-[var(--jr-border,rgba(255,255,255,0.12))] ' +
  'focus-visible:ring-2 focus-visible:ring-[var(--jr-accent,#38bdf8)] focus-visible:ring-offset-0 disabled:opacity-70';
export const SWITCH =
  'data-[state=checked]:bg-[var(--jr-accent,#38bdf8)] data-[state=unchecked]:bg-[var(--jr-border,rgba(255,255,255,0.18))] ' +
  'focus-visible:ring-[var(--jr-accent,#38bdf8)]';

export function Section({ id, title, description, children }: {
  id: string; title: string; description?: string; children: ReactNode;
}) {
  return (
    <Card id={id} className="rounded-xl border border-[var(--jr-border,rgba(255,255,255,0.08))] bg-[var(--jr-panel,#111827)] shadow-sm">
      <CardHeader className="p-6 pb-4">
        <CardTitle className={`text-xl font-bold ${INK}`}>{title}</CardTitle>
        {description && <CardDescription className={`text-sm ${CAP}`}>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-6 p-6 pt-0">{children}</CardContent>
    </Card>
  );
}

export type Msg = { s: 'ok' | 'err' | null; m: string };

/** One quiet line under a control: green when it saved, a tinted box when it did not. */
export function Status({ msg }: { msg: Msg }) {
  if (!msg.s) return null;
  return msg.s === 'ok'
    ? <p role="status" className="text-sm font-medium text-emerald-500">{msg.m}</p>
    : <p role="alert" className="rounded-lg bg-rose-500/10 px-4 py-2 text-sm text-rose-400">{msg.m}</p>;
}
