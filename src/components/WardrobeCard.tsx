import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ScanLine } from 'lucide-react-native';
import type { ClothingItem } from '../types';
import { colors, radius, spacing } from '../theme';

type WardrobeCardProps = {
  item: ClothingItem;
  selected?: boolean;
  onPress?: () => void;
};

const categoryLabel = {
  top: '上装',
  bottom: '下装',
  outerwear: '外套',
  shoes: '鞋履',
  accessory: '配饰',
};

function modelLabel(item: ClothingItem) {
  if (item.reconstructionStatus === 'queued') {
    return '建模队列';
  }

  if (item.reconstructionStatus === 'processing') {
    return '建模中';
  }

  if (item.garmentModelUri || item.reconstructionStatus === 'ready') {
    return '3D 模型';
  }

  if (item.reconstructionStatus === 'sample') {
    return '样例模型';
  }

  return item.modelStatus === 'mock-3d' ? '3D 预览' : '待建模';
}

export function WardrobeCard({ item, selected, onPress }: WardrobeCardProps) {
  return (
    <Pressable onPress={onPress} style={[styles.card, selected && styles.selected]}>
      <View style={styles.preview}>
        {item.imageUri ? <Image source={{ uri: item.imageUri }} style={styles.image} resizeMode="cover" /> : <ScanLine color={colors.moss} size={28} />}
      </View>
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          {selected ? <Check color={colors.moss} size={17} strokeWidth={2.6} /> : null}
        </View>
        <Text style={styles.meta}>{categoryLabel[item.category]} · {item.material}</Text>
        <View style={styles.swatches}>
          {item.palette.map((color) => (
            <View key={color} style={[styles.swatch, { backgroundColor: color }]} />
          ))}
          <Text style={styles.model}>{modelLabel(item)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 192,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  selected: {
    borderColor: colors.moss,
  },
  preview: {
    height: 112,
    borderRadius: radius.md,
    backgroundColor: colors.cloud,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  content: {
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  name: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  meta: {
    color: colors.mutedInk,
    fontSize: 12,
  },
  swatches: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#00000018',
  },
  model: {
    color: colors.moss,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: spacing.xs,
  },
});