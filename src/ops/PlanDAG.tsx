import { useEffect, useRef } from 'react';
import { CheckCircle, Loader2, Clock, AlertTriangle, AlertOctagon, HelpCircle } from 'lucide-react';

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
  nodeW: number;
  nodeH: number;
  columns: number;
  colX: number[]; // desktop column x starts
  waveTopY: number[]; // mobile wave group starts
};

function useLayout(nodes: PlanNodeVM[], containerWidth: number, isMobile: boolean): Layout {
  const byWave: Record<number, PlanNodeVM[]> = { 0: [], 1: [], 2: [] };
  for (const n of nodes) byWave[n.wave].push(n);

  // sizes
  const colGap = 64;
  const rowGap = 16;
  const nodeW = isMobile ? Math.max(220, containerWidth - 24) : 220;
  const nodeH = 60; // ≥44px touch target

  const columns = isMobile ? 1 : 3;
  const colWidth = nodeW;
  const xBase = 12;
  const yBase = 12;

  const pos: Record<string, { x: number; y: number }> = {};
  let width = isMobile ? nodeW + 24 : columns * colWidth + (columns - 1) * colGap + 24;
  let height = 0;
  const colX: number[] = [];
  const waveTopY: number[] = [];

  if (isMobile) {
    // Stack by wave vertically
    let y = yBase;
    for (const wave of [0, 1, 2] as const) {
      waveTopY[wave] = y;
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
      const x = xBase + wave * (colWidth + colGap);
      colX[wave] = x;
      for (let i = 0; i < list.length; i++) {
        const y = yBase + i * (nodeH + rowGap);
        pos[list[i].id] = { x, y };
      }
    }
  }

  return { pos, width, height, nodeW, nodeH, columns, colX, waveTopY };
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
  return cp(fromId) && cp(toId) ? '#6D28D9' /* violet-700 */ : '#334155' /* slate-700 */;
}

export function PlanDAG({ nodes, onSelectNode }: PlanDAGProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [w, isMobile] = useViewport(containerRef);
  const layout = useLayout(nodes, w, isMobile);

  return (
    <div>
      <div ref={containerRef} className="relative border rounded p-2 md:p-3" style={{ height: layout.height }}>
        {/* Single SVG for edges with arrowheads */}
        <svg
          width="100%"
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="absolute left-0 top-0"
          style={{ pointerEvents: 'none' }}
        >
          <defs>
            <marker id="arrow-slate" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155" />
            </marker>
            <marker id="arrow-violet" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6D28D9" />
            </marker>
          </defs>
          {nodes.map((to) =>
            to.dependsOn.map((fromId) => {
              const from = layout.pos[fromId];
              const dest = layout.pos[to.id];
              if (!from || !dest) return null;
              const sx = isMobile ? from.x + layout.nodeW / 2 : from.x + layout.nodeW;
              const sy = isMobile ? from.y + layout.nodeH : from.y + layout.nodeH / 2;
              const tx = isMobile ? dest.x + layout.nodeW / 2 : dest.x;
              const ty = isMobile ? dest.y : dest.y + layout.nodeH / 2;
              const color = edgeColor(fromId, to.id);
              const width = cpEdge(fromId, to.id) ? 4 : 2.5;
              const marker = color === '#6D28D9' ? 'url(#arrow-violet)' : 'url(#arrow-slate)';
              const d = isMobile
                ? orthogonalPathV(sx, sy, tx, ty)
                : cubicPathH(sx, sy, tx, ty);
              return (
                <path
                  key={`${fromId}->${to.id}`}
                  d={d}
                  stroke={color}
                  strokeWidth={width}
                  fill="none"
                  markerEnd={marker}
                />
              );
            })
          )}
          {/* Wave labels in SVG to share coordinates */}
          {!isMobile &&
            [0, 1, 2].map((wIdx) => (
              <text key={wIdx} x={(layout.colX[wIdx] ?? 12) + 4} y={12} fontSize="10" fill="#64748B">
                WAVE {wIdx}
              </text>
            ))}
          {isMobile &&
            [0, 1, 2].map((wIdx) => (
              <text key={wIdx} x={16} y={(layout.waveTopY[wIdx] ?? 12) - 4} fontSize="10" fill="#64748B">
                WAVE {wIdx}
              </text>
            ))}
        </svg>

        {/* Absolutely positioned HTML nodes using the same layout map */}
        {nodes.map((n) => {
          const p = layout.pos[n.id];
          const colors = nodeColor(n);
          const visual = nodeVisual(n);
          const Icon = visual.Icon;
          return (
            <button
              key={n.id}
              onClick={() => onSelectNode(n.id)}
              className="absolute text-left rounded border px-3 py-3 focus:outline-none"
              style={{
                background: colors.bg,
                borderColor: colors.border,
                left: p.x,
                top: p.y,
                width: layout.nodeW,
                minHeight: layout.nodeH,
              }}
              aria-label={`${n.worker} ${visual.label}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={20} className={visual.colorClass + (visual.spin ? ' animate-spin' : '')} />
                  <div className="font-medium capitalize">{n.worker.replace('_', ' ')}</div>
                </div>
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

      {/* Optional tiny legend for judges */}
      <div className="mt-2 text-xs text-gray-600 flex flex-wrap items-center gap-x-4 gap-y-2">
        <LegendItem icon={<CheckCircle size={16} className="text-green-600" />} label="Success" />
        <LegendItem icon={<Loader2 size={16} className="text-blue-600" />} label="Running" />
        <LegendItem icon={<AlertTriangle size={16} className="text-amber-600" />} label="Needs review / Degraded" />
        <LegendItem icon={<AlertOctagon size={16} className="text-red-600" />} label="Failed" />
        <LegendItem icon={<Clock size={16} className="text-gray-600" />} label="Queued" />
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

// Horizontal cubic Bezier from right port to left port (desktop)
function cubicPathH(sx: number, sy: number, tx: number, ty: number): string {
  const dx = Math.max(32, (tx - sx) / 2);
  const c1x = sx + dx;
  const c1y = sy;
  const c2x = tx - dx;
  const c2y = ty;
  return `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`;
}

// Orthogonal path from bottom port to top port (mobile)
function orthogonalPathV(sx: number, sy: number, tx: number, ty: number): string {
  const midY = sy + (ty - sy) / 2;
  return `M ${sx} ${sy} V ${midY} H ${tx} V ${ty}`;
}

function nodeVisual(n: PlanNodeVM): {
  Icon: typeof CheckCircle;
  label: string;
  colorClass: string;
  spin?: boolean;
} {
  if (n.state === 'FAILED' || n.failed) {
    return { Icon: AlertOctagon, label: 'Failed', colorClass: 'text-red-600' };
  }
  if (n.conflict || (n.degraded && n.worker === 'utility_rules')) {
    return { Icon: AlertTriangle, label: 'Needs review', colorClass: 'text-amber-600' };
  }
  if (n.state === 'DONE') {
    return { Icon: CheckCircle, label: 'Success', colorClass: 'text-green-600' };
  }
  if (n.state === 'RUNNING') {
    return { Icon: Loader2, label: 'Running', colorClass: 'text-blue-600', spin: true };
  }
  if (n.state === 'PENDING') {
    return { Icon: Clock, label: 'Queued', colorClass: 'text-gray-600' };
  }
  return { Icon: HelpCircle, label: 'Unknown', colorClass: 'text-violet-700' };
}

function LegendItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span>{label}</span>
    </div>
  );
}
