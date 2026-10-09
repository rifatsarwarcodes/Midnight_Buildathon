// SPDX-License-Identifier: Apache-2.0
import { Buffer } from 'buffer';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Some Midnight.js dependencies expect a global Buffer in the browser.
(globalThis as any).Buffer = (globalThis as any).Buffer ?? Buffer;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
