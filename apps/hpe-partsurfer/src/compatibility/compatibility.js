// ESM
export function classifySource(url) {
  if (!url || typeof url !== "string") return "Another";
  const u = url.toLowerCase();
  if (u.includes("partsurfer.hpe.com/showphoto")) return "Photo HPE PartSurfer";
  if (u.includes("partsurfer.hpe.com")) return "HPE PartSurfer";
  if (u.includes("buy.hpe.com")) return "buy.hpe.com";
  return "Another";
}

export function buildCompatibilityMap(parts) {
  const map = {};
  for (const p of parts || []) {
    const id = String(p.partNumber ?? p.part_number ?? "").trim();
    if (!id) continue;
    const replacedBy =
      (p.replacedBy ?? p.replaced_by ?? p.replaced ?? null) || null;
    const substitute =
      (p.substitute ?? p.alternate ?? p.alternative ?? null) || null;
    map[id] = { replacedBy, substitute };
  }
  return map;
}

export function enrichPartRecord(record = {}) {
  const source = classifySource(record.image_url ?? record.source_page ?? "");
  return { ...record, source_page: source };
}
