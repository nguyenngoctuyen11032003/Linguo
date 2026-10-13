interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/** True when the user asked the browser to save data or the connection is very slow. */
export function useSaveData(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!connection) return false;
  return connection.saveData === true || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
}
