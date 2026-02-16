type ColumnId = string;

// Sheets
export interface SheetMeta {
  id: string;
  name: string;
  created: string;
  updated: string;
}

// Sheet
export interface SheetData extends SheetMeta {
  rows: Row[];
  columns: Column[];
  tagCache: Record<ColumnId, string[] | undefined>;
}

export const COLUMN_TYPES = [
  "text",
  "number",
  "enum",
  "tags",
  "date",
  "formula",
] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

export type ColumnValue = string;

export type Column =
  | TextColumn
  | NumberColumn
  | EnumColumn
  | TagsColumn
  | DateColumn
  | FormulaColumn;

interface BaseColumn {
  id: string;
  title: string;
  type: ColumnType;
}

interface TextColumn extends BaseColumn {
  type: "text";
}

interface NumberColumn extends BaseColumn {
  type: "number";
  // unused
  min?: number;
  max?: number;
  step?: number;
}

export interface EnumColumn extends BaseColumn {
  type: "enum";
  options?: string[];
}

export interface TagsColumn extends BaseColumn {
  type: "tags";
}

interface DateColumn extends BaseColumn {
  type: "date";
}

export type FormulaType = "module" | "expression";
export interface FormulaColumn extends BaseColumn {
  type: "formula";
  formula?: string;
  formulaType?: FormulaType;
}

export interface Row {
  id: string;
  values: Partial<Record<ColumnId, ColumnValue>>;
}
