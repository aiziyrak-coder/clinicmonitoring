/**
 * HL7 MONITOR SIMULATOR
 * Klinikaga bormay test qilish uchun
 * 
 * Ishga tushirish: node simulator.js
 */

"use strict";

const net = require("net");

// Gateway manzili (o'zingizning kompyuteringiz)
const GATEWAY_HOST = process.env.GATEWAY_HOST || "127.0.0.1";
const GATEWAY_PORT = Number(process.env.GATEWAY_PORT || 6006);

// Vitallar (real monitor qanday yuborsa, shunday)
let hr = 72;
let spo2 = 98;
let systolic = 120;
let diastolic = 80;
let temp = 36.6;
let rr = 16;

function generateHL7Message() {
  // Vitallarni biroz o'zgartirish (realistik)
  hr = Math.max(60, Math.min(100, hr + Math.floor(Math.random() * 5) - 2));
  spo2 = Math.max(95, Math.min(100, spo2 + Math.floor(Math.random() * 3) - 1));
  systolic = Math.max(110, Math.min(130, systolic + Math.floor(Math.random() * 5) - 2));
  diastolic = Math.max(70, Math.min(85, diastolic + Math.floor(Math.random() * 5) - 2));
  
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const msgId = Date.now().toString().slice(-8);
  
  // HL7 ORU^R01 xabari
  const msh = `MSH|^~\\&|Monitor|Bedside|Gateway|MediCentral|${timestamp}||ORU^R01^ORU_R01|${msgId}|P|2.3`;
  const pid = `PID|1||P001||Test^Patient^^^Mr.||19800101|M|||Room 101^^Bed 1`;
  const obr = `OBR|1|${msgId}|${msgId}|Vitals^Monitor|||${timestamp}`;
  
  // OBX segmentlar (vital ko'rsatkichlar)
  // Format: OBX|setId|type|code^name^system||value|unit|... 
  // Qiymat faqat OBX-5 maydonida (6-element, 0-indeksli)
  const obx1 = `OBX|1|NM|8867-4^Heart Rate^LN||${hr}|/min`;
  const obx2 = `OBX|2|NM|2708-6^SpO2^LN||${spo2}|%`;
  const obx3 = `OBX|3|NM|8480-6^Systolic BP^LN||${systolic}|mmHg`;
  const obx4 = `OBX|4|NM|8462-4^Diastolic BP^LN||${diastolic}|mmHg`;
  const obx5 = `OBX|5|NM|8310-5^Temperature^LN||${temp}|C`;
  const obx6 = `OBX|6|NM|9279-1^Respiratory Rate^LN||${rr}|/min`;
  
  // MLLP formatida (0x0B ... 0x1C 0x0D)
  const hl7 = [msh, pid, obr, obx1, obx2, obx3, obx4, obx5, obx6].join("\r");
  const mllp = Buffer.concat([
    Buffer.from([0x0b]),
    Buffer.from(hl7, "utf8"),
    Buffer.from([0x1c, 0x0d])
  ]);
  
  return mllp;
}

function connectAndSend() {
  console.log(`[SIMULATOR] Gateway ga ulanish: ${GATEWAY_HOST}:${GATEWAY_PORT}`);
  
  const client = net.createConnection({ host: GATEWAY_HOST, port: GATEWAY_PORT }, () => {
    console.log("[SIMULATOR] Ulandi! Ma'lumot yuborilmoqda...");
    console.log("[SIMULATOR] Ctrl+C bilan to'xtating");
    
    // TCP sozlamalari - real vaqt uchun
    client.setKeepAlive(true, 30000);
    client.setNoDelay(true);
    
    let messageCount = 0;
    
    // Har 2 soniyada yuborish (real vaqt rejimi)
    const interval = setInterval(() => {
      const msg = generateHL7Message();
      client.write(msg);
      messageCount++;
      console.log(`[SENT #${messageCount}] HR:${hr} SpO2:${spo2}% BP:${systolic}/${diastolic} T:${temp} RR:${rr}`);
    }, 2000);
    
    client.on("close", () => {
      clearInterval(interval);
      console.log(`[SIMULATOR] Ulanish yopildi (yuborilgan: ${messageCount})`);
      // Darhol qayta ulanish
      setTimeout(connectAndSend, 1000);
    });
    
    client.on("error", (err) => {
      clearInterval(interval);
      console.error(`[SIMULATOR] Xato: ${err.message}`);
      client.destroy();
      // Tez qayta ulanish
      setTimeout(connectAndSend, 2000);
    });
  });
  
  client.on("error", (err) => {
    console.error(`[SIMULATOR] Ulanish xatosi: ${err.message}`);
    console.log("[SIMULATOR] 2 soniyadan keyin qayta urinib ko'riladi...");
    setTimeout(connectAndSend, 2000);
  });
}

console.log("========================================");
console.log("   HL7 MONITOR SIMULATOR");
console.log("========================================");
console.log(`Target: ${GATEWAY_HOST}:${GATEWAY_PORT}`);
console.log("");

connectAndSend();
