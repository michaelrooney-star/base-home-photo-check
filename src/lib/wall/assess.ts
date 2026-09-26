// Whole-meter-wall photo: live instruction and final accept/reject, from observations only. Pure; unit-tested.
import type { ClassResult } from '../meter/analyzer.ts';
import type { FastMetrics } from '../meter/metrics.ts';
import { WALL_CHECK_LABELS, WALL_CRITERIA as C, WALL_MESSAGES as M, type SceneClass, type WallCheckId, type WallMode } from './criteria.ts';

/** Check labels that depend on which of the three wall photos this is. */
export function checkLabel(id: WallCheckId, mode: WallMode = 'wall') {
  if (id === 'direction') return mode === 'left' ? 'Shows the area to the left of the meter' : 'Shows the area to the right of the meter';
  return WALL_CHECK_LABELS[id];
}

export type SceneResult = ClassResult<SceneClass>;
/** Where the meter is, as shares of photo width/height; r = glass-cover radius as a share of photo height, if measured. */
export type MeterSpot = { x: number; y: number; r: number | null; source: 'auto' | 'tap' };
export type WallCheck = { id: WallCheckId; label: string; state: 'pass' | 'fail' | 'pending' | 'skipped'; message?: string };
export type WallEstimate = { leftFt: number; rightFt: number; belowFt: number };
export type WallEvidence = { scene: SceneResult; meter: MeterSpot | null; width: number; height: number; luma: number; sharpness: number; limitedSpace?: boolean };
export type WallDecision = { accepted: boolean; checks: WallCheck[]; reasons: string[]; estimate: WallEstimate | null; limitedSpace?: boolean };

/** Rough feet of wall visible left/right of the meter and below it, using the meter cover as a ruler. */
export function estimateFeet(m: MeterSpot, width: number, height: number): WallEstimate | null {
  if (!m.r) return null;
  const pxPerInch = (2 * m.r * height) / C.meterCoverInches;
  const ft = (px: number) => px / pxPerInch / 12;
  return { leftFt: ft(m.x * width), rightFt: ft((1 - m.x) * width), belowFt: ft((1 - m.y) * height) };
}

const sceneMessage = (s: SceneResult) =>
  s.status !== 'ok' ? M.point : s.top === 'meter_closeup' ? M.closeup : s.top === 'indoors' ? M.indoors : M.other;

/**
 * `mode` 'wall': meter roughly central with wall on both sides (and a feet estimate).
 * 'right' / 'left': Base's side photos. The meter sits near the opposite edge and the frame shows the area beside it.
 * The wall recedes at an angle there, so no feet estimate.
 */
export function decideWall(e: WallEvidence, mode: WallMode = 'wall'): WallDecision {
  const check = (id: WallCheckId, state: WallCheck['state'], message?: string): WallCheck => ({ id, label: checkLabel(id, mode), state, message: state === 'fail' ? message : undefined });
  const s = e.scene, m = e.meter, est = m && mode === 'wall' ? estimateFeet(m, e.width, e.height) : null;
  const closeup = s.status === 'ok' && s.probs.meter_closeup >= C.maxMeterCloseup;
  const waived = !!e.limitedSpace; // customer said they can't step back further: distance and side coverage go to a reviewer
  const width: WallCheck = mode !== 'wall'
    ? (() => {
        if (!m) return check('direction', 'skipped');
        const pos = mode === 'right' ? m.x : 1 - m.x; // distance of the meter from the edge it should be near
        return check('direction', pos <= C.maxSideMeterX ? 'pass' : 'fail', pos >= 1 - C.maxSideMeterX ? M.wrongSide[mode] : M.turnMore[mode]);
      })()
    : m && !waived
    ? (() => {
        const leftShort = m.x < C.minSideMargin || (est != null && est.leftFt < C.minSideFeet);
        const rightShort = m.x > 1 - C.minSideMargin || (est != null && est.rightFt < C.minSideFeet);
        return check('sides', leftShort || rightShort ? 'fail' : 'pass', leftShort ? M.moreLeft : M.moreRight);
      })()
    : check('sides', 'skipped');
  const ground = m ? check('ground', (est ? est.belowFt >= C.minBelowFeet : m.y <= C.maxMeterY) ? 'pass' : 'fail', M.ground) : check('ground', 'skipped');
  // "10 steps back" is a stand-in for coverage. If the photo measurably shows the wall beside the meter and the ground
  // (meter cover used as a ruler), it is far enough back, however big the meter looks. Without a scale we can't tell.
  const covered = est != null && width.state === 'pass' && ground.state === 'pass';
  const looksClose = closeup || (m?.r != null && 2 * m.r > C.maxMeterSize);
  const checks: WallCheck[] = [
    s.status !== 'ok' ? check('scene', 'skipped') : check('scene', s.probs.house_wall >= C.minHouseWall || closeup ? 'pass' : 'fail', sceneMessage(s)),
    check('meter', m ? 'pass' : 'fail', mode === 'wall' ? M.noMeter : M.sideNoMeter[mode]),
    waived ? check('distance', 'skipped') : check('distance', covered || !looksClose ? 'pass' : 'fail', M.tooClose),
    width,
    ground,
    check('orientation', e.width >= e.height ? 'pass' : 'fail', M.landscape),
    check('light', e.luma >= C.minLuma ? 'pass' : 'fail', M.dark),
    check('focus', e.sharpness >= C.minSharpness ? 'pass' : 'fail', M.blurry),
  ];
  const failed = checks.filter(c => c.state === 'fail');
  return { accepted: failed.length === 0, checks, reasons: [...new Set(failed.map(c => c.message!))], estimate: est, limitedSpace: waived };
}

