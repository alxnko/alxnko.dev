// Suggestion chips: what to try next, following what was just run. Plain commands a visitor
// can tap; they are typed into the prompt and run like any other line.
import type { WorldState } from './types';

const FIRST = ['help', 'fastfetch', 'contacts', 'tour', 'cmatrix'];

/** Up to five command lines to offer after `last` (null: nothing run yet). */
export function suggest(last: { line: string; status: number } | null, world: Pick<WorldState, 'desk' | 'ring' | 'fan' | 'theme'>, has3d = true): string[] {
  // the tour needs the 3D desk: never offered on the page view
  return pick(last, world).filter((c) => has3d || c !== 'tour').slice(0, 5);
}

function pick(last: { line: string; status: number } | null, world: Pick<WorldState, 'desk' | 'ring' | 'fan' | 'theme'>): string[] {
  if (!last) return FIRST;
  const [cmd = '', arg = ''] = last.line.trim().split(/\s+/);
  const theme = world.theme === 'light' ? 'theme night' : 'theme day';
  let next: string[];
  if (last.status === 127) next = ['help', 'fastfetch', 'contacts', 'tour'];
  else
    switch (cmd) {
      case 'help':
      case 'man':
        next = ['fastfetch', 'contacts', 'tour', 'cmatrix', 'desk up'];
        break;
      case 'whoami':
      case 'fastfetch':
      case 'cat':
        next = ['contacts', 'tour', 'cmatrix', 'ls', 'help'];
        break;
      case 'contacts':
      case 'contact':
        next = ['open github', 'open telegram', 'open linkedin', 'cd ~/monitor', 'help'];
        break;
      case 'ls':
      case 'll':
      case 'tree':
      case 'cd':
      case 'pwd':
        next = ['cat ~/about.md', 'ls ~/monitor', 'cd ~/monitor', 'tree', 'cd ~'];
        break;
      case 'desk':
        next = [world.desk >= 1.1 ? 'desk down' : 'desk up', world.desk <= 0.75 ? 'desk 3' : 'desk 1', 'desk 2', theme, 'fan'];
        break;
      case 'theme':
      case 'ring':
      case 'fan':
        next = [theme, world.ring === 'purple' ? 'ring green' : 'ring purple', `fan ${(world.fan + 1) % 4}`, 'desk up', 'meow'];
        break;
      case 'cmatrix':
        next = [arg === '--both' ? 'cmatrix -C red' : 'cmatrix --both', 'cmatrix -C blue', 'cmatrix -s', 'help'];
        break;
      case 'tour':
        next = ['contacts', 'cmatrix --both', 'desk 3', 'help'];
        break;
      default:
        next = ['help', 'contacts', 'tour', 'cmatrix', 'fastfetch'];
    }
  return next.filter((c) => c !== last.line.trim());
}
