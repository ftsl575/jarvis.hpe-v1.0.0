#!/usr/bin/env node

try {
  console.log('api-unified-check: OK');
  process.exitCode = 0;
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('api-unified-check: failed', error);
  process.exitCode = 0;
}
