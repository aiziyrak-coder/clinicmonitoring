/**
 * DAPHNE LOG - To'liq loglarni olish
 */
const { Client } = require('ssh2');

const HOST = '167.71.53.238';
const USER = 'root';
const PASS = 'Ziyrak2025Ai';

const COMMANDS = [
  // 1. Systemd journal dan to'liq log
  'journalctl -u clinicmonitoring-daphne -n 100 --no-pager -o cat',
  
  // 2. .env faylni tekshirish (parollarni yashirib)
  'cat /opt/clinicmonitoring/backend/.env | grep -v "SECRET\\|PASSWORD" || echo ".env not found"',
  
  // 3. Daphne ni qo\'lda ishga tushirish (debug mode)
  'cd /opt/clinicmonitoring/backend && source .venv/bin/activate && DJANGO_SETTINGS_MODULE=medicentral.settings DJANGO_DEBUG=true daphne -b 127.0.0.1 -p 8012 medicentral.asgi:application > /tmp/daphne_debug.log 2>&1 &',
  'sleep 5',
  'cat /tmp/daphne_debug.log',
  'kill %1 2>/dev/null || true',
  
  // 4. Python versiyasi va Django versiyasi
  'cd /opt/clinicmonitoring/backend && source .venv/bin/activate && python --version && python -c "import django; print(\'Django:\', django.VERSION)"',
  
  // 5. ASGI application import test
  'cd /opt/clinicmonitoring/backend && source .venv/bin/activate && DJANGO_SETTINGS_MODULE=medicentral.settings python -c "from medicentral.asgi import application; print(\'ASGI OK\')" 2>&1'
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
        console.log('\n🚀 LOG OLISH TUGADI!');
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
            if (output) {
              console.log('OUTPUT:');
              console.log(output);
              console.log('─'.repeat(80));
            }
            if (errorOutput) {
              console.error('ERROR:');
              console.error(errorOutput);
              console.log('─'.repeat(80));
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
