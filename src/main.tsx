import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';

// Self-hosted Archivo, latin subset only: the iPad must boot with no network.
import '@fontsource/archivo/latin-300.css';
import '@fontsource/archivo/latin-400.css';
import '@fontsource/archivo/latin-500.css';
import '@fontsource/archivo/latin-600.css';

import './styles/tokens.css';
import './styles/base.css';
import './styles/screens.css';

import { App, applyUpdate, needsRefresh } from './app';

const updateSW = registerSW({
  onNeedRefresh() {
    // Never reload under the barista's hands mid-event: ask first.
    needsRefresh.value = true;
  },
});

applyUpdate.value = () => {
  needsRefresh.value = false;
  void updateSW(true);
};

const root = document.getElementById('app');
if (root) render(<App />, root);
