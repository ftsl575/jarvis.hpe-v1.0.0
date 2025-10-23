const { fetchSearch, fetchPhoto } = require('./fetch');
const parseSearch = require('./parseSearch');
const parsePhoto = require('./parsePhoto');
const { determineMode, SEARCH_MODE } = require('./mode');

async function executeMode(mode, partNumber) {
  try {
    const html =
      mode === SEARCH_MODE
        ? await fetchSearch(partNumber)
        : await fetchPhoto(partNumber);
    const parsed = mode === SEARCH_MODE ? parseSearch(html) : parsePhoto(html);
    return {
      part_number: partNumber,
      description: parsed.description || '',
      image_url: parsed.imageUrl || '',
      source_page: parsed.sourcePage,
      status: parsed.status
    };
  } catch (error) {
    return {
      part_number: partNumber,
      description: '',
      image_url: '',
      source_page: mode,
      status: 'not_found'
    };
  }
}

async function runForPart(partNumber) {
  const { normalizedPartNumber, modes, fallbackStatuses } =
    determineMode(partNumber);
  const attempts = Array.from(modes);

  if (attempts.length === 0) {
    return {
      part_number: normalizedPartNumber,
      description: '',
      image_url: '',
      source_page: SEARCH_MODE,
      status: 'not_found'
    };
  }

  let lastResult = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const mode = attempts[index];
    const result = await executeMode(mode, normalizedPartNumber);
    lastResult = result;

    const hasNext = index < attempts.length - 1;
    if (hasNext && fallbackStatuses.has(result.status)) {
      continue;
    }

    return result;
  }

  return (
    lastResult || {
      part_number: normalizedPartNumber,
      description: '',
      image_url: '',
      source_page: attempts[0],
      status: 'not_found'
    }
  );
}

module.exports = {
  runForPart,
  executeMode
};
