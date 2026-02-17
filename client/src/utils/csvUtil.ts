import { Err, type Result } from "@app/shared/types/result";
import type { SheetData, SheetMeta } from "@app/shared/types/sheet";
import {
  parseCsvToSheetData,
  serializeSheetToCsv,
} from "@app/shared/serializers/csv";

export const CSV_IMPORT_CANCELLED_ERROR = "No file selected.";

const getFileBaseName = (fileName: string) =>
  fileName.replace(/\.[^/.]+$/, "").trim();

const sanitizeCsvFileName = (sheetName: string) => {
  const trimmed = sheetName.trim();
  const safe = trimmed.replace(/[\\/:*?"<>|]/g, "_");
  return safe === "" ? "sheet" : safe;
};

const getUniqueSheetName = (baseName: string, existingNames: string[]) => {
  const cleanedBase = baseName.trim() || "Imported Sheet";
  const existingNameSet = new Set(existingNames);

  if (!existingNameSet.has(cleanedBase)) {
    return cleanedBase;
  }

  let suffix = 2;
  while (existingNameSet.has(`${cleanedBase} (${suffix})`)) {
    suffix += 1;
  }
  return `${cleanedBase} (${suffix})`;
};

export async function importCsv(
  existingSheets: SheetMeta[],
): Promise<Result<SheetData>> {
  const file = await pickCsvFile();
  if (!file) {
    return Err(CSV_IMPORT_CANCELLED_ERROR);
  }

  const csvText = await file.text();
  return parseCsvToSheetData(
    csvText,
    getUniqueSheetName(
      getFileBaseName(file.name),
      existingSheets.map((s) => s.name),
    ),
  );
}

export function exportCsv(sheetData: SheetData): void {
  const csvContent = serializeSheetToCsv(sheetData);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const downloadUrl = URL.createObjectURL(blob);

  const downloadAnchor = document.createElement("a");
  downloadAnchor.href = downloadUrl;
  downloadAnchor.download = `${sanitizeCsvFileName(sheetData.name)}.csv`;
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  document.body.removeChild(downloadAnchor);

  URL.revokeObjectURL(downloadUrl);
}

async function pickCsvFile(): Promise<File | null> {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.style.display = "none";
    document.body.appendChild(input);

    let settled = false;
    let focusFallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const clearFocusFallbackTimer = () => {
      if (focusFallbackTimer !== null) {
        clearTimeout(focusFallbackTimer);
        focusFallbackTimer = null;
      }
    };

    const cleanup = () => {
      clearFocusFallbackTimer();
      input.removeEventListener("change", onChange);
      input.removeEventListener("cancel", onCancel as EventListener);
      window.removeEventListener("focus", onWindowFocus);
      input.remove();
    };

    const settle = (file: File | null) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(file);
    };

    const onChange = () => {
      clearFocusFallbackTimer();
      settle(input.files?.[0] ?? null);
    };

    const onCancel = () => {
      clearFocusFallbackTimer();
      settle(null);
    };

    const onWindowFocus = () => {
      // Some browsers don't emit `cancel`; give `change` event time to fire first.
      clearFocusFallbackTimer();
      focusFallbackTimer = setTimeout(() => {
        settle(input.files?.[0] ?? null);
      }, 300);
    };

    input.addEventListener("change", onChange);
    input.addEventListener("cancel", onCancel as EventListener);
    window.addEventListener("focus", onWindowFocus);
    input.click();
  });
}
