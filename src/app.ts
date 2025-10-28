import express from 'express';
import aiRouter from './routes/ai';
import partsRouter from './routes/parts';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(aiRouter);
  app.use(partsRouter);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

export default createApp;
