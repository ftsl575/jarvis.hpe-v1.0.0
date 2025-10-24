import express from 'express';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import config from './config.js';
import { log } from './logger.js';
import { runForPart } from './runner.js';

const app = express();

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

function resolveLiveFromQuery(req) {
  const { live } = req.query;
  if (typeof live !== 'string') {
    return config.LIVE_MODE;
  }

  const normalized = live.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

app.get('/api/part', async (req, res) => {
  const { pn } = req.query;

  if (typeof pn !== 'string' || !pn.trim()) {
    res.status(400).json({ error: 'Invalid part number' });
    return;
  }

  const live = resolveLiveFromQuery(req);

  try {
    const row = await runForPart(pn, { live });
    res.json(row);
  } catch (error) {
    if (error?.code === 'LIVE_DISABLED') {
      res.status(503).json({ error: error.message || 'Live mode is disabled' });
      return;
    }

    log.error('Failed to process part', { partNumber: pn, message: error.message });
    res.status(502).json({ error: error.message || 'Failed to parse part information' });
  }
});

const currentFile = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === currentFile;

if (isMain) {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

export default app;
