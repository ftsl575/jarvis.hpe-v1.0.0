import express from 'express';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { runForPart } from './runner.js';

const app = express();

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/part', async (req, res) => {
  const { pn } = req.query;

  if (typeof pn !== 'string' || !pn.trim()) {
    res.status(400).json({ error: 'Invalid part number' });
    return;
  }

  try {
    const row = await runForPart(pn);
    res.json(row);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Failed to parse part information' });
  }
});

const currentFile = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === currentFile;

if (isMain) {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${port}`);
  });
}

export default app;
