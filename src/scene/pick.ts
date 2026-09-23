// Tap targets are invisible boxes named hit_*; after quantisation their meshes live in
// '<name>__geo' children. Resolve a raycast hit to the named target node.

export interface Named { name: string; parent: Named | null }

export type Target = { kind: 'laptop' } | { kind: 'monitor' } | { kind: 'paddle'; key: string };

const PADDLE = new Set(['1', '2', '3', 'up', 'down']);

export function resolveTarget(hit: Named | null): Target | null {
  for (let n = hit; n; n = n.parent) {
    const name = n.name.replace(/__geo$/, '');
    if (!name.startsWith('hit_') || n.name.endsWith('__geo')) continue;
    if (name === 'hit_laptop') return { kind: 'laptop' };
    if (name === 'hit_monitor') return { kind: 'monitor' };
    const key = name.slice('hit_paddle_'.length);
    if (name.startsWith('hit_paddle_') && PADDLE.has(key)) return { kind: 'paddle', key };
    return null;
  }
  return null;
}
