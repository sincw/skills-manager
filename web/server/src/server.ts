import path from "node:path";
import { existsSync } from "node:fs";
import fastify from "fastify";
import cors from "@fastify/cors";
import staticFiles from "@fastify/static";
import type { ServerConfig } from "./types.js";
import { registerRoutes } from "./routes.js";

export async function createServer(config: ServerConfig) {
  const app = fastify({ logger: true });
  await app.register(cors, {
    origin: true,
    credentials: false,
  });
  await registerRoutes(app, config);

  const clientDist = path.resolve(process.cwd(), "..", "client", "dist");
  if (existsSync(clientDist)) {
    await app.register(staticFiles, {
      root: clientDist,
      prefix: "/",
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith("/api/")) {
        reply.code(404).send({ ok: false, error: "not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return app;
}
