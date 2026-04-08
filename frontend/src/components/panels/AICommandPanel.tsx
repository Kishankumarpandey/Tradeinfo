// ---------------------------------------------------------------------------
// AI Command Panel — Always thinking, always processing
// System E (AI Presence Layer) + System 1 chain-first layout
// ---------------------------------------------------------------------------
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useGeoTradeState } from '../../state/GeoTradeState';
import { signalActionLabel } from '../../services/signalMapper';
import { SearchBar } from '../ui/SearchBar';
import { ReasoningChainPanel } from '../systems/ReasoningChainPanel';
import { BacktestStat } from '../systems/BacktestStat';
import { useDemoSystem } from '../../systems/DemoSystem';
import { AI_SCAN_LINES, getNextAmbientSignal } from '../../systems/ambientEngine';

function formatConfidence(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
  return `${Math.round(value * 100)}%`;
}

// ── System E: AI State Machine ──────────────────────────────────────────
type AIState = 'scanning' | 'processing' | 'active' | 'post';

export function AICommandPanel() {
  const {
    countries,
    selectedCountryIso2,
    selectedAsset,
    signalsByIso2,
    focusLockIso2,
    lastSignal,
  } = useGeoTradeState();

  const { activeChain, activeScenario } = useDemoSystem();

  const selectedCountry = React.useMemo(
    () => countries.find((c) => c.iso2 === selectedCountryIso2),
    [countries, selectedCountryIso2],
  );

  const focusCountry = React.useMemo(
    () => countries.find((c) => c.iso2 === focusLockIso2),
    [countries, focusLockIso2],
  );

  const signal = selectedCountry ? signalsByIso2.get(selectedCountry.iso2) : undefined;

  const latestSignal = React.useMemo(
    () => [...signalsByIso2.values()]
      .filter((entry) => !focusLockIso2 || entry.iso2 === focusLockIso2)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0],
    [focusLockIso2, signalsByIso2],
  );

  const activeSignal = signal ?? latestSignal ?? lastSignal ?? undefined;

  // ── AI State Management ───────────────────────────────────────────────
  const [aiState, setAiState] = useState<AIState>('scanning');
  const [scanText, setScanText] = useState('');
  const [scanIndex, setScanIndex] = useState(0);
  const [processingSignal, setProcessingSignal] = useState<string | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const typeTimerRef = useRef<number | null>(null);
  const processingTimerRef = useRef<number | null>(null);

  // Determine AI state based on system activity
  useEffect(() => {
    if (activeChain && !activeChain.complete) {
      setAiState('active');
    } else if (activeChain?.complete) {
      // Hold active state briefly, then post
      const timer = setTimeout(() => setAiState('post'), 4000);
      return () => clearTimeout(timer);
    } else if (activeScenario) {
      setAiState('active');
    } else {
      // Check if we just left post state
      if (aiState === 'post') {
        const timer = setTimeout(() => setAiState('scanning'), 4000);
        return () => clearTimeout(timer);
      } else if (aiState !== 'processing') {
        setAiState('scanning');
      }
    }
  }, [activeChain, activeScenario]);

  // ── STATE 1: Scanning — cycle status lines with typewriter ───────────
  useEffect(() => {
    if (aiState !== 'scanning') return;

    let lineIdx = scanIndex;
    let charIdx = 0;
    const line = AI_SCAN_LINES[lineIdx % AI_SCAN_LINES.length];
    setScanText('');

    // Typewriter effect
    typeTimerRef.current = window.setInterval(() => {
      charIdx++;
      setScanText(line.slice(0, charIdx));
      if (charIdx >= line.length) {
        if (typeTimerRef.current) clearInterval(typeTimerRef.current);
        // Hold for 5s, then advance
        scanTimerRef.current = window.setTimeout(() => {
          lineIdx++;
          setScanIndex(lineIdx);
        }, 5000);
      }
    }, 40);

    return () => {
      if (typeTimerRef.current) clearInterval(typeTimerRef.current);
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, [aiState, scanIndex]);

  // ── STATE 2: Processing — ambient signal flash ───────────────────────
  useEffect(() => {
    if (aiState !== 'scanning') return;

    // Randomly trigger processing state every 30-50s
    const scheduleProcessing = () => {
      const delay = 30000 + Math.random() * 20000;
      processingTimerRef.current = window.setTimeout(() => {
        if (aiState !== 'scanning') return;
        const sig = getNextAmbientSignal();
        setProcessingSignal(sig.headline);
        setAiState('processing');

        // Return to scanning after 8s
        setTimeout(() => {
          setProcessingSignal(null);
          setAiState('scanning');
        }, 8000);
      }, delay);
    };

    scheduleProcessing();
    return () => { if (processingTimerRef.current) clearTimeout(processingTimerRef.current); };
  }, [aiState]);

  // Derivations
  const confidenceVal = activeSignal?.confidence || 0;
  const isHighRisk = confidenceVal >= 0.7;
  const isMediumRisk = confidenceVal >= 0.4 && confidenceVal < 0.7;

  // ── AI Status Header ──────────────────────────────────────────────────
  const aiStatusLabel = aiState === 'active'
    ? 'ACTIVE ANALYSIS'
    : aiState === 'processing'
    ? 'PROCESSING LOW SIGNAL'
    : aiState === 'post'
    ? 'ANALYSIS COMPLETE'
    : 'SCANNING';

  const aiStatusColor = aiState === 'active'
    ? 'var(--signal-green, var(--neon-emerald))'
    : aiState === 'processing'
    ? 'var(--signal-amber, var(--neon-amber))'
    : 'var(--text-muted)';

  return (
    <>
      <div style={{ marginBottom: '0.75rem' }}>
        <SearchBar />
      </div>

      {/* AI Status Header — always visible */}
      <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <h2 style={{ color: aiStatusColor }}>
          {aiState !== 'scanning' && <span className="ai-state-dot" style={{ backgroundColor: aiStatusColor }} />}
          {aiStatusLabel}
        </h2>
      </div>

      {/* AI Presence Text — always cycling */}
      <div className="ai-presence-bar">
        {aiState === 'scanning' && (
          <span className="ai-scan-text">
            {scanText}<span className="ai-cursor">▌</span>
          </span>
        )}
        {aiState === 'processing' && processingSignal && (
          <div className="ai-processing-flash">
            <div className="ai-proc-line">Event: {processingSignal}</div>
            <div className="ai-proc-verdict">Severity: LOW — below action threshold. Monitoring.</div>
          </div>
        )}
        {aiState === 'post' && (
          <span className="ai-scan-text" style={{ color: 'var(--text-muted)' }}>
            Analysis complete. Signal archived. Returning to scan mode.
          </span>
        )}
        {aiState === 'active' && (
          <span className="ai-scan-text" style={{ color: aiStatusColor }}>
            Running full reasoning chain on incoming signal...
          </span>
        )}
      </div>

      {/* SYSTEM 1: Reasoning Chain — FIRST visible element when active */}
      <div style={{ marginTop: '0.75rem' }}>
        <ReasoningChainPanel />
      </div>

      {/* Primary Decision + Target — compact row */}
      <div className="ai-stat-row">
        <div className="stat-box" style={{ flex: 1 }}>
          <div className="label">Decision</div>
          <div className={`value ${activeSignal?.action?.includes('buy') ? 'up' : activeSignal?.action?.includes('sell') ? 'down' : ''}`} style={{ fontSize: '1.2rem' }}>
            {signalActionLabel(activeSignal?.action ?? 'HOLD')}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            CONF: {formatConfidence(activeSignal?.confidence)}
          </div>
        </div>
        <div className="stat-box" style={{ flex: 1 }}>
          <div className="label">Target</div>
          <div className="value" style={{ fontSize: '0.95rem', color: 'var(--neon-emerald)' }}>
            {activeSignal?.countryName ?? focusCountry?.name ?? 'Global Macro'}
          </div>
          <div style={{ fontSize: '0.7rem', marginTop: '2px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {activeSignal?.asset ?? selectedAsset ?? 'SCANNING'}
          </div>
        </div>
      </div>

      {/* Context & Risk */}
      <div style={{ marginTop: '0.75rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.82rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Conviction:</span>
            <strong style={{ color: isHighRisk ? 'var(--neon-red)' : isMediumRisk ? 'var(--neon-amber)' : 'var(--neon-cyan)' }}>
              {isHighRisk ? 'HIGH' : isMediumRisk ? 'MODERATE' : 'LOW'}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Trend:</span>
            <strong>{activeSignal?.trend?.toUpperCase() ?? 'NEUTRAL'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Topic:</span>
            <strong>{activeSignal?.topic ? activeSignal.topic.toUpperCase().replace(/_/g, ' ') : 'GENERAL'}</strong>
          </div>
        </div>
      </div>

      {/* SYSTEM 5: Backtest Credibility Stat */}
      <BacktestStat />
    </>
  );
}
