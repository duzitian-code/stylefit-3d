import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Camera,
  Check,
  CloudSun,
  Palette,
  Plus,
  RefreshCw,
  Ruler,
  Shirt,
  ShoppingBag,
  Sparkles,
  Upload,
  UserRound,
  Weight,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { AvatarFullscreenPreview, AvatarPreview } from './src/components/AvatarPreview';
import { MetricCard } from './src/components/MetricCard';
import { ProductCard } from './src/components/ProductCard';
import { SectionHeader } from './src/components/SectionHeader';
import { WardrobeCard } from './src/components/WardrobeCard';
import { initialProfile, previewBundleModels, productCatalog, wardrobeSeed, weatherOptions } from './src/data/mockData';
import { itemHasRenderableGarment, outfitGarmentCoverage } from './src/logic/garmentAssets';
import { submitAvatarReconstruction } from './src/logic/reconstructionClient';
import { bodyBalanceLabel, calculateBmi, generateOutfit, recommendProducts } from './src/logic/recommendations';
import { colors, radius, spacing } from './src/theme';
import type {
  BodyProfile,
  ClothingCategory,
  ClothingItem,
  FitPreference,
  Gender,
  Occasion,
  Outfit,
  ReconstructionStatus,
  WeatherSnapshot,
} from './src/types';

type TabId = 'tryOn' | 'closet' | 'looks' | 'shop';

const tabs: { id: TabId; label: string; Icon: typeof Sparkles }[] = [
  { id: 'tryOn', label: '试穿', Icon: Sparkles },
  { id: 'closet', label: '衣橱', Icon: Shirt },
  { id: 'looks', label: '搭配', Icon: Palette },
  { id: 'shop', label: '商品', Icon: ShoppingBag },
];

const occasionOptions: { id: Occasion; label: string }[] = [
  { id: 'commute', label: '通勤' },
  { id: 'date', label: '约会' },
  { id: 'travel', label: '旅行' },
  { id: 'fitness', label: '运动' },
  { id: 'formal', label: '正式' },
];

const fitOptions: { id: FitPreference; label: string }[] = [
  { id: 'relaxed', label: '宽松' },
  { id: 'regular', label: '合体' },
  { id: 'tailored', label: '利落' },
];

const genderOptions: { id: Gender; label: string }[] = [
  { id: 'female', label: '女' },
  { id: 'male', label: '男' },
  { id: 'nonBinary', label: '中性' },
];

const categoryOptions: { id: ClothingCategory; label: string }[] = [
  { id: 'top', label: '上装' },
  { id: 'bottom', label: '下装' },
  { id: 'outerwear', label: '外套' },
  { id: 'shoes', label: '鞋履' },
  { id: 'accessory', label: '配饰' },
];

const PREVIEW_BUNDLE_PIPELINE = 'stylefit-parametric-preview-bundle';

type TryOnSignal = {
  label: string;
  value: string;
  detail: string;
  Icon: typeof Sparkles;
  accent: string;
};

type OutfitItemOverrides = Partial<Record<ClothingCategory, string | null>>;

const editableOutfitSlots: { id: ClothingCategory; label: string; optional?: boolean }[] = [
  { id: 'top', label: '上装' },
  { id: 'bottom', label: '下装' },
  { id: 'outerwear', label: '外套', optional: true },
  { id: 'shoes', label: '鞋履' },
  { id: 'accessory', label: '配饰', optional: true },
];

function hasOwnOverride(overrides: OutfitItemOverrides, category: ClothingCategory) {
  return Object.prototype.hasOwnProperty.call(overrides, category);
}

function hasManualOutfitOverrides(overrides: OutfitItemOverrides) {
  return editableOutfitSlots.some((slot) => hasOwnOverride(overrides, slot.id));
}

function applyOutfitOverrides(recommendedOutfit: Outfit, wardrobe: ClothingItem[], overrides: OutfitItemOverrides): Outfit {
  if (!hasManualOutfitOverrides(overrides)) {
    return recommendedOutfit;
  }

  const recommendedByCategory = recommendedOutfit.items.reduce<Partial<Record<ClothingCategory, ClothingItem>>>((collection, item) => {
    collection[item.category] = item;
    return collection;
  }, {});

  const items = editableOutfitSlots
    .map((slot) => {
      if (!hasOwnOverride(overrides, slot.id)) {
        return recommendedByCategory[slot.id];
      }

      const selectedId = overrides[slot.id];
      return selectedId ? wardrobe.find((item) => item.id === selectedId && item.category === slot.id) : undefined;
    })
    .filter((item): item is ClothingItem => Boolean(item));

  const averageWarmth = items.reduce((total, item) => total + item.warmth, 0) / Math.max(items.length, 1);

  return {
    ...recommendedOutfit,
    id: `edited-${recommendedOutfit.id}-${items.map((item) => item.id).join('-')}`,
    title: '当前试穿组合',
    summary: items.map((item) => item.name).join(' · '),
    items,
    warmthScore: Number(Math.min(10, Math.max(1, averageWarmth)).toFixed(1)),
    stylingNotes: [
      '已按当前槽位选择更新 3D 试穿预览。',
      ...recommendedOutfit.stylingNotes.filter((note) => !note.startsWith('已按当前槽位')),
    ],
  };
}

