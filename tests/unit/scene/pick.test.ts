import { describe, expect, it } from 'vitest';
import { resolveTarget, type Named } from '../../../src/scene/pick';

const chain = (...names: string[]): Named => {
  let parent: Named | null = null;
  for (const name of names) parent = { name, parent };
  return parent!;
};

describe('resolveTarget', () => {
  it('walks from the quantised __geo child to the named node', () => {
    expect(resolveTarget(chain('Scene', 'desk_rig', 'hit_paddle_1', 'hit_paddle_1__geo'))).toEqual({ kind: 'paddle', key: '1' });
    expect(resolveTarget(chain('Scene', 'desk_rig', 'hit_paddle_down', 'hit_paddle_down__geo'))).toEqual({ kind: 'paddle', key: 'down' });
    expect(resolveTarget(chain('Scene', 'desk_rig', 'hit_laptop', 'hit_laptop__geo'))).toEqual({ kind: 'laptop' });
    expect(resolveTarget(chain('Scene', 'hit_monitor'))).toEqual({ kind: 'monitor' });
  });
  it('ignores unknown or non-target nodes', () => {
    expect(resolveTarget(chain('Scene', 'desk_rig', 'hit_paddle_9', 'hit_paddle_9__geo'))).toBeNull();
    expect(resolveTarget(chain('Scene', 'desk_baked'))).toBeNull();
    expect(resolveTarget(null)).toBeNull();
  });
});
