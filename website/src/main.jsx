import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/index.css'
import './styles/App.css'
import './utils/i18n.js'

async function initApp() {
  try {
    // Wait for config to load
    await window.configLoaded;
    
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error('Failed to load configuration:', error);
  }
}

initApp();