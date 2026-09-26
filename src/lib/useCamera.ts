import { useCallback, useEffect, useRef, useState } from 'react';
export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null);
  const requestId = useRef(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<'idle' | 'requesting' | 'live' | 'unavailable'>('idle');
  const stop = useCallback(() => {
    requestId.current++;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null; setStream(null); setStatus('idle');
  }, []);
  const start = useCallback(async () => {
    stop(); const id = requestId.current; setStatus('requesting');
    if (!navigator.mediaDevices?.getUserMedia) { setStatus('unavailable'); return; }
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      if (requestId.current !== id) { next.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = next; setStream(next); setStatus('live');
    } catch { if (requestId.current === id) setStatus('unavailable'); }
  }, [stop]);
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') stop(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', stop);
    return () => { requestId.current++; streamRef.current?.getTracks().forEach(t=>t.stop()); document.removeEventListener('visibilitychange',hide); window.removeEventListener('pagehide',stop); };
  }, [stop]);
  return { stream, status, start, stop };
}
