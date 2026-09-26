import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Check, CircleAlert, CircleCheck, ImagePlus, Info, Loader2, MapPin, RotateCcw, Send, Upload } from 'lucide-react';
import { classifyImages, mockScene, onModelStatus, prewarmAnalyzer, prewarmDetector, type ModelState } from '../lib/meter/analyzer';
import { grab, gray } from '../lib/meter/frames';
import type { Gray } from '../lib/meter/image';
import { createFocusTracker, FAST_SIZE, fastMetrics } from '../lib/meter/metrics';
import { guideWall, spaceLimitedOnly, wallInFocus, type MeterSpot, type WallCheck, type WallDecision, type WallGuidance, type WallLive } from '../lib/wall/assess';
import { shortFix, WALL_CRITERIA, WALL_MESSAGES, WALL_SEQUENCE, type SceneClass, type WallMode } from '../lib/wall/criteria';
import { analyzeWallPhoto, decide, measureSpace, spotFromTap, withRuler, type WallAnalysis } from '../lib/wall/locate';
import { customerSpaceText, type SpaceFinding } from '../lib/wall/space';
import { cantSeePast, summarizeSpace } from '../lib/wall/survey';
import type { useCamera } from '../lib/useCamera';
import type { Photo } from '../lib/photos';

/** `done`: which of the three wall photos already have an accepted photo (for the progress strip). */
type Props = { camera: ReturnType<typeof useCamera>; sample: string; mode: WallMode; done: Record<WallMode, boolean>; skipped?: WallMode[]; spotKnown?: boolean; onAccept: (p: Photo) => void };
const MODE_LABEL: Record<WallMode, string> = { wall: 'Whole wall', right: 'Right of meter', left: 'Left of meter' };
type Goal = { label: string; state: 'pass' | 'fail' | 'warn' | 'info'; detail?: string };
type Still = { url: string; source: Photo['source'] };
type Phase = 'live' | 'checking' | 'confirm' | 'tap' | 'result';
const debug = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Where an object-fit: contain image is drawn inside its box. */
function containRect(box: { w: number; h: number }, img: { w: number; h: number }) {
  const s = Math.min(box.w / img.w, box.h / img.h), w = img.w * s, h = img.h * s;
  return { x: (box.w - w) / 2, y: (box.h - h) / 2, w, h };
}

