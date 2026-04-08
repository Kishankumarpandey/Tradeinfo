// ---------------------------------------------------------------------------
// SYSTEM 1: Reasoning Chain Renderer — animated field-by-field reveal
// ---------------------------------------------------------------------------
import React, { useEffect, useRef, useState } from 'react';
import { useDemoSystem } from '../../systems/DemoSystem';

const CHAIN_LABELS = ['EVENT', 'IMPACT', 'HISTORICAL', 'ASSET', 'ACTION', 'CONFIDENCE'] as const;

function chainFieldValue(chain: any, idx: number): string {
  switch (idx) {
    case 0: return chain.event;
    case 1: return chain.impact;
    case 2: return chain.historical;
    case 3: return chain.asset;
    case 4: return chain.action;
    case 5: return `${Math.round(chain.confidence * 100)}%`;
    default: return '';
  }
}

function confidenceBarColor(confidence: number): string {
  if (confidence >= 0.75) return '#00FF9C';
  if (confidence >= 0.5) return '#FFB800';
  return '#FF4466';
}

export function ReasoningChainPanel() {
  const { activeChain } = useDemoSystem();
  const [countUp, setCountUp] = useState(0);
  const countRef = useRef<number | null>(null);

  useEffect(() => {
    if (!activeChain) { setCountUp(0); return; }
    if (activeChain.step < 6) { setCountUp(0); return; }

    // Animate confidence count-up
    const target = Math.round(activeChain.chain.confidence * 100);
    let current = 0;
    countRef.current = window.setInterval(() => {
      current += 1;
      if (current >= target) {
        current = target;
        if (countRef.current) window.clearInterval(countRef.current);
      }
      setCountUp(current);
    }, 1200 / target);

    return () => { if (countRef.current) window.clearInterval(countRef.current); };
  }, [activeChain?.step, activeChain?.chain.confidence]);

  if (!activeChain) {
    return (
      <div className="reasoning-chain-idle">
        <div className="chain-header">
          <span className="chain-icon">◎</span>
          <span>REASONING ENGINE</span>
        </div>
        <div className="chain-idle-text">Monitoring 47 geopolitical signals across 190 countries</div>
      </div>
    );
  }

  return (
    <div className="reasoning-chain">
      <div className="chain-header active">
        <span className="chain-icon pulse-glow">◉</span>
        <span>{activeChain.complete ? 'ANALYSIS COMPLETE' : 'ANALYZING EVENT...'}</span>
      </div>

      <div className="chain-fields">
        {CHAIN_LABELS.map((label, idx) => {
          const revealed = activeChain.step > idx;
          const isConfidence = idx === 5;

          return (
            <div
              key={label}
              className={`chain-row ${revealed ? 'revealed' : 'hidden'}`}
              style={{ transitionDelay: `${idx * 50}ms` }}
            >
              <div className="chain-label">{label}</div>
              <div className="chain-value">
                {revealed ? (
                  isConfidence ? (
                    <div className="confidence-display">
                      <div className="confidence-number">{countUp}%</div>
                      <div className="confidence-bar-track">
                        <div
                          className="confidence-bar-fill"
                          style={{
                            width: `${countUp}%`,
                            backgroundColor: confidenceBarColor(activeChain.chain.confidence),
                            transition: 'width 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
                          }}
                        />
                      </div>
                      <div className="confidence-justification">{activeChain.chain.confidenceJustification}</div>
                    </div>
                  ) : (
                    chainFieldValue(activeChain.chain, idx)
                  )
                ) : (
                  <span className="chain-pending">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
