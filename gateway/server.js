/**
 * LOCAL HL7 GATEWAY
 * - TCP :6006, 0.0.0.0, multiple connections
 * - MLLP (0x0B ... 0x1C 0x0D) + HL7 text buffering
 * - Parses MSH, PID, OBR, OBX → vitals
 * - POST JSON to cloud POST /api/vitals
 *
 * Env:
 *   VITALS_URL=http://167.71.53.238/api/vitals  (or https + port)
 *   GATEWAY_PORT=6006
 *   DEBUG=1  (set DEBUG=0 to reduce logs)
 *   NO_DATA_MS=10000
 */

"use strict";

const net = require("net");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const GATEWAY_HOST = process.env.GATEWAY_HOST || "0.0.0.0";
const GATEWAY_PORT = Number(process.env.GATEWAY_PORT || 6006);
const VITALS_URL = process.env.VITALS_URL || "http://167.71.53.238/api/vitals";
const NO_DATA_MS = Number(process.env.NO_DATA_MS || 10_000);
const DEBUG = process.env.DEBUG !== "0" && process.env.DEBUG !== "false";

const NIBP_RE = /^(\d{2,3})\s*\/\s*(\d{2,3})$/;
const NUMERIC = /^\d+(\.\d+)?$/;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function debug(msg, ...rest) {
  if (DEBUG) log(`[DEBUG] ${msg}`, ...rest);
}

/** Normalize socket remote address for device_id */
function peerDeviceId(socket) {
  let ip = socket.remoteAddress || "unknown";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return ip;
}

// --- HL7 parsing (OBX-focused, same ideas as clinical monitors) ---

function classifyObx3(obx3) {
  const blob = String(obx3 || "")
    .toLowerCase()
    .replace(/\|/g, " ");
  if (
    /чсс|чпс|пульс|heart|pulse|\bhr\b|8867|mdc.*hr|mdc.*heart/.test(blob)
  ) {
    return "hr";
  }
  if (/spo2|2708|oxygen|сатурац|mdc.*spo2/.test(blob)) return "spo2";
  if (/8310|temp|temperature/.test(blob)) return "temp";
  if (/9279|respiratory|\brr\b/.test(blob)) return "rr";
  if (/nibp|blood pressure|n_bp|\bbp\b/.test(blob)) return "nibp_combined";
  return null;
}

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
 * Parse HL7 text; returns vitals object (snake_case for API).
 */
function parseHl7Message(hl7Text) {
  const text = hl7Text.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
  const lines = text.split("\r").map((l) => l.trim()).filter(Boolean);

  /** @type {Record<string, number | undefined>} */
  const out = {};
  let msh = "";
  let obr = "";

  for (const line of lines) {
    const up = line.toUpperCase();
    if (up.startsWith("MSH|")) msh = line;
    if (up.startsWith("PID|")) {
      /* reserved for future patient id */
    }
    if (up.startsWith("OBR|")) obr = line;

    if (!up.startsWith("OBX|")) continue;
    const parts = line.split("|");
    const obx3 = parts[3] || "";
    const value = extractObxValue(parts);
    let kind = classifyObx3(obx3);

    if (!kind && value) {
      const fv = parseFloatSafe(value);
      if (fv !== null) {
        const v = Math.round(fv);
        if ((v >= 35 && v <= 220) || (v >= 70 && v <= 100)) {
          if (v >= 85 && v <= 100 && out.spo2 === undefined) kind = "spo2";
          else if (out.hr === undefined && v >= 35 && v <= 220) kind = "hr";
        }
      }
    }
    if (!kind) continue;

    if (kind === "nibp_combined") {
      const m = NIBP_RE.exec(String(value).replace(/\s/g, ""));
      if (m) {
        out.systolic = Number.parseInt(m[1], 10);
        out.diastolic = Number.parseInt(m[2], 10);
      }
      continue;
    }
    const fv = parseFloatSafe(value);
    if (fv === null) continue;
    if (kind === "hr") out.heart_rate = Math.round(fv);
    else if (kind === "spo2") out.spo2 = Math.round(fv);
    else if (kind === "temp") out.temperature = Math.round(fv * 10) / 10;
    else if (kind === "rr") out.rr = Math.round(fv);
  }

  return {
    heart_rate: out.heart_rate,
    spo2: out.spo2,
    systolic: out.systolic,
    diastolic: out.diastolic,
    temperature: out.temperature,
    rr: out.rr,
    _meta: { msh: msh.slice(0, 80), obr: obr.slice(0, 80) },
  };
}

/**
 * Extract all complete MLLP frames from buffer; return { frames, rest }.
 */
function extractMllpFrames(buf) {
  const frames = [];
  let i = 0;
  while (true) {
    const hb = buf.indexOf(0x0b, i);
    if (hb === -1) return { frames, rest: buf.subarray(i) };
    i = hb;
    const fs = buf.indexOf(0x1c, i + 1);
    if (fs === -1) return { frames, rest: buf.subarray(i) };
    frames.push(buf.subarray(i + 1, fs).toString("utf8"));
    i = fs + 1;
    if (i < buf.length && buf[i] === 0x0d) i++;
  }
}

