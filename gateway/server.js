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
 *   GATEWAY_TOKEN=your_secret_token
 */

"use strict";

const net = require("net");
const http = require("http");
const https = require("https");
const { URL } = require("url");

// ============================================
// SOZLAMALAR
// ============================================

const GATEWAY_HOST = process.env.GATEWAY_HOST || "0.0.0.0";
const GATEWAY_PORT = Number(process.env.GATEWAY_PORT || 6006);
const VITALS_URL = process.env.VITALS_URL || "";
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || "";
const NO_DATA_MS = Number(process.env.NO_DATA_MS || 15_000);
const DEBUG = process.env.DEBUG !== "0" && process.env.DEBUG !== "false";
const RETRY_MAX_ATTEMPTS = Number(process.env.RETRY_MAX_ATTEMPTS || 10);
const RETRY_INITIAL_DELAY_MS = Number(process.env.RETRY_INITIAL_DELAY_MS || 1000);
const HL7_RECV_TIMEOUT_MS = Number(process.env.HL7_RECV_TIMEOUT_MS || 5000);

// Sozlamalarni tekshirish
if (!VITALS_URL) {
  console.error("[FATAL] VITALS_URL sozlanmagan! Muhit o'zgaruvchisini tekshiring.");
  console.error("Misol: VITALS_URL=http://192.168.1.10:8000/api/vitals/");
  process.exit(1);
}

console.log("[INFO] ==========================================");
console.log("[INFO] HL7 Gateway ishga tushmoqda...");
console.log(`[INFO] TCP Port: ${GATEWAY_HOST}:${GATEWAY_PORT}`);
console.log(`[INFO] Backend URL: ${VITALS_URL}`);
console.log(`[INFO] Debug mode: ${DEBUG}`);
console.log(`[INFO] No-data timeout: ${NO_DATA_MS}ms`);
console.log("[INFO] ==========================================");

// ============================================
// YORDAMCHI FUNKSIYALAR
// ============================================

const NIBP_RE = /^(\d{2,3})\s*\/\s*(\d{2,3})$/;
const NUMERIC = /^\d+(\.\d+)?$/;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function debug(msg, ...rest) {
  if (DEBUG) log(`[DEBUG] ${msg}`, ...rest);
}

function error(msg, ...rest) {
  console.error(new Date().toISOString(), `[ERROR] ${msg}`, ...rest);
}

function warn(msg, ...rest) {
  console.warn(new Date().toISOString(), `[WARN] ${msg}`, ...rest);
}

/** Normalize socket remote address for device_id */
function peerDeviceId(socket) {
  let ip = socket.remoteAddress || "unknown";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return ip;
}

/** Xatolikni log qilish */
function logError(context, err, extra = {}) {
  error(`${context}: ${err.message}`, extra);
  if (DEBUG && err.stack) {
    debug(`Stack: ${err.stack}`);
  }
}

// ============================================
// HL7 PARSING
// ============================================

function classifyObx3(obx3) {
  const blob = String(obx3 || "")
    .toLowerCase()
    .replace(/\|/g, " ");
  
  if (
    /чсс|чпс|пульс|heart|pulse|\bhr\b|pulse rate|8867|mdc.*hr|mdc.*heart|ecg.*rate/.test(blob)
  ) {
    return "hr";
  }
  if (/spo2|2708|oxygen|сатурац|sao2|o2 sat|mdc.*spo2|pulse.*ox/.test(blob)) return "spo2";
  if (/8310|temp|temperature|body temp|t1|t2|tblood|mdc.*temp/.test(blob)) return "temp";
  if (/9279|respiratory|\brr\b|resp rate|br|breath|mdc.*resp/.test(blob)) return "rr";
  if (/nibp|blood pressure|n_bp|\bbp\b|pressure|sys|dia|map|mdc.*bp|mdc.*pressure/.test(blob)) return "nibp_combined";
  return null;
}

function extractObxValue(parts) {
  for (let i = 5; i < Math.min(parts.length, 30); i++) {
    const raw = (parts[i] || "").trim();
    if (!raw) continue;
    const first = raw.split("^")[0].trim();
    if (NIBP_RE.test(first.replace(/\s/g, ""))) return first;
    if (NUMERIC.test(first.replace(",", "."))) return first;
    if (/\d{2,3}\s*\/\s*\d{2,3}/.test(first)) return first;
    if (raw.includes("^")) {
      const components = raw.split("^");
      for (const comp of components) {
        const c = comp.trim();
        if (NUMERIC.test(c.replace(",", "."))) return c;
      }
    }
  }
  return (parts[5] || "").trim();
}

