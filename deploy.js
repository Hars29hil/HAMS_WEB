const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Client } = require('ssh2');
const SftpClient = require('ssh2-sftp-client');

const SSH_CONFIG = {
  host: '82.180.143.125',
  port: 65002,
  username: 'u562700164',
  password: 'Guruhari@1723'
};

const REMOTE_PATHS = {
  adminFrontend: '/home/u562700164/domains/attendents.hpys.in/public_html',
  userFrontend: '/home/u562700164/domains/users.hpys.in/public_html',
  backend: '/home/u562700164/domains/attendentsnews.hpys.in/hbuilds/current/nodejs'
};

const ROOT_DIR = path.resolve(__dirname);

function runLocal(command, cwd, stepName) {
  console.log(`\n🔹 [${stepName}] Running: ${command} in ${cwd}...`);
  try {
    execSync(command, { cwd, stdio: 'inherit' });
    console.log(`✅ [${stepName}] Completed successfully.`);
  } catch (err) {
    console.error(`❌ [${stepName}] Failed!`, err.message);
    process.exit(1);
  }
}

async function uploadDirectory(sftp, localDir, remoteDir, label) {
  console.log(`\n📤 Uploading ${label} to: ${remoteDir}...`);
  await sftp.mkdir(remoteDir, true);
  await sftp.uploadDir(localDir, remoteDir);
  console.log(`✅ ${label} uploaded successfully.`);
}

async function runSshCommand(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`Exit code ${code}: ${stderr || stdout}`));
      }).on('data', (data) => {
        stdout += data.toString();
      }).stderr.on('data', (data) => {
        stderr += data.toString();
      });
    });
  });
}

async function main() {
  console.log('====================================================');
  console.log('🚀 HAMS AUTOMATED 1-CLICK SERVER DEPLOYMENT');
  console.log('====================================================');
  console.log('🎯 Targets:');
  console.log('   - Admin Frontend: https://attendents.hpys.in/');
  console.log('   - User Frontend:  https://users.hpys.in/');
  console.log('   - Backend API:    https://attendentsnews.hpys.in/');
  console.log('====================================================\n');

  // STEP 1: Build Admin Frontend
  runLocal('npx vite build --mode production', path.join(ROOT_DIR, 'HAMS_ADMIN'), '1/3 Build Admin Frontend');

  // STEP 2: Build User Frontend
  runLocal('npx vite build --mode production', path.join(ROOT_DIR, 'HAMS_WEB'), '2/3 Build User Frontend');

  // STEP 3: Connect to SFTP & SSH
  console.log('\n🔐 Connecting to server (82.180.143.125:65002)...');
  const sftp = new SftpClient();
  await sftp.connect(SSH_CONFIG);
  console.log('✅ SFTP Connected.');

  // STEP 4: Upload Admin Frontend
  const adminDist = path.join(ROOT_DIR, 'HAMS_ADMIN', 'dist');
  await uploadDirectory(sftp, adminDist, REMOTE_PATHS.adminFrontend, 'Admin Frontend');

  // STEP 5: Upload User Frontend
  const userDist = path.join(ROOT_DIR, 'HAMS_WEB', 'dist');
  await uploadDirectory(sftp, userDist, REMOTE_PATHS.userFrontend, 'User Frontend');

  // STEP 6: Upload Backend Files
  console.log('\n📤 Uploading Backend files to:', REMOTE_PATHS.backend);
  const backendFolders = ['config', 'middleware', 'routes', 'services', 'utils', 'public', 'database_export'];
  const backendFiles = ['server.js', 'package.json', 'package-lock.json', 'api_data.json'];

  for (const folder of backendFolders) {
    const localFolder = path.join(ROOT_DIR, folder);
    if (fs.existsSync(localFolder)) {
      const remoteFolder = `${REMOTE_PATHS.backend}/${folder}`;
      await sftp.mkdir(remoteFolder, true);
      await sftp.uploadDir(localFolder, remoteFolder);
      console.log(`   📁 Uploaded ${folder}/`);
    }
  }

  for (const file of backendFiles) {
    const localFile = path.join(ROOT_DIR, file);
    if (fs.existsSync(localFile)) {
      const remoteFile = `${REMOTE_PATHS.backend}/${file}`;
      await sftp.put(localFile, remoteFile);
      console.log(`   📄 Uploaded ${file}`);
    }
  }

  await sftp.end();
  console.log('✅ All files uploaded via SFTP.');

  // STEP 7: Restart Node.js Backend via SSH (Passenger restart trigger)
  console.log('\n🔄 Triggering backend restart on server...');
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      try {
        const restartCmd = `mkdir -p ${REMOTE_PATHS.backend}/tmp && touch ${REMOTE_PATHS.backend}/tmp/restart.txt`;
        await runSshCommand(conn, restartCmd);
        console.log('✅ Backend restart signal sent (tmp/restart.txt updated).');
        conn.end();
        resolve();
      } catch (err) {
        conn.end();
        reject(err);
      }
    }).on('error', reject).connect(SSH_CONFIG);
  });

  console.log('\n====================================================');
  console.log('🎉 DEPLOYMENT COMPLETE! ALL SERVICES LIVE & UPDATED!');
  console.log('====================================================');
  console.log('🌐 Live URLs:');
  console.log('   - Admin:   https://attendents.hpys.in/');
  console.log('   - User:    https://users.hpys.in/');
  console.log('   - Backend: https://attendentsnews.hpys.in/');
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('\n❌ DEPLOYMENT FAILED:', err);
  process.exit(1);
});
