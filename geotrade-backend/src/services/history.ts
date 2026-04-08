// ---------------------------------------------------------------------------
// src/services/history.ts — Performance and signal history storage
// ---------------------------------------------------------------------------
import { TradeSignal } from './pipeline';

/**
 * Service to store and retrieve historical signals for each country.
 * Useful for timeline visualization and performance analysis.
 */
export class SignalHistoryService {
  private historyMap = new Map<string, TradeSignal[]>();
  private readonly MAX_HISTORY = 100;

  /**
   * Add a new signal to history.
   */
  addSignal(signal: TradeSignal): void {
    const countryId = signal.countryId;
    let list = this.historyMap.get(countryId);
    if (!list) {
      list = [];
      this.historyMap.set(countryId, list);
    }

    list.push(signal);

    // Maintain cap
    if (list.length > this.MAX_HISTORY) {
      list.shift();
    }
  }

  /**
   * Get historical timeline for a country.
   */
  getHistory(countryId: string): TradeSignal[] {
    return this.historyMap.get(countryId) ?? [];
  }

  /**
   * Get all history (for admin/monitoring)
   */
  getAllHistory(): Map<string, TradeSignal[]> {
    return this.historyMap;
  }
}

export const signalHistory = new SignalHistoryService();
