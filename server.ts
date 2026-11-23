import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createDatabase } from './src/server/db.ts';
import { createApp } from './src/server/app.ts';

const PORT = Number(process.env.PORT ?? 3000);

async function startServer() {
  const db = createDatabase();
  const app = createApp(db);

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cinema Gate server listening on http://localhost:${PORT}`);
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled async rejection:', reason);
});

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
