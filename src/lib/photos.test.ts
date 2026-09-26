import { describe, expect, it } from 'vitest';
import { completion, requiredSteps, STEPS, type Photos } from './photos';
const all:Photos=Object.fromEntries(STEPS.map(s=>[s.id,{url:'sample.png',source:'sample',status:'confirmed',warnings:[]}]));
describe('photo completion',()=>{
  it('requires seven photos without a fence and eight with one',()=>{expect(requiredSteps('no')).toHaveLength(7);expect(requiredSteps('yes')).toHaveLength(8);});
  it('does not mark unanswered or uncertain fence observations ready',()=>{expect(completion(all,null,'outside').ready).toBe(false);expect(completion(all,'unsure','outside').ready).toBe(false);});
  it('requires the breaker location without evaluating eligibility',()=>{expect(completion(all,'no','').ready).toBe(false);expect(completion(all,'no','closet').ready).toBe(true);expect(completion(all,'no','not sure').ready).toBe(true);});
  it('distinguishes missing, retake, and complete evidence',()=>{const photos={...all};delete photos.rating;expect(completion(photos,'yes','outside')).toEqual({complete:7,total:8,ready:false});expect(completion({...all,meter:{...all.meter!,status:'retake'}},'no','garage').ready).toBe(false);expect(completion(all,'yes','outside').ready).toBe(true);});
});
