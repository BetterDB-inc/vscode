import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { VsCodeProvider } from './VsCodeContext';
import { ErrorBoundary } from './ErrorBoundary';
import { InitialData } from './types';

declare global {
  interface Window {
    initialData: InitialData;
  }
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <VsCodeProvider>
        <App initialData={window.initialData} />
      </VsCodeProvider>
    </ErrorBoundary>
  );
}
