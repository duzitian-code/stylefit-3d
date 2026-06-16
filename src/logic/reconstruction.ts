import type { AvatarModelProvenance, BodyProfile, ClothingItem, ReconstructionStatus } from '../types';

export type AvatarReconstructionInput = {
  profile: BodyProfile;
  facePhotoUri: string;
  fullBodyPhotoUris: string[];
};

export type AvatarReconstructionResult = {
  status: ReconstructionStatus;
  jobId?: string;
  pollUrl?: string;
  avatarModelUri?: string;
  provenance?: AvatarModelProvenance;
  faceTextureUri?: string;
  errorMessage?: string;
  digitalHuman?: {
    pipelineType?: string;
    version?: string;
    qualityGates?: Record<string, unknown>;
    stageReports?: Array<{ stage: string; stdout?: string }>;
  };
  bodyMeasurements?: {
    shoulderCm: number;
    chestCm: number;
    waistCm: number;
    hipCm: number;
    inseamCm: number;
  };
  rig?: 'smpl' | 'smplx' | 'custom-rig';
};

export type GarmentReconstructionInput = {
  item: ClothingItem;
  flatPhotoUris: string[];
  wornPhotoUris?: string[];
};

export type GarmentReconstructionResult = {
  status: ReconstructionStatus;
  garmentModelUri?: string;
  garmentTextureUri?: string;
  category: ClothingItem['category'];
  materialEstimate?: string;
  sizeRecommendation?: string;
};

export type TryOnRenderInput = {
  avatar: AvatarReconstructionResult;
  garments: GarmentReconstructionResult[];
};

export type TryOnRenderResult = {
  status: ReconstructionStatus;
  combinedModelUri?: string;
  previewImageUri?: string;
};

export function canRenderTrueTryOn(input: TryOnRenderInput) {
  return Boolean(
    input.avatar.status === 'ready' &&
      input.avatar.avatarModelUri &&
      input.garments.length > 0 &&
      input.garments.every((garment) => garment.status === 'ready' && garment.garmentModelUri),
  );
}
