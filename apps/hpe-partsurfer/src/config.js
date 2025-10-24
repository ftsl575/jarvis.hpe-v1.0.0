import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(currentDir, '..', '.env');

dotenv.config({ path: envPath });

function parseNumber(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || Number.isNaN(numberValue) || numberValue < 0) {
    return defaultValue;
  }

  return numberValue;
}

function parseInteger(value, defaultValue) {
  const numberValue = parseNumber(value, defaultValue);
  if (!Number.isFinite(numberValue)) {
    return defaultValue;
  }

  const integer = Math.floor(numberValue);
  return integer >= 0 ? integer : defaultValue;
}

const VALID_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

function parseLogLevel(value, defaultValue) {
  if (typeof value !== 'string') {
    return defaultValue;
  }

  const normalized = value.toLowerCase();
  return VALID_LOG_LEVELS.has(normalized) ? normalized : defaultValue;
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const config = Object.freeze({
  LIVE_MODE: process.env.LIVE_MODE === 'true',
  TIMEOUT_MS: parseInteger(process.env.TIMEOUT_MS, 10_000),
  RETRIES: parseInteger(process.env.RETRIES, 2),
  THROTTLE_RPS: parseNumber(process.env.THROTTLE_RPS, 1),
  USER_AGENT: normalizeString(process.env.USER_AGENT) ?? 'Mozilla/5.0 (compatible; HPEPartSurferBot/1.0)',
  HPE_PROXY_URL: normalizeString(process.env.HPE_PROXY_URL),
  LOG_LEVEL: parseLogLevel(process.env.LOG_LEVEL, 'info'),
  LOG_FILE: normalizeString(process.env.LOG_FILE) ?? 'logs/app.log'
});

export default config;
export { config };
