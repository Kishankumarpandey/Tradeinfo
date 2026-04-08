import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { BinanceEngine, TickPayload } from './services/binance';
import { CandlestickAggregator } from './services/candlestick';

interface ClientMeta {
  alive: boolean;
  subscriptions: Set<string>; // countryIds
}

export function startWebsocketServer(
  server: http.Server,
  sim: BinanceEngine,
  candles: CandlestickAggregator
): (data: unknown) => void {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Map<WebSocket, ClientMeta>();

  const HEARTBEAT_MS = 30_000;
  const interval = setInterval(() => {
    for (const [ws, meta] of clients) {
      if (!meta.alive) {
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      meta.alive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);

  wss.on('close', () => clearInterval(interval));

  wss.on('connection', (ws: WebSocket) => {
    const meta: ClientMeta = { alive: true, subscriptions: new Set() };
    clients.set(ws, meta);
    console.info('[ws-server] connected', { totalClients: clients.size, ts: new Date().toISOString() });

    ws.on('close', () => {
      clients.delete(ws);
      console.info('[ws-server] disconnected', { remainingClients: clients.size, ts: new Date().toISOString() });
    });

    ws.on('error', (err) => {
      console.error('[⚠️  WS ERROR] client error', { error: err.message });
    });

    ws.on('pong', () => {
      meta.alive = true;
    });

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'subscribe' && typeof msg.countryId === 'string') {
          meta.subscriptions.add(msg.countryId);
          ws.send(JSON.stringify({ type: 'subscribed', countryId: msg.countryId }));
        }

        if (msg.type === 'unsubscribe' && typeof msg.countryId === 'string') {
          meta.subscriptions.delete(msg.countryId);
          ws.send(JSON.stringify({ type: 'unsubscribed', countryId: msg.countryId }));
        }

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }

        if (msg.type === 'get_candles') {
          const result = candles.getCandles(
            msg.countryId,
            msg.interval ?? '1m',
            msg.sinceTs ?? 0,
          );
          ws.send(JSON.stringify({ type: 'candles', countryId: msg.countryId, candles: result }));
        }

      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.send(JSON.stringify({ type: 'welcome', ts: Date.now() }));
  });

  // ── Broadcast market ticks ────────────────────────────────────────────────
  sim.on('tick', (payload: TickPayload) => {
    const msg = JSON.stringify({
      type: 'market_tick',
      ts: payload.timestamp,
      countries: payload.countries,
    });
    for (const [ws] of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  });

  // ── Broadcast candle completions ──────────────────────────────────────────
  candles.on('candle_complete', (candle) => {
    const msg = JSON.stringify({ type: 'candle_complete', ...candle });
    for (const [ws] of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  });

  // Generic broadcast function
  function broadcast(data: unknown): void {
    const raw = JSON.stringify(data);
    for (const [ws] of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(raw);
      }
    }
  }

  return broadcast;
}
