import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Check, CircleAlert, CircleCheck, ImagePlus, Loader2, MapPin, RotateCcw, Send, Upload } from 'lucide-react';
import { classifyImages, mockScene, onModelStatus, prewarmAnalyzer, type ModelState } from '../lib/meter/analyzer';
import { grab, gray } from '../lib/meter/frames';
import type { Gray } from '../lib/meter/image';
import { FAST_SIZE, fastMetrics } from '../lib/meter/metrics';
import { guideWall, type MeterSpot, type WallCheck, type WallDecision, type WallGuidance, type WallLive } from '../lib/wall/assess';
import { WALL_CRITERIA, WALL_MESSAGES, type SceneClass } from '../lib/wall/criteria';
import { analyzeWallPhoto, decide, spotFromTap, type WallAnalysis } from '../lib/wall/locate';
import type { useCamera } from '../lib/useCamera';
import type { Photo } from '../lib/photos';

type Props = { camera: ReturnType<typeof useCamera>; sample: string; onAccept: (p: Photo) => void };
type Still = { url: string; source: Photo['source'] };
type Phase = 'live' | 'checking' | 'confirm' | 'tap' | 'result';
const debug = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Where an object-fit: contain image is drawn inside its box. */
function containRect(box: { w: number; h: number }, img: { w: number; h: number }) {
  const s = Math.min(box.w / img.w, box.h / img.h), w = img.w * s, h = img.h * s;
  return { x: (box.w - w) / 2, y: (box.h - h) / 2, w, h };
}

