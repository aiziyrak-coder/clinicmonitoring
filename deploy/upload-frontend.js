/**
 * UPLOAD FRONTEND - Serverga SCP orqali
 */
const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');

const HOST = '167.71.53.238';
const USER = 'root';
const PASS = 'Ziyrak2025Ai';
const APP_ROOT = '/opt/clinicmonitoring';

// Frontend dist papkasini o'qish
const DIST_DIR = path.join(__dirname, '..', 'frontend', 'dist');

function runSSH() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      console.log('✅ Serverga ulanish muvaffaqiyatli!\n');
      
      // SFTP session ochish
      conn.sftp((err, sftp) => {
        if (err) {
          console.error('❌ SFTP xatosi:', err);
          reject(err);
          return;
        }
        
        uploadDirectory(sftp, DIST_DIR, `${APP_ROOT}/frontend/dist`, (err) => {
          if (err) {
            reject(err);
          } else {
            console.log('\n🚀 FRONTEND YUKLANDI!');
            
            // Nginx reload
            conn.exec('nginx -t && systemctl reload nginx', (err, stream) => {
              if (err) {
                console.error('Nginx reload error:', err);
              } else {
                let output = '';
                stream.on('data', (data) => { output += data; });
                stream.on('close', () => {
                  if (output) console.log(output);
                  console.log('✓ Nginx reloaded');
                  resolve();
                  conn.end();
                });
              }
            });
          }
        });
      });
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
    
    function uploadDirectory(sftp, localDir, remoteDir, callback) {
      console.log(`📁 Upload ${localDir} → ${remoteDir}`);
      
      // Remote directory yaratish
      sftp.mkdir(remoteDir, { recursive: true }, (err) => {
        if (err) console.log('Remote dir exists:', remoteDir);
        
        // Local files
        fs.readdir(localDir, (err, files) => {
          if (err) {
            callback(err);
            return;
          }
          
          let uploaded = 0;
          const total = files.length;
          
          files.forEach(file => {
            const localPath = path.join(localDir, file);
            const remotePath = `${remoteDir}/${file}`;
            
            fs.stat(localPath, (err, stats) => {
              if (err) {
                callback(err);
                return;
              }
              
              if (stats.isDirectory()) {
                // Subdirectory
                uploadDirectory(sftp, localPath, remotePath, (err) => {
                  if (!err) checkComplete();
                });
              } else {
                // File
                console.log(`⬆️ ${file}`);
                const readStream = fs.createReadStream(localPath);
                const writeStream = sftp.createWriteStream(remotePath);
                
                writeStream.on('close', () => {
                  checkComplete();
                });
                
                writeStream.on('error', (err) => {
                  callback(err);
                });
                
                readStream.pipe(writeStream);
              }
            });
          });
          
          function checkComplete() {
            uploaded++;
            if (uploaded >= total) {
              callback(null);
            }
          }
        });
      });
    }
  });
}

runSSH().catch(console.error);
