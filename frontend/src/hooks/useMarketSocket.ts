import { useCallback, useEffect, useRef, useState } from 'react';
import { MARKET_WS_URL } from '../config/runtime';

interface MessageEnvelope {
  type: string;
  data?: any;
  countries?: any[];
}

export type MarketSocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface UseMarketSocketOptions {
  url?: string;
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  onMessage?: (message: MessageEnvelope) => void;
}

function buildCandidateUrls(baseUrl: string): string[] {
  const candidates = new Set<string>();
  candidates.add(baseUrl);

  try {
    const parsed = new URL(baseUrl);
    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1';
      candidates.add(parsed.toString());
    } else if (parsed.hostname === '127.0.0.1') {
      parsed.hostname = 'localhost';
      candidates.add(parsed.toString());
    }
  } catch {
    // Keep the original URL if parsing fails.
  }

  return [...candidates];
}

export function useMarketSocket({
  url = MARKET_WS_URL,
  maxRetries = 12,
  baseDelay = 1000,
  maxDelay = 20000,
  onMessage,
}: UseMarketSocketOptions = {}) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<MarketSocketStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const disposedRef = useRef(false);
  const connectAttemptRef = useRef(0);
  const onMessageRef = useRef<UseMarketSocketOptions['onMessage']>(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const cleanupSocket = useCallback((reason: string) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const socket = wsRef.current;
    wsRef.current = null;
    if (!socket) return;

    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;

    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, reason);
    }
  }, []);

  const connect = useCallback(() => {
    if (disposedRef.current) {
      return;
    }

    const existing = wsRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }

    connectAttemptRef.current += 1;
    const candidates = buildCandidateUrls(url);
    const candidateUrl = candidates[(connectAttemptRef.current - 1) % candidates.length] ?? url;

    console.info('[ws-client] connecting', {
      url: candidateUrl,
      attempt: connectAttemptRef.current,
      candidates,
    });
    setStatus(retriesRef.current > 0 ? 'reconnecting' : 'connecting');

    const ws = new WebSocket(candidateUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (disposedRef.current || wsRef.current !== ws) return;
      console.info('[ws-client] connected', { url: candidateUrl });
      setConnected(true);
      setStatus('connected');
      retriesRef.current = 0;
    };

    ws.onmessage = (event) => {
      if (disposedRef.current || wsRef.current !== ws) return;
      try {
        const parsed = JSON.parse(event.data) as MessageEnvelope;
        if (parsed.type === 'trade_signal' && Array.isArray(parsed.data)) {
          console.info('[ws-client] message received', { type: parsed.type, count: parsed.data.length });
        }
        onMessageRef.current?.(parsed);
      } catch {
        console.warn('[ws-client] failed to parse payload', event.data);
      }
    };

    ws.onerror = (event) => {
      if (disposedRef.current || wsRef.current !== ws) return;
      console.error('[ws-client] connection error', {
        url: candidateUrl,
        readyState: ws.readyState,
        eventType: event.type,
        attempt: connectAttemptRef.current,
      });
      setConnected(false);
    };

    ws.onclose = (event) => {
      // Ignore close events from stale sockets; only the active socket may drive reconnect logic.
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      if (disposedRef.current) return;

      console.warn('[ws-client] closed', {
        url: candidateUrl,
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });

      setConnected(false);
      if (retriesRef.current >= maxRetries) {
        setStatus('failed');
        console.error('[ws-client] max reconnect attempts reached', { maxRetries });
        return;
      }

      const jitter = Math.floor(Math.random() * 350);
      const delay = Math.min(baseDelay * Math.pow(2, retriesRef.current) + jitter, maxDelay);
      retriesRef.current += 1;
      console.info('[ws-client] scheduling reconnect', { delayMs: delay, attempt: retriesRef.current, maxRetries });
      setStatus('reconnecting');
      timerRef.current = window.setTimeout(connect, delay);
    };
  }, [baseDelay, maxDelay, maxRetries, url]);

  useEffect(() => {
    disposedRef.current = false;
    connect();

    return () => {
      disposedRef.current = true;
      cleanupSocket('component unmount');
    };
  }, [cleanupSocket, connect]);

  const send = useCallback((payload: object) => {
    const socket = wsRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }, []);

  return { connected, status, send };
}