function clampScore(value: number) {
  return Math.min(98, Math.max(8, Math.round(value)));
}

function previewBundleAssetKey(gender: Gender, fitPreference: FitPreference) {
  return `${gender}:${fitPreference}`;
}

function profileHasRenderableModel(profile: BodyProfile) {
  return Boolean(profile.avatarModelUri || (profile.sampleAvatarModelSource && profile.avatarReconstructionStatus === 'sample'));
}

function genderLabel(gender: Gender) {
  return genderOptions.find((option) => option.id === gender)?.label ?? '中性';
}

function genderProfileLabel(gender: Gender) {
  if (gender === 'female') {
    return '女性';
  }

  if (gender === 'male') {
    return '男性';
  }

  return '中性';
}

function reconstructionStatusText(status: ReconstructionStatus, hasModel: boolean, message?: string) {
  if (message) {
    return message;
  }

  if (hasModel && status === 'sample') {
    return '已加载内置本地 Preview Bundle 数字人资产；当前是非身份级 mannequin 预览。';
  }

  if (hasModel) {
    return '已加载 AI 数字人模型';
  }

  if (status === 'sample') {
    return '当前仅可手动加载演示 GLB，不能作为 AI 数字人试穿模型';
  }

  if (status === 'queued') {
    return '照片已提交，等待 AI 数字人服务输出 GLB';
  }

  if (status === 'processing') {
    return 'AI 数字人生成中，等待 mesh、rig、face texture 和材质';
  }

  if (status === 'failed') {
    return '数字人生成失败，请重新上传清晰正面/侧面照片';
  }

  return '等待上传照片并提交 AI 数字人服务，生成 avatarModelUri 后才展示数字人模型';
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
  const genderLabelText = genderText[genderKey] ?? genderKey;
  const fitLabelText = fitKey ? (fitText[fitKey] ?? fitKey) : undefined;
  return fitLabelText ? `${genderLabelText} · ${fitLabelText}` : genderLabelText;
}

function avatarPipelineLabel(profile: BodyProfile) {
  if (profile.avatarDigitalHumanPipelineType === PREVIEW_BUNDLE_PIPELINE) {
    return 'Preview Bundle';
  }

  if (profile.avatarModelProvenance === 'stylefit-production' || profile.avatarModelProvenance === 'stylefit-digital-human') {
    return 'Production';
  }

  if (profile.avatarModelProvenance === 'stylefit-parametric-digital-human') {
    return 'Parametric MVP';
  }

  if (profile.avatarModelProvenance === 'stylefit-dev-baseline') {
    return 'Dev Baseline';
  }

  if (profile.avatarReconstructionStatus === 'sample') {
    return 'Sample GLB';
  }

  return '未生成';
}

function avatarAssetDetail(profile: BodyProfile) {
  const assetLabel = bundleAssetLabel(profile.avatarDigitalHumanAssetKey);

  if (profile.avatarDigitalHumanPipelineType === PREVIEW_BUNDLE_PIPELINE) {
    return assetLabel ? `本地 GLB · ${assetLabel}` : '本地 GLB bundle';
  }

  if (profile.avatarModelUri) {
    return profile.faceTextureUri ? 'mesh + face texture' : 'mesh 已就绪';
  }

  if (profile.avatarReconstructionStatus === 'processing') {
    return '生成中';
  }

  if (profile.avatarReconstructionStatus === 'failed') {
    return '生成失败';
  }

  return '等待头像资产';
}

function outfitCoverage(outfit: Outfit) {
  return outfitGarmentCoverage(outfit).label;
}

function productionGateLabel(profile: BodyProfile) {
  if (profile.avatarModelProvenance === 'stylefit-production' || profile.avatarModelProvenance === 'stylefit-digital-human') {
    return '可候选';
  }

  if (profile.avatarDigitalHumanPipelineType === 'stylefit-parametric-preview-bundle') {
    return '预览级';
  }

  if (profile.avatarModelUri) {
    return '研发级';
  }

  return '未就绪';
}

function tryOnQualityScore(profile: BodyProfile, outfit: Outfit) {
  const modelBase = profileHasRenderableModel(profile) ? 48 : 12;
  const pipelineBoost =
    profile.avatarModelProvenance === 'stylefit-production' || profile.avatarModelProvenance === 'stylefit-digital-human'
      ? 34
      : profile.avatarDigitalHumanPipelineType === PREVIEW_BUNDLE_PIPELINE
        ? 25
        : profile.avatarModelProvenance === 'stylefit-parametric-digital-human'
          ? 20
          : profile.avatarModelProvenance === 'stylefit-dev-baseline'
            ? 8
            : 0;
  const garmentReady = outfit.items.filter(itemHasRenderableGarment).length;
  const garmentBoost = (garmentReady / Math.max(outfit.items.length, 1)) * 12;
  const fitBoost = profile.fitPreference === 'tailored' ? 5 : profile.fitPreference === 'regular' ? 4 : 3;
  const textureBoost = profile.faceTextureUri ? 7 : 0;
  const rawScore = clampScore(modelBase + pipelineBoost + garmentBoost + fitBoost + textureBoost);

  if (profile.avatarDigitalHumanPipelineType === PREVIEW_BUNDLE_PIPELINE) {
    return Math.min(rawScore, 78);
  }

  return rawScore;
}

