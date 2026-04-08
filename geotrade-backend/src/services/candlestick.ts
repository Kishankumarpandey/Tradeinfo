// ---------------------------------------------------------------------------
// src/services/candlestick.ts — OHLCV candle aggregation
// ---------------------------------------------------------------------------
import { EventEmitter } from 'events';
import { TickPayload } from '../services/binance';

export interface Candle {
  ts: number;       // candle open timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleCompleteEvent extends Candle {
  countryId: string;
  interval: string;
}

type IntervalMs = number;

const INTERVAL_MAP: Record<string, IntervalMs> = {
  '1m': 60_000,
  '5m': 300_000,
};

interface PendingCandle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Aggregates raw index ticks into OHLCV candles for each country and interval.
 */
export class CandlestickAggregator extends EventEmitter {
  // countryId -> interval -> { pending, completed }
  private data = new Map<string, Map<string, { pending: PendingCandle | null; completed: Candle[] }>>();

  /** Feed a tick payload from the simulator */
  ingestTick(payload: TickPayload): void {
    const ts = payload.timestamp;

    for (const country of payload.countries) {
      if (!this.data.has(country.id)) {
        this.data.set(country.id, new Map());
      }
      const countryMap = this.data.get(country.id)!;

      for (const [intervalKey, intervalMs] of Object.entries(INTERVAL_MAP)) {
        if (!countryMap.has(intervalKey)) {
          countryMap.set(intervalKey, { pending: null, completed: [] });
        }
        const bucket = countryMap.get(intervalKey)!;

        const candleStart = Math.floor(ts / intervalMs) * intervalMs;

        if (!bucket.pending || bucket.pending.ts !== candleStart) {
          // Complete previous candle if it exists
          if (bucket.pending) {
            const completedCandle: Candle = { ...bucket.pending };
            bucket.completed.push(completedCandle);

            // Keep at most 500 candles per country/interval
            if (bucket.completed.length > 500) {
              bucket.completed.splice(0, bucket.completed.length - 500);
            }

            const event: CandleCompleteEvent = {
              ...completedCandle,
              countryId: country.id,
              interval: intervalKey,
            };
            this.emit('candle_complete', event);
          }

          // Start new candle
          bucket.pending = {
            ts: candleStart,
            open: country.price,
            high: country.price,
            low: country.price,
            close: country.price,
            volume: country.volume,
          };
        } else {
          // Update current candle
          bucket.pending.high = Math.max(bucket.pending.high, country.price);
          bucket.pending.low = Math.min(bucket.pending.low, country.price);
          bucket.pending.close = country.price;
          bucket.pending.volume += country.volume;
        }
      }
    }
  }

  /** Get completed candles for a country/interval optionally since a timestamp */
  getCandles(countryId: string, interval: string = '1m', sinceTs: number = 0): Candle[] {
    const countryMap = this.data.get(countryId);
    if (!countryMap) return [];

    const bucket = countryMap.get(interval);
    if (!bucket) return [];

    const results = bucket.completed.filter((c) => c.ts >= sinceTs);

    // Include current pending candle as a partial
    if (bucket.pending && bucket.pending.ts >= sinceTs) {
      results.push({ ...bucket.pending });
    }

    return results;
  }
}
