// raw Blender glb -> runtime glb (meshopt + quantised) and a decoded copy for the
// Blender re-import check.  bun scene/optimize.ts <in.glb> <out.glb> [check.glb]
//
// Every named mesh node keeps its transform (pivots are part of the contract);
// its geometry moves into a child `<name>__geo`, because quantisation folds a
// dequantisation scale/offset into the transform of the node that owns the mesh.
import { Document, NodeIO, PropertyType, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { dedup, dequantize, prune, quantize, reorder, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, output, check] = process.argv.slice(2);
if (!input || !output) throw new Error('usage: optimize.ts in.glb out.glb [check.glb]');

const BAKED = new Set(['static', 'desk_baked', 'fan_blades', 'cat_body', 'cat_head', 'cat_tail']);

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const doc = await io.read(input);
const root = doc.getRoot();
const unlit = doc.createExtension(KHRMaterialsUnlit);

// 1) geometry into child nodes, so named nodes keep their authored TRS
const named: Node[] = root.listNodes().filter((n) => n.getMesh());
for (const node of named) {
  const geo = doc.createNode(`${node.getName()}__geo`).setMesh(node.getMesh());
  node.setMesh(null).addChild(geo);
}

// 2) one unlit material per role; baked meshes need no normals (unlit atlas)
const mats = new Map<string, ReturnType<Document['createMaterial']>>();
for (const m of root.listMaterials()) {
  const name = m.getName();
  const fresh = doc.createMaterial(name).setBaseColorFactor([1, 1, 1, 1]).setExtension('KHR_materials_unlit', unlit.createUnlit());
  if (name === 'glow' || name === 'hit') fresh.setAlphaMode('BLEND');
  mats.set(name, fresh);
}
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const owner = node.getName().replace(/__geo$/, '');
  for (const prim of mesh.listPrimitives()) {
    const old = prim.getMaterial();
    if (old) prim.setMaterial(mats.get(old.getName()) ?? old);
    if (BAKED.has(owner)) prim.setAttribute('NORMAL', null);
    for (const sem of prim.listSemantics()) {
      if (sem !== 'POSITION' && sem !== 'NORMAL' && sem !== 'TEXCOORD_0') prim.setAttribute(sem, null);
    }
  }
}
for (const m of root.listMaterials()) if (![...mats.values()].includes(m)) m.dispose();
for (const ext of root.listExtensionsUsed()) {
  if (ext.extensionName !== 'KHR_materials_unlit') ext.dispose();
}

await doc.transform(
  weld(),
  // keep role materials distinct (they are identical white unlit placeholders)
  dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH] }),
  // materials carry no textures: keep TEXCOORD_0 / NORMAL explicitly
  prune({ keepLeaves: true, keepAttributes: true }),
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
  quantize({ quantizePosition: 14, quantizeTexcoord: 12, quantizeNormal: 8 }),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({
  method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
});
await io.write(output, doc);

// stats
let tris = 0;
let verts = 0;
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices();
    tris += (idx ? idx.getCount() : prim.getAttribute('POSITION')!.getCount()) / 3;
    verts += prim.getAttribute('POSITION')!.getCount();
  }
}
const bytes = (await Bun.file(output).arrayBuffer()).byteLength;
const stats = { glb: output, bytes, kb: +(bytes / 1024).toFixed(1), tris, verts, meshes: root.listMeshes().length };
console.log(JSON.stringify(stats));
await Bun.write(output.replace(/[^/]+$/, 'glb-stats.json'), JSON.stringify(stats, null, 1));

// decoded copy (no meshopt, no quantisation) for the Blender re-import check
if (check) {
  const dec = await io.read(output);
  await dec.transform(dequantize());
  for (const ext of dec.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === 'EXT_meshopt_compression' || ext.extensionName === 'KHR_mesh_quantization') ext.dispose();
  }
  await io.write(check, dec);
}
