import type { SheetMeta, SheetData } from "@app/shared/types/sheet";
import type { SheetAction } from "@app/shared/types/action";

/**
 * Interface for databases.
 * All method may throw a SheetError.
 */
export interface DBInterface {
  // Files
  getSheets(): Promise<SheetMeta[]>;
  createSheet(title: string): Promise<SheetMeta>;
  renameSheet(id: string, title: string): Promise<void>;
  deleteSheet(id: string): Promise<void>;

  // Sheet
  getSheetData(id: string): Promise<SheetData>;
  updateSheet(id: string, SheetAction: SheetAction): Promise<void>;

  // Import
  importSheet(sheetData: SheetData): Promise<void>;
}
