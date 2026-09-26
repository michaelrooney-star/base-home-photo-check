import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, LockKeyhole } from 'lucide-react';
import { Welcome } from './components/Welcome';
import { GuidedCapture } from './components/GuidedCapture';
import { Review } from './components/Review';
import { completion, nextStep, revokePhoto, STEPS, type Answer, type Notes, type Photo, type PhotoId, type Photos } from './lib/photos';
import { useCamera } from './lib/useCamera';
import type { EstimateResult } from './lib/estimate';
export default function App() {
  const [screen,setScreen]=useState<'welcome'|'capture'|'review'>('welcome');
  const [current,setCurrent]=useState<PhotoId>('meter');
  const [photos,setPhotos]=useState<Photos>({});const photoRef=useRef<Photos>({});
  const [fence,setFence]=useState<Answer>(null);const fenceRef=useRef<Answer>(null);
  const [location,setLocation]=useState('');const [notes,setNotes]=useState<Notes>({solar:null,obstructions:[],text:''});
  const [estimate,setEstimate]=useState<EstimateResult|null>(null);const [finished,setFinished]=useState(false);const [returnToReview,setReturnToReview]=useState(false);
  const camera=useCamera();
  const changeFence=(a:Answer)=>{fenceRef.current=a;setFence(a);};
  const navigate=useCallback((next:typeof screen)=>{if(next!=='capture')camera.stop();setScreen(next);window.scrollTo({top:0,behavior:'instant'});},[camera.stop]);
  function save(id:PhotoId,photo:Photo){revokePhoto(photoRef.current[id]);const next={...photoRef.current,[id]:photo};photoRef.current=next;setPhotos(next);setEstimate(null);}
  function select(id:PhotoId){setCurrent(id);window.scrollTo({top:0,behavior:'instant'});}
  function next(){
    if(returnToReview){setReturnToReview(false);navigate('review');return;}
    const to=nextStep(current,photoRef.current,fenceRef.current);
    if(!to){navigate('review');return;}select(to);
  }
  function retake(id:PhotoId){const p=photoRef.current[id];if(p){const next={...photoRef.current,[id]:{...p,status:'retake' as const}};photoRef.current=next;setPhotos(next);}setEstimate(null);setCurrent(id);setReturnToReview(true);navigate('capture');}
  function mark(id:PhotoId,status:'confirmed'|'retake'){const p=photoRef.current[id];if(!p)return;const next={...photoRef.current,[id]:{...p,status}};photoRef.current=next;setPhotos(next);}
  useEffect(()=>()=>{Object.values(photoRef.current).forEach(revokePhoto);},[]);
  useEffect(()=>{const heading=document.querySelector<HTMLElement>('main h1');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});},[screen,current,finished]);
  useEffect(()=>{
    type ModelContext={registerTool:(tool:Record<string,unknown>)=>void;unregisterTool:(name:string)=>void};
    const context=(navigator as Navigator & {modelContext?:ModelContext}).modelContext;if(!context)return;
    context.registerTool({name:'get_photo_checklist',description:'Read photo checklist statuses for this local demo. Does not expose images or notes and never uploads anything.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:async()=>({content:[{type:'text',text:JSON.stringify({screen,...completion(photos,fence,location),photos:STEPS.filter(s=>s.id!=='fence'||fence==='yes').map(s=>({title:s.title,status:photos[s.id]?.status??'missing',sample:photos[s.id]?.source==='sample'}))})}]})});
    return()=>context.unregisterTool('get_photo_checklist');
  },[photos,fence,location,screen]);
  return <div className={`app-shell ${screen==='capture'?'capturing':''}`}>
    <header className="site-header"><button className="wordmark" onClick={()=>navigate('welcome')} aria-label="Base Power home">base<span className="brand-period">.</span></button><span className="header-divider"/><span className="product-name">Home Photo Check</span><span className="demo-badge">INTERACTIVE DEMO</span><a className="help-link" aria-label="Open Base photo guide in a new tab" href="https://help.basepowercompany.com/en/articles/10280641" target="_blank" rel="noreferrer">Photo guide <ArrowUpRight size={15}/></a></header>
    <main><nav className="journey" aria-label="Your progress"><span className={screen==='welcome'?'journey-step active':'journey-step done'}><b>{screen==='welcome'?'1':<Check size={14}/>}</b> Get ready</span><span className="journey-line"/><span className={screen==='capture'?'journey-step active':screen==='review'?'journey-step done':'journey-step'}><b>{screen==='review'?<Check size={14}/>:'2'}</b> Take photos</span><span className="journey-line"/><span className={screen==='review'?'journey-step active':'journey-step'}><b>3</b> Review</span></nav>
      {screen==='welcome'&&<Welcome onStart={()=>{setReturnToReview(false);navigate('capture');void camera.start();}}/>}
      {screen==='capture'&&<GuidedCapture photos={photos} current={current} fence={fence} location={location} camera={camera} onFence={changeFence} onLocation={setLocation} onSave={save} onNext={next} onSelect={select} onReview={()=>navigate('review')} onBack={()=>navigate(returnToReview?'review':'welcome')}/>}
      {screen==='review'&&<Review photos={photos} fence={fence} location={location} notes={notes} estimate={estimate} finished={finished} onNotes={setNotes} onFence={changeFence} onLocation={setLocation} onEstimate={setEstimate} onRetake={retake} onMark={mark} onFinish={()=>{setFinished(true);window.scrollTo({top:0,behavior:'instant'});}} onEdit={()=>{setFinished(false);window.scrollTo({top:0,behavior:'instant'});}} onBack={()=>{setReturnToReview(false);navigate('capture');}}/>}
    </main><footer className="site-footer"><span>Good energy starts at home.</span><span><LockKeyhole size={13}/> Private by design. Nothing gets sent.</span><span>BASE POWER © {new Date().getFullYear()}</span></footer>
  </div>;
}
