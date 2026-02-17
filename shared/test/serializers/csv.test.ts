import { describe, expect, it } from "@jest/globals";
import fs from "fs";
import {
  parseCsvToSheetData,
  serializeSheetToCsv,
} from "../../src/serializers/csv.js";
import path from "path";
import { SheetData } from "../../src/types/sheet.js";

const CSV_DIR = path.join(__dirname, "./mocks");

describe("csv", () => {
  it.each(["mock_data_basic_1", "mock_data_empty", "mock_data_partial"])(
    "should parse %s",
    (fileBaseName) => {
      const sheetCsv = fs
        .readFileSync(path.join(CSV_DIR, fileBaseName + ".csv"))
        .toString();
      const sheetJson = fs
        .readFileSync(path.join(CSV_DIR, fileBaseName + ".json"))
        .toString();

      const result = parseCsvToSheetData(sheetCsv, fileBaseName);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(result.error);
      }

      const jsonSheetData = JSON.parse(sheetJson) as SheetData;
      const csvSheetData = result.value;

      expect(csvSheetData.columns).toHaveLength(jsonSheetData.columns.length);
      for (let i = 0; i < csvSheetData.columns.length; i++) {
        expect(csvSheetData.columns[i]).toMatchObject({
          id: expect.any(String),
          title: jsonSheetData.columns[i]!.title,
          type: "text", // TODO: Update once column detection is implemented
        });
      }

      expect(csvSheetData.rows).toHaveLength(jsonSheetData.rows.length);
      for (let i = 0; i < csvSheetData.columns.length; i++) {
        const csvColId = csvSheetData.columns[i]!.id;
        const jsonColId = jsonSheetData.columns[i]!.id;
        for (let j = 0; j < csvSheetData.rows.length; j++) {
          expect(csvSheetData.rows[j]!.values[csvColId]).toBe(
            jsonSheetData.rows[j]!.values[jsonColId],
          );
        }
      }
    },
  );

  it.each(["mock_data_basic_1", "mock_data_empty"])(
    "should serialize %s",
    (fileBaseName) => {
      const sheetCsv = fs
        .readFileSync(path.join(CSV_DIR, fileBaseName + ".csv"))
        .toString();
      const sheetJson = fs
        .readFileSync(path.join(CSV_DIR, fileBaseName + ".json"))
        .toString();
      const jsonSheetData = JSON.parse(sheetJson) as SheetData;

      const result = serializeSheetToCsv(jsonSheetData);
      expect(normalize(result)).toBe(normalize(sheetCsv));
    },
  );
});

function normalize(str: string) {
  return str.replace(/\r\n/g, "\n").trimEnd();
}
