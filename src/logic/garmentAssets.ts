import type { BodyProfile, ClothingItem, GarmentPreviewAsset, GarmentPreviewLayer, Outfit } from '../types';

const layerOrder: Record<GarmentPreviewLayer, number> = {
  base: 10,
  middle: 20,
  outer: 30,
  footwear: 40,
  accessory: 50,
};

export type RenderableGarmentLayer = {
  itemId: string;
  name: string;
  asset: GarmentPreviewAsset;
  primaryColor: string;
  secondaryColor: string;
  widthScale: number;
  heightScale: number;
  renderOrder: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function profileWidthScale(profile: BodyProfile) {
  const heightM = profile.heightCm / 100;
  const bmi = profile.weightKg / Math.max(heightM * heightM, 0.001);
  const bmiScale = 1 + clamp((bmi - 21.5) * 0.018, -0.08, 0.16);
  const genderScale = profile.gender === 'male' ? 1.08 : profile.gender === 'nonBinary' ? 1.02 : 0.97;
  const fitScale = profile.fitPreference === 'relaxed' ? 1.06 : profile.fitPreference === 'tailored' ? 0.98 : 1.02;

  return clamp(bmiScale * genderScale * fitScale, 0.86, 1.24);
}

function profileHeightScale(profile: BodyProfile) {
  return clamp(profile.heightCm / 168, 0.94, 1.08);
}

export function itemHasRenderableGarment(item: ClothingItem) {
  return Boolean(item.garmentModelUri || item.garmentPreviewAsset);
}

export function outfitGarmentCoverage(outfit: Outfit) {
  const readyItems = outfit.items.filter(itemHasRenderableGarment);
  const proceduralItems = readyItems.filter((item) => item.garmentPreviewAsset?.source === 'stylefit-procedural-preview');
  const providerItems = readyItems.filter((item) => Boolean(item.garmentModelUri));
  const total = Math.max(outfit.items.length, 1);

  return {
    ready: readyItems.length,
    total,
    label: `${readyItems.length}/${total} 件`,
    detail:
      providerItems.length > 0
        ? `${providerItems.length} 件真实 GLB，${proceduralItems.length} 件预览层`
        : proceduralItems.length === readyItems.length && readyItems.length > 0
          ? '程序化 3D 服装层已接入'
          : '仍有单品等待建模',
  };
}

export function getRenderableGarmentLayers(outfit: Outfit, profile: BodyProfile): RenderableGarmentLayer[] {
  const widthScale = profileWidthScale(profile);
  const heightScale = profileHeightScale(profile);

  return outfit.items
    .filter((item): item is ClothingItem & { garmentPreviewAsset: GarmentPreviewAsset } => Boolean(item.garmentPreviewAsset))
    .map((item) => ({
      itemId: item.id,
      name: item.name,
      asset: item.garmentPreviewAsset,
      primaryColor: item.palette[0] ?? '#2D6A4F',
      secondaryColor: item.palette[1] ?? item.palette[0] ?? '#FFFFFF',
      widthScale: widthScale * (1 + item.garmentPreviewAsset.fitAllowance),
      heightScale,
      renderOrder: layerOrder[item.garmentPreviewAsset.layer] + item.garmentPreviewAsset.renderOrder,
    }))
    .sort((left, right) => left.renderOrder - right.renderOrder);
}