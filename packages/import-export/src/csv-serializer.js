/**
 * Array Import/Export - RFC 4180 CSV Serializer
 * Zero external dependencies.
 */

/**
 * Serializes an array of objects into RFC 4180 CSV text.
 * @param {Array<Record<string, any>>} rows
 * @param {Array<string>} [columns]
 * @returns {string}
 */
export function serializeCSV(rows, columns = null) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "";
  }

  const cols = columns || Object.keys(rows[0]);
  const lines = [];

  // Header line
  lines.push(cols.map(escapeCsvValue).join(","));

  // Data lines
  for (const row of rows) {
    const lineValues = cols.map((col) => {
      const val = row[col];
      return escapeCsvValue(val);
    });
    lines.push(lineValues.join(","));
  }

  return lines.join("\r\n") + "\r\n";
}

/**
 * Escapes a single CSV value according to RFC 4180
 * @param {any} value
 * @returns {string}
 */
export function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  let str;
  if (typeof value === "object") {
    str = JSON.stringify(value);
  } else {
    str = String(value);
  }

  // If contains delimiter, quote, or newline -> enclose in quotes and double internal quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}
