import { Err, Ok, Result } from "./types/result.js";
import type {
  Column,
  ColumnType,
  ColumnValue,
  SheetData,
} from "./types/sheet.js";
import { parseTags, validateType } from "./sheetValidation.js";
import { ColumnEditAction, SheetAction } from "./types/action.js";

export function reduce(
  sheetData: SheetData,
  action: SheetAction,
): Result<SheetData> {
  let newSheet = sheetData;
  switch (action.action) {
    case "update_cell":
      const updateCellRes = updateCell(
        sheetData,
        action.params.rowId,
        action.params.columnId,
        action.params.value,
      );
      // Update tags if necessary
      if (
        sheetData.columns.find((c) => c.id === action.params.columnId)?.type ===
        "tags"
      ) {
        newSheet.tagCache = updateTagCache(newSheet);
      }
      if (!updateCellRes.ok) return updateCellRes;
      newSheet.rows = updateCellRes.value;
      break;
    case "add_row":
      const newRows = addRow(sheetData, action.params.rowId);
      if (!newRows.ok) return newRows;
      newSheet.rows = newRows.value;
      break;
    case "delete_row":
      const rows = sheetData.rows;
      const row = rows.find((row) => row.id === action.params.rowId);
      if (!row) {
        return Err("Row not found. ID: " + action.params.rowId);
      }
      rows.splice(rows.indexOf(row), 1);
      newSheet.rows = rows;
      newSheet.tagCache = updateTagCache(newSheet);
      break;
    case "add_column":
      const newColumn = createColumn(action.params.columnId);
      const addColumnRes = addColumn(sheetData, newColumn);
      if (!addColumnRes.ok) return addColumnRes;
      newSheet.columns = addColumnRes.value;
      break;
    case "delete_column":
      const columns = sheetData.columns;
      const column = columns.find(
        (column) => column.id === action.params.columnId,
      );
      if (!column) {
        return Err("Column not found. ID: " + action.params.columnId);
      }
      columns.splice(columns.indexOf(column), 1);
      newSheet.columns = [...columns];
      break;
    case "update_column_batched":
      for (const columnAction of action.params.actions) {
        const updateColumnRes = updateColumn(
          sheetData,
          action.params.columnId,
          columnAction,
        );
        if (!updateColumnRes.ok) return updateColumnRes;
        newSheet = updateColumnRes.value;
      }
      break;
  }
  newSheet.updated = new Date().toISOString();
  return Ok({ ...newSheet });
}

// ============================================================
export function updateTimestamp(sheetData: SheetData): SheetData {
  return { ...sheetData, updated: new Date().toISOString() };
}

// FS
export function createSheet(id: string, name: string): SheetData {
  return {
    id,
    name,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    columns: [
      {
        id: crypto.randomUUID(),
        title: "Name",
        type: "text",
      },
    ],
    rows: [
      {
        id: crypto.randomUUID(),
        values: {},
      },
    ],
    tagCache: {},
  };
}

export function renameSheet(sheetData: SheetData, name: string): SheetData {
  return { ...sheetData, name };
}

// Helper
function updateTagCache(sheetData: SheetData): SheetData["tagCache"] {
  const tagCache: SheetData["tagCache"] = {};

  for (const column of sheetData.columns) {
    if (column.type !== "tags") {
      continue;
    }

    for (const row of sheetData.rows) {
      tagCache[column.id] = (tagCache[column.id] || []).concat(
        parseTags(row.values[column.id] ?? ""),
      );
    }
  }

  for (const columnId in tagCache) {
    tagCache[columnId] = Array.from(new Set(tagCache[columnId]));
  }

  return tagCache;
}

function updateColumn(
  sheetData: SheetData,
  columnId: string,
  payload: ColumnEditAction,
): Result<SheetData> {
  const columns = sheetData.columns;

  const column = columns.find((column) => column.id === columnId);
  if (!column) {
    return Err("Column not found. ID: " + columnId);
  }

  switch (payload.editType) {
    case "rename":
      column.title = payload.title;
      break;
    case "change_type":
      if (!validateType(payload.toType)) {
        return Err("Invalid type: " + payload.toType);
      }

      column.type = payload.toType;

      // custom conversion
      switch (column.type) {
        case "text":
          break;
        case "number":
          for (const row of sheetData.rows) {
            const toNum = Number(row.values[columnId]);

            row.values[columnId] = Number.isNaN(toNum) ? "" : String(toNum);
          }
          break;
        case "tags":
          for (const row of sheetData.rows) {
            row.values[columnId] = "";
          }
          break;
      }
      break;
    case "enum_update":
      if (column.type !== "enum") {
        return Err("Column is not an enum");
      }

      const { idOrder, idToNames } = payload;
      const updatedOptions = idOrder
        .map((id) => idToNames[id])
        .filter(Boolean) as string[];

      // Refactor rows
      for (const row of sheetData.rows) {
        const value = row.values[columnId];
        if (!value) {
          continue;
        }
        if (value in idToNames) {
          row.values[columnId] = idToNames[value];
        }
      }

      column.options = updatedOptions;
      break;
    case "reorder":
      if (payload.toIndex < 0 || payload.toIndex >= columns.length) {
        return Err("Invalid index: " + payload.toIndex);
      }

      columns.splice(columns.indexOf(column), 1);
      columns.splice(payload.toIndex, 0, column);
      break;
    case "tag_rename":
      if (column.type !== "tags") {
        return Err("Column is not a tags column");
      }

      for (const row of sheetData.rows) {
        const tagString = row.values[columnId] ?? "";
        const tags = parseTags(tagString);
        row.values[columnId] = tags
          .map((tag) => payload.tagMap[tag] ?? tag)
          .join(", ");
      }

      sheetData.tagCache = updateTagCache(sheetData);
      break;
    case "formula":
      if (column.type !== "formula") {
        return Err("Column is not a formula column");
      }
      column.formula = payload.formula;
      column.formulaType = payload.formulaType;
      break;
  }

  return Ok({ ...sheetData, columns });
}

function createColumn(
  columnId: string,
  title: string = "Untitled column",
  type: ColumnType = "text",
): Column {
  return { id: columnId, title, type: type };
}

function addColumn(
  sheetData: SheetData,
  column: Column,
): Result<SheetData["columns"]> {
  return Ok([...sheetData.columns, column]);
}

// Row
function addRow(sheetData: SheetData, id: string): Result<SheetData["rows"]> {
  return Ok([...sheetData.rows, { id, values: {} }]);
}

function deleteRow(
  sheetData: SheetData,
  id: string,
): Result<SheetData["rows"]> {
  return Ok(sheetData.rows.filter((row) => row.id !== id));
}

// Cell
function updateCell(
  sheetData: SheetData,
  rowId: string,
  columnId: string,
  value: ColumnValue,
): Result<SheetData["rows"]> {
  const rows = sheetData.rows;
  const row = rows.find((row) => row.id === rowId);
  if (!row) {
    return Err("Row not found");
  }
  row.values[columnId] = value;
  return Ok(rows);
}
