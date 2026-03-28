/**
 * SSH DEPLOY - Serverga yangilash + .env production
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const HOST = '167.71.53.238';
const USER = 'root';
const PASS = 'Ziyrak2025Ai';
const APP_ROOT = '/opt/clinicmonitoring';

// .env.production faylni o'qish
const ENV_PATH = path.join(__dirname, '..', 'backend', '.env.production');
const ENV_CONTENT = fs.readFileSync(ENV_PATH, 'utf8');

const COMMANDS = [
  `cd ${APP_ROOT} && git fetch origin`,
  `cd ${APP_ROOT} && git reset --hard origin/main`,
  // .env faylni ko'chirish
  `mkdir -p ${APP_ROOT}/backend`,
  `cat > ${APP_ROOT}/backend/.env << 'ENVEOF'\n${ENV_CONTENT}\nENVEOF`,
  `chmod 600 ${APP_ROOT}/backend/.env`,
  // Dependencies va migrations
  `cd ${APP_ROOT}/backend && . .venv/bin/activate && pip install -q -r requirements.txt`,
  `cd ${APP_ROOT}/backend && . .venv/bin/activate && python manage.py migrate --noinput`,
  // Test faylni yuklash
  `mkdir -p ${APP_ROOT}/deploy`,
  `cat > ${APP_ROOT}/deploy/full_test.py << 'PYEOF'\n${fs.readFileSync(path.join(__dirname, 'full_test.py'), 'utf8')}\nPYEOF`,
  // Bemorlar va test
  `cd ${APP_ROOT}/backend && . .venv/bin/activate && python ${APP_ROOT}/deploy/full_test.py`,
  // Frontend build
  `cd ${APP_ROOT}/frontend && npm ci --no-audit --no-fund && npm run build`,
  // Static files
  `mkdir -p /var/www/clinicmonitoring/frontend/dist`,
  `rsync -a --delete ${APP_ROOT}/frontend/dist/ /var/www/clinicmonitoring/frontend/dist/`,
  `chown -R www-data:www-data /var/www/clinicmonitoring/frontend/dist`,
  // Services restart
  `systemctl daemon-reload`,
  `systemctl restart clinicmonitoring-daphne`,
  `systemctl restart clinicmonitoring-hl7-gateway || true`,
  `systemctl restart clinicmonitoring-vitals-api || true`,
  `nginx -t && systemctl reload nginx`,
  // Health check
  `systemctl status clinicmonitoring-daphne --no-pager | head -5`,
  `curl -sS "https://clinicmonitoringapi.ziyrak.org/api/health/" || echo "API check failed"`
];

function runSSH() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    
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
        console.log('\n🚀 HAMMA BUYRUQLAR MUVAFFAQIYATLI!');
        console.log('🎉 DEPLOY TUGADI!');
        resolve(output);
        conn.end();
        return;
      }
      
      const cmd = COMMANDS[index];
      const shortCmd = cmd.length > 60 ? cmd.substring(0, 60) + '...' : cmd;
      console.log(`[${index + 1}/${COMMANDS.length}] ${shortCmd}`);
      
      conn.exec(cmd, (err, stream) => {
        if (err) {
          console.error('❌ Buyruq xatosi:', err);
          reject(err);
          return;
        }
        
        stream
          .on('close', (code) => {
            if (code !== 0) {
              console.error(`❌ Buyruq ${code} kodi bilan tugadi`);
              reject(new Error(`Command failed with code ${code}`));
            } else {
              console.log('✓ OK\n');
              runCommands(conn, index + 1);
            }
          })
          .on('data', (data) => {
            output += data.toString();
            process.stdout.write(data.toString());
          })
          .stderr.on('data', (data) => {
            process.stderr.write(data.toString());
          });
      });
    }
  });
}

runSSH().catch(console.error);
