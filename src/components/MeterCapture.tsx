import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, CircleAlert, CircleCheck, ImagePlus, Loader2, RotateCcw, Send, Upload } from 'lucide-react';
import type { Check as CheckItem } from '../lib/meter/acceptance';
import { CRITERIA, MESSAGES } from '../lib/meter/criteria';
import { onModelStatus, prewarmAnalyzer, type ModelState } from '../lib/meter/analyzer';
import { analyzeStill, coverRegion, grab, gray, readRegion, type Region, type StillAnalysis } from '../lib/meter/frames';
import { frameIsGood, guide, type Guidance, type LiveInput } from '../lib/meter/guidance';
import { createFocusTracker, createSteadyWindow, FAST_SIZE, fastMetrics } from '../lib/meter/metrics';
import type { Gray } from '../lib/meter/image';
import type { useCamera } from '../lib/useCamera';
import type { Photo } from '../lib/photos';

type Props = { camera: ReturnType<typeof useCamera>; onAccept: (p: Photo) => void };
type Still = { url: string; source: Photo['source'] };
const debug = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function MeterCapture({ camera, onAccept }: Props) {
  const [phase, setPhase] = useState<'live' | 'checking' | 'result'>('live');
  const [still, setStill] = useState<Still | null>(null);
  const [analysis, setAnalysis] = useState<StillAnalysis | null>(null);
  const [rejections, setRejections] = useState(0);
  const [tapHint, setTapHint] = useState(false);
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [error, setError] = useState('');
  const [videoReady, setVideoReady] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [models, setModels] = useState<{ ocr: ModelState; subject: ModelState; error: string }>({ ocr: 'loading', subject: 'loading', error: '' });
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown>>({});
  const frame = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), file = useRef<HTMLInputElement>(null);
  const live = useRef<Omit<LiveInput, 'now'> & { prev: Gray | null; lastNumber: string | null }>({ fast: null, goodFrames: 0, subject: null, reading: null, prev: null, lastNumber: null });
  const stableNumber = useRef<string | null>(null);
  const shown = useRef({ message: '', since: 0, candidate: '' });
  const capturing = useRef(false);
  const run = useRef(0); // invalidates async work when the photo is retaken or the step changes

  // Warm up the on-device models as soon as the step opens.
  useEffect(() => {
    void prewarmAnalyzer().catch(() => undefined);
    const off = onModelStatus(setModels);
    return () => { off(); run.current++; };
  }, []);
  // The component owns the current photo's blob URL until the customer uses it.
  const stillRef = useRef<Still | null>(null);
  const setOwnedStill = (s: Still | null) => { const old = stillRef.current; if (old && old !== s && old.url.startsWith('blob:')) URL.revokeObjectURL(old.url); stillRef.current = s; setStill(s); };
  useEffect(() => () => { const s = stillRef.current; if (s?.url.startsWith('blob:')) URL.revokeObjectURL(s.url); }, []);

  useLayoutEffect(() => {
    const el = frame.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el); return () => ro.disconnect();
  }, [phase]);
  useEffect(() => {
    setVideoReady(false);
    if (video.current && phase === 'live') { video.current.srcObject = camera.stream; if (camera.stream) void video.current.play().catch(() => undefined); }
  }, [camera.stream, phase]);

  const circle = { cx: size.w / 2, cy: size.h / 2, r: Math.min(size.w, size.h) * 0.42 };
  const regionNow = useCallback((): Region | null => {
    const v = video.current, el = frame.current;
    if (!v || !el || !v.videoWidth) return null;
    const w = el.clientWidth, h = el.clientHeight;
    return coverRegion({ w, h }, { w: v.videoWidth, h: v.videoHeight }, { cx: w / 2, cy: h / 2, r: Math.min(w, h) * 0.42 });
  }, []);

  const check = useCallback(async (s: Still, region?: Region) => {
    const id = ++run.current;
    setOwnedStill(s); setAnalysis(null); setPhase('checking'); setError('');
    try {
      const a = await analyzeStill(s.url, region, s.source === 'camera' ? stableNumber.current : null);
      if (id !== run.current) return;
      setAnalysis(a); setPhase('result'); if (debug) setDebugInfo(a.debug);
      if (!a.decision.accepted) setRejections(n => n + 1);
    } catch (e) {
      if (id !== run.current) return;
      setError('We couldn’t check this photo. Try another one.'); setPhase('live'); console.error(e);
    } finally { capturing.current = false; }
  }, []);

  const capture = useCallback(() => {
    const v = video.current, region = regionNow();
    if (!v || !region || capturing.current) return;
    capturing.current = true;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob(b => { if (b) void check({ url: URL.createObjectURL(b), source: 'camera' }, region); else capturing.current = false; }, 'image/jpeg', 0.92);
  }, [check, regionNow]);

  // Live guidance: cheap metrics ~8x/s, OCR + subject classifier as fast as they finish.
  useEffect(() => {
    if (phase !== 'live' || !camera.stream || !videoReady) return;
    const id = run.current; let alive = true;
    live.current = { fast: null, goodFrames: 0, subject: null, reading: null, prev: null, lastNumber: null };
    stableNumber.current = null;
    let iteration = 0;
    const focus = createFocusTracker(), steady = createSteadyWindow(CRITERIA.readyWindow);
    setTapHint(false);
    const hintTimer = setTimeout(() => setTapHint(true), 5000);
    const tick = setInterval(() => {
      const v = video.current, region = regionNow(); if (!v || !region) return;
      const small = gray(grab(v, region, FAST_SIZE));
      const m = fastMetrics(small, live.current.prev);
      m.relSharpness = focus(performance.now(), m.sharpness);
      live.current.prev = small; live.current.fast = m;
      live.current.goodFrames = steady(frameIsGood(m));
      const g = guide({ ...live.current, now: performance.now() });
      // Debounce: a new instruction must hold for 600 ms before it replaces the current one (except "ready").
      const now = performance.now(), sh = shown.current;
      if (g.message !== sh.candidate) { sh.candidate = g.message; sh.since = now; }
      if (g.tone === 'ready' || !sh.message || (g.message !== sh.message && now - sh.since > 600)) sh.message = g.message;
      setGuidance(prev => {
        const next = { ...g, message: sh.message };
        return prev && prev.message === next.message && prev.tone === next.tone && JSON.stringify(prev.checks) === JSON.stringify(next.checks) ? prev : next;
      });
      if (debug) setDebugInfo(d => ({ ...d, luma: m.luma.toFixed(0), sharp: m.sharpness.toFixed(0), relSharp: m.relSharpness.toFixed(2), glare: m.glare.toFixed(3), motion: m.motion.toFixed(1), goodFrames: live.current.goodFrames }));
      if (g.capture) capture();
    }, 125);
    (async () => {
      while (alive && id === run.current) {
        const v = video.current, region = regionNow();
        if (!v || !region) { await sleep(200); continue; }
        try {
          // OCR every pass; the (slower) subject classifier every other pass.
          const withSubject = iteration++ % 2 === 0 || !live.current.subject;
          const r = await readRegion(v, region, { maxEdge: 736, subject: withSubject });
          if (!alive) return;
          const at = performance.now();
          if (r.subject) live.current.subject = { result: r.subject, at };
          // A number only counts as readable once two consecutive frames agree on every digit.
          const obs = r.reading, digits = obs.all_characters_certain ? obs.meter_number.replace(/\D/g, '') : null;
          const stable = !!digits && digits === live.current.lastNumber;
          live.current.lastNumber = digits;
          stableNumber.current = stable ? obs.meter_number : null;
          live.current.reading = { obs: { ...obs, all_characters_certain: stable }, at, regionHeightPx: region.h };
          const sub = live.current.subject?.result;
          if (debug) setDebugInfo(d => ({ ...d, subject: sub?.status === 'ok' ? Object.fromEntries(Object.entries(sub.probs).map(([k, p]) => [k, p.toFixed(2)])) : sub, number: obs.meter_number, certain: obs.all_characters_certain, stable, digitPx: Math.round(obs.number_height_ratio * region.h), issues: obs.issues.join(','), ocr: obs.debug }));
        } catch (e) { console.warn('[meter] live analysis failed', e); await sleep(500); }
        await sleep(150);
      }
    })();
    return () => { alive = false; clearInterval(tick); clearTimeout(hintTimer); };
  }, [phase, camera.stream, videoReady, regionNow, capture]);

  function retake() { run.current++; setAnalysis(null); setOwnedStill(null); setGuidance(null); shown.current = { message: '', since: 0, candidate: '' }; setPhase('live'); }
  function use(override = false) {
    if (!still || !analysis) return;
    const d = analysis.decision; const s = still; stillRef.current = null; setStill(null); // ownership of the blob URL moves to the saved photo
    const unchecked = d.checks.some(c => c.id === 'subject' && c.state === 'skipped');
    onAccept({ url: s.url, source: s.source, status: 'confirmed', warnings: [], check: { accepted: d.accepted, meterNumber: d.meterNumber, reasons: d.reasons, override, ...(unchecked ? { details: 'Meter recognition wasn’t available on this phone; the meter number was read on device.' } : {}) } });
  }

  const tone = guidance?.tone ?? 'search';
  const d = analysis?.decision;
  return <>
    <div ref={frame} className={`camera-frame meter-frame ${phase !== 'live' ? 'has-photo' : ''}`}>
      {phase !== 'live' && still ? <img src={still.url} alt={still.source === 'sample' ? 'Meter — Base guide sample' : 'Your meter photo'} />
        : camera.stream ? <>
          <video ref={video} autoPlay playsInline muted onLoadedData={() => setVideoReady(true)} aria-label="Live camera preview" />
          {size.w > 0 && <>
            <div className="guide-dim" aria-hidden="true" style={{ background: `radial-gradient(circle at ${circle.cx}px ${circle.cy}px, transparent ${circle.r}px, rgba(20,24,20,.5) ${circle.r + 1}px)` }} />
            <div className={`guide-hole ${tone}`} aria-hidden="true" style={{ left: circle.cx - circle.r, top: circle.cy - circle.r, width: circle.r * 2, height: circle.r * 2 }} />
          </>}
          <div className={`guide-message ${tone}`} role="status" aria-live="polite">{tone === 'ready' ? <CircleCheck size={17} /> : tone === 'hold' ? <Loader2 size={17} className="spin" /> : null}{guidance?.message ?? MESSAGES.loading}</div>
          {tapHint && tone !== 'ready' && <div className="tap-hint">{MESSAGES.tapHint}</div>}
          <button className="shutter" aria-label="Take photo now" disabled={!videoReady || phase !== 'live'} onClick={capture}><span /></button>
        </> : <div className="camera-empty"><h3>{camera.status === 'requesting' ? 'Allow your camera to get started' : 'Turn on your camera'}</h3><p>{camera.status === 'unavailable' ? 'Your camera isn’t available. You can upload a photo instead.' : 'We’ll guide you to a photo Base can use.'}</p><button className="button" onClick={() => void camera.start()} disabled={camera.status === 'requesting'}>Use camera</button></div>}
      {phase === 'checking' && <div className="checking-overlay"><Loader2 size={22} className="spin" /> {models.subject === 'loading' ? 'Loading meter recognition, then checking your photo…' : 'Checking your photo…'}</div>}
    </div>

    {phase === 'live' && <>
      <ul className="live-checks" aria-label="Photo requirements">{(guidance?.checks ?? []).map(c => <CheckChip key={c.id} c={c} />)}</ul>
      <p className="model-status">{models.ocr === 'failed' ? <>The number reader didn’t load{debug ? `: ${models.error}` : ''}. Try reloading the page.</> : models.subject === 'failed' ? <>Meter recognition didn’t load{debug ? `: ${models.error}` : ''}. Photos can’t be accepted until it does — check your connection and reload.</> : models.subject !== 'ready' || models.ocr !== 'ready' ? <><Loader2 size={12} className="spin" /> Loading on-device meter recognition… (first time only, about 170 MB)</> : <>Checked on this device. Your photo isn’t uploaded.</>}</p>
      {error && <p className="inline-error">{error}</p>}
      <div className="capture-fallbacks">
        <button className="button" onClick={() => file.current?.click()}><Upload size={17} /> Upload photo</button>
        <button className="button" onClick={() => void check({ url: '/images/meter.png', source: 'sample' })}><ImagePlus size={17} /> Try sample photo</button>
      </div>
    </>}

    {phase === 'result' && d && <div className={`meter-result ${d.accepted ? 'accepted' : 'rejected'}`}>
      <div className="meter-result-head">{d.accepted ? <CircleCheck size={26} /> : <CircleAlert size={26} />}<div>
        <h3>{d.accepted ? 'Photo accepted' : 'Photo not accepted'}</h3>
        <p>{d.accepted ? <>We can read meter number <strong>{d.meterNumber}</strong>.</> : d.reasons[0]}</p>
      </div></div>
      <ul className="result-checks">{d.checks.map(c => <li key={c.id} className={c.state}>{c.state === 'pass' ? <Check size={15} /> : <CircleAlert size={15} />}<span><b>{c.label}</b>{c.state !== 'pass' && c.message && c.message !== d.reasons[0] && <small>{c.message}</small>}</span></li>)}</ul>
      {still?.source === 'sample' && <p className="sample-disclaimer">Example from Base’s photo guide. This isn’t a photo of your home.</p>}
      <div className="confirm-actions">
        {d.accepted ? <><button className="button" onClick={retake}><RotateCcw size={16} /> Retake</button><button className="button primary" onClick={() => use()}><Check size={17} /> Use this photo</button></>
          : <button className="button primary" onClick={retake}><RotateCcw size={16} /> Retake photo</button>}
      </div>
      {!d.accepted && rejections >= CRITERIA.rejectionsBeforeOverride && <button className="text-button override-link" onClick={() => use(true)}><Send size={14} /> Still stuck? Send this photo anyway and Base’s team will review it.</button>}
    </div>}

    {debug && <pre className="meter-debug">{JSON.stringify({ phase, models, ...debugInfo }, null, 1)}</pre>}
    <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} aria-label="Choose a photo from your device"
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (f.size > 25 * 1024 * 1024) { setError('Choose an image smaller than 25 MB.'); return; } void check({ url: URL.createObjectURL(f), source: 'upload' }); }} />
  </>;
}

function CheckChip({ c }: { c: CheckItem }) {
  return <li className={c.state}>{c.state === 'pass' ? <Check size={13} /> : c.state === 'fail' ? <CircleAlert size={13} /> : <span className="dot" />}{c.label}</li>;
}
