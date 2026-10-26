import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import eruda from 'eruda';
import { compactIndexedGeometry } from './utils/meshOptimizer';
import './App.css';

// Mapeo a nomenclatura estándar VRM / Humanoid
const VRM_BONE_MAP = {
  hips: 'hips',
  spine: 'spine',
  chest: 'chest',
  neck: 'neck',
  head: 'head',
  upperArm_L: 'leftUpperArm',
  lowerArm_L: 'leftLowerArm',
  hand_L: 'leftHand',
  upperArm_R: 'rightUpperArm',
  lowerArm_R: 'rightLowerArm',
  hand_R: 'rightHand',
  upperLeg_L: 'leftUpperLeg',
  lowerLeg_L: 'leftLowerLeg',
  upperLeg_R: 'rightUpperLeg',
  lowerLeg_R: 'rightLowerLeg'
};

export default function App() {
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Estados de interfaz y secciones
  const [panelVisible, setPanelVisible] = useState(true);
  const [fps, setFps] = useState(0);
  const [meshInfo, setMeshInfo] = useState('Sin Modelo');
  const [openSection, setOpenSection] = useState('orient');

  // Visibilidad de elementos auxiliares
  const [showMarkers, setShowMarkers] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);

  // Estados de calibración y orientación previa
  const [rotY, setRotY] = useState(0);
  const [modelScale, setModelScale] = useState(1.0);
  const [armAngle, setArmAngle] = useState(45);
  const [spineOffsetZ, setSpineOffsetZ] = useState(0.0);

  // Estados de animación y edición
  const [activeAnim, setActiveAnim] = useState('tpose');
  const [headRot, setHeadRot] = useState(0);
  const [armsFlex, setArmsFlex] = useState(0);
  const [selectedBoneName, setSelectedBoneName] = useState(null);
  const [transformMode, setTransformMode] = useState('translate');

  // Referencias para que el bucle de animación no dependa del renderizado de React
  const animStateRef = useRef({
    activeAnim: 'tpose',
    headRot: 0,
    armsFlex: 0
  });

  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const transformControlsRef = useRef(null);

  const currentModelRef = useRef(null);
  const currentSkeletonRef = useRef(null);
  const skeletonHelperRef = useRef(null);
  const humanoidBonesRef = useRef({});
  const initialTransformsRef = useRef({});
  const boneMarkerGroupRef = useRef(new THREE.Group());

  useEffect(() => {
    animStateRef.current.activeAnim = activeAnim;
  }, [activeAnim]);

  useEffect(() => {
    animStateRef.current.headRot = headRot;
  }, [headRot]);

  useEffect(() => {
    animStateRef.current.armsFlex = armsFlex;
  }, [armsFlex]);

  const toggleSection = (sec) => {
    setOpenSection(prev => (prev === sec ? null : sec));
  };

  // Inicialización única de la escena
  useEffect(() => {
    if (!window.__erudaInit) {
      eruda.init();
      eruda.hide();
      window.__erudaInit = true;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1017);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.4, 3.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL Context Lost.');
    }, false);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.9, 0);
    controlsRef.current = controls;

    scene.add(boneMarkerGroupRef.current);

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.size = 0.75;
    transformControls.setMode('translate');

    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value;
    });

    transformControls.addEventListener('change', () => {
      updateMarkerPositions();
    });

    if (typeof transformControls.getHelper === 'function') {
      scene.add(transformControls.getHelper());
    } else {
      scene.add(transformControls);
    }
    transformControlsRef.current = transformControls;

    // Luces
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 1.4);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(3, 5, 4);
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x88bbff, 0.7);
    fillLight.position.set(-3, 3, -2);
    scene.add(fillLight);

    // Suelo y Flecha Guía (+Z)
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

    // Raycaster táctil para esferas de articulaciones
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event) => {
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

    let reqId;
    let frameCount = 0;
    let lastTime = performance.now();
    let clockTime = 0;

    const animate = () => {
      reqId = requestAnimationFrame(animate);

      clockTime += 0.016;
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = now;
      }

      controls.update();

      const bones = humanoidBonesRef.current;
      const init = initialTransformsRef.current;
      const { activeAnim: currentAnim, headRot: curHead, armsFlex: curFlex } = animStateRef.current;

      if (bones.hips && init.hips && !transformControls.dragging) {
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
          if (bones.upperLeg_L) bones.upperLeg_L.rotation.x = -Math.sin(cycle) * 0.45;
          if (bones.lowerLeg_L) bones.lowerLeg_L.rotation.x = Math.max(0, Math.sin(cycle) * 0.6);
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

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', handleResize);
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

  const createBoneMarkers = (bones) => {
    const group = boneMarkerGroupRef.current;
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    const markerGeo = new THREE.SphereGeometry(0.035, 12, 12);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.85,
      depthTest: false
    });

    Object.keys(bones).forEach((key) => {
      const bone = bones[key];
      const marker = new THREE.Mesh(markerGeo, markerMat.clone());
      marker.userData = { bone: bone };
      marker.renderOrder = 999;
      group.add(marker);
    });

    updateMarkerPositions();
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = (event) => {
      const loader = new GLTFLoader();
      loader.parse(
        event.target.result,
        '',
        (gltf) => {
          if (currentModelRef.current) sceneRef.current.remove(currentModelRef.current);
          if (skeletonHelperRef.current) sceneRef.current.remove(skeletonHelperRef.current);
          if (transformControlsRef.current) transformControlsRef.current.detach();
          setSelectedBoneName(null);

          const model = gltf.scene;
          currentModelRef.current = model;

          model.traverse((node) => {
            if (node.isMesh && node.material) {
              const mats = Array.isArray(node.material) ? node.material : [node.material];
              mats.forEach((m) => {
                m.side = THREE.DoubleSide;
                if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
              });
            }
          });

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
          setMeshInfo(`${file.name.slice(0, 14)}`);
          setRotY(0);
          setModelScale(1.0);
          setOpenSection('orient');
        },
        (error) => {
          console.error(error);
          alert('Error al leer el archivo GLB.');
        }
      );
    };

    e.target.value = '';
  };

  const rotateStep = (deg) => {
    if (!currentModelRef.current) return;
    const newDeg = (rotY + deg) % 360;
    setRotY(newDeg);
    currentModelRef.current.rotation.y = (newDeg * Math.PI) / 180;
  };

  const rotatePitch = (deg) => {
    if (!currentModelRef.current) return;
    currentModelRef.current.rotation.x += (deg * Math.PI) / 180;
  };

  const handleRotYSlider = (val) => {
    setRotY(val);
    if (currentModelRef.current) {
      currentModelRef.current.rotation.y = (val * Math.PI) / 180;
    }
  };

  const handleScaleSlider = (val) => {
    setModelScale(val);
    if (currentModelRef.current) {
      currentModelRef.current.scale.setScalar(val);
    }
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
    alert('Transformación fijada.');
    setOpenSection('bones');
  };

  // Función común para enlazar mallas al esqueleto
  const computeWeightsAndBind = (sourceMeshes, targetGroup, skeleton, bones) => {
    skeleton.calculateInverses();

    const boneWorldPos = bones.map((bn) => {
      const v = new THREE.Vector3();
      bn.getWorldPosition(v);
      return v;
    });

    sourceMeshes.forEach((m) => {
      m.updateMatrixWorld(true);
      let geo = m.geometry.clone();
      geo.applyMatrix4(m.matrixWorld);

      geo = compactIndexedGeometry(geo);

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
          let penalty = 1.0;
          if (bName.endsWith('_R') && vertPos.x > 0.02) penalty = 15.0;
          if (bName.endsWith('_L') && vertPos.x < -0.02) penalty = 15.0;

          dists.push({ index: j, dist: vertPos.distanceTo(boneWorldPos[j]) * penalty });
        }

        dists.sort((a, b) => a.dist - b.dist);
        const top4 = dists.slice(0, 4);

        let sumW = 0;
        const weights = top4.map((item) => {
          const w = 1.0 / Math.pow(Math.max(item.dist, 0.04), 2.2);
          sumW += w;
          return w;
        });

        skinIndices.push(top4[0].index, top4[1].index, top4[2].index, top4[3].index);
        skinWeights.push(weights[0] / sumW, weights[1] / sumW, weights[2] / sumW, weights[3] / sumW);
      }

      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

      const origMat = Array.isArray(m.material) ? m.material[0] : m.material;
      const skinMat = origMat.clone();
      skinMat.side = THREE.DoubleSide;
      skinMat.needsUpdate = true;

      const sm = new THREE.SkinnedMesh(geo, skinMat);
      sm.frustumCulled = false;
      sm.bind(skeleton);
      targetGroup.add(sm);
    });
  };

  const handleAutoRig = () => {
    const model = currentModelRef.current;
    if (!model) {
      alert('Primero sube un modelo GLB.');
      return;
    }

    model.updateMatrixWorld(true);

    // Extraer mallas originales antes de crear el nuevo grupo
    const sourceMeshes = [];
    model.traverse((n) => {
      if (n.isMesh && n.geometry) sourceMeshes.push(n);
    });

    if (sourceMeshes.length === 0) return;

    const b = new THREE.Box3().setFromObject(model);
    const minY = b.min.y;
    const H = b.max.y - minY;
    const midX = (b.min.x + b.max.x) / 2;
    const midZ = (b.min.z + b.max.z) / 2 + spineOffsetZ;
    const armSpan = (b.max.x - b.min.x) * 0.45;

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

    const hips = makeBone('hips', midX, minY + H * 0.53, midZ);
    const spine = makeBone('spine', 0, minY + H * 0.65 - (minY + H * 0.53), 0);
    const chest = makeBone('chest', 0, minY + H * 0.76 - (minY + H * 0.65), 0);
    const neck = makeBone('neck', 0, minY + H * 0.86 - (minY + H * 0.76), 0);
    const head = makeBone('head', 0, minY + H * 0.94 - (minY + H * 0.86), 0);

    hips.add(spine);
    spine.add(chest);
    chest.add(neck);
    neck.add(head);

    const rad = (armAngle * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const upperArmR = makeBone('upperArm_R', -armSpan * 0.35, 0, 0);
    const lowerArmR = makeBone('lowerArm_R', -cosA * armSpan * 0.33, -sinA * armSpan * 0.33, 0);
    const handR = makeBone('hand_R', -cosA * armSpan * 0.30, -sinA * armSpan * 0.30, 0);
    chest.add(upperArmR);
    upperArmR.add(lowerArmR);
    lowerArmR.add(handR);

    const upperArmL = makeBone('upperArm_L', armSpan * 0.35, 0, 0);
    const lowerArmL = makeBone('lowerArm_L', cosA * armSpan * 0.33, -sinA * armSpan * 0.33, 0);
    const handL = makeBone('hand_L', cosA * armSpan * 0.30, -sinA * armSpan * 0.30, 0);
    chest.add(upperArmL);
    upperArmL.add(lowerArmL);
    lowerArmL.add(handL);

    const kneeY = minY + H * 0.28;
    const footY = minY + H * 0.05;

    const upperLegR = makeBone('upperLeg_R', -armSpan * 0.25, -(minY + H * 0.53 - kneeY), 0);
    const lowerLegR = makeBone('lowerLeg_R', 0, -(kneeY - footY), 0);
    hips.add(upperLegR);
    upperLegR.add(lowerLegR);

    const upperLegL = makeBone('upperLeg_L', armSpan * 0.25, -(minY + H * 0.53 - kneeY), 0);
    const lowerLegL = makeBone('lowerLeg_L', 0, -(kneeY - footY), 0);
    hips.add(upperLegL);
    upperLegL.add(lowerLegL);

    const skeleton = new THREE.Skeleton(bones);
    currentSkeletonRef.current = skeleton;

    const riggedRoot = new THREE.Group();
    riggedRoot.add(hips);
    hips.updateMatrixWorld(true);

    computeWeightsAndBind(sourceMeshes, riggedRoot, skeleton, bones);

    const initTransforms = {};
    bones.forEach((bn) => {
      initTransforms[bn.name] = { rot: bn.rotation.clone(), pos: bn.position.clone() };
    });

    humanoidBonesRef.current = humanoidBones;
    initialTransformsRef.current = initTransforms;

    sceneRef.current.remove(currentModelRef.current);
    currentModelRef.current = riggedRoot;
    sceneRef.current.add(riggedRoot);

    if (skeletonHelperRef.current) sceneRef.current.remove(skeletonHelperRef.current);
    const helper = new THREE.SkeletonHelper(riggedRoot);
    helper.visible = showSkeleton;
    skeletonHelperRef.current = helper;
    sceneRef.current.add(helper);

    createBoneMarkers(humanoidBones);
    setOpenSection('anim');
  };

  const handleRebindWeights = () => {
    const root = currentModelRef.current;
    const skeleton = currentSkeletonRef.current;
    const bonesObj = humanoidBonesRef.current;

    if (!root || !skeleton || !bonesObj.hips) {
      alert('Primero debes generar el rig.');
      return;
    }

    const sourceMeshes = [];
    const skinnedMeshesToRemove = [];
    root.traverse((node) => {
      if (node.isSkinnedMesh) {
        skinnedMeshesToRemove.push(node);
        sourceMeshes.push(node);
      }
    });

    skinnedMeshesToRemove.forEach((sm) => root.remove(sm));

    if (transformControlsRef.current) transformControlsRef.current.detach();
    setSelectedBoneName(null);

    bonesObj.hips.updateMatrixWorld(true);

    const bones = Object.values(bonesObj);
    computeWeightsAndBind(sourceMeshes, root, skeleton, bones);

    const newInitTransforms = {};
    bones.forEach((bn) => {
      newInitTransforms[bn.name] = { rot: bn.rotation.clone(), pos: bn.position.clone() };
    });
    initialTransformsRef.current = newInitTransforms;

    updateMarkerPositions();
    alert('Pesos recalculados según la nueva posición.');
  };

  const handleExport = () => {
    if (!currentModelRef.current || !humanoidBonesRef.current.hips) {
      alert('Debes ejecutar el rigging antes de exportar.');
      return;
    }

    setActiveAnim('tpose');
    if (transformControlsRef.current) transformControlsRef.current.detach();
    setSelectedBoneName(null);

    const originalNames = {};
    Object.keys(humanoidBonesRef.current).forEach((key) => {
      const bone = humanoidBonesRef.current[key];
      originalNames[key] = bone.name;
      if (VRM_BONE_MAP[key]) {
        bone.name = VRM_BONE_MAP[key];
      }
    });

    const exporter = new GLTFExporter();
    exporter.parse(
      currentModelRef.current,
      (buffer) => {
        Object.keys(humanoidBonesRef.current).forEach((key) => {
          humanoidBonesRef.current[key].name = originalNames[key];
        });

        const blob = new Blob([buffer], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'modelo_vrm_humanoid.glb';
        link.click();
        URL.revokeObjectURL(url);
      },
      { binary: true }
    );
  };

  return (
    <>
      <div id="canvas-container" ref={containerRef} />
      <div id="fps-meter">{fps} FPS</div>

      <div className="top-actions">
        <button className="floating-btn" onClick={() => eruda.show()}>🐛</button>
        <button className="floating-btn" onClick={() => setPanelVisible(!panelVisible)}>
          {panelVisible ? '👁️' : '📋'}
        </button>
      </div>

      <div className={`dock-panel ${panelVisible ? '' : 'hidden'}`}>
        <div className="panel-header">
          <h3>Auto-Rig VRM Studio</h3>
          <span style={{ fontSize: 11, color: '#06b6d4' }}>{meshInfo}</span>
        </div>

        <div className="panel-body">
          {/* 1. MALLA BASE */}
          <div className="card-section">
            <div className="section-header" onClick={() => toggleSection('model')}>
              <div className="section-title"><span>1. Malla Base</span></div>
              <span className="accordion-arrow">{openSection === 'model' ? '▲' : '▼'}</span>
            </div>
            {openSection === 'model' && (
              <div className="section-content">
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept=".glb,.gltf"
                  onChange={handleFileChange}
                />
                <button
                  className="btn-primary"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                >
                  📁 Seleccionar Archivo GLB
                </button>
              </div>
            )}
          </div>

          {/* 1.5 ORIENTACIÓN */}
          <div className="card-section">
            <div className="section-header" onClick={() => toggleSection('orient')}>
              <div className="section-title">
                <span>1.5 Orientación y Giro</span>
                <span style={{ fontSize: 9, color: '#06b6d4' }}>Alinear a Flecha</span>
              </div>
              <span className="accordion-arrow">{openSection === 'orient' ? '▲' : '▼'}</span>
            </div>
            {openSection === 'orient' && (
              <div className="section-content">
                <div className="btn-row-4">
                  <button onClick={() => rotateStep(-45)}>⟲ -45°</button>
                  <button onClick={() => rotateStep(45)}>⟳ +45°</button>
                  <button onClick={() => rotateStep(-90)}>-90°</button>
                  <button onClick={() => rotateStep(90)}>+90°</button>
                </div>
                <div className="btn-row">
                  <button onClick={() => rotatePitch(90)}>X +90° (Parar)</button>
                  <button onClick={() => rotateStep(180)}>180° Frente</button>
                </div>

                <div className="slider-group">
                  <div className="slider-header">
                    <span>Rotación fina Y</span>
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
                    <span>Escala General</span>
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
              </div>
            )}
          </div>

          {/* 2. CALIBRACIÓN HUESOS */}
          <div className="card-section">
            <div className="section-header" onClick={() => toggleSection('bones')}>
              <div className="section-title"><span>2. Calibrar Huesos (Pose A / T)</span></div>
              <span className="accordion-arrow">{openSection === 'bones' ? '▲' : '▼'}</span>
            </div>
            {openSection === 'bones' && (
              <div className="section-content">
                <div className="btn-row">
                  <button
                    className={armAngle === 0 ? 'btn-active' : ''}
                    onClick={() => setArmAngle(0)}
                  >
                    Pose T (0°)
                  </button>
                  <button
                    className={armAngle === 45 ? 'btn-active' : ''}
                    onClick={() => setArmAngle(45)}
                  >
                    Pose A (45°)
                  </button>
                </div>

                <div className="slider-group">
                  <div className="slider-header">
                    <span>Caída Brazos (Ángulo Z)</span>
                    <span>{armAngle}°</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="75"
                    value={armAngle}
                    onChange={(e) => setArmAngle(Number(e.target.value))}
                  />
                </div>

                <div className="slider-group">
                  <div className="slider-header">
                    <span>Columna Profundidad Z</span>
                    <span>{spineOffsetZ.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="-0.2"
                    max="0.2"
                    step="0.01"
                    value={spineOffsetZ}
                    onChange={(e) => setSpineOffsetZ(Number(e.target.value))}
                  />
                </div>

                <button className="btn-primary" onClick={handleAutoRig}>
                  ⚡ Generar Rig con esta Pose
                </button>
              </div>
            )}
          </div>

          {/* EDICIÓN MANUAL DEL HUESO SELECCIONADO */}
          {selectedBoneName && (
            <div className="card-section" style={{ border: '1px solid #8b5cf6', background: 'rgba(139, 92, 246, 0.05)' }}>
              <div className="section-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 'bold', color: '#c4b5fd' }}>
                    🦴 EDITANDO: {selectedBoneName.toUpperCase()}
                  </span>
                  <button
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 4px', fontSize: 12 }}
                    onClick={() => {
                      transformControlsRef.current.detach();
                      setSelectedBoneName(null);
                    }}
                  >
                    ✖
                  </button>
                </div>

                <div className="btn-row" style={{ marginTop: 5 }}>
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

                <button
                  className="btn-rebind"
                  onClick={handleRebindWeights}
                >
                  🔄 Recalcular Pesos (Re-Bind)
                </button>
              </div>
            </div>
          )}

          {/* 3. VISIBILIDAD & MOVIMIENTO */}
          <div className="card-section">
            <div className="section-header" onClick={() => toggleSection('anim')}>
              <div className="section-title"><span>3. Articulación & Movimiento</span></div>
              <span className="accordion-arrow">{openSection === 'anim' ? '▲' : '▼'}</span>
            </div>
            {openSection === 'anim' && (
              <div className="section-content">
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
                    className={activeAnim === 'tpose' ? 'btn-active' : ''}
                    onClick={() => setActiveAnim('tpose')}
                  >
                    Pose Base
                  </button>
                  <button
                    className={activeAnim === 'idle' ? 'btn-active' : ''}
                    onClick={() => setActiveAnim('idle')}
                  >
                    Respiración
                  </button>
                </div>

                <button
                  className={activeAnim === 'walk' ? 'btn-active' : ''}
                  onClick={() => setActiveAnim('walk')}
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
              </div>
            )}
          </div>

          {/* 4. EXPORTACIÓN */}
          <div className="card-section">
            <div className="section-content">
              <button
                onClick={handleExport}
                className="btn-success"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none' }}
              >
                💾 Exportar Modelo VRM/Humanoid (.glb)
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
