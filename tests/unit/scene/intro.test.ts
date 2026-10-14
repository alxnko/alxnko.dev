import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { consoleLayout } from '../../../src/ui/intro';
import { screenPose } from '../../../src/scene/intro';

const sizes = [[320, 568], [390, 844], [844, 390], [768, 1024], [1440, 900]];
describe('console intro', () => {
  it('calibrates quantized screen aspect and an off-centre safe-area rect', () => {
    const corners = [[-.15973, .1, 0], [.15973, .1, 0], [.15973, -.1, 0], [-.15973, -.1, 0]].map(p => new Vector3(...p));
    const view = { width: 1440, height: 900, left: 27, right: 1, top: 8, bottom: 42 };
    const { rect } = consoleLayout(view);
    const pose = screenPose(corners, rect, view, new Vector3(0, 0, 1));
    const camera = new PerspectiveCamera(pose.fov, pose.aspect, .001, 100);
    camera.position.set(...pose.pos); camera.up.set(...pose.up); camera.lookAt(...pose.target); camera.updateMatrixWorld();
    corners.forEach((p, i) => {
      const q = p.clone().project(camera);
      expect((q.x * .5 + .5) * view.width).toBeCloseTo(rect.x + (i === 1 || i === 2 ? rect.width : 0), 6);
      expect((-q.y * .5 + .5) * view.height).toBeCloseTo(rect.y + (i >= 2 ? rect.height : 0), 6);
    });
  });
  for (const [width, height] of sizes) {
    it(`contains a readable frozen 16:10 terminal at ${width}×${height}`, () => {
      const l = consoleLayout({ width, height });
      expect(l.rect.width / l.rect.height).toBeCloseTo(1.6, 8);
      expect(l.width / l.height).toBeCloseTo(1.6, 8);
      expect(l.rect.x).toBeGreaterThanOrEqual(0);
      expect(l.rect.y).toBeGreaterThanOrEqual(0);
      expect(l.rect.x + l.rect.width).toBeLessThanOrEqual(width);
      expect(l.rect.y + l.rect.height).toBeLessThanOrEqual(height);
      expect(24 * l.scale).toBeGreaterThanOrEqual(12);
      const rotated = consoleLayout({ width: height, height: width }, l);
      expect([rotated.width, rotated.height]).toEqual([l.width, l.height]);
    });
    for (const dpr of [1, 2]) it(`matches transformed world screen corners at ${width}×${height}, DPR ${dpr}`, () => {
      const matrix = new Matrix4().compose(new Vector3(1.2, .7, -.5), new Quaternion().setFromAxisAngle(new Vector3(.3, .8, .4).normalize(), .7), new Vector3(1.4, 1.4, 1.4));
      const corners = [[-.16, .1, 0], [.16, .1, 0], [.16, -.1, 0], [-.16, -.1, 0]].map(p => new Vector3(...p).applyMatrix4(matrix));
      const view = { width, height, left: 13, top: 17, right: 3, bottom: 9 };
      const { rect } = consoleLayout(view);
      const normal = corners[1].clone().sub(corners[0]).cross(corners[0].clone().sub(corners[3]));
      const pose = screenPose(corners, rect, view, corners[0].clone().add(normal));
      const camera = new PerspectiveCamera(pose.fov, width / height, .001, 100);
      camera.position.set(...pose.pos); camera.up.set(...pose.up); camera.lookAt(...pose.target); camera.updateMatrixWorld();
      const expected = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height]];
      corners.forEach((p, i) => {
        const n = p.clone().project(camera);
        expect(Math.abs((n.x * .5 + .5) * width - expected[i][0])).toBeLessThan(1 / dpr);
        expect(Math.abs((-n.y * .5 + .5) * height - expected[i][1])).toBeLessThan(1 / dpr);
      });
    });
  }
});
