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
  const [paintMode, setPaintMode] = useState('inspect'); // 'add' | 'erase' | 'inspect'
  const [brushSize, setBrushSize] = useState(8);
  const [brushStrength, setBrushStrength] = useState(50);
  const [undoCount, setUndoCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false); // Desacopla la malla para mover huesos libres

  const origMaterialsMapRef = useRef(new Map());
  const initialWeightsMapRef = useRef(new Map());
  const initialBoneTransformsRef = useRef(new Map());
  const disconnectedSkeletonsRef = useRef(new Map()); // Guarda la referencia de esqueletos desconectados
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

  // 1. Alternar Modo Edición: Desconectar esqueleto de la piel para mover huesos sin deformar
  const toggleEditMode = () => {
    const meshes = getSkinnedMeshes();
    if (!meshes.length) return;

    if (!isEditMode) {
      // ENTRAR A MODO EDICIÓN: Desacopla temporalmente el skeleton
      meshes.forEach((m) => {
        if (m.skeleton) {
          disconnectedSkeletonsRef.current.set(m.uuid, m.skeleton);
          m.skeleton = null; // Al ser null, la malla NO reacciona a los movimientos de los huesos
        }
      });
      setIsEditMode(true);
      setIsLocked(false); // Habilita el gizmo
    } else {
      // SALIR DE MODO EDICIÓN SIN GUARDAR
      meshes.forEach((m) => {
        const skel = disconnectedSkeletonsRef.current.get(m.uuid);
        if (skel) {
          m.skeleton = skel;
        }
      });
      setIsEditMode(false);
    }
  };

  // 2. FIJAR NUEVA POSICIÓN DE HUESOS (NUEVO BIND SIN REVERTIR LA MALLA)
  const handleApplyNewBonePositions = () => {
    const meshes = getSkinnedMeshes();
    if (!meshes.length) return;

    pushUndoSnapshot();

    meshes.forEach((mesh) => {
      // Recuperar skeleton si estaba en modo edición
      let skel = mesh.skeleton || disconnectedSkeletonsRef.current.get(mesh.uuid);
      if (!skel) return;

      mesh.skeleton = skel;

      // Actualizar matrices mundiales de los huesos en su nueva posición
      mesh.skeleton.bones.forEach((bone) => {
        bone.updateMatrixWorld(true);
      });

      // Recalcular inverses para que la nueva posición sea el punto de reposo neutro (0 deformación)
      mesh.skeleton.calculateInverses();
      mesh.bind(mesh.skeleton, mesh.matrixWorld);

      // Normalizar pesos
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
    alert('🔒 ¡Huesos fijados con éxito! La nueva posición ya es parte de la malla sin deformarla.');
  };

  // Cursor 3D y respaldo de transformaciones iniciales
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

  // Manejo de materiales térmicos
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
        // Reconectar si quedó desconectado
        const skel = disconnectedSkeletonsRef.current.get(m.uuid);
        if (skel) m.skeleton = skel;
      });
      if (cursorMeshRef.current) cursorMeshRef.current.visible = false;
    };
  }, [selectedBoneName, currentModel, isEditMode]);

  // Conexión del gizmo según modo
  useEffect(() => {
    if (transformControls) {
      if (isLocked || (paintMode !== 'inspect' && !isEditMode)) {
        transformControls.detach();
      } else if (selectedBoneName && bonesMap && bonesMap[selectedBoneName]) {
        transformControls.attach(bonesMap[selectedBoneName]);
      }
    }
  }, [isLocked, paintMode, selectedBoneName, bonesMap, transformControls, isEditMode]);

  const pushUndoSnapshot = () => {
    const meshes = getSkinnedMeshes();
    if (!meshes.length) return;

    const snapshot = meshes.map((m) => ({
      uuid: m.uuid,
      skinIndex: m.geometry.attributes.skinIndex.array.slice(),
      skinWeight: m.geometry.attributes.skinWeight.array.slice()
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
        const si = m.geometry.attributes.skinIndex;
        const sw = m.geometry.attributes.skinWeight;
        si.array.set(saved.skinIndex);
        sw.array.set(saved.skinWeight);
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

  const handleResetEverything = () => {
    if (!window.confirm('¿Restablecer las posiciones de todos los huesos y los pesos originales?')) return;

    pushUndoSnapshot();

    if (bonesMap) {
      initialBoneTransformsRef.current.forEach((saved, name) => {
        const bone = bonesMap[name];
        if (bone) {
          bone.position.copy(saved.pos);
          bone.rotation.copy(saved.rot);
          bone.updateMatrixWorld(true);
        }
      });
    }

    const meshes = getSkinnedMeshes();
    meshes.forEach((m) => {
      const init = initialWeightsMapRef.current.get(m.uuid);
      if (init) {
        const si = m.geometry.attributes.skinIndex;
        const sw = m.geometry.attributes.skinWeight;
        si.array.set(init.skinIndex);
        sw.array.set(init.skinWeight);
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
    alert('✅ Modelo restablecido al estado original de carga.');
  };

  // Pintado táctil y con ratón
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
        width: 305,
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
          {isEditMode ? '🦴 MODO EDICIÓN HUESOS (Malla Libre)' : '🔥 Rig Manual & Pincel'}
        </span>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 15 }}
          title="Cerrar y volver a textura normal"
        >
          ✖
        </button>
      </div>

      {/* Indicador de hueso y Candado contra movimiento */}
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

      {/* Botones Deshacer y Restablecer */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button
          onClick={handleUndo}
          disabled={undoCount === 0}
          style={{
            flex: 1,
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
        <button
          onClick={handleResetEverything}
          style={{
            flex: 1,
            background: '#334155',
            color: '#f87171',
            border: '1px solid #ef4444',
            borderRadius: 6,
            padding: '6px 4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          🔄 Restablecer Todo
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

      <div style={{ fontSize: 9.5, color: '#94a3b8', background: '#0f172a', padding: 6, borderRadius: 6, border: '1px solid #334155', lineHeight: 1.4 }}>
        1. Toca <b>🦴 Desacoplar Malla</b>: ahora puedes mover cualquier hueso (brazos o dedos) sin que la piel se estire o deforme[span_4](start_span)[span_4](end_span)[span_5](start_span)[span_5](end_span).<br />
        2. Al terminar de calzarlos en la carne, presiona <b>🔒 Fijar Huesos a Malla</b> para hornear la nueva posición sin que se restablezca nada.
      </div>
    </div>
  );
}
