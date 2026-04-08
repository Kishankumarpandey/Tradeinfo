// ---------------------------------------------------------------------------
// SYSTEM 2 + 6: Demo Control Panel — scenario triggers + demo flow
// ---------------------------------------------------------------------------
import React from 'react';
import { useDemoSystem } from '../../systems/DemoSystem';
import { DEMO_SCENARIOS } from '../../systems/demoScenarios';

export function DemoControlPanel() {
  const {
    showDemoPanel,
    setShowDemoPanel,
    demoMode,
    toggleDemoMode,
    demoStep,
    advanceDemoStep,
    fireScenario,
    activeScenario,
  } = useDemoSystem();

  if (!showDemoPanel) return null;

  return (
    <div className="demo-control-panel">
      <div className="demo-panel-header">
        <span>DEMO CONTROL</span>
        <button className="demo-close-btn" onClick={() => setShowDemoPanel(false)}>✕</button>
      </div>

      <div className="demo-panel-body">
        <div className="demo-mode-toggle">
          <button
            className={`demo-mode-btn ${demoMode ? 'active' : ''}`}
            onClick={toggleDemoMode}
          >
            {demoMode ? '● DEMO MODE ACTIVE' : '○ ACTIVATE DEMO MODE'}
          </button>
          {demoMode && (
            <div className="demo-step-display">
              STEP {demoStep} / 5
              <button className="demo-advance-btn" onClick={advanceDemoStep}>
                NEXT →
              </button>
            </div>
          )}
        </div>

        <div className="demo-scenario-grid">
          {DEMO_SCENARIOS.map(scenario => (
            <button
              key={scenario.id}
              className={`demo-scenario-btn ${activeScenario?.id === scenario.id ? 'active' : ''}`}
              onClick={() => fireScenario(scenario.id)}
            >
              <div className="scenario-label">{scenario.label}</div>
              <div className="scenario-origin">{scenario.originCountryName}</div>
              <div className="scenario-conf">{Math.round(scenario.signalConfidence * 100)}%</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
