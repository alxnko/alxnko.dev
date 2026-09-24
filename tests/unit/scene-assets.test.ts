// Guards the committed Blender outputs (CI never runs Blender): every file the
// manifest names exists, fits its budget (plan Tasks 3-4) and the glb carries the
// spec §6.2 node contract.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../../public/scene/', import.meta.url));
const manifest = JSON.parse(readFileSync(dir + 'manifest.json', 'utf8'));
const KB = 1024;
const size = (name: string) => statSync(dir + name).size;

const NODES = [
  'static', 'desk_rig', 'desk_baked', 'screen_laptop', 'screen_monitor', 'fan_blades',
  'cat_body', 'cat_head', 'cat_tail', 'ring', 'ring_glow', 'led_paddle', 'led_kbd',
  'led_srv_0', 'led_srv_1', 'led_srv_2', 'led_srv_3', 'led_srv_4', 'led_srv_5',
  'window_sky', 'hit_laptop', 'hit_monitor', 'cam_wide', 'cam_desk',
  'fan_ring', 'fan_display', 'kbd_glow', 'laptop_kbd_glow',
  'hit_paddle_1', 'hit_paddle_2', 'hit_paddle_3', 'hit_paddle_up', 'hit_paddle_down',
];

function glbJson(path: string) {
  const buf = readFileSync(path);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67); // 'glTF'
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

describe('scene assets', () => {
  it('manifest has the plan shape', () => {
    expect(manifest.deskBase).toBe(0.74);
    expect(manifest.presets).toEqual([0.74, 0.95, 1.12]);
    expect(manifest.range).toEqual([0.7, 1.2]);
    expect(manifest.screens.laptop).toMatchObject({ w: 0.345, h: 0.216 });
    expect(manifest.screens.monitor).toMatchObject({ w: 0.8, h: 0.335, radius: 1.5 });
    expect(manifest.files.glb).toBe(`desk.${manifest.version}.glb`);
  });

  it('every referenced file exists with a content hash in its name', () => {
    const names = [
      manifest.files.glb,
      ...Object.values(manifest.files.atlas).flatMap((r: any) => Object.values(r)),
      ...Object.values(manifest.files.poster).flatMap((r: any) =>
        Object.values(r).flatMap((s: any) => Object.values(s))),
    ] as string[];
    expect(names).toHaveLength(1 + 4 + 8);
    for (const n of names) {
      expect(n).toMatch(/\.[0-9a-f]{8}\.(glb|webp|avif)$/);
      expect(existsSync(dir + n), n).toBe(true);
    }
  });

  it('fits the budgets', () => {
    const f = manifest.files;
    expect(size(f.glb)).toBeLessThanOrEqual(250 * KB);
    expect(manifest.stats.tris).toBeLessThanOrEqual(40_000);
    for (const rig of ['day', 'night']) {
      expect(size(f.atlas[rig]['1024'])).toBeLessThanOrEqual(120 * KB);
      expect(size(f.atlas[rig]['2048'])).toBeLessThanOrEqual(450 * KB);
      expect(size(f.poster[rig]['1600'].avif)).toBeLessThanOrEqual(90 * KB);
      expect(size(f.poster[rig]['800'].avif)).toBeLessThanOrEqual(45 * KB);
    }
  });

  it('glb has the spec §6.2 node contract and meshopt compression', () => {
    const gltf = glbJson(dir + manifest.files.glb);
    const names = new Set(gltf.nodes.map((n: any) => n.name));
    for (const n of NODES) expect(names.has(n), n).toBe(true);
    expect(gltf.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(gltf.extensionsUsed).toContain('KHR_materials_unlit');
    const rig = gltf.nodes.find((n: any) => n.name === 'desk_rig');
    expect(rig.translation[1]).toBeCloseTo(0.74, 5);
  });

  it('og image is 1200x630', () => {
    const png = readFileSync(fileURLToPath(new URL('../../public/og.png', import.meta.url)));
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});

describe('slim GLTFLoader (scripts/slim-gltf.mjs)', () => {
  const loaderSrc = readFileSync(fileURLToPath(new URL('../../node_modules/three/examples/jsm/loaders/GLTFLoader.js', import.meta.url)), 'utf8');

  it('the desk glb needs no extension the slimmed loader dropped', async () => {
    const { SUPPORTED_EXTENSIONS } = await import('../../scripts/slim-gltf.mjs');
    const j = glbJson(dir + manifest.files.glb);
    for (const e of j.extensionsUsed ?? []) expect(SUPPORTED_EXTENSIONS).toContain(e);
  });

  it('the scene refuses a glb with an extension the slimmed loader dropped', async () => {
    const { SUPPORTED_EXTENSIONS } = await import('../../scripts/slim-gltf.mjs');
    const { unsupportedExtensions } = await import('../../src/scene/phases');
    expect(unsupportedExtensions({ extensionsUsed: SUPPORTED_EXTENSIONS })).toEqual([]);
    expect(unsupportedExtensions({})).toEqual([]);
    expect(unsupportedExtensions({ extensionsUsed: ['KHR_mesh_quantization', 'KHR_texture_basisu', 'KHR_lights_punctual'] })).toEqual(['KHR_texture_basisu', 'KHR_lights_punctual']);
  });

  it('keeps the meshopt registrations and drops every other plugin', async () => {
    const { slimGltf, KEEP } = await import('../../scripts/slim-gltf.mjs');
    const out: string = slimGltf(loaderSrc);
    const registered = [...out.matchAll(/this\.register\( function \( parser \) \{\s*return new (\w+)/g)].map((m) => m[1]);
    expect(registered).toEqual(['GLTFMeshoptCompression', 'GLTFMeshoptCompression']);
    expect(KEEP).toEqual(['GLTFMeshoptCompression']);
    expect(() => slimGltf('no registrations here')).toThrow();
  });
});
