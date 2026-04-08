// ---------------------------------------------------------------------------
// src/services/ledger.ts — In-memory trading ledger with leaderboard (v2)
// ---------------------------------------------------------------------------
import { TickPayload } from '../services/binance';

export interface Position {
  countryId: string;
  quantity: number;
  avgCost: number;
}

export interface Portfolio {
  userId: string;
  cash: number;
  positions: Position[];
}

export interface TradeResult {
  success: boolean;
  message: string;
  trade?: {
    userId: string;
    countryId: string;
    action: 'buy' | 'sell';
    amount: number;
    price: number;
    total: number;
    timestamp: number;
  };
  portfolio?: Portfolio;
}

export interface LeaderboardEntry {
  userId: string;
  profit: number;
  rank: number;
}

const INITIAL_CASH = 100_000;

export class Ledger {
  private portfolios = new Map<string, Portfolio>();
  private latestTick: TickPayload | null = null;

  updatePrices(tick: TickPayload): void {
    this.latestTick = tick;
  }

  private getOrCreate(userId: string): Portfolio {
    if (!this.portfolios.has(userId)) {
      this.portfolios.set(userId, { userId, cash: INITIAL_CASH, positions: [] });
    }
    return this.portfolios.get(userId)!;
  }

  getPortfolio(userId: string): Portfolio {
    const p = this.getOrCreate(userId);
    return { ...p, positions: [...p.positions] };
  }

  getProfit(userId: string): number {
    const portfolio = this.getOrCreate(userId);
    let totalValue = portfolio.cash;

    for (const pos of portfolio.positions) {
      const currentPrice = this.getCurrentPrice(pos.countryId);
      totalValue += pos.quantity * currentPrice;
    }

    return totalValue - INITIAL_CASH;
  }

  private getCurrentPrice(countryId: string): number {
    if (this.latestTick) {
      const country = this.latestTick.countries.find((c) => c.id === countryId);
      if (country) return country.price;
    }
    return 0;
  }

  getLeaderboard(): LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = [];

    for (const [userId] of this.portfolios) {
      entries.push({
        userId,
        profit: Math.round(this.getProfit(userId) * 100) / 100,
        rank: 0,
      });
    }

    entries.sort((a, b) => b.profit - a.profit);

    for (let i = 0; i < entries.length; i++) {
      if (i > 0 && entries[i].profit === entries[i - 1].profit) {
        entries[i].rank = entries[i - 1].rank; 
      } else {
        entries[i].rank = i + 1;
      }
    }

    return entries;
  }

  executeTrade(
    userId: string,
    countryId: string,
    action: 'buy' | 'sell',
    amount: number,
    currentPrice: number,
  ): TradeResult {
    if (amount <= 0) {
      return { success: false, message: 'Amount must be positive' };
    }
    if (currentPrice <= 0) {
      return { success: false, message: 'Invalid price' };
    }

    const portfolio = this.getOrCreate(userId);
    const total = amount * currentPrice;

    if (action === 'buy') {
      if (portfolio.cash < total) {
        return {
          success: false,
          message: `Insufficient cash. Need $${total.toFixed(2)}, have $${portfolio.cash.toFixed(2)}`,
        };
      }
      portfolio.cash -= total;

      let pos = portfolio.positions.find((p) => p.countryId === countryId);
      if (pos) {
        const newQty = pos.quantity + amount;
        pos.avgCost = (pos.avgCost * pos.quantity + currentPrice * amount) / newQty;
        pos.quantity = newQty;
      } else {
        pos = { countryId, quantity: amount, avgCost: currentPrice };
        portfolio.positions.push(pos);
      }
    } else {
      const pos = portfolio.positions.find((p) => p.countryId === countryId);
      if (!pos || pos.quantity < amount) {
        return {
          success: false,
          message: `Insufficient holdings. Have ${pos?.quantity ?? 0}, want to sell ${amount}`,
        };
      }
      pos.quantity -= amount;
      portfolio.cash += total;

      if (pos.quantity === 0) {
        portfolio.positions = portfolio.positions.filter((p) => p.countryId !== countryId);
      }
    }

    return {
      success: true,
      message: `${action.toUpperCase()} ${amount} units of ${countryId} @ $${currentPrice.toFixed(2)}`,
      trade: { userId, countryId, action, amount, price: currentPrice, total, timestamp: Date.now() },
      portfolio: this.getPortfolio(userId),
    };
  }
}
