import { Router } from 'express';
import { unifiedHealthCheck, unifiedQuery } from '../ai/unifiedAdapter';

const router = Router();

router.post('/v3/ai/unified', async (req, res, next) => {
  try {
    const { prompt, provider, stream } = req.body ?? {};

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }

    const response = await unifiedQuery({ prompt, stream, meta: { provider } });
    res.json({ text: response.text });
  } catch (error) {
    next(error);
  }
});

// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.post('/v2/ai/query', async (req, res, next) => {
  try {
    res.setHeader('Warning', '299 - /v2/ai/query is deprecated; use /v3/ai/unified instead.');
    const { prompt, provider, stream } = req.body ?? {};

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }

    const response = await unifiedQuery({ prompt, stream, meta: { provider } });
    res.json({ text: response.text });
  } catch (error) {
    next(error);
  }
});

router.get('/v3/ai/unified/health', async (_req, res, next) => {
  try {
    const health = await unifiedHealthCheck();
    res.json({ providers: health });
  } catch (error) {
    next(error);
  }
});

export default router;
