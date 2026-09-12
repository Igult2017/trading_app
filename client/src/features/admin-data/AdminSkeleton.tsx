import { C, cs, R } from '@/components/admin-ui/tokens';

/**
 * PLACEHOLDERS SHAPED LIKE THE PAGE THEY STAND IN FOR.
 *
 * His instruction: *"where content must load, use skeleton that looks like the page to display
 * until it loads."* A spinner tells you to wait; a skeleton tells you what is coming and stops
 * the layout jumping when it lands, because the boxes are already the right size.
 *
 * These only ever appear on a COLD first load. Once a screen has been visited its data is cached
 * for a day (`useAdminData`), so the second visit paints real content with no skeleton at all.
 */
const PULSE = 'adminSkelPulse';
const CSS = '@keyframes ' + PULSE + '{0%,100%{opacity:.5}50%{opacity:.9}}'
          + '.adm-skel{animation:' + PULSE + ' 1.5s ease-in-out infinite}';

/** One grey block. */
export function Bone({ w = '100%', h = 14, r = 7, mt = 0, mb = 0 }: {
  w?: number | string; h?: number; r?: number; mt?: number; mb?: number;
}) {
  return <div className="adm-skel" style={{
    width: w, height: h, borderRadius: r, marginTop: mt, marginBottom: mb,
    background: 'color-mix(in srgb, var(--admin-muted) 18%, transparent)',
  }} />;
}

/** Wraps a skeleton and carries the one keyframes rule it needs. */
function Skel({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-label="Loading" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{CSS}</style>
      {children}
    </div>
  );
}

/** The row of headline figures that opens most screens. */
export function StatRowSkeleton({ n = 4, cols }: { n?: number; cols?: string }) {
  return (
    <div style={{ display: 'grid', gap: 18, gridTemplateColumns: cols ?? `repeat(${n}, minmax(0, 1fr))` }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ ...cs, padding: '20px 20px 18px' }}>
          <Bone w={38} h={38} r={11} mb={16} />
          <Bone w={92} h={30} r={8} />
          <Bone w={120} h={13} mt={10} />
          <Bone w={80} h={11} mt={8} />
        </div>
      ))}
    </div>
  );
}

/** A table: the heading strip, then rows. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ ...cs, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 22, padding: '13px 20px', background: C.thead,
                    borderBottom: `1px solid ${C.border}` }}>
        {Array.from({ length: cols }).map((_, i) => <Bone key={i} w={i === 0 ? 130 : 74} h={12} />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: 22, alignItems: 'center', padding: '15px 20px',
                              borderBottom: r < rows - 1 ? `1px solid ${C.border}` : 'none' }}>
          {Array.from({ length: cols }).map((_, i) => (
            <Bone key={i} w={i === 0 ? 230 : 64} h={i === 0 ? 15 : 13} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A list of people or conversations — an avatar, two lines, a time on the right. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ ...cs, overflow: 'hidden' }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '15px 22px',
                              borderBottom: r < rows - 1 ? `1px solid ${C.border}` : 'none' }}>
          <Bone w={40} h={40} r={20} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Bone w={150} h={15} />
              <Bone w={60} h={18} r={999} />
              <div style={{ marginLeft: 'auto' }}><Bone w={86} h={12} /></div>
            </div>
            <Bone w="62%" h={13} mt={9} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A card with a heading and a body — the generic panel. */
export function PanelSkeleton({ lines = 4, height }: { lines?: number; height?: number }) {
  return (
    <div style={{ ...cs, overflow: 'hidden' }}>
      <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}` }}>
        <Bone w={170} h={17} />
        <Bone w={260} h={12} mt={8} />
      </div>
      <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        {height
          ? <Bone w="100%" h={height} r={R.card === '14px' ? 12 : 10} />
          : Array.from({ length: lines }).map((_, i) => <Bone key={i} w={i === lines - 1 ? '55%' : '100%'} h={14} />)}
      </div>
    </div>
  );
}

/** Figures across the top, then a table. Users, Blog, Sync Performance, Updates. */
export function StatsAndTableSkeleton({ stats = 4, rows = 6, cols = 5 }: {
  stats?: number; rows?: number; cols?: number;
}) {
  return (
    <Skel>
      <StatRowSkeleton n={stats} />
      <TableSkeleton rows={rows} cols={cols} />
    </Skel>
  );
}

/** Figures across the top, then a list. Support. */
export function StatsAndListSkeleton({ stats = 4, rows = 5 }: { stats?: number; rows?: number }) {
  return (
    <Skel>
      <StatRowSkeleton n={stats} />
      <ListSkeleton rows={rows} />
    </Skel>
  );
}

/** A bare list, no figures above it. */
export function JustListSkeleton({ rows = 5 }: { rows?: number }) {
  return <Skel><ListSkeleton rows={rows} /></Skel>;
}

/** A bare table, no figures above it. */
export function JustTableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return <Skel><TableSkeleton rows={rows} cols={cols} /></Skel>;
}

/** Two panels side by side — System Monitor, Settings. */
export function TwoPanelSkeleton({ stats = 0 }: { stats?: number }) {
  return (
    <Skel>
      {stats > 0 && <StatRowSkeleton n={stats} />}
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <PanelSkeleton lines={5} />
        <PanelSkeleton lines={5} />
      </div>
    </Skel>
  );
}
