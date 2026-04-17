import { createContext, useContext, ReactNode } from 'react';
import { VsCodeApi } from './types';

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

const VsCodeContext = createContext<VsCodeApi>(vscode);

export const useVsCode = () => useContext(VsCodeContext);

export function VsCodeProvider({ children }: { children: ReactNode }) {
  return <VsCodeContext.Provider value={vscode}>{children}</VsCodeContext.Provider>;
}
