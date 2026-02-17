import { Err, Ok, Result } from "@app/shared/types/result";
import { SheetMeta, SheetData } from "@app/shared/types/sheet";
import { StorageBackend } from "./storageBackend";
import * as migrator from "@app/shared/sheetMigration";
import { LS_KEY_INDEX, LS_KEY_SHEET } from "./constants";

const getIds = (): string[] =>
  JSON.parse(localStorage.getItem(LS_KEY_INDEX) || "[]");
const setIds = (ids: string[]) =>
  localStorage.setItem(LS_KEY_INDEX, JSON.stringify(ids));

const getSheet = (sheetId: string): SheetData | undefined => {
  const sheet = localStorage.getItem(LS_KEY_SHEET(sheetId));
  return sheet ? JSON.parse(sheet) : undefined;
};
const setSheet = (sheetId: string, sheet: SheetData) =>
  localStorage.setItem(LS_KEY_SHEET(sheetId), JSON.stringify(sheet));
const removeSheet = (sheetId: string) => {
  localStorage.removeItem(LS_KEY_SHEET(sheetId));
  const index = getIds();
  index.splice(index.indexOf(sheetId), 1);
  setIds(index);
};

export const localStorageBackend: StorageBackend = {
  backendType: "local",
  id: "localStorage",
  queryParam: "",
  getSheets: async (): Promise<Result<SheetMeta[]>> => {
    const ids = getIds();
    return Ok(ids.map(getSheet).filter((s) => !!s));
  },
  renameSheet: function (id: string, title: string): Promise<Result<void>> {
    const sheet = getSheet(id);
    if (!sheet) {
      return Promise.resolve(Err("Sheet not found"));
    }
    sheet.name = title;
    setSheet(id, sheet);
    return Promise.resolve(Ok());
  },
  deleteSheet: async function (id: string): Promise<Result<void>> {
    try {
      removeSheet(id);
      return Ok();
    } catch (e) {
      return Err(String(e));
    }
  },
  createSheet: function (title: string): Promise<Result<SheetMeta>> {
    const ids = getIds();
    const uuid = crypto.randomUUID();
    const sheet = migrator.createSheet(uuid, title);
    ids.push(sheet.id);
    setIds(ids);
    setSheet(uuid, sheet);
    return Promise.resolve(Ok(sheet));
  },
  getSheetData: function (sheetId: string): Promise<Result<SheetData>> {
    const sheet = getSheet(sheetId);
    if (!sheet) {
      return Promise.resolve(Err("Sheet not found"));
    }
    return Promise.resolve(Ok(sheet));
  },
  updateSheet(sheetId, SheetAction) {
    const sheet = getSheet(sheetId);
    if (!sheet) {
      return Promise.resolve(Err("Sheet not found"));
    }
    const updatedSheet = migrator.reduce(sheet, SheetAction);
    if (!updatedSheet.ok) {
      return Promise.resolve(Err(updatedSheet.error));
    }
    setSheet(sheetId, updatedSheet.value);
    return Promise.resolve(Ok());
  },
  importSheet(sheetData) {
    const ids = getIds();
    ids.push(sheetData.id);
    setIds(ids);
    setSheet(sheetData.id, sheetData);
    return Promise.resolve(Ok());
  },
};
