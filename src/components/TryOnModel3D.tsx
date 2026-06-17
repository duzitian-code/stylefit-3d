import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, StyleSheet, Text, View } from 'react-native';
import { Asset } from 'expo-asset';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BodyProfile, ModelAssetSource, Outfit } from '../types';
import { getRenderableGarmentLayers, type RenderableGarmentLayer } from '../logic/garmentAssets';
import { colors, radius, spacing } from '../theme';

type TryOnModel3DProps = {
  profile: BodyProfile;
  outfit: Outfit;
  fullScreen?: boolean;
  onOpenFullscreen?: () => void;
  showBadge?: boolean;
};

type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

const INITIAL_YAW = -0.18;
const INITIAL_PITCH = 0;
const MAX_PITCH = 0.32;
const PREVIEW_BUNDLE_PIPELINE = 'stylefit-parametric-preview-bundle';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function activeAvatarModelSource(profile: BodyProfile): ModelAssetSource | undefined {
  if (profile.avatarModelUri) {
    return profile.avatarModelUri;
  }

  if (profile.avatarReconstructionStatus === 'sample') {
    return profile.sampleAvatarModelSource;
  }

  return undefined;
}

async function resolveModelUri(source: ModelAssetSource) {
  if (typeof source === 'string') {
    return source;
  }

  const asset = Asset.fromModule(source);
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

function badgeTitle(profile: BodyProfile) {
  if ((profile.avatarModelUri || profile.sampleAvatarModelSource) && profile.avatarDigitalHumanPipelineType === PREVIEW_BUNDLE_PIPELINE) {
    return '本地 Preview Bundle';
  }

  if (profile.avatarModelUri) {
    if (profile.avatarModelProvenance === 'stylefit-dev-baseline') {
      return '自研基线 3D 模型';
    }

    if (profile.avatarModelProvenance === 'stylefit-parametric-digital-human') {
      return '参数化 AI 数字人 MVP';
    }

    if (profile.avatarModelProvenance === 'stylefit-digital-human' || profile.avatarModelProvenance === 'stylefit-production') {
      return 'AI 数字人模型';
    }

    return '真人重建 3D 模型';
  }

  if (profile.sampleAvatarModelSource && profile.avatarReconstructionStatus === 'sample') {
    return '演示人体 GLB';
  }

  return '等待 AI 数字人生成';
}

function bundleAssetLabel(assetKey?: string) {
  if (!assetKey) {
    return undefined;
  }

  const [genderKey, fitKey] = assetKey.split(':');
  const genderText: Record<string, string> = {
    female: '女',
    male: '男',
    nonBinary: '中性',
    default: '默认',
  };
  const fitText: Record<string, string> = {
    relaxed: '宽松',
    regular: '合体',
    tailored: '利落',
  };
  const genderLabel = genderText[genderKey] ?? genderKey;
  const fitLabel = fitKey ? (fitText[fitKey] ?? fitKey) : undefined;
  return fitLabel ? `${genderLabel} · ${fitLabel}` : genderLabel;
}

function badgeText(profile: BodyProfile, loadState: LoadState) {
  if ((profile.avatarModelUri || profile.sampleAvatarModelSource) && profile.avatarDigitalHumanPipelineType === PREVIEW_BUNDLE_PIPELINE) {
    const assetText = bundleAssetLabel(profile.avatarDigitalHumanAssetKey);
    return loadState === 'ready' ? `已加载本地 GLB mannequin bundle${assetText ? ` · ${assetText}` : ''}` : '正在加载本地 Preview Bundle 资产';
  }

  if (profile.avatarModelUri) {
    if (profile.avatarModelProvenance === 'stylefit-dev-baseline') {
      return loadState === 'ready' ? '自研 GLB 管线已跑通，非身份级真人重建' : '正在加载自研基线 avatar mesh';
    }

    if (profile.avatarModelProvenance === 'stylefit-parametric-digital-human') {
      return loadState === 'ready' ? '已加载自托管参数化数字人资产' : '正在装配参数化数字人 mesh、材质和轮廓';
    }

    if (profile.avatarModelProvenance === 'stylefit-digital-human' || profile.avatarModelProvenance === 'stylefit-production') {
      return loadState === 'ready' ? '已加载电商级数字人资产' : '正在加载 AI 数字人 mesh、rig 和材质';
    }

    return loadState === 'ready' ? '已加载用户 avatar mesh' : '正在加载用户 avatar mesh';
  }

  if (profile.sampleAvatarModelSource && profile.avatarReconstructionStatus === 'sample') {
    return loadState === 'ready' ? '非本人重建，仅验证 GLB 加载链路' : '正在加载演示人体资产';
  }

  if (profile.avatarReconstructionStatus === 'queued') {
    return '照片已提交，等待数字人服务输出 GLB';
  }

  if (profile.avatarReconstructionStatus === 'processing') {
    return '数字人 mesh、rig、face texture 生成中';
  }

  return '上传照片并完成数字人生成后才会渲染模型';
}

function emptyStateCopy(profile: BodyProfile) {
  if (profile.avatarReconstructionStatus === 'queued') {
    return {
      title: '等待 AI 数字人模型',
      text: '照片已提交为数字人输入，前端会在服务端返回 avatar GLB 后展示数字人资产。',
    };
  }

  if (profile.avatarReconstructionStatus === 'processing') {
    return {
      title: 'AI 数字人生成中',
      text: '正在等待 mesh、rig、face texture 和材质，完成后会加载 avatarModelUri。',
    };
  }

  return {
    title: '未生成 AI 数字人模型',
    text: '请上传清晰照片并提交数字人服务；没有 avatarModelUri 时不会显示演示人物。',
  };
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh).isMesh === true;
}

function prepareAvatarObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!isMesh(child)) {
      return;
    }

    child.castShadow = false;
    child.receiveShadow = true;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      const texturedMaterial = material as THREE.MeshStandardMaterial;
      texturedMaterial.side = THREE.DoubleSide;
      texturedMaterial.shadowSide = THREE.DoubleSide;
      if (texturedMaterial.map) {
        texturedMaterial.map.colorSpace = THREE.SRGBColorSpace;
      }
      material.needsUpdate = true;
    });
  });
}

function fitAvatarToStage(object: THREE.Object3D, targetHeight = 3.05) {
  const initialBox = new THREE.Box3().setFromObject(object);
  const initialSize = new THREE.Vector3();
  initialBox.getSize(initialSize);

  const scale = targetHeight / Math.max(initialSize.y, 0.001);
  object.scale.multiplyScalar(scale);

  const fittedBox = new THREE.Box3().setFromObject(object);
  const fittedCenter = new THREE.Vector3();
  fittedBox.getCenter(fittedCenter);

  object.position.x -= fittedCenter.x;
  object.position.z -= fittedCenter.z;
  object.position.y += -1.58 - fittedBox.min.y;
}

function fabricMaterial(layer: RenderableGarmentLayer, opacity = 0.9) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(layer.primaryColor),
    roughness: 0.84,
    metalness: 0.02,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 0.96,
  });
}

function accentMaterial(layer: RenderableGarmentLayer, opacity = 0.94) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(layer.secondaryColor),
    roughness: 0.78,
    metalness: 0.03,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 0.96,
  });
}

function trimMaterial(color = '#17202A', opacity = 0.32) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

function addGarmentMesh(group: THREE.Group, mesh: THREE.Mesh, layer: RenderableGarmentLayer) {
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = layer.renderOrder;
  group.add(mesh);
  return mesh;
}

function addBox(
  group: THREE.Group,
  layer: RenderableGarmentLayer,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(position[0], position[1], position[2]);
  return addGarmentMesh(group, mesh, layer);
}

function addCylinderBetween(
  group: THREE.Group,
  layer: RenderableGarmentLayer,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radiusTop: number,
  radiusBottom: number,
  material: THREE.Material,
) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 28, 1, false), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return addGarmentMesh(group, mesh, layer);
}

