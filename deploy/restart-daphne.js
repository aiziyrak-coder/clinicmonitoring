/**
 * Restart Daphne only
 */
const { Client } = require('ssh2');

const HOST = '167.71.53.238';
const USER = 'root';
const PASS = 'Ziyrak2025Ai';

const COMMANDS = [
  'systemctl daemon-reload',
  'systemctl restart clinicmonitoring-daphne',
  'sleep 2',
  'systemctl status clinicmonitoring-daphne --no-pager | head -10',
  'curl -sS "https://clinicmonitoringapi.ziyrak.org/api/health/" || echo "API check failed"'
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
