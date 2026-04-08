import React from 'react';
import { useGeoTradeState } from '../../state/GeoTradeState';

interface StatusBarProps {
  connected: boolean;
  status: string;
}

export function StatusBar({ connected, status }: StatusBarProps) {
  const { viewMode, setViewMode, liveFeed, focusLockIso2, focusTarget, clearFocusLock, countries } = useGeoTradeState();
  
  const liveSignalCount = React.useMemo(() => liveFeed.filter(f => f.kind === 'signal').length, [liveFeed]);
  const focusCountry = React.useMemo(() => countries.find(c => c.iso2 === focusLockIso2), [countries, focusLockIso2]);
  
  const modeLabel = viewMode === 'earth' ? 'Earth Scope' : viewMode === 'map2d' ? 'Geo Heatmap' : 'Impact Chart';

  return (
    <header className="status-bar glass-panel">
      <div className="brand">
        <h1>GeoTrade<span>OS</span></h1>
      </div>
      
      <div className="view-controls">
        <button 
          className={viewMode === 'earth' ? 'active' : ''} 
          onClick={() => setViewMode('earth')}
        >
          Globe
        </button>
        <button 
          className={viewMode === 'map2d' ? 'active' : ''} 
          onClick={() => setViewMode('map2d')}
        >
          Map
        </button>
        <button 
          className={viewMode === 'chart' ? 'active' : ''} 
          onClick={() => setViewMode('chart')}
        >
          Chart
        </button>
        
        {focusLockIso2 && (
          <button className="active" onClick={clearFocusLock}>
            X Focus: {focusCountry?.name ?? focusLockIso2}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span>MODE: <strong style={{color: 'var(--text-main)'}}>{modeLabel}</strong></span>
          <span>SIGNALS: <strong style={{color: 'var(--neon-cyan)'}}>{liveSignalCount}</strong></span>
        </div>
        
        <div className={`connection-status ${connected ? 'online' : 'offline'}`}>
          <div className="indicator" />
          {connected ? 'LIVE CONNECTION' : status === 'failed' ? 'CONNECTION LOST' : 'RECONNECTING'}
        </div>
      </div>
    </header>
  );
}
