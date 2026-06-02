import { hydrateRoot, createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

// If the markup was prerendered (production static build), hydrate it; otherwise mount
// fresh (dev, and runtime-driven apps). Check for a real prerendered ELEMENT — not just
// any node — because the unrendered template leaves an HTML comment placeholder, which
// would fool a plain hasChildNodes() check into attempting hydration.
if (container.firstElementChild) {
  hydrateRoot(container, <App />);
} else {
  createRoot(container).render(<App />);
}
