export declare function startPglite(
  port?: number,
): Promise<{ url: string; stop: () => Promise<void> }>;
