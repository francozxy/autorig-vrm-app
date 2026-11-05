import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { heatAt, updateHeat, setW, computeWP } from './utils/weightPainter';

export default function ManualRigPanel({
  currentModel,
  bonesMap,
  selectedBoneName,
  onSelectBone,
  transformControls,
  onUpdateOverlays,
  onClose,
  visible = true
}) {
  const [paintMode, setPaintMode] = useState('inspect');
  const [brushSize, setBrushSize] = useState(8);
  const [brushStrength, setBrushStrength] = useState(50);
  const [undoCount, setUndoCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [headScaleFactor, setHeadScaleFactor] = useState(1.0);

  const origMaterialsMapRef = useRef(new Map());
  const initialWeightsMapRef = useRef(new Map());
  const initialBoneTransformsRef = useRef(new Map());
  const disconnectedSkeletonsRef = useRef(new Map());
  const undoStackRef = useRef([]);

  const cursorMeshRef = useRef(null);
  const isPaintingRef = useRef(false);
  const touchTimerRef = useRef(null);
  const pointerSetRef = useRef(new Set());
  const lastPointerEventRef = useRef(null);

  const paintModeRef = useRef(paintMode);
  const brushSizeRef = useRef(brushSize);
  const brushStrengthRef = useRef(brushStrength);
  const selectedBoneNameRef = useRef(selectedBoneName);

  useEffect(() => { paintModeRef.current = paintMode; }, [paintMode]);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
  useEffect(() => { brushStrengthRef.current = brushStrength; }, [brushStrength]);
  useEffect(() => { selectedBoneNameRef.current = selectedBoneName; }, [selectedBoneName]);

  const heatMaterialRef = useRef(
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
  );

  const getSkinnedMeshes = () => {
    const list = [];
    if (currentModel) {
      currentModel.traverse((node) => {
        if (node.isSkinnedMesh) list.push(node);
      });
    }
    return list;
  };

  const getSceneContext = () => {
    let scene = null;
    let camera = null;
    if (currentModel) {
      currentModel.traverseAncestors((p) => {
        if (p.type === 'Scene') scene = p;
      });
    }
    if (transformControls && transformControls.camera) {
      camera = transformControls.camera;
    }
    return { scene, camera };
  };

  const pushUndoSnapshot = () => {
    const meshes = getSkinnedMeshes();
    if (!meshes.length) return;

    const snapshot = meshes.map((m) => ({
      uuid: m.uuid,
      skinIndex: m.geometry.attributes.skinIndex.array.slice(),
      skinWeight: m.geometry.attributes.skinWeight.array.slice(),
      position: m.geometry.attributes.position.array.slice()
    }));

    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > 25) undoStackRef.current.shift();
    setUndoCount(undoStackRef.current.length);
  };

  const handleUndo = () => {
    if (!undoStackRef.current.length) return;
    const prev = undoStackRef.current.pop();
    setUndoCount(undoStackRef.current.length);

    const meshes = getSkinnedMeshes();
    meshes.forEach((m) => {
      const saved = prev.find((s) => s.uuid === m.uuid);
      if (saved) {
        const p = m.geometry.attributes.position;
        const si = m.geometry.attributes.skinIndex;
        const sw = m.geometry.attributes.skinWeight;
        if (saved.position) p.array.set(saved.position);
        si.array.set(saved.skinIndex);
        sw.array.set(saved.skinWeight);
        p.needsUpdate = true;
        si.needsUpdate = true;
        sw.needsUpdate = true;

        const skel = m.skeleton || disconnectedSkeletonsRef.current.get(m.uuid);
        if (selectedBoneNameRef.current && skel && skel.bones) {
          const bIdx = skel.bones.findIndex((b) => b.name === selectedBoneNameRef.current);
          if (bIdx !== -1) updateHeat(m, bIdx);
        }
      }
    });

    if (onUpdateOverlays) onUpdateOverlays();
  };

  // ESCALADO DE CABEZA DIRECTO EN VERTICES (SIN AFECTAR EL HUESO)
  const applyHeadScale = (scaleMultiplier) => {
    const meshes = getSkinnedMeshes();
    const headBone = bonesMap?.head || bonesMap?.J_Bip_C_Head;

    if (!meshes.length || !headBone) {
      alert('No se encontró el hueso de la cabeza (head).');
      return;
    }

    pushUndoSnapshot();

    const headWorldPos = new THREE.Vector3();
    headBone.getWorldPosition(headWorldPos);

    const vertWorldPos = new THREE.Vector3();
    const tempDir = new THREE.Vector3();

    meshes.forEach((mesh) => {
      if (!mesh.geometry) return;

      mesh.updateMatrixWorld(true);
      const posAttr = mesh.geometry.attributes.position;
      const siAttr = mesh.geometry.attributes.skinIndex;
      const swAttr = mesh.geometry.attributes.skinWeight;
      const skel = mesh.skeleton || disconnectedSkeletonsRef.current.get(mesh.uuid);
      if (!skel) return;

      const headIdx = skel.bones.indexOf(headBone);
      if (headIdx === -1) return;

      const count = posAttr.count;

      for (let i = 0; i < count; i++) {
        let headWeight = 0;
        for (let j = 0; j < 4; j++) {
          if (siAttr.getComponent(i, j) === headIdx) {
            headWeight = swAttr.getComponent(i, j);
            break;
          }
        }

        if (headWeight > 0.1) {
          vertWorldPos.fromBufferAttribute(posAttr, i);
          vertWorldPos.applyMatrix4(mesh.matrixWorld);

          tempDir.subVectors(vertWorldPos, headWorldPos);
          const effectiveScale = 1.0 + (scaleMultiplier - 1.0) * headWeight;
          tempDir.multiplyScalar(effectiveScale);
          vertWorldPos.copy(headWorldPos).add(tempDir);

          mesh.worldToLocal(vertWorldPos);
          posAttr.setXYZ(i, vertWorldPos.x, vertWorldPos.y, vertWorldPos.z);
        }
      }

      posAttr.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
    });

    computeWP(meshes);
    if (onUpdateOverlays) onUpdateOverlays();
    alert(`✅ Escala de cabeza ajustada a ${(scaleMultiplier * 100).toFixed(0)}% sin alterar los huesos.`);
  };

  // 1. Alternar Modo Edición para desacoplar esqueleto
  const toggleEditMode = () => {
    const meshes = getSkinnedMeshes();
    if (!meshes.length) return;

    if (!isEditMode) {
      meshes.forEach((m) => {
        if (m.skeleton) {
          disconnectedSkeletonsRef.current.set(m.uuid, m.skeleton);
          m.skeleton = null;
        }
      });
      setIsEditMode(true);
      setIsLocked(false);
    } else {
      meshes.forEach((m) => {
        const skel = disconnectedSkeletonsRef.current.get(m.uuid);
        if (skel) m.skeleton = skel;
      });
      setIsEditMode(false);
    }
  };

  // 2. Fijar nuevos puntos de articulación sin revertir piel
  const handleApplyNewBonePositions = () => {
    const meshes = getSkinnedMeshes();
    if (!meshes.length) return;

    pushUndoSnapshot();

    meshes.forEach((mesh) => {
      const skel = mesh.skeleton || disconnectedSkeletonsRef.current.get(mesh.uuid);
      if (!skel) return;

      mesh.skeleton = skel;

      mesh.skeleton.bones.forEach((bone) => {
        bone.updateMatrixWorld(true);
      });

      mesh.skeleton.calculateInverses();
      mesh.bind(mesh.skeleton, mesh.matrixWorld);

      const sw = mesh.geometry.attributes.skinWeight;
      if (sw) {
        const count = sw.count;
        for (let i = 0; i < count; i++) {
          const w0 = sw.getX(i);
          const w1 = sw.getY(i);
          const w2 = sw.getZ(i);
          const w3 = sw.getW(i);
          const sum = w0 + w1 + w2 + w3;
          if (sum > 0.00001) {
            sw.setXYZW(i, w0 / sum, w1 / sum, w2 / sum, w3 / sum);
          } else {
            sw.setXYZW(i, 1.0, 0, 0, 0);
          }
        }
        sw.needsUpdate = true;
      }
    });

    setIsEditMode(false);
    computeWP(meshes);
    if (onUpdateOverlays) onUpdateOverlays();
    alert('🔒 ¡Huesos fijados con éxito! Poses y matrices actualizadas.');
  };

  // 3. HORNEADO DE POSE T MANTENIENDO LOS HUESOS ALINEADOS (SIN QUE SE CAIGAN)
  const handleBakeCurrentPoseToMesh = () => {
    const meshes = getSkinnedMeshes();
    if (!meshes.length || !bonesMap) {
      alert('No hay mallas o esqueleto activo para hornear.');
      return;
    }

    pushUndoSnapshot();

    const tempVertex = new THREE.Vector3();
    const skinnedVertex = new THREE.Vector3();
    const boneMatrix = new THREE.Matrix4();

    meshes.forEach((mesh) => {
      const skel = mesh.skeleton || disconnectedSkeletonsRef.current.get(mesh.uuid);
      if (!mesh.geometry || !skel) return;

      mesh.skeleton = skel;
      mesh.updateMatrixWorld(true);
      mesh.skeleton.update();

      const geometry = mesh.geometry;
      const posAttr = geometry.attributes.position;
      const siAttr = geometry.attributes.skinIndex;
      const swAttr = geometry.attributes.skinWeight;
      const bones = mesh.skeleton.bones;
      const boneInverses = mesh.skeleton.boneInverses;
      const count = posAttr.count;

      // 1. Hornear las coordenadas de los vértices en su postura actual
      for (let i = 0; i < count; i++) {
        tempVertex.fromBufferAttribute(posAttr, i);
        skinnedVertex.set(0, 0, 0);

        for (let j = 0; j < 4; j++) {
          const weight = swAttr.getComponent(i, j);
          if (weight > 0.0001) {
            const boneIndex = siAttr.getComponent(i, j);
            boneMatrix.multiplyMatrices(bones[boneIndex].matrixWorld, boneInverses[boneIndex]);
            const temp = tempVertex.clone().applyMatrix4(boneMatrix);
            skinnedVertex.add(temp.multiplyScalar(weight));
          }
        }

        mesh.worldToLocal(skinnedVertex);
        posAttr.setXYZ(i, skinnedVertex.x, skinnedVertex.y, skinnedVertex.z);
      }

      posAttr.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      // 2. Conservar la posición de los huesos (NO hacer bone.rotation.set(0,0,0))
      bones.forEach((bone) => {
        bone.updateMatrixWorld(true);
      });

      // 3. Fijar la postura actual de los huesos como nueva base de reposo estática
      mesh.skeleton.calculateInverses();
      mesh.bind(mesh.skeleton, mesh.matrixWorld);
    });

    computeWP(meshes);
    if (onUpdateOverlays) onUpdateOverlays();
    alert('🔥 ¡Pose T horneada! La malla y los huesos quedaron fijados y alineados.');
  };

  // Cursor 3D
  useEffect(() => {
    const { scene } = getSceneContext();
    if (scene && !cursorMeshRef.current) {
      const cursorGeo = new THREE.SphereGeometry(1, 16, 12);
      const cursorMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.6,
        depthTest: false
      });
      const cursor = new THREE.Mesh(cursorGeo, cursorMat);
      cursor.visible = false;
      cursor.renderOrder = 2000;
      scene.add(cursor);
      cursorMeshRef.current = cursor;
    }

    if (bonesMap) {
      Object.keys(bonesMap).forEach((name) => {
        const bone = bonesMap[name];
        if (bone && !initialBoneTransformsRef.current.has(name)) {
          initialBoneTransformsRef.current.set(name, {
            pos: bone.position.clone(),
            rot: bone.rotation.clone()
          });
        }
      });
    }

    return () => {
      if (cursorMeshRef.current && cursorMeshRef.current.parent) {
        cursorMeshRef.current.parent.remove(cursorMeshRef.current);
        cursorMeshRef.current = null;
      }
    };
  }, [currentModel]);

  useEffect(() => {
    if (cursorMeshRef.current) {
      cursorMeshRef.current.scale.setScalar(brushSize / 100);
    }
  }, [brushSize]);

  // Materiales térmicos
  useEffect(() => {
    const meshes = getSkinnedMeshes();
    if (!meshes.length) return;

    meshes.forEach((m) => {
      if (!origMaterialsMapRef.current.has(m.uuid)) {
        origMaterialsMapRef.current.set(m.uuid, m.material);
      }
      if (!initialWeightsMapRef.current.has(m.uuid)) {
        initialWeightsMapRef.current.set(m.uuid, {
          skinIndex: m.geometry.attributes.skinIndex.array.slice(),
          skinWeight: m.geometry.attributes.skinWeight.array.slice()
        });
      }
    });

    if (selectedBoneName && !isEditMode) {
      meshes.forEach((m) => {
        m.material = heatMaterialRef.current;
        const skel = m.skeleton || disconnectedSkeletonsRef.current.get(m.uuid);
        if (skel && skel.bones) {
          const boneIndex = skel.bones.findIndex((b) => b.name === selectedBoneName);
          if (boneIndex !== -1) {
            updateHeat(m, boneIndex);
          }
        }
      });
      computeWP(meshes);
    }

    return () => {
      meshes.forEach((m) => {
        if (origMaterialsMapRef.current.has(m.uuid)) {
          m.material = origMaterialsMapRef.current.get(m.uuid);
        }
        if (m.geometry && m.geometry.attributes.color) {
          m.geometry.deleteAttribute('color');
        }
        const skel = disconnectedSkeletonsRef.current.get(m.uuid);
        if (skel) m.skeleton = skel;
      });
      if (cursorMeshRef.current) cursorMeshRef.current.visible = false;
    };
  }, [selectedBoneName, currentModel, isEditMode]);

  // Gizmo
  useEffect(() => {
    if (transformControls) {
      if (isLocked || (paintMode !== 'inspect' && !isEditMode)) {
        transformControls.detach();
      } else if (selectedBoneName && bonesMap && bonesMap[selectedBoneName]) {
        transformControls.attach(bonesMap[selectedBoneName]);
      }
    }
  }, [isLocked, paintMode, selectedBoneName, bonesMap, transformControls, isEditMode]);

  // Pintado
  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const paintAt = (e) => {
      if (isEditMode) return;
      const meshes = getSkinnedMeshes().filter((m) => m.userData && m.userData.wp && m.visible);
      if (!meshes.length) return;

      const { camera } = getSceneContext();
      if (!camera) return;

      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;

      camera.updateMatrixWorld();
      const vp = new THREE.Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      ).elements;

      const tol = 16;
      let best = null;
      let bestD = Infinity;

      meshes.forEach((m) => {
        const wp = m.userData.wp;
        const n = wp.length / 3;
        for (let i = 0; i < n; i++) {
          const x = wp[i * 3];
          const y = wp[i * 3 + 1];
          const z = wp[i * 3 + 2];
          const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
          if (cw <= 0 || cw >= bestD) continue;
          const sx = ((vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / cw * 0.5 + 0.5) * r.width;
          if (Math.abs(sx - px) > tol) continue;
          const sy = (0.5 - (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / cw * 0.5) * r.height;
          if (Math.abs(sy - py) > tol) continue;
          bestD = cw;
          best = [x, y, z];
        }
      });

      const cursor = cursorMeshRef.current;
      if (!best) {
        if (cursor) cursor.visible = false;
        return;
      }

      const R = +brushSizeRef.current / 100;
      const k = (+brushStrengthRef.current / 100) * 0.45;

      if (cursor) {
        cursor.position.set(best[0], best[1], best[2]);
        cursor.scale.setScalar(R);
        cursor.visible = true;
      }

      if (!isPaintingRef.current) return;

      const targetBoneName = selectedBoneNameRef.current;
      if (!targetBoneName) return;

      const erase = paintModeRef.current === 'erase';
      const cx = camera.position.x;
      const cy = camera.position.y;
      const cz = camera.position.z;
      const hd = Math.hypot(best[0] - cx, best[1] - cy, best[2] - cz);

      meshes.forEach((m) => {
        const skel = m.skeleton || disconnectedSkeletonsRef.current.get(m.uuid);
        if (!skel) return;
        const bone = skel.bones.find((b) => b.name === targetBoneName);
        if (!bone) return;
        const bi = skel.bones.indexOf(bone);
        if (bi < 0) return;
        const pi = bone.parent ? skel.bones.indexOf(bone.parent) : -1;

        const g = m.geometry;
        const wp = m.userData.wp;
        const n = wp.length / 3;
        const si = g.attributes.skinIndex;
        const sw = g.attributes.skinWeight;
        const col = g.attributes.color;

        for (let i = 0; i < n; i++) {
          const x = wp[i * 3];
          const y = wp[i * 3 + 1];
          const z = wp[i * 3 + 2];
          const dx = x - best[0];
          const dy = y - best[1];
          const dz = z - best[2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > R) continue;

          if (Math.hypot(x - cx, y - cy, z - cz) > hd + R * 0.5) continue;

          const f = (1 - d / R) * k;
          setW(si, sw, i, bi, erase ? -f : f, pi);
          if (col) heatAt(col, si, sw, i, bi);
        }
        si.needsUpdate = true;
        sw.needsUpdate = true;
        if (col) col.needsUpdate = true;
      });

      if (onUpdateOverlays) onUpdateOverlays();
    };

    const handlePointerDown = (e) => {
      if (isEditMode || paintModeRef.current === 'inspect') return;
      pointerSetRef.current.add(e.pointerId);

      if (pointerSetRef.current.size > 1) {
        isPaintingRef.current = false;
        clearTimeout(touchTimerRef.current);
        if (cursorMeshRef.current) cursorMeshRef.current.visible = false;
        return;
      }

      e.stopPropagation();
      pushUndoSnapshot();

      lastPointerEventRef.current = e;
      canvas.setPointerCapture(e.pointerId);

      touchTimerRef.current = setTimeout(() => {
        if (pointerSetRef.current.size === 1) {
          isPaintingRef.current = true;
          paintAt(lastPointerEventRef.current);
        }
      }, 40);
    };

    const handlePointerMove = (e) => {
      lastPointerEventRef.current = e;
      if (!isEditMode && paintModeRef.current !== 'inspect') {
        if (pointerSetRef.current.size === 1) {
          e.stopPropagation();
          paintAt(e);
        } else if (pointerSetRef.current.size > 1) {
          if (cursorMeshRef.current) cursorMeshRef.current.visible = false;
        }
      }
    };

    const handlePointerUp = (e) => {
      pointerSetRef.current.delete(e.pointerId);
      isPaintingRef.current = false;
      clearTimeout(touchTimerRef.current);
    };

    const handlePointerLeave = () => {
      if (cursorMeshRef.current) cursorMeshRef.current.visible = false;
    };

    canvas.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('pointermove', handlePointerMove, { capture: true });
    window.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('pointermove', handlePointerMove, { capture: true });
      window.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [currentModel, isEditMode]);

  return (
    <div
      style={{
        display: visible ? 'block' : 'none',
        position: 'absolute',
        top: 60,
        left: 12,
        width: 310,
        background: 'rgba(15, 23, 42, 0.95)',
        border: isEditMode ? '2px solid #f59e0b' : '1px solid #10b981',
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
        <span style={{ fontWeight: 'bold', color: isEditMode ? '#fbbf24' : '#34d399' }}>
          {isEditMode ? '🦴 MODO EDICIÓN HUESOS' : '🔥 Rig Manual & Pincel'}
        </span>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 15 }}
          title="Cerrar y volver a textura normal"
        >
          ✖
        </button>
      </div>

      {/* Indicador de hueso y Candado */}
      <div style={{ marginBottom: 8, background: '#1e293b', padding: '6px 8px', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
          <span style={{ color: '#94a3b8' }}>Hueso: </span>
          <strong style={{ color: selectedBoneName ? '#facc15' : '#ef4444' }}>
            {selectedBoneName || 'Ninguno'}
          </strong>
        </div>

        <button
          onClick={() => setIsLocked(!isLocked)}
          style={{
            background: isLocked ? '#ef4444' : '#10b981',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
          title={isLocked ? 'Hueso bloqueado' : 'Gizmo activado'}
        >
          {isLocked ? '🔒 Bloqueado' : '🔓 Gizmo ON'}
        </button>
      </div>

      {/* BOTONES PRINCIPALES: DESACOPLAR MALLA Y FIJAR BIND */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button
          onClick={toggleEditMode}
          style={{
            flex: 1,
            background: isEditMode ? '#d97706' : '#334155',
            color: '#fff',
            border: isEditMode ? '1px solid #fbbf24' : 'none',
            borderRadius: 6,
            padding: '8px 4px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
          title="Desconecta la malla: mueve los huesos libremente sin deformarla"
        >
          {isEditMode ? '🔓 Editando Huesos' : '🦴 Desacoplar Malla'}
        </button>

        <button
          onClick={handleApplyNewBonePositions}
          style={{
            flex: 1.2,
            background: 'linear-gradient(135deg, #059669, #047857)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px 4px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}
          title="Fija la nueva posición de los huesos a la malla permanentemente"
        >
          🔒 Fijar Huesos a Malla
        </button>
      </div>

      {/* CONTROL DE TAMAÑO DE CABEZA INDEPENDIENTE */}
      <div style={{ marginBottom: 8, padding: 6, background: '#1e293b', borderRadius: 8, border: '1px solid #475569' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: '#cbd5e1', fontWeight: 'bold' }}>👤 Tamaño Cabeza (Vértices):</span>
          <span style={{ color: '#38bdf8' }}>{(headScaleFactor * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min="0.7"
          max="1.3"
          step="0.02"
          value={headScaleFactor}
          onChange={(e) => setHeadScaleFactor(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#38bdf8' }}
        />
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          <button
            onClick={() => applyHeadScale(headScaleFactor)}
            style={{
              flex: 1,
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '5px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Ajustar Cabeza
          </button>
          <button
            onClick={() => {
              setHeadScaleFactor(1.0);
              applyHeadScale(1.0);
            }}
            style={{
              background: '#334155',
              color: '#94a3b8',
              border: 'none',
              borderRadius: 4,
              padding: '5px 8px',
              cursor: 'pointer'
            }}
          >
            100%
          </button>
        </div>
      </div>

      {/* BOTÓN HORNEADO CPU DE POSE T (Mantiene brazos y huesos en su sitio) */}
      <button
        onClick={handleBakeCurrentPoseToMesh}
        style={{
          width: '100%',
          background: 'linear-gradient(135deg, #0284c7, #0369a1)',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '8px',
          fontWeight: 'bold',
          marginBottom: 8,
          cursor: 'pointer'
        }}
        title="Hornea la pose T directamente en la geometría y alinea los huesos"
      >
        ❄️ Hornear Pose T Permanente
      </button>

      {/* Selector de modo Pincel / Ver */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button
          onClick={() => {
            setPaintMode('add');
            setIsLocked(true);
            if (isEditMode) toggleEditMode();
          }}
          style={{
            flex: 1,
            background: paintMode === 'add' && !isEditMode ? '#10b981' : '#1e293b',
            color: '#fff',
            border: '1px solid #334155',
            borderRadius: 6,
            padding: '6px 4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          🖌️ Pintar
        </button>
        <button
          onClick={() => {
            setPaintMode('erase');
            setIsLocked(true);
            if (isEditMode) toggleEditMode();
          }}
          style={{
            flex: 1,
            background: paintMode === 'erase' && !isEditMode ? '#ef4444' : '#1e293b',
            color: '#fff',
            border: '1px solid #334155',
            borderRadius: 6,
            padding: '6px 4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          🧹 Borrar
        </button>
        <button
          onClick={() => {
            setPaintMode('inspect');
            if (cursorMeshRef.current) cursorMeshRef.current.visible = false;
          }}
          style={{
            flex: 1,
            background: paintMode === 'inspect' ? '#0284c7' : '#1e293b',
            color: '#fff',
            border: '1px solid #334155',
            borderRadius: 6,
            padding: '6px 4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          👁️ Ver/Girar
        </button>
      </div>

      {/* Deshacer */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button
          onClick={handleUndo}
          disabled={undoCount === 0}
          style={{
            width: '100%',
            background: undoCount > 0 ? '#3b82f6' : '#1e293b',
            color: '#fff',
            border: '1px solid #475569',
            borderRadius: 6,
            padding: '6px 4px',
            cursor: undoCount > 0 ? 'pointer' : 'not-allowed',
            opacity: undoCount > 0 ? 1 : 0.4,
            fontWeight: 'bold'
          }}
        >
          ↩️ Deshacer ({undoCount})
        </button>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: '#94a3b8' }}>Radio Pincel (Cursor 3D):</span>
          <span style={{ color: '#38bdf8' }}>{brushSize}</span>
        </div>
        <input
          type="range"
          min="2"
          max="35"
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#10b981' }}
        />
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: '#94a3b8' }}>Fuerza:</span>
          <span style={{ color: '#38bdf8' }}>{brushStrength}%</span>
        </div>
        <input
          type="range"
          min="5"
          max="100"
          value={brushStrength}
          onChange={(e) => setBrushStrength(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#10b981' }}
        />
      </div>
    </div>
  );
}
