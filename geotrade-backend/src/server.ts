import 'dotenv/config';
import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { startWebsocketServer } from './ws';
import { BinanceEngine } from './services/binance';
import { CandlestickAggregator } from './services/candlestick';
import { newsMonitor } from './services/news';
import { processNewsItem } from './services/pipeline';
import { BacktestEngine } from './services/backtest';
import { tradeRouter, setLatestTick } from './routes/trade';

const PORT = parseInt(process.env.BACKEND_PORT ?? process.env.PORT ?? '4000', 10);
console.info('[backend] starting real intelligence engine', { port: PORT, wsPath: '/ws' });

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/api', tradeRouter);

const server = http.createServer(app);

// Startup real backend services
const sim = new BinanceEngine(); // Connects to wss://stream.binance.com
const candles = new CandlestickAggregator();
const backtester = new BacktestEngine(sim);

// Wire tick -> candle and trade routes
sim.on('tick', (payload) => {
  setLatestTick(payload);
  candles.ingestTick(payload);
});

// Create WS Server
const broadcast = startWebsocketServer(server, sim, candles);

// ── Event-Driven Pipeline ───────────────────────────────────────────────────
// Replace setInterval with strictly event-driven behavior off RSS triggers
newsMonitor.on('news_arrival', async (newsItem) => {
  try {
    const signal = await processNewsItem(newsItem);
    if (signal) {
      const broadcastPayload = { type: 'trade_signal', data: [signal] };
      broadcast(broadcastPayload);
      backtester.ingestSignal(signal);
    }
  } catch (err) {
    console.error('[pipeline] uncaught error in reasoning flow', err);
  }
});

// Boot systems
sim.start();
newsMonitor.start(); // Start polling RSS directly
backtester.start();

server.listen(PORT, () => {
  console.log(`🌍 GeoTrade Intelligence Engine running correctly on http://localhost:${PORT}`);
});

export { app, server, sim };
