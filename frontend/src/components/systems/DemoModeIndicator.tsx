// ---------------------------------------------------------------------------
// SYSTEM 6: Demo Mode Indicator — subtle corner badge
// ---------------------------------------------------------------------------
import React from 'react';
import { useDemoSystem } from '../../systems/DemoSystem';

const STEP_LABELS = [
  'READY — Globe spinning, monitoring live',
  'OPEN — Present the system overview',
  'TRIGGER — Fire a scenario',
  'CHAIN — Watch the reasoning unfold',
  'INTERACT — Query the system',
  'CLOSE — Return to live mode',
];

export function DemoModeIndicator() {
  const { demoMode, demoStep, showDemoPanel, setShowDemoPanel } = useDemoSystem();

  if (!demoMode) return null;

  return (
    <div
      className="demo-mode-indicator"
      onClick={() => setShowDemoPanel(!showDemoPanel)}
      title="Click to toggle demo panel"
    >
      <span className="demo-dot" />
      <span className="demo-mode-label">DEMO MODE</span>
      <span className="demo-step-label">{STEP_LABELS[demoStep] ?? ''}</span>
    </div>
  );
}
