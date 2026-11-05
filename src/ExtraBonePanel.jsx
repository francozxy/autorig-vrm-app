import React, { useState, useEffect } from 'react';
import * as THREE from 'three';

export default function ExtraBonePanel({
  currentModel,
  bonesMap,
  onSelectBone,
  transformControls,
  onUpdateOverlays,
  onClose,
  visible = true
}) {
  const [createdBones, setCreatedBones] = useState([]);
  const [lastHairBoneName, setLastHairBoneName] = useState(null);

  // 1. RECUPERAR HUESOS EXISTENTES AL ABRIR EL PANEL (Evita que se reinicie al ocultar)
  useEffect(() => {
    if (!bonesMap) return;

    const detected = [];
    let highestHairLink = null;
    let highestNum = 0;

    Object.keys(bonesMap).forEach((name) => {
      if (name.startsWith('Hair_') || name.startsWith('Bust_') || name.startsWith('Extra_')) {
        detected.push(name);

        if (name.startsWith('Hair_Link_') || name.startsWith('Hair_Strand_')) {
          const num = parseInt(name.split('_').pop(), 10);
          if (!isNaN(num) && num > highestNum) {
            highestNum = num;
            highestHairLink = name;
          }
        }
      }
    });

    setCreatedBones(detected);
    if (highestHairLink) {
      setLastHairBoneName(highestHairLink);
    }
  }, [bonesMap, visible]);

  const getBaseParent = (type) => {
    if (!bonesMap) return null;
    if (type === 'bust') {
      return (
        bonesMap['upperChest'] ||
        bonesMap['chest'] ||
        bonesMap['J_Bip_C_UpperChest'] ||
        bonesMap['J_Bip_C_Chest'] ||
        null
      );
    }
    if (type === 'hair') {
      return bonesMap['head'] || bonesMap['J_Bip_C_Head'] || null;
    }
    return bonesMap['hips'] || null;
  };

  // 2. BUSCADOR INTELIGENTE DE ÍNDICE LIBRE
  const getNextHairName = () => {
    let index = 1;
    while (
      bonesMap &&
      (bonesMap[`Hair_Link_${index}`] || bonesMap[`Hair_Strand_${index}`])
    ) {
      index++;
    }
    return `Hair_Link_${index}`;
  };

  // 3. AGREGAR ESLABÓN DE CABELLO
  const handleAddHairLink = () => {
    if (!currentModel) {
      alert('Primero carga un modelo VRM.');
      return;
    }

    const headBone = getBaseParent('hair');
    if (!headBone) {
      alert('No se encontró el hueso de la cabeza (head).');
      return;
    }

    const newBoneName = getNextHairName();

    const parentBone =
      lastHairBoneName && bonesMap[lastHairBoneName]
        ? bonesMap[lastHairBoneName]
        : headBone;

    const newBone = new THREE.Bone();
    newBone.name = newBoneName;
    newBone.userData = { isSpringBone: true, springGroup: 'hair' };

    if (parentBone === headBone) {
      newBone.position.set(0, 0.05, -0.06);
    } else {
      newBone.position.set(0, -0.07, 0);
    }

    parentBone.add(newBone);
    newBone.updateMatrixWorld(true);

    bonesMap[newBoneName] = newBone;
    setCreatedBones((prev) => [...new Set([...prev, newBoneName])]);
    setLastHairBoneName(newBoneName);

    if (onSelectBone) onSelectBone(newBoneName);
    if (transformControls) {
      transformControls.setMode('translate');
      transformControls.attach(newBone);
    }

    if (onUpdateOverlays) onUpdateOverlays();
  };

  // 4. AGREGAR HUESO DE BUSTO
  const handleAddBustBone = (side = 'L') => {
    if (!currentModel) {
      alert('Primero carga un modelo VRM.');
      return;
    }

    const chestBone = getBaseParent('bust');
    if (!chestBone) {
      alert('No se encontró el hueso del pecho (chest / upperChest).');
      return;
    }

    const boneName = `Bust_${side}`;
    if (bonesMap[boneName]) {
      alert(`El hueso ${boneName} ya existe en el modelo.`);
      return;
    }

    const newBone = new THREE.Bone();
    newBone.name = boneName;
    newBone.userData = { isSpringBone: true, springGroup: 'bust' };
    newBone.position.set(side === 'L' ? 0.065 : -0.065, -0.04, 0.08);

    chestBone.add(newBone);
    newBone.updateMatrixWorld(true);

    bonesMap[boneName] = newBone;
    setCreatedBones((prev) => [...new Set([...prev, boneName])]);

    if (onSelectBone) onSelectBone(boneName);
    if (transformControls) {
      transformControls.setMode('translate');
      transformControls.attach(newBone);
    }

    if (onUpdateOverlays) onUpdateOverlays();
  };

  const handleStartNewStrand = () => {
    setLastHairBoneName(null);
    alert('Próximo eslabón nacerá desde la cabeza (nuevo mechón separado).');
  };

  // 5. RE-BIND PRESERVANDO ÍNDICES Y MALLAS
  const handleRebindWithExtras = () => {
    if (!currentModel || !bonesMap) return;

    const meshes = [];
    currentModel.traverse((node) => {
      if (node.isSkinnedMesh && node.skeleton) meshes.push(node);
    });

    if (!meshes.length) {
      alert('No se encontraron mallas con esqueleto para vincular.');
      return;
    }

    const baseSkeleton = meshes[0].skeleton;
    const existingBones = [...baseSkeleton.bones];

    createdBones.forEach((bName) => {
      const bObj = bonesMap[bName];
      if (bObj && !existingBones.includes(bObj)) {
        existingBones.push(bObj);
      }
    });

    const expandedSkeleton = new THREE.Skeleton(existingBones);
    expandedSkeleton.calculateInverses();

    meshes.forEach((mesh) => {
      mesh.updateMatrixWorld(true);

      const posAttr = mesh.geometry.attributes.position;
      const siAttr = mesh.geometry.attributes.skinIndex;
      const swAttr = mesh.geometry.attributes.skinWeight;
      const count = posAttr.count;

      const vertPos = new THREE.Vector3();
      const boneWorldPos = existingBones.map((b) => {
        const v = new THREE.Vector3();
        b.getWorldPosition(v);
        return v;
      });

      const extraIndices = createdBones.map((name) =>
        existingBones.findIndex((b) => b.name === name)
      );

      for (let i = 0; i < count; i++) {
        vertPos.fromBufferAttribute(posAttr, i);
        vertPos.applyMatrix4(mesh.matrixWorld);

        extraIndices.forEach((bIdx) => {
          if (bIdx === -1) return;
          const bName = existingBones[bIdx].name;
          const bPos = boneWorldPos[bIdx];
          const dist = vertPos.distanceTo(bPos);

          if (bName.startsWith('Bust_') && dist < 0.085 && vertPos.z > bPos.z - 0.02) {
            const currentBone0 = existingBones[siAttr.getX(i)]?.name || '';
            const isArmOrHand =
              currentBone0.includes('Hand') ||
              currentBone0.includes('Arm') ||
              currentBone0.includes('finger') ||
              currentBone0.includes('Thumb');

            if (!isArmOrHand) {
              const weightStrength = Math.pow(1.0 - dist / 0.085, 2) * 0.55;
              siAttr.setComponent(i, 3, bIdx);
              swAttr.setComponent(i, 3, weightStrength);
            }
          }

          if (bName.startsWith('Hair_') && dist < 0.11) {
            const weightStrength = Math.pow(1.0 - dist / 0.11, 2) * 0.65;
            siAttr.setComponent(i, 3, bIdx);
            swAttr.setComponent(i, 3, weightStrength);
          }
        });

        const w0 = swAttr.getX(i);
        const w1 = swAttr.getY(i);
        const w2 = swAttr.getZ(i);
        const w3 = swAttr.getW(i);
        const sum = w0 + w1 + w2 + w3 || 1.0;
        swAttr.setXYZW(i, w0 / sum, w1 / sum, w2 / sum, w3 / sum);
      }

      siAttr.needsUpdate = true;
      swAttr.needsUpdate = true;

      mesh.bind(expandedSkeleton, mesh.matrixWorld);
    });

    if (onUpdateOverlays) onUpdateOverlays();
    alert(`🔗 Re-Bind completado con ${createdBones.length} huesos agregados.`);
  };

  return (
    <div
      style={{
        display: visible ? 'block' : 'none',
        position: 'absolute',
        top: 60,
        right: 12,
        width: 300,
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid #ec4899',
        borderRadius: 12,
        padding: 12,
        zIndex: 200,
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        color: '#f8fafc',
        fontSize: 11
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid #334155', paddingBottom: 6 }}>
        <span style={{ fontWeight: 'bold', color: '#f472b6' }}>✨ Huesos Extras (Cadena Pelo / Busto)</span>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 15 }}>
          ✖
        </button>
      </div>

      {/* SECCIÓN CABELLO */}
      <div style={{ marginBottom: 10, background: '#1e293b', padding: 8, borderRadius: 8, border: '1px solid #475569' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ color: '#cbd5e1', fontWeight: 'bold' }}>💇 Cadena de Cabello:</span>
          {lastHairBoneName && (
            <span style={{ color: '#38bdf8', fontSize: 10 }}>Conectando a: {lastHairBoneName}</span>
          )}
        </div>

        <button
          onClick={handleAddHairLink}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px',
            fontWeight: 'bold',
            cursor: 'pointer',
            marginBottom: 6
          }}
        >
          {lastHairBoneName ? `+ Continuar Cadena (${lastHairBoneName})` : '+ Crear Inicio de Mechón (Head)'}
        </button>

        {lastHairBoneName && (
          <button
            onClick={handleStartNewStrand}
            style={{
              width: '100%',
              background: '#334155',
              color: '#94a3b8',
              border: 'none',
              borderRadius: 4,
              padding: '4px',
              cursor: 'pointer',
              fontSize: 10
            }}
          >
            ✂️ Cortar y empezar otro mechón separado
          </button>
        )}
      </div>

      {/* SECCIÓN BUSTO */}
      <div style={{ marginBottom: 10, background: '#1e293b', padding: 8, borderRadius: 8, border: '1px solid #475569' }}>
        <span style={{ color: '#cbd5e1', fontWeight: 'bold', display: 'block', marginBottom: 6 }}>
          🎀 Huesos de Busto:
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => handleAddBustBone('L')}
            style={{
              flex: 1,
              background: '#db2777',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            + Busto Izq (L)
          </button>
          <button
            onClick={() => handleAddBustBone('R')}
            style={{
              flex: 1,
              background: '#db2777',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            + Busto Der (R)
          </button>
        </div>
      </div>

      {/* LISTA DE HUESOS (Persiste aunque cierres el panel) */}
      {createdBones.length > 0 && (
        <div style={{ marginBottom: 8, maxHeight: 110, overflowY: 'auto', background: '#0f172a', padding: 6, borderRadius: 6, border: '1px solid #334155' }}>
          <span style={{ color: '#94a3b8', fontSize: 10, display: 'block', marginBottom: 4 }}>
            Huesos creados ({createdBones.length}):
          </span>
          {createdBones.map((bName) => (
            <div
              key={bName}
              onClick={() => {
                if (onSelectBone) onSelectBone(bName);
                if (transformControls && bonesMap[bName]) {
                  transformControls.attach(bonesMap[bName]);
                }
              }}
              style={{
                color: bName.startsWith('Hair') ? '#c084fc' : '#f472b6',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 4,
                marginBottom: 2,
                background: '#1e293b',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>🦴 {bName}</span>
              <span style={{ color: '#38bdf8', fontSize: 9 }}>Mover ↕️</span>
            </div>
          ))}
        </div>
      )}

      {/* BOTÓN RE-BIND */}
      <button
        onClick={handleRebindWithExtras}
        disabled={createdBones.length === 0}
        style={{
          width: '100%',
          background: createdBones.length > 0 ? 'linear-gradient(135deg, #10b981, #059669)' : '#334155',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '8px',
          fontWeight: 'bold',
          cursor: createdBones.length > 0 ? 'pointer' : 'not-allowed',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          opacity: createdBones.length > 0 ? 1 : 0.4
        }}
      >
        🔗 Re-Bind Seguro ({createdBones.length} huesos)
      </button>
    </div>
  );
}
