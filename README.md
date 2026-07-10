# raspy-lab

A kiosk dashboard for a second Raspberry Pi (with touchscreen) that shows live
status for the containers, Jenkins builds, and SonarQube quality gates running
on your existing "server" Pi.

```
┌────────────────────┐   LAN    ┌──────────────────────────┐
│   Server Pi        │◄────────┤   Touchscreen Pi          │
│  (existing)         │         │   (new)                    │
│  - frontend         │         │  - dashboard/ (Node app)   │
│  - backend          │         │  - Chromium kiosk mode     │
│  - jenkins          │         │    showing localhost:8080  │
│  - sonarqube        │         │                            │
│  - postgres         │         │                            │
│  + server-agent  ◄──┼─────────┤ polls :9090, Jenkins :8080,│
│    (new, read-only) │         │ SonarQube :9000            │
└────────────────────┘         └──────────────────────────┘
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

Jenkins, SonarQube, and Pi-hole need no changes — the dashboard talks to their
existing REST APIs directly. Just create:
- A Jenkins API token (your user → Configure → API Token).
- A SonarQube user token (My Account → Security → Generate Token).
- Nothing to create for Pi-hole (v6) — just its URL and your existing admin
  password. The dashboard logs into Pi-hole's own session-based API the same
  way the web UI does.

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
   - `pihole.url` / `pihole.password` → your Pi-hole's address and admin
     password (only needed if you run Pi-hole on the server Pi)
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

After reboot the touchscreen Pi should boot straight into a full-screen,
auto-refreshing dashboard with five tabs: **Overview**, **Docker**, **Jenkins**,
**SonarQube**, **Weather**. Each row is a status dot (green/amber/orange/red) +
name + key metric.

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

### Overview tab

Shows the things worth checking before diving into a specific tab:
- **Server agent** — whether the dashboard can even reach `server-agent` on
  the server Pi, and the round-trip latency. This is checked separately from
  container status, since "agent unreachable" (network/agent down) and
  "container unhealthy" (agent reachable, container itself is broken) need
  different reactions.
- **PostgreSQL** — actual database health (connects and queries), not just
  "the container is running." Shows active connection count, database size,
  and version when healthy.
- **Pi-hole** — a quick-glance summary tile, tap it to jump to the dedicated
  **Pi-hole tab** with the full picture: status, queries/blocked today,
  blocklist size, active clients, a blocked-vs-allowed proportion bar, and
  the top 8 blocked and top 8 permitted domains.
- **Server Pi** — CPU temperature, 1-minute load average, memory %, disk %,
  and uptime for the *server* Pi (via `server-agent`'s `/api/system`).
- **This Pi (dashboard)** — the same host stats for the touchscreen Pi itself,
  read locally (no network round-trip), so you can tell a blank dashboard
  apart from a dashboard Pi that's actually struggling.

### Touch-friendly by design

Since the touchscreen Pi has no keyboard/mouse, navigation is 100% tap-driven:
- Tabs are large (48px-tall) buttons with a visible pressed state — no
  hover-only affordances.
- Each tab shows a live summary badge (e.g. "2/3 healthy", "1 failing") so you
  can see trouble without tapping in.
- The header has a manual **⟳ refresh** button that forces an immediate
  refresh of all sources via `POST /api/refresh`, instead of waiting for the
  next automatic poll.

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

- Everything is read-only/visibility-only by design — no start/stop/restart
  actions are exposed, since the touchscreen Pi is meant purely as a status
  monitor.
- The dashboard server polls its sources every `refreshIntervalSeconds`
  (default 10s) and caches the result, so the browser itself just polls the
  local `/api/data` endpoint every 8s — cheap even on a Pi Zero. The refresh
  button bypasses this cache and re-polls everything immediately.
- If your Jenkins/SonarQube instances use HTTPS with self-signed certs, either
  put a real cert in front of them or adjust the `fetch` calls in
  `dashboard/server.js` accordingly.
- Weather temperatures are Celsius. For Fahrenheit, add `&temperature_unit=fahrenheit`
  to the Open-Meteo URL in `refreshWeather()` in `dashboard/server.js`.
