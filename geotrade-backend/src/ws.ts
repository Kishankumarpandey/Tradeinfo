// ---------------------------------------------------------------------------
// src/ws.ts — WebSocket server with ping/pong, subscriptions, tick + insight broadcast
// ---------------------------------------------------------------------------
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { MarketSimulator, TickPayload } from './sim_engine/simulator';
import { CandlestickAggregator } from './services/candlestick';
import { InsightEngine, Insight } from './services/insights';
import { NewsEngine, NewsItem } from './sim_engine/news';

interface ClientMeta {
  alive: boolean;
  subscriptions: Set<string>; // countryIds
}

/**
 * Start a WebSocket server attached to the given HTTP server.
 * Returns a broadcast helper so other modules can push messages.
 */
export function startWebsocketServer(
  server: http.Server,
  sim: MarketSimulator,
  candles: CandlestickAggregator,
  insights: InsightEngine,
  newsEngine: NewsEngine,
): (data: unknown) => void {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Map<WebSocket, ClientMeta>();

  // ── Ping/pong keep-alive ──────────────────────────────────────────────────
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

  // ── Connection handler ────────────────────────────────────────────────────
  wss.on('connection', (ws: WebSocket) => {
    const meta: ClientMeta = { alive: true, subscriptions: new Set() };
    clients.set(ws, meta);

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

        // Client-initiated ping
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }

        // Candle request
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

    ws.on('close', () => {
      clients.delete(ws);
    });

    // Welcome message
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

  // ── Broadcast insights ────────────────────────────────────────────────────
  insights.on('insight', (insight: Insight) => {
    const msg = JSON.stringify(insight);
    for (const [ws] of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  });

  // ── Broadcast news ────────────────────────────────────────────────────────
  newsEngine.on('news', (item: NewsItem) => {
    const msg = JSON.stringify({ type: 'news', ...item });
    for (const [ws] of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  });

  // Generic broadcast function
  function broadcast(data: unknown): void {
    const raw = JSON.stringify(data);
    for (const [ws] of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(raw);
    }
  }

  return broadcast;
}
