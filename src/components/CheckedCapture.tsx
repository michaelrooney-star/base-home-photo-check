import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, CircleCheck, ImagePlus, Info, Loader2, RotateCcw, Send, Upload } from 'lucide-react';
import { prewarmAnalyzer, prewarmDetector } from '../lib/meter/analyzer';
import { grab, gray } from '../lib/meter/frames';
import type { Gray } from '../lib/meter/image';
import { createFocusTracker, FAST_SIZE, fastMetrics, type FastMetrics } from '../lib/meter/metrics';
import { analyzeStep } from '../lib/panel/analyze';
import type { CheckedStep, StepResult } from '../lib/panel/steps';
import type { Photo } from '../lib/photos';
import type { useCamera } from '../lib/useCamera';

/**
 * Guided capture for the breaker box, main breaker rating, adjacent wall and behind-the-fence photos:
 * one short live instruction, a manual shutter, an on-device check, and the same brief result card as the wall step.
 */
type Props = { camera: ReturnType<typeof useCamera>; step: CheckedStep; sample: string; canUse?: boolean; cantUseReason?: string; onAccept: (p: Photo) => void };
type Still = { url: string; source: Photo['source'] };
const LOOKING_FOR: Record<CheckedStep, string[]> = {
  breaker: ['The whole breaker box', 'Where it is'],
  rating: ['The number on the main switch', 'Close and in focus'],
  adjacent: ['The wall around the corner', 'The ground in front', 'Anything on the wall'],
  fence: ['The area behind the fence', 'The ground'],
};
const READY: Record<CheckedStep, string> = {
  breaker: 'Looks good — take the photo.',
  rating: 'Fill the box with the number, then take the photo.',
  adjacent: 'Looks good — take the photo.',
  fence: 'Looks good — take the photo.',
};
const REJECTIONS_BEFORE_OVERRIDE = 2;

function liveMessage(m: FastMetrics | null, good: number, step: CheckedStep): { tone: 'search' | 'adjust' | 'hold' | 'ready'; text: string } {
  if (!m) return { tone: 'search', text: 'Getting ready…' };
  if (m.luma < 45) return { tone: 'adjust', text: step === 'breaker' || step === 'rating' ? 'Too dark — turn on a light.' : 'Too dark — try in daylight.' };
  if (m.motion > 6) return { tone: 'adjust', text: 'Hold steady.' };
  if (m.relSharpness < 0.6 || m.sharpness < 150) return { tone: 'adjust', text: step === 'rating' ? 'Hold steady — let it focus.' : 'Hold steady a moment.' };
  return good >= 6 ? { tone: 'ready', text: READY[step] } : { tone: 'hold', text: 'Hold steady.' };
}

export function CheckedCapture({ camera, step, sample, canUse = true, cantUseReason, onAccept }: Props) {
  const [phase, setPhase] = useState<'live' | 'checking' | 'result'>('live');
  const [still, setStill] = useState<Still | null>(null);
  const [result, setResult] = useState<StepResult | null>(null);
  const [rejections, setRejections] = useState(0);
  const [live, setLive] = useState<{ tone: 'search' | 'adjust' | 'hold' | 'ready'; text: string }>({ tone: 'search', text: 'Getting ready…' });
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
  useEffect(() => { if (phase === 'result') resultRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [phase, result]);

  // Live: brightness, steadiness and focus ~8×/s; one short instruction.
  useEffect(() => {
    if (phase !== 'live' || !camera.stream || !videoReady) return;
    let prev: Gray | null = null, good = 0;
    const focus = createFocusTracker();
    const tick = setInterval(() => {
      const v = video.current; if (!v || !v.videoWidth) return;
      const small = gray(grab(v, { x: 0, y: 0, w: v.videoWidth, h: v.videoHeight }, FAST_SIZE));
      const m = fastMetrics(small, prev); prev = small;
      m.relSharpness = focus(performance.now(), m.sharpness);
      good = m.luma >= 45 && m.motion <= 6 && m.relSharpness >= 0.6 && m.sharpness >= 150 ? good + 1 : 0;
      const next = liveMessage(m, good, step);
      setLive(p => (p.text === next.text && p.tone === next.tone ? p : next));
    }, 125);
    return () => clearInterval(tick);
  }, [phase, camera.stream, videoReady, step]);

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

  function retake() { run.current++; setResult(null); own(null); setPhase('live'); }
  function use(override = false) {
    if (!still || !result) return;
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

    {phase === 'result' && r && <div ref={resultRef} className={`meter-result compact ${r.accepted ? 'accepted' : 'rejected'}`}>
      <div className="result-line">{r.accepted ? <CircleCheck size={22} /> : <CircleAlert size={22} />}<h3>{r.accepted ? 'Photo accepted' : 'Retake needed'}</h3></div>
      <p className="fix-line">{r.line}</p>
      <ul className="goal-chips" aria-label="What we found">{r.chips.map(c => <li key={c.label} className={c.state}>{c.state === 'pass' ? <Check size={13} /> : c.state === 'info' ? <Info size={13} /> : <CircleAlert size={13} />}{c.label}</li>)}</ul>
      {still?.source === 'sample' && <p className="sample-disclaimer">Example from Base’s photo guide — not your home.</p>}
      {r.accepted && !canUse && cantUseReason && <p className="inline-message">{cantUseReason}</p>}
      <div className="confirm-actions">
        {r.accepted ? <><button className="button" onClick={retake}><RotateCcw size={16} /> Retake</button><button className="button primary" disabled={!canUse} onClick={() => use()}><Check size={17} /> Use this photo</button></>
          : <button className="button primary" onClick={retake}><RotateCcw size={16} /> Retake</button>}
      </div>
      {!r.accepted && rejections >= REJECTIONS_BEFORE_OVERRIDE && <button className="text-button override-link" disabled={!canUse} onClick={() => use(true)}><Send size={14} /> Still stuck? Send it for Base’s team to review.</button>}
      <details className="all-checks"><summary>Details</summary><p className="purpose">{r.details}</p></details>
    </div>}

    <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} aria-label="Choose a photo from your device"
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (f.size > 25 * 1024 * 1024) { setError('Choose an image smaller than 25 MB.'); return; } void check({ url: URL.createObjectURL(f), source: 'upload' }); }} />
  </>;
}
