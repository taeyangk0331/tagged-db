import { Column, ColumnType, FormulaType, Row } from "./types/sheet.js";

export const DEFAULT_FORMULA_TYPE: FormulaType = "expression";

export const FORMULA_TYPE_EXPRESSION: FormulaType = "expression";
export const FORMULA_TYPE_MODULE: FormulaType = "module";

export const MAIN_FUNCTION = "fx";
export const TAB_SPACES = "    ";

export const DEFAULT_FORMULAS = {
  expression: `# Use column_name to access column values\n"Output"`,
  statements: `return "Output"`,
  module: `# Use row["column_name"] to access column values\ndef ${MAIN_FUNCTION}(row):\n${TAB_SPACES}return "Output"`,
} as const;

export const createModule = (
  type: FormulaType,
  formula: string,
  columns: Column[],
  row: Row,
): string => {
  switch (type) {
    case "module":
      return formula;
    case "expression":
      let base = `${createInjects(columns, row)}\ndef ${MAIN_FUNCTION}(row):\n`;

      const formulaLines = formula.split("\n").filter((l) => l.trim() !== "");

      for (let i = 0; i < formulaLines.length; i++) {
        const line = formulaLines[i]!;

        if (
          i === formulaLines.length - 1 &&
          !line.trim().startsWith("return ")
        ) {
          base += `${TAB_SPACES}return ${line}\n`;
        } else {
          base += `${TAB_SPACES}${line}\n`;
        }
      }

      return base;
    default:
      return "";
  }
};

const createInjects = (columns: Column[], row: Row): string => {
  let injects = "";
  for (const column of columns) {
    const varName = sanitizeStarlarkVar(column.title);
    injects += `${varName} = ${serializeRowValue(column.type, row.values[column.id])}\n`;
  }
  return injects;
};

export const serializeRowValue = (
  columnType: ColumnType,
  value: string | undefined,
): string => {
  if (columnType === "number") {
    return Number(value).toString();
  } else if (value !== undefined && value !== null) {
    return `"${value}"`;
  }
  return '""';
};

export const sanitizeStarlarkVar = (columnName: string): string => {
  // Make it pyton compatible
  const RESERVED_PYTHON_KEYWORDS = [
    "and",
    "as",
    "assert",
    "break",
    "class",
    "continue",
    "def",
    "del",
    "elif",
    "else",
    "except",
    "exec",
    "finally",
    "for",
    "from",
    "global",
    "if",
    "import",
    "in",
    "is",
    "lambda",
    "not",
    "or",
    "pass",
    "print",
    "raise",
    "return",
    "try",
    "while",
    "with",
    "yield",
  ];
  if (RESERVED_PYTHON_KEYWORDS.includes(columnName)) {
    columnName = columnName + "_";
  }
  return columnName.replace(" ", "_").replace(/[^a-zA-Z0-9_]/g, "");
};
