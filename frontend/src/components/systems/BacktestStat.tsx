// ---------------------------------------------------------------------------
// SYSTEM 5: Backtest Credibility Stat — permanent historical validation
// ---------------------------------------------------------------------------
import React, { useState } from 'react';

const VALIDATED_EVENTS = [
  { label: 'Feb 2022: Russia-Ukraine → Gold BUY', result: '✓', detail: '+9.2% in 5 days', correct: true },
  { label: 'Oct 2022: US Chip Ban → SOX SELL', result: '✓', detail: '-7.4% in 3 days', correct: true },
  { label: 'Mar 2023: SVB Collapse → BTC BUY', result: '✗', detail: 'Called SELL, BTC rose 28%', correct: false },
];

export function BacktestStat() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="backtest-stat"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onClick={() => setExpanded(prev => !prev)}
    >
      <div className="backtest-row">
        <span className="backtest-label">SIGNAL ACCURACY</span>
        <span className="backtest-value">2 of 3 major geopolitical shocks called correctly</span>
      </div>
      <div className="backtest-row">
        <span className="backtest-label">DIRECTIONAL HIT RATE</span>
        <span className="backtest-value">67% <span className="backtest-dim">(validated against 2022–2024 events)</span></span>
      </div>
      <div className="backtest-row">
        <span className="backtest-label">LAST VALIDATED</span>
        <span className="backtest-value">Q4 2024</span>
      </div>

      {expanded && (
        <div className="backtest-tooltip">
          {VALIDATED_EVENTS.map((ev, i) => (
            <div key={i} className={`backtest-event ${ev.correct ? 'correct' : 'incorrect'}`}>
              <span className="backtest-event-result">{ev.result}</span>
              <span className="backtest-event-label">{ev.label}</span>
              <span className="backtest-event-detail">({ev.detail})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
