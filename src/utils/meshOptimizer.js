import * as THREE from 'three';

export function compactIndexedGeometry(geo) {
  if (!geo.index) return geo;

  const indexArr = geo.index.array;
  const posAttr = geo.attributes.position;
  const uvAttr = geo.attributes.uv;
  const normAttr = geo.attributes.normal;

  const oldToNew = new Map();
  const newPos = [];
  const newUv = [];
  const newNorm = [];
  const newIndices = [];

  for (let i = 0; i < indexArr.length; i++) {
    const oldIdx = indexArr[i];
    if (!oldToNew.has(oldIdx)) {
      const newIdx = oldToNew.size;
      oldToNew.set(oldIdx, newIdx);

      newPos.push(posAttr.getX(oldIdx), posAttr.getY(oldIdx), posAttr.getZ(oldIdx));

      if (uvAttr) newUv.push(uvAttr.getX(oldIdx), uvAttr.getY(oldIdx));
      if (normAttr) newNorm.push(normAttr.getX(oldIdx), normAttr.getY(oldIdx), normAttr.getZ(oldIdx));
    }
    newIndices.push(oldToNew.get(oldIdx));
  }

  const cleanGeo = new THREE.BufferGeometry();
  cleanGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));

  if (newUv.length > 0) cleanGeo.setAttribute('uv', new THREE.Float32BufferAttribute(newUv, 2));
  if (newNorm.length > 0) cleanGeo.setAttribute('normal', new THREE.Float32BufferAttribute(newNorm, 3));
  else cleanGeo.computeVertexNormals();

  const IndexArrayType = newPos.length / 3 > 65535 ? Uint32Array : Uint16Array;
  cleanGeo.setIndex(new THREE.BufferAttribute(new IndexArrayType(newIndices), 1));

  return cleanGeo;
}
