export type ClothingCategory = 'top' | 'bottom' | 'outerwear' | 'shoes' | 'accessory';

export type Occasion = 'commute' | 'date' | 'travel' | 'fitness' | 'formal';

export type WeatherCondition = 'sunny' | 'cloudy' | 'rainy' | 'windy' | 'cold';

export type FitPreference = 'relaxed' | 'regular' | 'tailored';

export type Gender = 'female' | 'male' | 'nonBinary';

export type ReconstructionStatus = 'sample' | 'idle' | 'queued' | 'processing' | 'ready' | 'failed';

export type ModelAssetSource = string | number;

export type AvatarModelProvenance = 'stylefit-digital-human' | 'stylefit-production' | 'stylefit-parametric-digital-human' | 'stylefit-dev-baseline' | 'sample';

export type BodyProfile = {
  gender: Gender;
  heightCm: number;
  weightKg: number;
  fitPreference: FitPreference;
  preferredColors: string[];
  budgetCny: number;
  avatarReconstructionStatus: ReconstructionStatus;
  avatarPhotoUri?: string;
  modelPhotoUri?: string;
  sampleAvatarModelSource?: ModelAssetSource;
  avatarModelUri?: string;
  avatarModelProvenance?: AvatarModelProvenance;
  avatarDigitalHumanPipelineType?: string;
  avatarDigitalHumanAssetSource?: string;
  avatarDigitalHumanAssetKey?: string;
  faceTextureUri?: string;
};

export type WeatherSnapshot = {
  location: string;
  temperatureC: number;
  condition: WeatherCondition;
  humidity: number;
  windKph: number;
  feelsLikeC: number;
};

export type ClothingItem = {
  id: string;
  name: string;
  category: ClothingCategory;
  warmth: number;
  waterproof: boolean;
  formality: number;
  occasions: Occasion[];
  palette: string[];
  material: string;
  modelStatus: 'mock-3d' | 'scanned' | 'generated';
  imageUri?: string;
  reconstructionStatus?: ReconstructionStatus;
  garmentModelUri?: string;
  garmentTextureUri?: string;
};

export type Outfit = {
  id: string;
  title: string;
  summary: string;
  items: ClothingItem[];
  warmthScore: number;
  weatherFitScore: number;
  stylingNotes: string[];
};

export type ProductRecommendation = {
  id: string;
  name: string;
  category: ClothingCategory;
  priceCny: number;
  source: string;
  palette: string[];
  occasions: Occasion[];
  reason: string;
  modelPreview: 'available' | 'estimated';
  imageUri?: string;
};