import React, { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
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
  attempts?: number;
};

export type PlanDAGProps = {
  nodes: PlanNodeVM[];
  onSelectNode: (id: string) => void;
  selectedNodeId?: string | null;
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
  const colGap = isMobile ? 28 : 40;
  const rowGap = isMobile ? 12 : 14;
  const nodeW = isMobile ? Math.max(240, containerWidth - 24) : 190;
  const nodeH = isMobile ? 52 : 44;

  const columns = isMobile ? 1 : 3;
  const colWidth = nodeW;
  const xBase = 12;
  const yBase = 34;

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
    height = yBase + maxRows * (nodeH + rowGap) + 18;
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

export function PlanDAG({ nodes, onSelectNode, selectedNodeId }: PlanDAGProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [w, isMobile] = useViewport(containerRef);
  const layout = useLayout(nodes, w, isMobile);
  const sizesRef = useRef<Record<string, { w: number; h: number }>>({});
  const [, force] = (React as any).useState ? (React as any).useState(0) : [0, (_: any) => {}];

  // Measure chip sizes after paint to align ports accurately
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const nodeEls = el.querySelectorAll<HTMLElement>('[data-node-id]');
    let changed = false;
    nodeEls.forEach((n) => {
      const id = n.dataset.nodeId!;
      const rect = n.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      const prev = sizesRef.current[id];
      if (!prev || prev.w !== w || prev.h !== h) {
        sizesRef.current[id] = { w, h };
        changed = true;
      }
    });
    if (changed) force((x: number) => x + 1);
    // Re-measure on resize
    const ro = new ResizeObserver(() => {
      let changed2 = false;
      nodeEls.forEach((n) => {
        const id = n.dataset.nodeId!;
        const rect = n.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        const prev = sizesRef.current[id];
        if (!prev || prev.w !== w || prev.h !== h) {
          sizesRef.current[id] = { w, h };
          changed2 = true;
        }
      });
      if (changed2) force((x: number) => x + 1);
    });
    nodeEls.forEach((n) => ro.observe(n));
    return () => ro.disconnect();
  }, [nodes, layout.width, layout.height]);

  return (
    <div>
      <div ref={containerRef} className="console-dag-canvas relative border rounded p-2 md:p-3 overflow-x-auto">
        <div className="relative mx-auto" style={{ width: layout.width, height: layout.height }}>
        {/* Single SVG for edges with arrowheads */}
        <svg
            width={layout.width}
            height={layout.height}
            className="absolute left-0 top-0"
            style={{ pointerEvents: 'none' }}
          >
          <defs>
              <marker id="arrow-slate" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155" />
            </marker>
              <marker id="arrow-violet" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6D28D9" />
            </marker>
          </defs>
          {isMobile ? (
            // Mobile: draw simple vertical trunks between wave groups
            <>
              {drawMobileTrunk(nodes, layout, (id) => sizesRef.current[id] ?? { w: layout.nodeW, h: layout.nodeH })}
            </>
          ) : (
            // Desktop: orthogonal bus fan-out/fan-in, per-edge with arrowheads
            <>
              {drawDesktopBusPaths(nodes, layout, (id) => sizesRef.current[id] ?? { w: layout.nodeW, h: layout.nodeH })}
            </>
          )}
          {/* Wave labels in SVG to share coordinates */}
          {/* Wave labels as HTML to avoid z-index issues */}
        </svg>
          {!isMobile &&
            [0, 1, 2].map((wIdx) => (
              <div
                key={wIdx}
                className="absolute console-dag-wave-label"
                style={{
                  left: (layout.colX[wIdx] ?? 12) + layout.nodeW / 2,
                  top: 2,
                  transform: 'translateX(-50%)',
                  pointerEvents: 'none',
                }}
              >
                WAVE {wIdx}
              </div>
            ))}
          {isMobile &&
            [0, 1, 2].map((wIdx) => (
              <div
                key={wIdx}
                className="absolute console-dag-wave-label"
                style={{
                  left: 16,
                  top: (layout.waveTopY[wIdx] ?? 12) - 10,
                  pointerEvents: 'none',
                }}
              >
                WAVE {wIdx}
              </div>
            ))}

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
            className={`console-dag-node absolute text-left ${selectedNodeId === n.id ? 'is-selected' : ''} ${visual.tone}`}
              style={{
                background: colors.bg,
                borderColor: colors.border,
                left: p.x,
                top: p.y,
              minHeight: layout.nodeH,
              width: layout.nodeW,
              }}
              aria-label={`${n.worker} ${visual.label}`}
              title={`${workerLabel(n.worker)} — ${visual.label}`}
            data-node-id={n.id}
            >
            <span className="console-dag-pill-icon"><Icon size={16} className={visual.colorClass + (visual.spin ? ' animate-spin' : '')} /></span>
            <span className="console-dag-pill-name">{workerLabel(n.worker)}</span>
            <span className="console-dag-pill-state">{visual.label}</span>
              {(n.failed || n.state === 'FAILED' || n.conflict) && (
                <span className="absolute -inset-0.5 rounded ring-2 ring-red-500 animate-pulse pointer-events-none" />
              )}
            </button>
          );
        })}
        </div>
      </div>

      {/* Optional tiny legend for judges */}
      <div className="console-dag-legend mt-2 text-xs text-gray-600 flex flex-wrap items-center gap-x-4 gap-y-2">
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
  const [width, setWidth] = useState(360);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  useEffect(() => {
    function update() {
      const w = ref.current?.clientWidth ?? 360;
      setWidth(w);
      setIsMobile(window.innerWidth < 768);
    }
    update();
    const obs = new ResizeObserver(update);
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref]);
  return [width, isMobile];
}

