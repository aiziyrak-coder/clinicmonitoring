/**
 * CLOUD API — Express + in-memory vitals + WebSocket broadcast
 * Serves dashboard static files from ../dashboard
 *
 * Env: PORT (default 3000)
 *
 * Run: npm install && node app.js
 */

"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 3000);

/** @type {Array<Record<string, unknown>>} */
const vitalsRecords = [];
const MAX_STORE = 10_000;

const app = express();
app.use(cors());
app.use(express.json({ limit: "512kb" }));

function validateVitalsBody(body) {
  if (!body || typeof body !== "object") return "Body must be JSON object";
  if (typeof body.device_id !== "string" || !body.device_id.trim()) {
    return "device_id is required (string)";
  }
  if (body.timestamp != null && typeof body.timestamp !== "string") {
    return "timestamp must be a string (ISO8601)";
  }
  const nums = ["heart_rate", "spo2", "systolic", "diastolic", "temperature"];
  for (const k of nums) {
    if (body[k] != null && typeof body[k] !== "number") {
      return `${k} must be a number or null`;
    }
  }
  return null;
}

/** Broadcast to all WebSocket clients */
function broadcastVitals(record) {
  const msg = JSON.stringify({ type: "vitals", record });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

// --- REST ---

app.post("/api/vitals", (req, res) => {
  const err = validateVitalsBody(req.body);
  if (err) {
    return res.status(400).json({ error: err });
  }

  const record = {
    device_id: String(req.body.device_id).trim(),
    timestamp: req.body.timestamp || new Date().toISOString(),
    heart_rate: req.body.heart_rate ?? null,
    spo2: req.body.spo2 ?? null,
    systolic: req.body.systolic ?? null,
    diastolic: req.body.diastolic ?? null,
    temperature: req.body.temperature ?? null,
    received_at: new Date().toISOString(),
  };

  vitalsRecords.push(record);
  while (vitalsRecords.length > MAX_STORE) vitalsRecords.shift();

  broadcastVitals(record);
  console.log("[API] POST /api/vitals", record.device_id, record.timestamp);
  res.status(201).json({ success: true, id: vitalsRecords.length });
});

app.get("/api/vitals", (req, res) => {
  const latest = vitalsRecords.slice(-100);
  res.json({ count: latest.length, records: latest });
});

app.get("/api/vitals/:device_id", (req, res) => {
  const id = decodeURIComponent(req.params.device_id);
  const filtered = vitalsRecords.filter((r) => r.device_id === id).slice(-100);
  res.json({ device_id: id, count: filtered.length, records: filtered });
});

// --- Dashboard static ---

const dashboardDir = path.join(__dirname, "..", "dashboard");
app.use(express.static(dashboardDir));

app.get("/", (req, res) => {
  const indexPath = path.join(dashboardDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("dashboard/index.html not found");
  }
});

const server = http.createServer(app);

/** Nginx orqali /hl7-vitals-ws — Django /ws/ bilan ziddiyat yo'q */
const wss = new WebSocketServer({ server, path: "/hl7-vitals-ws" });

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress || "";
  console.log("[WS] Client connected", ip);
  ws.send(
    JSON.stringify({
      type: "hello",
      message: "Connected to vitals stream",
    })
  );
  ws.on("close", () => console.log("[WS] Client disconnected", ip));
  ws.on("error", (e) => console.log("[WS] Error", e.message));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Vitals API + WebSocket on http://0.0.0.0:${PORT}`);
  console.log(`  POST /api/vitals  GET /api/vitals  GET /api/vitals/:device_id`);
  console.log(`  WebSocket: ws://0.0.0.0:${PORT}/hl7-vitals-ws`);
  console.log(`  Dashboard: http://0.0.0.0:${PORT}/`);
});
