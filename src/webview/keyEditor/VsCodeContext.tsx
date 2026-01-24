import React, { createContext, useContext } from 'react';
import { VsCodeApi } from './types';

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

const VsCodeContext = createContext<VsCodeApi>(vscode);

export const useVsCode = () => useContext(VsCodeContext);

export const VsCodeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <VsCodeContext.Provider value={vscode}>{children}</VsCodeContext.Provider>;
};
