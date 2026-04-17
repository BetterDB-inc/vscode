import { createRoot } from 'react-dom/client';
import { App } from './App';
import { VsCodeProvider } from './VsCodeContext';
import { ErrorBoundary } from './ErrorBoundary';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <VsCodeProvider>
        <App />
      </VsCodeProvider>
    </ErrorBoundary>
  );
}
