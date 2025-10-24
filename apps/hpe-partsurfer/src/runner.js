import { detectMode, FALLBACK_ELIGIBLE_PATTERN, SEARCH_ONLY_PATTERN } from './mode.js';
import { normalizePartNumber } from './normalize.js';
import { getSearchHtml, getPhotoHtml } from './fetch.js';
import { parseSearch } from './parseSearch.js';
import { parsePhoto } from './parsePhoto.js';

async function fetchPhotoInfo(partNumber) {
  const photoHtml = await getPhotoHtml(partNumber);
  return parsePhoto(photoHtml);
}

export async function runForPart(partNumber) {
  const normalized = normalizePartNumber(partNumber);
  const mode = detectMode(normalized);

  let description = null;
  let imageUrl = null;
  let sourcePage = mode;
  let status = 'not_found';

  if (mode === 'Search') {
    const searchHtml = await getSearchHtml(normalized);
    const searchResult = parseSearch(searchHtml);
    const hasDescription = Boolean(searchResult.description);

    if (hasDescription) {
      description = searchResult.description;
      imageUrl = searchResult.imageUrl ?? null;
      status = searchResult.bomPresent ? 'ok' : 'no_bom';
      sourcePage = 'Search';
    }

    const fallbackAllowed = FALLBACK_ELIGIBLE_PATTERN.test(normalized) && !SEARCH_ONLY_PATTERN.test(normalized);
    const needsFallback = fallbackAllowed && (!hasDescription || searchResult.bomPresent === false);

    if (needsFallback) {
      const photoResult = await fetchPhotoInfo(normalized);
      if (!hasDescription && photoResult.description) {
        description = photoResult.description;
        sourcePage = 'Photo';
        status = 'ok';
      }

      if (photoResult.imageUrl) {
        imageUrl = photoResult.imageUrl;
      }

      if (!hasDescription && !photoResult.description) {
        status = 'not_found';
      }
    } else if (!hasDescription) {
      status = 'not_found';
    }
  } else {
    const photoResult = await fetchPhotoInfo(normalized);

    if (photoResult.description) {
      description = photoResult.description;
      imageUrl = photoResult.imageUrl ?? null;
      status = 'ok';
      sourcePage = 'Photo';
    } else {
      status = 'not_found';
      imageUrl = null;
      sourcePage = 'Photo';
    }
  }

  return {
    part_number: normalized,
    description,
    image_url: imageUrl ?? null,
    source_page: sourcePage,
    status
  };
}

const DEFAULT_THROTTLE_MS = process.env.NODE_ENV === 'test' ? 0 : 1000;

export async function runBatch(parts, { throttleMs = DEFAULT_THROTTLE_MS } = {}) {
  if (!Array.isArray(parts)) {
    throw new TypeError('parts must be an array');
  }

  const results = [];

  for (let index = 0; index < parts.length; index += 1) {
    if (index > 0 && throttleMs > 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, throttleMs));
    }

    // eslint-disable-next-line no-await-in-loop
    const row = await runForPart(parts[index]);
    results.push(row);
  }

  return results;
}
