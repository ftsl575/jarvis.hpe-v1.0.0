import { Router } from 'express';
import { strictFactsNormalize, strictFactsRequestSchema } from '../ai/unifiedAdapter';

const router = Router();

router.post('/v3/parts/normalize/strict', async (req, res, next) => {
  try {
    const parseResult = strictFactsRequestSchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      res.status(400).json({ error: 'invalid_input', details: parseResult.error.issues });
      return;
    }

    const response = await strictFactsNormalize(parseResult.data);
    res.json({ ...response, mode: 'strict-facts' });
  } catch (error) {
    next(error);
  }
});

export default router;
