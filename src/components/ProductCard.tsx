import { Image, StyleSheet, Text, View } from 'react-native';
import { CircleDollarSign, Shirt } from 'lucide-react-native';
import type { ProductRecommendation } from '../types';
import { colors, radius, spacing } from '../theme';

type RankedProduct = ProductRecommendation & { matchScore?: number };

type ProductCardProps = {
  product: RankedProduct;
};

const categoryLabel = {
  top: '上装',
  bottom: '下装',
  outerwear: '外套',
  shoes: '鞋履',
  accessory: '配饰',
};

export function ProductCard({ product }: ProductCardProps) {
  const modelLabel = product.modelPreview === 'available' ? '商品 3D 模型可用' : '需生成服装 3D 模型';

  return (
    <View style={styles.card}>
      <View style={styles.visualColumn}>
        <View style={styles.preview}>
          {product.imageUri ? <Image source={{ uri: product.imageUri }} style={styles.image} resizeMode="cover" /> : <Shirt color={colors.ink} size={32} strokeWidth={2.2} />}
          <View style={styles.swatches}>
            {product.palette.map((color) => (
              <View key={color} style={[styles.swatch, { backgroundColor: color }]} />
            ))}
          </View>
        </View>
        <Text style={styles.previewLabel}>{modelLabel}</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.source}>{product.source} · {categoryLabel[product.category]}</Text>
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.reason}>{product.reason}</Text>
        <View style={styles.modelStatusBox}>
          <Text style={styles.modelStatusTitle}>3D 试穿条件</Text>
          <Text style={styles.modelStatusText}>{product.modelPreview === 'available' ? '可接入服装 glTF 后进入试穿场景。' : '需要先完成服装分割、网格重建和纹理烘焙。'}</Text>
        </View>
        <View style={styles.footer}>
          <View style={styles.priceRow}>
            <CircleDollarSign color={colors.moss} size={16} />
            <Text style={styles.price}>¥{product.priceCny}</Text>
          </View>
          <Text style={styles.match}>{Math.max(72, 82 + (product.matchScore ?? 0) / 4).toFixed(0)}%</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    padding: spacing.sm,
    gap: spacing.md,
  },
  visualColumn: {
    width: 112,
    gap: spacing.xs,
  },
  preview: {
    width: 112,
    height: 136,
    borderRadius: radius.md,
    backgroundColor: colors.cloud,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  swatches: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  swatch: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFFFFFCC',
  },
  content: {
    flex: 1,
    gap: spacing.xs,
  },
  source: {
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: '700',
  },
  name: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  reason: {
    color: colors.mutedInk,
    fontSize: 13,
    lineHeight: 18,
  },
  previewLabel: {
    color: colors.moss,
    fontSize: 11,
    fontWeight: '900',
  },
  modelStatusBox: {
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.sm,
    gap: 3,
    marginTop: spacing.xs,
  },
  modelStatusTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  modelStatusText: {
    color: colors.mutedInk,
    fontSize: 11,
    lineHeight: 15,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  price: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  match: {
    color: colors.moss,
    fontSize: 13,
    fontWeight: '800',
  },
});