/** The photo failed only because the customer is too close / not enough wall beside the meter: offer "I can't step back any further". */
export const spaceLimitedOnly = (d: WallDecision) => {
  const failed = d.checks.filter(c => c.state === 'fail').map(c => c.id);
  return failed.length > 0 && failed.every(id => id === 'distance' || id === 'sides');
};

export const wallInFocus = (m: FastMetrics) => m.sharpness >= C.minLiveSharpness && m.relSharpness >= C.minRelativeSharpness;

export type WallTone = 'search' | 'adjust' | 'hold' | 'ready';
export type WallLive = { now: number; fast: FastMetrics | null; goodFrames: number; landscape: boolean; scene: { result: SceneResult; at: number } | null; mode?: WallMode };
export type WallGuidance = { tone: WallTone; message: string; checks: WallCheck[] };

/** One instruction at a time while framing the wide shot. The customer presses the shutter; nothing is auto-captured. */
export function guideWall(i: WallLive): WallGuidance {
  const scene = i.scene && i.now - i.scene.at <= C.freshMs ? i.scene.result : null;
  const m = i.fast;
  const mode = i.mode ?? 'wall';
  const c = (id: WallCheckId, state: WallCheck['state']): WallCheck => ({ id, label: checkLabel(id, mode), state });
  const sceneState: WallCheck['state'] = !scene || scene.status === 'loading' ? 'pending' : scene.status !== 'ok' ? 'skipped' : scene.probs.house_wall >= C.minHouseWall ? 'pass' : 'fail';
  const checks = [
    c('scene', sceneState),
    c('distance', !scene || scene.status !== 'ok' ? 'pending' : scene.probs.meter_closeup >= C.maxMeterCloseup ? 'fail' : 'pass'),
    c('orientation', i.landscape ? 'pass' : 'fail'),
    c('light', !m ? 'pending' : m.luma >= C.minLuma ? 'pass' : 'fail'),
    c('focus', !m ? 'pending' : wallInFocus(m) && m.motion <= C.maxMotion ? 'pass' : 'fail'),
  ];
  const out = (tone: WallTone, message: string): WallGuidance => ({ tone, message, checks });
  if (!m) return out('search', M.loading);
  if (!i.landscape) return out('adjust', M.landscape);
  if (m.luma < C.minLuma) return out('adjust', M.dark);
  if (scene?.status === 'ok' && scene.probs.meter_closeup >= C.maxMeterCloseup) return out('adjust', M.closeup);
  if (scene?.status === 'ok' && scene.probs.house_wall < C.minHouseWall) return out('search', sceneMessage(scene));
  if (m.motion > C.maxMotion) return out('adjust', M.steady);
  if (!wallInFocus(m)) return out('adjust', M.blurry);
  if (!scene) return out('hold', mode === 'wall' ? M.point : M.sidePoint[mode]);
  return i.goodFrames >= C.readyFrames ? out('ready', mode === 'wall' ? M.ready : M.sideReady[mode]) : out('hold', M.steady);
}