function addTorsoLayer(group: THREE.Group, layer: RenderableGarmentLayer) {
  const isOuter = layer.asset.shape === 'jacket';
  const isLongline = layer.asset.length === 'longline';
  const isCropped = layer.asset.length === 'cropped';
  const width = layer.widthScale * (isOuter ? 1.08 : 1);
  const height = (isOuter ? (isLongline ? 1.22 : 1.02) : isCropped ? 0.68 : 0.9) * layer.heightScale;
  const centerY = isOuter ? (isLongline ? 0.02 : 0.16) : isCropped ? 0.36 : 0.25;
  const topRadius = (isOuter ? 0.43 : 0.36) * width;
  const bottomRadius = (isOuter ? 0.45 : isCropped ? 0.34 : 0.38) * width;
  const opacity = isOuter ? 0.78 : 0.9;
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, bottomRadius, height, 52, 1, true), fabricMaterial(layer, opacity));
  shell.position.set(0, centerY, 0.02);
  addGarmentMesh(group, shell, layer);

  const frontZ = Math.max(topRadius, bottomRadius) + 0.025;
  addBox(group, layer, [0.026, height * 0.72, 0.035], [0, centerY + height * 0.02, frontZ], trimMaterial('#FFFFFF', isOuter ? 0.36 : 0.44));
  addBox(group, layer, [bottomRadius * 1.55, 0.028, 0.032], [0, centerY - height * 0.5 + 0.025, bottomRadius + 0.018], trimMaterial(layer.secondaryColor, 0.5));

  if (isOuter) {
    const leftLapel = addBox(group, layer, [0.055, height * 0.44, 0.04], [-0.12 * width, centerY + 0.1, frontZ + 0.012], accentMaterial(layer, 0.86));
    leftLapel.rotation.z = -0.14;
    const rightLapel = addBox(group, layer, [0.055, height * 0.44, 0.04], [0.12 * width, centerY + 0.1, frontZ + 0.012], accentMaterial(layer, 0.86));
    rightLapel.rotation.z = 0.14;
  } else {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15 * width, 0.012, 8, 36), accentMaterial(layer, 0.88));
    collar.rotation.x = Math.PI / 2;
    collar.scale.y = 0.56;
    collar.position.set(0, centerY + height * 0.5 - 0.035, 0.035);
    addGarmentMesh(group, collar, layer);
  }

  const sleeveEndY = layer.asset.sleeveLength === 'long' ? -0.32 : centerY + height * 0.22;
  const sleeveEndX = layer.asset.sleeveLength === 'long' ? topRadius + 0.2 : topRadius + 0.34;
  const sleeveRadius = (isOuter ? 0.105 : 0.088) * width;
  addCylinderBetween(
    group,
    layer,
    new THREE.Vector3(-topRadius * 0.95, centerY + height * 0.33, 0.005),
    new THREE.Vector3(-sleeveEndX, sleeveEndY, 0.015),
    sleeveRadius,
    sleeveRadius * 0.92,
    fabricMaterial(layer, opacity),
  );
  addCylinderBetween(
    group,
    layer,
    new THREE.Vector3(topRadius * 0.95, centerY + height * 0.33, 0.005),
    new THREE.Vector3(sleeveEndX, sleeveEndY, 0.015),
    sleeveRadius,
    sleeveRadius * 0.92,
    fabricMaterial(layer, opacity),
  );
}

function addBottomLayer(group: THREE.Group, layer: RenderableGarmentLayer) {
  const width = layer.widthScale;

  if (layer.asset.shape === 'skirt') {
    const height = 0.78 * layer.heightScale;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * width, 0.5 * width, height, 52, 1, true), fabricMaterial(layer, 0.88));
    skirt.position.set(0, -0.66, 0.02);
    addGarmentMesh(group, skirt, layer);
    addBox(group, layer, [0.68 * width, 0.045, 0.055], [0, -0.28, 0.28 * width + 0.02], accentMaterial(layer, 0.84));
    return;
  }

  const legHeight = 1.02 * layer.heightScale;
  const centerY = -0.86;
  const legOffset = 0.19 * width;
  const topRadius = 0.155 * width;
  const bottomRadius = 0.115 * width;
  [-1, 1].forEach((side) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, bottomRadius, legHeight, 36, 1, false), fabricMaterial(layer, 0.9));
    leg.position.set(side * legOffset, centerY, 0.015);
    addGarmentMesh(group, leg, layer);
    addBox(group, layer, [0.014, legHeight * 0.78, 0.026], [side * legOffset, centerY - 0.02, bottomRadius + 0.03], trimMaterial('#FFFFFF', 0.28));
  });
  addBox(group, layer, [0.7 * width, 0.05, 0.06], [0, -0.34, 0.26], accentMaterial(layer, 0.82));
}

function addFootwearLayer(group: THREE.Group, layer: RenderableGarmentLayer) {
  const width = layer.widthScale;
  [-1, 1].forEach((side) => {
    const shoe = addBox(group, layer, [0.28 * width, 0.12, 0.48], [side * 0.2 * width, -1.5, 0.16], fabricMaterial(layer, 0.96));
    shoe.rotation.y = side * 0.04;
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.14 * width, 18, 10), accentMaterial(layer, 0.96));
    toe.scale.set(0.9, 0.38, 1.16);
    toe.position.set(side * 0.2 * width, -1.48, 0.39);
    addGarmentMesh(group, toe, layer);
  });
}

