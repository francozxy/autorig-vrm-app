import * as THREE from 'three';

const heatCol = new THREE.Color();

// Convierte el peso a color HSL (0 = Azul, 1 = Rojo)
export function heatAt(col, si, sw, v, bi) {
  let w = 0;
  for (let k = 0; k < 4; k++) {
    if (si.array[v * 4 + k] === bi) w += sw.array[v * 4 + k];
  }
  heatCol.setHSL((1 - Math.min(w, 1)) * 0.66, 1, 0.5);
  col.array[v * 3] = heatCol.r;
  col.array[v * 3 + 1] = heatCol.g;
  col.array[v * 3 + 2] = heatCol.b;
}

// Actualiza los colores de vértice de la malla según el hueso activo
export function updateHeat(mesh, boneIndex) {
  if (!mesh || !mesh.geometry) return;
  const g = mesh.geometry;
  const n = g.attributes.position.count;
  let col = g.attributes.color;

  if (!col || col.count !== n) {
    col = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    g.setAttribute('color', col);
  }

  for (let v = 0; v < n; v++) {
    heatAt(col, g.attributes.skinIndex, g.attributes.skinWeight, v, boneIndex);
  }
  col.needsUpdate = true;
}

// Suma o resta influencia y redistribuye el peso restante al padre si es necesario
export function setW(si, sw, v, bi, dw, pi) {
  const o = v * 4;
  const I = si.array;
  const W = sw.array;
  let s = -1;

  for (let k = 0; k < 4; k++) {
    if (I[o + k] === bi && (s < 0 || W[o + k] > W[o + s])) s = k;
  }

  if (s < 0) {
    if (dw <= 0) return;
    s = 0;
    for (let k = 1; k < 4; k++) {
      if (W[o + k] < W[o + s]) s = k;
    }
    I[o + s] = bi;
    W[o + s] = 0;
  }

  const w = Math.min(1, Math.max(0, W[o + s] + dw));
  let rest = 0;
  for (let k = 0; k < 4; k++) {
    if (k !== s) rest += W[o + k];
  }

  const need = 1 - w;
  W[o + s] = w;

  if (rest > 1e-6) {
    const f = need / rest;
    for (let k = 0; k < 4; k++) {
      if (k !== s) W[o + k] *= f;
    }
  } else if (need > 1e-6) {
    if (pi < 0) {
      W[o + s] = 1;
      return;
    }
    let t = -1;
    for (let k = 0; k < 4; k++) {
      if (k !== s && I[o + k] === pi) t = k;
    }
    if (t < 0) {
      t = (s + 1) % 4;
      I[o + t] = pi;
    }
    W[o + t] = need;
  }
}

// Precalcula las posiciones mundiales visibles con skinning
export function computeWP(skinnedMeshes) {
  const t = new THREE.Vector3();
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();

  skinnedMeshes.forEach((m) => {
    m.updateMatrixWorld(true);
    const g = m.geometry;
    const pos = g.attributes.position;
    const si = g.attributes.skinIndex.array;
    const sw = g.attributes.skinWeight.array;
    const n = pos.count;
    const out = new Float32Array(n * 3);

    const A = new THREE.Matrix4().multiplyMatrices(m.matrixWorld, m.bindMatrixInverse);
    const T = m.skeleton.bones.map((b, i) =>
      new THREE.Matrix4()
        .multiplyMatrices(A, b.matrixWorld)
        .multiply(m.skeleton.boneInverses[i])
        .multiply(m.bindMatrix)
    );

    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i);
      q.set(0, 0, 0);
      let ws = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw[i * 4 + k];
        const boneIdx = Math.round(si[i * 4 + k]);
        if (w > 0 && T[boneIdx]) {
          q.addScaledVector(t.copy(p).applyMatrix4(T[boneIdx]), w);
          ws += w;
        }
      }
      if (ws < 1e-6) q.copy(p).applyMatrix4(m.matrixWorld);
      else if (Math.abs(ws - 1) > 1e-3) q.divideScalar(ws);

      out[i * 3] = q.x;
      out[i * 3 + 1] = q.y;
      out[i * 3 + 2] = q.z;
    }
    m.userData.wp = out;
  });
}
