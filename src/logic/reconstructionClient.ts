import type { AvatarReconstructionInput, AvatarReconstructionResult } from './reconstruction';

type AvatarReconstructionApiResult = AvatarReconstructionResult & {
  message?: string;
};

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 120000;

function reconstructionApiBaseUrl() {
  return process.env.EXPO_PUBLIC_RECONSTRUCTION_API_URL?.replace(/\/$/, '') ?? '';
}

function buildApiUrl(baseUrl: string, pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  return `${baseUrl}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function photoUriToBlob(uri: string) {
  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error('无法读取所选照片，请重新选择一张本地图片。');
  }

  return response.blob();
}

async function parseApiResult(response: Response): Promise<AvatarReconstructionApiResult> {
  const payload = (await response.json().catch(() => null)) as AvatarReconstructionApiResult | null;

  if (!response.ok) {
    throw new Error(payload?.errorMessage ?? payload?.message ?? `AI 数字人服务返回 ${response.status}`);
  }

  if (!payload?.status) {
    throw new Error('AI 数字人服务没有返回 status。');
  }

  return payload;
}

async function pollAvatarResult(baseUrl: string, initialResult: AvatarReconstructionApiResult) {
  const pollPath = initialResult.pollUrl ?? (initialResult.jobId ? `/avatar/jobs/${initialResult.jobId}` : undefined);

  if (!pollPath || initialResult.status === 'ready' || initialResult.status === 'failed') {
    return initialResult;
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let latestResult = initialResult;

  while (Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS);
    const response = await fetch(buildApiUrl(baseUrl, pollPath));
    latestResult = await parseApiResult(response);

    if (latestResult.status === 'ready' || latestResult.status === 'failed') {
      return latestResult;
    }
  }

  return {
    ...latestResult,
    status: 'processing' as const,
    errorMessage: latestResult.errorMessage ?? 'AI 数字人仍在生成中，请稍后刷新或重新查询任务。',
  };
}

export async function submitAvatarReconstruction(input: AvatarReconstructionInput): Promise<AvatarReconstructionResult> {
  const baseUrl = reconstructionApiBaseUrl();

  if (!baseUrl) {
    throw new Error('未配置 EXPO_PUBLIC_RECONSTRUCTION_API_URL，无法提交 AI 数字人生成。');
  }

  const formData = new FormData();
  const facePhotoBlob = await photoUriToBlob(input.facePhotoUri);
  formData.append('facePhoto', facePhotoBlob, 'face-photo.jpg');
  formData.append('profile', JSON.stringify(input.profile));

  for (const [index, photoUri] of input.fullBodyPhotoUris.entries()) {
    const photoBlob = photoUri === input.facePhotoUri ? facePhotoBlob : await photoUriToBlob(photoUri);
    formData.append('fullBodyPhotos', photoBlob, `full-body-${index + 1}.jpg`);
  }

  const response = await fetch(buildApiUrl(baseUrl, '/avatar/reconstruct'), {
    method: 'POST',
    body: formData,
  });
  const result = await parseApiResult(response);

  return pollAvatarResult(baseUrl, result);
}