function addBagLayer(group: THREE.Group, layer: RenderableGarmentLayer) {
  const width = layer.widthScale;
  addBox(group, layer, [0.34, 0.42, 0.13], [0.68 * width, -0.2, 0.12], fabricMaterial(layer, 0.94));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 8, 32), accentMaterial(layer, 0.9));
  handle.scale.y = 1.32;
  handle.position.set(0.68 * width, 0.09, 0.13);
  addGarmentMesh(group, handle, layer);
}

function createGarmentPreviewGroup(layers: RenderableGarmentLayer[]) {
  const group = new THREE.Group();
  group.name = 'stylefit-procedural-garments';

  layers.forEach((layer) => {
    if (layer.asset.shape === 'shirt' || layer.asset.shape === 'jacket') {
      addTorsoLayer(group, layer);
      return;
    }

    if (layer.asset.shape === 'trouser' || layer.asset.shape === 'skirt') {
      addBottomLayer(group, layer);
      return;
    }

    if (layer.asset.shape === 'shoe') {
      addFootwearLayer(group, layer);
      return;
    }

    if (layer.asset.shape === 'bag') {
      addBagLayer(group, layer);
    }
  });

  return group;
}

function addStage(scene: THREE.Scene) {
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(4.7, 3.7),
    new THREE.MeshStandardMaterial({ color: '#EFF4F0', roughness: 1, metalness: 0, side: THREE.DoubleSide }),
  );
  backdrop.position.set(0, 0.18, -1.34);
  scene.add(backdrop);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(2.02, 112),
    new THREE.MeshStandardMaterial({ color: '#E1EAE4', transparent: true, opacity: 0.94, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.58;
  floor.receiveShadow = true;
  scene.add(floor);

  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.94, 80),
    new THREE.MeshBasicMaterial({ color: '#132018', transparent: true, opacity: 0.09, depthWrite: false }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = -1.575;
  contactShadow.position.z = 0.05;
  scene.add(contactShadow);

  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(1.78, 1.82, 112),
    new THREE.MeshBasicMaterial({ color: '#B8C8BD', transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  );
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = -1.57;
  scene.add(outerRing);

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(1.08, 1.1, 96),
    new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = -1.569;
  scene.add(innerRing);
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!isMesh(child)) {
      return;
    }

    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      const texturedMaterial = material as THREE.MeshStandardMaterial;
      texturedMaterial.map?.dispose();
      material.dispose();
    });
  });
}

