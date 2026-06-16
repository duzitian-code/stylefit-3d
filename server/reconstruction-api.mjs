import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 8787);
const corsOrigin = process.env.CORS_ORIGIN ?? '*';
const provider = process.env.AVATAR_RECONSTRUCTION_PROVIDER ?? 'stylefit';
const providerUrl = process.env.AVATAR_RECONSTRUCTION_PROVIDER_URL;
const providerToken = process.env.AVATAR_RECONSTRUCTION_PROVIDER_TOKEN;
const stylefitWorkerUrl = (process.env.STYLEFIT_AVATAR_WORKER_URL ?? 'http://localhost:8791').replace(/\/$/, '');
const triposrWorkerUrl = (process.env.TRIPOSR_WORKER_URL ?? 'http://localhost:8790').replace(/\/$/, '');

function writeCorsHeaders(response, extraHeaders = {}) {
  response.setHeader('Access-Control-Allow-Origin', corsOrigin);
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  for (const [key, value] of Object.entries(extraHeaders)) {
    response.setHeader(key, value);
  }
}

function sendJson(response, statusCode, payload) {
  writeCorsHeaders(response, { 'Content-Type': 'application/json' });
  response.writeHead(statusCode);
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function forwardAvatarReconstruction(request, response) {
  if (!providerUrl) {
    sendJson(response, 503, {
      status: 'failed',
      errorMessage: '本地 Reconstruction API 已运行，但尚未配置 AVATAR_RECONSTRUCTION_PROVIDER_URL。',
    });
    return;
  }

  const body = await readBody(request);
  const headers = {
    'Content-Type': request.headers['content-type'] ?? 'application/octet-stream',
  };

  if (providerToken) {
    headers.Authorization = `Bearer ${providerToken}`;
  }

  const upstreamResponse = await fetch(providerUrl, {
    method: 'POST',
    headers,
    body,
  });
  const upstreamBody = Buffer.from(await upstreamResponse.arrayBuffer());

  writeCorsHeaders(response, {
    'Content-Type': upstreamResponse.headers.get('content-type') ?? 'application/json',
  });
  response.writeHead(upstreamResponse.status);
  response.end(upstreamBody);
}

async function forwardToWorker(request, response, workerUrl, workerLabel, startHint) {
  const body = await readBody(request);
  let upstreamResponse;

  try {
    upstreamResponse = await fetch(`${workerUrl}/avatar/reconstruct`, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers['content-type'] ?? 'application/octet-stream',
      },
      body,
    });
  } catch {
    sendJson(response, 503, {
      status: 'failed',
      errorMessage: `${workerLabel} worker is not reachable at ${workerUrl}. ${startHint}`,
    });
    return;
  }

  const upstreamBody = Buffer.from(await upstreamResponse.arrayBuffer());

  writeCorsHeaders(response, {
    'Content-Type': upstreamResponse.headers.get('content-type') ?? 'application/json',
  });
  response.writeHead(upstreamResponse.status);
  response.end(upstreamBody);
}

async function forwardWorkerJob(request, response, workerUrl, workerLabel, startHint) {
  let upstreamResponse;

  try {
    upstreamResponse = await fetch(`${workerUrl}${request.url}`, {
      method: 'GET',
    });
  } catch {
    sendJson(response, 503, {
      status: 'failed',
      errorMessage: `${workerLabel} worker is not reachable at ${workerUrl}. ${startHint}`,
    });
    return;
  }

  const upstreamBody = Buffer.from(await upstreamResponse.arrayBuffer());

  writeCorsHeaders(response, {
    'Content-Type': upstreamResponse.headers.get('content-type') ?? 'application/json',
  });
  response.writeHead(upstreamResponse.status);
  response.end(upstreamBody);
}

async function handleAvatarReconstruction(request, response) {
  if (provider === 'stylefit') {
    await forwardToWorker(
      request,
      response,
      stylefitWorkerUrl,
      'StyleFit Avatar',
      'Start it with npm run reconstruction:worker:stylefit or follow workers/stylefit_avatar/README.md.',
    );
    return;
  }

  if (provider === 'triposr') {
    await forwardToWorker(
      request,
      response,
      triposrWorkerUrl,
      'TripoSR',
      'Start it with npm run reconstruction:worker:triposr or the Docker command in workers/triposr/README.md.',
    );
    return;
  }

  await forwardAvatarReconstruction(request, response);
}

async function handleAvatarJob(request, response) {
  if (provider === 'stylefit') {
    await forwardWorkerJob(
      request,
      response,
      stylefitWorkerUrl,
      'StyleFit Avatar',
      'Start it with npm run reconstruction:worker:stylefit or follow workers/stylefit_avatar/README.md.',
    );
    return;
  }

  if (provider === 'triposr') {
    await forwardWorkerJob(
      request,
      response,
      triposrWorkerUrl,
      'TripoSR',
      'Start it with npm run reconstruction:worker:triposr or the Docker command in workers/triposr/README.md.',
    );
    return;
  }

  sendJson(response, 404, {
    status: 'failed',
    errorMessage: 'The configured generic reconstruction provider does not expose local job polling.',
  });
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'OPTIONS') {
      writeCorsHeaders(response);
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, {
        ok: true,
        provider,
        providerConfigured: provider === 'stylefit' ? Boolean(stylefitWorkerUrl) : provider === 'triposr' ? Boolean(triposrWorkerUrl) : Boolean(providerUrl),
        stylefitWorkerUrl: provider === 'stylefit' ? stylefitWorkerUrl : undefined,
        triposrWorkerUrl: provider === 'triposr' ? triposrWorkerUrl : undefined,
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/avatar/reconstruct') {
      await handleAvatarReconstruction(request, response);
      return;
    }

    if (request.method === 'GET' && request.url?.startsWith('/avatar/jobs/')) {
      await handleAvatarJob(request, response);
      return;
    }

    sendJson(response, 404, {
      status: 'failed',
      errorMessage: 'Unknown reconstruction API route.',
    });
  } catch (error) {
    sendJson(response, 500, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Reconstruction API failed.',
    });
  }
});

server.listen(port, () => {
  console.log(`Reconstruction API proxy listening on http://localhost:${port}`);
});