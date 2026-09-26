import { useCallback, useEffect, useRef, useState } from 'react';
import { pickWideLens, type WideLens } from './lens';

const BACK: MediaTrackConstraints = { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } };

export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null);
  const requestId = useRef(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<'idle' | 'requesting' | 'live' | 'unavailable'>('idle');
  /** A wider (0.5×) back lens, if the browser exposes one; `wide` = currently using it. */
  const [lens, setLens] = useState<{ option: WideLens | null; wide: boolean }>({ option: null, wide: false });
  const stop = useCallback(() => {
    requestId.current++;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null; setStream(null); setStatus('idle');
  }, []);
  const open = useCallback(async (video: MediaTrackConstraints) => {
    stop(); const id = requestId.current; setStatus('requesting');
    if (!navigator.mediaDevices?.getUserMedia) { setStatus('unavailable'); return null; }
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      if (requestId.current !== id) { next.getTracks().forEach(t => t.stop()); return null; }
      streamRef.current = next; setStream(next); setStatus('live');
      return next;
    } catch { if (requestId.current === id) setStatus('unavailable'); return null; }
  }, [stop]);
  const start = useCallback(async () => {
    const next = await open(BACK);
    setLens({ option: null, wide: false });
    if (!next) return;
    try {
      const track = next.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { min?: number; max?: number } }) | undefined;
      const devices = await navigator.mediaDevices.enumerateDevices();
      setLens({ option: pickWideLens(devices, caps?.zoom, track.getSettings().deviceId), wide: false });
    } catch { /* no lens switching on this browser */ }
  }, [open]);
  const setWide = useCallback(async (wide: boolean) => {
    const option = lens.option; if (!option || wide === lens.wide) return;
    if (option.kind === 'zoom') {
      const track = streamRef.current?.getVideoTracks()[0]; if (!track) return;
      try { await track.applyConstraints({ advanced: [{ zoom: wide ? option.zoom : 1 } as MediaTrackConstraintSet] }); setLens({ option, wide }); } catch { /* keep current zoom */ }
      return;
    }
    const next = await open(wide ? { deviceId: { exact: option.deviceId }, width: { ideal: 1920 }, height: { ideal: 1440 } } : BACK);
    if (next) setLens({ option, wide });
    else if (wide) { await open(BACK); setLens({ option: null, wide: false }); } // that camera wouldn't open: stop offering it
  }, [lens, open]);
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') stop(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', stop);
    return () => { requestId.current++; streamRef.current?.getTracks().forEach(t=>t.stop()); document.removeEventListener('visibilitychange',hide); window.removeEventListener('pagehide',stop); };
  }, [stop]);
  return { stream, status, start, stop, canWiden: !!lens.option, wide: lens.wide, setWide };
}
