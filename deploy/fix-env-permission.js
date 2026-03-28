/**
 * FIX .ENV PERMISSION - www-data user uchun
 */
const { Client } = require('ssh2');

const HOST = '167.71.53.238';
const USER = 'root';
const PASS = 'Ziyrak2025Ai';

const COMMANDS = [
  // 1. .env fayl egasini o'zgartirish
  'chown www-data:www-data /opt/clinicmonitoring/backend/.env',
  
  // 2. Ruxsatni berish
  'chmod 644 /opt/clinicmonitoring/backend/.env',
  
  // 3. Tekshirish
  'ls -la /opt/clinicmonitoring/backend/.env',
  
  // 4. Daphne ni restart
  'systemctl restart clinicmonitoring-daphne',
  
  // 5. Status
  'sleep 3 && systemctl status clinicmonitoring-daphne --no-pager -l',
  
  // 6. API test
  'curl -sS --max-time 5 "https://clinicmonitoringapi.ziyrak.org/api/health/" | head -5'
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
      console.log(`[${index + 1}/${COMMANDS.length}] ${cmd}`);
      
      conn.exec(cmd, (err, stream) => {
        if (err) {
          console.error('❌ Buyruq xatosi:', err);
          reject(err);
          return;
        }
        
        let output = '';
        
        stream
          .on('close', (code) => {
            if (output) console.log(output);
            
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
            output += data.toString();
          });
      });
    }
  });
}

runSSH().catch(console.error);
