const express = require('express');
const { evaluatePartNumber } = require('./index');

const app = express();

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/part', (req, res) => {
  const { pn } = req.query;

  try {
    const result = evaluatePartNumber(pn);

    res.json({
      input: result.input,
      part_number: result.partNumber,
      status: result.status
    });
  } catch (error) {
    res.status(400).json({
      error: 'Invalid part number',
      input: pn
    });
  }
});

if (require.main === module) {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;

  app.listen(port, () => {
    /* eslint-disable no-console */
    console.log(`Server listening on port ${port}`);
    /* eslint-enable no-console */
  });
}

module.exports = app;
