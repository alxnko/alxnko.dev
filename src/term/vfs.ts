// In-memory filesystem (spec §5.3). The filesystem is the desk: bound dirs carry landmarks.
import { CONTACTS, SITE } from '../content/site';
import type { Landmark, WorldState } from './types';

export interface VNode {
  name: string;
  kind: 'dir' | 'file' | 'link';
  landmark?: Landmark;
  read?(w: WorldState): string;
  href?: string;
  children?: VNode[];
  hidden?: boolean;
}

export const HOME = '/home/alxnko';

const file = (name: string, read: (w: WorldState) => string, hidden = false): VNode => ({
  name,
  kind: 'file',
  read,
  ...(hidden ? { hidden } : {}),
});
const dir = (name: string, children: VNode[], extra: Partial<VNode> = {}): VNode => ({
  name,
  kind: 'dir',
  children,
  ...extra,
});

export const themeName = (w: WorldState): 'day' | 'night' => (w.theme === 'light' ? 'day' : 'night');

const ABOUT = [
  `# ${SITE.name} (${SITE.handle})`,
  '',
  SITE.role,
  SITE.country,
  `${SITE.rank.text} · ${SITE.rank.href}`,
  '',
  'i build systems and ship. meow.',
  '',
  'contacts: ls ~/monitor',
].join('\n');

const OS_RELEASE = [
  `NAME="${SITE.os}"`,
  `PRETTY_NAME="${SITE.os}"`,
  'ID=meow',
  'BUILD_ID=rolling',
  'ANSI_COLOR="38;2;0;255;130"',
  `HOME_URL="${SITE.url}"`,
  'LOGO=meowos-logo',
].join('\n');

const MOTD = `welcome to ${SITE.os} on ${SITE.host}. type 'help' to look around.`;

export function createFs(): VNode {
  return dir(
    '',
    [
      dir('etc', [
        file('hostname', () => SITE.host),
        file('motd', () => MOTD),
        file('os-release', () => OS_RELEASE),
      ]),
      dir('home', [
        dir(
          SITE.handle,
          [
            dir('.config', [file('theme', themeName)], { hidden: true }),
            file('about.md', () => ABOUT),
            dir(
              'desk',
              [
                file('fan', (w) => String(w.fan)),
                file('height', (w) => (w.desk * 100).toFixed(0) + ' cm'),
                file('rgb', (w) => w.rgb),
              ],
            ),
            dir('laptop', [file('readme.txt', () => "you're typing on it.")], { landmark: 'laptop' }),
            dir(
              'monitor',
              CONTACTS.map((c) => ({ name: `${c.id}.lnk`, kind: 'link' as const, href: c.href, read: () => c.href })),
              { landmark: 'monitor' },
            ),
          ],
          { landmark: 'desk' },
        ),
      ]),
    ],
    { landmark: 'wide' },
  );
}

/** Normalizes `p` against `cwd`: handles `~`, `.`, `..`, absolute paths and repeated slashes. */
export function resolve(cwd: string, p: string): string {
  let path = p;
  if (path === '~' || path.startsWith('~/')) path = HOME + path.slice(1);
  const base = path.startsWith('/') ? [] : cwd.split('/');
  const parts: string[] = [];
  for (const seg of [...base, ...path.split('/')]) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return '/' + parts.join('/');
}

export function lookup(root: VNode, abs: string): VNode | null {
  let node: VNode | undefined = root;
  for (const seg of abs.split('/')) {
    if (!seg) continue;
    node = node?.kind === 'dir' ? node.children?.find((c) => c.name === seg) : undefined;
    if (!node) return null;
  }
  return node ?? null;
}

/** HOME → `~`, HOME/x → `~/x`, anything else unchanged. */
export function pretty(abs: string): string {
  if (abs === HOME) return '~';
  if (abs.startsWith(HOME + '/')) return '~' + abs.slice(HOME.length);
  return abs;
}
