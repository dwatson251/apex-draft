# Apex Draft server

Takes players' racing lines, **runs them through the game's own simulation** to get the lap time (the client never says what its
time was), and hands other players' lines back so you race ghosts that put you mid-pack. The site and API live at
`https://apexdraft.dnlwtsn.co.uk`; the URL is baked into the game (`src/renderer/online.ts`).

## Run it for development
```
npm run server:dev          # builds, then listens on :8787 with data in server/data
curl localhost:8787/healthz
```

## Deploy with Portainer
1. DNS: an A/CNAME record for `apexdraft.dnlwtsn.co.uk` pointing at the host (or your proxy).
2. Portainer: Stacks, Add stack, Web editor, paste `server/docker-compose.yml`, deploy.
3. Reverse proxy: a host for `apexdraft.dnlwtsn.co.uk` forwarding to the container's port 8787 (HTTP) with a certificate. Pass
   `X-Forwarded-For` (most proxies do) and leave `TRUST_PROXY=1`.
4. Back up the `apexdraft-data` volume (it holds `apex.db`).

Upgrading: pull the new image tag and redeploy the stack. If the simulation changed, `SIM_VERSION` was bumped, and times set under the
old ruleset stay in the database but are no longer ranked or handed out.

## API (JSON, under `/api/v1`)
Every call except `/healthz` sends `Authorization: Bearer <the player's UUID>`. The UUID is the player's secret; the server keeps only a
hash of it and shows a different, derived id on profiles.

| Call | What it does |
| --- | --- |
| `POST /players` `{name}` | Register (idempotent). The first name sticks; use `PUT /me` to change it. |
| `GET /me`, `PUT /me` `{name}` | Your public id and name. Names are cleaned (hidden characters out, 20 characters). |
| `POST /lines` `{phrase, vehicle, car, lines[]}` | Check the line (on the road, car within budget, machine offered on that track), time it, keep it if it is the player's best. Returns `{time, best, improved, rank}`. Lines are in the line-file format (`[x, y]` points to 0.01). |
| `GET /daily?date=` | The Daily for a UTC day within a day of the server's: its phrase and machine, the top 20 times and your own place on that track's board. |
| `GET /ghosts?phrase=&vehicle=&limit=&time=` | Up to `limit` (max 31) other players' lines: half just faster than `time`, half just slower, nearest first; the median if `time` is left out. |

| `POST /results` `{kind: quick or weekend, phrase, vehicle, car, lines[], lapLine[], laps, rivals, realism, ghostIds[], ...}` | Queue a finished race. The server replays the **whole race** (the player's lines against the named ghosts' stored lines plus the computer-driven rivals, which are the same on every machine) and records the finishing place. Answers 202; the result shows on the player's profile once it has run. |

The player's grid place in a replay comes from their best solo time on the server (a quick race grids by time trial, the same as the game);
for a race weekend that stands in for the qualifying order, and bots are not redrawn at pit stops, so a replay can differ a little from
what the player saw on screen. The replay is the official result.

## Website
`/` popular tracks and latest times, `/tracks` all tracks, `/tracks/<code>` a track (layout, code, length, surface, weather, cars, top 10
per car), `/players/<id>` a driver (best times, race results). Real circuits are spoilers (hidden behind a click on the lists), fun
tracks carry a **Fun** badge.

Limits: 256 KB bodies, per-client and per-player rate limits, and 30 new tracks per player per day.
