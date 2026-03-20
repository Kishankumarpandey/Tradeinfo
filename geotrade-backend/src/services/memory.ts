// ---------------------------------------------------------------------------
// src/services/memory.ts — Memory Engine for AI trading signals
// ---------------------------------------------------------------------------

export interface SignalMemory {
  sentiment: number;
  confidence: number;
  action: 'buy' | 'sell' | 'hold' | 'strong_buy' | 'strong_sell';
  timestamp: number;
  topic: string;
}

export interface MemoryTrend {
  trend: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
}

export class MemoryEngine {
  // Store up to N recent signals per country
  private store = new Map<string, SignalMemory[]>();
  private maxHistory: number;

  constructor(maxHistory = 10) {
    this.maxHistory = maxHistory;
  }

  /** Add a new signal to history */
  addSignal(countryId: string, signal: SignalMemory): void {
    let history = this.store.get(countryId);
    if (!history) {
      history = [];
      this.store.set(countryId, history);
    }
    history.push(signal);
    if (history.length > this.maxHistory) {
      history.shift(); // remove oldest
    }
  }

  /** Retrieve memory history */
  getHistory(countryId: string): SignalMemory[] {
    return this.store.get(countryId) ?? [];
  }

  /** Calculate current trend based on history */
  getTrend(countryId: string): MemoryTrend {
    const history = this.store.get(countryId);
    if (!history || history.length < 2) {
      return { trend: 'neutral', strength: 0 };
    }

    // Weight recent signals more heavily
    let weightedSentiment = 0;
    let weightSum = 0;
    let consecutiveSameTokens = 0;
    let lastAction = history[history.length - 1].action;

    for (let i = 0; i < history.length; i++) {
      const w = i + 1; // 1, 2, 3... (linear recency weight)
      weightedSentiment += history[i].sentiment * w;
      weightSum += w;

      if (
        (lastAction.includes('buy') && history[i].action.includes('buy')) ||
        (lastAction.includes('sell') && history[i].action.includes('sell'))
      ) {
        consecutiveSameTokens++;
      }
    }

    const avgSentiment = weightedSentiment / weightSum;

    // Strength derived from average sentiment magnitude + consecutive agreement
    let strength = Math.abs(avgSentiment) * 60 + (consecutiveSameTokens / history.length) * 40;
    strength = Math.min(100, Math.round(strength));

    let trend: 'bullish' | 'bearish' | 'neutral';
    if (avgSentiment > 0.15) {
      trend = 'bullish';
    } else if (avgSentiment < -0.15) {
      trend = 'bearish';
    } else {
      trend = 'neutral';
    }

    return { trend, strength };
  }
}

// Global instance
export const memoryEngine = new MemoryEngine(10);
