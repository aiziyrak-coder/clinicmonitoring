/**
 * DAPHNE FIX - To'liq ta'mirlash
 */
const { Client } = require('ssh2');

const HOST = '167.71.53.238';
const USER = 'root';
const PASS = 'Ziyrak2025Ai';

const COMMANDS = [
  // 1. Daphne jarayonni to'xtatish
  'systemctl stop clinicmonitoring-daphne || true',
  
  // 2. Eski loglarni tozalash
  'rm -f /opt/clinicmonitoring/backend/daphne.log',
  
  // 3. Django sozlamalarini tekshirish
  'cd /opt/clinicmonitoring/backend && source .venv/bin/activate && python -c "import django; django.setup(); print(\'Django OK\')"',
  
  // 4. ASGI application ni tekshirish
  'cd /opt/clinicmonitoring/backend && source .venv/bin/activate && python -c "from medicentral.asgi import application; print(\'ASGI OK\')"',
  
  // 5. Port band emasligini tekshirish
  'kill $(lsof -t -i:8012) 2>/dev/null || true',
  
  // 6. Daphne ni qo\'lda ishga tushirib test
  'cd /opt/clinicmonitoring/backend && source .venv/bin/activate && timeout 5 daphne -b 127.0.0.1 -p 8012 medicentral.asgi:application > /tmp/daphne_test.log 2>&1 & sleep 3 && curl -s http://127.0.0.1:8012/api/health/ && echo "Daphne OK" || cat /tmp/daphne_test.log',
  
  // 7. Systemd service ni restart
  'systemctl daemon-reload',
  'systemctl restart clinicmonitoring-daphne',
  
  // 8. Statusni tekshirish
  'sleep 3 && systemctl status clinicmonitoring-daphne --no-pager -l',
  
  // 9. API ni tekshirish
  'curl -sS "https://clinicmonitoringapi.ziyrak.org/api/health/" | head -5',
  
  // 10. Nginx reload
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
              // Davom etamiz
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
