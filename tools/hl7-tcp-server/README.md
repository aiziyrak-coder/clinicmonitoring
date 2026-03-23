# HL7 TCP server (Node.js)

TCP **6006** da HL7/MLLP qabul qiladi, OBX dan vitallarni ajratadi va MediCentral **`POST /api/hl7`** ga JSON yuboradi.

## O‘rnatish

- [Node.js 18+](https://nodejs.org/) (ichki `fetch` / `http` / `https`)

```bash
cd tools/hl7-tcp-server
node server.js
```

## Muhit o‘zgaruvchilari

| O‘zgaruvchi | Default | Tavsif |
|-------------|---------|--------|
| `HL7_TCP_PORT` | `6006` | TCP port |
| `HL7_HTTP_URL` | `http://127.0.0.1:8012/api/hl7` | Backend URL (masalan `https://clinicmonitoringapi.ziyrak.org/api/hl7`) |
| `HL7_DEVICE_IP` | `192.168.0.228` | Bazadagi `MonitorDevice.ip_address` bilan mos kelishi kerak |
| `HL7_BRIDGE_TOKEN` | (bo‘sh) | Backend `.env` dagi `HL7_BRIDGE_TOKEN` bilan bir xil |
| `HL7_NO_DATA_MS` | `10000` | Ulanish ochilganda shu vaqt ichida bayt kelmasa: `NO DATA RECEIVED` |
| `HL7_HTTP_RETRY_MAX` | `8` | HTTP xato qayta urinishlari |

## Django tomoni

1. `backend/.env`: `HL7_BRIDGE_TOKEN=<uzun-token>` (production uchun majburiy).
2. `DEBUG=false` bo‘lsa token **siz** `/api/hl7` **503** qaytaradi.
3. Bir xil mashinada Django HL7 tinglovchisi bilan **6006** ziddiyatini oldini olish: `HL7_LISTEN_ENABLED=false`.

## JSON namuna (bridge → API)

```json
{
  "deviceIp": "192.168.0.228",
  "hr": 72,
  "spo2": 98,
  "nibpSys": 120,
  "nibpDia": 80,
  "rr": 18,
  "temp": 36.5
}
```

Header: `X-HL7-Bridge-Token: <token>` (agar muhitda token bo‘lsa).

## Xususiyatlar

- Bir nechta parallel TCP ulanishlar
- MLLP (`0x0B` … `0x1C`) va ba’zi «yalin» HL7 matnlar
- HTTP POST uchun eksponensial qayta urinish
- Xatoliklarni konsolga yozish
