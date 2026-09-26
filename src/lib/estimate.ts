export type Point = { x:number; y:number };
export type EstimateResult = { distance:number; unit:'in'|'cm'; model:string; corrected:boolean; sample:boolean };
export type CvMat = { data32F: Float32Array; data64F: Float64Array; delete:()=>void };
export type CvApi = { Mat:new()=>CvMat; CV_32FC2:number; matFromArray:(r:number,c:number,t:number,a:number[])=>CvMat; getPerspectiveTransform:(src:CvMat,dst:CvMat)=>CvMat; perspectiveTransform:(src:CvMat,dst:CvMat,m:CvMat)=>void };
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
export function validateReference(points:Point[],width:number,height:number):string|null {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return 'Enter the verified width and height of the exact reference face.';
  if(points.length!==6||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0))return 'Mark all four reference corners and both measurement endpoints.';
  const corners=points.slice(0,4);const sides=corners.map((p,i)=>distance(p,corners[(i+1)%4]));
  if(Math.min(...sides)<100)return 'The reference is too small in this photo. Try a closer, clearer photo.';
  for(let i=0;i<4;i++){
    const a=corners[i],b=corners[(i+1)%4],c=corners[(i+2)%4];
    const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
    const dot=(a.x-b.x)*(c.x-b.x)+(a.y-b.y)*(c.y-b.y);
    const cosine=dot/(distance(a,b)*distance(b,c));
    if(cross<=0||Math.abs(cosine)>Math.cos(80*Math.PI/180))return 'The corners look angled or out of order. Use a straight-on rectangular reference.';
  }
  if(Math.abs(sides[0]/sides[2]-1)>.1||Math.abs(sides[1]/sides[3]-1)>.1)return 'The reference looks angled. Try a straight-on photo.';
  if(Math.abs(((sides[0]+sides[2])/(sides[1]+sides[3]))/(width/height)-1)>.1)return 'The selected shape does not match the dimensions. Check your corners and dimensions.';
  if(distance(points[4],points[5])<25)return 'Select endpoints farther apart for a more stable estimate.';
  const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);const margin=Math.max(...sides)*2;
  if(points.slice(4).some(p=>p.x<Math.min(...xs)-margin||p.x>Math.max(...xs)+margin||p.y<Math.min(...ys)-margin||p.y>Math.max(...ys)+margin))return 'The endpoints are too far from the reference for this demo.';
  return null;
}
export function calculateDistance(cv:CvApi,points:Point[],width:number,height:number):number {
  const mats:CvMat[]=[]; const keep=(m:CvMat)=>{mats.push(m);return m;};
  try{
    const src=keep(cv.matFromArray(4,1,cv.CV_32FC2,points.slice(0,4).flatMap(p=>[p.x,p.y])));
    const dst=keep(cv.matFromArray(4,1,cv.CV_32FC2,[0,0,width,0,width,height,0,height]));
    const matrix=keep(cv.getPerspectiveTransform(src,dst));
    if(Array.from(matrix.data64F).some(n=>!Number.isFinite(n)))throw new Error('Unstable reference');
    for(const p of points.slice(4)){if(Math.abs(matrix.data64F[6]*p.x+matrix.data64F[7]*p.y+matrix.data64F[8])<1e-8)throw new Error('Unstable projection');}
    const input=keep(cv.matFromArray(2,1,cv.CV_32FC2,points.slice(4).flatMap(p=>[p.x,p.y])));
    const output=keep(new cv.Mat()); cv.perspectiveTransform(input,output,matrix);
    const [x1,y1,x2,y2]=output.data32F;const value=Math.hypot(x2-x1,y2-y1);
    if(!Number.isFinite(value)||value<=0)throw new Error('Invalid estimate'); return value;
  }finally{mats.forEach(m=>m.delete());}
}
export function stableEstimate(cv:CvApi,points:Point[],width:number,height:number):number {
  const error=validateReference(points,width,height);if(error)throw new Error(error);
  const base=calculateDistance(cv,points,width,height);
  for(let i=0;i<6;i++)for(const axis of ['x','y'] as const)for(const delta of [-2,2]){
    const perturbed=points.map(p=>({...p}));perturbed[i][axis]+=delta;
    const shifted=calculateDistance(cv,perturbed,width,height);
    if(Math.abs(shifted/base-1)>.1)throw new Error('Small changes to the points change the result too much.');
  }
  return base;
}
let cvPromise:Promise<CvApi>|null=null;
export function loadOpenCv():Promise<CvApi>{
  if(cvPromise)return cvPromise;
  cvPromise=new Promise((resolve,reject)=>{
    const runtime=window as unknown as Window & {cv?: CvApi | Promise<CvApi>};
    const timer=window.setTimeout(()=>reject(new Error('The measurement engine could not start. Skip this optional step.')),20000);
    const script=document.createElement('script');script.src='/vendor/opencv.js';script.async=true;
    script.onerror=()=>{clearTimeout(timer);reject(new Error('The measurement engine could not load.'));};
    script.onload=()=>{void(async()=>{try{const cv=await runtime.cv;if(!cv?.Mat||!cv?.getPerspectiveTransform)throw new Error('Measurement engine unavailable');clearTimeout(timer);resolve(cv);}catch(e){clearTimeout(timer);reject(e);}})();};
    document.head.appendChild(script);
  });return cvPromise;
}
