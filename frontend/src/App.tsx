import React, { useEffect, useState } from 'react';
import { TerminalShell } from './components/layout/TerminalShell';
import { StatusBar } from './components/ui/StatusBar';
import { Ticker } from './components/ui/Ticker';
import { AICommandPanel } from './components/panels/AICommandPanel';
import { SignalFeed } from './components/panels/SignalFeed';
import { GlobeView } from './components/globe/GlobeView';
import { WorldMap2D } from './components/map/WorldMap2D';
import { AssetChartView } from './components/chart/AssetChartView';

// Systems
import { AlertBanner } from './components/systems/AlertBanner';
import { DemoControlPanel } from './components/systems/DemoControlPanel';
import { DemoModeIndicator } from './components/systems/DemoModeIndicator';
import { useDemoSystem } from './systems/DemoSystem';

import { useMarketSocket } from './hooks/useMarketSocket';
import { useGeoTradeState } from './state/GeoTradeState';
import { resolveCountry } from './data/countries';
import type { SignalInput } from './types';

console.info('🚀 [APP] Loading GeoTrade App...');

export default function App() {
  const {
    viewMode,
    applyRawSignals,
    updateCountryIdNameMap,
    countryIdToName,
    ingestNewsItem,
    ingestInsightItem,
  } = useGeoTradeState();

  const { holyMomentActive, showDemoPanel, setShowDemoPanel, demoMode } = useDemoSystem();

  const { connected, status, send } = useMarketSocket({
    onMessage: (msg: any) => {
      if (msg.type === 'trade_signal') {
        const items = Array.isArray(msg.data) ? (msg.data as SignalInput[]) : [];
        const mappableCount = items.filter((signal) => {
          const backendCountryName = signal.countryId
            ? countryIdToName.get(signal.countryId) ?? signal.country
            : signal.country;
          return Boolean(resolveCountry(signal.country) ?? resolveCountry(backendCountryName));
        }).length;
        send({
          type: 'ack_trade_signal',
          count: items.length,
          mappableCount,
          at: Date.now(),
        });
      }
      
      if (msg.type === 'market_tick' && Array.isArray(msg.countries)) {
        updateCountryIdNameMap(
          msg.countries.map((c: any) => ({ id: String(c.id ?? ''), name: String(c.name ?? '') })),
        );
      }

      if (msg.type === 'trade_signal' && Array.isArray(msg.data)) {
        // In demo mode, suppress live signals so they don't interrupt the scripted flow
        if (!demoMode) {
          applyRawSignals(msg.data as SignalInput[]);
          send({ type: 'ack_state_updated', count: msg.data.length, at: Date.now() });
        }
      }

      if (msg.type === 'news') {
        ingestNewsItem(msg as any);
      }

      if (msg.type === 'insight') {
        ingestInsightItem(msg as any);
      }
    },
  });

  return (
    <>
      {/* System 4: Alert Banner — overlays above everything */}
      <AlertBanner />

      {/* System 3: Holy Moment vignette overlay */}
      <div className={`holy-moment-overlay ${holyMomentActive ? 'active' : ''}`} />

      <TerminalShell
        statusHeader={<StatusBar connected={connected} status={status} />}
        leftPanel={<AICommandPanel />}
        rightPanel={<SignalFeed />}
        bottomTicker={
          <>
            <Ticker />
            {viewMode !== 'chart' && (
              <div style={{ padding: '0 1rem', display: 'flex', alignItems: 'center', borderLeft: '1px solid var(--border-glass)' }}>
                 <AssetChartView compact />
              </div>
            )}
          </>
        }
        centerStage={
          <>
            {viewMode === 'earth' && <GlobeView />}
            {viewMode === 'map2d' && <WorldMap2D />}
            {viewMode === 'chart' && <AssetChartView />}
          </>
        }
      />

      {/* System 2+6: Demo Control Panel */}
      <DemoControlPanel />

      {/* System 6: Demo Mode Indicator */}
      <DemoModeIndicator />

      {/* Small corner button to toggle demo panel */}
      <button
        className="demo-trigger-btn"
        onClick={() => setShowDemoPanel(!showDemoPanel)}
        title="Demo Control (Ctrl+Shift+P)"
      >
        ▶
      </button>
    </>
  );
}
