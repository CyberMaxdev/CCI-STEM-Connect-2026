import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import usersRouter from './src/routes/users.ts';
import dashboardRouter from './src/routes/dashboard.ts';
import programmesRouter from './src/routes/programmes.ts';
import participantsRouter from './src/routes/participants.ts';
import attendanceRouter from './src/routes/attendance.ts';
import assessmentsRouter from './src/routes/assessments.ts';
import performanceRouter from './src/routes/performance.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.set('trust proxy', true);
  app.use(express.json({ limit: '2mb' }));

  // Mount API routes
  app.use('/api', usersRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', programmesRouter);
  app.use('/api', participantsRouter);
  app.use('/api', attendanceRouter);
  app.use('/api', assessmentsRouter);
  app.use('/api', performanceRouter);

  // API 404 handler
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CCI STEM Connect server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
