import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CircleAlert, CircleCheck, ImagePlus, Info, Loader2, RotateCcw, Send, Upload } from 'lucide-react';
import { classifySets, mockScene, mockSubject, onModelStatus, prewarmAnalyzer, prewarmDetector, type ModelState } from '../lib/meter/analyzer';
import { grab, gray } from '../lib/meter/frames';
import type { Gray } from '../lib/meter/image';
import { createFocusTracker, createSteadyWindow, FAST_SIZE, fastMetrics } from '../lib/meter/metrics';
import { WALL_CRITERIA as Q } from '../lib/wall/criteria';
import { analyzeStep } from '../lib/panel/analyze';
import { guideStep, whatWeSee, type Look, type Tone } from '../lib/panel/live';
import type { CheckedStep, StepResult } from '../lib/panel/steps';
import type { Photo } from '../lib/photos';
import type { useCamera } from '../lib/useCamera';

/**
 * Guided capture for the breaker box, main breaker rating, adjacent wall and behind-the-fence photos:
 * one short live instruction, an on-device check, and the same brief result card as the wall step.
 * Live, the recognizer looks at the camera view about once a second, so "Looks good" means it has seen the right thing;
 * the breaker box is taken automatically once the whole box is in view and the phone is steady.
 */
/** `extra`: a question shown on the result card (e.g. where the breaker box is); `canUse` = it's answered. */
type Props = { camera: ReturnType<typeof useCamera>; step: CheckedStep; sample: string; extra?: ReactNode; canUse?: boolean; onAccept: (p: Photo) => void };
type Still = { url: string; source: Photo['source'] };
const LOOKING_FOR: Record<CheckedStep, string[]> = {
  breaker: ['The whole breaker box', 'Where it is'],
  rating: ['The number on the main switch', 'Close and in focus'],
  adjacent: ['The wall around the corner', 'The ground in front', 'Anything on the wall'],
  fence: ['The area behind the fence', 'The ground'],
};
const REJECTIONS_BEFORE_OVERRIDE = 2;

