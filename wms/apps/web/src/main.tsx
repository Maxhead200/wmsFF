import { installNetworkLoading } from './lib/networkLoading';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './components/layout/space-theme.css'; // FIX: Space overrides load after the shared modern theme.
import './components/layout/la-panthera-loader.css'; // FIX: original diploma loading animation.
import './components/layout/la-panthera-theme.css'; // FIX: scoped graphite theme.
import './components/layout/spirit-theme.css'; // FIX: isolated compact dark theme.

installNetworkLoading(); // FIX: loading indicator follows real data requests.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
