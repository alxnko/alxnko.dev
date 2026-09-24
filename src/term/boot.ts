// First-visit boot log: systemd to a tty autologin.
import { SITE } from '../content/site';
import { b, fg } from './format';
import type { Line } from './types';

const UNITS: [string, string][] = [
  ['Finished', 'Load Kernel Modules'],
  ['Mounted', 'Temporary Directory /tmp'],
  ['Reached target', 'Local File Systems'],
  ['Started', 'Journal Service'],
  ['Started', 'Network Time Synchronization'],
  ['Reached target', 'System Time Set'],
  ['Started', 'Network Configuration'],
  ['Reached target', 'Network'],
  ['Started', 'Desk Height Controller'],
  ['Started', 'Fan Speed Daemon'],
  ['Started', 'Cat Supervisor (best effort)'],
  ['Started', 'Getty on tty1'],
  ['Reached target', 'Login Prompts'],
  ['Reached target', 'Multi-User System'],
];

export function bootLines(): Line[] {
  return [
    ...UNITS.map(([verb, unit]): Line => [{ text: '[' }, fg('accent', '  OK  '), { text: `] ${verb} ` }, b(unit, 'white'), { text: '.' }]),
    [{ text: '' }],
    [{ text: `${SITE.os} rolling (tty1)` }],
    [{ text: '' }],
    [{ text: `${SITE.host} login: ${SITE.handle} (automatic login)` }],
  ];
}
