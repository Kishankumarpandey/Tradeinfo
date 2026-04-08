import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { mapCountryToBinanceSymbol } from './assetMapper';

export interface TickPayload {
  timestamp: number;
  countries: {
    id: string; // ISO-2
    name: string; // Binance Symbol as name for simplicity, or we can look it up
    price: number;
    volume: number;
  }[];
}

export class BinanceEngine extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly endpoint = 'wss://stream.binance.com:9443/ws';
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  // Hardcode the core assets we mapped in assetMapper.ts
  private symbols = ['btcusdt', 'eurusdt', 'ethusdt', 'bnbusdt', 'solusdt'];
  private currentPrices = new Map<string, number>();
  private currentVolumes = new Map<string, number>();

  // Optional: keep track of registered countries so we can map prices back to them.
  // Instead of querying all 240 countries linearly every tick, we just broadcast
  // the few assets to all frontend pairs mapped to it. 
  // Let's statically list the top tracking countries for the frontend.
  private trackedCountries = [
    { id: 'US', name: 'United States' },
    { id: 'CN', name: 'China' },
    { id: 'RU', name: 'Russia' },
    { id: 'DE', name: 'Germany' },
    { id: 'GB', name: 'United Kingdom' },
    { id: 'JP', name: 'Japan' },
    { id: 'IN', name: 'India' },
    { id: 'SA', name: 'Saudi Arabia' },
    { id: 'BR', name: 'Brazil' },
    { id: 'AU', name: 'Australia' },
    { id: 'NL', name: 'Netherlands' },
    { id: 'FR', name: 'France' }
  ];

  constructor() {
    super();
  }

  public start() {
    this.connect();
    
    // Emit aggregate tick every 1000ms
    setInterval(() => {
      this.emitTick();
    }, 1000);
  }

  private connect() {
    if (this.ws) {
      this.ws.terminate();
    }

    const streams = this.symbols.map(s => `${s}@kline_1m`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    
    console.log(`[BinanceEngine] Connecting to ${url}`);
    
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('[BinanceEngine] WebSocket connected successfully.');
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.data && payload.data.k) {
          const kline = payload.data.k;
          const symbol = payload.data.s.toUpperCase();
          const closePrice = parseFloat(kline.c);
          const volume = parseFloat(kline.v);
          
          this.currentPrices.set(symbol, closePrice);
          this.currentVolumes.set(symbol, volume);
        }
      } catch (err) {
        console.error('[BinanceEngine] Parse error:', err);
      }
    });

    this.ws.on('error', (err) => {
      console.error('[BinanceEngine] WebSocket Error:', err.message);
    });

    this.ws.on('close', () => {
      console.warn('[BinanceEngine] WebSocket disconnected! Reconnecting in 5s...');
      this.ws = null;
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    });
  }

  private emitTick() {
    const timestamp = Date.now();
    const countriesResponse = this.trackedCountries.map(c => {
      const symbol = mapCountryToBinanceSymbol(c.id);
      const price = this.currentPrices.get(symbol) ?? 0;
      const volume = this.currentVolumes.get(symbol) ?? 0;
      return {
        id: c.id,
        name: c.name,
        price,
        volume
      };
    }).filter(c => c.price > 0); // Only emit valid mapped prices

    if (countriesResponse.length > 0) {
      const payload: TickPayload = { timestamp, countries: countriesResponse };
      this.emit('tick', payload);
    }
  }
}
