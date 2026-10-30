import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import eruda from 'eruda';
import { compactIndexedGeometry } from './utils/meshOptimizer';
import { analyzeVRMModel } from './utils/vrmInspector';
import { heatAt, updateHeat, setW, computeWP } from './utils/weightPainter';
import { saveSessionData, getSessionData, clearSessionDB } from './utils/storageDB';

import { Link } from 'react-router-dom';

import './App.css';

const VRM_BONE_MAP = {
  hips: 'hips',
  spine: 'spine',
  chest: 'chest',
  upperChest: 'upperChest',
  neck: 'neck',
  head: 'head',
  shoulder_L: 'leftShoulder',
  upperArm_L: 'leftUpperArm',
  lowerArm_L: 'leftLowerArm',
  hand_L: 'leftHand',
  shoulder_R: 'rightShoulder',
  upperArm_R: 'rightUpperArm',
  lowerArm_R: 'rightLowerArm',
  hand_R: 'rightHand',
  upperLeg_L: 'leftUpperLeg',
  lowerLeg_L: 'leftLowerLeg',
  foot_L: 'leftFoot',
  toe_L: 'leftToes',
  upperLeg_R: 'rightUpperLeg',
  lowerLeg_R: 'rightLowerLeg',
  foot_R: 'rightFoot',
  toe_R: 'rightToes',
  thumb1_L: 'leftThumbProximal',
  thumb2_L: 'leftThumbIntermediate',
  thumb3_L: 'leftThumbDistal',
  index1_L: 'leftIndexProximal',
  index2_L: 'leftIndexIntermediate',
  index3_L: 'leftIndexDistal',
  middle1_L: 'leftMiddleProximal',
  middle2_L: 'leftMiddleIntermediate',
  middle3_L: 'leftMiddleDistal',
  ring1_L: 'leftRingProximal',
  ring2_L: 'leftRingIntermediate',
  ring3_L: 'leftRingDistal',
  little1_L: 'leftLittleProximal',
  little2_L: 'leftLittleIntermediate',
  little3_L: 'leftLittleDistal',
  thumb1_R: 'rightThumbProximal',
  thumb2_R: 'rightThumbIntermediate',
  thumb3_R: 'rightThumbDistal',
  index1_R: 'rightIndexProximal',
  index2_R: 'rightIndexIntermediate',
  index3_R: 'rightIndexDistal',
  middle1_R: 'rightMiddleProximal',
  middle2_R: 'rightMiddleIntermediate',
  middle3_R: 'rightMiddleDistal',
  ring1_R: 'rightRingProximal',
  ring2_R: 'rightRingIntermediate',
  ring3_R: 'rightRingDistal',
  little1_R: 'rightLittleProximal',
  little2_R: 'rightLittleDistal'
};

const BONE_FIELD_PAIRS = [
  { start: ['hips', 'Hips'], end: ['spine', 'Spine'], r: 0.16, col: 0x3b82f6 },
  { start: ['spine', 'Spine'], end: ['chest', 'Chest'], r: 0.15, col: 0x3b82f6 },
  { start: ['chest', 'Chest'], end: ['upperChest', 'UpperChest'], r: 0.14, col: 0x3b82f6 },
  { start: ['upperChest', 'UpperChest'], end: ['neck', 'Neck'], r: 0.10, col: 0x06b6d4 },
  { start: ['neck', 'Neck'], end: ['head', 'Head'], r: 0.13, col: 0x06b6d4 },
  { start: ['upperArm_R', 'rightUpperArm'], end: ['lowerArm_R', 'rightLowerArm'], r: 0.09, col: 0xf43f5e },
  { start: ['lowerArm_R', 'rightLowerArm'], end: ['hand_R', 'rightHand'], r: 0.08, col: 0xf43f5e },
  { start: ['upperArm_L', 'leftUpperArm'], end: ['lowerArm_L', 'leftLowerArm'], r: 0.09, col: 0x10b981 },
  { start: ['lowerArm_L', 'leftLowerArm'], end: ['hand_L', 'leftHand'], r: 0.08, col: 0x10b981 },
  { start: ['upperLeg_R', 'rightUpperLeg'], end: ['lowerLeg_R', 'rightLowerLeg'], r: 0.10, col: 0xe11d48 },
  { start: ['lowerLeg_R', 'rightLowerLeg'], end: ['foot_R', 'rightFoot'], r: 0.085, col: 0xe11d48 },
  { start: ['upperLeg_L', 'leftUpperLeg'], end: ['lowerLeg_L', 'leftLowerLeg'], r: 0.10, col: 0x059669 },
  { start: ['lowerLeg_L', 'leftLowerLeg'], end: ['foot_L', 'leftFoot'], r: 0.085, col: 0x059669 }
];

