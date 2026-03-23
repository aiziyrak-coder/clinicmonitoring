/**
 * HL7/MLLP TCP server — medical devices → JSON → MediCentral POST /api/hl7
 *
 * Env:
 *   HL7_TCP_PORT=6006
 *   HL7_HTTP_URL=http://127.0.0.1:8012/api/hl7  (or https://clinicmonitoringapi.ziyrak.org/api/hl7)
 *   HL7_DEVICE_IP=192.168.0.228   — MonitorDevice.ip_address in DB
 *   HL7_BRIDGE_TOKEN=...            — must match backend HL7_BRIDGE_TOKEN
 *   HL7_NO_DATA_MS=10000
 *   HL7_HTTP_RETRY_MAX=8
 *
 * Same host as Django: set HL7_LISTEN_ENABLED=false or use another port.
 */

"use strict";

const net = require("net");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const PORT = Number(process.env.HL7_TCP_PORT || 6006);
const HTTP_URL = process.env.HL7_HTTP_URL || "http://127.0.0.1:8012/api/hl7";
const DEVICE_IP = (process.env.HL7_DEVICE_IP || "192.168.0.228").trim();
const BRIDGE_TOKEN = (process.env.HL7_BRIDGE_TOKEN || "").trim();
const NO_DATA_MS = Number(process.env.HL7_NO_DATA_MS || 10_000);
const RETRY_MAX = Number(process.env.HL7_HTTP_RETRY_MAX || 8);

const NIBP_RE = /^(\d{2,3})\s*\/\s*(\d{2,3})$/;
const NUMERIC = /^\d+(\.\d+)?$/;

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

function logErr(...a) {
  console.error(new Date().toISOString(), "[ERROR]", ...a);
}

/** @param {string} obx3 */
function classifyObx3(obx3) {
  const blob = String(obx3 || "")
    .toLowerCase()
    .replace(/\|/g, " ");
  if (
    /чсс|чпс|пульс|пульсокс|сердеч|chss|chps|css/.test(blob) ||
    /\b(8867|heart|pulse|hr)\b/.test(blob) ||
    blob.includes("mdc") && /hr|heart|ecg/.test(blob)
  ) {
    return "hr";
  }
  if (
    /спо2|spo2|сатурац|кислород|насыщ|2708/.test(blob) ||
    /\boxygen\b/.test(blob) ||
    (blob.includes("mdc") && /spo2|pulse ox/.test(blob))
  ) {
    return "spo2";
  }
  if (/\b(8310|temp|temperature|body temperature)\b/.test(blob)) return "temp";
  if (/\b(9279|resp|rr)\b/.test(blob)) return "rr";
  if (/\b(nibp|blood pressure|n_bp|^bp$)\b/.test(blob)) return "nibp_combined";
  return null;
}

/** @param {string[]} parts */
function extractObxValue(parts) {
  for (let i = 5; i < Math.min(parts.length, 25); i++) {
    const raw = (parts[i] || "").trim();
    if (!raw) continue;
    const first = raw.split("^")[0].trim();
    if (NIBP_RE.test(first.replace(/\s/g, ""))) return first;
    if (NUMERIC.test(first.replace(",", "."))) return first;
    if (/\d{2,3}\s*\/\s*\d{2,3}/.test(first)) return first;
  }
  return (parts[5] || "").trim();
}