/** Non-MLLP: messages starting with MSH| split by \r(?=MSH) */
function extractBareMshBlocks(str) {
  const s = str.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
  return s
    .split(/\r(?=MSH\|)/i)
    .map((x) => x.trim())
    .filter((x) => /^MSH\|/i.test(x));
}

function httpPostJson(urlStr, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;
    const payload = JSON.stringify(body);
    const opts = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload, "utf8"),
      },
      timeout: 30_000,
    };
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode || 0,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.write(payload);
    req.end();
  });
}

async function forwardToServer(deviceId, vitals) {
  const timestamp = new Date().toISOString();
  const payload = {
    device_id: deviceId,
    timestamp,
    heart_rate: vitals.heart_rate ?? null,
    spo2: vitals.spo2 ?? null,
    systolic: vitals.systolic ?? null,
    diastolic: vitals.diastolic ?? null,
  };
  if (vitals.temperature != null) payload.temperature = vitals.temperature;

  let attempt = 0;
  let delay = 1000;
  const maxAttempts = 8;

  while (attempt < maxAttempts) {
    try {
      const res = await httpPostJson(VITALS_URL, payload);
      if (res.status >= 200 && res.status < 300) {
        console.log("FORWARDED TO SERVER", deviceId, "HTTP", res.status);
        return;
      }
      log(`[WARN] Forward HTTP ${res.status} body=${res.body.slice(0, 200)}`);
    } catch (e) {
      log(`[WARN] Forward error: ${e.message}`);
    }
    attempt++;
    log(`[WARN] Retry ${attempt}/${maxAttempts} in ${delay}ms`);
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 30_000);
  }
  log(`[ERROR] Forward failed after ${maxAttempts} attempts for ${deviceId}`);
}

function handleConnection(socket) {
  const deviceId = peerDeviceId(socket);
  const peer = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log("CLIENT CONNECTED", deviceId, peer);

  let buf = Buffer.alloc(0);
  let noDataTimer = setTimeout(() => {
    console.log("NO DATA RECEIVED");
    debug(`NO DATA (${NO_DATA_MS}ms) peer=${peer}`);
  }, NO_DATA_MS);

  const clearNoData = () => {
    if (noDataTimer) {
      clearTimeout(noDataTimer);
      noDataTimer = null;
    }
  };

  socket.on("data", (chunk) => {
    clearNoData();
    log(`RAW TCP len=${chunk.length} from peer=${peer} hex=${chunk.toString("hex").slice(0, 128)}`);
    buf = Buffer.concat([buf, chunk]);

    const mllp = extractMllpFrames(buf);
    buf = mllp.rest;
    for (const frame of mllp.frames) {
      if (!/MSH\|/i.test(frame)) continue;
      console.log("HL7 RECEIVED");
      debug("HL7 MLLP payload preview:", frame.slice(0, 200));
      const vit = parseHl7Message(frame);
      const hasAny =
        vit.heart_rate != null ||
        vit.spo2 != null ||
        vit.systolic != null ||
        vit.diastolic != null ||
        vit.temperature != null;
      if (!hasAny) {
        log(`[INFO] HL7 parsed but no vitals (OBX empty?): ${deviceId}`);
      }
      forwardToServer(deviceId, vit).catch((e) => log("[ERROR] forward", e.message));
    }

    const tail = buf.toString("utf8");
    if (/^MSH\|/im.test(tail.trim()) || /\rMSH\|/i.test(tail)) {
      const blocks = extractBareMshBlocks(tail);
      if (blocks.length) {
        buf = Buffer.alloc(0);
        for (const block of blocks) {
          console.log("HL7 RECEIVED");
          debug("HL7 bare preview:", block.slice(0, 200));
          const vit = parseHl7Message(block);
          forwardToServer(deviceId, vit).catch((e) => log("[ERROR] forward", e.message));
        }
      }
    }
  });

  socket.on("close", (hadError) => {
    clearNoData();
    log(`TCP CLOSED peer=${peer} hadError=${hadError}`);
  });

  socket.on("error", (err) => {
    clearNoData();
    log(`TCP ERROR peer=${peer} ${err.message}`);
  });
}

const server = net.createServer(handleConnection);

server.on("error", (err) => {
  log("[FATAL] TCP server error:", err.message);
  process.exit(1);
});

server.listen(GATEWAY_PORT, GATEWAY_HOST, () => {
  log(`HL7 Gateway listening on ${GATEWAY_HOST}:${GATEWAY_PORT}`);
  log(`Forward URL: ${VITALS_URL}`);
  log(`DEBUG=${DEBUG} NO_DATA_MS=${NO_DATA_MS}`);
});
