import React from 'react';

interface TerminalShellProps {
  statusHeader: React.ReactNode;
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  centerStage: React.ReactNode;
  bottomTicker: React.ReactNode;
}

export function TerminalShell({
  statusHeader,
  leftPanel,
  rightPanel,
  centerStage,
  bottomTicker,
}: TerminalShellProps) {
  return (
    <div className="terminal-shell">
      <div className="center-stage">
        {centerStage}
      </div>
      
      {statusHeader}
      
      <aside className="left-panel glass-panel">
        {leftPanel}
      </aside>
      
      <aside className="right-panel glass-panel">
        {rightPanel}
      </aside>
      
      <footer className="bottom-dock glass-panel">
        {bottomTicker}
      </footer>
    </div>
  );
}
