/**
 * Compatibility resolver (ESM)
 */

export const normalize = (s) => (s ? String(s).trim().toUpperCase() : null);

export function resolveReplaced(part) {
  return part && part.replacedBy ? normalize(part.replacedBy) : null;
}

export function resolveSubstitute(part) {
  return part && part.substitute ? normalize(part.substitute) : null;
}

export function buildCompatibilityMap(parts = []) {
  const map = {};
  for (const p of parts) {
    const id = normalize(p?.partNumber);
    if (!id) continue;
    map[id] = {
      replacedBy: resolveReplaced(p),
      substitute: resolveSubstitute(p),
    };
  }
  return map;
}
