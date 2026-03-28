/**
 * FRONTEND DEPLOY - Build va serverga joylash
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const HOST = '167.71.53.238';
const USER = 'root';
const PASS = 'Ziyrak2025Ai';
const APP_ROOT = '/opt/clinicmonitoring';

const COMMANDS = [
  // 1. Frontend build (lokal)
  `cd ${path.join(__dirname, '..', 'frontend')} && npm run build`,
  
  // 2. Serverga upload
  `scp -r ${path.join(__dirname, '..', 'frontend', 'dist', '*')} ${USER}@${HOST}:${APP_ROOT}/frontend/dist/`,
  
  // 3. Nginx config tekshirish
  `nginx -t`,
  
  // 4. Nginx reload
  `systemctl reload nginx`,
  
  // 5. Test
  `curl -sS --max-time 5 "https://clinicmonitoring.ziyrak.org/" | head -3`
];

function runSSH() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      console.log('✅ Serverga ulanish muvaffaqiyatli!\n');
      runCommands(conn, 0);
    });
    
    conn.on('error', (err) => {
      console.error('❌ Ulanish xatosi:', err.message);
      reject(err);
    });
    
    conn.connect({
      host: HOST,
      port: 22,
      username: USER,
      password: PASS
    });
    
    function runCommands(conn, index) {
      if (index >= COMMANDS.length) {
        console.log('\n🚀 HAMMA NARSA TAYYOR!');
        resolve();
        conn.end();
        return;
      }
      
      const cmd = COMMANDS[index];
      console.log(`\n[${index + 1}/${COMMANDS.length}] ${cmd}`);
      console.log('─'.repeat(80));
      
      conn.exec(cmd, (err, stream) => {
        if (err) {
          console.error('❌ Buyruq xatosi:', err);
          reject(err);
          return;
        }
        
        let output = '';
        let errorOutput = '';
        
        stream
          .on('close', (code) => {
            if (output) console.log(output);
            if (errorOutput) console.error(errorOutput);
            
            if (code !== 0 && code !== null) {
              console.error(`⚠️ Buyruq ${code} kodi bilan tugadi`);
            } else {
              console.log('✓ OK\n');
            }
            runCommands(conn, index + 1);
          })
          .on('data', (data) => {
            output += data.toString();
          })
          .stderr.on('data', (data) => {
            errorOutput += data.toString();
          });
      });
    }
  });
}

runSSH().catch(console.error);