export function TryOnModel3D({ profile, outfit, fullScreen = false, onOpenFullscreen, showBadge = true }: TryOnModel3DProps) {
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const rotationTargetRef = useRef({ yaw: INITIAL_YAW, pitch: INITIAL_PITCH });
  const rotationStateRef = useRef({ yaw: INITIAL_YAW, pitch: INITIAL_PITCH });
  const gestureStartRef = useRef({ yaw: INITIAL_YAW, pitch: INITIAL_PITCH });
  const modelSource = activeAvatarModelSource(profile);
  const garmentLayers = useMemo(() => getRenderableGarmentLayers(outfit, profile), [outfit, profile]);
  const garmentLayerKey = useMemo(
    () => garmentLayers.map((layer) => `${layer.itemId}:${layer.asset.assetKey}:${layer.primaryColor}:${layer.renderOrder}`).join('|'),
    [garmentLayers],
  );
  const emptyCopy = emptyStateCopy(profile);
  const modelKey = useMemo(
    () => `${profile.avatarReconstructionStatus}-${String(modelSource ?? 'missing')}-${profile.gender}-${profile.heightCm}-${profile.weightKg}-${outfit.id}-${garmentLayerKey}`,
    [garmentLayerKey, modelSource, outfit.id, profile.avatarReconstructionStatus, profile.gender, profile.heightCm, profile.weightKg],
  );
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => Boolean(modelSource),
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Boolean(modelSource && (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2)),
        onPanResponderGrant: () => {
          gestureStartRef.current = { ...rotationTargetRef.current };
        },
        onPanResponderMove: (_event, gestureState) => {
          rotationTargetRef.current = {
            yaw: gestureStartRef.current.yaw + gestureState.dx * 0.008,
            pitch: clamp(gestureStartRef.current.pitch + gestureState.dy * 0.0035, -MAX_PITCH, MAX_PITCH),
          };
        },
        onPanResponderRelease: (_event, gestureState) => {
          if (onOpenFullscreen && Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
            onOpenFullscreen();
          }
        },
      }),
    [modelSource, onOpenFullscreen],
  );

  useEffect(() => {
    rotationTargetRef.current = { yaw: INITIAL_YAW, pitch: INITIAL_PITCH };
    rotationStateRef.current = { yaw: INITIAL_YAW, pitch: INITIAL_PITCH };
    gestureStartRef.current = { yaw: INITIAL_YAW, pitch: INITIAL_PITCH };
  }, [modelKey]);

  const handleContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      if (!modelSource) {
        setLoadState('idle');
        return;
      }

      setLoadState('loading');

      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const renderer = new Renderer({ gl, width, height, clearColor: 0xf7faf8, antialias: true });
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf7faf8);
      const camera = new THREE.PerspectiveCamera(fullScreen ? 34 : 32, width / Math.max(height, 1), 0.1, 100);
      camera.position.set(0, fullScreen ? 0.38 : 0.52, fullScreen ? 7.15 : 6.35);
      camera.lookAt(0, fullScreen ? -0.02 : 0.08, 0);

      scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d0c5, 2.55));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
      keyLight.position.set(2.4, 4.4, 4.2);
      keyLight.castShadow = false;
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xd8ecff, 1.55);
      fillLight.position.set(-3.2, 2.2, 2.8);
      scene.add(fillLight);
      const rimLight = new THREE.DirectionalLight(0xffffff, 1.0);
      rimLight.position.set(-2.4, 3.2, -3.4);
      scene.add(rimLight);
      addStage(scene);

      const loader = new GLTFLoader();
      loader.setCrossOrigin('anonymous');

      const root = new THREE.Group();
      root.rotation.order = 'YXZ';
      scene.add(root);

      let animationFrame = 0;
      let disposed = false;

      const render = () => {
        const targetRotation = rotationTargetRef.current;
        const currentRotation = rotationStateRef.current;
        currentRotation.yaw += (targetRotation.yaw - currentRotation.yaw) * 0.18;
        currentRotation.pitch += (targetRotation.pitch - currentRotation.pitch) * 0.18;
        root.rotation.y = currentRotation.yaw;
        root.rotation.x = currentRotation.pitch;

        renderer.render(scene, camera);
        gl.endFrameEXP();
        animationFrame = requestAnimationFrame(render);
      };

      const loadAvatar = (uri: string) => {
        loader.load(
          uri,
          (gltf: GLTF) => {
            if (disposed) {
              disposeObject(gltf.scene);
              return;
            }

            const loadedAvatar = gltf.scene;
            prepareAvatarObject(loadedAvatar);
            fitAvatarToStage(loadedAvatar, fullScreen ? 3.12 : 3.05);
            root.add(loadedAvatar);
            root.add(createGarmentPreviewGroup(garmentLayers));

            setLoadState('ready');
          },
          undefined,
          () => {
            setLoadState('failed');
          },
        );
      };

      resolveModelUri(modelSource)
        .then((resolvedUri) => {
          if (!disposed) {
            loadAvatar(resolvedUri);
          }
        })
        .catch(() => {
          setLoadState('failed');
        });
      render();

      return () => {
        disposed = true;
        cancelAnimationFrame(animationFrame);
        disposeObject(root);
        renderer.dispose();
      };
    },
    [fullScreen, garmentLayers, modelSource],
  );

  return (
    <View style={styles.container}>
      {showBadge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeTitle}>{badgeTitle(profile)}</Text>
          <Text style={styles.badgeText}>{badgeText(profile, loadState)}</Text>
        </View>
      ) : null}
      {modelSource ? (
        <>
          <GLView key={modelKey} style={styles.glView} onContextCreate={handleContextCreate} />
          <View style={styles.interactionLayer} {...panResponder.panHandlers} />
        </>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>{emptyCopy.title}</Text>
          <Text style={styles.emptyText}>{emptyCopy.text}</Text>
        </View>
      )}
      {loadState === 'loading' ? (
        <View style={styles.loadingPill}>
          <ActivityIndicator color={colors.moss} size="small" />
          <Text style={styles.loadingText}>加载数字人 GLB</Text>
        </View>
      ) : null}
      {loadState === 'failed' ? (
        <View style={styles.errorPill}>
          <Text style={styles.errorText}>数字人模型加载失败，请检查 avatarModelUri</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  glView: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
  },
  interactionLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },
  badge: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
    zIndex: 2,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFFE8',
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '72%',
  },
  badgeTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  badgeText: {
    color: colors.mutedInk,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyText: {
    color: colors.mutedInk,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: spacing.sm,
    maxWidth: 360,
    textAlign: 'center',
  },
  loadingPill: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFFE8',
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  loadingText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  errorPill: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    zIndex: 2,
    borderRadius: radius.md,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FDA4AF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    color: '#9F1239',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
});