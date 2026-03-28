/**
 * FINAL FIX - Settings + restart
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const HOST = '167.71.53.238';
const USER = 'root';
const PASS = 'Ziyrak2025Ai';
const APP_ROOT = '/opt/clinicmonitoring';

// .env faylni yangilash
const ENV_CONTENT = `# Django Settings
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=medicentral-production-secure-key-2026-change-this
DJANGO_ALLOWED_HOSTS=clinicmonitoringapi.ziyrak.org,167.71.53.238,clinicmonitoring.ziyrak.org
DJANGO_CSRF_TRUSTED_ORIGINS=https://clinicmonitoring.ziyrak.org,https://clinicmonitoringapi.ziyrak.org,http://localhost:5173,http://127.0.0.1:5173
CORS_ALLOWED_ORIGINS=https://clinicmonitoring.ziyrak.org,http://localhost:5173,http://127.0.0.1:5173

# Database
DJANGO_SQLITE_PATH=/opt/clinicmonitoring/backend/db.sqlite3

# Security - CSRF Cookie (settings.py bilan bir xil)
SESSION_COOKIE_SECURE=true
CSRF_COOKIE_SECURE=true
SESSION_COOKIE_HTTPONLY=false
SESSION_COOKIE_SAMESITE=None
CSRF_COOKIE_HTTPONLY=false
CSRF_COOKIE_SAMESITE=None

# Django Settings Module
DJANGO_SETTINGS_MODULE=medicentral.settings
`;

const COMMANDS = [
  // 1. Backend kodni yangilash (settings.py)
  `cd ${APP_ROOT}/backend && git pull origin main`,
  
  // 2. .env ni yangilash
  `cat > ${APP_ROOT}/backend/.env << 'ENVEOF'\n${ENV_CONTENT}\nENVEOF`,
  `chmod 644 ${APP_ROOT}/backend/.env`,
  `chown www-data:www-data ${APP_ROOT}/backend/.env`,
  
  // 3. Migrations (agar bo'lsa)
  `cd ${APP_ROOT}/backend && source .venv/bin/activate && python manage.py migrate --noinput`,
  
  // 4. Static files
  `cd ${APP_ROOT}/backend && source .venv/bin/activate && python manage.py collectstatic --noinput`,
  
  // 5. Daphne restart
  'systemctl restart clinicmonitoring-daphne',
  
  // 6. Status
  'sleep 3 && systemctl status clinicmonitoring-daphne --no-pager | head -6',
  
  // 7. Session test
  'curl -sS --max-time 5 "https://clinicmonitoringapi.ziyrak.org/api/auth/session/"',
  
  // 8. Health check
  'curl -sS --max-time 5 "https://clinicmonitoringapi.ziyrak.org/api/health/"'
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
