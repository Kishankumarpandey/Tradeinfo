// ---------------------------------------------------------------------------
// src/server.ts — Express server entry-point (v2)
// ---------------------------------------------------------------------------
import 'dotenv/config';
import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { startWebsocketServer } from './ws';
import { MarketSimulator } from './sim_engine/simulator';
import { MacroEventEngine } from './sim_engine/events';
import { CandlestickAggregator } from './services/candlestick';
import { InsightEngine } from './services/insights';
import { NewsEngine } from './sim_engine/news';
import { runPipelineSafe } from './services/pipeline';
import { BacktestEngine } from './services/backtest';
import { tradeRouter, setLatestTick } from './routes/trade';

const PORT = parseInt(process.env.PORT ?? '4000', 10);

const app = express();
app.use(cors());
app.use(express.json());

// ── Health route ────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── Trade API routes ────────────────────────────────────────────────────────
app.use('/api', tradeRouter);

// ── HTTP + WS server ────────────────────────────────────────────────────────
const server = http.createServer(app);

// Start simulator
const sim = new MarketSimulator({
  numCountries: 12,
  tickIntervalMs: 1000,
  seed: 42,
});

// Candlestick aggregator
const candles = new CandlestickAggregator();

// Macro events engine
const events = new MacroEventEngine(sim, { seed: 42, frequencyMs: 15_000 });

// Insight engine
const insights = new InsightEngine(sim, events);

// News simulation engine
const news = new NewsEngine(sim, { seed: 42, intervalMs: 5_000, fireChance: 0.5 });

// Backtest engine
const backtester = new BacktestEngine(sim);

// Wire tick → candle aggregation & latest-price cache for trade API
sim.on('tick', (payload) => {
  setLatestTick(payload);
  candles.ingestTick(payload);
});

// Start WS server and pass simulator + candle aggregator + insight engine
const broadcast = startWebsocketServer(server, sim, candles, insights, news);

// ── Trade Signal Pipeline ───────────────────────────────────────────────────
// Fetches news, runs NLP, generates decisions, scores, and broadcasts every 10s
setInterval(async () => {
  const result = await runPipelineSafe();
  if (result.signals.length > 0) {
    broadcast({ type: 'trade_signal', data: result.signals });
    
    // Feed signals into backtester
    for (const signal of result.signals) {
      backtester.ingestSignal(signal);
    }
  }
}, 10_000);

sim.start();
events.start();
insights.start();
news.start();
backtester.start();

server.listen(PORT, () => {
  console.log(`🌍 GeoTrade backend listening on http://localhost:${PORT}`);
});

export { app, server, sim };
