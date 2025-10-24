import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import config from './config.js';

const LEVELS = new Map([
  ['debug', 10],
  ['info', 20],
  ['warn', 30],
  ['error', 40]
]);

const threshold = LEVELS.get(config.LOG_LEVEL) ?? LEVELS.get('info');
const logFilePath = path.resolve(process.cwd(), config.LOG_FILE);
const logDir = path.dirname(logFilePath);
let ensureDirPromise;

function ensureLogDir() {
  if (ensureDirPromise) {
    return ensureDirPromise;
  }

  ensureDirPromise = mkdir(logDir, { recursive: true }).catch(() => {});
  return ensureDirPromise;
}

function writeToFile(message) {
  ensureLogDir().then(() => appendFile(logFilePath, `${message}\n`).catch(() => {}));
}

function formatMessage(level, message, context) {
  const timestamp = new Date().toISOString();
  if (context && typeof context === 'object') {
    return `${timestamp} [${level.toUpperCase()}] ${message} ${JSON.stringify(context)}`.trim();
  }

  return `${timestamp} [${level.toUpperCase()}] ${message}`;
}

function emit(level, message, context) {
  const levelValue = LEVELS.get(level) ?? LEVELS.get('info');
  if (levelValue < threshold) {
    return;
  }

  const output = formatMessage(level, message, context);
  const consoleMethod = console[level] ? level : 'log';
  console[consoleMethod](output);
  writeToFile(output);
}

export const log = {
  debug(message, context) {
    emit('debug', message, context);
  },
  info(message, context) {
    emit('info', message, context);
  },
  warn(message, context) {
    emit('warn', message, context);
  },
  error(message, context) {
    emit('error', message, context);
  }
};

export default log;
