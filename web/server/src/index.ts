import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

const config = loadConfig();
const server = await createServer(config);

await server.listen({ host: config.host, port: config.port });
server.log.info(
  {
    host: config.host,
    port: config.port,
    cliPath: config.cliPath,
    skillsRoot: config.skillsRoot,
    tokenRequired: Boolean(config.token),
  },
  "skills-manager-web listening",
);
