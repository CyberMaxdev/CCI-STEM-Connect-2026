import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import usersRouter from './src/routes/users.ts';
import dashboardRouter from './src/routes/dashboard.ts';
import programmesRouter from './src/routes/programmes.ts';
import participantsRouter from './src/routes/participants.ts';
import attendanceRouter from './src/routes/attendance.ts';
import assessmentsRouter from './src/routes/assessments.ts';
import performanceRouter from './src/routes/performance.ts';
import projectsRouter from './src/routes/projects.ts';
import impactRouter from './src/routes/impact.ts';
import certificatesRouter from './src/routes/certificates.ts';
import reportsRouter from './src/routes/reports.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.set('trust proxy', true);
  app.use(express.json({ limit: '2mb' }));

  // Graceful JSON syntax error handler
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'Invalid JSON request payload.' });
      return;
    }
    next(err);
  });

  // Mount all 11 platform API routers
  app.use('/api', usersRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', programmesRouter);
  app.use('/api', participantsRouter);
  app.use('/api', attendanceRouter);
  app.use('/api', assessmentsRouter);
  app.use('/api', performanceRouter);
  app.use('/api', projectsRouter);
  app.use('/api', impactRouter);
  app.use('/api', certificatesRouter);
  app.use('/api', reportsRouter);

  // API 404 handler
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Global error handler for unexpected backend errors
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled backend error:', err);
    res.status(500).json({ error: 'An unexpected server error occurred. Please try again.' });
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
