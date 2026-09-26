import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const cvRuntime = createRequire(import.meta.url)('@techstark/opencv-js');
import { stableEstimate, validateReference, type CvApi, type Point } from './estimate';
const points:Point[]=[{x:100,y:100},{x:300,y:100},{x:300,y:400},{x:100,y:400},{x:120,y:200},{x:280,y:200}];
let cv:CvApi;
beforeAll(async()=>{cv=await (cvRuntime as unknown as Promise<CvApi>);},30000);
describe('conservative reference validation',()=>{
  it('rejects unknown dimensions, incomplete corners, and angled references',()=>{expect(validateReference(points,0,15)).toBeTruthy();expect(validateReference(points.slice(0,4),10,15)).toBeTruthy();expect(validateReference(points.map((p,i)=>i===1?{x:250,y:160}:p),10,15)).toBeTruthy();});
  it('rejects dimension mismatches, reversed corners, and tiny targets',()=>{expect(validateReference(points,15,10)).toBeTruthy();const reversed=[points[0],points[3],points[2],points[1],points[4],points[5]];expect(validateReference(reversed,10,15)).toBeTruthy();expect(validateReference([...points.slice(0,5),{x:121,y:200}],10,15)).toBeTruthy();});
  it('computes a known coplanar distance using the real OpenCV runtime',()=>{expect(validateReference(points,10,15)).toBeNull();expect(stableEstimate(cv,points,10,15)).toBeCloseTo(8,4);});
  it('preserves the chosen unit without using assumed meter dimensions',()=>{expect(stableEstimate(cv,points,25.4,38.1)).toBeCloseTo(20.32,3);});
});
