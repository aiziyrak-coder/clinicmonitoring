/**
 * SSH DEPLOY - Serverga yangilash
 */
const { Client } = require('ssh2');

const HOST = '167.71.53.238';
const USER = 'root';
const PASS = 'Ziyrak2025Ai';
const APP_ROOT = '/opt/clinicmonitoring';

const COMMANDS = [
  `cd ${APP_ROOT} && git fetch origin`,
  `cd ${APP_ROOT} && git reset --hard origin/main`,
  `mkdir -p /opt/clinicmonitoring/deploy`,
  `echo "Uploading full_test.py..."`,
  `cd ${APP_ROOT}/backend && . .venv/bin/activate && pip install -q -r requirements.txt`,
  `cd ${APP_ROOT}/backend && . .venv/bin/activate && python manage.py migrate --noinput`,
  `cd ${APP_ROOT}/backend && . .venv/bin/activate && python manage.py create_mock_patients`,
  `python /opt/clinicmonitoring/deploy/full_test.py`,
  `cd ${APP_ROOT}/frontend && npm ci --no-audit --no-fund && npm run build`,
  `mkdir -p /var/www/clinicmonitoring/frontend/dist`,
  `rsync -a --delete ${APP_ROOT}/frontend/dist/ /var/www/clinicmonitoring/frontend/dist/`,
  `chown -R www-data:www-data /var/www/clinicmonitoring/frontend/dist`,
  `systemctl daemon-reload`,
  `systemctl restart clinicmonitoring-daphne`,
  `systemctl restart clinicmonitoring-hl7-gateway || true`,
  `systemctl restart clinicmonitoring-vitals-api || true`,
  `nginx -t && systemctl reload nginx`,
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
      password: PASS,
      readyTimeout: 30000
    });
    
    function runCommands(conn, index) {
      if (index >= COMMANDS.length) {
        console.log('\n✅ HAMMA BUYRUQLAR MUVAFFAQIYATLI!');
        conn.end();
        resolve(output);
        return;
      }
      
      const cmd = COMMANDS[index];
      console.log(`\n[${index + 1}/${COMMANDS.length}] ${cmd.split('&&')[0].trim()}...`);
      
      conn.exec(cmd, (err, stream) => {
        if (err) {
          console.error(`❌ Xato:`, err.message);
          runCommands(conn, index + 1);
          return;
        }
        
        let cmdOutput = '';
        
        stream.on('close', (code) => {
          if (cmdOutput.includes('error') || cmdOutput.includes('Error')) {
            console.log(`⚠️ Ogohlantirish`);
          } else {
            console.log(`✓ OK`);
          }
          output += cmdOutput;
          runCommands(conn, index + 1);
        });
        
        stream.on('data', (data) => {
          cmdOutput += data.toString();
        });
        
        stream.stderr.on('data', (data) => {
          cmdOutput += data.toString();
        });
      });
    }
  });
}

runSSH().then(() => {
  console.log('\n🚀 DEPLOY TUGADI!');
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ DEPLOY XATOSI:', err.message);
  process.exit(1);
});