function parseFloatSafe(s) {
  const t = String(s || "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function parseHl7Message(hl7Text) {
  const text = hl7Text.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
  const lines = text.split("\r").map((l) => l.trim()).filter(Boolean);

  const out = {};
  let msh = "";
  let obr = "";
  let obxCount = 0;

  for (const line of lines) {
    const up = line.toUpperCase();
    if (up.startsWith("MSH|")) msh = line;
    if (up.startsWith("PID|")) {
      // reserved
    }
    if (up.startsWith("OBR|")) obr = line;

    if (!up.startsWith("OBX|")) continue;
    
    obxCount++;
    const parts = line.split("|");
    const obx3 = parts[3] || "";
    const value = extractObxValue(parts);
    let kind = classifyObx3(obx3);

    if (!kind && value) {
      const fv = parseFloatSafe(value);
      if (fv !== null) {
        const v = Math.round(fv);
        if (v >= 85 && v <= 100 && out.spo2 === undefined) {
          kind = "spo2";
        }
        else if (v >= 35 && v <= 220 && out.heart_rate === undefined) {
          kind = "hr";
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

  debug(`Parsed ${obxCount} OBX segments, vitals:`, {
    hr: out.heart_rate,
    spo2: out.spo2,
    sys: out.systolic,
    dia: out.diastolic
  });

  return {
    heart_rate: out.heart_rate,
    spo2: out.spo2,
    systolic: out.systolic,
    diastolic: out.diastolic,
    temperature: out.temperature,
    rr: out.rr,
    _meta: { msh: msh.slice(0, 80), obr: obr.slice(0, 80), obxCount },
  };
}

// ============================================
// MLLP FRAME HANDLING
// ============================================

function extractMllpFrames(buf) {
  const frames = [];
  let i = 0;
  while (true) {
    const hb = buf.indexOf(0x0b, i);
    if (hb === -1) return { frames, rest: buf.subarray(i) };
    i = hb;
    const fs = buf.indexOf(0x1c, i + 1);
    if (fs === -1) return { frames, rest: buf.subarray(i) };
    
    const endPos = fs + 1;
    if (endPos < buf.length && buf[endPos] === 0x0d) {
      frames.push(buf.subarray(i + 1, fs).toString("utf8"));
      i = endPos + 1;
    } else if (endPos < buf.length && buf[endPos] === 0x0a) {
      frames.push(buf.subarray(i + 1, fs).toString("utf8"));
      i = endPos + 1;
    } else {
      return { frames, rest: buf.subarray(i) };
    }
  }
}

function extractBareMshBlocks(str) {
  const s = str.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
  return s
    .split(/\r(?=MSH\|)/i)
    .map((x) => x.trim())
    .filter((x) => /^MSH\|/i.test(x));
}

// ============================================
// HTTP CLIENT
// ============================================

function httpPostJson(urlStr, body, timeoutMs = 30000) {
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
      timeout: timeoutMs,
    };
    
    if (GATEWAY_TOKEN) {
      opts.headers["X-Gateway-Token"] = GATEWAY_TOKEN;
    }
    
    debug(`HTTP POST to ${urlStr}, payload:`, body);
    
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        debug(`HTTP Response ${res.statusCode}:`, responseBody.slice(0, 500));
        resolve({
          status: res.statusCode || 0,
          body: responseBody,
        });
      });
    });
    
    req.on("error", (err) => {
      reject(new Error(`HTTP request failed: ${err.message}`));
    });
    
    req.on("timeout", () => {
      req.destroy(new Error("HTTP request timeout"));
    });
    
    req.write(payload);
    req.end();
  });
}

