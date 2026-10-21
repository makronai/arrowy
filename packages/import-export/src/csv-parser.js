/**
 * Array Import/Export - RFC 4180 Compliant CSV Parser
 * Zero external dependencies.
 * Correctly handles:
 * - Quoted values with commas
 * - Escaped double quotes ("")
 * - Multiline fields (CRLF/LF inside quotes)
 * - UTF-8 / Unicode characters
 * - Trim and empty fields
 */

import { ValidationError } from "../../core/src/errors.js";

/**
 * Parses a CSV string into an array of row objects (if headers exist) or array of arrays.
 * @param {string} text
 * @param {{ hasHeader?: boolean, delimiter?: string }} [options={}]
 * @returns {{ headers: string[], rows: Array<Record<string, any>> | Array<string[]> }}
 */
export function parseCSV(text, options = {}) {
  const hasHeader = options.hasHeader !== false;
  const delimiter = options.delimiter || ",";

  const matrix = tokenizeCSV(text, delimiter);
  if (matrix.length === 0) {
    return { headers: [], rows: [] };
  }

  if (!hasHeader) {
    return { headers: [], rows: matrix };
  }

  const rawHeaders = matrix[0];
  const headers = rawHeaders.map((h, idx) => {
    const clean = h.trim();
    return clean.length > 0 ? clean : `column_${idx + 1}`;
  });

  const rows = [];
  for (let i = 1; i < matrix.length; i++) {
    const rowValues = matrix[i];
    // Skip empty lines at end
    if (rowValues.length === 1 && rowValues[0] === "" && i === matrix.length - 1) {
      continue;
    }
    const rowObj = {};
    for (let j = 0; j < headers.length; j++) {
      const headerName = headers[j];
      const val = rowValues[j] !== undefined ? rowValues[j] : "";
      rowObj[headerName] = inferType(val);
    }
    rows.push(rowObj);
  }

  return { headers, rows };
}

/**
 * State machine CSV tokenizer
 * @param {string} text
 * @param {string} delimiter
 * @returns {Array<Array<string>>}
 */
export function tokenizeCSV(text, delimiter = ",") {
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        // Lookahead for escaped quote ("")
        if (i + 1 < len && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      }

      if (char === delimiter) {
        currentRow.push(currentField);
        currentField = "";
        i++;
        continue;
      }

      if (char === "\r") {
        if (i + 1 < len && text[i + 1] === "\n") {
          i++;
        }
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      }

      if (char === "\n") {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      }

      currentField += char;
      i++;
    }
  }

  // Push last field & row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Infers numbers or booleans from raw string values where appropriate
 */
function inferType(val) {
  if (val === "" || val === null || val === undefined) return null;
  const lower = val.toLowerCase().trim();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (lower === "null") return null;

  // Number test (integer or float, not starting with 0 followed by digits like phone numbers)
  if (/^-?\d+(\.\d+)?$/.test(val) && (!val.startsWith("0") || val === "0" || val.startsWith("0."))) {
    const num = Number(val);
    if (!Number.isNaN(num)) return num;
  }

  return val;
}
