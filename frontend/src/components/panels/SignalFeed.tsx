// ---------------------------------------------------------------------------
// Right Panel: Live Event Feed + Event Timeline — NEVER EMPTY
// Systems A, B, F integrated
// ---------------------------------------------------------------------------
import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useGeoTradeState } from '../../state/GeoTradeState';
import { signalActionLabel } from '../../services/signalMapper';
import { generatePreloadTimeline, getNextAmbientSignal, randomInterval } from '../../systems/ambientEngine';
import type { TimelineEntry } from '../../systems/ambientEngine';
import { useDemoSystem } from '../../systems/DemoSystem';

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return 'n/a';
  const diffMs = Math.max(0, Date.now() - timestamp);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function formatConfidence(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
  return `${Math.round(value * 100)}%`;
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'HIGH': return 'var(--signal-red, var(--neon-red))';
    case 'MEDIUM': return 'var(--signal-amber, var(--neon-amber))';
    default: return 'var(--text-muted)';
  }
}

export function SignalFeed() {
  const { liveFeed, focusLockIso2, selectCountryByIso2, attentionEvent } = useGeoTradeState();
  const { activeScenario, holyMomentActive } = useDemoSystem();

  // ── System B: Pre-loaded timeline entries ──────────────────────────────
  const [timelinePreload] = useState<TimelineEntry[]>(() => generatePreloadTimeline());
  const [ambientTimeline, setAmbientTimeline] = useState<TimelineEntry[]>([]);
  const ambientTimerRef = useRef<number | null>(null);
  const scenarioActiveRef = useRef(false);

  useEffect(() => {
    scenarioActiveRef.current = !!activeScenario || holyMomentActive;
  }, [activeScenario, holyMomentActive]);

  // ── System A: Ambient signal injection into timeline ──────────────────
  useEffect(() => {
    function scheduleNext() {
      const delay = scenarioActiveRef.current ? randomInterval(50000, 70000) : randomInterval(18000, 35000);
      ambientTimerRef.current = window.setTimeout(() => {
        if (!scenarioActiveRef.current) {
          const sig = getNextAmbientSignal();
          setAmbientTimeline(prev => [{
            id: sig.id,
            headline: sig.headline,
            countryName: sig.countryName,
            iso2: sig.iso2,
            severity: sig.severity,
            asset: sig.asset,
            timestamp: Date.now(),
            category: sig.category,
          }, ...prev].slice(0, 20));
        }
        scheduleNext();
      }, delay);
    }

    // Fire one immediately on mount so feed is never empty
    const initialSig = getNextAmbientSignal();
    setAmbientTimeline([{
      id: initialSig.id,
      headline: initialSig.headline,
      countryName: initialSig.countryName,
      iso2: initialSig.iso2,
      severity: initialSig.severity,
      asset: initialSig.asset,
      timestamp: Date.now(),
      category: initialSig.category,
    }]);

    scheduleNext();
    return () => { if (ambientTimerRef.current) clearTimeout(ambientTimerRef.current); };
  }, []);

  // ── Combined signal list (real + ambient seed) ─────────────────────────
  const signalList = useMemo(() => {
    const realSignals = liveFeed
      .filter((item) => item.kind === 'signal')
      .filter((item) => !focusLockIso2 || item.iso2 === focusLockIso2)
      .slice(0, 8);

    // If real signals exist, show them. If not, show latest ambient as a seed entry
    if (realSignals.length > 0) return realSignals;

    // Return ambient items styled as low-severity intel
    return ambientTimeline.slice(0, 3).map(at => ({
      id: at.id,
      kind: 'signal' as const,
      title: at.headline,
      country: at.countryName,
      iso2: at.iso2,
      action: undefined,
      confidence: undefined,
      sentimentScore: undefined,
      sentimentLabel: undefined,
      topic: at.category.toLowerCase(),
      reason: at.headline,
      explanationSummary: at.headline,
      headline: at.headline,
      timestamp: at.timestamp,
    }));
  }, [focusLockIso2, liveFeed, ambientTimeline]);

  // ── Combined timeline (real items + ambient + preload) ─────────────────
  const timelineItems = useMemo(() => {
    const realItems = liveFeed
      .filter((item) => item.kind === 'signal' || item.kind === 'news' || item.kind === 'insight')
      .map(item => ({
        id: item.id,
        headline: item.headline ?? item.explanationSummary ?? item.title,
        countryName: item.country ?? item.iso2 ?? 'Global',
        iso2: item.iso2,
        severity: (item.confidence && item.confidence >= 0.7 ? 'HIGH' : item.confidence && item.confidence >= 0.4 ? 'MEDIUM' : 'LOW') as 'LOW' | 'MEDIUM' | 'HIGH',
        asset: undefined as string | undefined,
        timestamp: item.timestamp,
        category: item.kind.toUpperCase(),
      }));

    // Merge: real items first, then ambient, then preload. Sorted by time, capped at 40.
    const merged = [...realItems, ...ambientTimeline, ...timelinePreload]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 40);

    // Always show at minimum 6 entries
    return merged.length >= 6 ? merged : [...merged, ...timelinePreload.slice(merged.length)].slice(0, 40);
  }, [liveFeed, ambientTimeline, timelinePreload]);

  return (
    <>
      <div className="panel-header">
        <h2>Live Event Feed</h2>
      </div>

      <div className="feed-container" style={{ marginBottom: '1.5rem', flex: 'none', height: '40%' }}>
        {signalList.map((item, idx) => {
          const isBuy = item.action?.includes('buy');
          const isSell = item.action?.includes('sell');
          const isDominant = attentionEvent?.iso2 && item.iso2 === attentionEvent.iso2;
          const isAmbient = item.id.startsWith('ambient-');

          return (
            <div
              key={`sig-${item.id}-${idx}`}
              className={`feed-item ${isBuy ? 'buy' : isSell ? 'sell' : ''} ${isAmbient ? 'ambient' : ''} feed-slide-in`}
              style={isDominant ? { borderColor: 'var(--neon-cyan)', boxShadow: '0 0 12px rgba(0,240,255,0.2)' } : {}}
              onClick={() => {
                if (item.iso2) {
                  selectCountryByIso2(item.iso2, 'feed');
                }
              }}
            >
              <div className="headline">
                <strong>{item.country ?? item.title}</strong>: {item.explanationSummary ?? item.reason ?? item.headline ?? 'Signal detected'}
              </div>
              <div className="meta">
                <span style={{ color: isAmbient ? 'var(--text-muted)' : isBuy ? 'var(--status-buy)' : isSell ? 'var(--status-sell)' : 'var(--text-muted)' }}>
                  {isAmbient ? 'MONITORING' : item.action ? signalActionLabel(item.action) : item.kind}
                </span>
                {item.confidence != null ? (
                  <span>CONF: {formatConfidence(item.confidence)}</span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>LOW</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel-header">
        <h2>Event Timeline</h2>
      </div>

      <div className="feed-container">
        {timelineItems.slice(0, 12).map((item, idx) => (
          <div key={`tl-${item.id}-${idx}`} className="timeline-entry feed-slide-in">
            <div className="timeline-meta">
              <span>{formatRelativeTime(item.timestamp)}</span>
              <span className="timeline-severity" style={{ color: severityColor(item.severity) }}>
                {item.severity}
              </span>
            </div>
            <div className="timeline-content">
              <strong>{item.countryName}</strong> {item.headline}
            </div>
            {item.asset && (
              <div className="timeline-asset">{item.asset}</div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
