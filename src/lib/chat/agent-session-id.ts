/**
 * Agent chat scope: one conversation thread per property + date window.
 * Legacy session IDs equal `baseScopeId` only. New threads use `${baseScopeId}--<suffix>`.
 */

export function buildBaseScopeId(
  propertyId: string | undefined,
  from: string,
  to: string
): string {
  if (!propertyId) return `portfolio-${from}-${to}`;
  return `property-${propertyId}-${from}-${to}`;
}

export function generateThreadSessionId(baseScopeId: string): string {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${baseScopeId}--${suffix}`;
}