function nodeVisual(n: PlanNodeVM): {
  Icon: typeof CheckCircle;
  label: string;
  colorClass: string;
  spin?: boolean;
  tone: string;
} {
  if (n.state === 'FAILED' || n.failed) {
    return { Icon: AlertOctagon, label: 'Failed', colorClass: 'text-red-600', tone: 'is-danger' };
  }
  if (n.conflict || (n.degraded && n.worker === 'utility_rules')) {
    return { Icon: AlertTriangle, label: 'Needs review', colorClass: 'text-amber-600', tone: 'is-review' };
  }
  if (n.state === 'DONE') {
    return { Icon: CheckCircle, label: 'Complete', colorClass: 'text-green-600', tone: 'is-done' };
  }
  if (n.state === 'RUNNING') {
    return { Icon: Loader2, label: 'Running', colorClass: 'text-blue-600', spin: true, tone: 'is-running' };
  }
  if (n.state === 'PENDING') {
    return { Icon: Clock, label: 'Queued', colorClass: 'text-gray-600', tone: 'is-queued' };
  }
  return { Icon: HelpCircle, label: 'Unknown', colorClass: 'text-violet-700', tone: 'is-unknown' };
}

function workerLabel(worker: PlanNodeVM['worker']) {
  return ({ resolve_pack: 'Resolve pack', city: 'City review', electrical: 'Electrical', fire: 'Fire safety', utility_rules: 'Utility rules', reconcile: 'Reconcile' })[worker];
}

function LegendItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span>{label}</span>
    </div>
  );
}

// Helpers: desktop bus layout
function drawDesktopBusPaths(
  nodes: PlanNodeVM[],
  layout: ReturnType<typeof useLayout>,
  sizeOf: (id: string) => { w: number; h: number }
): ReactElement[] {
  const wave0 = nodes.filter((n) => n.wave === 0);
  const wave1 = nodes.filter((n) => n.wave === 1);
  const wave2 = nodes.filter((n) => n.wave === 2);
  const out: ReactElement[] = [];
  const s = wave0.find((n) => n.worker === 'resolve_pack') ?? wave0[0];
  const t = wave2.find((n) => n.worker === 'reconcile') ?? wave2[0];
  if (s && wave1.length > 0) {
    const sp = layout.pos[s.id];
    const ssz = sizeOf(s.id);
    const sx = sp.x + ssz.w;
    const sy = sp.y + ssz.h / 2;
    const busX = sx + 12; // just to the right of source column
    for (const child of wave1) {
      const cp = layout.pos[child.id];
      const csz = sizeOf(child.id);
      const cy = cp.y + csz.h / 2;
      const color = edgeColor(s.id, child.id);
      const width = cpEdge(s.id, child.id) ? 2.25 : 1.6;
      const marker = color === '#6D28D9' ? 'url(#arrow-violet)' : 'url(#arrow-slate)';
      const d = `M ${sx} ${sy} L ${busX} ${sy} L ${busX} ${cy} L ${cp.x} ${cy}`;
      out.push(<path key={`${s.id}->${child.id}`} d={d} stroke={color} strokeWidth={width} fill="none" markerEnd={marker} />);
    }
  }
  if (t && wave1.length > 0) {
    const tp = layout.pos[t.id];
    const tsz = sizeOf(t.id);
    const tx = tp.x;
    const ty = tp.y + tsz.h / 2;
    const busX = tx - 12; // just to the left of target column
    for (const child of wave1) {
      const cp = layout.pos[child.id];
      const csz = sizeOf(child.id);
      const sx = cp.x + csz.w;
      const sy = cp.y + csz.h / 2;
      const color = edgeColor(child.id, t.id);
      const width = cpEdge(child.id, t.id) ? 2.25 : 1.6;
      const marker = color === '#6D28D9' ? 'url(#arrow-violet)' : 'url(#arrow-slate)';
      const d = `M ${sx} ${sy} L ${busX} ${sy} L ${busX} ${ty} L ${tx} ${ty}`;
      out.push(<path key={`${child.id}->${t.id}`} d={d} stroke={color} strokeWidth={width} fill="none" markerEnd={marker} />);
    }
  }
  return out;
}

// Helpers: mobile vertical trunks between waves (no per-sibling edges)
function drawMobileTrunk(
  nodes: PlanNodeVM[],
  layout: ReturnType<typeof useLayout>,
  sizeOf: (id: string) => { w: number; h: number }
): ReactElement[] {
  const out: ReactElement[] = [];
  // Compute group bounding boxes
  const group = (wave: 0 | 1 | 2) => {
    const list = nodes.filter((n) => n.wave === wave);
    if (list.length === 0) return null;
    const top = Math.min(...list.map((n) => layout.pos[n.id].y));
    const bottom = Math.max(...list.map((n) => layout.pos[n.id].y + sizeOf(n.id).h));
    const cx = (layout.pos[list[0].id].x ?? 12) + sizeOf(list[0].id).w / 2;
    return { top, bottom, cx };
  };
  const g0 = group(0);
  const g1 = group(1);
  const g2 = group(2);
  const arrow = 'url(#arrow-slate)';
  if (g0 && g1) {
    const d = `M ${g0.cx} ${g0.bottom} V ${g1.top - 8}`;
    out.push(<path key="g0-g1" d={d} stroke="#334155" strokeWidth={2} fill="none" markerEnd={arrow} />);
  }
  if (g1 && g2) {
    const d = `M ${g1.cx} ${g1.bottom} V ${g2.top - 8}`;
    out.push(<path key="g1-g2" d={d} stroke="#334155" strokeWidth={2} fill="none" markerEnd={arrow} />);
  }
  return out;
}
