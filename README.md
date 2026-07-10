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

1. Copy the `server-agent/` folder onto the server Pi (or just add it to the
   existing repo there).
2. Add the service from `server-agent/docker-compose.snippet.yml` to your
   existing `docker-compose.yml`, set a real `AGENT_API_KEY`, then:
   ```bash
   docker compose up -d --build server-agent
   ```
3. Confirm it works: `curl http://<server-pi-ip>:9090/api/containers -H "x-api-key: <your-key>"`

Jenkins and SonarQube need no changes — the dashboard talks to their existing
REST APIs directly. Just create:
- A Jenkins API token (your user → Configure → API Token).
- A SonarQube user token (My Account → Security → Generate Token).

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

7-day forecast (today + 6 days) for the location you set in
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
