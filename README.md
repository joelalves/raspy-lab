# raspy-lab

A kiosk dashboard for a second Raspberry Pi (with touchscreen) that shows live
status for a "server" Pi's Docker containers, Postgres, Jenkins builds, and
SonarQube quality gates — plus Pi-hole, a Shelly energy monitor, local
weather, and push notifications on outage/recovery.

```
┌──────────────────────────┐        ┌──────────────────────────┐
│ Server Pi (existing)     │        │ Touchscreen Pi (new)     │
│                          │        │                          │
│ - frontend               │        │ - dashboard/ (Node app)  │
│ - backend                │        │ - Chromium kiosk mode    │
│ - jenkins                │  LAN   │                          │
│ - sonarqube              │        │ Polls server-agent, plus │
│ - postgres               │        │ Jenkins, SonarQube,      │
│ - Pi-hole (optional)     │        │ Pi-hole, Shelly, and     │
│ + server-agent (new)     │        │ Open-Meteo directly.     │
└──────────────────────────┘        └──────────────────────────┘
```

## 1. Server Pi (existing) — add `server-agent`

`server-agent/` is a small read-only HTTP API that reports:
- Docker container stats (CPU/mem/state) via `GET /api/containers`, by reading the Docker socket (mounted `:ro` — it cannot start, stop, or modify anything)
- Host stats for the server Pi itself via `GET /api/system` — CPU temp, load average, memory, disk usage, uptime, hostname
- Postgres health via `GET /api/postgres` — connects with `SELECT 1`-style
  queries to confirm the database itself is actually answering (not just that
  its container is "running"), plus version, active connection count, and
  database size

1. Copy the `server-agent/` folder onto the server Pi (or just add it to the
   existing repo there).
