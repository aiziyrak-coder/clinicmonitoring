# Local HL7 Gateway (Node.js)

TCP **6006** on `0.0.0.0`, parses HL7/MLLP, forwards JSON to cloud `POST /api/vitals`.

## Setup

```bash
cd gateway
npm install
```

(No npm dependencies — `package.json` is for consistency.)

## Run

```bash
node server.js
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_HOST` | `0.0.0.0` | Bind address |
| `GATEWAY_PORT` | `6006` | TCP port |
| `VITALS_URL` | `http://167.71.53.238/api/vitals` | Cloud API URL |
| `NO_DATA_MS` | `10000` | No data warning timeout |
| `DEBUG` | `1` | Set `0` to reduce verbose logs |

## Debug lines (stdout)

- `CLIENT CONNECTED`
- `NO DATA RECEIVED`
- `HL7 RECEIVED`
- `FORWARDED TO SERVER`
