import { createServer } from "node:http";
import qrcode from "qrcode-terminal";
import { loadConfig } from "./config.js";
import { LcuConnector } from "./lcu/connector.js";
import { debug, DEBUG } from "./log.js";
import { CHAMP_SELECT_SESSION_URI, ChampSelectService } from "./services/champSelect.js";
import { GAMEFLOW_PHASE_URI, GameflowService } from "./services/gameflow.js";
import { READY_CHECK_URI, ReadyCheckService } from "./services/readyCheck.js";
import { RuneService } from "./services/runes.js";
import { createApp } from "./server/app.js";
import { PinAuth } from "./server/auth.js";
import { lanAddresses } from "./server/network.js";
import { attachRealtime } from "./server/realtime.js";
import { champSelectRoutes } from "./server/routes/champSelect.js";
import { readyCheckRoutes } from "./server/routes/readyCheck.js";
import { runeRoutes } from "./server/routes/runes.js";
import { StateStore } from "./state.js";
import { RunePresetStore } from "./storage/runePresets.js";
import { settingsFile } from "./storage/settings.js";

const config = loadConfig();

const connector = new LcuConnector(config.lockfilePath, [
  GAMEFLOW_PHASE_URI,
  READY_CHECK_URI,
  CHAMP_SELECT_SESSION_URI,
]);
if (DEBUG) {
  connector.on("event", (event) => debug(`event ${event.eventType} ${event.uri}`, JSON.stringify(event.data)?.slice(0, 300)));
}

const store = new StateStore({
  connection: connector.status,
  phase: "None",
  readyCheck: null,
  autoAccept: false,
  champSelect: null,
});

new GameflowService(connector, store);
const readyCheck = new ReadyCheckService(connector, store, settingsFile(config.dataDir));
await readyCheck.init();
const champSelect = new ChampSelectService(connector, store);
const runes = new RuneService(connector);
const runePresets = new RunePresetStore(config.dataDir);

const auth = new PinAuth(config.pin);
const app = createApp({
  auth,
  store,
  routers: [
    readyCheckRoutes(readyCheck),
    champSelectRoutes(champSelect),
    runeRoutes(runes, runePresets),
  ],
});
const server = createServer(app);
attachRealtime(server, store, auth);

server.listen(config.port, config.host, () => {
  printBanner();
  connector.start();
});

function printBanner(): void {
  const urls = lanAddresses().map((ip) => `http://${ip}:${config.port}`);

  console.log("\nDraftpad is running.");
  console.log(`  Lockfile: ${config.lockfilePath}`);
  if (urls.length === 0) {
    console.log(`  No LAN address found, listening on port ${config.port}`);
  } else {
    console.log("  Open on your phone (same Wi-Fi):");
    for (const url of urls) console.log(`    ${url}`);
  }
  console.log(`  PIN: ${auth.pin}\n`);

  if (urls[0]) {
    qrcode.generate(`${urls[0]}/?pin=${auth.pin}`, { small: true });
  }
}

function shutdown(): void {
  connector.stop();
  server.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
