import { useMemo, useEffect, useState, useRef } from 'react';
import { useGeoTradeState } from '../../state/GeoTradeState';
import { signalActionLabel, signalColor } from '../../services/signalMapper';

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function moveLabel(action?: string, confidence?: number): string {
  const safeConfidence = Math.max(0, Math.min(1, safeNumber(confidence, 0)));
  const multiplier = action?.includes('strong') ? 2.2 : action?.includes('buy') || action?.includes('sell') ? 1.5 : 0.6;
  const raw = safeConfidence * multiplier * 2.1;
  const signed = action?.includes('sell') ? -raw : action?.includes('buy') ? raw : raw * 0.12;
  return `${signed >= 0 ? '+' : ''}${signed.toFixed(1)}%`;
}

export function AssetChartView({ compact = false }: { compact?: boolean } = {}) {
  const { selectedAsset, selectedCountryIso2, countries, signalsByIso2, liveFeed, attentionEvent, lastSignal } = useGeoTradeState();

  // System C: Live tick counter — forces chart to update every 2s
  const [liveTick, setLiveTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setLiveTick(t => t + 1), 2000);
    return () => clearInterval(timer);
  }, []);

  const latestSignal = useMemo(
    () => [...signalsByIso2.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0],
    [signalsByIso2],
  );

  const anchorSignal = latestSignal ?? lastSignal ?? undefined;

  const activeCountryIso2 = useMemo(() => {
    return anchorSignal?.iso2 ?? selectedCountryIso2;
  }, [anchorSignal?.iso2, selectedCountryIso2]);

  const selectedCountry = useMemo(
    () => countries.find((c) => c.iso2 === activeCountryIso2),
    [activeCountryIso2, countries],
  );

  const signal = (selectedCountry ? signalsByIso2.get(selectedCountry.iso2) : undefined) ?? anchorSignal;
  const history = useMemo(
    () => liveFeed.filter((item) => item.kind === 'signal' && item.iso2 === activeCountryIso2).slice(0, 12).reverse(),
    [activeCountryIso2, liveFeed],
  );

  const marketSeries = useMemo(() => {
    let price = 100;
    const fromHistory = history.map((item, index) => {
      const confidence = safeNumber(item.confidence, 0.25);
      const action = item.action ?? 'hold';
      const direction = action.includes('sell') ? -1 : action.includes('buy') ? 1 : 0.08;
      const volatility = action.includes('strong') ? 2.1 : 1.2;
      const wobble = index % 2 === 0 ? 0.22 : -0.16;
      price = Math.max(60, price + direction * confidence * volatility * 2.2 + wobble);
      return {
        price,
        action,
        confidence,
        title: item.title,
        timestamp: item.timestamp,
      };
    });

    // System C: Always generate synthetic points with micro-movement
    const baseAction = signal?.action ?? 'hold';
    const baseConfidence = safeNumber(signal?.confidence, 0.35);
    const now = signal?.updatedAt ?? Date.now();
    const pointCount = fromHistory.length > 0 ? Math.max(0, 12 - fromHistory.length) : 12;
    const syntheticPoints: Array<{ price: number; action: string; confidence: number; title: string; timestamp: number }> = [];
    
    let syntheticPrice = fromHistory.length > 0 ? fromHistory[fromHistory.length - 1].price : 100;
    
    for (let idx = 0; idx < pointCount; idx++) {
      const direction = baseAction.includes('sell') ? -1 : baseAction.includes('buy') ? 1 : 0.05;
      // Micro-movement: sine wave + seeded noise using liveTick to make it feel alive
      const sineWave = Math.sin((liveTick + idx) * 0.7) * 0.15;
      const noise = Math.sin((liveTick * 13 + idx * 7) * 0.3) * 0.12;
      const drift = direction * baseConfidence * 0.4;
      syntheticPrice = Math.max(72, syntheticPrice + drift + sineWave + noise);
      syntheticPoints.push({
        price: syntheticPrice,
        action: baseAction,
        confidence: baseConfidence,
        title: signal?.sourceHeadline ?? 'Live micro-movement tracking',
        timestamp: now - (pointCount - 1 - idx) * 2000 + liveTick * 100,
      });
    }
    
    return [...fromHistory, ...syntheticPoints].slice(-12);
  }, [history, signal?.action, signal?.confidence, signal?.sourceHeadline, signal?.updatedAt, liveTick]);

  const dimensions = compact ? { width: 520, height: 150 } : { width: 560, height: 190 };
  const priceBounds = useMemo(() => {
    if (marketSeries.length === 0) {
      return { min: 0, max: 0, range: 1 };
    }
    const prices = marketSeries.map((entry) => entry.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return { min, max, range: Math.max(1, max - min) };
  }, [marketSeries]);

  const linePath = useMemo(() => {
    if (marketSeries.length === 0) return '';
    const { width, height } = dimensions;
    const points = marketSeries.map((entry, index) => {
      const x = marketSeries.length === 1 ? width / 2 : (index / (marketSeries.length - 1)) * width;
      const normalized = (entry.price - priceBounds.min) / priceBounds.range;
      const y = height - normalized * (height - 28) - 14;
      return `${x},${y}`;
    });
    return `M ${points.join(' L ')}`;
  }, [dimensions, marketSeries, priceBounds.min, priceBounds.range]);

  const areaPath = useMemo(() => {
    if (marketSeries.length === 0) return '';
    const { width, height } = dimensions;
    const points = marketSeries.map((entry, index) => {
      const x = marketSeries.length === 1 ? width / 2 : (index / (marketSeries.length - 1)) * width;
      const normalized = (entry.price - priceBounds.min) / priceBounds.range;
      const y = height - normalized * (height - 28) - 14;
      return `${x},${y}`;
    });
    return `M 0 ${height} L ${points.join(' L ')} L ${width} ${height} Z`;
  }, [dimensions, marketSeries, priceBounds.min, priceBounds.range]);

  const latestSeriesPoint = marketSeries[marketSeries.length - 1];
  const latestMove = moveLabel(signal?.action, signal?.confidence);
  const latestHeadline = signal?.sourceHeadline ?? history[history.length - 1]?.title ?? 'Holding latest active signal';
  const activeStory = latestSeriesPoint
    ? `NEWS: ${latestHeadline} → SIGNAL: ${signalActionLabel(signal?.action ?? latestSeriesPoint.action)} → MARKET: ${latestMove}`
    : 'Holding latest active signal';

  return (
    <div className={`chart-view ${compact ? 'compact' : ''}`}>
      <div className={`chart-card ${compact ? 'compact' : ''} ${attentionEvent?.iso2 === activeCountryIso2 ? 'chart-card-reactive' : ''}`}>
        <div className="card-header">
          <h2>{selectedAsset || 'Live Market Mirror'}</h2>
          <span className="chart-live-dot">LIVE</span>
          <span className="tiny-chip">{selectedCountry?.region ?? 'Global'}</span>
        </div>
        <p>{selectedCountry?.name ?? 'Unknown country'} market impact trace from live intelligence signals</p>

        <div className="chart-metadata">
          <div className="stat-row">
            <span>Country</span>
            <strong>{selectedCountry?.name ?? '-'}</strong>
          </div>
          <div className="stat-row">
            <span>Signal</span>
            <strong style={{ color: signal ? signalColor(signal.action) : undefined }}>
              {signalActionLabel(signal?.action ?? 'hold')}
            </strong>
          </div>
          <div className="stat-row">
            <span>Confidence</span>
            <strong>{signal ? `${Math.round(safeNumber(signal.confidence, 0) * 100)}%` : 'N/A'}</strong>
          </div>
        </div>

        {!compact && (
          <>
            <div className="stat-row stacked">
              <span>Latest reason</span>
              <strong>{signal?.reason ?? 'No live reason yet'}</strong>
            </div>
            <div className="stat-row stacked">
              <span>Story chain</span>
              <strong>News {'>'} {selectedCountry?.name ?? 'Country'} {'>'} {signalActionLabel(signal?.action ?? 'hold')} {'>'} {selectedAsset || 'Mapped asset'}</strong>
            </div>
          </>
        )}

        <div className="chart-focus-band">
          <span className="chart-focus-label">Market move</span>
          <strong className={`chart-move ${signal?.action ?? 'hold'}`}>{latestMove}</strong>
          <span className="chart-focus-meta">{latestSeriesPoint ? `${latestSeriesPoint.price.toFixed(1)} index` : 'No movement yet'}</span>
        </div>

        <div className="sparkline-card market-card">
            <svg viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} className="sparkline-svg market-svg" role="img" aria-label="Live market trace">
              <defs>
                <linearGradient id="marketGradient" x1="0" x2="1">
                  <stop offset="0%" stopColor="rgba(47, 147, 255, 0.08)" />
                  <stop offset="50%" stopColor="rgba(47, 147, 255, 0.9)" />
                  <stop offset="100%" stopColor="rgba(27, 187, 97, 0.9)" />
                </linearGradient>
                <linearGradient id="marketFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(47, 147, 255, 0.24)" />
                  <stop offset="100%" stopColor="rgba(47, 147, 255, 0.02)" />
                </linearGradient>
              </defs>
              <rect width={dimensions.width} height={dimensions.height} rx="16" fill="rgba(6, 18, 33, 0.72)" />
              <path d={areaPath} className="market-area-path" />
              <path d={linePath} className="sparkline-path market-line-path" />
              {marketSeries.map((point, index) => {
                const x = marketSeries.length === 1 ? dimensions.width / 2 : (index / (marketSeries.length - 1)) * dimensions.width;
                const normalized = (point.price - priceBounds.min) / priceBounds.range;
                const y = dimensions.height - normalized * (dimensions.height - 28) - 14;
                const isLatest = index === marketSeries.length - 1;
                return (
                  <g key={`${point.timestamp}-${index}`} transform={`translate(${x}, ${y})`}>
                    <circle r={isLatest ? 7 : point.confidence >= 0.8 ? 6 : 4} className={`spark-marker ${point.action} ${isLatest ? 'latest' : ''}`} />
                  </g>
                );
              })}
            </svg>
            <div className="sparkline-meta">
              <span>Live price movement</span>
              <strong>
                {selectedCountryFeedLabel(history, selectedCountry?.name)}
              </strong>
              <small>{activeStory}</small>
            </div>
          </div>
      </div>
    </div>
  );
}

function selectedCountryFeedLabel(history: Array<{ country?: string; confidence?: number }>, fallback?: string): string {
  const latest = history[history.length - 1];
  if (!latest) return `${fallback ?? 'Global'} • latest signal held`;
  return `${latest.country ?? fallback ?? '-'} • ${Math.round(safeNumber(latest.confidence, 0) * 100)}%`;
}
