// ---------------------------------------------------------------------------
// src/services/backtest.ts — Backtesting engine for AI signals
// ---------------------------------------------------------------------------
import { BinanceEngine, TickPayload } from '../services/binance';
import { TradeSignal } from './pipeline';

export interface BacktestTrade {
  countryId: string;
  action: 'buy' | 'sell' | 'strong_buy' | 'strong_sell';
  entryPrice: number;
  exitPrice?: number;
  entryTick: number;
  exitTick?: number;
  profitPct?: number;
  reason: string;
}

export interface BacktestResult {
  accuracy: number;     // 0-1 percentage of winning trades
  profit: number;       // total % profit
  trades: BacktestTrade[];
}

export class BacktestEngine {
  private sim: BinanceEngine;
  private openTrades = new Map<string, BacktestTrade>(); // countryId → active trade
  private closedTrades: BacktestTrade[] = [];
  private currentTick = 0;
  private latestPrices = new Map<string, number>();

  constructor(sim: BinanceEngine) {
    this.sim = sim;
  }

  start(): void {
    this.sim.on('tick', (payload: TickPayload) => this.onTick(payload));
  }

  private onTick(payload: TickPayload): void {
    this.currentTick++;
    for (const c of payload.countries) {
      this.latestPrices.set(c.id, c.price);
    }

    // Auto-close trades after 30 ticks (simulated holding period)
    const toClose: string[] = [];
    for (const [countryId, trade] of this.openTrades.entries()) {
      if (this.currentTick - trade.entryTick >= 30) {
        toClose.push(countryId);
      }
    }

    for (const countryId of toClose) {
      this.closeTrade(countryId, 'Auto-close at holding limit');
    }
  }

  /**
   * Ingest a pipeline signal. If actionable, opens a trade or reverses a position.
   */
  ingestSignal(signal: TradeSignal): void {
    if (signal.decision === 'hold') return;

    const currentPrice = this.latestPrices.get(signal.countryId);
    if (typeof currentPrice !== 'number') {
      console.warn('[backtest] skip signal: missing latest price for countryId', {
        countryId: signal.countryId,
        country: signal.country,
        decision: signal.decision,
      });
      return;
    }

    const existing = this.openTrades.get(signal.countryId);

    if (existing) {
      // Reversal logic
      const isLong = existing.action.includes('buy');
      const newIsLong = signal.decision.includes('buy');

      if ((isLong && !newIsLong) || (!isLong && newIsLong)) {
        this.closeTrade(signal.countryId, `Reversed by new signal: ${signal.decision}`);
        this.openTrade(signal, currentPrice);
      }
    } else {
      this.openTrade(signal, currentPrice);
    }
  }

  private openTrade(signal: TradeSignal, price: number): void {
    this.openTrades.set(signal.countryId, {
      countryId: signal.countryId,
      action: signal.decision as 'buy' | 'sell' | 'strong_buy' | 'strong_sell',
      entryPrice: price,
      entryTick: this.currentTick,
      reason: signal.cause,
    });
  }

  private closeTrade(countryId: string, _reason: string): void {
    const trade = this.openTrades.get(countryId);
    if (!trade) return;

    const exitPrice = this.latestPrices.get(countryId) ?? trade.entryPrice;
    const isLong = trade.action.includes('buy');

    // Calculate profit %
    const rawChange = (exitPrice - trade.entryPrice) / trade.entryPrice;
    const profitPct = isLong ? rawChange * 100 : -rawChange * 100;

    trade.exitPrice = exitPrice;
    trade.exitTick = this.currentTick;
    trade.profitPct = Math.round(profitPct * 100) / 100;

    this.closedTrades.push(trade);
    this.openTrades.delete(countryId);
  }

  /** Retrieve current performance metrics */
  getResults(): BacktestResult {
    const trades = [...this.closedTrades];

    if (trades.length === 0) {
      return { accuracy: 0, profit: 0, trades: [] };
    }

    let winning = 0;
    let totalProfit = 0;

    for (const t of trades) {
      if ((t.profitPct ?? 0) > 0) winning++;
      totalProfit += (t.profitPct ?? 0);
    }

    return {
      accuracy: Math.round((winning / trades.length) * 100) / 100,
      profit: Math.round(totalProfit * 100) / 100,
      trades,
    };
  }
}
