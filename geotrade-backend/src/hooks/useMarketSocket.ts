// ---------------------------------------------------------------------------
// src/hooks/useMarketSocket.ts — React hook for WebSocket with reconnect
// ---------------------------------------------------------------------------
import { useEffect, useRef, useCallback, useState } from 'react';

interface UseMarketSocketOptions {
  url?: string;
  onMessage?: (data: any) => void;
  maxRetries?: number;
  baseDelay?: number; // ms
}

interface UseMarketSocketReturn {
  connected: boolean;
  data: any;
  send: (payload: object) => void;
}

/**
 * React hook that connects to the GeoTrade WebSocket server
 * with exponential backoff reconnection and jitter.
 */
export function useMarketSocket(options: UseMarketSocketOptions = {}): UseMarketSocketReturn {
  const {
    url = 'ws://localhost:4000/ws',
    onMessage,
    maxRetries = Infinity,
    baseDelay = 1000,
  } = options;

  const [connected, setConnected] = useState(false);
  const [data, setData] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retriesRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setData(parsed);
          onMessage?.(parsed);
        } catch {
          console.warn('[useMarketSocket] Failed to parse message:', event.data);
        }
      };

      ws.onerror = (err) => {
        console.error('[useMarketSocket] WebSocket error:', err);
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;

        if (unmountedRef.current) return;
        if (retriesRef.current >= maxRetries) return;

        // Exponential backoff with jitter
        const delay = Math.min(
          baseDelay * Math.pow(2, retriesRef.current) + Math.random() * 500,
          30_000,
        );
        retriesRef.current++;

        timerRef.current = setTimeout(connect, delay);
      };
    } catch (err) {
      console.error('[useMarketSocket] Connection failed:', err);
    }
  }, [url, onMessage, maxRetries, baseDelay]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    } else {
      console.warn('[useMarketSocket] Cannot send — not connected');
    }
  }, []);

  return { connected, data, send };
}
