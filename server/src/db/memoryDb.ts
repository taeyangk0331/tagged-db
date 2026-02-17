import * as migration from "@app/shared/sheetMigration";
import type { DBInterface } from "../types/db.js";
import { type SheetData } from "@app/shared/types/sheet";
import { resolve } from "path";
import { writeFile } from "fs/promises";
import { SheetError } from "../lib/errors.js";

export const memoryDb: DBInterface = {
  async createSheet(title: string) {
    if (Object.values(db.sheetData).find((s) => s.name === title)) {
      throw new SheetError("Sheet already exists");
    }

    const uuid = crypto.randomUUID();
    const sheet = migration.createSheet(uuid, title);
    db.sheetData[uuid] = sheet;
    return sheet;
  },
  async renameSheet(sheetId: string, title: string) {
    const sheet = db.sheetData[sheetId];
    if (!sheet) {
      throw new SheetError("Sheet not found");
    }
    sheet.name = title;
    db.sheetData[sheetId] = sheet;
  },
  async deleteSheet(sheetId: string) {
    delete db.sheetData[sheetId];
  },
  async getSheets() {
    return Object.values(db.sheetData).map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
      created: sheet.created,
      updated: sheet.updated,
    }));
  },
  async getSheetData(sheetId: string) {
    if (!db.sheetData[sheetId]) {
      throw new SheetError("Sheet not found: " + sheetId);
    }
    return db.sheetData[sheetId];
  },
  async updateSheet(id, SheetAction) {
    const sheet = db.sheetData[id];
    if (!sheet) {
      throw new SheetError("Sheet not found");
    }
    const res = migration.reduce(sheet, SheetAction);
    if (!res.ok) {
      throw new SheetError(res.error);
    }
    db.sheetData[id] = res.value;
  },
};

const db: {
  sheetData: Record<string, SheetData>;
} = {
  sheetData: {
    "1": {
      id: "1",
      name: "Sheet 1",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      columns: [
        {
          id: "name",
          title: "Name",
          type: "text",
        },
        {
          id: "artist",
          title: "Artist",
          type: "text",
        },
        {
          id: "tonic",
          title: "Tonic",
          type: "text",
        },
        {
          id: "score",
          title: "Score",
          type: "number",
          step: 1,
        },
        {
          id: "mode",
          title: "Mode",
          type: "enum",
          options: ["major", "minor"],
        },
        {
          id: "tags",
          title: "Tags",
          type: "tags",
        },
      ],
      tagCache: {
        tags: ["tag1", "tag2", "tag3"],
      },
      rows: [
        {
          id: "1",
          values: {
            name: "Zeus no Chuusai",
            artist: "Revue Starlight",
            tonic: "B",
            score: "10",
            mode: "major",
            tags: "tag1, tag2",
          },
        },
        {
          id: "2",
          values: {
            name: "closing",
            artist: "White Album",
            tonic: "C#",
            score: "9",
            mode: "minor",
            tags: "tag2, tag3",
          },
        },
      ],
    },
  },
};

// DEBUGGING OUT

const DEBUG_DB_PATH = resolve(process.cwd(), "debug_db.json");

async function dumpDbToFile() {
  try {
    await writeFile(DEBUG_DB_PATH, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write debug DB file:", err);
  }
}

// Dump every 2 seconds
if (process.env.NODE_ENV !== "production") {
  setInterval(() => {
    dumpDbToFile();
  }, 2000);
}
