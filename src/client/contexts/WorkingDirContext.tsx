import { createContext, useContext } from 'react';

const WorkingDirContext = createContext<string | undefined>(undefined);

export const WorkingDirProvider = WorkingDirContext.Provider;

export function useWorkingDir(): string | undefined {
  return useContext(WorkingDirContext);
}
