const express = require('express');
const { runForPart } = require('./runner');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/parts/:partNumber', async (req, res) => {
  try {
    const result = await runForPart(req.params.partNumber);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/parts', async (req, res) => {
  const { parts } = req.body || {};
  if (!Array.isArray(parts) || parts.length === 0) {
    res.status(400).json({ error: 'parts must be a non-empty array' });
    return;
  }

  try {
    const results = [];
    for (const part of parts) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await runForPart(part));
    }
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

if (require.main === module) {
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`HPE PartSurfer server listening on port ${port}`);
  });
}

module.exports = app;
