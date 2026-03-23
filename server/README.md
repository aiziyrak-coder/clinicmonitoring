# Vitals API + WebSocket + Dashboard

Express REST API, in-memory store, WebSocket broadcast, static dashboard.

## Setup

```bash
cd server
npm install
```

## Run

```bash
node app.js
```

Open **http://localhost:3000/** (or `PORT`).

- `POST /api/vitals` — body: `device_id`, `timestamp`, `heart_rate`, `spo2`, `systolic`, `diastolic`, `temperature` (optional)
- `GET /api/vitals` — last 100 records
- `GET /api/vitals/:device_id` — last 100 for device
- WebSocket: `ws://host:PORT/ws`

Point the **gateway** `VITALS_URL` to this server, e.g. `http://YOUR_IP:3000/api/vitals`.
