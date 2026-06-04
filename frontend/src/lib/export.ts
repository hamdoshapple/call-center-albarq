/** Export an array of records to a CSV file and trigger a browser download. */
export function exportToCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns?: { key: keyof T; label: string }[]
) {
  if (rows.length === 0) return;
  const cols =
    columns ?? (Object.keys(rows[0]).map((k) => ({ key: k as keyof T, label: k })) as {
      key: keyof T;
      label: string;
    }[]);

  const escape = (val: unknown) => {
    const s = val === null || val === undefined ? '' : String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = cols.map((c) => escape(c.label)).join(',');
  const body = rows.map((r) => cols.map((c) => escape(r[c.key])).join(',')).join('\n');
  const csv = '\uFEFF' + header + '\n' + body; // BOM for Excel Arabic support

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
