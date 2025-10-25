import { detectMode } from './mode.js';
import { runForPart, runBatch } from './runner.js';
import { parseSearch } from './parseSearch.js';
import { parsePhoto } from './parsePhoto.js';
import { normalizePartNumber } from './normalize.js';
import fetchBuyHpe from './fetchBuyHpe.js';
import { parseBuyHpe } from './parseBuyHpe.js';
import { providerBuyHpe } from './providerBuyHpe.js';
import exportCsvBuyHpe from './exportCsvBuyHpe.js';

const VALID_PATTERN = /^[A-Za-z0-9]{3,6}(?:-[A-Za-z0-9]{2,6})?$/;

export {
  detectMode,
  runForPart,
  runBatch,
  parseSearch,
  parsePhoto,
  normalizePartNumber,
  fetchBuyHpe,
  parseBuyHpe,
  providerBuyHpe,
  exportCsvBuyHpe,
  VALID_PATTERN
};
