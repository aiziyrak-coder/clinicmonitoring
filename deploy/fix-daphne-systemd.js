/**
 * DAPHNE FIX - Systemd service va .env to'g'rilash
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const HOST = '167.71.53.238';
const USER = 'root';
const PASS = 'Ziyrak2025Ai';
const APP_ROOT = '/opt/clinicmonitoring';

// .env faylni o'qish
const ENV_PATH = path.join(__dirname, '..', 'backend', '.env.production');
const ENV_CONTENT = fs.readFileSync(ENV_PATH, 'utf8');

const COMMANDS = [
  // 1. .env faylni to'g'ri joyga ko'chirish
  `cat > ${APP_ROOT}/backend/.env << 'ENVEOF'\n${ENV_CONTENT}\nENVEOF`,
  `chmod 600 ${APP_ROOT}/backend/.env`,
  
  // 2. DJANGO_SETTINGS_MODULE qo'shish
  `echo "DJANGO_SETTINGS_MODULE=medicentral.settings" >> ${APP_ROOT}/backend/.env`,
  
  // 3. Systemd service file ni yangilash
  `cat > /etc/systemd/system/clinicmonitoring-daphne.service << 'SVCEOF'\n[Unit]\nDescription=ClinicMonitoring Daphne (Django ASGI + Channels + HL7)\nAfter=network.target\n\n[Service]\nType=simple\nUser=www-data\nGroup=www-data\nWorkingDirectory=${APP_ROOT}/backend\nEnvironment="PATH=${APP_ROOT}/backend/.venv/bin"\nEnvironmentFile=${APP_ROOT}/backend/.env\nExecStart=${APP_ROOT}/backend/.venv/bin/daphne -b 127.0.0.1 -p 8012 medicentral.asgi:application\nRestart=always\nRestartSec=3\nStandardOutput=journal\nStandardError=journal\nSyslogIdentifier=daphne\n\n[Install]\nWantedBy=multi-user.target\nSVCEOF`,
  
  // 4. Service ni reload va start
  'systemctl daemon-reload',
  'systemctl stop clinicmonitoring-daphne || true',
  'sleep 2',
  'systemctl start clinicmonitoring-daphne',
  
  // 5. Statusni tekshirish
  'sleep 3 && systemctl status clinicmonitoring-daphne --no-pager -l',
  
  // 6. API ni tekshirish
  'curl -sS --max-time 5 "https://clinicmonitoringapi.ziyrak.org/api/health/" | head -10',
  
  // 7. Nginx reload
  'nginx -t && systemctl reload nginx'
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
      const shortCmd = cmd.length > 70 ? cmd.substring(0, 70) + '...' : cmd;
      console.log(`\n[${index + 1}/${COMMANDS.length}] ${shortCmd}`);
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
