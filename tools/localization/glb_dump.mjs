// Dumps every triangle of public/models/talos.glb (world positions, the vehicle's `origin` frame) to a Float32 file
// for silhouettes.py.   node tools/localization/glb_dump.mjs /tmp/talos_tris.bin
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const buf = readFileSync(new URL('../../public/models/talos.glb', import.meta.url));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
await MeshoptDecoder.ready;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.parse(ab, '', (g) => {
  g.scene.updateMatrixWorld(true);
  const out = [];
  const v = new THREE.Vector3();
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(o.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  });
  const f = new Float32Array(out);
  writeFileSync(process.argv[2] || '/tmp/talos_tris.bin', Buffer.from(f.buffer));
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < f.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], f[i + k]); hi[k] = Math.max(hi[k], f[i + k]); }
  console.log('triangles', f.length / 9, 'lo', lo.map((x) => x.toFixed(3)), 'hi', hi.map((x) => x.toFixed(3)));
}, (e) => console.error(e));