2. Add the service from `server-agent/docker-compose.snippet.yml` to your
   existing `docker-compose.yml`, set a real `AGENT_API_KEY`, and fill in the
   `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` values. **Create a dedicated
   read-only monitoring role** rather than reusing your app's own DB
   credentials (commands are in the compose snippet's comments) — the agent
   only needs `pg_monitor` + `CONNECT`, nothing more. Then:
   ```bash
   docker compose up -d --build server-agent
   ```
3. Confirm it works:
   ```bash
   curl http://<server-pi-ip>:9090/api/containers -H "x-api-key: <your-key>"
   curl http://<server-pi-ip>:9090/api/postgres -H "x-api-key: <your-key>"
   ```

Jenkins, SonarQube, Pi-hole, and Shelly need no changes — the dashboard talks
to their existing REST APIs directly. Just create:
- A Jenkins API token (your user → Configure → API Token). Needs **build
  permission** on the jobs you want to trigger from the kiosk, not just read
  — see "Jenkins: view logs and trigger builds" below.
- A SonarQube user token (My Account → Security → Generate Token).
- Nothing to create for Pi-hole (v6) — just its URL and your existing admin
  password. The dashboard logs into Pi-hole's own session-based API the same
  way the web UI does.
- Nothing to create for Shelly either — Gen1 devices (Shelly EM/1PM/Plug S/etc.)
  serve an unauthenticated local HTTP API by default. Just its IP address.

## 2. Touchscreen Pi (new) — the dashboard

Use Raspberry Pi OS **with Desktop** (needed for the kiosk browser), any model
that drives your 3.5"–7" screen.

1. Install Node.js 20+ (e.g. via [NodeSource](https://github.com/nodesource/distributions) or `nvm`).
2. Copy the `dashboard/` folder to the Pi, e.g. `/home/pi/raspy-lab/dashboard`.
3. `cd dashboard && npm install`
4. `cp config.example.json config.json` and fill in:
   - `dockerAgent.url` / `dockerAgent.apiKey` → the server Pi + the key you set above
   - `jenkins.url` / `jenkins.user` / `jenkins.apiToken`
   - `sonarqube.url` / `sonarqube.token`
   - `weather.location` → e.g. `"Lisbon, Portugal"` (or set `weather.latitude`
     / `weather.longitude` directly if you'd rather not geocode a city name)
   - `weather.refreshIntervalMinutes` → how often to re-poll Open-Meteo
     (default 30 — weather runs on its own cycle, independent of
     `refreshIntervalSeconds`, since it doesn't need frequent polling)
   - `pihole.url` / `pihole.password` → your Pi-hole's address and admin
     password (only needed if you run Pi-hole on the server Pi)
   - `shelly.url` → your Shelly device's IP (e.g. `"http://192.168.1.100"`),
     and `shelly.carbonIntensityGramsPerKwh` → your grid's approximate
     gCO2/kWh (defaults to 200, a rough Portugal average — adjust to your
     own country/provider's published figure for more accuracy)
5. Test it manually first: `node server.js`, then browse to
   `http://localhost:8080` from the Pi (or `http://<pi-ip>:8080` from another
   machine) and confirm all tabs populate.
6. Install it as a service so it survives reboots:
   ```bash
   sudo cp dashboard.service /etc/systemd/system/dashboard.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now dashboard.service
   ```
7. Set up the kiosk browser to auto-launch full-screen on boot:
   ```bash
   bash kiosk/setup-kiosk.sh
   sudo reboot
   ```

For subsequent updates, `deploy-dashboard.sh` (repo root) syncs the latest
`dashboard/` source into a target folder and restarts `dashboard.service` in
one step — run it on the touchscreen Pi itself, pointed at wherever
`dashboard.service`'s `WorkingDirectory` is:
```bash
./deploy-dashboard.sh /home/<your-username>/raspy-lab/dashboard
```

After reboot the touchscreen Pi should boot straight into a full-screen,
auto-refreshing dashboard with eight tabs: **Overview**, **System**,
**Weather**, **Pi-hole**, **Docker**, **Jenkins**, **SonarQube**, **Shelly**.
Each row is a status dot (green/amber/orange/red) + name + key metric.

### Screen resolution

The layout is built for **1024×600** (a sidebar of tabs on the left, a
multi-column card grid on the right) since that's a common size for 7"–10"
Raspberry Pi touchscreens. It automatically falls back to the original
top-tabs, single-column layout below 700px wide, for smaller 3.5"–5"
touchscreens run in portrait. Nothing to configure — it's a CSS media query
(`dashboard/public/style.css`) keyed on viewport width.

### Weather tab

5-day forecast (today + 4 days), plus an hourly breakdown for the rest of
today, for the location you set in
`config.json`'s `weather.location`, via [Open-Meteo](https://open-meteo.com/) —
free, no API key or account needed. The server geocodes the city name once
per process start, then pulls daily min/max temp, a weather icon, and
precipitation chance. Weather is informational only and doesn't factor into
the "Attention needed" overall status — it isn't a system that can be
unhealthy the way a container or build can.

### Header

Two status indicators sit in the top bar, to the left of the theme/refresh
buttons:
- **Agent** — whether the dashboard can even reach `server-agent` on the
  server Pi, and the round-trip latency. Checked separately from container
  status, since "agent unreachable" (network/agent down) and "container
  unhealthy" (agent reachable, container itself is broken) need different
  reactions. Kept in the header (not a tab) since it's infrastructure for
  everything else, not a service in its own right.
- **Attention needed (…)** — the worst status across every source; "All
  systems operational" when everything's good.

### Overview tab

Shows the things worth checking before diving into a specific tab:
- **Docker** — a quick-glance summary tile ("6/6 healthy"), tap it to jump to
  the full container list on the **Docker tab**.
- **PostgreSQL** — actual database health (connects and queries), not just
  "the container is running." Shows active connection count, database size,
  and version when healthy.
- **Pi-hole** — a quick-glance summary tile, tap it to jump to the dedicated
  **Pi-hole tab** with the full picture: status, queries/blocked today,
  blocklist size, active clients, a blocked-vs-allowed proportion bar, and
  the top 8 blocked and top 8 permitted domains.
- **Shelly** — a quick-glance summary tile (current power + today's
  consumption), tap it to jump to the dedicated **Shelly tab**.
- **Weather** — today's icon and high, tap it to jump to the Weather tab.

Hardware/OS details for both Pis live on their own **System tab**: CPU
temperature, load average, memory %, disk %, uptime, model, and OS version —
for the *server* Pi (via `server-agent`'s `/api/system`) and for the
touchscreen Pi itself (read locally, no network round-trip — so you can tell
a blank dashboard apart from a dashboard Pi that's actually struggling).

### Shelly tab

Real-time power monitoring via a Gen1 Shelly device's local HTTP API (Shelly
EM, 1PM, Plug S, etc. — no cloud account or auth needed). Shows current power
draw, voltage, today's consumption and CO₂, lifetime net consumption and CO₂,
lifetime solar export if your device tracks `total_returned`, and a 24-hour
power chart.

CO₂ is estimated from measured kWh × `shelly.carbonIntensityGramsPerKwh`
(config.json) — a static approximation, not a live grid-carbon-intensity feed,
since that would need a separate third-party API/account. Adjust the factor
to your own country/provider's published average for better accuracy.

The 24h chart is backed by a small local history: the dashboard samples the
Shelly every poll cycle but only *persists* a point every 5 minutes (to
`dashboard/data/shelly-history.json`, gitignored), keeping the last 7 days and
surviving dashboard restarts/reboots. Right after first deploying this, the
chart will say "not enough history yet" until a few 5-minute samples land —
that's expected, not a bug.

### Docker container logs

Tap any container row on the Docker tab to open the last 200 log lines in a
modal (both stdout and stderr, interleaved and timestamped). Fetched on tap,
not part of the regular poll cycle — `server-agent` demuxes Docker's raw log
stream format, the dashboard proxies the request through its own (optional)
auth, and nothing is ever written or restarted.

### Jenkins: view logs and trigger builds

Tap a job on the Jenkins tab to view its last build's console log, in the
same modal as Docker's. **Hold a job for 1.5 seconds** (a blue progress bar
fills across the row) to trigger a new build — this is the only *write*
action anywhere in this dashboard, everything else is strictly read-only by
design. The long hold, with visible fill, is the deliberate guard against a
stray touch on the kiosk screen accidentally kicking off a build: release
early and nothing happens, and there's no confirmation dialog to accidentally
tap through.

This needs your Jenkins API token to have build permission (not just read).
Jenkins CSRF protection is handled automatically (the dashboard fetches a
crumb before POSTing), whether or not your instance has it enabled.

### Radio tab

Ten Portuguese radio stations (Rádio Comercial, RFM, Mega Hits, Antena 1,
Antena 3, M80, Rádio Renascença, Cidade FM, Smooth FM, TSF) as tap-to-play
cards. This is pure client-side playback — the touchscreen Pi's own browser
plays the stream through whatever speakers it's connected to, no backend
involved at all. Tap a station to play it, tap the same one again to stop.

The header shows a compact now-playing strip (station name, volume ±,
mute/unmute, stop) whenever something's playing, and disappears entirely
otherwise. Volume is remembered across stations (and page reloads) via
`localStorage`; playback itself doesn't resume after a reload — same as
turning a physical radio back on after a power cycle.

Only direct MP3/AAC stream URLs are used, not `.m3u8`/HLS — Chromium's plain
`<audio>` element can't play HLS without extra JS libraries. If you want to
swap a station or add your own, edit `RADIO_STATIONS` in
`dashboard/public/app.js`; verify any new URL actually serves audio first
(`curl -I <url>` should show `Content-Type: audio/...`, not `text/html` or
`application/vnd.apple.mpegurl`).

### Push notifications on outage/recovery

Set `notifications.ntfyUrl` in `dashboard/config.json` to a
[ntfy.sh](https://ntfy.sh/) topic URL (free, no account — just pick a random,
hard-to-guess topic name, e.g. `https://ntfy.sh/raspy-lab-a1b2c3d4`, and
subscribe to it in the ntfy app) to get a push notification the moment any
source goes `critical`, and another when everything recovers. Edge-triggered
— it fires once per transition, not once per poll, so a persistent outage
doesn't spam you. Only the `critical` status triggers a notification, not
`warning` (e.g. an optional integration you haven't configured yet isn't
worth interrupting you for).

### Touch-friendly by design

Since the touchscreen Pi has no keyboard/mouse, navigation is 100% tap-driven:
- Tabs are large (48px-tall) buttons with a visible pressed state — no
  hover-only affordances.
- Each tab shows a live summary badge (e.g. "2/3 healthy", "1 failing") so you
  can see trouble without tapping in.
- The header has a manual **⟳ refresh** button that forces an immediate
  refresh of all sources via `POST /api/refresh`, instead of waiting for the
  next automatic poll.

### Tests

The pure logic (status mapping, weather icon lookup, Shelly history pruning
and CO₂ math, etc.) lives in `dashboard/lib/pure.js`, separate from the parts
that need a live config/network (`dashboard/server.js`), so it can be unit
tested on its own with Node's built-in test runner — no extra dependency:

```bash
cd dashboard && npm test
```

## Troubleshooting

### Viewing logs

The dashboard now logs each source's failure/recovery to stdout (once per
transition, not once per poll, so it won't flood the journal):

```bash
journalctl -u dashboard.service -f          # follow live
journalctl -u dashboard.service -n 100 --no-pager   # last 100 lines
```

For the exact error message + raw data currently cached, hit the API directly
(works from the Pi itself or any machine on the LAN):

```bash
curl -s http://localhost:8080/api/data | python3 -m json.tool
```

Look at `.sonarqube.error` (or `.docker.error`, `.jenkins.error`,
`.overview.agent.error`) for the specific failure.

### SonarQube connection failing

Common causes, roughly in order of likelihood:
- **Wrong token or URL** in `config.json`'s `sonarqube` block - double check
  against what you generated in SonarQube's My Account → Security.
- **Self-signed HTTPS cert** - Node's `fetch` rejects untrusted certs by
  default; either put a real cert in front of SonarQube or (for a trusted LAN
  only) start the dashboard with `NODE_TLS_REJECT_UNAUTHORIZED=0` set in
  `dashboard.service`'s `Environment=` lines.
- **Wrong host/port or SonarQube not reachable from the touchscreen Pi** -
  verify with `curl -u YOUR_TOKEN: http://<sonarqube-host>:9000/api/projects/search`
  directly from the touchscreen Pi; if that fails, it's a network/port issue,
  not a dashboard bug.

### Weather: switch from city name to lat/long

If geocoding a city name isn't resolving correctly (ambiguous name, wrong
country matched, etc.), skip geocoding entirely by giving coordinates
directly in `dashboard/config.json`:

```json
"weather": {
  "latitude": 38.7223,
  "longitude": -9.1393,
  "locationName": "Lisbon"
}
```

`latitude`/`longitude` take priority over `location` when both are present.
Look up your coordinates from any map app (e.g. long-press a location in
Google Maps to see its lat/long), then restart the dashboard:
`sudo systemctl restart dashboard.service`.

## Notes

- Everything is read-only/visibility-only, **except** triggering a Jenkins
  build (see "Jenkins: view logs and trigger builds" above) — that's the one
  deliberate exception, guarded by a 1.5s hold. Every other integration
  (Docker, Postgres, Pi-hole, Shelly, SonarQube) has no write path at all,
  since the touchscreen Pi is otherwise meant purely as a status monitor.
- The dashboard server polls its sources every `refreshIntervalSeconds`
  (default 10s) and caches the result, so the browser itself just polls the
  local `/api/data` endpoint every 8s — cheap even on a Pi Zero. The refresh
  button bypasses this cache and re-polls everything immediately.
- If your Jenkins/SonarQube instances use HTTPS with self-signed certs, either
  put a real cert in front of them or adjust the `fetch` calls in
  `dashboard/server.js` accordingly.
- Weather temperatures are Celsius. For Fahrenheit, add `&temperature_unit=fahrenheit`
  to the Open-Meteo URL in `refreshWeather()` in `dashboard/server.js`.
- By default, `/api/data` and `/api/refresh` are open to anything on your LAN
  (matching `server-agent`'s default). The kiosk browser always talks to the
  dashboard over `localhost`, so if you want to close that off, set
  `DASHBOARD_API_KEY` in `dashboard.service` (see its comments) — only
  non-localhost requests are required to send it, so the kiosk itself is
  unaffected either way.
