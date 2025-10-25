/**
 * Compatibility resolver module
 * Handles Replaced / Substitute / Compatibility relations
 */

const normalize = s => (s ? String(s).trim().toUpperCase() : null);

/**
 * Возвращает нормализованный артикул, если указан заменяемый.
 */
function resolveReplaced(part) {
  return part && part.replacedBy ? normalize(part.replacedBy) : null;
}

/**
 * Возвращает нормализованный артикул, если указан аналог.
 */
function resolveSubstitute(part) {
  return part && part.substitute ? normalize(part.substitute) : null;
}

/**
 * Создает карту совместимости для массива деталей.
 * Пример:
 * {
 *   "A123": { replacedBy: "B234", substitute: "C345" }
 * }
 */
function buildCompatibilityMap(parts = []) {
  const map = {};
  for (const p of parts) {
    const id = normalize(p.partNumber);
    if (!id) continue;
    map[id] = {
      replacedBy: resolveReplaced(p),
      substitute: resolveSubstitute(p),
    };
  }
  return map;
}

module.exports = { resolveReplaced, resolveSubstitute, buildCompatibilityMap };
