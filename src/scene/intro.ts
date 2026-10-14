import { Vector3 } from 'three';
import type { Pose, Vec3 } from './rail';
import type { ConsoleLayout, Viewport } from '../ui/intro';
export interface ScreenPose extends Pose { up: Vec3; aspect: number }
/** Exact front-on camera for the inner display, in world space and CSS pixels. */
export function screenPose(corners: Vector3[], rect: ConsoleLayout['rect'], view: Viewport, toward: Vector3): ScreenPose {
  const [tl, tr, , bl] = corners;
  const center = corners.reduce((c, p) => c.add(p), new Vector3()).multiplyScalar(.25);
  const right = tr.clone().sub(tl).normalize(), up = tl.clone().sub(bl).normalize();
  const normal = right.clone().cross(up).normalize();
  if (normal.dot(toward.clone().sub(center)) < 0) normal.negate();
  const aspect = view.width / view.height * (tl.distanceTo(tr) / tl.distanceTo(bl)) / (rect.width / rect.height);
  const fov = 34, tangent = Math.tan(fov * Math.PI / 360);
  const distance = tl.distanceTo(bl) / (2 * tangent * rect.height / view.height);
  // Camera/target translation puts an off-centre contain rect at its exact CSS position.
  const target = center.clone()
    .addScaledVector(right, -(rect.x + rect.width / 2 - view.width / 2) * 2 * distance * tangent * aspect / view.width)
    .addScaledVector(up, (rect.y + rect.height / 2 - view.height / 2) * 2 * distance * tangent / view.height);
  return { pos: target.clone().addScaledVector(normal, distance).toArray() as Vec3, target: target.toArray() as Vec3, fov, aspect, up: up.toArray() as Vec3 };
}
