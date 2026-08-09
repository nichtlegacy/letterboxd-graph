export function availableYears(byYear = {}) {
  return Object.entries(byYear)
    .filter(([year, stats]) => /^\d{4}$/.test(year) && Number(stats?.entries) > 0)
    .map(([year]) => Number(year))
    .sort((a, b) => b - a);
}

export function resolvePeriod(search, byYear = {}) {
  const params = new URLSearchParams(search);
  if (!params.has('year')) return { year: null, invalid: false };

  const value = params.get('year');
  if (!/^\d{4}$/.test(value || '')) return { year: null, invalid: true };

  const year = Number(value);
  return Number(byYear[year]?.entries) > 0
    ? { year, invalid: false }
    : { year: null, invalid: true };
}

export function periodPath(currentUrl, year) {
  const url = new URL(currentUrl);
  if (Number.isInteger(year)) url.searchParams.set('year', String(year));
  else url.searchParams.delete('year');
  return `${url.pathname}${url.search}${url.hash}`;
}
