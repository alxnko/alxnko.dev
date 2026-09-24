// Vite plugin: the desk's glb (public/scene/desk.*.glb) uses EXT_meshopt_compression,
// KHR_mesh_quantization and KHR_materials_unlit only. GLTFLoader registers a plugin for every
// extension it knows in its constructor, so none of them can be tree-shaken; this drops the
// registrations of the ones the desk never uses (materials, textures, lights, instancing), and
// the bundler then drops their classes. Quantization and unlit are handled by the loader core.
// tests/unit/scene-assets.test.ts checks the glb needs nothing outside KEEP.

/** Plugin classes kept (the rest are unregistered). */
export const KEEP = ['GLTFMeshoptCompression'];

const REGISTER = /\n\t\tthis\.register\( function \( parser \) \{\s*return new (\w+)\([^)]*\);\s*\} \);\n/g;

/** GLTFLoader.js source with only the KEEP plugins registered. */
export function slimGltf(code) {
  let dropped = 0;
  const out = code.replace(REGISTER, (m, cls) => (KEEP.includes(cls) ? m : (dropped++, '\n')));
  if (!dropped) throw new Error('slim-gltf: no GLTFLoader plugin registrations found (three.js changed?)');
  return out;
}

export function slimGltfPlugin() {
  return {
    name: 'slim-gltf',
    enforce: 'pre',
    transform(code, id) {
      if (!/three\/examples\/jsm\/loaders\/GLTFLoader\.js$/.test(id.split('?')[0])) return null;
      return { code: slimGltf(code), map: null };
    },
  };
}
