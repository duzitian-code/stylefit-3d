import { createElement } from 'react';
import { Image, Modal, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Maximize2, X } from 'lucide-react-native';
import type { BodyProfile, ClothingCategory, Outfit, WeatherSnapshot } from '../types';
import { bodyBalanceLabel, calculateBmi } from '../logic/recommendations';
import { colors, radius, spacing } from '../theme';
import { TryOnModel3D } from './TryOnModel3D';

type AvatarPreviewProps = {
  profile: BodyProfile;
  outfit: Outfit;
  weather: WeatherSnapshot;
  onOpenFullscreen?: () => void;
};

type AvatarFullscreenPreviewProps = {
  visible: boolean;
  profile: BodyProfile;
  outfit: Outfit;
  onClose: () => void;
};

const labelByCategory: Record<ClothingCategory, string> = {
  top: '上装',
  bottom: '下装',
  outerwear: '外套',
  shoes: '鞋履',
  accessory: '配饰',
};

const PREVIEW_BUNDLE_PIPELINE = 'stylefit-parametric-preview-bundle';

const webExpandButtonStyle = {
  position: 'absolute',
  top: spacing.md,
  left: spacing.md,
  zIndex: 4,
  width: 38,
  height: 38,
  borderRadius: radius.md,
  backgroundColor: '#FFFFFFD9',
  border: `1px solid ${colors.line}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
};

const webCloseButtonStyle = {
  width: 42,
  height: 42,
  borderRadius: radius.md,
  backgroundColor: 'transparent',
  border: '1px solid #FFFFFF26',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
};

function hasRenderableModel(profile: BodyProfile) {
  return Boolean(profile.avatarModelUri || (profile.sampleAvatarModelSource && profile.avatarReconstructionStatus === 'sample'));
}

function genderLabel(profile: BodyProfile) {
  if (!hasRenderableModel(profile) || profile.avatarModelProvenance === 'stylefit-dev-baseline') {
    if (profile.gender === 'male') {
      return profile.avatarModelProvenance === 'stylefit-dev-baseline' ? '男性自研基线档案' : '男性档案';
    }

    if (profile.gender === 'female') {
      return profile.avatarModelProvenance === 'stylefit-dev-baseline' ? '女性自研基线档案' : '女性档案';
    }

    return profile.avatarModelProvenance === 'stylefit-dev-baseline' ? '中性自研基线档案' : '中性档案';
  }

  if (profile.avatarModelProvenance === 'stylefit-parametric-digital-human') {
    if (profile.avatarDigitalHumanPipelineType === PREVIEW_BUNDLE_PIPELINE) {
      if (profile.gender === 'male') {
        return '男本地 Bundle 数字人';
      }

      if (profile.gender === 'female') {
        return '女本地 Bundle 数字人';
      }

      return '中性本地 Bundle 数字人';
    }

    if (profile.gender === 'male') {
      return '男参数化 AI 数字人';
    }

    if (profile.gender === 'female') {
      return '女参数化 AI 数字人';
    }

    return '中性参数化 AI 数字人';
  }

  if (profile.avatarModelProvenance === 'stylefit-digital-human' || profile.avatarModelProvenance === 'stylefit-production') {
    if (profile.gender === 'male') {
      return '男 AI 数字人';
    }

    if (profile.gender === 'female') {
      return '女 AI 数字人';
    }

    return '中性 AI 数字人';
  }

  if (profile.gender === 'male') {
    return '男模特';
  }

  if (profile.gender === 'female') {
    return '女模特';
  }

  return '中性模特';
}

function previewAssetLabel(profile: BodyProfile) {
  const assetKey = profile.avatarDigitalHumanAssetKey;

  if (profile.avatarDigitalHumanPipelineType === PREVIEW_BUNDLE_PIPELINE) {
    if (!assetKey) {
      return '本地 Preview Bundle';
    }

    const [genderKey, fitKey] = assetKey.split(':');
    const genderText: Record<string, string> = { female: '女', male: '男', nonBinary: '中性', default: '默认' };
    const fitText: Record<string, string> = { relaxed: '宽松', regular: '合体', tailored: '利落' };
    return `本地 Preview Bundle · ${genderText[genderKey] ?? genderKey}${fitKey ? ` · ${fitText[fitKey] ?? fitKey}` : ''}`;
  }

  if (profile.avatarModelProvenance === 'stylefit-production' || profile.avatarModelProvenance === 'stylefit-digital-human') {
    return 'AI 数字人模型';
  }

  if (profile.avatarModelProvenance === 'stylefit-parametric-digital-human') {
    return '参数化数字人模型';
  }

  return hasRenderableModel(profile) ? '3D 模型已加载' : '等待数字人模型';
}

function previewStatusText(profile: BodyProfile) {
  if (profile.avatarDigitalHumanPipelineType === PREVIEW_BUNDLE_PIPELINE) {
    return '非身份级 mannequin 预览';
  }

  if (profile.avatarModelProvenance === 'stylefit-production' || profile.avatarModelProvenance === 'stylefit-digital-human') {
    return '电商级资产候选';
  }

  if (profile.avatarReconstructionStatus === 'processing') {
    return '数字人生成中';
  }

  return hasRenderableModel(profile) ? '可进入试穿预览' : '上传照片后生成';
}

export function AvatarPreview({ profile, outfit, weather, onOpenFullscreen }: AvatarPreviewProps) {
  const bodyBalance = bodyBalanceLabel(profile);
  const canOpenFullscreen = hasRenderableModel(profile);

  function openFullscreen() {
    if (canOpenFullscreen) {
      onOpenFullscreen?.();
    }
  }

  const expandControl =
    Platform.OS === 'web' ? (
      createElement(
        'button',
        {
          type: 'button',
          'aria-label': '全屏查看 3D 预览',
          onClick: openFullscreen,
          onMouseDown: openFullscreen,
          onPointerDown: openFullscreen,
          style: webExpandButtonStyle,
        },
        createElement(Maximize2, { color: colors.ink, size: 17, strokeWidth: 2.5, style: { pointerEvents: 'none' } }),
      )
    ) : (
      <Pressable onPress={openFullscreen} style={styles.expandButton} accessibilityRole="button" accessibilityLabel="全屏查看 3D 预览">
        <Maximize2 color={colors.ink} size={17} strokeWidth={2.5} />
      </Pressable>
    );

  return (
    <View style={styles.card}>
      <LinearGradient colors={['#F7FAF8', '#E6EDE6']} style={styles.stage}>
        <View style={styles.weatherBadge}>
          <Text style={styles.weatherText}>{weather.location} · {weather.feelsLikeC}°C</Text>
        </View>
        {expandControl}
        <TryOnModel3D profile={profile} outfit={outfit} onOpenFullscreen={openFullscreen} showBadge={false} />
      </LinearGradient>
      <View style={styles.details}>
        <View>
          <Text style={styles.modelKicker}>{genderLabel(profile)} · {profile.heightCm}cm · {bodyBalance}</Text>
          <Text style={styles.title}>{outfit.title}</Text>
          <Text style={styles.summary}>{outfit.summary}</Text>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <Text style={styles.statValue}>{calculateBmi(profile)}</Text>
            <Text style={styles.statLabel}>BMI</Text>
          </View>
          <View style={styles.statPill}>
            <Text style={styles.statValue}>{outfit.weatherFitScore}%</Text>
            <Text style={styles.statLabel}>天气适配</Text>
          </View>
          <View style={styles.statPill}>
            <Text style={styles.statValue}>{bodyBalance}</Text>
            <Text style={styles.statLabel}>模型轮廓</Text>
          </View>
        </View>
        <View style={styles.layerList}>
          {outfit.items.map((item) => (
            <View key={item.id} style={styles.layerItem}>
              {item.imageUri ? (
                <Image source={{ uri: item.imageUri }} style={styles.layerThumb} resizeMode="cover" />
              ) : (
                <View style={[styles.layerDot, { backgroundColor: item.palette[0] }]} />
              )}
              <Text style={styles.layerText}>{labelByCategory[item.category]} · {item.name}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export function AvatarFullscreenPreview({ visible, profile, outfit, onClose }: AvatarFullscreenPreviewProps) {
  if (!visible) {
    return null;
  }

  const closeControl =
    Platform.OS === 'web' ? (
      createElement(
        'button',
        {
          type: 'button',
          'aria-label': '关闭 3D 全屏预览',
          onClick: onClose,
          onMouseDown: onClose,
          onPointerDown: onClose,
          style: webCloseButtonStyle,
        },
        createElement(X, { color: colors.surface, size: 22, strokeWidth: 2.6, style: { pointerEvents: 'none' } }),
      )
    ) : (
      <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="关闭 3D 全屏预览">
        <X color={colors.surface} size={22} strokeWidth={2.6} />
      </Pressable>
    );

  const fullscreenContent = (
    <View style={styles.fullscreenRoot}>
      <SafeAreaView style={styles.fullscreenSafe}>
        <View style={styles.fullscreenHeader}>
          <View style={styles.fullscreenTitleGroup}>
            <Text style={styles.fullscreenTitle}>3D 细节预览</Text>
            <Text style={styles.fullscreenSubtitle}>{previewAssetLabel(profile)} · {previewStatusText(profile)}</Text>
          </View>
          {closeControl}
        </View>
        <View style={styles.fullscreenStage}>
          <TryOnModel3D profile={profile} outfit={outfit} fullScreen showBadge={false} />
        </View>
      </SafeAreaView>
    </View>
  );

  if (Platform.OS === 'web') {
    return <View style={styles.fullscreenWebOverlay}>{fullscreenContent}</View>;
  }

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      {fullscreenContent}
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  stage: {
    height: 560,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weatherBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 3,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFFD9',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  weatherText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  expandButton: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    zIndex: 4,
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFFD9',
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  modelKicker: {
    color: colors.moss,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  summary: {
    color: colors.mutedInk,
    marginTop: spacing.xs,
    fontSize: 13,
    lineHeight: 19,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statPill: {
    flex: 1,
    minHeight: 62,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  statValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  statLabel: {
    color: colors.mutedInk,
    fontSize: 11,
    marginTop: 3,
  },
  layerList: {
    gap: spacing.xs,
  },
  layerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  layerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#00000020',
  },
  layerThumb: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cloud,
  },
  layerText: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  fullscreenRoot: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  fullscreenWebOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9999,
    backgroundColor: colors.ink,
  },
  fullscreenSafe: {
    flex: 1,
  },
  fullscreenHeader: {
    minHeight: 68,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  fullscreenTitleGroup: {
    flex: 1,
    gap: 4,
  },
  fullscreenTitle: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: '900',
  },
  fullscreenSubtitle: {
    color: '#FFFFFFB8',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FFFFFF26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenStage: {
    flex: 1,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#F7FAF8',
  },
});
