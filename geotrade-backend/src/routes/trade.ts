// ---------------------------------------------------------------------------
// src/routes/trade.ts — REST routes: trade, portfolio, leaderboard
// ---------------------------------------------------------------------------
import { Router, Request, Response } from 'express';
import { Ledger } from '../services/ledger';
import { TickPayload } from '../services/binance';

export const tradeRouter = Router();
export const ledger = new Ledger();

// Latest tick cache (updated by server.ts on each tick)
let latestTick: TickPayload | null = null;

export function setLatestTick(tick: TickPayload): void {
  latestTick = tick;
  ledger.updatePrices(tick); // keep ledger in sync for profit calculations
}

// ── POST /api/trade ─────────────────────────────────────────────────────────
tradeRouter.post('/trade', (req: Request, res: Response): void => {
  const { userId, countryId, action, amount } = req.body;

  if (!userId || !countryId || !action || amount == null) {
    res.status(400).json({ error: 'Missing required fields: userId, countryId, action, amount' });
    return;
  }

  if (action !== 'buy' && action !== 'sell') {
    res.status(400).json({ error: 'action must be "buy" or "sell"' });
    return;
  }

  if (typeof amount !== 'number' || amount <= 0) {
    res.status(400).json({ error: 'amount must be a positive number' });
    return;
  }

  if (!latestTick) {
    res.status(503).json({ error: 'Market data not yet available, try again shortly' });
    return;
  }

  const country = latestTick.countries.find((c) => c.id === countryId);
  if (!country) {
    res.status(404).json({ error: `Country "${countryId}" not found` });
    return;
  }

  const result = ledger.executeTrade(userId, countryId, action, amount, country.price);

  if (!result.success) {
    res.status(400).json({ error: result.message });
    return;
  }

  res.json({
    message: result.message,
    trade: result.trade,
    portfolio: result.portfolio,
  });
});

// ── GET /api/portfolio/:userId ──────────────────────────────────────────────
tradeRouter.get('/portfolio/:userId', (req: Request<{userId: string}>, res: Response): void => {
  const portfolio = ledger.getPortfolio(req.params.userId);
  const profit = ledger.getProfit(req.params.userId);
  res.json({ ...portfolio, profit: Math.round(profit * 100) / 100 });
});

// ── GET /api/leaderboard ────────────────────────────────────────────────────
tradeRouter.get('/leaderboard', (_req: Request, res: Response): void => {
  const leaderboard = ledger.getLeaderboard();
  res.json(leaderboard);
});
