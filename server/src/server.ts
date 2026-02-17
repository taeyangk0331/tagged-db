import Fastify from "fastify";
import fs from "fs";
import cors from "@fastify/cors";
import {
  CREATE_SHEET,
  DELETE_SHEET,
  GET_SHEETS,
  GET_SHEET_DATA,
  HANDSHAKE,
  IMPORT_SHEET,
  LOGIN,
  RENAME_SHEET,
  UPDATE_SHEET,
  type EndpointOf,
} from "@app/shared/endpoints";
import { jsonFsDb } from "./db/jsonFsDb.js";
import { SheetError } from "./lib/errors.js";

let https: { key?: string; cert?: string } | null = null;

if (
  process.env.HTTPS_ENABLED === "true" &&
  process.env.HTTPS_KEY_PATH &&
  process.env.HTTPS_CERT_PATH
) {
  https = {
    key: fs.readFileSync(process.env.HTTPS_KEY_PATH).toString(),
    cert: fs.readFileSync(process.env.HTTPS_CERT_PATH).toString(),
  };
}

(async () => {
  const server = Fastify({
    logger:
      process.env.LOG_JSON === "true"
        ? true
        : {
            transport: {
              target: "pino-pretty",
              options: {
                translateTime: "HH:MM:ss",
                ignore: "pid,hostname",
                colorize: true,
              },
            },
          },
    https,
  });

  if (https?.key && https?.cert) {
    server.log.info("HTTPS enabled");
  }

  // Static
  const useAuth = process.env.AUTH_TYPE !== "none";

  await server.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  });

  // AUTH
  if (useAuth) {
    server.log.info("Passkey auth enabled");

    await server.register(require("@fastify/cookie"));
    await server.register(require("@fastify/jwt"), {
      secret: process.env.AUTH_JWT_SECRET || "dev-secret-change-me",
    });

    server[LOGIN.method]<EndpointOf<typeof LOGIN>>(
      LOGIN.url,
      async function handler(request, reply) {
        if (request.body.accessType === "passkey") {
          const authPassKey = process.env.AUTH_PASSKEY;

          if (!authPassKey) {
            server.log.error(
              "Auth misconfigured: AUTH_TYPE is passkey but AUTH_PASSKEY not set",
            );
            return reply
              .code(401)
              .send({ ok: false, error: "Auth misconfigured." });
          }

          server.log.info("Passkey: " + request.body.passkey);
          if (request.body.passkey !== authPassKey) {
            return reply
              .code(401)
              .send({ ok: false, error: "Unauthorized: Invalid passkey" });
          }

          server.log.info("Authorized");

          const token = server.jwt.sign(
            { role: "admin" },
            { expiresIn: "30d" },
          );

          reply.send({ ok: true, token });
        } else if (request.body.accessType === "user") {
          // TODO: If you're implementing this, update the if statement condition
          return reply.code(501).send({ ok: false, error: "Not implemented" });
        }
      },
    );

    server.addHook("onRequest", async (req, reply) => {
      try {
        if (req.routeOptions.url === LOGIN.url) {
          return;
        }
        const auth = req.headers.authorization;
        if (!auth?.startsWith("Bearer ")) {
          return reply.code(401).send({ error: "Missing token" });
        }

        const token = auth.slice(7);
        await req.jwtVerify(token as any);
      } catch (err) {
        server.log.error(err);
        reply.code(401).send({ error: "Unauthorized" });
      }
    });
  }

  // Handshake
  server[HANDSHAKE.method]<EndpointOf<typeof HANDSHAKE>>(
    HANDSHAKE.url,
    async function handler(request, reply) {
      return "ok";
    },
  );

  // API
  const db = jsonFsDb;

  server[GET_SHEETS.method]<EndpointOf<typeof GET_SHEETS>>(
    GET_SHEETS.url,
    async function handler(request, reply) {
      return await db.getSheets();
    },
  );

  server[CREATE_SHEET.method]<EndpointOf<typeof CREATE_SHEET>>(
    CREATE_SHEET.url,
    async function handler(request, reply) {
      return await db.createSheet(request.body.title);
    },
  );

  server[RENAME_SHEET.method]<EndpointOf<typeof RENAME_SHEET>>(
    RENAME_SHEET.url,
    async function handler(request, reply) {
      await db.renameSheet(request.params.sheetId, request.body.title);
    },
  );

  server[DELETE_SHEET.method]<EndpointOf<typeof DELETE_SHEET>>(
    DELETE_SHEET.url,
    async function handler(request, reply) {
      await db.deleteSheet(request.params.sheetId);
    },
  );

  // Sheet
  server[GET_SHEET_DATA.method]<EndpointOf<typeof GET_SHEET_DATA>>(
    GET_SHEET_DATA.url,
    async function handler(request, reply) {
      return await db.getSheetData(request.params.sheetId);
    },
  );

  server[UPDATE_SHEET.method]<EndpointOf<typeof UPDATE_SHEET>>(
    UPDATE_SHEET.url,
    async function handler(request, reply) {
      await db.updateSheet(request.params.sheetId, request.body.action);
    },
  );

  // Import
  server[IMPORT_SHEET.method]<EndpointOf<typeof IMPORT_SHEET>>(
    IMPORT_SHEET.url,
    async function handler(request, reply) {
      await db.importSheet(request.body.sheetData);
    },
  );

  // Error
  server.setErrorHandler((error, request, reply) => {
    if (error instanceof SheetError) {
      server.log.error("[internal server error] " + error.message);
      return reply.send(error.message);
    }
    return reply.send(error);
  });

  // Run the server!
  const port = Number(process.env.PORT) || 3000;
  try {
    server.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
})();
