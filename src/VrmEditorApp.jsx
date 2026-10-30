import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import eruda from 'eruda';
import { Link } from 'react-router-dom';
import BoneCalibratorPanel from './BoneCalibratorPanel';

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
  little2_R: 'rightLittleDistal',
  J_Bip_C_Hips: 'hips',
  J_Bip_C_Spine: 'spine',
  J_Bip_C_Chest: 'chest',
  J_Bip_C_UpperChest: 'upperChest',
  J_Bip_C_Neck: 'neck',
  J_Bip_C_Head: 'head',
  J_Bip_L_Shoulder: 'leftShoulder',
  J_Bip_L_UpperArm: 'leftUpperArm',
  J_Bip_L_LowerArm: 'leftLowerArm',
  J_Bip_L_Hand: 'leftHand',
  J_Bip_R_Shoulder: 'rightShoulder',
  J_Bip_R_UpperArm: 'rightUpperArm',
  J_Bip_R_LowerArm: 'rightLowerArm',
  J_Bip_R_Hand: 'rightHand',
  J_Bip_L_UpperLeg: 'leftUpperLeg',
  J_Bip_L_LowerLeg: 'leftLowerLeg',
  J_Bip_L_Foot: 'leftFoot',
  J_Bip_L_ToeBase: 'leftToes',
  J_Bip_R_UpperLeg: 'rightUpperLeg',
  J_Bip_R_LowerLeg: 'rightLowerLeg',
  J_Bip_R_Foot: 'rightFoot',
  J_Bip_R_ToeBase: 'rightToes'
};

function createBoneLabelSprite(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(4, 8, 248, 48, 10);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 18), 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });

  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(0.22, 0.055, 1);
  sprite.renderOrder = 1000;
  return sprite;
}