function parseFloatSafe(s) {
  const t = String(s || "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} hl7Text
 * @returns {{ hr?: number, spo2?: number, nibpSys?: number, nibpDia?: number, rr?: number, temp?: number, msh?: string, pid?: string }}
 */
function parseHl7Vitals(hl7Text) {
  const text = hl7Text.replace(/\n/g, "\r");
  const lines = text.split("\r").map((l) => l.trim()).filter(Boolean);
  /** @type {Record<string, number | undefined>} */
  const out = {};
  let msh = "";
  let pid = "";

  for (const line of lines) {
    const up = line.toUpperCase();
    if (up.startsWith("MSH|")) msh = line;
    if (up.startsWith("PID|")) {
      const p = line.split("|");
      pid = (p[3] || "").split("^")[0] || "";
    }
    if (!up.startsWith("OBX|")) continue;
    const parts = line.split("|");
    const obx3 = parts[3] || "";
    const value = extractObxValue(parts);
    let kind = classifyObx3(obx3);

    if (!kind && value) {
      const vs = value.trim();
      const fv = parseFloatSafe(vs);
      if (fv !== null) {
        const v = Math.round(fv);
        if ((v >= 35 && v <= 69) || (v >= 101 && v <= 220)) kind = "hr";
        else if (v >= 85 && v <= 100 && out.spo2 === undefined) kind = "spo2";
        else if (v >= 70 && v <= 84 && out.hr === undefined) kind = "hr";
        else if (v >= 70 && v <= 100 && out.spo2 === undefined) kind = "spo2";
        else if (v >= 35 && v <= 220 && out.hr === undefined) kind = "hr";
      }
    }
    if (!kind) continue;

    if (kind === "nibp_combined") {
      const m = NIBP_RE.exec(String(value).replace(/\s/g, ""));
      if (m) {
        out.nibpSys = Number.parseInt(m[1], 10);
        out.nibpDia = Number.parseInt(m[2], 10);
      }
      continue;
    }
    const fv = parseFloatSafe(value);
    if (fv === null) continue;
    if (kind === "hr") out.hr = Math.round(fv);
    else if (kind === "spo2") out.spo2 = Math.round(fv);
    else if (kind === "temp") out.temp = Math.round(fv * 10) / 10;
    else if (kind === "rr") out.rr = Math.round(fv);
  }

  return {
    ...out,
    msh: msh || undefined,
    pid: pid || undefined,
  };
}

/**
 * MLLP: 0x0B ... 0x1C [0x0D]
 * @param {Buffer} buf
 * @returns {{ frames: string[], rest: Buffer }}
 */
function extractAllMllpFrames(buf) {
  const frames = [];
  let i = 0;
  while (true) {
    const hb = buf.indexOf(0x0b, i);
    if (hb === -1) {
      return { frames, rest: buf.subarray(i) };
    }
    i = hb;
    const fs = buf.indexOf(0x1c, i + 1);
    if (fs === -1) {
      return { frames, rest: buf.subarray(i) };
    }
    frames.push(buf.subarray(i + 1, fs).toString("utf8"));
    i = fs + 1;
    if (i < buf.length && buf[i] === 0x0d) i++;
  }
}

/**
 * @param {string} bufferStr
 * @returns {string[]}
 */
function extractBareMshMessages(bufferStr) {
  const s = bufferStr.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
  const parts = s.split(/\r(?=MSH\|)/i).map((x) => x.trim()).filter(Boolean);
  return parts.filter((p) => /^MSH\|/i.test(p));
}

/**
 * @param {http.RequestOptions} opts
 * @param {string} body
 */
function httpRequest(opts, body) {
  return new Promise((resolve, reject) => {
    const lib = opts.protocol === "https:" ? https : http;
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const txt = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode || 0, body: txt });
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function postVitalsToApi(payload) {
  const url = new URL(HTTP_URL);
  /** @type {http.RequestOptions} */
  const opts = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === "https:" ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(BRIDGE_TOKEN ? { "X-HL7-Bridge-Token": BRIDGE_TOKEN } : {}),
    },
    timeout: 30_000,
  };
  const body = JSON.stringify(payload);
  let delay = 1000;
  for (let attempt = 0; attempt < RETRY_MAX; attempt++) {
    try {
      const res = await httpRequest(opts, body);
      if (res.status >= 200 && res.status < 300) {
        log("HTTP POST ok", res.status, payload.deviceIp);
        return;
      }
      logErr("HTTP POST failed", res.status, res.body.slice(0, 200));
    } catch (e) {
      logErr("HTTP POST error", e.message || e);
    }
    log(`HTTP retry in ${delay}ms (${attempt + 1}/${RETRY_MAX})`);
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 30_000);
  }
  logErr("HTTP POST abandoned after retries");
}

function processHl7Text(hl7Text, peerLabel) {
  if (!/MSH\|/i.test(hl7Text)) {
    logErr(peerLabel, "No MSH segment in message");
    return;
  }
  const vit = parseHl7Vitals(hl7Text);
  const keys = ["hr", "spo2", "nibpSys", "nibpDia", "rr", "temp"];
  const has = keys.some((k) => vit[k] !== undefined);
  if (!has) {
    log(peerLabel, "MSH ok but no vitals parsed from OBX");
    return;
  }
  /** @type {Record<string, unknown>} */
  const payload = { deviceIp: DEVICE_IP };
  for (const k of keys) {
    if (vit[k] !== undefined) payload[k] = vit[k];
  }
  log("parsed vitals", peerLabel, payload, "pid=", vit.pid || "—");
  postVitalsToApi(payload).catch((e) => logErr("postVitalsToApi", e));
}

function handleConnection(socket) {
  const peer = `${socket.remoteAddress}:${socket.remotePort}`;
  log("TCP connected", peer);

  let buf = Buffer.alloc(0);
  let noDataTimer = setTimeout(() => {
    console.log("NO DATA RECEIVED");
  }, NO_DATA_MS);

  const clearNoData = () => {
    if (noDataTimer) {
      clearTimeout(noDataTimer);
      noDataTimer = null;
    }
  };

  socket.on("data", (chunk) => {
    clearNoData();
    log("RAW bytes", peer, "len=", chunk.length, chunk.toString("hex").slice(0, 200));
    buf = Buffer.concat([buf, chunk]);

    const mllp = extractAllMllpFrames(buf);
    buf = mllp.rest;
    for (const frame of mllp.frames) {
      log("MLLP frame", peer, frame.slice(0, 200));
      processHl7Text(frame, peer);
    }

    const tail = buf.toString("utf8");
    if (/^MSH\|/im.test(tail.trim()) || /\rMSH\|/i.test(tail)) {
      const msgs = extractBareMshMessages(tail);
      if (msgs.length) {
        buf = Buffer.alloc(0);
        for (const m of msgs) {
          log("Bare HL7", peer, m.slice(0, 200));
          processHl7Text(m, peer);
        }
      }
    }
  });

  socket.on("close", () => {
    clearNoData();
    log("TCP closed", peer);
  });
  socket.on("error", (err) => {
    clearNoData();
    logErr("TCP socket error", peer, err.message);
  });
}

const server = net.createServer(handleConnection);

server.on("error", (err) => {
  logErr("TCP server error", err.message);
  process.exit(1);
});

server.listen(PORT, "0.0.0.0", () => {
  log(`HL7 TCP listening on 0.0.0.0:${PORT}`);
  log(`POST target: ${HTTP_URL} deviceIp=${DEVICE_IP}`);
});
