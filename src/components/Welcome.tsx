import { ArrowRight, Camera, Check, Clock3, LockKeyhole, Sun, ShieldCheck } from 'lucide-react';
export function Welcome({ onStart }: { onStart: () => void }) {
  return <div className="welcome-grid">
    <div className="welcome-copy">
      <div className="eyebrow"><span className="tiny-line" /> A LITTLE PREP. A BIG STEP FORWARD.</div>
      <h1>Find your spot<span className="red-dot">.</span></h1>
      <p className="intro">A few guided photos of your meter area show Base the best place for your battery.</p>
      <div className="quick-facts"><span><Clock3 size={17} /> About 5–10 minutes</span><span><Camera size={17} /> 7–8 photos</span></div>
      <div className="prep-list">
        <div><span className="prep-icon"><Sun size={20} /></span><div><strong>A little daylight goes a long way</strong><p>Head outside while your meter area is well lit.</p></div></div>
        <div><span className="prep-icon"><Camera size={20} /></span><div><strong>We’ll guide you, one photo at a time</strong><p>Use your camera, upload a photo, or try a sample.</p></div></div>
        <div><span className="prep-icon"><ShieldCheck size={20} /></span><div><strong>Your safety comes first</strong><p>Stay clear of wires. Skip anything you can’t safely reach.</p></div></div>
      </div>
      <button className="button primary start-button" onClick={onStart}>Start <ArrowRight size={20} /></button>
      <p className="privacy-line"><LockKeyhole size={14} /> Demo only: photos stay on this device and are not uploaded.</p>
    </div>
    <div className="welcome-photo">
      <img src="/images/home-battery.jpg" alt="A Base home battery and electrical meter on the exterior brick wall of a home" />
      <div className="photo-topline"><span className="image-pill"><span /> YOUR HOME, READY FOR WHAT’S NEXT.</span><span className="photo-index">01 / 03</span></div>
      <div className="photo-caption"><span className="caption-icon"><Check size={20}/></span><div><strong>A clear picture starts here.</strong><p>From your meter to the space around it.</p></div></div>
      <span className="photo-credit">EXAMPLE BASE INSTALLATION</span>
    </div>
  </div>;
}