function tryOnQualityLabel(score: number) {
  if (score >= 88) {
    return '生产候选';
  }

  if (score >= 72) {
    return '预览稳定';
  }

  if (score >= 48) {
    return '研发预览';
  }

  return '资产缺口';
}

function buildTryOnSignals(profile: BodyProfile, outfit: Outfit, weather: WeatherSnapshot): TryOnSignal[] {
  const garmentCoverage = outfitGarmentCoverage(outfit);

  return [
    {
      label: '数字人资产',
      value: avatarPipelineLabel(profile),
      detail: avatarAssetDetail(profile),
      Icon: UserRound,
      accent: colors.moss,
    },
    {
      label: '服装覆盖',
      value: garmentCoverage.label,
      detail: garmentCoverage.detail,
      Icon: Shirt,
      accent: colors.denim,
    },
    {
      label: '场景适配',
      value: `${outfit.weatherFitScore}%`,
      detail: `体感 ${weather.feelsLikeC}°C 已纳入推荐`,
      Icon: CloudSun,
      accent: colors.saffron,
    },
    {
      label: '上线门槛',
      value: productionGateLabel(profile),
      detail: profile.avatarDigitalHumanPipelineType === PREVIEW_BUNDLE_PIPELINE ? '需替换高质量授权资产' : '按模型来源判定',
      Icon: Check,
      accent: colors.coral,
    },
  ];
}

function avatarGenerationButtonLabel(input: {
  busy: boolean;
  hasModel: boolean;
  hasPhoto: boolean;
  provenance?: string;
  pipelineType?: string;
}) {
  if (input.busy) {
    return 'AI 数字人生成中';
  }

  if (input.hasModel) {
    if (input.pipelineType === PREVIEW_BUNDLE_PIPELINE) {
      return input.hasPhoto ? '重新生成本地 Bundle 数字人' : '上传照片生成个人数字人';
    }

    if (input.provenance === 'stylefit-dev-baseline') {
      return '重新生成自研基线 3D 模型';
    }

    if (input.provenance === 'stylefit-parametric-digital-human') {
      return '重新生成参数化数字人';
    }

    return '重新生成 AI 数字人';
  }

  return input.hasPhoto ? '重新提交数字人生成' : '上传照片生成 AI 数字人';
}