export default function AutoRigApp() {
  const containerRef = useRef(null);
  const glbInputRef = useRef(null);
  const vrmInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('bones');
  const [panelVisible, setPanelVisible] = useState(true);
  const [fps, setFps] = useState(0);
  const [meshInfo, setMeshInfo] = useState('Sin Modelo');
  const [vrmAnalysis, setVrmAnalysis] = useState(null);

  const [showMarkers, setShowMarkers] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showFieldVolumes, setShowFieldVolumes] = useState(false);
  const [bgColor, setBgColor] = useState('#0c1017');

  // Sliders Anatómicos
  const [rotY, setRotY] = useState(0);
  const [modelScale, setModelScale] = useState(1.0);
  const [armAngle, setArmAngle] = useState(45);
  const [armSpanFactor, setArmSpanFactor] = useState(1.4);
  const [shoulderWidthFactor, setShoulderWidthFactor] = useState(1.0);
  const [legSpreadFactor, setLegSpreadFactor] = useState(1.0);
  const [fieldRadiusFactor, setFieldRadiusFactor] = useState(1.0);
  const [fingerLength, setFingerLength] = useState(1.0);
  const [spineOffsetZ, setSpineOffsetZ] = useState(0.0);

  // Animaciones y Poses
  const [activeAnim, setActiveAnim] = useState('tpose');
  const [isPoseFrozen, setIsPoseFrozen] = useState(false);
  const [headRot, setHeadRot] = useState(0);
  const [armsFlex, setArmsFlex] = useState(0);
  const [selectedBoneName, setSelectedBoneName] = useState(null);
  const [transformMode, setTransformMode] = useState('translate');

  const [paintMode, setPaintMode] = useState(null);
  const [brushSize, setBrushSize] = useState(8);
  const [brushStrength, setBrushStrength] = useState(50);
  const [showHeatmap, setShowHeatmap] = useState(false);

  const [undoStackCount, setUndoStackCount] = useState(0);
  const undoStackRef = useRef([]);

  const animStateRef = useRef({
    activeAnim: 'tpose',
    isPoseFrozen: false,
    headRot: 0,
    armsFlex: 0
  });

  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const transformControlsRef = useRef(null);

  const currentModelRef = useRef(null);
  const currentVRMRef = useRef(null);
  const currentSkeletonRef = useRef(null);
  const skeletonHelperRef = useRef(null);
  const humanoidBonesRef = useRef({});
  const initialTransformsRef = useRef({});
  const boneMarkerGroupRef = useRef(new THREE.Group());
  const fieldVolumeGroupRef = useRef(new THREE.Group());
  const showFieldVolumesRef = useRef(false);
  const fieldRadiusFactorRef = useRef(1.0);

  const rawModelBufferRef = useRef(null);
  const rawModelTypeRef = useRef(null);
  const baseSourceMeshesRef = useRef([]);
  const isRiggedRef = useRef(false);
  const hasBaseBonesRef = useRef(false);

  const cursorMeshRef = useRef(null);
  const heatMaterialRef = useRef(
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
  );
  const origMaterialsRef = useRef(new Map());

  const paintModeRef = useRef(null);
  const selectedBoneNameRef = useRef(null);
  const brushSizeRef = useRef(8);
  const brushStrengthRef = useRef(50);
  const isPaintingRef = useRef(false);
  const pointerSetRef = useRef(new Set());
  const touchTimerRef = useRef(null);
  const lastPointerEventRef = useRef(null);
  const autoSaveTimerRef = useRef(null);

  useEffect(() => { paintModeRef.current = paintMode; }, [paintMode]);
  useEffect(() => { selectedBoneNameRef.current = selectedBoneName; }, [selectedBoneName]);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
  useEffect(() => { brushStrengthRef.current = brushStrength; }, [brushStrength]);
  useEffect(() => { fieldRadiusFactorRef.current = fieldRadiusFactor; }, [fieldRadiusFactor]);

  useEffect(() => { animStateRef.current.activeAnim = activeAnim; }, [activeAnim]);
  useEffect(() => { animStateRef.current.isPoseFrozen = isPoseFrozen; }, [isPoseFrozen]);
  useEffect(() => { animStateRef.current.headRot = headRot; }, [headRot]);
  useEffect(() => { animStateRef.current.armsFlex = armsFlex; }, [armsFlex]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(bgColor);
    }
  }, [bgColor]);

  const getSkinnedMeshes = () => {
    const arr = [];
    if (currentModelRef.current) {
      currentModelRef.current.traverse((o) => {
        if (o.isSkinnedMesh) arr.push(o);
      });
    }
    return arr;
  };

  const pushWeightsUndoState = () => {
    const meshes = getSkinnedMeshes();
    if (!meshes.length) return;

    const snapshot = {
      type: 'weights',
      data: meshes.map((m) => {
        const a = m.geometry.attributes;
        return {
          uuid: m.uuid,
          skinIndex: a.skinIndex.array.slice(),
          skinWeight: a.skinWeight.array.slice()
        };
      })
    };

    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
    setUndoStackCount(undoStackRef.current.length);
    triggerAutoSave();
  };

  const pushBoneTransformUndoState = (bone) => {
    if (!bone) return;
    const snapshot = {
      type: 'bone_transform',
      boneName: bone.name,
      pos: bone.position.clone(),
      rot: bone.rotation.clone(),
      scale: bone.scale.clone()
    };

    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
    setUndoStackCount(undoStackRef.current.length);
  };

  const handleUndo = () => {
    if (!undoStackRef.current.length) return;
    const previousSnapshot = undoStackRef.current.pop();
    setUndoStackCount(undoStackRef.current.length);

    if (previousSnapshot.type === 'weights') {
      const meshes = getSkinnedMeshes();
      meshes.forEach((m) => {
        const saved = previousSnapshot.data.find((s) => s.uuid === m.uuid);
        if (saved) {
          const a = m.geometry.attributes;
          a.skinIndex.array.set(saved.skinIndex);
          a.skinWeight.array.set(saved.skinWeight);
          a.skinIndex.needsUpdate = true;
          a.skinWeight.needsUpdate = true;

          if (selectedBoneNameRef.current) {
            const b = m.skeleton.bones.find((bn) => bn.name === selectedBoneNameRef.current);
            if (b) updateHeat(m, m.skeleton.bones.indexOf(b));
          }
        }
      });
    } else if (previousSnapshot.type === 'bone_transform') {
      const bone = humanoidBonesRef.current[previousSnapshot.boneName] ||
        (currentSkeletonRef.current && currentSkeletonRef.current.bones.find((b) => b.name === previousSnapshot.boneName));

      if (bone) {
        bone.position.copy(previousSnapshot.pos);
        bone.rotation.copy(previousSnapshot.rot);
        bone.scale.copy(previousSnapshot.scale);
        bone.updateMatrixWorld(true);

        if (initialTransformsRef.current[bone.name]) {
          initialTransformsRef.current[bone.name].pos.copy(previousSnapshot.pos);
          initialTransformsRef.current[bone.name].rot.copy(previousSnapshot.rot);
        }

        updateMarkerPositions();
        updateFieldVolumes();
      }
    }

    triggerAutoSave();
  };

  const triggerAutoSave = () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      if (!rawModelBufferRef.current) return;

      const meshes = getSkinnedMeshes();
      const weightsData = meshes.map((m) => ({
        uuid: m.uuid,
        name: m.name,
        skinIndex: Array.from(m.geometry.attributes.skinIndex.array),
        skinWeight: Array.from(m.geometry.attributes.skinWeight.array)
      }));

      const bonesTransforms = {};
      Object.keys(humanoidBonesRef.current).forEach((k) => {
        const bn = humanoidBonesRef.current[k];
        bonesTransforms[k] = {
          pos: [bn.position.x, bn.position.y, bn.position.z],
          rot: [bn.rotation.x, bn.rotation.y, bn.rotation.z]
        };
      });

      await saveSessionData('autosave_session', {
        timestamp: Date.now(),
        meshInfo,
        fileType: rawModelTypeRef.current || 'glb',
        buffer: rawModelBufferRef.current,
        isRigged: isRiggedRef.current,
        hasBaseBones: hasBaseBonesRef.current,
        showFieldVolumes: showFieldVolumesRef.current,
        bgColor,
        isPoseFrozen,
        sliders: {
          armSpanFactor,
          shoulderWidthFactor,
          legSpreadFactor,
          fieldRadiusFactor,
          armAngle,
          fingerLength,
          spineOffsetZ,
          rotY,
          modelScale
        },
        weightsData,
        bonesTransforms
      });
    }, 500);
  };

  const restoreSavedSession = async () => {
    const saved = await getSessionData('autosave_session');
    if (!saved || !saved.buffer) return;

    if (saved.sliders) {
      setArmSpanFactor(saved.sliders.armSpanFactor ?? 1.4);
      setShoulderWidthFactor(saved.sliders.shoulderWidthFactor ?? 1.0);
      setLegSpreadFactor(saved.sliders.legSpreadFactor ?? 1.0);
      setFieldRadiusFactor(saved.sliders.fieldRadiusFactor ?? 1.0);
      setArmAngle(saved.sliders.armAngle ?? 45);
      setFingerLength(saved.sliders.fingerLength ?? 1.0);
      setSpineOffsetZ(saved.sliders.spineOffsetZ ?? 0.0);
      setRotY(saved.sliders.rotY ?? 0);
      setModelScale(saved.sliders.modelScale ?? 1.0);
    }

    if (saved.bgColor) {
      setBgColor(saved.bgColor);
    }

    if (saved.showFieldVolumes !== undefined) {
      setShowFieldVolumes(saved.showFieldVolumes);
      showFieldVolumesRef.current = saved.showFieldVolumes;
    }

    if (saved.isPoseFrozen) {
      setIsPoseFrozen(true);
    }

    if (saved.fileType === 'vrm') {
      parseVRMBuffer(saved.buffer, saved.meshInfo, saved);
    } else {
      parseGLBBuffer(saved.buffer, saved.meshInfo, saved);
    }
  };

  const handleFullReset = async () => {
    if (!window.confirm('¿Reiniciar la aplicación y borrar todos los datos autoguardados?')) return;
    await clearSessionDB();
    window.location.reload();
  };

  const toggleFreezePose = () => {
    if (!isPoseFrozen) {
      setIsPoseFrozen(true);
      if (currentModelRef.current) currentModelRef.current.updateMatrixWorld(true);
      computeWP(getSkinnedMeshes());
      triggerAutoSave();
    } else {
      setIsPoseFrozen(false);
      triggerAutoSave();
    }
  };

  const resetToBasePose = () => {
    setIsPoseFrozen(false);
    setActiveAnim('tpose');
    const bones = humanoidBonesRef.current;
    const init = initialTransformsRef.current;
    Object.keys(bones).forEach((name) => {
      if (init[name]) bones[name].rotation.copy(init[name].rot);
    });
    if (currentModelRef.current) currentModelRef.current.updateMatrixWorld(true);
    updateMarkerPositions();
    updateFieldVolumes();
    triggerAutoSave();
  };

  useEffect(() => {
    if (!window.__erudaInit) {
      eruda.init();
      eruda.hide();
      window.__erudaInit = true;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgColor);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 100);
    camera.position.set(0, 1.4, 3.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const canvas = renderer.domElement;
    const handleContextLost = (e) => {
      e.preventDefault();
      console.warn('WebGL context lost, esperando restauración...');
    };
    const handleContextRestored = () => {
      console.log('WebGL context restored');
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.9, 0);
    controlsRef.current = controls;

    scene.add(boneMarkerGroupRef.current);
    scene.add(fieldVolumeGroupRef.current);

    const cursor = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.5, depthTest: false })
    );
    cursor.visible = false;
    cursor.renderOrder = 1001;
    scene.add(cursor);
    cursorMeshRef.current = cursor;

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.size = 0.75;
    transformControls.setMode('translate');

    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value;
      if (event.value) {
        pushBoneTransformUndoState(transformControls.object);
      } else {
        triggerAutoSave();
      }
    });

    transformControls.addEventListener('change', () => {
      updateMarkerPositions();
      updateFieldVolumes();
    });

    if (typeof transformControls.getHelper === 'function') {
      scene.add(transformControls.getHelper());
    } else {
      scene.add(transformControls);
    }
    transformControlsRef.current = transformControls;

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 1.5);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.3);
    dirLight.position.set(3, 5, 4);
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x88bbff, 0.8);
    fillLight.position.set(-3, 3, -2);
    scene.add(fillLight);

    const grid = new THREE.GridHelper(10, 20, 0x1e3a8a, 0x172554);
    scene.add(grid);

    const arrowGroup = new THREE.Group();
    const arrowHelper = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0.01, -0.6),
      1.6,
      0x3b82f6,
      0.28,
      0.14
    );
    arrowGroup.add(arrowHelper);

    const ringGeo = new THREE.RingGeometry(0.35, 0.38, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(0, 0.01, 0);
    arrowGroup.add(ringMesh);
    scene.add(arrowGroup);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event) => {
      if (paintModeRef.current) return;
      if (event.target.tagName !== 'CANVAS') return;
      if (!boneMarkerGroupRef.current.visible) return;

      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(boneMarkerGroupRef.current.children);

      if (intersects.length > 0) {
        const selectedMarker = intersects[0].object;
        const bone = selectedMarker.userData.bone;
        setSelectedBoneName(bone.name);
        transformControls.attach(bone);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);

    const cv = renderer.domElement;

    const paintAt = (e) => {
      const meshes = getSkinnedMeshes().filter((m) => m.userData.wp);
      if (!meshes.length) return;

      const r = cv.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;

      camera.updateMatrixWorld();
      const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
      const tol = 14;
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

      if (!best) {
        cursor.visible = false;
        return;
      }

      const R = +brushSizeRef.current / 100;
      const k = (+brushStrengthRef.current / 100) * 0.4;
      cursor.position.set(best[0], best[1], best[2]);
      cursor.scale.setScalar(R);
      cursor.visible = true;

      if (!isPaintingRef.current) return;

      const targetBoneName = selectedBoneNameRef.current;
      if (!targetBoneName) return;

      const erase = paintModeRef.current === 'erase';
      const cx = camera.position.x;
      const cy = camera.position.y;
      const cz = camera.position.z;
      const hd = Math.hypot(best[0] - cx, best[1] - cy, best[2] - cz);

      meshes.forEach((m) => {
        const bone = m.skeleton.bones.find((b) => b.name === targetBoneName);
        if (!bone) return;
        const bi = m.skeleton.bones.indexOf(bone);
        if (bi < 0) return;
        const pi = bone.parent ? m.skeleton.bones.indexOf(bone.parent) : -1;

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
    };

    const handlePointerDown = (e) => {
      if (!paintModeRef.current) return;
      pointerSetRef.current.add(e.pointerId);
      if (pointerSetRef.current.size > 1) {
        isPaintingRef.current = false;
        clearTimeout(touchTimerRef.current);
        return;
      }

      pushWeightsUndoState();

      lastPointerEventRef.current = e;
      cv.setPointerCapture(e.pointerId);
      touchTimerRef.current = setTimeout(() => {
        if (pointerSetRef.current.size === 1) {
          isPaintingRef.current = true;
          paintAt(lastPointerEventRef.current);
        }
      }, 60);
    };

    const handlePointerMove = (e) => {
      lastPointerEventRef.current = e;
      if (paintModeRef.current && pointerSetRef.current.size < 2) {
        paintAt(e);
      }
    };

    const handlePointerUp = (e) => {
      pointerSetRef.current.delete(e.pointerId);
      isPaintingRef.current = false;
      clearTimeout(touchTimerRef.current);
      if (paintModeRef.current) triggerAutoSave();
    };

    cv.addEventListener('pointerdown', handlePointerDown);
    cv.addEventListener('pointermove', handlePointerMove);
    cv.addEventListener('pointerup', handlePointerUp);
    cv.addEventListener('pointercancel', handlePointerUp);
    cv.addEventListener('pointerleave', () => { cursor.visible = false; });

    let reqId;
    let frameCount = 0;
    let lastTime = performance.now();
    let clockTime = 0;

    const animate = () => {
      reqId = requestAnimationFrame(animate);

      const delta = 0.016;
      const { activeAnim: currentAnim, isPoseFrozen: frozen, headRot: curHead, armsFlex: curFlex } = animStateRef.current;

      if (!frozen) {
        clockTime += delta;
      }

      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = now;
      }

      controls.update();

      if (currentVRMRef.current && !paintModeRef.current && !frozen) {
        currentVRMRef.current.update(delta);
      }

      const bones = humanoidBonesRef.current;
      const init = initialTransformsRef.current;

      if (bones.hips && init.hips && !transformControls.dragging && !paintModeRef.current && !frozen) {
        if (currentAnim === 'tpose') {
          Object.keys(bones).forEach((name) => {
            if (init[name]) bones[name].rotation.copy(init[name].rot);
          });
        } else if (currentAnim === 'idle') {
          const breath = Math.sin(clockTime * 2.2) * 0.06;
          if (bones.chest) bones.chest.rotation.x = init.chest.rot.x + breath;
          if (bones.upperArm_R) bones.upperArm_R.rotation.z = init.upperArm_R.rot.z + Math.cos(clockTime * 2.2) * 0.03;
          if (bones.upperArm_L) bones.upperArm_L.rotation.z = init.upperArm_L.rot.z - Math.cos(clockTime * 2.2) * 0.03;
        } else if (currentAnim === 'walk') {
          const cycle = clockTime * 4.5;
          if (bones.upperLeg_R) bones.upperLeg_R.rotation.x = Math.sin(cycle) * 0.45;
          if (bones.lowerLeg_R) bones.lowerLeg_R.rotation.x = Math.max(0, -Math.sin(cycle) * 0.6);
          if (bones.foot_R) bones.foot_R.rotation.x = Math.sin(cycle) * 0.2;

          if (bones.upperLeg_L) bones.upperLeg_L.rotation.x = -Math.sin(cycle) * 0.45;
          if (bones.lowerLeg_L) bones.lowerLeg_L.rotation.x = Math.max(0, -Math.sin(cycle) * 0.6);
          if (bones.foot_L) bones.foot_L.rotation.x = -Math.sin(cycle) * 0.2;

          if (bones.upperArm_R) bones.upperArm_R.rotation.x = -Math.sin(cycle) * 0.3;
          if (bones.upperArm_L) bones.upperArm_L.rotation.x = Math.sin(cycle) * 0.3;
        }

        if (bones.head && init.head) {
          bones.head.rotation.y = init.head.rot.y + (curHead * Math.PI) / 180;
        }
        if (bones.upperArm_R && bones.upperArm_L && init.upperArm_R && init.upperArm_L) {
          const flexRad = (curFlex * Math.PI) / 180;
          bones.upperArm_R.rotation.z = init.upperArm_R.rot.z - flexRad;
          bones.upperArm_L.rotation.z = init.upperArm_L.rot.z + flexRad;
        }

        updateMarkerPositions();
        updateFieldVolumes();
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    restoreSavedSession();

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', handleResize);
      cv.removeEventListener('pointerdown', handlePointerDown);
      cv.removeEventListener('pointermove', handlePointerMove);
      cv.removeEventListener('pointerup', handlePointerUp);
      cv.removeEventListener('pointercancel', handlePointerUp);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (transformControlsRef.current) {
      transformControlsRef.current.setMode(transformMode);
    }
  }, [transformMode]);

  useEffect(() => {
    boneMarkerGroupRef.current.visible = showMarkers;
  }, [showMarkers]);

  useEffect(() => {
    if (skeletonHelperRef.current) {
      skeletonHelperRef.current.visible = showSkeleton;
    }
  }, [showSkeleton]);

  useEffect(() => {
    showFieldVolumesRef.current = showFieldVolumes;
    fieldVolumeGroupRef.current.visible = showFieldVolumes;
    if (showFieldVolumes) {
      updateFieldVolumes();
    }
  }, [showFieldVolumes]);

  // Actualización inmediata del grosor y tamaño al mover el slider de radio
  useEffect(() => {
    if (showFieldVolumesRef.current) {
      updateFieldVolumes();
    }
  }, [fieldRadiusFactor]);

  useEffect(() => {
    const meshes = getSkinnedMeshes();
    if (!meshes.length) return;

    const shouldShowHeat = (showHeatmap || Boolean(paintMode)) && Boolean(selectedBoneName);

    if (shouldShowHeat) {
      meshes.forEach((m) => {
        if (!origMaterialsRef.current.has(m.uuid)) {
          origMaterialsRef.current.set(m.uuid, m.material);
        }
        m.material = heatMaterialRef.current;

        if (m.skeleton && m.skeleton.bones) {
          const b = m.skeleton.bones.find((bn) => bn.name === selectedBoneName);
          if (b) {
            const bi = m.skeleton.bones.indexOf(b);
            updateHeat(m, bi);
          }
        }
      });
    } else {
      meshes.forEach((m) => {
        if (origMaterialsRef.current.has(m.uuid)) {
          m.material = origMaterialsRef.current.get(m.uuid);
        }
        if (m.geometry && m.geometry.attributes.color) {
          m.geometry.deleteAttribute('color');
        }
      });
    }
  }, [showHeatmap, paintMode, selectedBoneName]);

  const togglePaintMode = (m) => {
    const newMode = paintMode === m ? null : m;
    setPaintMode(newMode);

    if (controlsRef.current) {
      controlsRef.current.touches.ONE = newMode ? -1 : THREE.TOUCH.ROTATE;
      controlsRef.current.mouseButtons.LEFT = newMode ? -1 : THREE.MOUSE.ROTATE;
    }

    if (cursorMeshRef.current) cursorMeshRef.current.visible = false;

    if (newMode) {
      if (transformControlsRef.current) transformControlsRef.current.detach();
      if (currentModelRef.current) currentModelRef.current.updateMatrixWorld(true);
      computeWP(getSkinnedMeshes());
    }
  };

  const createBoneMarkers = (bones) => {
    const group = boneMarkerGroupRef.current;
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    const mainMarkerGeo = new THREE.SphereGeometry(0.022, 12, 12);
    const fingerMarkerGeo = new THREE.SphereGeometry(0.007, 8, 8);

    const markerMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.85,
      depthTest: false
    });

    Object.keys(bones).forEach((key) => {
      const bone = bones[key];
      const isFinger = key.includes('thumb') || key.includes('index') || key.includes('middle') || key.includes('ring') || key.includes('little');

      const marker = new THREE.Mesh(isFinger ? fingerMarkerGeo : mainMarkerGeo, markerMat.clone());
      marker.userData = { bone: bone };
      marker.renderOrder = 999;
      group.add(marker);
    });

    updateMarkerPositions();
    updateFieldVolumes();
  };

  const updateMarkerPositions = () => {
    const group = boneMarkerGroupRef.current;
    const tempPos = new THREE.Vector3();
    group.children.forEach((marker) => {
      const bone = marker.userData.bone;
      if (bone) {
        bone.getWorldPosition(tempPos);
        marker.position.copy(tempPos);
      }
    });
  };

  // ACTUALIZACIÓN TOTALMENTE REACTIVA Y SUAVE DE LOS CILINDROS DE CAMPO
  const updateFieldVolumes = () => {
    const group = fieldVolumeGroupRef.current;
    if (!group) return;

    if (!showFieldVolumesRef.current) {
      while (group.children.length > 0) {
        const obj = group.children[0];
        group.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      }
      return;
    }

    const bones = humanoidBonesRef.current;
    const rootBone = bones?.hips || bones?.Hips || Object.values(bones || {})[0];
    if (!rootBone) return;

    rootBone.updateMatrixWorld(true);

    const findBone = (keys) => {
      for (const k of keys) {
        if (bones[k]) return bones[k];
      }
      return null;
    };

    const pStart = new THREE.Vector3();
    const pEnd = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const currentRadiusFactor = fieldRadiusFactorRef.current;

    // Si ya existen los cilindros creados, solo actualizamos posición, orientación y grosor por escala
    if (group.children.length === BONE_FIELD_PAIRS.length) {
      BONE_FIELD_PAIRS.forEach((pair, idx) => {
        const cyl = group.children[idx];
        const b1 = findBone(pair.start);
        const b2 = findBone(pair.end);
        if (!b1 || !b2 || !cyl) return;

        b1.getWorldPosition(pStart);
        b2.getWorldPosition(pEnd);
        const dist = pStart.distanceTo(pEnd);
        if (dist < 0.005) return;

        mid.copy(pStart).add(pEnd).multiplyScalar(0.5);
        cyl.position.copy(mid);

        // Alineación limpia de inicio a fin
        cyl.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3().subVectors(pEnd, pStart).normalize()
        );

        // Escalar X y Z para el grosor, e Y para la longitud exacta entre articulaciones
        cyl.scale.set(currentRadiusFactor, dist, currentRadiusFactor);
      });
      return;
    }

    // Creación inicial limpia con altura normalizada 1.0 (permite escalar en Y con dist)
    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }

    BONE_FIELD_PAIRS.forEach((pair) => {
      const b1 = findBone(pair.start);
      const b2 = findBone(pair.end);
      if (!b1 || !b2) return;

      b1.getWorldPosition(pStart);
      b2.getWorldPosition(pEnd);
      const dist = pStart.distanceTo(pEnd);
      if (dist < 0.005) return;

      const cylGeo = new THREE.CylinderGeometry(pair.r, pair.r, 1.0, 16, 1, false);

      const cylMat = new THREE.MeshBasicMaterial({
        color: pair.col,
        transparent: true,
        opacity: 0.45,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      const cyl = new THREE.Mesh(cylGeo, cylMat);
      mid.copy(pStart).add(pEnd).multiplyScalar(0.5);
      cyl.position.copy(mid);

      cyl.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3().subVectors(pEnd, pStart).normalize()
      );

      cyl.scale.set(currentRadiusFactor, dist, currentRadiusFactor);
      cyl.renderOrder = 999;
      group.add(cyl);
    });
  };

  const clearCurrentScene = () => {
    if (currentModelRef.current) sceneRef.current.remove(currentModelRef.current);
    if (skeletonHelperRef.current) sceneRef.current.remove(skeletonHelperRef.current);
    if (transformControlsRef.current) transformControlsRef.current.detach();
    setSelectedBoneName(null);
    currentVRMRef.current = null;
    humanoidBonesRef.current = {};
    initialTransformsRef.current = {};
    origMaterialsRef.current.clear();
    undoStackRef.current = [];
    baseSourceMeshesRef.current = [];
    isRiggedRef.current = false;
    hasBaseBonesRef.current = false;
    setUndoStackCount(0);
    const group = boneMarkerGroupRef.current;
    while (group.children.length > 0) group.remove(group.children[0]);
    const fGroup = fieldVolumeGroupRef.current;
    while (fGroup.children.length > 0) fGroup.remove(fGroup.children[0]);
  };

  const parseGLBBuffer = (buffer, name, restoreData = null) => {
    const loader = new GLTFLoader();
    loader.parse(
      buffer,
      '',
      (gltf) => {
        clearCurrentScene();

        rawModelBufferRef.current = buffer;
        rawModelTypeRef.current = 'glb';

        const model = gltf.scene;
        currentModelRef.current = model;

        const sourceMeshes = [];
        model.traverse((node) => {
          if (node.isMesh && node.material) {
            sourceMeshes.push(node);
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach((m) => {
              m.side = THREE.DoubleSide;
              m.needsUpdate = true;
              if (m.map) {
                m.map.colorSpace = THREE.SRGBColorSpace;
                m.map.needsUpdate = true;
              }
              if (m.emissiveMap) {
                m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                m.emissiveMap.needsUpdate = true;
              }
            });
            if (node.geometry && node.geometry.attributes.color) {
              node.geometry.deleteAttribute('color');
            }
          }
        });
        baseSourceMeshesRef.current = sourceMeshes;

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 1.7 / (size.y || 1);
        model.scale.setScalar(scale);

        box.setFromObject(model);
        box.getCenter(center);
        model.position.x = -center.x;
        model.position.y = -box.min.y;
        model.position.z = -center.z;

        const savedRotY = restoreData?.sliders?.rotY ?? 0;
        if (savedRotY !== 0) {
          model.rotation.y = (savedRotY * Math.PI) / 180;
        }

        sceneRef.current.add(model);
        setMeshInfo(`${name.slice(0, 14)}`);

        const report = analyzeVRMModel(gltf);
        setVrmAnalysis(report);

        if (restoreData && (restoreData.hasBaseBones || restoreData.isRigged)) {
          handleGenerateBaseBones();

          if (restoreData.bonesTransforms) {
            Object.keys(restoreData.bonesTransforms).forEach((bName) => {
              const b = humanoidBonesRef.current[bName];
              if (b) {
                b.position.fromArray(restoreData.bonesTransforms[bName].pos);
                b.rotation.fromArray(restoreData.bonesTransforms[bName].rot);
                if (initialTransformsRef.current[bName]) {
                  initialTransformsRef.current[bName].pos.copy(b.position);
                  initialTransformsRef.current[bName].rot.copy(b.rotation);
                }
              }
            });
            if (humanoidBonesRef.current.hips) {
              humanoidBonesRef.current.hips.updateMatrixWorld(true);
            }
          }

          if (restoreData.isRigged) {
            handleBindDirect(restoreData.weightsData);
          }
          updateFieldVolumes();
        } else {
          setActiveTab('bones');
          if (!restoreData) triggerAutoSave();
        }
      },
      (error) => {
        console.error(error);
      }
    );
  };

  const parseVRMBuffer = (buffer, name, restoreData = null) => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.parse(
      buffer,
      '',
      (gltf) => {
        clearCurrentScene();

        rawModelBufferRef.current = buffer;
        rawModelTypeRef.current = 'vrm';

        const vrm = gltf.userData.vrm;
        const model = gltf.scene;
        currentModelRef.current = model;
        currentVRMRef.current = vrm;

        if (vrm) {
          VRMUtils.rotateVRM0(vrm);
        }

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 1.7 / (size.y || 1);
        model.scale.setScalar(scale);

        box.setFromObject(model);
        box.getCenter(center);
        model.position.x = -center.x;
        model.position.y = -box.min.y;
        model.position.z = -center.z;

        sceneRef.current.add(model);

        const hBones = {};
        const allBonesInVRM = [];

        model.traverse((node) => {
          if (node.isBone) {
            allBonesInVRM.push(node);
            hBones[node.name] = node;
          }
        });

        if (vrm?.humanoid) {
          const standardList = [
            'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
            'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
            'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
            'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
            'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes'
          ];

          standardList.forEach((bName) => {
            const node = vrm.humanoid.getNormalizedBoneNode(bName) || vrm.humanoid.getRawBoneNode(bName);
            if (node) {
              hBones[bName] = node;
              if (!allBonesInVRM.includes(node)) allBonesInVRM.push(node);
            }
          });
        }

        humanoidBonesRef.current = hBones;

        const inits = {};
        Object.keys(hBones).forEach((name) => {
          inits[name] = {
            rot: hBones[name].rotation.clone(),
            pos: hBones[name].position.clone()
          };
        });
        initialTransformsRef.current = inits;

        if (skeletonHelperRef.current) sceneRef.current.remove(skeletonHelperRef.current);
        const rootBone = allBonesInVRM.find((b) => b.name.includes('Hips') || b.name === 'hips') || model;
        const helper = new THREE.SkeletonHelper(rootBone);
        helper.material.linewidth = 2;
        helper.material.depthTest = false;
        helper.renderOrder = 998;
        helper.visible = showSkeleton;
        skeletonHelperRef.current = helper;
        sceneRef.current.add(helper);

        if (restoreData && restoreData.weightsData) {
          const meshes = getSkinnedMeshes();
          meshes.forEach((m) => {
            const savedMesh = restoreData.weightsData.find((w) => w.uuid === m.uuid || w.name === m.name);
            if (savedMesh) {
              const a = m.geometry.attributes;
              a.skinIndex.array.set(savedMesh.skinIndex);
              a.skinWeight.array.set(savedMesh.skinWeight);
              a.skinIndex.needsUpdate = true;
              a.skinWeight.needsUpdate = true;
            }
          });
        }

        getSkinnedMeshes().forEach((m) => {
          const a = m.geometry.attributes;
          m.userData.w0 = [a.skinIndex.array.slice(), a.skinWeight.array.slice()];
        });

        createBoneMarkers(hBones);

        setMeshInfo(`${name.slice(0, 14)}`);
        const report = analyzeVRMModel(gltf);
        setVrmAnalysis(report);
        setActiveTab('anim');

        if (!restoreData) triggerAutoSave();
      },
      (error) => {
        console.error(error);
      }
    );
  };

  const handleGLBChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = (event) => parseGLBBuffer(event.target.result, file.name);
    e.target.value = '';
  };

  const handleVRMChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = (event) => parseVRMBuffer(event.target.result, file.name);
    e.target.value = '';
  };

  const rotateStep = (deg) => {
    if (!currentModelRef.current) return;
    const newDeg = (rotY + deg) % 360;
    setRotY(newDeg);
    currentModelRef.current.rotation.y = (newDeg * Math.PI) / 180;
    triggerAutoSave();
  };

  const rotatePitch = (deg) => {
    if (!currentModelRef.current) return;
    currentModelRef.current.rotation.x += (deg * Math.PI) / 180;
    triggerAutoSave();
  };

  const handleRotYSlider = (val) => {
    setRotY(val);
    if (currentModelRef.current) {
      currentModelRef.current.rotation.y = (val * Math.PI) / 180;
    }
    triggerAutoSave();
  };

  const handleScaleSlider = (val) => {
    setModelScale(val);
    if (currentModelRef.current) {
      currentModelRef.current.scale.setScalar(val);
    }
    triggerAutoSave();
  };

  const freezeTransforms = () => {
    const model = currentModelRef.current;
    if (!model) return;

    model.updateMatrixWorld(true);
    model.traverse((child) => {
      if (child.isMesh && child.geometry) {
        child.geometry.applyMatrix4(child.matrixWorld);
        child.position.set(0, 0, 0);
        child.rotation.set(0, 0, 0);
        child.scale.set(1, 1, 1);
        child.updateMatrix();
      }
    });

    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrix();

    setRotY(0);
    setModelScale(1.0);
    alert('Orientación base fijada.');
    setActiveTab('bones');
    triggerAutoSave();
  };

  const computeWeightsAndBind = (sourceMeshes, targetGroup, skeleton, bones, customWeightsData = null) => {
    skeleton.calculateInverses();

    const boneWorldPos = bones.map((bn) => {
      const v = new THREE.Vector3();
      bn.getWorldPosition(v);
      return v;
    });

    const hipsBoneIdx = bones.findIndex((b) => b.name === 'hips');
    const hipsY = hipsBoneIdx !== -1 ? boneWorldPos[hipsBoneIdx].y : 0.9;

    sourceMeshes.forEach((m) => {
      m.updateMatrixWorld(true);
      let geo = m.geometry.clone();
      geo.applyMatrix4(m.matrixWorld);

      geo = compactIndexedGeometry(geo);

      if (geo.attributes.color) {
        geo.deleteAttribute('color');
      }

      const posAttr = geo.attributes.position;
      const count = posAttr.count;
      const skinIndices = [];
      const skinWeights = [];
      const vertPos = new THREE.Vector3();

      for (let i = 0; i < count; i++) {
        vertPos.fromBufferAttribute(posAttr, i);

        const dists = [];
        for (let j = 0; j < bones.length; j++) {
          const bName = bones[j].name;
          const bPos = boneWorldPos[j];
          let penalty = 1.0;

          if (bName.endsWith('_R') && vertPos.x > 0.02) penalty = 100.0;
          if (bName.endsWith('_L') && vertPos.x < -0.02) penalty = 100.0;

          const isArmBone = bName.includes('Arm') || bName.includes('shoulder');
          const isHand = bName.includes('hand');
          const isFinger = bName.includes('thumb') || bName.includes('index') || bName.includes('middle') || bName.includes('ring') || bName.includes('little');
          const isLegBone = bName.includes('Leg');
          const isFoot = bName.includes('foot');
          const isToe = bName.includes('toe');

          const dist = vertPos.distanceTo(bPos);

          const distFromCenter = Math.hypot(vertPos.x, vertPos.z);
          const isSkirtArea = vertPos.y < hipsY + 0.1 && vertPos.y > hipsY - 0.45;

          if (isSkirtArea && distFromCenter < 0.28) {
            if (isArmBone || isHand || isFinger) penalty = 5000.0;
          }

          if (isArmBone && dist > 0.24 * fieldRadiusFactor) penalty = 300.0;
          if (isHand && dist > 0.18 * fieldRadiusFactor) penalty = 150.0;
          if (isFinger && dist > 0.08 * fieldRadiusFactor) penalty = 200.0;

          if (isLegBone && vertPos.y > hipsY + 0.05) penalty = 2000.0;

          if (isToe && (vertPos.z < bPos.z - 0.04 || vertPos.y > bPos.y + 0.06)) {
            penalty = 2000.0;
          }
          if (isFoot && vertPos.z > bPos.z + 0.12) {
            penalty = 20.0;
          }

          dists.push({ index: j, dist: dist * penalty });
        }

        dists.sort((a, b) => a.dist - b.dist);
        const top4 = dists.slice(0, 4);

        let sumW = 0;
        const weights = top4.map((item) => {
          const w = 1.0 / Math.pow(Math.max(item.dist, 0.02), 3.5);
          sumW += w;
          return w;
        });

        skinIndices.push(top4[0].index, top4[1].index, top4[2].index, top4[3].index);
        skinWeights.push(weights[0] / sumW, weights[1] / sumW, weights[2] / sumW, weights[3] / sumW);
      }

      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

      if (customWeightsData) {
        const savedMesh = customWeightsData.find((w) => w.uuid === m.uuid || w.name === m.name);
        if (savedMesh) {
          geo.attributes.skinIndex.array.set(savedMesh.skinIndex);
          geo.attributes.skinWeight.array.set(savedMesh.skinWeight);
          geo.attributes.skinIndex.needsUpdate = true;
          geo.attributes.skinWeight.needsUpdate = true;
        }
      }

      const prepareMat = (mat) => {
        if (!mat) return new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 });
        const cloned = mat.clone();
        cloned.side = THREE.DoubleSide;
        if (cloned.map) {
          cloned.map.colorSpace = THREE.SRGBColorSpace;
          cloned.map.needsUpdate = true;
        }
        if (cloned.emissiveMap) {
          cloned.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          cloned.emissiveMap.needsUpdate = true;
        }
        cloned.needsUpdate = true;
        return cloned;
      };

      const finalMat = Array.isArray(m.material)
        ? m.material.map(prepareMat)
        : prepareMat(m.material);

      const sm = new THREE.SkinnedMesh(geo, finalMat);
      sm.frustumCulled = false;
      sm.bind(skeleton);

      origMaterialsRef.current.set(sm.uuid, finalMat);

      sm.userData.w0 = [geo.attributes.skinIndex.array.slice(), geo.attributes.skinWeight.array.slice()];

      targetGroup.add(sm);
    });
  };

  const handleGenerateBaseBones = () => {
    const model = currentModelRef.current;
    if (!model) {
      alert('Primero sube un modelo GLB.');
      return;
    }

    model.updateMatrixWorld(true);

    const b = new THREE.Box3().setFromObject(model);
    const minY = b.min.y;
    const H = b.max.y - minY;
    const midX = (b.min.x + b.max.x) / 2;
    const midZ = (b.min.z + b.max.z) / 2 + spineOffsetZ;
    const modelWidth = b.max.x - b.min.x;

    const armSpan = modelWidth * 0.54 * armSpanFactor;

    const bones = [];
    const humanoidBones = {};

    const makeBone = (name, x, y, z) => {
      const bn = new THREE.Bone();
      bn.name = name;
      bn.position.set(x, y, z);
      bones.push(bn);
      humanoidBones[name] = bn;
      return bn;
    };

    const ratioHipsY = 0.596;
    const ratioSpineY = 0.624;
    const ratioChestY = 0.681;
    const ratioUpperChestY = 0.743;
    const ratioShoulderY = 0.806;
    const ratioNeckY = 0.822;
    const ratioHeadY = 0.870;
    const ratioKneeY = 0.339;
    const ratioAnkleY = 0.070;

    // 1. Tronco
    const hipsY = minY + H * ratioHipsY;
    const spineY = minY + H * ratioSpineY;
    const chestY = minY + H * ratioChestY;
    const upperChestY = minY + H * ratioUpperChestY;
    const neckY = minY + H * ratioNeckY;
    const headY = minY + H * ratioHeadY;

    const hips = makeBone('hips', midX, hipsY, midZ);
    const spine = makeBone('spine', 0, spineY - hipsY, 0);
    const chest = makeBone('chest', 0, chestY - spineY, 0);
    const upperChest = makeBone('upperChest', 0, upperChestY - chestY, 0);
    const neck = makeBone('neck', 0, neckY - upperChestY, 0);
    const head = makeBone('head', 0, headY - neckY, 0);

    hips.add(spine);
    spine.add(chest);
    chest.add(upperChest);
    upperChest.add(neck);
    neck.add(head);

    // 2. Hombros y Brazos
    const rad = (armAngle * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const shoulderY = minY + H * ratioShoulderY;
    const shoulderOffsetX = Math.max(modelWidth * 0.08, 0.045) * shoulderWidthFactor;
    const armLength = armSpan * 0.43;

    // Brazo Derecho
    const shoulderR = makeBone('shoulder_R', -shoulderOffsetX, shoulderY - upperChestY, 0);
    const upperArmR = makeBone('upperArm_R', -shoulderOffsetX * 1.3, -0.01, 0);
    const lowerArmR = makeBone('lowerArm_R', -cosA * armLength, -sinA * armLength, 0);
    const handR = makeBone('hand_R', -cosA * (armLength * 0.88), -sinA * (armLength * 0.88), 0);
    upperChest.add(shoulderR);
    shoulderR.add(upperArmR);
    upperArmR.add(lowerArmR);
    lowerArmR.add(handR);

    // Brazo Izquierdo
    const shoulderL = makeBone('shoulder_L', shoulderOffsetX, shoulderY - upperChestY, 0);
    const upperArmL = makeBone('upperArm_L', shoulderOffsetX * 1.3, -0.01, 0);
    const lowerArmL = makeBone('lowerArm_L', cosA * armLength, -sinA * armLength, 0);
    const handL = makeBone('hand_L', cosA * (armLength * 0.88), -sinA * (armLength * 0.88), 0);
    upperChest.add(shoulderL);
    shoulderL.add(upperArmL);
    upperArmL.add(lowerArmL);
    lowerArmL.add(handL);

    // 2.5 Falanges
    const fScale = fingerLength;
    const addHandFingers = (handBone, isRight) => {
      const side = isRight ? -1 : 1;
      const sfx = isRight ? '_R' : '_L';

      const t1 = makeBone(`thumb1${sfx}`, side * 0.016 * fScale * cosA, -0.016 * fScale * sinA, 0.018 * fScale);
      const t2 = makeBone(`thumb2${sfx}`, side * 0.018 * fScale * cosA, -0.018 * fScale * sinA, 0.012 * fScale);
      const t3 = makeBone(`thumb3${sfx}`, side * 0.015 * fScale * cosA, -0.015 * fScale * sinA, 0.010 * fScale);
      handBone.add(t1); t1.add(t2); t2.add(t3);

      const i1 = makeBone(`index1${sfx}`, side * 0.038 * fScale * cosA, -0.038 * fScale * sinA, 0.009 * fScale);
      const i2 = makeBone(`index2${sfx}`, side * 0.022 * fScale * cosA, -0.022 * fScale * sinA, 0);
      const i3 = makeBone(`index3${sfx}`, side * 0.016 * fScale * cosA, -0.016 * fScale * sinA, 0);
      handBone.add(i1); i1.add(i2); i2.add(i3);

      const m1 = makeBone(`middle1${sfx}`, side * 0.042 * fScale * cosA, -0.042 * fScale * sinA, 0);
      const m2 = makeBone(`middle2${sfx}`, side * 0.025 * fScale * cosA, -0.025 * fScale * sinA, 0);
      const m3 = makeBone(`middle3${sfx}`, side * 0.018 * fScale * cosA, -0.018 * fScale * sinA, 0);
      handBone.add(m1); m1.add(m2); m2.add(m3);

      const r1 = makeBone(`ring1${sfx}`, side * 0.039 * fScale * cosA, -0.039 * fScale * sinA, -0.009 * fScale);
      const r2 = makeBone(`ring2${sfx}`, side * 0.023 * fScale * cosA, -0.023 * fScale * sinA, 0);
      const r3 = makeBone(`ring3${sfx}`, side * 0.016 * fScale * cosA, -0.016 * fScale * sinA, 0);
      handBone.add(r1); r1.add(r2); r2.add(r3);

      const l1 = makeBone(`little1${sfx}`, side * 0.032 * fScale * cosA, -0.032 * fScale * sinA, -0.017 * fScale);
      const l2 = makeBone(`little2${sfx}`, side * 0.018 * fScale * cosA, -0.018 * fScale * sinA, 0);
      const l3 = makeBone(`little3${sfx}`, side * 0.013 * fScale * cosA, -0.013 * fScale * sinA, 0);
      handBone.add(l1); l1.add(l2); l2.add(l3);
    };

    addHandFingers(handR, true);
    addHandFingers(handL, false);

    // 3. Piernas
    const kneeY = minY + H * ratioKneeY;
    const ankleY = minY + H * ratioAnkleY;
    const legSpread = Math.max(modelWidth * 0.16, 0.11) * legSpreadFactor;

    const upperLegR = makeBone('upperLeg_R', -legSpread, -0.035, 0);
    const lowerLegR = makeBone('lowerLeg_R', 0, -(hipsY - 0.035 - kneeY), 0);
    const footR = makeBone('foot_R', 0, -(kneeY - ankleY), 0);
    const toeR = makeBone('toe_R', 0, -(ankleY - minY), 0.11);
    hips.add(upperLegR);
    upperLegR.add(lowerLegR);
    lowerLegR.add(footR);
    footR.add(toeR);

    const upperLegL = makeBone('upperLeg_L', legSpread, -0.035, 0);
    const lowerLegL = makeBone('lowerLeg_L', 0, -(hipsY - 0.035 - kneeY), 0);
    const footL = makeBone('foot_L', 0, -(kneeY - ankleY), 0);
    const toeL = makeBone('toe_L', 0, -(ankleY - minY), 0.11);
    hips.add(upperLegL);
    upperLegL.add(lowerLegL);
    lowerLegL.add(footL);
    footL.add(toeL);

    const skeleton = new THREE.Skeleton(bones);
    currentSkeletonRef.current = skeleton;
    humanoidBonesRef.current = humanoidBones;

    const initTransforms = {};
    bones.forEach((bn) => {
      initTransforms[bn.name] = { rot: bn.rotation.clone(), pos: bn.position.clone() };
    });
    initialTransformsRef.current = initTransforms;

    sceneRef.current.add(hips);
    hips.updateMatrixWorld(true);

    if (skeletonHelperRef.current) sceneRef.current.remove(skeletonHelperRef.current);
    const helper = new THREE.SkeletonHelper(hips);
    helper.material.linewidth = 2;
    helper.material.depthTest = false;
    helper.renderOrder = 998;
    helper.visible = showSkeleton;
    skeletonHelperRef.current = helper;
    sceneRef.current.add(helper);

    createBoneMarkers(humanoidBones);
    hasBaseBonesRef.current = true;
    updateFieldVolumes();
    triggerAutoSave();
  };

  const handleBindDirect = (customWeights = null) => {
    const model = currentModelRef.current;
    const skeleton = currentSkeletonRef.current;
    const bonesObj = humanoidBonesRef.current;

    if (!model || !skeleton || !bonesObj.hips) {
      alert('Primero genera y acomoda los huesos base.');
      return;
    }

    let sourceMeshes = baseSourceMeshesRef.current;
    if (!sourceMeshes.length) {
      model.traverse((n) => {
        if (n.isMesh && n.geometry) sourceMeshes.push(n);
      });
      baseSourceMeshesRef.current = sourceMeshes;
    }

    if (transformControlsRef.current) transformControlsRef.current.detach();
    setSelectedBoneName(null);

    sceneRef.current.remove(model);
    sceneRef.current.remove(bonesObj.hips);

    const riggedRoot = new THREE.Group();
    riggedRoot.add(bonesObj.hips);
    bonesObj.hips.updateMatrixWorld(true);

    const bones = Object.values(bonesObj);
    computeWeightsAndBind(sourceMeshes, riggedRoot, skeleton, bones, customWeights);

    const newInitTransforms = {};
    bones.forEach((bn) => {
      newInitTransforms[bn.name] = { rot: bn.rotation.clone(), pos: bn.position.clone() };
    });
    initialTransformsRef.current = newInitTransforms;

    currentModelRef.current = riggedRoot;
    sceneRef.current.add(riggedRoot);

    if (skeletonHelperRef.current) sceneRef.current.remove(skeletonHelperRef.current);
    const helper = new THREE.SkeletonHelper(riggedRoot);
    helper.material.linewidth = 2;
    helper.material.depthTest = false;
    helper.renderOrder = 998;
    helper.visible = showSkeleton;
    skeletonHelperRef.current = helper;
    sceneRef.current.add(helper);

    createBoneMarkers(humanoidBonesRef.current);
    isRiggedRef.current = true;
    hasBaseBonesRef.current = true;
    setActiveTab('anim');
    updateFieldVolumes();

    triggerAutoSave();
    if (!customWeights) {
      alert('¡Rig generado con éxito y guardado en memoria!');
    }
  };

  const handleForceRebind = () => {
    const root = currentModelRef.current;
    const bonesObj = humanoidBonesRef.current;
    if (!root || !bonesObj.hips) {
      alert('Primero debes colocar huesos.');
      return;
    }

    pushWeightsUndoState();

    if (transformControlsRef.current) transformControlsRef.current.detach();
    setSelectedBoneName(null);

    let sourceMeshes = baseSourceMeshesRef.current;
    if (!sourceMeshes.length) {
      root.traverse((n) => {
        if (n.isMesh && n.geometry) sourceMeshes.push(n);
      });
      baseSourceMeshesRef.current = sourceMeshes;
    }

    const toRemove = [];
    root.traverse((n) => {
      if (n.isSkinnedMesh) toRemove.push(n);
    });
    toRemove.forEach((sm) => root.remove(sm));

    bonesObj.hips.updateMatrixWorld(true);
    const bones = Object.values(bonesObj);
    const skeleton = currentSkeletonRef.current || new THREE.Skeleton(bones);
    currentSkeletonRef.current = skeleton;

    computeWeightsAndBind(sourceMeshes, root, skeleton, bones);

    updateMarkerPositions();
    updateFieldVolumes();
    triggerAutoSave();
    alert('🔗 ¡Malla re-enlazada exitosamente a las nuevas posiciones!');
  };

  const handleResetWeights = () => {
    const meshes = getSkinnedMeshes();
    if (!meshes.length) return;

    pushWeightsUndoState();

    meshes.forEach((m) => {
      const w0 = m.userData.w0;
      const a = m.geometry.attributes;
      if (!w0) return;
      a.skinIndex.array.set(w0[0]);
      a.skinWeight.array.set(w0[1]);
      a.skinIndex.needsUpdate = true;
      a.skinWeight.needsUpdate = true;

      if (selectedBoneName) {
        const b = m.skeleton.bones.find((bn) => bn.name === selectedBoneName);
        if (b) updateHeat(m, m.skeleton.bones.indexOf(b));
      }
    });
    triggerAutoSave();
    alert('Pesos originales restaurados.');
  };

  const handleExportGLB = () => {
    const root = currentModelRef.current;
    if (!root) {
      alert('No hay ningún modelo cargado para exportar.');
      return;
    }

    if (transformControlsRef.current) transformControlsRef.current.detach();
    setSelectedBoneName(null);
    setPaintMode(null);
    setShowHeatmap(false);

    const skinnedMeshes = getSkinnedMeshes();
    skinnedMeshes.forEach((m) => {
      if (origMaterialsRef.current.has(m.uuid)) {
        m.material = origMaterialsRef.current.get(m.uuid);
      }
      if (m.geometry && m.geometry.attributes.color) {
        m.geometry.deleteAttribute('color');
      }
    });

    root.updateMatrixWorld(true);
    if (currentSkeletonRef.current) {
      currentSkeletonRef.current.calculateInverses();
      currentSkeletonRef.current.update();
    }

    const exporter = new GLTFExporter();
    const options = {
      binary: true,
      onlyVisible: false,
      embedImages: true,
      truncateDrawRange: false
    };

    exporter.parse(
      root,
      (buffer) => {
        if (!buffer || buffer.byteLength < 500) {
          alert('Error: el buffer GLB está vacío.');
          return;
        }

        const blob = new Blob([buffer], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const baseName = meshInfo ? meshInfo.replace(/\.(glb|vrm)$/i, '') : 'modelo';
        link.download = `${baseName}_render.glb`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        alert(`✅ Modelo exportado correctamente como GLB (${(buffer.byteLength / (1024 * 1024)).toFixed(2)} MB)`);
      },
      (error) => {
        console.error('Error al exportar GLB:', error);
        alert('Error al generar el archivo GLB.');
      },
      options
    );
  };

  const handleExportVRM = () => {
    const root = currentModelRef.current;
    if (!root || !humanoidBonesRef.current.hips) {
      alert('Debes generar el rig antes de exportar como VRM.');
      return;
    }

    if (transformControlsRef.current) transformControlsRef.current.detach();
    setSelectedBoneName(null);
    setPaintMode(null);
    setShowHeatmap(false);

    const bones = humanoidBonesRef.current;
    const init = initialTransformsRef.current;
    Object.keys(bones).forEach((name) => {
      if (init[name]) {
        bones[name].rotation.copy(init[name].rot);
      }
    });

    const skinnedMeshes = getSkinnedMeshes();
    skinnedMeshes.forEach((m) => {
      if (origMaterialsRef.current.has(m.uuid)) {
        m.material = origMaterialsRef.current.get(m.uuid);
      }
      if (m.geometry && m.geometry.attributes.color) {
        m.geometry.deleteAttribute('color');
      }
    });

    root.updateMatrixWorld(true);
    if (currentSkeletonRef.current) {
      currentSkeletonRef.current.calculateInverses();
      currentSkeletonRef.current.update();
    }

    const originalNames = {};
    Object.keys(humanoidBonesRef.current).forEach((key) => {
      const bone = humanoidBonesRef.current[key];
      originalNames[key] = bone.name;
      if (VRM_BONE_MAP[key]) {
        bone.name = VRM_BONE_MAP[key];
      }
    });

    const exporter = new GLTFExporter();
    const options = {
      binary: true,
      onlyVisible: false,
      embedImages: true,
      truncateDrawRange: false
    };

    exporter.parse(
      root,
      (glbArrayBuffer) => {
        Object.keys(humanoidBonesRef.current).forEach((key) => {
          humanoidBonesRef.current[key].name = originalNames[key];
        });

        if (!glbArrayBuffer || glbArrayBuffer.byteLength < 500) {
          alert('Error: el buffer GLB está vacío.');
          return;
        }

        const dataView = new DataView(glbArrayBuffer);
        const jsonLength = dataView.getUint32(12, true);
        const jsonBytes = new Uint8Array(glbArrayBuffer, 20, jsonLength);
        const jsonText = new TextDecoder().decode(jsonBytes);
        const gltf = JSON.parse(jsonText);

        const vrmHumanBones = [];
        if (gltf.nodes) {
          gltf.nodes.forEach((node, idx) => {
            const vrmName = Object.values(VRM_BONE_MAP).find((n) => n === node.name);
            if (vrmName) {
              vrmHumanBones.push({
                bone: vrmName,
                node: idx,
                useDefaultValues: true
              });
            }
          });
        }

        gltf.extensionsUsed = gltf.extensionsUsed || [];
        if (!gltf.extensionsUsed.includes('VRM')) gltf.extensionsUsed.push('VRM');

        const titleName = meshInfo ? meshInfo.replace(/\.(glb|vrm)$/i, '') : 'Avatar';

        gltf.extensions = gltf.extensions || {};
        gltf.extensions.VRM = {
          exporterVersion: 'three-vrm-autorig-1.0',
          specVersion: '0.0',
          meta: {
            title: titleName,
            version: '1.0',
            author: 'Fanzxy',
            contactInformation: '',
            reference: '',
            allowedUserName: 'Everyone',
            violentUsa: 'Allow',
            sexualUsa: 'Allow',
            commercialUsa: 'Allow',
            otherPermissionUrl: '',
            licenseName: 'Other',
            otherLicenseUrl: ''
          },
          humanoid: {
            humanBones: vrmHumanBones,
            armStretch: 0.05,
            legStretch: 0.05,
            upperArmTwist: 0.5,
            lowerArmTwist: 0.5
          },
          firstPerson: {
            firstPersonBone: vrmHumanBones.find((b) => b.bone === 'head')?.node ?? 0,
            firstPersonBoneOffset: { x: 0, y: 0.06, z: 0 },
            meshAnnotations: [],
            lookAtTypeName: 'Default'
          },
          blendShapeMaster: {
            blendShapeGroups: []
          },
          secondaryAnimation: {
            boneGroups: [],
            colliderGroups: []
          }
        };

        const newJsonStr = JSON.stringify(gltf);
        const newJsonEncoded = new TextEncoder().encode(newJsonStr);
        const newJsonPadding = (4 - (newJsonEncoded.byteLength % 4)) % 4;
        const newJsonLength = newJsonEncoded.byteLength + newJsonPadding;

        const binOffset = 20 + jsonLength;
        const binLength = glbArrayBuffer.byteLength - binOffset;
        const binBytes = new Uint8Array(glbArrayBuffer, binOffset, binLength);

        const newTotalSize = 12 + 8 + newJsonLength + binLength;
        const finalBuffer = new ArrayBuffer(newTotalSize);
        const finalView = new DataView(finalBuffer);

        finalView.setUint32(0, 0x46546C67, true);
        finalView.setUint32(4, 2, true);
        finalView.setUint32(8, newTotalSize, true);

        finalView.setUint32(12, newJsonLength, true);
        finalView.setUint32(16, 0x4E4F534A, true);
        const finalUint8 = new Uint8Array(finalBuffer);
        finalUint8.set(newJsonEncoded, 20);
        for (let i = 0; i < newJsonPadding; i++) {
          finalUint8[20 + newJsonEncoded.byteLength + i] = 0x20;
        }

        finalUint8.set(binBytes, 20 + newJsonLength);

        const blob = new Blob([finalBuffer], { type: 'model/vrm' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${titleName}.vrm`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        alert(`✅ Archivo VRM nativo generado con éxito (${(finalBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB).`);
      },
      (error) => {
        Object.keys(humanoidBonesRef.current).forEach((key) => {
          humanoidBonesRef.current[key].name = originalNames[key];
        });
        console.error('Error al exportar VRM:', error);
        alert('Error al generar el archivo VRM.');
      },
      options
    );
  };

  return (
    <>
      <div id="canvas-container" ref={containerRef} />
      <div id="fps-meter">{fps} FPS</div>


      <div className="top-actions">
        <Link 
          to="/" 
          className="floating-btn" 
          title="Ir al Editor VRM"
          style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          🎭
        </Link>
        <button className="floating-btn" onClick={() => eruda.show()}>🐛</button>
        <button
          className="floating-btn"
          disabled={undoStackCount === 0}
          title="Deshacer (Ctrl+Z)"
          style={{ opacity: undoStackCount > 0 ? 1 : 0.4 }}
          onClick={handleUndo}
        >
          ↩️
        </button>
        <button className="floating-btn" onClick={() => setPanelVisible(!panelVisible)}>
          {panelVisible ? '👁️' : '📋'}
        </button>
      </div>


      <div className="top-actions">
        <button className="floating-btn" onClick={() => eruda.show()}>🐛</button>
        <button
          className="floating-btn"
          disabled={undoStackCount === 0}
          title="Deshacer (Ctrl+Z)"
          style={{ opacity: undoStackCount > 0 ? 1 : 0.4 }}
          onClick={handleUndo}
        >
          ↩️
        </button>
        <button className="floating-btn" onClick={() => setPanelVisible(!panelVisible)}>
          {panelVisible ? '👁️' : '📋'}
        </button>
      </div>

      <div className={`dock-panel ${panelVisible ? '' : 'hidden'}`}>
        <div className="panel-header">
          <h3>Auto-Rig VRM</h3>
          <span style={{ fontSize: 11, color: '#06b6d4' }}>{meshInfo}</span>
        </div>

        <div className="tabs-bar">
          <button
            className={`tab-btn ${activeTab === 'load' ? 'active' : ''}`}
            onClick={() => setActiveTab('load')}
          >
            📁 <span>Carga</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'bones' ? 'active' : ''}`}
            onClick={() => setActiveTab('bones')}
          >
            🦴 <span>Huesos</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'paint' ? 'active' : ''}`}
            onClick={() => setActiveTab('paint')}
          >
            🎨 <span>Pincel</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'anim' ? 'active' : ''}`}
            onClick={() => setActiveTab('anim')}
          >
            🏃 <span>Probar</span>
          </button>
        </div>

        {activeTab === 'load' && (
          <div className="tab-content">
            <input
              type="file"
              ref={glbInputRef}
              style={{ display: 'none' }}
              accept=".glb,.gltf"
              onChange={handleGLBChange}
            />
            <button
              className="btn-primary"
              onClick={() => glbInputRef.current && glbInputRef.current.click()}
            >
              📁 Subir GLB para Auto-Rig
            </button>

            <input
              type="file"
              ref={vrmInputRef}
              style={{ display: 'none' }}
              accept=".vrm"
              onChange={handleVRMChange}
            />
            <button
              className="btn-vrm"
              onClick={() => vrmInputRef.current && vrmInputRef.current.click()}
            >
              🟣 Cargar Modelo VRM Oficial (.vrm)
            </button>

            {/* CONTROL DE COLOR DE FONDO */}
            <div className="slider-group" style={{ marginTop: 6 }}>
              <div className="slider-header">
                <span>Color de Fondo</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{bgColor}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: 4 }}>
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  style={{
                    border: 'none',
                    width: '36px',
                    height: '32px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: 'transparent'
                  }}
                />
                <div className="btn-row" style={{ flex: 1, margin: 0 }}>
                  <button onClick={() => setBgColor('#0c1017')}>Oscuro</button>
                  <button onClick={() => setBgColor('#555555')}>Gris</button>
                  <button onClick={() => setBgColor('#00ff00')}>Chroma</button>
                  <button onClick={() => setBgColor('#ffffff')}>Blanco</button>
                </div>
              </div>
            </div>

            <div className="btn-row-4" style={{ marginTop: 6 }}>
              <button onClick={() => rotateStep(-45)}>⟲ -45°</button>
              <button onClick={() => rotateStep(45)}>⟳ +45°</button>
              <button onClick={() => rotateStep(-90)}>-90°</button>
              <button onClick={() => rotateStep(90)}>+90°</button>
            </div>
            <div className="btn-row">
              <button onClick={() => rotatePitch(90)}>X +90°</button>
              <button onClick={() => rotateStep(180)}>180° Frente</button>
            </div>

            <div className="slider-group">
              <div className="slider-header">
                <span>Rotación Y</span>
                <span>{rotY}°</span>
              </div>
              <input
                type="range"
                min="-180"
                max="180"
                value={rotY}
                onChange={(e) => handleRotYSlider(Number(e.target.value))}
              />
            </div>

            <div className="slider-group">
              <div className="slider-header">
                <span>Escala</span>
                <span>{modelScale.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="3.0"
                step="0.05"
                value={modelScale}
                onChange={(e) => handleScaleSlider(Number(e.target.value))}
              />
            </div>

            <button className="btn-freeze" onClick={freezeTransforms}>
              ❄️ Congelar y Fijar Base
            </button>

            <button
              onClick={handleExportGLB}
              style={{
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                color: '#fff',
                border: 'none',
                padding: '10px',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginTop: 6
              }}
            >
              💾 Export GLB (Render Actual)
            </button>
          </div>
        )}

        {activeTab === 'bones' && (
          <div className="tab-content">
            <div className="btn-row">
              <button
                className={armAngle === 0 ? 'btn-active' : ''}
                onClick={() => {
                  setArmAngle(0);
                  handleGenerateBaseBones();
                }}
              >
                Pose T (0°)
              </button>
              <button
                className={armAngle === 45 ? 'btn-active' : ''}
                onClick={() => {
                  setArmAngle(45);
                  handleGenerateBaseBones();
                }}
              >
                Pose A (45°)
              </button>
            </div>

            <div className="slider-group">
              <div className="slider-header">
                <span>Ángulo Brazos</span>
                <span>{armAngle}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="80"
                value={armAngle}
                onChange={(e) => {
                  setArmAngle(Number(e.target.value));
                  handleGenerateBaseBones();
                }}
              />
            </div>

            <div className="slider-group">
              <div className="slider-header">
                <span>Longitud Brazos</span>
                <span>{armSpanFactor.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="2.5"
                step="0.02"
                value={armSpanFactor}
                onChange={(e) => {
                  setArmSpanFactor(Number(e.target.value));
                  handleGenerateBaseBones();
                }}
              />
            </div>

            <div className="slider-group">
              <div className="slider-header">
                <span>Ancho Hombros</span>
                <span>{shoulderWidthFactor.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.6"
                max="1.8"
                step="0.05"
                value={shoulderWidthFactor}
                onChange={(e) => {
                  setShoulderWidthFactor(Number(e.target.value));
                  handleGenerateBaseBones();
                }}
              />
            </div>

            <div className="slider-group">
              <div className="slider-header">
                <span>Separación Piernas</span>
                <span>{legSpreadFactor.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.6"
                step="0.05"
                value={legSpreadFactor}
                onChange={(e) => {
                  setLegSpreadFactor(Number(e.target.value));
                  handleGenerateBaseBones();
                }}
              />
            </div>

            {/* GROSOR DE CAMPOS REACTIVO AL DESLIZAR */}
            <div className="slider-group">
              <div className="slider-header">
                <span>Grosor Campos de Captura</span>
                <span>{fieldRadiusFactor.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.3"
                max="2.5"
                step="0.02"
                value={fieldRadiusFactor}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setFieldRadiusFactor(val);
                  fieldRadiusFactorRef.current = val;
                  updateFieldVolumes();
                  triggerAutoSave();
                }}
              />
            </div>

            <div className="slider-group">
              <div className="slider-header">
                <span>Largo Dedos</span>
                <span>{fingerLength.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="1.8"
                step="0.05"
                value={fingerLength}
                onChange={(e) => {
                  setFingerLength(Number(e.target.value));
                  handleGenerateBaseBones();
                }}
              />
            </div>

            <div className="slider-group">
              <div className="slider-header">
                <span>Profundidad Columna Z</span>
                <span>{spineOffsetZ.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="-0.2"
                max="0.2"
                step="0.01"
                value={spineOffsetZ}
                onChange={(e) => {
                  setSpineOffsetZ(Number(e.target.value));
                  handleGenerateBaseBones();
                }}
              />
            </div>

            <div className="btn-row" style={{ marginTop: 4 }}>
              <button
                className={showFieldVolumes ? 'btn-active' : ''}
                onClick={() => {
                  const next = !showFieldVolumes;
                  setShowFieldVolumes(next);
                  showFieldVolumesRef.current = next;
                  fieldVolumeGroupRef.current.visible = next;
                  updateFieldVolumes();
                }}
              >
                {showFieldVolumes ? '🌐 Ocultar Campos' : '🌐 Ver Campos de Influencia'}
              </button>
            </div>

            <button
              className="btn-primary"
              style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)', marginTop: 4 }}
              onClick={handleGenerateBaseBones}
            >
              🦴 1. Colocar Huesos Base (con Dedos)
            </button>

            <button
              className="btn-action-highlight"
              onClick={() => handleBindDirect()}
            >
              ⚡ 2. Enlazar Malla a Huesos (Rig Directo)
            </button>

            <button
              onClick={handleForceRebind}
              style={{
                background: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid #10b981',
                color: '#6ee7b7',
                padding: '8px',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginTop: 4
              }}
            >
              🔗 Re-Bind (Actualizar Enlace sin Reiniciar)
            </button>

            {selectedBoneName && (
              <div style={{ marginTop: 6, padding: 8, background: 'rgba(139, 92, 246, 0.1)', borderRadius: 8, border: '1px solid #8b5cf6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 'bold', color: '#c4b5fd' }}>
                    🦴 {selectedBoneName.toUpperCase()}
                  </span>
                  <button
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                    onClick={() => {
                      if (transformControlsRef.current) transformControlsRef.current.detach();
                      setSelectedBoneName(null);
                    }}
                  >
                    ✖
                  </button>
                </div>
                <div className="btn-row" style={{ marginTop: 4 }}>
                  <button
                    className={transformMode === 'translate' ? 'btn-active' : ''}
                    onClick={() => setTransformMode('translate')}
                  >
                    Mover ↕️
                  </button>
                  <button
                    className={transformMode === 'rotate' ? 'btn-active' : ''}
                    onClick={() => setTransformMode('rotate')}
                  >
                    Girar 🔄
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'paint' && (
          <div className="tab-content">
            {isPoseFrozen && (
              <div style={{ padding: '6px 8px', background: 'rgba(56, 189, 248, 0.15)', border: '1px solid #0284c7', borderRadius: 8, fontSize: 11, color: '#38bdf8' }}>
                ⏸️ <strong>Pose congelada:</strong> La malla mantiene la deformación actual para que puedas corregir los pesos con precisión.
              </div>
            )}

            <div>
              <label style={{ fontSize: 10, color: '#94a3b8' }}>Hueso activo para pintar/revisar:</label>
              <select
                style={{ width: '100%', marginTop: 3, background: '#1e293b', color: '#fff', padding: 6, borderRadius: 6, border: '1px solid #475569', fontSize: 11 }}
                value={selectedBoneName || ''}
                onChange={(e) => {
                  setSelectedBoneName(e.target.value);
                  if (transformControlsRef.current) transformControlsRef.current.detach();
                }}
              >
                <option value="">-- Selecciona un hueso --</option>
                {Object.keys(humanoidBonesRef.current).map((bName) => (
                  <option key={bName} value={bName}>{bName}</option>
                ))}
              </select>
            </div>

            <div className="btn-row">
              <button
                className={paintMode === 'add' ? 'btn-active' : ''}
                disabled={!selectedBoneName}
                onClick={() => togglePaintMode('add')}
              >
                🖌️ Pintar
              </button>
              <button
                className={paintMode === 'erase' ? 'btn-active' : ''}
                disabled={!selectedBoneName}
                onClick={() => togglePaintMode('erase')}
              >
                🧹 Borrar
              </button>
            </div>

            <div className="btn-row">
              <button
                disabled={undoStackCount === 0}
                style={{
                  background: undoStackCount > 0 ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.04)',
                  borderColor: '#3b82f6',
                  color: '#93c5fd',
                  opacity: undoStackCount > 0 ? 1 : 0.4
                }}
                onClick={handleUndo}
              >
                ↩️ Deshacer ({undoStackCount})
              </button>
              <button
                onClick={handleResetWeights}
                style={{ borderColor: '#ef4444', color: '#fca5a5' }}
              >
                ⏪ Restaurar
              </button>
            </div>

            <div className="slider-group">
              <div className="slider-header">
                <span>Radio Pincel</span>
                <span>{brushSize}</span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
              />
            </div>

            <div className="slider-group">
              <div className="slider-header">
                <span>Intensidad</span>
                <span>{brushStrength}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                value={brushStrength}
                onChange={(e) => setBrushStrength(Number(e.target.value))}
              />
            </div>

            <button
              className={showHeatmap ? 'btn-active' : ''}
              style={{ marginTop: 4 }}
              onClick={() => setShowHeatmap(!showHeatmap)}
            >
              {showHeatmap ? '🔥 Mapa Calor (ON)' : '👕 Textura Real'}
            </button>
          </div>
        )}

        {activeTab === 'anim' && (
          <div className="tab-content">
            <div className="btn-row">
              <button
                className={showMarkers ? 'btn-active' : ''}
                onClick={() => setShowMarkers(!showMarkers)}
              >
                {showMarkers ? '🟢 Ocultar Puntos' : '⚪ Ver Puntos'}
              </button>
              <button
                className={showSkeleton ? 'btn-active' : ''}
                onClick={() => setShowSkeleton(!showSkeleton)}
              >
                {showSkeleton ? '🦴 Ocultar Rig' : '🦴 Ver Rig'}
              </button>
            </div>

            <div className="btn-row">
              <button
                style={{
                  background: isPoseFrozen ? '#ef4444' : 'rgba(56, 189, 248, 0.2)',
                  borderColor: isPoseFrozen ? '#f87171' : '#38bdf8',
                  color: '#fff',
                  fontWeight: 'bold'
                }}
                onClick={toggleFreezePose}
              >
                {isPoseFrozen ? '▶️ Reanudar Movimiento' : '⏸️ Mantener Esta Pose'}
              </button>
              <button
                onClick={resetToBasePose}
              >
                ↩️ Volver a Base (T-Pose)
              </button>
            </div>

            <button
              onClick={handleForceRebind}
              style={{
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid #38bdf8',
                color: '#bae6fd',
                padding: '8px',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginTop: 4
              }}
            >
              🔗 Re-Bind Rápido en Pose
            </button>

            <div className="btn-row">
              <button
                className={activeAnim === 'tpose' && !isPoseFrozen ? 'btn-active' : ''}
                onClick={() => {
                  setIsPoseFrozen(false);
                  if (paintMode) togglePaintMode(paintMode);
                  setActiveAnim('tpose');
                }}
              >
                Pose Base
              </button>
              <button
                className={activeAnim === 'idle' && !isPoseFrozen ? 'btn-active' : ''}
                onClick={() => {
                  setIsPoseFrozen(false);
                  if (paintMode) togglePaintMode(paintMode);
                  setActiveAnim('idle');
                }}
              >
                Respiración
              </button>
            </div>

            <button
              className={activeAnim === 'walk' && !isPoseFrozen ? 'btn-active' : ''}
              onClick={() => {
                setIsPoseFrozen(false);
                if (paintMode) togglePaintMode(paintMode);
                setActiveAnim('walk');
              }}
            >
              Marcha
            </button>

            <div className="slider-group">
              <div className="slider-header">
                <span>Rotar Cabeza</span>
                <span>{headRot}°</span>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                value={headRot}
                onChange={(e) => setHeadRot(Number(e.target.value))}
              />
            </div>

            <div className="slider-group">
              <div className="slider-header">
                <span>Flexión Brazos</span>
                <span>{armsFlex}°</span>
              </div>
              <input
                type="range"
                min="-70"
                max="70"
                value={armsFlex}
                onChange={(e) => setArmsFlex(Number(e.target.value))}
              />
            </div>

            <div className="btn-row" style={{ marginTop: 6 }}>
              <button
                onClick={handleExportGLB}
                className="btn-primary"
                style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)', border: 'none' }}
              >
                💾 Export GLB
              </button>

              <button
                onClick={handleExportVRM}
                className="btn-success"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', border: 'none' }}
              >
                🟣 Export VRM
              </button>
            </div>

            <button
              onClick={handleFullReset}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                borderColor: '#ef4444',
                color: '#f87171',
                fontSize: 10,
                padding: '6px',
                borderRadius: '6px',
                border: '1px solid #ef4444',
                marginTop: 6
              }}
            >
              🧹 Reiniciar App y Borrar Caché
            </button>
          </div>
        )}
      </div>
    </>
  );
}
