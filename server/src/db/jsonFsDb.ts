import fs, { readdir, rm } from "fs/promises";
import path from "path";
import * as migrator from "@app/shared/sheetMigration";
import { Err, Ok, type Result } from "@app/shared/types/result";
import type { SheetAction } from "@app/shared/types/action";
import type { SheetMeta, SheetData } from "@app/shared/types/sheet";
import type { DBInterface } from "../types/db";
import { SheetError } from "../lib/errors";

const DATA_DIR = process.env.DATA_DIR || path.resolve("./data");

async function getSheetFile(fileName: string): Promise<SheetData> {
  const data = await fs.readFile(path.join(DATA_DIR, fileName), "utf-8");
  return JSON.parse(data) as SheetData;
}

async function saveSheetFile(fileName: string, data: SheetData): Promise<void> {
  await fs.writeFile(
    path.join(DATA_DIR, fileName),
    JSON.stringify(data, null, 2),
  );
}

export const jsonFsDb: DBInterface = {
  getSheets: async function (): Promise<SheetMeta[]> {
    const files = await readdir(DATA_DIR);
    const sheets = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => await getSheetFile(f)),
    );
    return sheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
      created: sheet.created,
      updated: sheet.updated,
    }));
  },
  createSheet: async function (title: string): Promise<SheetMeta> {
    const id = crypto.randomUUID();
    const sheet = migrator.createSheet(id, title);
    await saveSheetFile(`${sheet.id}.json`, sheet);
    return sheet;
  },
  renameSheet: async function (id: string, title: string): Promise<void> {
    const sheet = await getSheetFile(`${id}.json`);
    await saveSheetFile(`${id}.json`, migrator.renameSheet(sheet, title));
  },
  deleteSheet: async function (id: string): Promise<void> {
    await rm(path.join(DATA_DIR, `${id}.json`));
  },

  getSheetData: async function (id: string): Promise<SheetData> {
    return await getSheetFile(`${id}.json`);
  },
  updateSheet: async function (
    id: string,
    SheetAction: SheetAction,
  ): Promise<void> {
    const sheet = await getSheetFile(`${id}.json`);
    const res = migrator.reduce(sheet, SheetAction);
    if (!res.ok) {
      throw new SheetError(res.error);
    }
    await saveSheetFile(`${id}.json`, res.value);
  },
};