export default function App() {
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<TabId>('tryOn');
  const [gender, setGender] = useState<Gender>(initialProfile.gender);
  const [heightCm, setHeightCm] = useState(String(initialProfile.heightCm));
  const [weightKg, setWeightKg] = useState(String(initialProfile.weightKg));
  const [fitPreference, setFitPreference] = useState<FitPreference>(initialProfile.fitPreference);
  const [avatarPhotoUri, setAvatarPhotoUri] = useState<string | undefined>(initialProfile.avatarPhotoUri);
  const [avatarReconstructionStatus, setAvatarReconstructionStatus] = useState<ReconstructionStatus>(initialProfile.avatarReconstructionStatus);
  const [avatarReconstructionMessage, setAvatarReconstructionMessage] = useState<string | undefined>();
  const [avatarModelUri, setAvatarModelUri] = useState<string | undefined>(initialProfile.avatarModelUri);
  const [avatarModelProvenance, setAvatarModelProvenance] = useState(initialProfile.avatarModelProvenance);
  const [avatarDigitalHumanPipelineType, setAvatarDigitalHumanPipelineType] = useState<string | undefined>(initialProfile.avatarDigitalHumanPipelineType);
  const [avatarDigitalHumanAssetSource, setAvatarDigitalHumanAssetSource] = useState<string | undefined>(initialProfile.avatarDigitalHumanAssetSource);
  const [avatarDigitalHumanAssetKey, setAvatarDigitalHumanAssetKey] = useState<string | undefined>(initialProfile.avatarDigitalHumanAssetKey);
  const [faceTextureUri, setFaceTextureUri] = useState<string | undefined>(initialProfile.faceTextureUri);
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>(wardrobeSeed);
  const [outfitItemOverrides, setOutfitItemOverrides] = useState<OutfitItemOverrides>({});
  const [selectedWeatherIndex, setSelectedWeatherIndex] = useState(0);
  const [selectedOccasion, setSelectedOccasion] = useState<Occasion>('commute');
  const [newClothingCategory, setNewClothingCategory] = useState<ClothingCategory>('top');
  const [fullscreenPreviewVisible, setFullscreenPreviewVisible] = useState(false);

  const profile = useMemo(
    () => {
      const localPreviewAssetKey = previewBundleAssetKey(gender, fitPreference);
      const usingBundledPreview = avatarDigitalHumanPipelineType === PREVIEW_BUNDLE_PIPELINE && !avatarModelUri;

      return {
      ...initialProfile,
      gender,
      heightCm: Number(heightCm) || initialProfile.heightCm,
      weightKg: Number(weightKg) || initialProfile.weightKg,
      fitPreference,
      avatarPhotoUri,
      avatarReconstructionStatus,
      avatarModelUri,
      avatarModelProvenance,
      avatarDigitalHumanPipelineType,
      avatarDigitalHumanAssetSource,
      avatarDigitalHumanAssetKey: usingBundledPreview ? localPreviewAssetKey : avatarDigitalHumanAssetKey,
      faceTextureUri,
      sampleAvatarModelSource:
        avatarReconstructionStatus === 'sample'
          ? usingBundledPreview
            ? previewBundleModels[localPreviewAssetKey] ?? initialProfile.sampleAvatarModelSource
            : initialProfile.sampleAvatarModelSource
          : undefined,
      };
    },
    [
      avatarDigitalHumanAssetKey,
      avatarDigitalHumanAssetSource,
      avatarDigitalHumanPipelineType,
      avatarModelProvenance,
      avatarModelUri,
      avatarPhotoUri,
      avatarReconstructionStatus,
      faceTextureUri,
      fitPreference,
      gender,
      heightCm,
      weightKg,
    ],
  );

  const weather = weatherOptions[selectedWeatherIndex];
  const recommendedOutfit = useMemo(() => generateOutfit(wardrobe, weather, selectedOccasion, profile), [profile, selectedOccasion, wardrobe, weather]);
  const outfit = useMemo(() => applyOutfitOverrides(recommendedOutfit, wardrobe, outfitItemOverrides), [outfitItemOverrides, recommendedOutfit, wardrobe]);
  const hasManualOutfit = hasManualOutfitOverrides(outfitItemOverrides);
  const products = useMemo(
    () => recommendProducts(productCatalog, wardrobe, weather, selectedOccasion, profile),
    [profile, selectedOccasion, wardrobe, weather],
  );
  const wideTryOnLayout = width >= 1040;
  const qualityScore = useMemo(() => tryOnQualityScore(profile, outfit), [outfit, profile]);
  const qualityLabel = tryOnQualityLabel(qualityScore);
  const tryOnSignals = useMemo(() => buildTryOnSignals(profile, outfit, weather), [outfit, profile, weather]);
  const selectedOccasionLabel = occasionOptions.find((option) => option.id === selectedOccasion)?.label ?? '通勤';
  const selectedFitLabel = fitOptions.find((option) => option.id === fitPreference)?.label ?? '合体';
  const hasRenderableAvatar = profileHasRenderableModel(profile);
  const avatarReconstructionBusy = avatarReconstructionStatus === 'queued' || avatarReconstructionStatus === 'processing';
  const avatarButtonLabel = avatarGenerationButtonLabel({
    busy: avatarReconstructionBusy,
    hasModel: hasRenderableAvatar,
    hasPhoto: Boolean(avatarPhotoUri),
    provenance: avatarModelProvenance,
    pipelineType: avatarDigitalHumanPipelineType,
  });

  async function pickAvatarPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('需要相册权限', '开启相册权限后才能上传照片并生成个人 3D 模型。');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.85,
    });

    if (!result.canceled) {
      const selectedPhotoUri = result.assets[0]?.uri;

      if (!selectedPhotoUri) {
        Alert.alert('照片读取失败', '没有拿到可用于数字人生成的照片 URI。');
        return;
      }

      setAvatarPhotoUri(selectedPhotoUri);
      setAvatarModelUri(undefined);
      setAvatarModelProvenance(undefined);
      setAvatarDigitalHumanPipelineType(undefined);
      setAvatarDigitalHumanAssetSource(undefined);
      setAvatarDigitalHumanAssetKey(undefined);
      setFaceTextureUri(undefined);
      setAvatarReconstructionStatus('queued');
      setAvatarReconstructionMessage('照片已选择，正在提交 AI 数字人生成服务。');

      try {
        setAvatarReconstructionStatus('processing');
        setAvatarReconstructionMessage('AI 数字人生成中，正在等待 mesh、rig、材质和 GLB 输出。');

        const reconstruction = await submitAvatarReconstruction({
          profile: {
            ...profile,
            avatarPhotoUri: selectedPhotoUri,
            avatarModelUri: undefined,
            faceTextureUri: undefined,
            avatarReconstructionStatus: 'processing',
          },
          facePhotoUri: selectedPhotoUri,
          fullBodyPhotoUris: [selectedPhotoUri],
        });

        if (reconstruction.status === 'ready' && reconstruction.avatarModelUri) {
          const qualityGates = reconstruction.digitalHuman?.qualityGates ?? {};
          const assetSource = typeof qualityGates.assetSource === 'string' ? qualityGates.assetSource : undefined;
          const assetKey = typeof qualityGates.assetKey === 'string' ? qualityGates.assetKey : undefined;
          const assetLabel = bundleAssetLabel(assetKey);

          setAvatarModelUri(reconstruction.avatarModelUri);
          setAvatarModelProvenance(reconstruction.provenance);
          setAvatarDigitalHumanPipelineType(reconstruction.digitalHuman?.pipelineType);
          setAvatarDigitalHumanAssetSource(assetSource);
          setAvatarDigitalHumanAssetKey(assetKey);
          setFaceTextureUri(reconstruction.faceTextureUri);
          setAvatarReconstructionStatus('ready');
          setAvatarReconstructionMessage(
            reconstruction.digitalHuman?.pipelineType === 'stylefit-parametric-preview-bundle'
              ? `已加载本地 Preview Bundle 数字人资产${assetLabel ? `（${assetLabel}）` : ''}；当前是非身份级 mannequin 预览。`
              : reconstruction.provenance === 'stylefit-dev-baseline'
              ? '已加载自研开发基线 3D 模型；它用于验证 GLB 管线，不是身份级真人重建。'
              : reconstruction.provenance === 'stylefit-parametric-digital-human'
                ? '已加载自托管参数化 AI 数字人 MVP；当前基于档案参数装配，不是照片级身份复刻。'
                : reconstruction.provenance === 'stylefit-digital-human' || reconstruction.provenance === 'stylefit-production'
                  ? '已加载电商级 AI 数字人模型。'
                  : '已加载 3D avatar 模型。',
          );
          return;
        }

        setAvatarReconstructionStatus(reconstruction.status);
        setAvatarReconstructionMessage(
          reconstruction.errorMessage ??
            (reconstruction.status === 'processing'
              ? 'AI 数字人仍在处理中，等待服务端返回 avatarModelUri。'
              : 'AI 数字人服务没有返回可加载的 avatarModelUri。'),
        );
      } catch (error) {
        setAvatarReconstructionStatus('failed');
        setAvatarReconstructionMessage(error instanceof Error ? error.message : 'AI 数字人生成提交失败。');
      }
    }
  }

  async function addWardrobePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('需要相册权限', '开启相册权限后才能上传衣服照片并生成服装 3D 模型。');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled) {
      const nextItem: ClothingItem = {
        id: `upload-${Date.now()}`,
        name: `新上传${categoryOptions.find((category) => category.id === newClothingCategory)?.label}`,
        category: newClothingCategory,
        warmth: newClothingCategory === 'outerwear' ? 6 : 3,
        waterproof: false,
        formality: selectedOccasion === 'formal' ? 7 : 4,
        occasions: [selectedOccasion, 'commute'],
        palette: ['#A8D5BA', '#17202A'],
        material: 'image scan',
        modelStatus: 'scanned',
        imageUri: result.assets[0]?.uri,
        reconstructionStatus: 'queued',
      };

      setWardrobe((items) => [nextItem, ...items]);
      setActiveTab('closet');
    }
  }

  function rotateWeather() {
    setSelectedWeatherIndex((index) => (index + 1) % weatherOptions.length);
  }

  function updateOutfitSlot(category: ClothingCategory, itemId: string | null) {
    setOutfitItemOverrides((current) => ({
      ...current,
      [category]: itemId,
    }));
  }

  function resetOutfitSlots() {
    setOutfitItemOverrides({});
  }

  function renderProfileControls() {
    return (
      <>
        <View style={styles.segmentGroup}>
          <Text style={styles.inputLabel}>模特性别</Text>
          <View style={styles.segmentRow}>
            {genderOptions.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => setGender(option.id)}
                style={[styles.segment, gender === option.id && styles.segmentActive]}
              >
                <Text style={[styles.segmentLabel, gender === option.id && styles.segmentLabelActive]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.inputRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>身高 cm</Text>
            <TextInput value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" style={styles.input} />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>体重 kg</Text>
            <TextInput value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" style={styles.input} />
          </View>
        </View>
        <View style={styles.segmentRow}>
          {fitOptions.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => setFitPreference(option.id)}
              style={[styles.segment, fitPreference === option.id && styles.segmentActive]}
            >
              <Text style={[styles.segmentLabel, fitPreference === option.id && styles.segmentLabelActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={pickAvatarPhoto} disabled={avatarReconstructionBusy} style={[styles.primaryButton, avatarReconstructionBusy && styles.primaryButtonDisabled]}>
          <Camera color={colors.surface} size={18} strokeWidth={2.5} />
          <Text style={styles.primaryButtonText}>{avatarButtonLabel}</Text>
        </Pressable>
        {avatarPhotoUri ? <Image source={{ uri: avatarPhotoUri }} style={styles.avatarThumb} /> : null}
      </>
    );
  }

  function renderOutfitEditor() {
    return (
      <View style={styles.outfitEditor}>
        <View style={styles.outfitEditorHeader}>
          <View>
            <Text style={styles.outfitEditorTitle}>当前穿搭</Text>
            <Text style={styles.outfitEditorMeta}>{hasManualOutfit ? '手动编辑中' : `${selectedOccasionLabel}推荐组合`}</Text>
          </View>
          <Pressable onPress={resetOutfitSlots} style={[styles.compactButton, !hasManualOutfit && styles.compactButtonDisabled]} disabled={!hasManualOutfit}>
            <RefreshCw color={hasManualOutfit ? colors.moss : colors.mutedInk} size={15} strokeWidth={2.4} />
            <Text style={[styles.compactButtonText, !hasManualOutfit && styles.compactButtonTextDisabled]}>推荐一套</Text>
          </Pressable>
        </View>
        <View style={styles.outfitSlotList}>
          {editableOutfitSlots.map((slot) => {
            const selectedItem = outfit.items.find((item) => item.category === slot.id);
            const options = wardrobe.filter((item) => item.category === slot.id);

            return (
              <View key={slot.id} style={styles.outfitSlot}>
                <View style={styles.outfitSlotHeader}>
                  <Text style={styles.outfitSlotLabel}>{slot.label}</Text>
                  <Text style={styles.outfitSlotValue} numberOfLines={1}>{selectedItem?.name ?? '未选择'}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.outfitOptionScroller}>
                  {slot.optional ? (
                    <Pressable
                      onPress={() => updateOutfitSlot(slot.id, null)}
                      style={[styles.outfitOption, !selectedItem && styles.outfitOptionActive]}
                    >
                      <Text style={[styles.outfitOptionText, !selectedItem && styles.outfitOptionTextActive]}>不穿</Text>
                    </Pressable>
                  ) : null}
                  {options.map((item) => {
                    const active = selectedItem?.id === item.id;
                    const readyLabel = itemHasRenderableGarment(item) ? '3D' : '待建模';

                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => updateOutfitSlot(slot.id, item.id)}
                        style={[styles.outfitOption, active && styles.outfitOptionActive]}
                      >
                        <View style={[styles.outfitOptionSwatch, { backgroundColor: item.palette[0] ?? colors.cloud }]} />
                        <Text style={[styles.outfitOptionText, active && styles.outfitOptionTextActive]} numberOfLines={1}>{item.name}</Text>
                        <Text style={[styles.outfitOptionBadge, active && styles.outfitOptionBadgeActive]}>{readyLabel}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  const mobileProfileControls = !wideTryOnLayout ? (
    <View style={styles.mobileControlStack}>
      {renderOutfitEditor()}
      <View style={styles.inlineControlPanel}>
        <View style={styles.inlineControlHeader}>
          <View style={styles.inlineControlTitleRow}>
            <UserRound color={colors.moss} size={17} strokeWidth={2.5} />
            <Text style={styles.inlineControlTitle}>个人参数</Text>
          </View>
          <Text style={styles.inlineControlMeta}>{genderLabel(profile.gender)} · {selectedFitLabel}</Text>
        </View>
        {renderProfileControls()}
      </View>
    </View>
  ) : undefined;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <LinearGradient colors={['#F6F7F2', '#EDF4F1']} style={styles.shell}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.hero}>
              <View style={styles.brandMark}>
                <Sparkles color={colors.surface} size={22} strokeWidth={2.6} />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.kicker}>StyleFit 3D</Text>
                <Text style={styles.heroTitle}>今日穿搭模型</Text>
                <Text style={styles.heroSubtitle}>个人数字人、衣橱、场景和商品推荐已经串成第一版试穿流程。</Text>
              </View>
            </View>

            <View style={styles.tabBar}>
              {tabs.map(({ id, label, Icon }) => {
                const active = activeTab === id;
                return (
                  <Pressable key={id} onPress={() => setActiveTab(id)} style={[styles.tabButton, active && styles.tabButtonActive]}>
                    <Icon color={active ? colors.surface : colors.mutedInk} size={17} strokeWidth={2.5} />
                    <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {activeTab === 'tryOn' ? (
              <View style={[styles.tryOnWorkbench, wideTryOnLayout && styles.tryOnWorkbenchWide]}>
                <View style={[styles.previewColumn, wideTryOnLayout && styles.previewColumnWide]}>
                  <AvatarPreview
                    profile={profile}
                    outfit={outfit}
                    weather={weather}
                    compact={!wideTryOnLayout}
                    controlSlot={mobileProfileControls}
                    onOpenFullscreen={() => setFullscreenPreviewVisible(true)}
                  />
                </View>
                <View style={[styles.controlColumn, wideTryOnLayout && styles.controlColumnWide]}>
                  {wideTryOnLayout ? (
                    <View style={styles.panel}>
                      {renderOutfitEditor()}
                    </View>
                  ) : null}

                  <View style={styles.panel}>
                    <SectionHeader title="试穿状态" eyebrow={`${genderProfileLabel(profile.gender)} · ${selectedOccasionLabel} · ${selectedFitLabel}`} Icon={Sparkles} />
                    <View style={styles.qualityScoreRow}>
                      <Text style={styles.qualityScore}>{qualityScore}%</Text>
                      <View style={styles.qualityScoreCopy}>
                        <Text style={styles.qualityLabel}>{qualityLabel}</Text>
                        <Text style={styles.qualityText}>{reconstructionStatusText(profile.avatarReconstructionStatus, hasRenderableAvatar, avatarReconstructionMessage)}</Text>
                      </View>
                    </View>
                    <View style={styles.scoreTrack}>
                      <View style={[styles.scoreFill, { width: `${qualityScore}%` }]} />
                    </View>
                    <View style={styles.signalList}>
                      {tryOnSignals.map(({ label, value, detail, Icon, accent }) => (
                        <View key={label} style={styles.signalRow}>
                          <View style={[styles.signalIcon, { backgroundColor: `${accent}1A` }]}>
                            <Icon color={accent} size={17} strokeWidth={2.5} />
                          </View>
                          <View style={styles.signalCopy}>
                            <Text style={styles.signalLabel}>{label}</Text>
                            <Text style={styles.signalDetail}>{detail}</Text>
                          </View>
                          <Text style={styles.signalValue}>{value}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={styles.metricsRow}>
                    <MetricCard label="性别" value={genderLabel(profile.gender)} Icon={UserRound} accent={colors.plum} />
                    <MetricCard label="身高" value={`${profile.heightCm}cm`} Icon={Ruler} accent={colors.denim} />
                    <MetricCard label="体重" value={`${profile.weightKg}kg`} Icon={Weight} accent={colors.coral} />
                    <MetricCard label="轮廓" value={bodyBalanceLabel(profile)} Icon={UserRound} accent={colors.moss} />
                  </View>

                  {wideTryOnLayout ? (
                    <View style={styles.panel}>
                      <SectionHeader title="个人数据" eyebrow={`${genderProfileLabel(profile.gender)} · ${selectedFitLabel}`} Icon={UserRound} />
                      {renderProfileControls()}
                    </View>
                  ) : null}

                  <View style={styles.panel}>
                    <SectionHeader title="试穿判定" eyebrow={`${selectedOccasionLabel} · ${outfit.items.length} 件单品`} Icon={Check} />
                    {outfit.stylingNotes.map((note) => (
                      <View key={note} style={styles.noteRow}>
                        <View style={styles.noteDot} />
                        <Text style={styles.noteText}>{note}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ) : null}

            {activeTab === 'closet' ? (
              <View style={styles.stack}>
                <View style={styles.panel}>
                  <SectionHeader title="3D 衣橱" eyebrow="上传服装照片后提交重建服务，生成可进入试穿场景的服装模型。" Icon={Shirt} />
                  <View style={styles.segmentRowWrap}>
                    {categoryOptions.map((option) => (
                      <Pressable
                        key={option.id}
                        onPress={() => setNewClothingCategory(option.id)}
                        style={[styles.categoryChip, newClothingCategory === option.id && styles.categoryChipActive]}
                      >
                        <Text style={[styles.categoryLabel, newClothingCategory === option.id && styles.categoryLabelActive]}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable onPress={addWardrobePhoto} style={styles.primaryButton}>
                    <Upload color={colors.surface} size={18} strokeWidth={2.5} />
                    <Text style={styles.primaryButtonText}>上传衣服生成 3D 模型</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wardrobeScroller}>
                  {wardrobe.map((item) => (
                    <WardrobeCard key={item.id} item={item} selected={outfit.items.some((outfitItem) => outfitItem.id === item.id)} />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {activeTab === 'looks' ? (
              <View style={styles.stack}>
                <View style={styles.panel}>
                  <SectionHeader title="搭配方案" eyebrow="以衣橱和场景为主，环境信息只参与推荐权重。" Icon={Palette} />
                  <View style={styles.segmentRowWrap}>
                    {occasionOptions.map((option) => (
                      <Pressable
                        key={option.id}
                        onPress={() => setSelectedOccasion(option.id)}
                        style={[styles.categoryChip, selectedOccasion === option.id && styles.categoryChipActive]}
                      >
                        <Text style={[styles.categoryLabel, selectedOccasion === option.id && styles.categoryLabelActive]}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.contextStrip}>
                    <View style={styles.contextIcon}>
                      <CloudSun color={colors.saffron} size={18} strokeWidth={2.5} />
                    </View>
                    <View style={styles.contextCopy}>
                      <Text style={styles.contextLabel}>推荐上下文</Text>
                      <Text style={styles.contextText}>{weather.location} · 体感 {weather.feelsLikeC}°C · 只作为排序因子</Text>
                    </View>
                    <Pressable onPress={rotateWeather} style={styles.contextButton}>
                      <RefreshCw color={colors.moss} size={15} strokeWidth={2.5} />
                      <Text style={styles.contextButtonText}>换样例</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.panel}>
                  {renderOutfitEditor()}
                </View>
                <View style={styles.panel}>
                  <SectionHeader title="推荐理由" Icon={Check} />
                  {outfit.stylingNotes.map((note) => (
                    <View key={note} style={styles.noteRow}>
                      <View style={styles.noteDot} />
                      <Text style={styles.noteText}>{note}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {activeTab === 'shop' ? (
              <View style={styles.stack}>
                <View style={styles.panel}>
                  <SectionHeader title="个性化商品" eyebrow={`预算 ¥${profile.budgetCny} 内优先，结合${genderProfileLabel(profile.gender)}、${calculateBmi(profile)} BMI、场景和衣橱缺口排序。`} Icon={ShoppingBag} />
                  <View style={styles.paletteRow}>
                    <Palette color={colors.moss} size={18} />
                    {profile.preferredColors.map((color) => (
                      <View key={color} style={[styles.preferenceSwatch, { backgroundColor: color }]} />
                    ))}
                  </View>
                </View>
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
                <Pressable onPress={() => setActiveTab('closet')} style={styles.secondaryButton}>
                  <Plus color={colors.moss} size={18} strokeWidth={2.5} />
                  <Text style={styles.secondaryButtonText}>先补充衣橱再推荐</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </LinearGradient>
      </KeyboardAvoidingView>
      <AvatarFullscreenPreview
        visible={fullscreenPreviewVisible}
        profile={profile}
        outfit={outfit}
        onClose={() => setFullscreenPreviewVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  keyboardView: {
    flex: 1,
  },
  shell: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingTop: Platform.OS === 'android' ? spacing.xl : spacing.lg,
    paddingBottom: 48,
    gap: spacing.lg,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    flex: 1,
  },
  kicker: {
    color: colors.moss,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  heroTitle: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
  },
  heroSubtitle: {
    color: colors.mutedInk,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 5,
    gap: 5,
  },
  tabButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  tabButtonActive: {
    backgroundColor: colors.ink,
  },
  tabLabel: {
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: '800',
  },
  tabLabelActive: {
    color: colors.surface,
  },
  stack: {
    gap: spacing.lg,
  },
  tryOnWorkbench: {
    gap: spacing.lg,
  },
  tryOnWorkbenchWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  previewColumn: {
    gap: spacing.lg,
  },
  previewColumnWide: {
    flex: 1.42,
    minWidth: 0,
  },
  controlColumn: {
    gap: spacing.lg,
  },
  controlColumnWide: {
    flex: 0.82,
    minWidth: 390,
    maxWidth: 560,
  },
  mobileControlStack: {
    gap: spacing.lg,
  },
  outfitEditor: {
    gap: spacing.md,
  },
  outfitEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  outfitEditorTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  outfitEditorMeta: {
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  compactButton: {
    minHeight: 34,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#2D6A4F30',
    backgroundColor: '#2D6A4F10',
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  compactButtonDisabled: {
    opacity: 0.56,
  },
  compactButtonText: {
    color: colors.moss,
    fontSize: 12,
    fontWeight: '900',
  },
  compactButtonTextDisabled: {
    color: colors.mutedInk,
  },
  outfitSlotList: {
    gap: spacing.md,
  },
  outfitSlot: {
    gap: spacing.xs,
  },
  outfitSlotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  outfitSlotLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  outfitSlotValue: {
    flex: 1,
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  outfitOptionScroller: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  outfitOption: {
    minHeight: 42,
    maxWidth: 168,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  outfitOptionActive: {
    borderColor: colors.moss,
    backgroundColor: '#A8D5BA33',
  },
  outfitOptionSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#00000020',
  },
  outfitOptionText: {
    flexShrink: 1,
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  outfitOptionTextActive: {
    color: colors.moss,
  },
  outfitOptionBadge: {
    color: colors.mutedInk,
    fontSize: 10,
    fontWeight: '900',
  },
  outfitOptionBadgeActive: {
    color: colors.moss,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  panel: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  inlineControlPanel: {
    gap: spacing.md,
  },
  inlineControlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  inlineControlTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  inlineControlTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  inlineControlMeta: {
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: '800',
  },
  qualityScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  qualityScore: {
    color: colors.ink,
    fontSize: 42,
    fontWeight: '900',
    minWidth: 98,
  },
  qualityScoreCopy: {
    flex: 1,
    gap: 4,
  },
  qualityLabel: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  qualityText: {
    color: colors.mutedInk,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  scoreTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.canvas,
    overflow: 'hidden',
  },
  scoreFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.moss,
  },
  signalList: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  signalIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalCopy: {
    flex: 1,
    gap: 2,
  },
  signalLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  signalDetail: {
    color: colors.mutedInk,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  signalValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
    maxWidth: 112,
    textAlign: 'right',
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  inputGroup: {
    flex: 1,
    gap: spacing.xs,
  },
  inputLabel: {
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: '800',
  },
  input: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
    paddingHorizontal: spacing.md,
  },
  segmentRow: {
    flexDirection: 'row',
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
    padding: 4,
    gap: 4,
  },
  segmentGroup: {
    gap: spacing.xs,
  },
  reconstructionStatus: {
    borderRadius: radius.md,
    backgroundColor: '#2D6A4F12',
    borderWidth: 1,
    borderColor: '#2D6A4F30',
    padding: spacing.md,
    gap: spacing.xs,
  },
  statusLabel: {
    color: colors.moss,
    fontSize: 12,
    fontWeight: '900',
  },
  statusValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  segmentLabel: {
    color: colors.mutedInk,
    fontSize: 13,
    fontWeight: '800',
  },
  segmentLabelActive: {
    color: colors.ink,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primaryButtonDisabled: {
    opacity: 0.62,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: '#2D6A4F12',
    borderWidth: 1,
    borderColor: '#2D6A4F30',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.moss,
    fontSize: 15,
    fontWeight: '900',
  },
  avatarThumb: {
    width: 84,
    height: 112,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.line,
  },
  segmentRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  contextStrip: {
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  contextIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7B10A1F',
  },
  contextCopy: {
    flex: 1,
    gap: 2,
  },
  contextLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  contextText: {
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  contextButton: {
    minHeight: 34,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#2D6A4F30',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  contextButtonText: {
    color: colors.moss,
    fontSize: 12,
    fontWeight: '900',
  },
  categoryChip: {
    minHeight: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  categoryLabel: {
    color: colors.mutedInk,
    fontSize: 13,
    fontWeight: '800',
  },
  categoryLabelActive: {
    color: colors.surface,
  },
  wardrobeScroller: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  noteDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.moss,
    marginTop: 6,
  },
  noteText: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  paletteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  preferenceSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00000025',
  },
});