export function WallCapture({ camera, sample, mode, done, skipped = [], spotKnown = false, onAccept }: Props) {
  const [phase, setPhase] = useState<Phase>('live');
  const [still, setStill] = useState<Still | null>(null);
  const [analysis, setAnalysis] = useState<WallAnalysis | null>(null);
  const [spot, setSpot] = useState<MeterSpot | null>(null);
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 });
  const [decision, setDecision] = useState<WallDecision | null>(null);
  const [space, setSpace] = useState<SpaceFinding | null>(null);
  const [rejections, setRejections] = useState(0);
  const [guidance, setGuidance] = useState<WallGuidance | null>(null);
  const [error, setError] = useState('');
  const [videoReady, setVideoReady] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [models, setModels] = useState<{ subject: ModelState; error: string }>({ subject: 'loading', error: '' });
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown>>({});
  const resultRef = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), file = useRef<HTMLInputElement>(null);
  const live = useRef<Omit<WallLive, 'now'> & { prev: Gray | null }>({ fast: null, goodFrames: 0, landscape: true, scene: null, prev: null });
  const run = useRef(0);
  const stillRef = useRef<Still | null>(null);
  const setOwnedStill = (s: Still | null) => { const old = stillRef.current; if (old && old !== s && old.url.startsWith('blob:')) URL.revokeObjectURL(old.url); stillRef.current = s; setStill(s); };

  useEffect(() => {
    void prewarmAnalyzer().catch(() => undefined);
    void prewarmDetector();
    const off = onModelStatus(s => setModels({ subject: s.subject, error: s.error }));
    return () => { off(); run.current++; const s = stillRef.current; if (s?.url.startsWith('blob:')) URL.revokeObjectURL(s.url); };
  }, []);
  // Keep the verdict on screen: on a phone the card sits below the photo.
  useEffect(() => { if (phase === 'result') resultRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [phase, decision]);
  useLayoutEffect(() => {
    const el = frame.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el); return () => ro.disconnect();
  }, [phase]);
  useEffect(() => {
    setVideoReady(false);
    if (video.current && phase === 'live') { video.current.srcObject = camera.stream; if (camera.stream) void video.current.play().catch(() => undefined); }
  }, [camera.stream, phase]);

  const finish = useCallback((a: WallAnalysis, picked: MeterSpot | null) => {
    const meter = withRuler(a, picked);
    const d = decide(a, meter, mode);
    const f = meter ? measureSpace(a, meter, mode) : null;
    setSpot(meter); setDecision(d); setSpace(f); setPhase('result');
    if (!d.accepted) setRejections(n => n + 1);
    if (debug) setDebugInfo(i => ({ ...i, meter, estimate: d.estimate, space: f && { spot: f.spot, stretches: f.stretches.map(x => `${x.side} ${x.ft?.toFixed(1)} ft`), blockers: f.blockers.map(b => b.name) } }));
  }, [mode]);

  const check = useCallback(async (s: Still) => {
    const id = ++run.current;
    setOwnedStill(s); setAnalysis(null); setDecision(null); setSpot(null); setPhase('checking'); setError('');
    try {
      const a = await analyzeWallPhoto(s.url);
      if (id !== run.current) return;
      setAnalysis(a);
      if (debug) setDebugInfo({ scene: a.scene, candidates: a.candidates.map(c => ({ x: Math.round(c.circle.x), y: Math.round(c.circle.y), r: Math.round(c.circle.r), p: c.p?.toFixed(2) ?? '—' })), luma: Math.round(a.luma), sharpness: Math.round(a.sharpness) });
      if (a.proposal) { setSpot(a.proposal); setPhase('confirm'); }
      else { setCursor({ x: 0.5, y: 0.5 }); setPhase('tap'); }
    } catch (e) {
      if (id !== run.current) return;
      console.error(e); setError('We couldn’t check this photo. Try another one.'); setPhase('live');
    }
  }, []);

  const capture = useCallback(() => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob(b => { if (b) void check({ url: URL.createObjectURL(b), source: 'camera' }); }, 'image/jpeg', 0.92);
  }, [check]);

  // Live guidance: cheap metrics ~8x/s on the whole frame; "is this the wall of a house?" about once a second.
  useEffect(() => {
    if (phase !== 'live' || !camera.stream || !videoReady) return;
    const id = run.current; let alive = true;
    live.current = { fast: null, goodFrames: 0, landscape: true, scene: null, prev: null };
    const focus = createFocusTracker();
    const tick = setInterval(() => {
      const v = video.current; if (!v || !v.videoWidth) return;
      const small = gray(grab(v, { x: 0, y: 0, w: v.videoWidth, h: v.videoHeight }, FAST_SIZE));
      const m = fastMetrics(small, live.current.prev);
      m.relSharpness = focus(performance.now(), m.sharpness);
      live.current.prev = small; live.current.fast = m; live.current.landscape = v.videoWidth >= v.videoHeight;
      live.current.goodFrames = m.luma >= WALL_CRITERIA.minLuma && wallInFocus(m) && m.motion <= WALL_CRITERIA.maxMotion ? live.current.goodFrames + 1 : 0;
      const g = guideWall({ ...live.current, mode, now: performance.now() });
      setGuidance(prev => (prev && prev.message === g.message && prev.tone === g.tone && JSON.stringify(prev.checks) === JSON.stringify(g.checks) ? prev : g));
      if (debug) setDebugInfo(d => ({ ...d, luma: m.luma.toFixed(0), sharp: m.sharpness.toFixed(0), relSharp: m.relSharpness.toFixed(2), motion: m.motion.toFixed(1) }));
    }, 125);
    (async () => {
      while (alive && id === run.current) {
        const v = video.current;
        if (!v || !v.videoWidth) { await sleep(250); continue; }
        const mock = mockScene();
        const r = mock ?? (await classifyImages<SceneClass>([grab(v, { x: 0, y: 0, w: v.videoWidth, h: v.videoHeight }, 336)], 'scene'))?.[0] ?? null;
        if (!alive) return;
        if (r) { live.current.scene = { result: r, at: performance.now() }; if (debug) setDebugInfo(d => ({ ...d, scene: r.status === 'ok' ? Object.fromEntries(Object.entries(r.probs).map(([k, p]) => [k, (p as number).toFixed(2)])) : r })); }
        await sleep(r ? 700 : 1500);
      }
    })();
    return () => { alive = false; clearInterval(tick); };
  }, [phase, camera.stream, videoReady, mode]);

  async function pick(x: number, y: number) {
    if (!analysis) return;
    const s = await spotFromTap(analysis, Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)));
    finish(analysis, s);
  }
  function onTap(e: PointerEvent<HTMLDivElement>) {
    if (phase !== 'tap' || !analysis) return;
    const el = frame.current!.getBoundingClientRect();
    const r = containRect({ w: el.width, h: el.height }, { w: analysis.img.naturalWidth, h: analysis.img.naturalHeight });
    const x = (e.clientX - el.left - r.x) / r.w, y = (e.clientY - el.top - r.y) / r.h;
    if (x < 0 || y < 0 || x > 1 || y > 1) return;
    void pick(x, y);
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (phase !== 'tap') return;
    const step = e.shiftKey ? 0.1 : 0.02, moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); setCursor(c => ({ x: Math.min(1, Math.max(0, c.x + moves[e.key][0])), y: Math.min(1, Math.max(0, c.y + moves[e.key][1])) })); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void pick(cursor.x, cursor.y); }
  }
  /** The customer can't step back further: accept on the other checks and flag it for Base's team. */
  function cantStepBack() {
    if (!analysis) return;
    const d = decide(analysis, spot, mode, true);
    setDecision(d);
    if (debug) setDebugInfo(i => ({ ...i, limitedSpace: true }));
  }
  function retake() { run.current++; setAnalysis(null); setDecision(null); setSpace(null); setSpot(null); setOwnedStill(null); setGuidance(null); setPhase('live'); }
  function use(override = false) {
    if (!still || !decision) return;
    const s = still; stillRef.current = null; setStill(null);
    const est = decision.estimate;
    const summary = space ? summarizeSpace(space) : undefined;
    const details = [
      decision.limitedSpace ? 'Limited space — customer couldn’t step back further.' : null,
      summary?.text ?? null,
      est && mode === 'wall' ? `Photo shows about ${Math.round(est.leftFt)} ft left of the meter and ${Math.round(est.rightFt)} ft right (frame width, estimate).` : null,
    ].filter(Boolean).join(' ');
    onAccept({ url: s.url, source: s.source, status: 'confirmed', warnings: [], check: { accepted: decision.accepted, meterNumber: null, reasons: decision.reasons, override, ...(decision.limitedSpace ? { limitedSpace: true } : {}), ...(summary ? { space: summary } : {}), ...(details ? { details } : {}) } });
  }

  const tone = guidance?.tone ?? 'search';
  const photoRect = analysis && size.w ? containRect(size, { w: analysis.img.naturalWidth, h: analysis.img.naturalHeight }) : null;
  const ring = (s: { x: number; y: number; r: number | null } | null, cls: string) => s && photoRect &&
    <span className={`meter-pin ${cls}`} style={{ left: photoRect.x + s.x * photoRect.w, top: photoRect.y + s.y * photoRect.h, width: Math.max(36, (s.r ?? 0.03) * 2.6 * photoRect.h), height: Math.max(36, (s.r ?? 0.03) * 2.6 * photoRect.h) }} aria-hidden="true" />;
  const d = decision;
  const seePast = d?.accepted && space && !spotKnown ? cantSeePast(space) : null;

  return <>
    <ol className="wall-steps" aria-label="Meter wall photos">
      {WALL_SEQUENCE.map((m, i) => <li key={m} className={m === mode ? 'current' : done[m] ? 'done' : skipped.includes(m) ? 'skipped' : ''} aria-current={m === mode ? 'step' : undefined}>
        <b>{done[m] && m !== mode ? <Check size={12} /> : i + 1}</b>{MODE_LABEL[m]}{skipped.includes(m) && !done[m] && m !== mode && <small> · not needed</small>}</li>)}
    </ol>
    <div ref={frame} className={`camera-frame wall-frame ${phase !== 'live' ? 'has-photo' : ''} ${phase === 'tap' ? 'tapping' : ''} ${tone === 'ready' && phase === 'live' ? 'ready' : ''}`}
      onPointerUp={onTap} onKeyDown={onKey} tabIndex={phase === 'tap' ? 0 : -1} role={phase === 'tap' ? 'application' : undefined}
      aria-label={phase === 'tap' ? 'Photo: tap your meter, or use the arrow keys to move the marker and press Enter' : undefined}>
      {phase !== 'live' && still ? <>
        <img src={still.url} alt={`${MODE_LABEL[mode]} — ${still.source === 'sample' ? 'Base guide sample' : 'your photo'}`} draggable={false} />
        {phase === 'confirm' && ring(spot, 'proposed')}
        {phase === 'tap' && ring({ ...cursor, r: null }, 'cursor')}
        {phase === 'result' && ring(spot, d?.accepted ? 'good' : 'placed')}
        {phase === 'result' && photoRect && d?.checks.some(c => c.id === 'ground' && c.state === 'fail') && <div className="ground-missing" aria-hidden="true" style={{ left: photoRect.x, width: photoRect.w, top: photoRect.y + photoRect.h - 64 }}><span>↓ Ground not in the photo</span></div>}
        {phase === 'result' && space && spot && photoRect && <div className="space-strip" aria-hidden="true" style={{ left: photoRect.x, width: photoRect.w, top: photoRect.y + photoRect.h - 30 }}>
          {space.blockers.filter(b => b.kind !== 'meter' && space.sides.includes(b.x1 <= spot!.x ? 'left' : 'right')).map((b, i) => <span key={i} className="space-block" style={{ left: `${b.x0 * 100}%`, width: `${(b.x1 - b.x0) * 100}%` }}>{(b.x1 - b.x0) * photoRect.w >= b.name.length * 7 + 12 && <em>{b.name}</em>}</span>)}
          {space.spot && <span className="space-open" style={{ left: `${space.spot.x0 * 100}%`, width: `${(space.spot.x1 - space.spot.x0) * 100}%` }}><em>open wall</em></span>}
        </div>}
      </> : camera.stream ? <>
        <video ref={video} autoPlay playsInline muted onLoadedData={() => setVideoReady(true)} aria-label="Live camera preview" />
        <div className="wall-guide" aria-hidden="true"><i /><i /><i /><i /><span>Keep the ground in view</span></div>
        {mode !== 'wall' && <div className={`meter-zone ${mode}`} aria-hidden="true"><span>Meter here</span></div>}
        {camera.canWiden && <button className="lens-toggle" aria-pressed={camera.wide} aria-label={camera.wide ? 'Switch back to the normal lens' : 'Switch to the wide lens to fit more in'} onClick={() => void camera.setWide(!camera.wide)}>{camera.wide ? '1×' : '0.5×'}</button>}
        <div className={`guide-message ${tone}`} role="status" aria-live="polite">{tone === 'ready' ? <CircleCheck size={17} /> : null}{guidance?.message ?? WALL_MESSAGES.loading}</div>
        <button className="shutter" aria-label="Take photo" disabled={!videoReady} onClick={capture}><span /></button>
      </> : <div className="camera-empty"><h3>{camera.status === 'requesting' ? 'Allow your camera to get started' : 'Turn on your camera'}</h3><p>{camera.status === 'unavailable' ? 'Your camera isn’t available. You can upload a photo instead.' : 'We’ll guide you to a photo Base can use.'}</p><button className="button" onClick={() => void camera.start()} disabled={camera.status === 'requesting'}>Use camera</button></div>}
      {phase === 'checking' && <div className="checking-overlay"><Loader2 size={22} className="spin" /> Looking for your meter…</div>}
    </div>

    {phase === 'live' && <>
      <div className="photo-goals">
        <span>Looking for</span>
        <ul>{(mode === 'wall' ? ['Meter', 'Wall on both sides', 'Ground', '3 ft of open wall'] : ['Meter', `Wall to the ${mode}`, 'Ground', '3 ft of open wall']).map(t => <li key={t}>{t}</li>)}</ul>
        <p>Step back as far as you safely can{camera.canWiden ? <>; try <b>0.5×</b> if the wall doesn’t fit</> : ''}.</p>
      </div>
      <ul className="live-checks" aria-label="Photo requirements">{(guidance?.checks ?? []).map(c => <Chip key={c.id} c={c} />)}</ul>
      <p className="model-status">{models.subject === 'failed' ? <>Photo recognition didn’t load{debug ? `: ${models.error}` : ''}. You can still take the photo; we’ll ask you to point out the meter.</> : models.subject !== 'ready' ? <><Loader2 size={12} className="spin" /> Loading on-device photo recognition… (first time only)</> : <>Photos are checked on this device.</>}</p>
      {error && <p className="inline-error">{error}</p>}
      <div className="capture-fallbacks">
        <button className="button" onClick={() => file.current?.click()}><Upload size={17} /> Upload photo</button>
        <button className="button" onClick={() => void check({ url: sample, source: 'sample' })}><ImagePlus size={17} /> Try sample photo</button>
      </div>
    </>}

    {phase === 'confirm' && <div className="wall-question">
      <h3>Is this your electric meter?</h3>
      <p>{analysis?.proposal?.confident ? 'We think we found it — it’s circled in the photo.' : 'We think this might be it — it’s circled in the photo.'}</p>
      <div className="confirm-actions">
        <button className="button" onClick={() => { setCursor(spot ? { x: spot.x, y: spot.y } : { x: 0.5, y: 0.5 }); setPhase('tap'); }}><MapPin size={16} /> No, I’ll point to it</button>
        <button className="button primary" onClick={() => analysis && finish(analysis, spot)}><Check size={17} /> Yes, that’s my meter</button>
      </div>
    </div>}

    {phase === 'tap' && <div className="wall-question">
      <h3>Tap your electric meter in the photo</h3>
      <p>{analysis?.proposal ? 'Touch the meter so we can check there’s enough wall and ground around it.' : 'We couldn’t spot it automatically. Touch the meter so we can check there’s enough wall and ground around it.'}</p>
      <div className="confirm-actions">
        <button className="button" onClick={() => analysis && finish(analysis, null)}>My meter isn’t in this photo</button>
        <button className="button" onClick={retake}><RotateCcw size={16} /> Retake</button>
      </div>
    </div>}

    {phase === 'result' && d && (() => {
      const failedId = (id: string) => d.checks.some(c => c.id === id && c.state === 'fail');
      const other = mode === 'right' ? 'left' : 'right';
      const qualityFail = d.checks.find(c => (c.id === 'light' || c.id === 'focus' || c.id === 'orientation' || c.id === 'scene') && c.state === 'fail');
      const openWall: Goal | null = !space ? null
        : space.spot ? { label: 'Open wall', state: 'pass', detail: `About ${Math.round(space.spot.ft!)}${space.spot.open ? '+' : ''} ft of bare wall to the ${space.spot.side} of the meter.` }
        : spotKnown && mode !== 'wall' ? { label: 'Open wall', state: 'pass', detail: 'Already found in your whole-wall photo.' }
        : { label: 'Open wall', state: mode === 'wall' ? 'info' : 'warn', detail: customerSpaceText(space) };
      const goals: Goal[] = [
        { label: 'Meter', state: failedId('meter') ? 'fail' : 'pass' },
        { label: 'Wall', state: failedId('distance') || failedId('sides') || failedId('direction') ? (d.limitedSpace ? 'info' : 'fail') : 'pass', detail: d.limitedSpace ? 'You couldn’t step back further — noted for Base’s team.' : undefined },
        { label: 'Ground', state: failedId('ground') ? 'fail' : 'pass', detail: failedId('ground') ? 'The bottom of the photo still shows wall.' : undefined },
        ...(openWall ? [openWall] : []),
        ...(qualityFail ? [{ label: 'Clear photo', state: 'fail' as const, detail: qualityFail.message }] : []),
      ];
      const improve = d.accepted && !!seePast && !d.limitedSpace;
      const blocker = space?.nearest[mode === 'left' ? 'left' : 'right']?.name;
      const lens = camera.canWiden && !camera.wide ? ' Or tap 0.5×.' : '';
      const line = !d.accepted ? (d.primary ? shortFix(d.primary, mode) : d.reasons[0]) + (spaceLimitedOnly(d) ? lens : '')
        : d.limitedSpace ? 'Noted: you couldn’t step back further.'
        : improve ? `Step back to see past the ${blocker ?? 'meter'}.${lens}`
        : space?.spot ? `About ${Math.round(space.spot.ft!)}${space.spot.open ? '+' : ''} ft of open wall on the ${space.spot.side}.`
        : mode === 'wall' && space ? 'Crowded near the meter — we’ll look along the wall next.'
        : spotKnown && mode !== 'wall' ? 'This shows the ground in front of the open wall.'
        : null;
      return <div ref={resultRef} className={`meter-result compact ${d.accepted ? (improve ? 'improve' : 'accepted') : 'rejected'}`}>
        <div className="result-line">{d.accepted && !improve ? <CircleCheck size={22} /> : <CircleAlert size={22} />}
          <h3>{!d.accepted ? 'Retake needed' : d.limitedSpace ? 'Accepted with a note' : improve ? 'Accepted — can you show more wall?' : 'Photo accepted'}</h3></div>
        {line && <p className="fix-line">{line}</p>}
        <ul className="goal-chips" aria-label="What we found">{goals.map(g => <li key={g.label} className={g.state}>
          {g.state === 'pass' ? <Check size={13} /> : g.state === 'info' ? <Info size={13} /> : <CircleAlert size={13} />}{g.label}</li>)}</ul>
        {still?.source === 'sample' && <p className="sample-disclaimer">Example from Base’s photo guide — not your home.</p>}
        <div className="confirm-actions">
          {!d.accepted ? <><button className="button" onClick={() => { setCursor(spot ? { x: spot.x, y: spot.y } : { x: 0.5, y: 0.5 }); setPhase('tap'); }}><MapPin size={16} /> Not my meter</button><button className="button primary" onClick={retake}><RotateCcw size={16} /> Retake</button></>
            : improve ? <><button className="button" onClick={() => use()}><Check size={16} /> Use it</button><button className="button primary" onClick={retake}><RotateCcw size={17} /> Retake</button></>
            : <><button className="button" onClick={retake}><RotateCcw size={16} /> Retake</button><button className="button primary" onClick={() => use()}><Check size={17} /> Use this photo</button></>}
        </div>
        {!d.accepted && spaceLimitedOnly(d) && <button className="text-button cant-step" onClick={cantStepBack}>I can’t step back any further</button>}
        {!d.accepted && rejections >= WALL_CRITERIA.rejectionsBeforeOverride && !spaceLimitedOnly(d) && <button className="text-button override-link" onClick={() => use(true)}><Send size={14} /> Still stuck? Send it for Base’s team to review.</button>}
        <details className="all-checks"><summary>Details</summary>
          <p className="purpose">{mode === 'wall' ? 'We look for your meter, the wall around it, the ground, and open wall where a 3 ft wide battery could stand.' : `We look along the wall to the ${mode} for 3 ft of open wall with nothing on it, and the ground in front of it.`}</p>
          <ul className="goal-list">{goals.filter(g => g.detail).map(g => <li key={g.label} className={g.state}><span><b>{g.label}</b><small>{g.detail}</small></span></li>)}</ul>
          {!d.accepted && d.reasons[0] && <p className="purpose">{d.reasons[0]}</p>}
          {improve && <p className="purpose">{seePast} If you can’t, use this photo and we’ll check the {other} side next.</p>}
          <ul className="result-checks">{d.checks.filter(c => c.state !== 'skipped').map(c => <li key={c.id} className={c.state}>{c.state === 'pass' ? <Check size={15} /> : <CircleAlert size={15} />}<span><b>{c.label}</b></span></li>)}</ul>
        </details>
      </div>;
    })()}

    {debug && <pre className="meter-debug">{JSON.stringify({ phase, models, ...debugInfo }, null, 1)}</pre>}
    <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} aria-label="Choose a photo from your device"
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (f.size > 25 * 1024 * 1024) { setError('Choose an image smaller than 25 MB.'); return; } void check({ url: URL.createObjectURL(f), source: 'upload' }); }} />
  </>;
}

function Chip({ c }: { c: WallCheck }) {
  return <li className={c.state === 'skipped' ? 'pending' : c.state}>{c.state === 'pass' ? <Check size={13} /> : c.state === 'fail' ? <CircleAlert size={13} /> : <span className="dot" />}{c.label}</li>;
}
