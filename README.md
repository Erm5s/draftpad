# Draftpad

Control League of Legends champion select from your phone.

Draftpad is a small Node.js server that runs on the Windows PC where the League client is open. It talks to the client's local API (LCU) and serves a mobile web app on your Wi-Fi, so from your phone you can:

- **Accept the match** with one big button, or turn on **auto-accept**
- **Pick and ban** from a searchable champion grid, with unavailable champions hidden, the draft of both teams, and the phase timer
- **Choose summoner spells**, limited to the spells of the current game mode
- **Apply rune pages**: save favourite pages per champion and apply them in one tap. The page for the champion you're playing is suggested automatically.

```
Phone ──HTTP / WebSocket (LAN, PIN)──▶ Draftpad (Node.js, your PC) ──HTTPS / WAMP (127.0.0.1)──▶ League client
```

The phone never talks to the League client directly. Draftpad only uses the official client's local API. It doesn't read game memory, inject anything, or contact Riot servers.

## Requirements

- Windows PC with the League of Legends client
- [Node.js](https://nodejs.org) 18.17 or newer (the LTS version is recommended)
- A phone on the same Wi-Fi network as the PC, with Internet access (champion and rune images come from Riot's Data Dragon CDN)

## Installation

```bash
git clone <repository-url> draftpad
cd draftpad
npm install
```

## Usage

```bash
npm start
```

`npm start` compiles the server before starting it, so the server always matches the code.

To update:

```bash
git pull
npm install
npm start
```

The console prints the address to open on your phone, a PIN and a QR code:

```
Draftpad is running.
  Lockfile: C:\Riot Games\League of Legends\lockfile
  Open on your phone (same Wi-Fi):
    http://192.168.1.20:3000
  PIN: 482913
```

1. Scan the QR code, or open the address on your phone and enter the PIN. The phone remembers the PIN.
2. Start (or keep) the League client open. Draftpad connects automatically and reconnects if the client restarts.
3. Queue up. The **Play** tab follows the client: lobby → queue → ready check → champion select → in game.

Tip: use "Add to Home Screen" in your phone's browser to open Draftpad full screen like an app.

**Windows Firewall:** the first time you run it, Windows asks whether Node.js may communicate on networks. Allow it on **private networks** only. If the phone can't reach the page, check that your Wi-Fi is set to *Private* in Windows and that Node.js is allowed in *Windows Defender Firewall → Allow an app*.

### Development

```bash
npm run dev        # runs src/ with automatic reload
npm run typecheck  # type checks without building
```

To see what the League client sends (useful to report a bug), start with debug logs:

```powershell
$env:DRAFTPAD_DEBUG=1; npm start
```

## Configuration

Copy `config.example.json` to `config.json`, or use environment variables (these take precedence).

| `config.json`  | Environment variable | Default                                    | Description                                                                       |
| -------------- | -------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| `lockfilePath` | `DRAFTPAD_LOCKFILE`  | `C:\Riot Games\League of Legends\lockfile` | Path to the client `lockfile`, or to the League install folder.                   |
| `port`         | `DRAFTPAD_PORT`      | `3000`                                     | Port of the web app.                                                              |
| `host`         | `DRAFTPAD_HOST`      | `0.0.0.0`                                  | Interface to listen on. Set your PC's LAN IP to bind to a single network.         |
| `pin`          | `DRAFTPAD_PIN`       | random                                     | Fixed PIN of 4 to 12 digits. Without it a new 6-digit PIN is generated per start. |
| `dataDir`      | `DRAFTPAD_DATA_DIR`  | `data`                                     | Where settings and favourite rune pages are saved.                                |

`DRAFTPAD_CONFIG` can point to a config file in another location.

If League is installed elsewhere, look for the `lockfile` in the folder that contains `LeagueClient.exe`. The file only exists while the client is running.

## Security

- **Local network only.** Every HTTP and WebSocket request from an address outside loopback and private ranges (`10/8`, `172.16/12`, `192.168/16`, link-local, IPv6 ULA) is rejected, even if a port is forwarded by mistake. Never expose Draftpad to the Internet.
- **PIN.** Every API call and the realtime connection require the PIN. After 5 wrong attempts, an address is locked out for one minute.
- **Self-signed certificate.** The League client uses a self-signed certificate. Draftpad skips certificate verification only for its calls to `127.0.0.1`.

## How it works

- **Connection:** Draftpad reads the client `lockfile` (`name:pid:port:password:protocol`) every 2 seconds until it appears. It then authenticates with Basic auth (`riot:<password>`) and opens the client WebSocket (WAMP protocol), subscribing to `OnJsonApiEvent` topics for the gameflow phase, the ready check and the champion select session. No polling is involved. Each change is pushed to the phone as a state snapshot over a WebSocket.
- **Ready check:** `POST /lol-matchmaking/v1/ready-check/accept` (or `/decline`). The ready check is also fetched as soon as the gameflow phase becomes `ReadyCheck`, and the phone shows the button from the phase alone. With auto-accept on, the server accepts on its own, even if no phone is connected or the phone is asleep.
- **Pick / ban:** the player's action is found in the session through `localPlayerCellId`. Tapping a champion hovers it (`PATCH .../actions/{id}` with `championId`), and **Lock in** / **Ban** completes it (`completed: true`). Before your turn, tapping declares your pick intent. The grid only shows champions from `pickable-champion-ids` / `bannable-champion-ids` that nobody has already picked or banned. If a list can't be used, the grid shows every champion and the League client rejects invalid choices itself.
- **Summoner spells:** `PATCH /lol-champ-select/v1/session/my-selection` with `spell1Id` (D) and `spell2Id` (F). The game mode comes from `/lol-gameflow/v1/session`.
- **Runes:** pages are created with `POST /lol-perks/v1/pages` and `current: true`. Pages created by Draftpad are prefixed with `DP ` and replaced on the next apply. If you're still at your page limit after that, Draftpad replaces your **current** page, or the oldest editable page if the current one can't be deleted. **Import from client** saves the client's current page as a favourite.
- **Favourites** are stored in `data/rune-presets.json`. The first page of a champion is its default and is suggested during champion select.

## Project structure

```
src/
  index.ts              entry point: wiring and console banner
  config.ts             config.json + environment variables
  state.ts              state snapshot shared with phones
  lcu/                  lockfile, HTTPS client, WAMP socket, auto-reconnecting connector
  services/             gameflow, ready check, champion select, runes
  storage/              JSON persistence (settings, favourite rune pages)
  server/               Express app, LAN guard, PIN auth, realtime WebSocket, routes
public/                 mobile web app (vanilla JS, no build step)
```

## Troubleshooting

- **"Waiting for League of Legends" never goes away:** check the lockfile path shown in the console. It must point to the folder where League is installed.
- **The phone can't open the page:** both devices must be on the same network (not a guest Wi-Fi), and the firewall must allow Node.js on private networks.
- **"The PIN has changed":** a new PIN is generated each time Draftpad starts. Set `pin` in `config.json` to keep the same one.
- **No images:** the phone needs Internet access to load images from Data Dragon.
- **The ready check appears late on the phone:** phones suspend pages when the screen is off. Keep the screen on while queuing, or turn on auto-accept, which runs on the PC.
- **Something else misbehaves:** run with `DRAFTPAD_DEBUG=1` and look at the `[debug]` lines in the console.

---

Draftpad isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
