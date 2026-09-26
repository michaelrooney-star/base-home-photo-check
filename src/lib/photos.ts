import { planWall, skippable, type SpaceSummary } from './wall/survey.ts';
export type PhotoId = 'meter' | 'wall' | 'right' | 'left' | 'adjacent' | 'fence' | 'breaker' | 'rating';
export type Answer = 'yes' | 'no' | 'unsure' | null;
/** Result of the automatic meter-photo check. `override` = customer sent it anyway after rejections. */
export type PhotoCheck = { accepted: boolean; meterNumber: string | null; reasons: string[]; override?: boolean; details?: string; limitedSpace?: boolean; space?: SpaceSummary; amps?: number };
export type Photo = { url: string; source: 'camera' | 'upload' | 'sample'; status: 'confirmed' | 'retake'; warnings: string[]; check?: PhotoCheck };
export type Photos = Partial<Record<PhotoId, Photo>>;
export type PhotoStep = { id: PhotoId; title: string; instruction: string; tip: string; sample: string };
export type Notes = { solar: Answer; obstructions: string[]; text: string };
export const STEPS: PhotoStep[] = [
  {id:'meter', title:'Meter number', instruction:'Fit your electric meter inside the circle. We’ll guide you and take the photo when the meter number is readable.', tip:'Daylight works best. Keep the glass free of glare and nothing in front of the meter.', sample:'/images/meter.png'},
  {id:'wall', title:'Whole meter wall', instruction:'Stand back as far as you safely can, phone sideways. Show the meter, the wall on both sides of it, and the ground in front of the wall.', tip:'Daylight works best. Move bins, hoses or anything else blocking the wall if you can.', sample:'/images/wall.png'},
  {id:'right', title:'Right side of meter', instruction:'Next, look along the wall to the right of your meter. Keep the meter on the left side of the photo and show the wall and ground to its right.', tip:'Include the ground and anything next to the wall, like an AC unit, windows or a gas meter.', sample:'/images/right.png'},
  {id:'left', title:'Left side of meter', instruction:'Now look along the wall to the left of your meter. Keep the meter on the right side of the photo and show the wall and ground to its left.', tip:'Include the ground and anything next to the wall, like an AC unit, windows or a gas meter.', sample:'/images/left.png'},
  {id:'adjacent', title:'Adjacent wall', instruction:'Show the wall around the nearest corner, from corner to corner.', tip:'Include the ground and any nearby objects.', sample:'/images/adjacent.png'},
  {id:'fence', title:'Behind fence', instruction:'Show the full area behind the fence, from corner to corner.', tip:'Stay on your property and only enter an area you can access safely.', sample:'/images/fence.png'},
  {id:'breaker', title:'Main breaker box', instruction:'Show the whole main breaker box and where it is located.', tip:'Include enough of the surroundings to show its location. Keep the panel closed.', sample:'/images/breaker.png'},
  {id:'rating', title:'Main breaker rating', instruction:'Get close to the main switch so its number (like 100, 150 or 200) fills the box.', tip:'Only open the lid if it is safe and you can do so without touching wires. Otherwise skip this photo and ask Base for help.', sample:'/images/rating.png'},
];
export function requiredSteps(fence: Answer) { return STEPS.filter(s => s.id !== 'fence' || fence === 'yes'); }
export function completion(photos: Photos, fence: Answer, location: string) {
  const steps = requiredSteps(fence);
  const skip = skippable(photos) as PhotoId[];
  const needed = steps.filter(s => !skip.includes(s.id)); // photos the survey no longer needs don't count
  const complete = needed.filter(s => photos[s.id]?.status === 'confirmed').length;
  return { total: needed.length, complete, ready: complete === needed.length && (fence === 'yes' || fence === 'no') && !!location };
}
/**
 * The step after `current`. The meter-wall photos follow the survey plan (wall/survey.ts): look along the more
 * promising side first and skip the other side once open wall is found.
 */
export function nextStep(current: PhotoId, photos: Photos, fence: Answer): PhotoId | null {
  const order = STEPS.filter(s => s.id !== 'fence' || !(fence === 'no' || fence === 'unsure')).map(s => s.id);
  const skip = skippable(photos) as PhotoId[];
  const after = (id: PhotoId) => order.slice(order.indexOf(id) + 1).find(x => !skip.includes(x)) ?? null;
  if (current === 'wall' || current === 'right' || current === 'left') {
    const todo = planWall(photos).todo.filter(s => s !== current);
    return todo[0] ?? after('left');
  }
  return after(current);
}
export function revokePhoto(photo?: Photo) { if (photo?.url.startsWith('blob:')) URL.revokeObjectURL(photo.url); }
export async function inspectPhoto(url: string): Promise<string[]> {
  const img = new Image(); img.src = url; await img.decode();
  const warnings: string[] = [];
  if (Math.min(img.naturalWidth, img.naturalHeight) < 320) warnings.push('This image is small. Check that the details are readable.');
  const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return warnings;
  ctx.drawImage(img, 0, 0, 96, 96); const data = ctx.getImageData(0, 0, 96, 96).data;
  let light = 0;
  for (let i=0;i<data.length;i+=4) light += (data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)*(data[i+3]/255);
  if (light/(96*96) < 38) warnings.push('This photo may be too dark. Try more daylight or confirm the details are visible.');
  return warnings;
}