export function WallCapture({ camera, sample, onAccept }: Props) {
  const [phase, setPhase] = useState<Phase>('live');
  const [still, setStill] = useState<Still | null>(null);
  const [analysis, setAnalysis] = useState<WallAnalysis | null>(null);
  const [spot, setSpot] = useState<MeterSpot | null>(null);
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 });
  const [decision, setDecision] = useState<WallDecision | null>(null);
  const [rejections, setRejections] = useState(0);
  const [guidance, setGuidance] = useState<WallGuidance | null>(null);
  const [error, setError] = useState('');
  const [videoReady, setVideoReady] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [models, setModels] = useState<{ subject: ModelState; error: string }>({ subject: 'loading', error: '' });
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown>>({});
  const frame = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), file = useRef<HTMLInputElement>(null);
  const live = useRef<Omit<WallLive, 'now'> & { prev: Gray | null }>({ fast: null, goodFrames: 0, landscape: true, scene: null, prev: null });
  const run = useRef(0);
  const stillRef = useRef<Still | null>(null);
  const setOwnedStill = (s: Still | null) => { const old = stillRef.current; if (old && old !== s && old.url.startsWith('blob:')) URL.revokeObjectURL(old.url); stillRef.current = s; setStill(s); };

  useEffect(() => {
    void prewarmAnalyzer().catch(() => undefined);
    const off = onModelStatus(s => setModels({ subject: s.subject, error: s.error }));
    return () => { off(); run.current++; const s = stillRef.current; if (s?.url.startsWith('blob:')) URL.revokeObjectURL(s.url); };
  }, []);
  useLayoutEffect(() => {
    const el = frame.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el); return () => ro.disconnect();
  }, [phase]);
  useEffect(() => {
    setVideoReady(false);
    if (video.current && phase === 'live') { video.current.srcObject = camera.stream; if (camera.stream) void video.current.play().catch(() => undefined); }
  }, [camera.stream, phase]);

  const finish = useCallback((a: WallAnalysis, meter: MeterSpot | null) => {
    const d = decide(a, meter);
    setSpot(meter); setDecision(d); setPhase('result');
    if (!d.accepted) setRejections(n => n + 1);
    if (debug) setDebugInfo(i => ({ ...i, meter, estimate: d.estimate }));
  }, []);

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
    const tick = setInterval(() => {
      const v = video.current; if (!v || !v.videoWidth) return;
      const small = gray(grab(v, { x: 0, y: 0, w: v.videoWidth, h: v.videoHeight }, FAST_SIZE));
      const m = fastMetrics(small, live.current.prev);
      live.current.prev = small; live.current.fast = m; live.current.landscape = v.videoWidth >= v.videoHeight;
      live.current.goodFrames = m.luma >= WALL_CRITERIA.minLuma && m.sharpness >= WALL_CRITERIA.minLiveSharpness && m.motion <= WALL_CRITERIA.maxMotion ? live.current.goodFrames + 1 : 0;
      const g = guideWall({ ...live.current, now: performance.now() });
      setGuidance(prev => (prev && prev.message === g.message && prev.tone === g.tone && JSON.stringify(prev.checks) === JSON.stringify(g.checks) ? prev : g));
      if (debug) setDebugInfo(d => ({ ...d, luma: m.luma.toFixed(0), sharp: m.sharpness.toFixed(0), motion: m.motion.toFixed(1) }));
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
  }, [phase, camera.stream, videoReady]);

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
  function retake() { run.current++; setAnalysis(null); setDecision(null); setSpot(null); setOwnedStill(null); setGuidance(null); setPhase('live'); }
  function use(override = false) {
    if (!still || !decision) return;
    const s = still; stillRef.current = null; setStill(null);
    const est = decision.estimate;
    onAccept({ url: s.url, source: s.source, status: 'confirmed', warnings: [], check: { accepted: decision.accepted, meterNumber: null, reasons: decision.reasons, override, ...(est ? { details: `About ${Math.round(est.leftFt)} ft of wall visible left of the meter and ${Math.round(est.rightFt)} ft right (estimate)` } : {}) } });
  }

  const tone = guidance?.tone ?? 'search';
  const photoRect = analysis && size.w ? containRect(size, { w: analysis.img.naturalWidth, h: analysis.img.naturalHeight }) : null;
  const ring = (s: { x: number; y: number; r: number | null } | null, cls: string) => s && photoRect &&
    <span className={`meter-pin ${cls}`} style={{ left: photoRect.x + s.x * photoRect.w, top: photoRect.y + s.y * photoRect.h, width: Math.max(36, (s.r ?? 0.03) * 2.6 * photoRect.h), height: Math.max(36, (s.r ?? 0.03) * 2.6 * photoRect.h) }} aria-hidden="true" />;
  const d = decision, est = d?.estimate;

  return <>
    <div ref={frame} className={`camera-frame wall-frame ${phase !== 'live' ? 'has-photo' : ''} ${phase === 'tap' ? 'tapping' : ''} ${tone === 'ready' && phase === 'live' ? 'ready' : ''}`}
      onPointerUp={onTap} onKeyDown={onKey} tabIndex={phase === 'tap' ? 0 : -1} role={phase === 'tap' ? 'application' : undefined}
      aria-label={phase === 'tap' ? 'Photo: tap your meter, or use the arrow keys to move the marker and press Enter' : undefined}>
      {phase !== 'live' && still ? <>
        <img src={still.url} alt={still.source === 'sample' ? 'Meter wall — Base guide sample' : 'Your meter wall photo'} draggable={false} />
        {phase === 'confirm' && ring(spot, 'proposed')}
        {phase === 'tap' && ring({ ...cursor, r: null }, 'cursor')}
        {phase === 'result' && ring(spot, d?.accepted ? 'good' : 'placed')}
      </> : camera.stream ? <>
        <video ref={video} autoPlay playsInline muted onLoadedData={() => setVideoReady(true)} aria-label="Live camera preview" />
        <div className="wall-guide" aria-hidden="true"><i /><i /><i /><i /><span>Keep the ground in view</span></div>
        <div className={`guide-message ${tone}`} role="status" aria-live="polite">{tone === 'ready' ? <CircleCheck size={17} /> : null}{guidance?.message ?? WALL_MESSAGES.loading}</div>
        <button className="shutter" aria-label="Take photo" disabled={!videoReady} onClick={capture}><span /></button>
      </> : <div className="camera-empty"><h3>{camera.status === 'requesting' ? 'Allow your camera to get started' : 'Turn on your camera'}</h3><p>{camera.status === 'unavailable' ? 'Your camera isn’t available. You can upload a photo instead.' : 'We’ll guide you to a photo Base can use.'}</p><button className="button" onClick={() => void camera.start()} disabled={camera.status === 'requesting'}>Use camera</button></div>}
      {phase === 'checking' && <div className="checking-overlay"><Loader2 size={22} className="spin" /> Looking for your meter…</div>}
    </div>

    {phase === 'live' && <>
      <ul className="live-checks" aria-label="Photo requirements">{(guidance?.checks ?? []).map(c => <Chip key={c.id} c={c} />)}</ul>
      <p className="model-status">{models.subject === 'failed' ? <>Photo recognition didn’t load{debug ? `: ${models.error}` : ''}. You can still take the photo; we’ll ask you to point out the meter.</> : models.subject !== 'ready' ? <><Loader2 size={12} className="spin" /> Loading on-device photo recognition… (first time only)</> : <>Take the photo when the whole wall, the meter and the ground are in view. Checked on this device.</>}</p>
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

    {phase === 'result' && d && <div className={`meter-result ${d.accepted ? 'accepted' : 'rejected'}`}>
      <div className="meter-result-head">{d.accepted ? <CircleCheck size={26} /> : <CircleAlert size={26} />}<div>
        <h3>{d.accepted ? 'Photo accepted' : 'Photo not accepted'}</h3>
        <p>{d.accepted ? (est ? <>About <strong>{Math.round(est.leftFt)} ft</strong> of wall shows left of the meter and <strong>{Math.round(est.rightFt)} ft</strong> to the right (rough estimate).</> : 'The meter, the wall around it and the ground are in view.') : d.reasons[0]}</p>
      </div></div>
      <ul className="result-checks">{d.checks.filter(c => c.state !== 'skipped').map(c => <li key={c.id} className={c.state}>{c.state === 'pass' ? <Check size={15} /> : <CircleAlert size={15} />}<span><b>{c.label}</b>{c.state === 'fail' && c.message && c.message !== d.reasons[0] && <small>{c.message}</small>}</span></li>)}</ul>
      {still?.source === 'sample' && <p className="sample-disclaimer">Example from Base’s photo guide. This isn’t a photo of your home.</p>}
      <div className="confirm-actions">
        {d.accepted ? <><button className="button" onClick={retake}><RotateCcw size={16} /> Retake</button><button className="button primary" onClick={() => use()}><Check size={17} /> Use this photo</button></>
          : <><button className="button" onClick={() => { setCursor(spot ? { x: spot.x, y: spot.y } : { x: 0.5, y: 0.5 }); setPhase('tap'); }}><MapPin size={16} /> Point to the meter again</button><button className="button primary" onClick={retake}><RotateCcw size={16} /> Retake photo</button></>}
      </div>
      {!d.accepted && rejections >= WALL_CRITERIA.rejectionsBeforeOverride && <button className="text-button override-link" onClick={() => use(true)}><Send size={14} /> Still stuck? Send this photo anyway and Base’s team will review it.</button>}
    </div>}

    {debug && <pre className="meter-debug">{JSON.stringify({ phase, models, ...debugInfo }, null, 1)}</pre>}
    <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} aria-label="Choose a photo from your device"
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (f.size > 25 * 1024 * 1024) { setError('Choose an image smaller than 25 MB.'); return; } void check({ url: URL.createObjectURL(f), source: 'upload' }); }} />
  </>;
}

function Chip({ c }: { c: WallCheck }) {
  return <li className={c.state === 'skipped' ? 'pending' : c.state}>{c.state === 'pass' ? <Check size={13} /> : c.state === 'fail' ? <CircleAlert size={13} /> : <span className="dot" />}{c.label}</li>;
}
