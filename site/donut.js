export function buildDonutSegments(segments = []) {
  const visible = segments
    .map((segment, index) => ({ ...segment, index }))
    .filter(segment => Number(segment.value) > 0);
  const total = visible.reduce((sum, segment) => sum + Number(segment.value), 0);
  if (!total) return [];

  let offset = 0;
  return visible.map((segment) => {
    const percentage = (Number(segment.value) / total) * 100;
    const result = { ...segment, total, percentage, offset };
    offset += percentage;
    return result;
  });
}
