import axios from 'axios';

const client = axios.create({
  baseURL: 'https://partsurfer.hpe.com/',
  timeout: 10_000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; HPEPartSurferBot/1.0)'
  },
  responseType: 'text',
  proxy: false
});

const RETRY_DELAYS = [300, 900];

function shouldRetry(error) {
  if (!error) {
    return false;
  }

  if (error.response) {
    return error.response.status >= 500;
  }

  return true;
}

async function performGet(url) {
  let lastError;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    try {
      const response = await client.get(url);
      return response.data;
    } catch (error) {
      lastError = error;

      if (!shouldRetry(error) || attempt === RETRY_DELAYS.length) {
        throw error;
      }

      const delayMs = RETRY_DELAYS[attempt];
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

export async function getSearchHtml(partNumber) {
  const params = new URLSearchParams({ SearchText: partNumber });
  return performGet(`Search.aspx?${params.toString()}`);
}

export async function getPhotoHtml(partNumber) {
  const params = new URLSearchParams({ partnumber: partNumber });
  return performGet(`ShowPhoto.aspx?${params.toString()}`);
}
