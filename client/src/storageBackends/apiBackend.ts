import { Err, Ok, Result } from "@app/shared/types/result";
import { SheetData, SheetMeta } from "@app/shared/types/sheet";
import { StorageBackend } from "./storageBackend";
import {
  BodyOf,
  buildUrl,
  CREATE_SHEET,
  DELETE_SHEET,
  Endpoint,
  GET_SHEET_DATA,
  GET_SHEETS,
  HANDSHAKE,
  IMPORT_SHEET,
  LOGIN,
  ParamsOf,
  RENAME_SHEET,
  UPDATE_SHEET,
} from "@app/shared/endpoints";
import { SheetAction } from "@app/shared/types/action";
import { popupPrompt } from "../utils/popup";
import { getAuthToken, setAuthToken } from "../utils/authStore";

// API
export const REMOTE_URL_PARAM = "remote";

export const apiBackend = (baseUrl: string): StorageBackend => ({
  backendType: "api",
  url: baseUrl,
  id: baseUrl,
  queryParam: `${REMOTE_URL_PARAM}=${encodeURIComponent(baseUrl)}`,
  async getSheets(): Promise<Result<SheetMeta[]>> {
    try {
      const res = await fetchEndpoint(
        baseUrl,
        GET_SHEETS,
        undefined,
        undefined,
      );
      await handleHttpError(res);
      const sheetsMeta = (await res.json()) as SheetMeta[];
      return Ok(sheetsMeta);
    } catch (e) {
      return Err(handleErrorObject(e));
    }
  },
  async renameSheet(sheetId: string, title: string) {
    try {
      const res = await fetchEndpoint(
        baseUrl,
        RENAME_SHEET,
        { sheetId },
        { title },
      );
      await handleHttpError(res);
      return Ok();
    } catch (e) {
      return Err(handleErrorObject(e));
    }
  },
  async deleteSheet(sheetId: string) {
    try {
      const res = await fetchEndpoint(
        baseUrl,
        DELETE_SHEET,
        { sheetId },
        undefined,
      );
      await handleHttpError(res);
      return Ok();
    } catch (e) {
      return Err(handleErrorObject(e));
    }
  },
  async createSheet(title: string): Promise<Result<SheetMeta>> {
    try {
      const res = await fetchEndpoint(baseUrl, CREATE_SHEET, undefined, {
        title,
      });
      await handleHttpError(res);
      const sheetMeta = (await res.json()) as SheetMeta;
      return Ok(sheetMeta);
    } catch (e) {
      return Err(handleErrorObject(e));
    }
  },
  async getSheetData(sheetId: string): Promise<Result<SheetData>> {
    try {
      const res = await fetchEndpoint(
        baseUrl,
        GET_SHEET_DATA,
        { sheetId },
        undefined,
      );
      await handleHttpError(res);
      const sheetData = (await res.json()) as SheetData;
      return Ok(sheetData);
    } catch (e) {
      return Err(handleErrorObject(e));
    }
  },
  async updateSheet(
    sheetId: string,
    action: SheetAction,
  ): Promise<Result<void>> {
    return enqueue(async () => {
      try {
        const res = await fetchEndpoint(
          baseUrl,
          UPDATE_SHEET,
          { sheetId },
          { action },
        );
        await handleHttpError(res);
        return Ok();
      } catch (e) {
        return Err(handleErrorObject(e));
      }
    });
  },
  async importSheet(sheetData: SheetData) {
    try {
      const res = await fetchEndpoint(baseUrl, IMPORT_SHEET, {}, { sheetData });
      await handleHttpError(res);
      return Ok();
    } catch (e) {
      return Err(handleErrorObject(e));
    }
  },
});

// Handshake
export async function handshake(baseUrl: string): Promise<Result<boolean>> {
  try {
    const res = await fetchEndpoint(baseUrl, HANDSHAKE, undefined, undefined);

    if (res.status === 200) {
      return Ok(true);
    } else if (res.status === 401) {
      return Ok(false);
    }
    return Err("Unknown status code");
  } catch (e) {
    return Err(handleErrorObject(e));
  }
}

// On close
let activeRequests = 0;
let pendingRequests = 0;

function startRequest() {
  activeRequests++;
}

function endRequest() {
  activeRequests = Math.max(0, activeRequests - 1);
}

function hasActiveRequests() {
  return activeRequests > 0;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (event) => {
    if (hasActiveRequests()) {
      event.preventDefault();
      event.returnValue = ""; // Required for Chrome
    }
  });
}

/**
 * @param baseUrl Base url without trailing slash
 */
async function fetchEndpoint<E extends Endpoint<unknown, unknown, unknown>>(
  baseUrl: string,
  endpoint: E,
  params: ParamsOf<E>,
  body: BodyOf<E>,
): Promise<Response> {
  startRequest();
  try {
    const fetchFunc = (init: RequestInit = {}) => {
      const token = getAuthToken(baseUrl);
      return fetch(baseUrl + buildUrl(endpoint, params), {
        method: endpoint.method.toUpperCase(),
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
        body: JSON.stringify(body),
        ...init,
      });
    };

    let res = await fetchFunc();
    if (res.status === 401) {
      const user =
        (await popupPrompt(`Input remote passkey`, "Login", "", true)) || "";

      const loginBody: BodyOf<typeof LOGIN> = {
        accessType: "passkey",
        passkey: user,
      };
      const loginRes = await fetch(baseUrl + buildUrl(LOGIN, undefined), {
        method: LOGIN.method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(loginBody),
      });

      const loginResPayload = await loginRes.json();

      if (!loginResPayload.ok) {
        throw new Error("Invalid passkey!");
      }

      const token = loginResPayload.token;
      setAuthToken(baseUrl, token);

      res = await fetchFunc({
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status !== 401) {
        setAuthToken(baseUrl, token);
      } else {
        throw new Error("Invalid credentials!");
      }
    }

    await handleHttpError(res);
    return res;
  } catch (e) {
    throw handleErrorObject(e);
  } finally {
    endRequest();
  }
}
let updateQueue: Promise<void> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  // Count as pending immediately (closes race window)
  pendingRequests++;

  const wrappedTask = async () => {
    try {
      return await task();
    } finally {
      // Remove from pending once it actually runs (success or error)
      pendingRequests = Math.max(0, pendingRequests - 1);
    }
  };

  const result = updateQueue.then(wrappedTask, wrappedTask);

  // Keep queue chain alive even if task fails
  updateQueue = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
}

// Helper
async function handleHttpError(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    if (text) {
      throw new Error(text);
    } else {
      throw new Error("HTTP Error: " + res.status);
    }
  }
}

function handleErrorObject(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  }
  return String(e);
}
