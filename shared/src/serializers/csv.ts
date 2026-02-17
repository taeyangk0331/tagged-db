import { validateType } from "../sheetValidation.js";
import { Err, Ok, type Result } from "../types/result.js";
import type { SheetData } from "../types/sheet.js";

const CSV_SEPARATOR = ",";

export function serializeSheetToCsv(sheetData: SheetData): string {
  const rows: string[][] = [];

  rows.push(sheetData.columns.map((column) => column.title));

  for (const row of sheetData.rows) {
    rows.push(
      sheetData.columns.map((column) => {
        return row.values[column.id] ?? "";
      }),
    );
  }

  return rows
    .map((row) => row.map(escapeCsvCell).join(CSV_SEPARATOR))
    .join("\n");
}

export function parseCsvToSheetData(
  csvText: string,
  fileBaseName: string,
): Result<SheetData> {
  const parsedRowsRes = parseCsvRows(csvText.replace(/^\uFEFF/, ""));
  if (!parsedRowsRes.ok) {
    return parsedRowsRes;
  }

  const parsedRows = parsedRowsRes.value;
  if (parsedRows.length === 0) {
    return Err("CSV is empty.");
  }

  const headerRow = parsedRows[0];
  if (!headerRow || headerRow.length === 0) {
    return Err("CSV has no header row.");
  }

  const columnTitles = headerRow.map((title, index) => title.trim());

  const rawDataRows = parsedRows.slice(1);

  const columns = columnTitles.map((title) => ({
    id: crypto.randomUUID(),
    title,
    type: "text" as const,
  }));

  const rows = rawDataRows.map((csvRow) => {
    const values: Record<string, string> = {};

    for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
      const column = columns[colIndex];
      if (!column) {
        continue;
      }

      const rawValue = csvRow[colIndex] ?? "";
      const value = rawValue;

      if (value !== "") {
        values[column.id] = value;
      }
    }

    return {
      id: crypto.randomUUID(),
      values,
    };
  });

  const now = new Date().toISOString();
  const sheetData: SheetData = {
    id: crypto.randomUUID(),
    name: normalizeSheetName(fileBaseName),
    created: now,
    updated: now,
    columns,
    rows,
    tagCache: {},
  };

  return Ok(sheetData);
}

function normalizeSheetName(fileBaseName: string): string {
  const normalized = fileBaseName.trim();
  return normalized === "" ? "Imported Sheet" : normalized;
}

function hasRecognizedTypeRow(
  row: string[] | undefined,
  columnCount: number,
): boolean {
  if (!row || row.length < columnCount) {
    return false;
  }

  return row.slice(0, columnCount).every((cell) => {
    const normalized = cell.trim().toLowerCase();
    return validateType(normalized);
  });
}

function escapeCsvCell(value: string): string {
  if (value === "") {
    return "";
  }

  const needsQuotes = /[",\r\n]/.test(value);
  if (!needsQuotes) {
    return value;
  }

  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function parseCsvRows(csvText: string): Result<string[][]> {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];

    if (inQuotes) {
      if (char === '"') {
        if (csvText[index + 1] === '"') {
          currentCell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === CSV_SEPARATOR) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    if (char === "\r") {
      if (csvText[index + 1] === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (inQuotes) {
    return Err("CSV parse error: unmatched quote.");
  }

  if (currentCell !== "" || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return Ok(rows);
}
