import React, { useState } from 'react';
import * as THREE from 'three';

export default function BoneCalibratorPanel({
  selectedBoneName,
  bonesMap,
  onUpdateOverlays,
  onClose
}) {
  const [stepDeg, setStepDeg] = useState(15);

  const getTargetBone = () => {
    if (!selectedBoneName || !bonesMap) return null;
    return bonesMap[selectedBoneName] || null;
  };

  const rotateBoneLocal = (axis, degrees) => {
    const bone = getTargetBone();
    if (!bone) {
      alert('Selecciona un hueso primero en la lista o tocando una esfera.');
      return;
    }

    const rad = THREE.MathUtils.degToRad(degrees);
    if (axis === 'x') bone.rotateX(rad);
    if (axis === 'y') bone.rotateY(rad);
    if (axis === 'z') bone.rotateZ(rad);

    bone.updateMatrixWorld(true);
    if (onUpdateOverlays) onUpdateOverlays();
  };

  const resetBoneRotation = () => {
    const bone = getTargetBone();
    if (!bone) return;
    bone.rotation.set(0, 0, 0);
    bone.updateMatrixWorld(true);
    if (onUpdateOverlays) onUpdateOverlays();
  };

  const quickFixArmTwist = (sign = 1) => {
    // Corrige el roll axial típico del antebrazo/brazo (eje Y o X según el rig)
    rotateBoneLocal('y', 90 * sign);
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        right: 12,
        width: 280,
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid #38bdf8',
        borderRadius: 12,
        padding: 12,
        zIndex: 200,
        boxShadow: '0 8px 30px rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        color: '#f8fafc',
        fontSize: 11
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid #334155', paddingBottom: 6 }}>
        <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>🦴 Calibrador de Hueso / Roll</span>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}
        >
          ✖
        </button>
      </div>

      <div style={{ marginBottom: 8, background: '#1e293b', padding: 6, borderRadius: 6 }}>
        <span style={{ color: '#94a3b8' }}>Hueso activo: </span>
        <strong style={{ color: selectedBoneName ? '#facc15' : '#ef4444' }}>
          {selectedBoneName || 'Ninguno (selecciona uno)'}
        </strong>
      </div>

      {/* Ajustes rápidos de Roll para Codos y Brazos */}
      <div style={{ marginBottom: 10 }}>
        <span style={{ color: '#cbd5e1', fontWeight: 'bold', display: 'block', marginBottom: 4 }}>
          ⚡ Corrección Rápida de Codo / Brazo:
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => quickFixArmTwist(1)}
            disabled={!selectedBoneName}
            style={{
              flex: 1,
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 2px',
              cursor: selectedBoneName ? 'pointer' : 'not-allowed',
              opacity: selectedBoneName ? 1 : 0.5
            }}
          >
            Girar Codo +90°
          </button>
          <button
            onClick={() => quickFixArmTwist(-1)}
            disabled={!selectedBoneName}
            style={{
              flex: 1,
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 2px',
              cursor: selectedBoneName ? 'pointer' : 'not-allowed',
              opacity: selectedBoneName ? 1 : 0.5
            }}
          >
            Girar Codo -90°
          </button>
          <button
            onClick={() => rotateBoneLocal('y', 180)}
            disabled={!selectedBoneName}
            style={{
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 6px',
              cursor: selectedBoneName ? 'pointer' : 'not-allowed',
              opacity: selectedBoneName ? 1 : 0.5
            }}
          >
            180°
          </button>
        </div>
      </div>

      {/* Rotación Eje por Eje */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: '#cbd5e1' }}>Paso de giro:</span>
          <select
            value={stepDeg}
            onChange={(e) => setStepDeg(Number(e.target.value))}
            style={{ background: '#1e293b', color: '#fff', border: '1px solid #475569', borderRadius: 4, padding: '2px 4px', fontSize: 10 }}
          >
            <option value={5}>5°</option>
            <option value={15}>15°</option>
            <option value={45}>45°</option>
            <option value={90}>90°</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Eje X */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ width: 45, color: '#f87171', fontWeight: 'bold' }}>Eje X:</span>
            <button
              onClick={() => rotateBoneLocal('x', -stepDeg)}
              disabled={!selectedBoneName}
              style={{ flex: 1, background: '#334155', color: '#fff', border: 'none', borderRadius: 4, padding: 4 }}
            >
              -{stepDeg}°
            </button>
            <button
              onClick={() => rotateBoneLocal('x', stepDeg)}
              disabled={!selectedBoneName}
              style={{ flex: 1, background: '#334155', color: '#fff', border: 'none', borderRadius: 4, padding: 4 }}
            >
              +{stepDeg}°
            </button>
          </div>

          {/* Eje Y (Roll principal de brazos) */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ width: 45, color: '#4ade80', fontWeight: 'bold' }}>Eje Y:</span>
            <button
              onClick={() => rotateBoneLocal('y', -stepDeg)}
              disabled={!selectedBoneName}
              style={{ flex: 1, background: '#334155', color: '#fff', border: 'none', borderRadius: 4, padding: 4 }}
            >
              -{stepDeg}°
            </button>
            <button
              onClick={() => rotateBoneLocal('y', stepDeg)}
              disabled={!selectedBoneName}
              style={{ flex: 1, background: '#334155', color: '#fff', border: 'none', borderRadius: 4, padding: 4 }}
            >
              +{stepDeg}°
            </button>
          </div>

          {/* Eje Z */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ width: 45, color: '#60a5fa', fontWeight: 'bold' }}>Eje Z:</span>
            <button
              onClick={() => rotateBoneLocal('z', -stepDeg)}
              disabled={!selectedBoneName}
              style={{ flex: 1, background: '#334155', color: '#fff', border: 'none', borderRadius: 4, padding: 4 }}
            >
              -{stepDeg}°
            </button>
            <button
              onClick={() => rotateBoneLocal('z', stepDeg)}
              disabled={!selectedBoneName}
              style={{ flex: 1, background: '#334155', color: '#fff', border: 'none', borderRadius: 4, padding: 4 }}
            >
              +{stepDeg}°
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={resetBoneRotation}
        disabled={!selectedBoneName}
        style={{
          width: '100%',
          background: '#ef4444',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '6px',
          marginTop: 6,
          cursor: selectedBoneName ? 'pointer' : 'not-allowed',
          opacity: selectedBoneName ? 1 : 0.5
        }}
      >
        ↺ Resetear rotación de este hueso
      </button>

      <span style={{ fontSize: 9, color: '#94a3b8', display: 'block', marginTop: 8, textAlign: 'center' }}>
        * Al presionar "Exportar VRM" abajo, estos giros se guardan permanentemente en el archivo.
      </span>
    </div>
  );
}