// ============================================
// VITALS FORWARDING
// ============================================

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
  if (vitals.rr != null) payload.rr = vitals.rr;

  let attempt = 0;
  let delay = RETRY_INITIAL_DELAY_MS;

  while (attempt < RETRY_MAX_ATTEMPTS) {
    attempt++;
    
    try {
      const res = await httpPostJson(VITALS_URL, payload);
      
      if (res.status >= 200 && res.status < 300) {
        log(`[SUCCESS] Vitals forwarded: ${deviceId} (HTTP ${res.status})`);
        
        try {
          const responseData = JSON.parse(res.body);
          if (responseData.success) {
            debug(`Backend response:`, responseData);
          } else if (responseData.error) {
            warn(`Backend returned error: ${responseData.error}`);
            if (responseData.hint) {
              warn(`Hint: ${responseData.hint}`);
            }
          }
        } catch (e) {
          // JSON emas
        }
        
        return { success: true, attempt };
      }
      
      if (res.status === 404) {
        warn(`Device not found in backend: ${deviceId}`);
        warn(`Response: ${res.body.slice(0, 200)}`);
        delay = 2000;
      }
      else if (res.status === 400) {
        warn(`Bad request to backend: ${res.body.slice(0, 200)}`);
        return { success: false, error: "Bad request", status: res.status };
      }
      else if (res.status === 401) {
        error(`Authentication failed - check GATEWAY_TOKEN`);
        return { success: false, error: "Authentication failed", status: res.status };
      }
      else {
        warn(`HTTP ${res.status}: ${res.body.slice(0, 200)}`);
      }
      
    } catch (e) {
      logError(`Forward attempt ${attempt} failed`, e);
    }
    
    if (attempt < RETRY_MAX_ATTEMPTS) {
      warn(`[RETRY] Attempt ${attempt}/${RETRY_MAX_ATTEMPTS} failed, retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.5, 30000);
    }
  }
  
  error(`[FAILED] Forward failed after ${RETRY_MAX_ATTEMPTS} attempts for ${deviceId}`);
  return { success: false, error: "Max retries exceeded" };
}

// ============================================
// TCP CONNECTION HANDLER
// ============================================

function handleConnection(socket) {
  const deviceId = peerDeviceId(socket);
  const peer = `${socket.remoteAddress}:${socket.remotePort}`;
  log(`[CONNECT] Client connected: ${deviceId} (${peer})`);

  let buf = Buffer.alloc(0);
  let noDataTimer = setTimeout(() => {
    warn(`[TIMEOUT] No data received from ${deviceId} within ${NO_DATA_MS}ms`);
    socket.end();
  }, NO_DATA_MS);

  const clearNoData = () => {
    if (noDataTimer) {
      clearTimeout(noDataTimer);
      noDataTimer = null;
    }
  };

  socket.setKeepAlive(true, 60000);
  socket.setNoDelay(true);

  socket.on("data", (chunk) => {
    clearNoData();
    
    debug(`RAW TCP from ${deviceId}: len=${chunk.length}, hex=${chunk.toString("hex").slice(0, 128)}`);
    
    buf = Buffer.concat([buf, chunk]);

    const mllp = extractMllpFrames(buf);
    buf = mllp.rest;
    
    for (const frame of mllp.frames) {
      if (!/MSH\|/i.test(frame)) {
        debug(`Skipping non-MSH frame from ${deviceId}`);
        continue;
      }
      
      log(`[HL7-MLLP] Message received from ${deviceId}`);
      debug(`HL7 content preview:`, frame.slice(0, 300));
      
      try {
        const vit = parseHl7Message(frame);
        const hasAny =
          vit.heart_rate != null ||
          vit.spo2 != null ||
          vit.systolic != null ||
          vit.diastolic != null ||
          vit.temperature != null ||
          vit.rr != null;
          
        if (!hasAny) {
          warn(`[PARSE] HL7 parsed but no vitals found from ${deviceId}`);
          debug(`Full frame:`, frame);
        } else {
          log(`[PARSE] Vitals extracted: HR=${vit.heart_rate}, SpO2=${vit.spo2}, BP=${vit.systolic}/${vit.diastolic}`);
          forwardToServer(deviceId, vit).catch((e) => logError("Forward failed", e));
        }
      } catch (e) {
        logError(`Parse error from ${deviceId}`, e);
      }
    }

    const tail = buf.toString("utf8");
    if (/^MSH\|/im.test(tail.trim()) || /\rMSH\|/i.test(tail)) {
      const blocks = extractBareMshBlocks(tail);
      if (blocks.length) {
        buf = Buffer.alloc(0);
        for (const block of blocks) {
          log(`[HL7-BARE] Message received from ${deviceId}`);
          debug(`HL7 bare preview:`, block.slice(0, 300));
          
          try {
            const vit = parseHl7Message(block);
            forwardToServer(deviceId, vit).catch((e) => logError("Forward failed", e));
          } catch (e) {
            logError(`Parse error from ${deviceId}`, e);
          }
        }
      }
    }
    
    if (buf.length > 10 * 1024 * 1024) {
      warn(`[BUFFER] Buffer too large (${buf.length} bytes), clearing`);
      buf = Buffer.alloc(0);
    }
  });

  socket.on("close", (hadError) => {
    clearNoData();
    if (hadError) {
      warn(`[DISCONNECT] ${deviceId} closed with error`);
    } else {
      log(`[DISCONNECT] ${deviceId} closed normally`);
    }
  });

  socket.on("error", (err) => {
    clearNoData();
    logError(`Socket error for ${deviceId}`, err);
  });

  socket.on("timeout", () => {
    warn(`[TIMEOUT] Socket timeout for ${deviceId}`);
    socket.end();
  });
  
  socket.setTimeout(HL7_RECV_TIMEOUT_MS);
}

// ============================================
// SERVER START
// ============================================

const server = net.createServer(handleConnection);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    error(`[FATAL] Port ${GATEWAY_PORT} is already in use!`);
    error(`Another gateway or HL7 server may be running.`);
  } else {
    error(`[FATAL] TCP server error:`, err);
  }
  process.exit(1);
});

server.listen(GATEWAY_PORT, GATEWAY_HOST, () => {
  log(`[STARTED] HL7 Gateway listening on ${GATEWAY_HOST}:${GATEWAY_PORT}`);
  log(`[STARTED] Forward URL: ${VITALS_URL}`);
  log(`[STARTED] DEBUG=${DEBUG} NO_DATA_MS=${NO_DATA_MS}`);
  log(`[STARTED] RETRY_MAX_ATTEMPTS=${RETRY_MAX_ATTEMPTS}`);
});

process.on("SIGINT", () => {
  log("[SHUTDOWN] SIGINT received, closing server...");
  server.close(() => {
    log("[SHUTDOWN] Server closed");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  log("[SHUTDOWN] SIGTERM received, closing server...");
  server.close(() => {
    log("[SHUTDOWN] Server closed");
    process.exit(0);
  });
});

process.on("uncaughtException", (err) => {
  error("[FATAL] Uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  error("[FATAL] Unhandled rejection at:", promise, "reason:", reason);
  process.exit(1);
});