export default function VrmEditorApp() {
  const [showCalibrator, setShowCalibrator] = useState(false);

  const containerRef = useRef(null);
  const vrmInputRef = useRef(null);
  const sceneRef = useRef(null);
  const currentModelRef = useRef(null);
  const transformControlsRef = useRef(null);
  const skeletonHelperRef = useRef(null);

  const boneMarkersGroupRef = useRef(new THREE.Group());
  const boneLabelsGroupRef = useRef(new THREE.Group());
  const bonesMapRef = useRef({});

  const [modelName, setModelName] = useState('Sin Modelo');
  const [bgColor, setBgColor] = useState('#1e293b');
  const [selectedBoneName, setSelectedBoneName] = useState('');
  const [boneList, setBoneList] = useState([]);
  const [transformMode, setTransformMode] = useState('rotate');
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showBoneNames, setShowBoneNames] = useState(false);
  const [currentCorrectionDeg, setCurrentCorrectionDeg] = useState(0);
  const [panelVisible, setPanelVisible] = useState(true);

  const [activeMaterialMode, setActiveMaterialMode] = useState('standard');
  const originalMaterialsCacheRef = useRef(new Map());

  const updateBoneOverlays = () => {
    const tempPos = new THREE.Vector3();

    boneMarkersGroupRef.current.children.forEach((marker) => {
      const bone = marker.userData.bone;
      if (bone) {
        bone.getWorldPosition(tempPos);
        marker.position.copy(tempPos);
      }
    });

    boneLabelsGroupRef.current.children.forEach((sprite) => {
      const bone = sprite.userData.bone;
      if (bone) {
        bone.getWorldPosition(tempPos);
        sprite.position.set(tempPos.x, tempPos.y + 0.035, tempPos.z);
      }
    });
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

    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 50);
    camera.position.set(0, 1.25, 2.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.9, 0);

    scene.add(boneMarkersGroupRef.current);
    scene.add(boneLabelsGroupRef.current);

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setMode('rotate');
    transform.size = 0.75;
    transform.addEventListener('dragging-changed', (e) => {
      controls.enabled = !e.value;
    });
    transform.addEventListener('change', () => {
      updateBoneOverlays();
    });
    scene.add(transform.getHelper ? transform.getHelper() : transform);
    transformControlsRef.current = transform;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(1.0, 2.5, 2.0);
    scene.add(dirLight);

    const grid = new THREE.GridHelper(10, 20, 0x334155, 0x1e293b);
    grid.position.y = 0.001;
    scene.add(grid);

    const arrowHelper = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0.01, -0.6),
      1.6,
      0x38bdf8,
      0.28,
      0.14
    );
    scene.add(arrowHelper);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event) => {
      if (event.target.tagName !== 'CANVAS') return;
      if (transform.dragging) return;
      if (!boneMarkersGroupRef.current.visible) return;

      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObjects(boneMarkersGroupRef.current.children, false);
      if (intersects.length > 0) {
        const hitMarker = intersects[0].object;
        const clickedBone = hitMarker.userData.bone;
        if (clickedBone) {
          selectBoneByObject(clickedBone);
        }
      }
    };
    window.addEventListener('pointerdown', onPointerDown);

    let reqId;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      controls.update();
      if (currentModelRef.current) {
        updateBoneOverlays();
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
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(bgColor);
    }
  }, [bgColor]);

  useEffect(() => {
    if (transformControlsRef.current) {
      transformControlsRef.current.setMode(transformMode);
    }
  }, [transformMode]);

  useEffect(() => {
    if (skeletonHelperRef.current) {
      skeletonHelperRef.current.visible = showSkeleton;
    }
    boneMarkersGroupRef.current.visible = showSkeleton;
  }, [showSkeleton]);

  useEffect(() => {
    boneLabelsGroupRef.current.visible = showBoneNames;
  }, [showBoneNames]);

  const switchMaterialType = (type) => {
    setActiveMaterialMode(type);
    const model = currentModelRef.current;
    if (!model) return;

    model.traverse((node) => {
      if (node.isMesh && node.material) {
        const isArray = Array.isArray(node.material);
        const mats = isArray ? node.material : [node.material];

        const updated = mats.map((mat) => {
          if (!originalMaterialsCacheRef.current.has(mat.uuid)) {
            originalMaterialsCacheRef.current.set(mat.uuid, mat);
          }
          const orig = originalMaterialsCacheRef.current.get(mat.uuid);

          let nextMat;
          if (type === 'unlit') {
            nextMat = new THREE.MeshBasicMaterial({
              map: orig.map || null,
              color: orig.color || new THREE.Color(0xffffff),
              transparent: orig.transparent || false,
              opacity: orig.opacity ?? 1,
              alphaTest: orig.alphaTest || 0,
              side: THREE.DoubleSide
            });
          } else if (type === 'toon') {
            nextMat = new THREE.MeshToonMaterial({
              map: orig.map || null,
              color: orig.color || new THREE.Color(0xffffff),
              transparent: orig.transparent || false,
              opacity: orig.opacity ?? 1,
              side: THREE.DoubleSide
            });
          } else {
            nextMat = orig.clone();
            nextMat.side = THREE.DoubleSide;
          }

          if (nextMat.map) {
            nextMat.map.colorSpace = THREE.SRGBColorSpace;
            nextMat.map.needsUpdate = true;
          }
          nextMat.needsUpdate = true;
          return nextMat;
        });

        node.material = isArray ? updated : updated[0];
      }
    });
  };

  const selectBoneByObject = (bone) => {
    if (!bone) return;
    setSelectedBoneName(bone.name);
    if (transformControlsRef.current) {
      transformControlsRef.current.attach(bone);
    }
    boneMarkersGroupRef.current.children.forEach((m) => {
      if (m.userData.bone === bone) {
        m.material.color.setHex(0xfacc15);
        m.scale.setScalar(1.4);
      } else {
        m.material.color.setHex(0x00ffcc);
        m.scale.setScalar(1.0);
      }
    });
  };

  const handleSelectBoneFromList = (bName) => {
    setSelectedBoneName(bName);
    if (!bName) {
      if (transformControlsRef.current) transformControlsRef.current.detach();
      boneMarkersGroupRef.current.children.forEach((m) => {
        m.material.color.setHex(0x00ffcc);
        m.scale.setScalar(1.0);
      });
      return;
    }
    const targetBone = bonesMapRef.current[bName];
    if (targetBone) {
      selectBoneByObject(targetBone);
    }
  };

  const buildBoneVisuals = (model) => {
    const mGroup = boneMarkersGroupRef.current;
    const lGroup = boneLabelsGroupRef.current;

    while (mGroup.children.length > 0) {
      const o = mGroup.children[0];
      mGroup.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    }
    while (lGroup.children.length > 0) {
      const o = lGroup.children[0];
      lGroup.remove(o);
      if (o.material && o.material.map) o.material.map.dispose();
      if (o.material) o.material.dispose();
    }

    const map = {};
    const names = [];

    const mainSphere = new THREE.SphereGeometry(0.02, 12, 12);
    const fingerSphere = new THREE.SphereGeometry(0.008, 8, 8);

    model.traverse((node) => {
      if (node.isBone) {
        map[node.name] = node;
        names.push(node.name);

        const lower = node.name.toLowerCase();
        const isSmall =
          lower.includes('thumb') ||
          lower.includes('index') ||
          lower.includes('middle') ||
          lower.includes('ring') ||
          lower.includes('little') ||
          lower.includes('toe');

        const mat = new THREE.MeshBasicMaterial({
          color: 0x00ffcc,
          transparent: true,
          opacity: 0.85,
          depthTest: false
        });

        const marker = new THREE.Mesh(isSmall ? fingerSphere : mainSphere, mat);
        marker.userData = { bone: node };
        marker.renderOrder = 999;
        mGroup.add(marker);

        if (!isSmall) {
          const labelSprite = createBoneLabelSprite(node.name);
          labelSprite.userData = { bone: node };
          lGroup.add(labelSprite);
        }
      }
    });

    bonesMapRef.current = map;
    setBoneList(names);
    mGroup.visible = showSkeleton;
    lGroup.visible = showBoneNames;
    updateBoneOverlays();
  };

  const handleLoadVRM = (e) => {
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
          const model = gltf.scene;

          if (currentModelRef.current && sceneRef.current) {
            sceneRef.current.remove(currentModelRef.current);
          }
          if (skeletonHelperRef.current && sceneRef.current) {
            sceneRef.current.remove(skeletonHelperRef.current);
          }
          if (transformControlsRef.current) {
            transformControlsRef.current.detach();
          }
          setSelectedBoneName('');
          originalMaterialsCacheRef.current.clear();

          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const scale = 1.6 / (size.y || 1);
          model.scale.setScalar(scale);

          box.setFromObject(model);
          box.getCenter(center);
          model.position.x = -center.x;
          model.position.y = -box.min.y;
          model.position.z = -center.z;

          model.rotation.set(0, 0, 0);

          model.traverse((node) => {
            if (node.userData) {
              delete node.userData.w0;
            }
            if (node.isMesh && node.material) {
              const mats = Array.isArray(node.material) ? node.material : [node.material];
              mats.forEach((m) => {
                if (m.userData) delete m.userData.w0;
                if (!originalMaterialsCacheRef.current.has(m.uuid)) {
                  originalMaterialsCacheRef.current.set(m.uuid, m);
                }
                if (m.map) {
                  m.map.colorSpace = THREE.SRGBColorSpace;
                  m.map.needsUpdate = true;
                }
              });
            }
          });

          currentModelRef.current = model;
          sceneRef.current.add(model);
          setCurrentCorrectionDeg(0);

          let rootBone = null;
          model.traverse((node) => {
            if (node.isBone && !rootBone) rootBone = node;
          });

          const helper = new THREE.SkeletonHelper(rootBone || model);
          helper.material.linewidth = 2;
          helper.material.depthTest = false;
          helper.renderOrder = 998;
          helper.visible = showSkeleton;
          skeletonHelperRef.current = helper;
          sceneRef.current.add(helper);

          buildBoneVisuals(model);
          setModelName(file.name.slice(0, 16));
        },
        (error) => {
          console.error(error);
          alert('Error al leer el archivo VRM crudo');
        }
      );
    };
    e.target.value = '';
  };

  const rotateModelVisual = (deg) => {
    if (!currentModelRef.current) return;
    const nextRot = (currentCorrectionDeg + deg) % 360;
    setCurrentCorrectionDeg(nextRot);
    currentModelRef.current.rotation.y = (nextRot * Math.PI) / 180;
    currentModelRef.current.updateMatrixWorld(true);
    updateBoneOverlays();
  };

  const handleExportFixedVRM = () => {
    const model = currentModelRef.current;
    if (!model) {
      alert('No hay ningún modelo cargado.');
      return;
    }

    if (transformControlsRef.current) transformControlsRef.current.detach();
    setSelectedBoneName('');

    const savedPos = model.position.clone();
    const savedRotY = model.rotation.y;
    const savedScale = model.scale.clone();

    model.position.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.rotation.set(0, (currentCorrectionDeg * Math.PI) / 180, 0);
    model.updateMatrixWorld(true);

    const originalNames = new Map();
    model.traverse((node) => {
      if (node.isBone) {
        originalNames.set(node, node.name);
        const canonical = VRM_BONE_MAP[node.name];
        if (canonical) {
          node.name = canonical;
        }
      }
      if (node.userData) {
        delete node.userData.w0;
        delete node.userData.vrm;
      }
    });

    const exporter = new GLTFExporter();
    exporter.parse(
      model,
      (glbArrayBuffer) => {
        originalNames.forEach((name, node) => {
          node.name = name;
        });

        model.position.copy(savedPos);
        model.rotation.y = savedRotY;
        model.scale.copy(savedScale);
        model.updateMatrixWorld(true);
        updateBoneOverlays();

        const dataView = new DataView(glbArrayBuffer);
        const jsonLength = dataView.getUint32(12, true);
        const jsonBytes = new Uint8Array(glbArrayBuffer, 20, jsonLength);
        const gltf = JSON.parse(new TextDecoder().decode(jsonBytes));

        (gltf.nodes || []).forEach((n) => {
          if (n.extras && n.extras.w0) delete n.extras.w0;
        });

        const vrmHumanBones = [];
        if (gltf.nodes) {
          gltf.nodes.forEach((node, idx) => {
            const vrmName = Object.values(VRM_BONE_MAP).find((n) => n === node.name);
            if (vrmName && !vrmHumanBones.some((b) => b.bone === vrmName)) {
              vrmHumanBones.push({
                bone: vrmName,
                node: idx,
                useDefaultValues: true
              });
            }
          });
        }

        gltf.extensionsUsed = Array.from(
          new Set([...(gltf.extensionsUsed || []), 'VRM', 'KHR_materials_unlit'])
        );

        const titleName = modelName ? modelName.replace(/\.vrm$/i, '') : 'Avatar';

        gltf.extensions = gltf.extensions || {};
        gltf.extensions.VRM = {
          exporterVersion: 'three-vrm-autorig-fixed-1.0',
          specVersion: '0.0',
          meta: {
            title: titleName,
            version: '1.0',
            author: 'Franco',
            allowedUserName: 'Everyone',
            violentUsa: 'Allow',
            sexualUsa: 'Allow',
            commercialUsa: 'Allow',
            licenseName: 'Other'
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
        link.download = `${titleName}_animStudioReady.vrm`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        alert(`✅ Exportado con rotación horneada de ${currentCorrectionDeg}°.`);
      },
      (error) => {
        originalNames.forEach((name, node) => {
          node.name = name;
        });
        model.position.copy(savedPos);
        model.rotation.y = savedRotY;
        model.scale.copy(savedScale);
        console.error('Error al exportar:', error);
        alert('Error al exportar VRM.');
      },
      { binary: true }
    );
  };

  return (
    <>
      <div ref={containerRef} style={{ width: '100vw', height: '100vh', position: 'absolute', top: 0, left: 0 }} />

      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 100, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: '72%' }}>
        <Link
          to="/rig"
          style={{
            background: 'rgba(30, 41, 59, 0.85)',
            color: '#38bdf8',
            padding: '7px 10px',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 11,
            border: '1px solid #0284c7',
            backdropFilter: 'blur(4px)'
          }}
        >
          🦴 Auto-Rig
        </Link>

        <button
          onClick={() => setShowSkeleton(!showSkeleton)}
          style={{
            background: showSkeleton ? '#0284c7' : 'rgba(30, 41, 59, 0.85)',
            color: '#fff',
            padding: '7px 10px',
            borderRadius: 8,
            border: '1px solid #475569',
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          {showSkeleton ? '🟢 Huesos ON' : '⚪ Huesos OFF'}
        </button>

        <button
          onClick={() => setShowBoneNames(!showBoneNames)}
          style={{
            background: showBoneNames ? '#8b5cf6' : 'rgba(30, 41, 59, 0.85)',
            color: '#fff',
            padding: '7px 10px',
            borderRadius: 8,
            border: '1px solid #475569',
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          {showBoneNames ? '🏷️ Nombres ON' : '🏷️ Nombres OFF'}
        </button>

        <button
          onClick={() => setShowCalibrator(!showCalibrator)}
          style={{
            background: showCalibrator ? '#f59e0b' : 'rgba(30, 41, 59, 0.85)',
            color: '#fff',
            padding: '7px 10px',
            borderRadius: 8,
            border: '1px solid #475569',
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          🛠️ Calibrar Hueso
        </button>
      </div>

      <div className="top-actions" style={{ position: 'absolute', top: 12, right: 12, zIndex: 100, display: 'flex', gap: 8 }}>
        <button
          className="floating-btn"
          onClick={() => eruda.show()}
          title="Consola Eruda"
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: 'rgba(30, 41, 59, 0.85)',
            border: '1px solid #475569',
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          🐛
        </button>
        <button
          className="floating-btn"
          onClick={() => setPanelVisible(!panelVisible)}
          title="Mostrar/Ocultar Panel"
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: 'rgba(30, 41, 59, 0.85)',
            border: '1px solid #475569',
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {panelVisible ? '👁️' : '📋'}
        </button>
      </div>

      <button
        onClick={() => eruda.show()}
        title="Configuración / Eruda"
        style={{
          position: 'absolute',
          bottom: 20,
          right: 16,
          zIndex: 110,
          width: 44,
          height: 44,
          borderRadius: 12,
          background: 'rgba(30, 41, 59, 0.85)',
          border: '1px solid #0284c7',
          color: '#38bdf8',
          fontSize: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(6px)'
        }}
      >
        ⚙️
      </button>

      {panelVisible && (
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.95)',
            padding: 12,
            borderRadius: 14,
            border: '1px solid #334155',
            width: '90%',
            maxWidth: 360,
            zIndex: 100,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>Editor VRM (Vista Cruda)</span>
            <span style={{ color: '#38bdf8', fontSize: 11, fontWeight: 'bold' }}>{modelName}</span>
          </div>

          <input type="file" ref={vrmInputRef} accept=".vrm" style={{ display: 'none' }} onChange={handleLoadVRM} />
          
          <button
            onClick={() => vrmInputRef.current && vrmInputRef.current.click()}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
              color: '#fff',
              border: 'none',
              padding: '9px',
              borderRadius: 8,
              fontWeight: 'bold',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            🟣 Abrir Modelo VRM
          </button>

          {currentModelRef.current && (
            <div style={{ marginTop: 8, padding: '6px', background: '#0f172a', borderRadius: 8, border: '1px solid #334155' }}>
              <span style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                🎨 Modo de Sombreado:
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => switchMaterialType('standard')}
                  style={{
                    flex: 1,
                    background: activeMaterialMode === 'standard' ? '#0284c7' : '#1e293b',
                    color: '#fff',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 10,
                    padding: '5px 2px',
                    cursor: 'pointer'
                  }}
                >
                  PBR / Real
                </button>
                <button
                  onClick={() => switchMaterialType('unlit')}
                  style={{
                    flex: 1,
                    background: activeMaterialMode === 'unlit' ? '#8b5cf6' : '#1e293b',
                    color: '#fff',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 10,
                    padding: '5px 2px',
                    cursor: 'pointer'
                  }}
                >
                  Toon / VRM
                </button>
                <button
                  onClick={() => switchMaterialType('toon')}
                  style={{
                    flex: 1,
                    background: activeMaterialMode === 'toon' ? '#10b981' : '#1e293b',
                    color: '#fff',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 10,
                    padding: '5px 2px',
                    cursor: 'pointer'
                  }}
                >
                  Sombreado
                </button>
              </div>
            </div>
          )}

          {boneList.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <select
                value={selectedBoneName}
                onChange={(e) => handleSelectBoneFromList(e.target.value)}
                style={{
                  width: '100%',
                  background: '#1e293b',
                  color: '#e2e8f0',
                  border: '1px solid #475569',
                  padding: '6px 8px',
                  borderRadius: 6,
                  fontSize: 11
                }}
              >
                <option value="">-- Seleccionar hueso ({boneList.length}) --</option>
                {boneList.map((bName) => (
                  <option key={bName} value={bName}>
                    🦴 {bName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {currentModelRef.current && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <button
                  onClick={() => rotateModelVisual(180)}
                  style={{
                    flex: 1,
                    background: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    padding: '7px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  🔄 Girar 180° Frente
                </button>
                <button
                  onClick={() => rotateModelVisual(-90)}
                  style={{
                    background: '#334155',
                    color: '#fff',
                    border: 'none',
                    padding: '7px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >
                  -90°
                </button>
                <button
                  onClick={() => rotateModelVisual(90)}
                  style={{
                    background: '#334155',
                    color: '#fff',
                    border: 'none',
                    padding: '7px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >
                  +90°
                </button>
              </div>

              <button
                onClick={handleExportFixedVRM}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff',
                  border: 'none',
                  padding: '8px',
                  borderRadius: 8,
                  fontWeight: 'bold',
                  fontSize: 11,
                  cursor: 'pointer'
                }}
              >
                💾 Exportar VRM (Rotado {currentCorrectionDeg}°)
              </button>
            </div>
          )}

          {selectedBoneName && (
            <div style={{ marginTop: 8, padding: 8, background: '#1e293b', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #8b5cf6' }}>
              <span style={{ fontSize: 11, color: '#facc15', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150, whiteSpace: 'nowrap' }}>
                🦴 {selectedBoneName}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setTransformMode('rotate')}
                  style={{
                    background: transformMode === 'rotate' ? '#0284c7' : '#334155',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 11,
                    padding: '4px 10px',
                    fontWeight: 'bold'
                  }}
                >
                  Rotar
                </button>
                <button
                  onClick={() => setTransformMode('translate')}
                  style={{
                    background: transformMode === 'translate' ? '#0284c7' : '#334155',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 11,
                    padding: '4px 10px',
                    fontWeight: 'bold'
                  }}
                >
                  Mover
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showCalibrator && (
        <BoneCalibratorPanel
          selectedBoneName={selectedBoneName}
          bonesMap={bonesMapRef.current}
          onUpdateOverlays={updateBoneOverlays}
          onClose={() => setShowCalibrator(false)}
        />
      )}
    </>
  );
}
