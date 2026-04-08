// ---------------------------------------------------------------------------
// SYSTEM 4: Alert Banner — full-width breaking signal banner
// ---------------------------------------------------------------------------
import React, { useEffect, useState } from 'react';
import { useDemoSystem } from '../../systems/DemoSystem';

export function AlertBanner() {
  const { alertBanner, dismissBanner } = useDemoSystem();
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!alertBanner) {
      setVisible(false);
      setProgress(100);
      return;
    }

    // Animate in
    requestAnimationFrame(() => setVisible(true));

    // Timer bar depletes over 12s
    const duration = 12000;
    const startTime = alertBanner.startedAt;
    let raf: number;

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1 - elapsed / duration);
      setProgress(remaining * 100);
      if (remaining > 0) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [alertBanner]);

  if (!alertBanner) return null;

  const isBuy = alertBanner.direction.includes('BUY');
  const accentColor = isBuy ? '#00FF9C' : alertBanner.direction.includes('SELL') ? '#FF4466' : '#FFB800';

  return (
    <div className={`alert-banner ${visible ? 'visible' : ''}`}>
      <div className="alert-banner-content">
        <div className="alert-left">
          <span className="alert-dot" style={{ backgroundColor: '#FF4466' }} />
          <span className="alert-label">⚡ BREAKING SIGNAL</span>
        </div>
        <div className="alert-center">
          {alertBanner.headline}
        </div>
        <div className="alert-right">
          <span className="alert-asset">{alertBanner.asset}</span>
          <span className="alert-direction" style={{ color: accentColor }}>
            {alertBanner.direction}
          </span>
          <span className="alert-confidence">{Math.round(alertBanner.confidence * 100)}%</span>
          <button className="alert-dismiss" onClick={dismissBanner}>✕</button>
        </div>
      </div>
      <div className="alert-timer-track">
        <div
          className="alert-timer-fill"
          style={{
            width: `${progress}%`,
            backgroundColor: accentColor,
          }}
        />
      </div>
    </div>
  );
}
