import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, ImagePlus, Lightbulb, RotateCcw, ShieldCheck, Upload, X } from 'lucide-react';
import { inspectPhoto, revokePhoto, STEPS, type Answer, type Photo, type PhotoId, type Photos } from '../lib/photos';
import { PhotoChecklist } from './PhotoChecklist';
import { MeterCapture } from './MeterCapture';
import { WallCapture } from './WallCapture';
import type { useCamera } from '../lib/useCamera';
type Props = { photos: Photos; current: PhotoId; fence: Answer; location: string; camera: ReturnType<typeof useCamera>; onFence:(v:Answer)=>void; onLocation:(v:string)=>void; onSave:(id:PhotoId,p:Photo)=>void; onNext:()=>void; onSelect:(id:PhotoId)=>void; onReview:()=>void; onBack:()=>void };
export function GuidedCapture(p: Props) {
  const step = STEPS.find(s=>s.id===p.current)!;
  const [draft,setDraft] = useState<Photo | null>(null);
  const draftRef = useRef<Photo | null>(null);
  const [error,setError] = useState(''); const [busy,setBusy] = useState(false); const [videoReady,setVideoReady]=useState(false);
  const video = useRef<HTMLVideoElement>(null); const file = useRef<HTMLInputElement>(null); const generation=useRef(0);
  const updateDraft = (next:Photo|null) => { revokePhoto(draftRef.current || undefined); draftRef.current=next; setDraft(next); };
  useEffect(()=>{generation.current++; updateDraft(null);setError('');setBusy(false);return()=>{generation.current++;revokePhoto(draftRef.current||undefined);draftRef.current=null;};},[p.current]);
  useEffect(()=>{setVideoReady(false);if(video.current){video.current.srcObject=p.camera.stream;if(p.camera.stream) void video.current.play().catch(()=>setVideoReady(false));}},[p.camera.stream,draft,p.current,p.fence]);
  async function prepare(url:string, source:Photo['source']) {
    const token=++generation.current; setBusy(true);setError('');
    try { const warnings=await inspectPhoto(url); if(token!==generation.current){if(url.startsWith('blob:'))URL.revokeObjectURL(url);return;} updateDraft({url,source,warnings,status:'confirmed'}); }
    catch {if(url.startsWith('blob:'))URL.revokeObjectURL(url);if(token===generation.current)setError('This image could not be read. Try a JPG, PNG, or WebP photo.');}
    finally{if(token===generation.current)setBusy(false);}
  }
  function capture(){
    const v=video.current;if(!v||!v.videoWidth)return;
    const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;canvas.getContext('2d')?.drawImage(v,0,0);
    const token=generation.current;
    canvas.toBlob(blob=>{if(blob && token===generation.current)void prepare(URL.createObjectURL(blob),'camera');},'image/jpeg',.92);
  }
  function accept(){ if(!draft)return;const accepted=draft;draftRef.current=null;setDraft(null);p.onSave(p.current,accepted);p.onNext(); }
  const fenceQuestion=p.current==='fence' && p.fence!=='yes';
  return <div className="capture-layout"><PhotoChecklist photos={p.photos} fence={p.fence} current={p.current} onSelect={p.onSelect}/><section className="capture-main"><div className="capture-topbar"><button className="text-button" onClick={p.onBack}><ArrowLeft size={16}/> Back</button><button className="text-button" onClick={p.onReview}>Review photos <ArrowRight size={16}/></button></div>
    {fenceQuestion ? <div className="fence-question"><span className="section-icon"><ImagePlus size={25}/></span><div className="eyebrow">A QUICK CHECK</div><h1>Is there a fence along your meter wall?</h1><p>If there is, we’ll need one photo of the area behind it.</p><div className="choice-row">{(['yes','no','unsure'] as const).map(v=><button className="button" key={v} onClick={()=>{p.onFence(v);if(v!=='yes')p.onNext();}}>{v==='yes'?'Yes, there is':v==='no'?'No fence':'Not sure'}</button>)}</div><p className="muted">Only enter an area you can safely access.</p></div> : <>
      <div className="eyebrow">PHOTO {String(STEPS.filter(s=>s.id!=='fence'||p.fence!=='no').findIndex(s=>s.id===p.current)+1).padStart(2,'0')} <span className="eyebrow-rule"/> {draft ? 'CHECK YOUR PHOTO' : 'ONE PHOTO AT A TIME'}</div><h1 className="capture-title">{step.title}<span className="red-dot">.</span></h1><p className="capture-instruction">{step.instruction}</p>
      {p.current==='meter' ? <MeterCapture camera={p.camera} onAccept={photo=>{p.onSave('meter',photo);p.onNext();}}/> : (p.current==='wall'||p.current==='right'||p.current==='left') ? <WallCapture key={p.current} mode={p.current} done={{wall:p.photos.wall?.status==='confirmed',right:p.photos.right?.status==='confirmed',left:p.photos.left?.status==='confirmed'}} camera={p.camera} sample={step.sample} onAccept={photo=>{const id=p.current;p.onSave(id,photo);p.onNext();}}/> : <>
      {p.current==='rating' && <div className="safety-notice"><ShieldCheck size={20}/><p>{step.tip} Never touch wires or electrical components.</p></div>}
      {p.current==='breaker' && <div className="location-field"><label htmlFor="breaker-location">Where is your main breaker box?</label><select id="breaker-location" value={p.location} onChange={e=>p.onLocation(e.target.value)}><option value="">Choose a location</option><option value="outside">Outside</option><option value="garage">Garage</option><option value="closet">Closet</option><option value="not sure">Not sure</option></select></div>}
      <div className={`camera-frame ${draft?'has-photo':''}`}>
        {draft ? <><img src={draft.url} alt={`${step.title} — ${draft.source==='sample'?'Base guide sample':'your photo'}`}/><span className="frame-label">{draft.source==='sample'?'BASE GUIDE SAMPLE':'PHOTO PREVIEW'}</span><button className="frame-close" aria-label="Retake photo" onClick={()=>updateDraft(null)}><X size={18}/></button></> : p.camera.stream ? <><video ref={video} autoPlay playsInline muted onLoadedData={()=>setVideoReady(true)} aria-label="Live camera preview"/><div className="capture-overlay"><i/><i/><i/><i/></div><span className="frame-label">LIVE CAMERA · STILL PHOTOS ONLY</span><button className="shutter" aria-label="Capture photo" disabled={!videoReady||busy} onClick={capture}><span/></button></> : <div className="camera-empty"><span className="camera-empty-icon"><Camera size={30}/></span><h3>{p.camera.status==='requesting'?'Allow your camera to get started':p.camera.status==='unavailable'?'Let’s use another way':'Your next photo starts here'}</h3><p>{p.camera.status==='requesting'?'Your browser may ask for camera access.':p.camera.status==='unavailable'?'Your camera isn’t available. You can upload a photo or use a sample below.':'Turn on your camera, or choose a photo below.'}</p><button className="button" onClick={()=>void p.camera.start()} disabled={p.camera.status==='requesting'}><Camera size={17}/>{p.camera.status==='requesting'?'Waiting for permission…':'Use camera'}</button><div className="empty-frame-corners"><i/><i/><i/><i/></div></div>}
      </div>
      <div role="status" aria-live="polite">{busy&&<p className="inline-message">Checking image brightness and size…</p>}{error&&<p className="inline-error">{error}</p>}</div>
      {draft ? <div className="photo-confirm"><div><h3>{p.current==='rating'?'Can you read the amp rating?':'Is the full area clearly visible?'}</h3><p>Check for blur, darkness, glare, or anything blocking the view.</p>{draft.warnings.map(w=><p className="quality-warning" key={w}>{w}</p>)}{draft.source==='sample'&&<p className="sample-disclaimer">Example from Base’s photo guide. This isn’t a photo of your home.</p>}</div><div className="confirm-actions"><button className="button" onClick={()=>updateDraft(null)}><RotateCcw size={16}/> Retake</button><button className="button primary" onClick={accept} disabled={p.current==='breaker'&&!p.location}><Check size={17}/>{p.current==='rating'?'Readable — use photo':'Looks clear — use photo'}</button></div>{p.current==='breaker'&&!p.location&&<p className="inline-message">Select the breaker location above to continue.</p>}</div> : <><div className="capture-fallbacks"><button className="button" onClick={()=>{p.camera.stop();file.current?.click();}} disabled={busy}><Upload size={17}/> Upload photo</button><button className="button" onClick={()=>{p.camera.stop();void prepare(step.sample,'sample');}} disabled={busy}><ImagePlus size={17}/> Use sample photo</button></div><div className="capture-tip"><Lightbulb size={18}/><p>{p.current==='rating'?'The number may say 125, 150, or 200. Don’t guess if it’s not readable.':step.tip}</p></div></>}
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} aria-label="Choose a photo from your device" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;if(f.size>25*1024*1024){setError('Choose an image smaller than 25 MB.');return;}void prepare(URL.createObjectURL(f),'upload');}}/>
      </>}
      <div className="capture-bottom"><span><span className="subtle-dot"/> SAVED ONLY IN THIS SESSION</span><button className="text-button" onClick={p.onNext}>{p.current==='rating'?'Skip & ask Base for help':'Skip for now'} <ArrowRight size={15}/></button></div>
    </>}
  </section></div>;
}
