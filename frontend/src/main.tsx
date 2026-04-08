import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { GeoTradeProvider } from './state/GeoTradeState';
import { DemoSystemProvider } from './systems/DemoSystem';
import './styles.css';
import './systems.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GeoTradeProvider>
      <DemoSystemProvider>
        <App />
      </DemoSystemProvider>
    </GeoTradeProvider>
  </React.StrictMode>,
);
