import { useEffect, useRef } from 'react';

export type PlanNodeVM = {
  id: string;
  worker: 'resolve_pack' | 'city' | 'electrical' | 'fire' | 'utility_rules' | 'reconcile';
  wave: 0 | 1 | 2;
  dependsOn: string[];
  state: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  // Minimal hints to colorize
  conflict?: boolean; // e.g., fire NO_REQUIREMENT vs verified
  degraded?: boolean; // utility fallback used
  failed?: boolean; // explicit failure
};

export type PlanDAGProps = {
  nodes: PlanNodeVM[];
  onSelectNode: (id: string) => void;
};

type Layout = {
  // pixel positions inside the svg viewport
  pos: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
  columns: number;
};

function useLayout(nodes: PlanNodeVM[], containerWidth: number, isMobile: boolean): Layout {
  const byWave: Record<number, PlanNodeVM[]> = { 0: [], 1: [], 2: [] };
  for (const n of nodes) byWave[n.wave].push(n);

  // sizes
  const colGap = 48;
  const rowGap = 16;
  const nodeW = isMobile ? containerWidth - 24 : 180;
  const nodeH = 56; // ≥44px touch target

  const columns = isMobile ? 1 : 3;
  const colWidth = isMobile ? nodeW : nodeW;
  const xBase = 12;
  const yBase = 12;

  const pos: Record<string, { x: number; y: number }> = {};
  let width = isMobile ? nodeW + 24 : columns * colWidth + (columns - 1) * colGap + 24;
  let height = 0;

  if (isMobile) {
    // Stack by wave vertically
    let y = yBase;
    for (const wave of [0, 1, 2] as const) {
      const list = byWave[wave];
      for (let i = 0; i < list.length; i++) {
        pos[list[i].id] = { x: xBase, y };
        y += nodeH + rowGap;
      }
      y += rowGap; // extra gap between waves
    }
    height = y + 12;
  } else {
    // Columns left→right by wave; rows by index
    const maxRows = Math.max(byWave[0].length, byWave[1].length, byWave[2].length, 1);
    height = yBase + maxRows * (nodeH + rowGap) + 12;
    for (const wave of [0, 1, 2] as const) {
      const list = byWave[wave];
      for (let i = 0; i < list.length; i++) {
        const x = xBase + wave * (colWidth + colGap);
        const y = yBase + i * (nodeH + rowGap);
        pos[list[i].id] = { x, y };
      }
    }
  }

  return { pos, width, height, columns };
}

function nodeColor(n: PlanNodeVM): { bg: string; border: string } {
  if (n.state === 'RUNNING') return { bg: '#E0F2FE', border: '#0284C7' }; // sky
  if (n.state === 'FAILED' || n.failed) return { bg: '#FEE2E2', border: '#DC2626' }; // red
  if (n.conflict) return { bg: '#FEF9C3', border: '#CA8A04' }; // amber (Needs review)
  if (n.state === 'DONE') return { bg: '#DCFCE7', border: '#16A34A' }; // green
  return { bg: '#F3F4F6', border: '#9CA3AF' }; // queued/unknown
}

function edgeColor(fromId: string, toId: string): string {
  // Emphasize a simple critical path: resolve→(utility_rules|fire)→reconcile
  const cp = (id: string) =>
    id === 'n0_resolve_pack' || id === 'n1_utility_rules' || id === 'n1_fire' || id === 'n2_reconcile';
  return cp(fromId) && cp(toId) ? '#7C3AED' /* violet */ : '#CBD5E1' /* slate-300 */;
}

export function PlanDAG({ nodes, onSelectNode }: PlanDAGProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [w, isMobile] = useViewport(containerRef);
  const layout = useLayout(nodes, w, isMobile);

  return (
    <div ref={containerRef} className="relative border rounded p-2 md:p-3">
      <svg width="100%" height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} className="absolute left-0 top-0 pointer-events-none">
        {nodes.map((to) =>
          to.dependsOn.map((fromId) => {
            const from = layout.pos[fromId];
            const dest = layout.pos[to.id];
            if (!from || !dest) return null;
            const x1 = from.x + (isMobile ? 0 : 180); // right edge for desktop
            const y1 = from.y + 28;
            const x2 = dest.x + (isMobile ? 0 : 0); // left edge for desktop; same x for mobile (vertical)
            const y2 = dest.y + 28;
            const path =
              isMobile
                ? `M ${x1 + 90} ${y1} V ${y2}` // vertical connector in center on mobile
                : `M ${x1} ${y1} C ${x1 + 24} ${y1}, ${x2 - 24} ${y2}, ${x2} ${y2}`;
            return (
              <path key={`${fromId}->${to.id}`} d={path} stroke={edgeColor(fromId, to.id)} strokeWidth={cpEdge(fromId, to.id) ? 3 : 1.5} fill="none" />
            );
          })
        )}
      </svg>
      <div className={isMobile ? 'space-y-4' : 'grid md:grid-cols-3 gap-4'}>
        {[0, 1, 2].map((wave) => {
          const group = nodes.filter((n) => n.wave === wave);
          return (
            <div key={wave} className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-gray-500 px-1">Wave {wave}</div>
              {group.map((n) => {
                const colors = nodeColor(n);
                return (
                  <button
                    key={n.id}
                    onClick={() => onSelectNode(n.id)}
                    className="relative w-full text-left rounded border px-3 py-3 focus:outline-none"
                    style={{ background: colors.bg, borderColor: colors.border, minHeight: 56 }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium capitalize">{n.worker.replace('_', ' ')}</div>
                      {n.degraded && n.worker === 'utility_rules' ? (
                        <span className="ml-2 inline-block rounded bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5">degraded</span>
                      ) : null}
                    </div>
                    <div className="text-xs mt-0.5">
                      {n.state === 'PENDING' ? 'Queued' : n.state === 'DONE' && n.conflict ? 'Needs review' : n.state.toLowerCase()}
                    </div>
                    {(n.failed || n.state === 'FAILED' || n.conflict) && (
                      <span className="absolute -inset-0.5 rounded ring-2 ring-red-500 animate-pulse pointer-events-none" />
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function cpEdge(fromId: string, toId: string): boolean {
  const set = new Set(['n0_resolve_pack', 'n1_utility_rules', 'n1_fire', 'n2_reconcile']);
  return set.has(fromId) && set.has(toId);
}

function useViewport(ref: React.RefObject<HTMLElement | null>): [number, boolean] {
  const width = useRefNumber(0);
  const isMobile = useRefNumber(0);
  useEffect(() => {
    function update() {
      const w = ref.current?.clientWidth ?? 360;
      width.set(w);
      isMobile.set(w < 768 ? 1 : 0);
    }
    update();
    const obs = new ResizeObserver(update);
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref]);
  return [width.get(), isMobile.get() === 1];
}

function useRefNumber(initial: number) {
  const r = useRef({ v: initial });
  return {
    get: () => r.current.v,
    set: (v: number) => (r.current.v = v),
  };
}
