import React from 'react';
import { useGeoTradeState } from '../../state/GeoTradeState';
import { signalActionLabel } from '../../services/signalMapper';

export function Ticker() {
  const { liveFeed } = useGeoTradeState();
  
  const tickerItems = React.useMemo(() => {
    return liveFeed
      .filter((item) => item.kind === 'signal' || item.kind === 'news' || item.kind === 'insight')
      .slice(0, 18)
      .map(item => {
        const countryLabel = item.country ?? item.iso2 ?? 'Global';
        let stringContent = '';
        if (item.kind === 'signal') {
          stringContent = `NEWS: ${item.headline ?? item.title} → SIGNAL: ${signalActionLabel(item.action ?? 'hold')}`;
        } else if (item.kind === 'news') {
          stringContent = `NEWS: ${item.title} → COUNTRY: ${countryLabel}`;
        } else {
          stringContent = `AI: ${item.title} → COUNTRY: ${countryLabel}`;
        }
        return {
          id: item.id || Math.random().toString(),
          kind: item.kind,
          content: stringContent
        };
      });
  }, [liveFeed]);

  if (tickerItems.length === 0) {
    return (
      <div className="ticker-track">
        <div className="ticker-item">
          <span className="live-indicator" />
          <span>Monitoring geospatial data streams...</span>
        </div>
      </div>
    );
  }

  // Double array for continuous CSS scroll
  const displayItems = [...tickerItems, ...tickerItems];

  return (
    <div className="ticker-track">
      {displayItems.map((item, index) => (
        <div key={`${item.id}-${index}`} className="ticker-item">
          <span className="live-indicator" />
          <strong>{item.kind.toUpperCase()}</strong>
          <span>{item.content}</span>
        </div>
      ))}
    </div>
  );
}
