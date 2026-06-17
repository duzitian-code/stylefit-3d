import type {
  BodyProfile,
  ClothingCategory,
  ClothingItem,
  Occasion,
  Outfit,
  ProductRecommendation,
  WeatherSnapshot,
} from '../types';

const categoryOrder: ClothingCategory[] = ['top', 'bottom', 'outerwear', 'shoes', 'accessory'];

export function calculateBmi(profile: BodyProfile) {
  const heightM = profile.heightCm / 100;
  return Number((profile.weightKg / (heightM * heightM)).toFixed(1));
}

export function bodyBalanceLabel(profile: BodyProfile) {
  const bmi = calculateBmi(profile);

  if (bmi < 18.5) {
    return '轻盈轮廓';
  }

  if (bmi < 24) {
    return '标准轮廓';
  }

  if (bmi < 28) {
    return '饱满轮廓';
  }

  return '强支撑轮廓';
}

function targetWarmth(weather: WeatherSnapshot) {
  if (weather.feelsLikeC >= 28) {
    return 2;
  }

  if (weather.feelsLikeC >= 22) {
    return 3;
  }

  if (weather.feelsLikeC >= 15) {
    return 5;
  }

  return 7;
}

function scoreItem(item: ClothingItem, weather: WeatherSnapshot, occasion: Occasion, profile: BodyProfile) {
  const warmthScore = 28 - Math.abs(item.warmth - targetWarmth(weather)) * 5;
  const rainScore = weather.condition === 'rainy' ? (item.waterproof ? 18 : -10) : 0;
  const windScore = weather.windKph > 20 && item.category === 'outerwear' ? 8 : 0;
  const occasionScore = item.occasions.includes(occasion) ? 22 : -4;
  const formalityTarget = occasion === 'formal' ? 8 : occasion === 'commute' ? 6 : occasion === 'date' ? 5 : 3;
  const formalityScore = 12 - Math.abs(item.formality - formalityTarget) * 2;
  const colorScore = item.palette.some((color) => profile.preferredColors.includes(color)) ? 8 : 0;
  const fitScore = profile.fitPreference === 'tailored' && item.formality >= 6 ? 5 : 0;

  return warmthScore + rainScore + windScore + occasionScore + formalityScore + colorScore + fitScore;
}

function pickCategory(
  wardrobe: ClothingItem[],
  category: ClothingCategory,
  weather: WeatherSnapshot,
  occasion: Occasion,
  profile: BodyProfile,
) {
  return wardrobe
    .filter((item) => item.category === category)
    .sort((left, right) => scoreItem(right, weather, occasion, profile) - scoreItem(left, weather, occasion, profile))[0];
}

function shouldUseOuterwear(weather: WeatherSnapshot) {
  return weather.feelsLikeC <= 22 || weather.condition === 'rainy' || weather.condition === 'windy';
}

function modelFitNote(profile: BodyProfile) {
  if (profile.gender === 'male') {
    return '当前使用男模特比例，肩部和腿部宽度会略微放宽，用于估算上身空间。';
  }

  if (profile.gender === 'female') {
    return '当前使用女模特比例，腰线和肩线会按真人参考图做更贴近的试穿估算。';
  }

  return '当前使用中性模特比例，单品选择不按性别锁定，优先看尺码和场景适配。';
}

export function generateOutfit(wardrobe: ClothingItem[], weather: WeatherSnapshot, occasion: Occasion, profile: BodyProfile): Outfit {
  const picks = categoryOrder
    .map((category) => {
      if (category === 'outerwear' && !shouldUseOuterwear(weather)) {
        return undefined;
      }

      return pickCategory(wardrobe, category, weather, occasion, profile);
    })
    .filter((item): item is ClothingItem => Boolean(item));

  const averageWarmth = picks.reduce((total, item) => total + item.warmth, 0) / Math.max(picks.length, 1);
  const weatherFitScore = picks.reduce((total, item) => total + scoreItem(item, weather, occasion, profile), 0) / Math.max(picks.length, 1);
  const waterproofItems = picks.filter((item) => item.waterproof).length;

  const stylingNotes = [
    `已把${weather.location}体感 ${weather.feelsLikeC}°C 作为推荐权重，整体保暖目标为 ${targetWarmth(weather)}/10。`,
    weather.condition === 'rainy' && waterproofItems === 0
      ? '建议补一件防泼水单品，避免雨天材质变形。'
      : '当前组合在场景、版型和环境权重下表现稳定，可直接保存为今日方案。',
    profile.fitPreference === 'tailored'
      ? '版型建议保持腰线和肩线清晰，增强试穿模型的利落感。'
      : '版型建议保留适度余量，提升日常活动舒适度。',
    modelFitNote(profile),
  ];

  return {
    id: `${weather.condition}-${occasion}-${picks.map((item) => item.id).join('-')}`,
    title: shouldUseOuterwear(weather) ? '场景适配叠穿' : '轻量通勤造型',
    summary: picks.map((item) => item.name).join(' · '),
    items: picks,
    warmthScore: Number(Math.min(10, Math.max(1, averageWarmth)).toFixed(1)),
    weatherFitScore: Math.round(Math.min(98, Math.max(58, weatherFitScore + 52))),
    stylingNotes,
  };
}

export function recommendProducts(
  catalog: ProductRecommendation[],
  wardrobe: ClothingItem[],
  weather: WeatherSnapshot,
  occasion: Occasion,
  profile: BodyProfile,
) {
  const ownedCategories = new Set(wardrobe.map((item) => item.category));

  return catalog
    .map((product) => {
      const budgetScore = product.priceCny <= profile.budgetCny ? 18 : -12;
      const occasionScore = product.occasions.includes(occasion) ? 18 : 0;
      const missingCategoryScore = ownedCategories.has(product.category) ? 0 : 12;
      const rainScore = weather.condition === 'rainy' && product.reason.includes('雨') ? 10 : 0;
      const colorScore = product.palette.some((color) => profile.preferredColors.includes(color)) ? 8 : 0;

      return {
        ...product,
        matchScore: budgetScore + occasionScore + missingCategoryScore + rainScore + colorScore,
      };
    })
    .sort((left, right) => right.matchScore - left.matchScore)
    .slice(0, 3);
}