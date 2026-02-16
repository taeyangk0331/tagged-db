import { ColumnEditAction } from "./types/action.js";
import { Err, Ok, Result } from "./types/result.js";
import { COLUMN_TYPES, ColumnType } from "./types/sheet.js";

export function sanitizeTitle(title: string): string {
  return title.trim();
}

export function validateType(type: string): type is ColumnType {
  return COLUMN_TYPES.includes(type as ColumnType);
}

export function parseTags(input: string): string[] {
  if (input === "") {
    return [];
  }

  var arr = input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return [...new Set(arr)];
}

export function cleanTagText(text: string): string {
  const tags = parseTags(text);
  return tags.join(", ").trim();
}

function validateEnums(options: string[]): Result<void> {
  // check all unique
  const unique = new Set(options);
  if (unique.size !== options.length) {
    return Err("Options must be unique.");
  }
  if (options.some((o) => o === "")) {
    return Err("Options cannot be empty strings.");
  }
  return Ok();
}

export function validateColumnAction(action: ColumnEditAction): Result<void> {
  switch (action.editType) {
    case "enum_update":
      const options = action.idOrder.map((o) => action.idToNames[o] || "");
      return validateEnums(options);
    case "tag_rename":
      const tags = Object.values(action.tagMap);
      return validateEnums(tags);
  }
  return Ok();
}

const DEFAULT_TEXT = "Option #";
export function addDefaultEnum(options: string[]): string[] {
  return [...options, createDefaultEnum(options)];
}

export function createDefaultEnum(options: string[]): string {
  let i = 1;
  while (options.includes(DEFAULT_TEXT + i)) {
    i += 1;
  }
  return DEFAULT_TEXT + i;
}

// Formula
export function parseRowvalue(
  columnType: ColumnType,
  value: string | undefined,
): string | number | null {
  if (!value) {
    return null;
  }
  if (columnType === "number") {
    return Number(value);
  }
  return value;
}