const debug = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function CheckedCapture({ camera, step, sample, extra, canUse = true, onAccept }: Props) {
  const [nudge, setNudge] = useState(false);
  const [phase, setPhase] = useState<'live' | 'checking' | 'result'>('live');
  const [still, setStill] = useState<Still | null>(null);
  const [result, setResult] = useState<StepResult | null>(null);
  const [rejections, setRejections] = useState(0);
  const [live, setLive] = useState<{ tone: Tone; text: string }>({ tone: 'search', text: 'Getting ready…' });
  const [recognition, setRecognition] = useState<ModelState>('loading');
  const [seenDebug, setSeenDebug] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [videoReady, setVideoReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null), file = useRef<HTMLInputElement>(null), resultRef = useRef<HTMLDivElement>(null);
  const run = useRef(0), stillRef = useRef<Still | null>(null);
  const own = (s: Still | null) => { const old = stillRef.current; if (old && old !== s && old.url.startsWith('blob:')) URL.revokeObjectURL(old.url); stillRef.current = s; setStill(s); };

  useEffect(() => {
    void prewarmAnalyzer().catch(() => undefined);
    if (step === 'adjacent' || step === 'fence') void prewarmDetector();
    return () => { run.current++; const s = stillRef.current; if (s?.url.startsWith('blob:')) URL.revokeObjectURL(s.url); };
  }, [step]);
  useEffect(() => {
    setVideoReady(false);
    if (video.current && phase === 'live') { video.current.srcObject = camera.stream; if (camera.stream) void video.current.play().catch(() => undefined); }
  }, [camera.stream, phase]);
  useEffect(() => onModelStatus(s => setRecognition(s.subject)), []);
  useEffect(() => { if (phase === 'result') resultRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [phase, result]);

  const check = useCallback(async (s: Still) => {
    const id = ++run.current;
    own(s); setResult(null); setPhase('checking'); setError('');
    try {
      const r = await analyzeStep(step, s.url);
      if (id !== run.current) return;
      setResult(r); setPhase('result');
      if (!r.accepted) setRejections(n => n + 1);
    } catch (e) {
      if (id !== run.current) return;
      console.error(e); setError('We couldn’t check this photo. Try another one.'); setPhase('live');
    }
  }, [step]);

  const capture = useCallback(() => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob(b => { if (b) void check({ url: URL.createObjectURL(b), source: 'camera' }); }, 'image/jpeg', 0.92);
  }, [check]);

  // Live: brightness, steadiness and focus ~8×/s; what the camera is pointed at about once a second (not for the rating,
  // which is read from the photo). One short instruction; the breaker box is captured automatically when it's right.
  useEffect(() => {
    if (phase !== 'live' || !camera.stream || !videoReady) return;
    const id = run.current; let alive = true, prev: Gray | null = null, good = 0, look: Look | null = null, streak = 0, shot = false;
    const focus = createFocusTracker(), steady = createSteadyWindow(Q.readyWindow);
    const tick = setInterval(() => {
      const v = video.current; if (!v || !v.videoWidth || shot) return;
      const small = gray(grab(v, { x: 0, y: 0, w: v.videoWidth, h: v.videoHeight }, FAST_SIZE));
      const m = fastMetrics(small, prev); prev = small;
      m.relSharpness = focus(performance.now(), m.sharpness);
      good = steady(m.luma >= Q.minLuma && m.motion <= Q.maxMotion && m.relSharpness >= Q.minRelativeSharpness && m.sharpness >= Q.minLiveSharpness);
      const g = guideStep({ step, fast: m, goodFrames: good, look, streak, recognition, now: performance.now() });
      setLive(p => (p.text === g.text && p.tone === g.tone ? p : { tone: g.tone, text: g.text }));
      if (g.capture) { shot = true; setTimeout(() => { if (alive && id === run.current) capture(); }, 400); } // let "Looks good" show first
    }, 125);
    if (step !== 'rating') (async () => {
      while (alive && id === run.current) {
        const v = video.current;
        if (!v || !v.videoWidth) { await sleep(250); continue; }
        let next: Look | null = null;
        if (step === 'breaker') {
          const mock = mockSubject();
          const r = mock ? null : await classifySets(grab(v, { x: 0, y: 0, w: v.videoWidth, h: v.videoHeight }, 336), ['subject', 'framing']);
          if (mock || r) next = { at: performance.now(), subject: mock ?? (r?.subject as Look['subject']), framing: (r?.framing as Look['framing']) ?? null };
        } else {
          const mock = mockScene();
          const r = mock ? null : await classifySets(grab(v, { x: 0, y: 0, w: v.videoWidth, h: v.videoHeight }, 336), ['scene']);
          if (mock || r) next = { at: performance.now(), scene: mock ?? (r?.scene as Look['scene']) ?? null };
        }
        if (!alive) return;
        if (next) {
          look = next; streak = whatWeSee(step, next) === 'target' ? streak + 1 : 0;
          if (debug) setSeenDebug({ seen: whatWeSee(step, next), streak, ...Object.fromEntries(Object.entries(next).filter(([k]) => k !== 'at').map(([k, v]) => [k, v && typeof v === 'object' && 'probs' in v ? Object.fromEntries(Object.entries(v.probs as Record<string, number>).map(([c, p]) => [c, p.toFixed(2)])) : v])) });
        }
        await sleep(next ? 600 : 1500);
      }
    })();
    return () => { alive = false; clearInterval(tick); };
  }, [phase, camera.stream, videoReady, step, recognition, capture]);

  function retake() { run.current++; setResult(null); own(null); setNudge(false); setPhase('live'); }
  function use(override = false) {
    if (!still || !result) return;
    if (!canUse) { setNudge(true); return; } // point at the unanswered question instead of doing nothing
    const s = still; stillRef.current = null; setStill(null);
    onAccept({ url: s.url, source: s.source, status: 'confirmed', warnings: [], check: { accepted: result.accepted, meterNumber: null, reasons: result.accepted ? [] : [result.line], override, ...(result.note ? { details: result.note } : {}), ...(result.amps ? { amps: result.amps } : {}) } });
  }

  const r = result;
  return <>
    <div className={`camera-frame checked-frame ${step === 'rating' ? 'rating-frame' : ''} ${phase !== 'live' ? 'has-photo' : ''} ${live.tone === 'ready' && phase === 'live' ? 'ready' : ''}`}>
      {phase !== 'live' && still ? <img src={still.url} alt={still.source === 'sample' ? 'Base guide sample' : 'Your photo'} />
        : camera.stream ? <>
          <video ref={video} autoPlay playsInline muted onLoadedData={() => setVideoReady(true)} aria-label="Live camera preview" />
          {step === 'rating' && <div className="rating-box" aria-hidden="true"><span>Number here</span></div>}
          <div className={`guide-message ${live.tone}`} role="status" aria-live="polite">{live.tone === 'ready' ? <CircleCheck size={17} /> : null}{live.text}</div>
          <button className="shutter" aria-label="Take photo" disabled={!videoReady} onClick={capture}><span /></button>
        </> : <div className="camera-empty"><h3>{camera.status === 'requesting' ? 'Allow your camera to get started' : 'Turn on your camera'}</h3><p>{camera.status === 'unavailable' ? 'Your camera isn’t available. You can upload a photo instead.' : 'We’ll check the photo on this device.'}</p><button className="button" onClick={() => void camera.start()} disabled={camera.status === 'requesting'}>Use camera</button></div>}
      {phase === 'checking' && <div className="checking-overlay"><Loader2 size={22} className="spin" /> Checking your photo…</div>}
    </div>

    {phase === 'live' && <>
      <div className="photo-goals"><span>Looking for</span><ul>{LOOKING_FOR[step].map(t => <li key={t}>{t}</li>)}</ul></div>
      {error && <p className="inline-error">{error}</p>}
      <div className="capture-fallbacks">
        <button className="button" onClick={() => file.current?.click()}><Upload size={17} /> Upload photo</button>
        <button className="button" onClick={() => void check({ url: sample, source: 'sample' })}><ImagePlus size={17} /> Try sample photo</button>
      </div>
    </>}

    {phase === 'result' && r && <div ref={resultRef} className={`meter-result compact ${!r.accepted ? 'rejected' : r.improve ? 'improve' : 'accepted'}`}>
      <div className="result-line">{r.accepted && !r.improve ? <CircleCheck size={22} /> : <CircleAlert size={22} />}<h3>{!r.accepted ? 'Retake needed' : r.improve ? 'Accepted — one more try could be better' : 'Photo accepted'}</h3></div>
      <p className="fix-line">{r.improve ?? r.line}</p>
      <ul className="goal-chips" aria-label="What we found">{r.chips.map(c => <li key={c.label} className={c.state}>{c.state === 'pass' ? <Check size={13} /> : c.state === 'info' ? <Info size={13} /> : <CircleAlert size={13} />}{c.label}</li>)}</ul>
      {still?.source === 'sample' && <p className="sample-disclaimer">Example from Base’s photo guide — not your home.</p>}
      {extra && <div className={`result-extra ${nudge && !canUse ? 'attention' : ''}`}>{extra}</div>}
      <div className="confirm-actions">
        {!r.accepted ? <button className="button primary" onClick={retake}><RotateCcw size={16} /> Retake</button>
          : r.improve ? <><button className="button" onClick={() => use()}><Check size={16} /> Use it</button><button className="button primary" onClick={retake}><RotateCcw size={16} /> Retake</button></>
          : <><button className="button" onClick={retake}><RotateCcw size={16} /> Retake</button><button className="button primary" onClick={() => use()}><Check size={17} /> Use this photo</button></>}
      </div>
      {!r.accepted && rejections >= REJECTIONS_BEFORE_OVERRIDE && <button className="text-button override-link" onClick={() => use(true)}><Send size={14} /> Still stuck? Send it for Base’s team to review.</button>}
      <details className="all-checks"><summary>Details</summary><p className="purpose">{r.details}</p>{r.improve && <p className="purpose">{r.line}</p>}</details>
    </div>}

    {debug && <pre className="meter-debug">{JSON.stringify({ recognition, live: seenDebug }, null, 1)}</pre>}
    <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} aria-label="Choose a photo from your device"
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (f.size > 25 * 1024 * 1024) { setError('Choose an image smaller than 25 MB.'); return; } void check({ url: URL.createObjectURL(f), source: 'upload' }); }} />
  </>;
}
