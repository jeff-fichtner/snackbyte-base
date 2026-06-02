import { hydrateRoot, createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

// If the markup was prerendered (static build), hydrate it; otherwise mount fresh
// (client-side rendering for runtime-driven apps).
if (container.hasChildNodes()) {
  hydrateRoot(container, <App />);
} else {
  createRoot(container).render(<App />);
}
