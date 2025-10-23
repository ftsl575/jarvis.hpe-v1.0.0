const explicitProxy = process.env.HPE_PARTSURFER_PROXY;

if (!explicitProxy && process.env.HPE_PARTSURFER_USE_ENV_PROXY !== 'true') {
  for (const key of [
    'http_proxy',
    'https_proxy',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'npm_config_http_proxy',
    'npm_config_https_proxy',
    'YARN_HTTP_PROXY',
    'YARN_HTTPS_PROXY'
  ]) {
    delete process.env[key];
  }
}

const axios = require('axios');

const BASE_URL = 'https://partsurfer.hpe.com';
const USER_AGENT =
  process.env.HPE_PARTSURFER_USER_AGENT ||
  'Mozilla/5.0 (compatible; JarvisHPEBot/1.0; +https://github.com/ftsl575/jarvis.hpe-v1.0.0)';

const throttleMs = Math.max(
  0,
  Number.parseInt(process.env.HPE_PARTSURFER_THROTTLE_MS ?? '1000', 10) || 0
);

let lastRequest = 0;

function buildProxyConfig() {
  if (!explicitProxy) {
    return false;
  }

  try {
    const parsed = new URL(explicitProxy);
    return {
      protocol: parsed.protocol.replace(':', ''),
      host: parsed.hostname,
      port: parsed.port ? Number.parseInt(parsed.port, 10) : undefined
    };
  } catch (error) {
    return false;
  }
}

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml'
  },
  responseType: 'text',
  proxy: buildProxyConfig()
});

async function throttle() {
  if (throttleMs <= 0) {
    return;
  }
  const now = Date.now();
  const waitTime = throttleMs - (now - lastRequest);
  if (waitTime > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  lastRequest = Date.now();
}

async function get(path, params) {
  await throttle();
  const response = await client.get(path, { params });
  return response.data;
}

function fetchSearch(partNumber) {
  return get('/Search.aspx', { SearchText: partNumber });
}

function fetchPhoto(partNumber) {
  return get('/ShowPhoto.aspx', { partnumber: partNumber });
}

module.exports = {
  fetchSearch,
  fetchPhoto,
  BASE_URL
};
