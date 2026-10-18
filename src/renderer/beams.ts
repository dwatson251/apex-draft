/** For the headlights: a car's length, and half its width, in world units. */
export const BEAM_CAR_LEN = 9;
export const BEAM_CAR_HALF = 2.6;
/** How far the outer cone of a headlight reaches, and how wide it is at that distance. */
export const BEAM_REACH = 40;
export const BEAM_SPREAD = 11;

/** What a headlight needs to know about a car: where it is and whether it is in the air (the light passes under a car in flight). */
export interface BeamCar { root: { x: number; y: number; visible?: boolean }; lift?: number }

/**
 * The nearest car in the way of `self`'s beam, or null: how far its tail is from the lamps (`d`) and how far off the beam's axis it is (`lat`).
 * (x, y) is the lamps, (fx, fy) the way the car points and (px, py) its left. A car beside, behind, in the air or out of reach is no obstacle.
 */
export function beamBlock(self: BeamCar, cars: Iterable<BeamCar>, x: number, y: number, fx: number, fy: number, px: number, py: number): { d: number; lat: number } | null {
  if ((self.lift ?? 0) > 0.04) return null;
  let best: { d: number; lat: number } | null = null;
  for (const o of cars) {
    if (o === self || o.root.visible === false || (o.lift ?? 0) > 0.04) continue;
    const dx = o.root.x - x, dy = o.root.y - y, along = dx * fx + dy * fy, lat = dx * px + dy * py;
    if (along < 1 || along > BEAM_REACH + 6) continue;
    if (Math.abs(lat) > BEAM_SPREAD * Math.min(1, along / BEAM_REACH) + BEAM_CAR_HALF) continue;
    const d = Math.max(2, along - BEAM_CAR_LEN / 2);
    if (!best || d < best.d) best = { d, lat };
  }
  return best;
}
