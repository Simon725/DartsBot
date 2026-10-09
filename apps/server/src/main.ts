import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@darts/shared';
import { registerHandlers } from './socket/handlers.js';
import { sweepStaleGames } from './store/game-store.js';

const PORT = Number(process.env['PORT'] ?? 3000);
const CLIENT_ORIGIN = process.env['CLIENT_ORIGIN'] ?? 'http://localhost:4200';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const httpServer = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);
  registerHandlers(io, socket);
  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected ${socket.id}: ${reason}`);
  });
});

setInterval(() => {
  const deleted = sweepStaleGames({ finishedTtlMs: 10 * 60_000, idleTtlMs: 12 * 60 * 60_000 });
  if (deleted.length > 0) console.log(`[store] swept stale games: ${deleted.join(', ')}`);
}, 30 * 60_000).unref();

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
