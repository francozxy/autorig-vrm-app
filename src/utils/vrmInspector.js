import * as THREE from 'three';

export function analyzeVRMModel(gltf) {
  const root = gltf.scene || gltf.scenes[0];
  const parser = gltf.parser;
  const json = parser?.json || {};

  // 1. Dimensiones y Altura real
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);

  // 2. Extracción de Huesos y sus coordenadas espaciales
  const bonesFound = [];
  const bonesTransforms = {};
  const tempWorldPos = new THREE.Vector3();

  root.traverse((node) => {
    if (node.isBone) {
      bonesFound.push(node.name);
      node.getWorldPosition(tempWorldPos);

      bonesTransforms[node.name] = {
        local: {
          x: Number(node.position.x.toFixed(4)),
          y: Number(node.position.y.toFixed(4)),
          z: Number(node.position.z.toFixed(4))
        },
        world: {
          x: Number(tempWorldPos.x.toFixed(4)),
          y: Number(tempWorldPos.y.toFixed(4)),
          z: Number(tempWorldPos.z.toFixed(4))
        },
        rotation: {
          x: Number(node.rotation.x.toFixed(4)),
          y: Number(node.rotation.y.toFixed(4)),
          z: Number(node.rotation.z.toFixed(4))
        }
      };
    }
  });

  // Metadatos VRM (VRM0 o VRM1)
  const vrm0Data = json.extensions?.VRM;
  const vrm1Data = json.extensions?.VRMC_vrm;
  const isVRM = Boolean(vrm0Data || vrm1Data);

  // 3. Mapeo de Huesos Humanoides
  let humanoidBones = {};
  if (vrm0Data?.humanoid?.humanBones) {
    vrm0Data.humanoid.humanBones.forEach((b) => {
      humanoidBones[b.bone] = json.nodes?.[b.node]?.name || `Node_${b.node}`;
    });
  } else if (vrm1Data?.humanoid?.humanBones) {
    Object.entries(vrm1Data.humanoid.humanBones).forEach(([vrmBone, data]) => {
      humanoidBones[vrmBone] = json.nodes?.[data.node]?.name || `Node_${data.node}`;
    });
  } else {
    bonesFound.forEach((bName) => {
      humanoidBones[bName] = bName;
    });
  }

  // 4. Materiales
  const materialsReport = [];
  const uniqueMats = new Set();

  root.traverse((node) => {
    if (node.isMesh && node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => {
        if (!uniqueMats.has(m.uuid)) {
          uniqueMats.add(m.uuid);

          let hexColor = '#FFFFFF';
          if (m.color) hexColor = '#' + m.color.getHexString();

          materialsReport.push({
            name: m.name || 'Sin Nombre',
            type: m.type,
            color: hexColor,
            hasTexture: Boolean(m.map),
            transparent: Boolean(m.transparent || m.alphaTest > 0)
          });
        }
      });
    }
  });

  // 5. Físicas
  let physicsReport = {
    hasPhysics: false,
    springBoneChains: 0,
    colliderCount: 0
  };

  if (vrm0Data?.secondaryAnimation) {
    const sec = vrm0Data.secondaryAnimation;
    physicsReport.hasPhysics = true;
    physicsReport.springBoneChains = sec.boneGroups?.length || 0;
    physicsReport.colliderCount = sec.colliderGroups?.length || 0;
  } else if (json.extensions?.VRMC_springBone) {
    const sp = json.extensions.VRMC_springBone;
    physicsReport.hasPhysics = true;
    physicsReport.springBoneChains = sp.springs?.length || 0;
    physicsReport.colliderCount = sp.colliders?.length || 0;
  }

  return {
    isVRM,
    vrmVersion: vrm1Data ? 'VRM 1.0' : vrm0Data ? 'VRM 0.0' : 'GLB Estándar',
    dimensions: {
      height: Number(size.y.toFixed(3)),
      width: Number(size.x.toFixed(3)),
      depth: Number(size.z.toFixed(3))
    },
    totalBonesCount: bonesFound.length,
    humanoidBones,
    bonesTransforms, // Diccionario completo de coordenadas
    materials: materialsReport,
    physics: physicsReport
  };
}
