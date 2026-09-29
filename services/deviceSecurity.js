const pool = require('../config/db');

let tablesEnsured = false;
async function ensureTablesExist() {
  if (tablesEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_ip_bindings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip_address VARCHAR(100) NOT NULL,
        student_id INT NOT NULL,
        student_code VARCHAR(50) NOT NULL,
        student_name VARCHAR(100) NOT NULL,
        device_uuid VARCHAR(100) DEFAULT NULL,
        last_login_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        is_locked BOOLEAN DEFAULT FALSE,
        is_whitelisted BOOLEAN DEFAULT FALSE,
        INDEX (student_id),
        INDEX (student_code),
        INDEX (ip_address),
        INDEX (device_uuid)
      )
    `);
    try { await pool.query('ALTER TABLE device_ip_bindings MODIFY COLUMN ip_address VARCHAR(100)'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_bindings MODIFY COLUMN device_uuid VARCHAR(100)'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_bindings ADD COLUMN student_code VARCHAR(50) DEFAULT ""'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_bindings ADD COLUMN student_name VARCHAR(100) DEFAULT ""'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_bindings ADD COLUMN device_uuid VARCHAR(100) DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_bindings ADD COLUMN is_whitelisted BOOLEAN DEFAULT FALSE'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_bindings ADD COLUMN is_locked BOOLEAN DEFAULT FALSE'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_bindings ADD COLUMN last_login_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'); } catch(e) {}

    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_ip_security_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip_address VARCHAR(100) NOT NULL,
        device_uuid VARCHAR(100) DEFAULT NULL,
        primary_student_id INT NOT NULL,
        primary_student_code VARCHAR(50) NOT NULL,
        primary_student_name VARCHAR(100) NOT NULL,
        attempted_student_id INT NOT NULL,
        attempted_student_code VARCHAR(50) NOT NULL,
        attempted_student_name VARCHAR(100) NOT NULL,
        event_type VARCHAR(50) DEFAULT 'CROSS_ACCOUNT_BLOCKED',
        status VARCHAR(30) DEFAULT 'BLOCKED',
        resolved_by VARCHAR(50) DEFAULT NULL,
        resolved_at DATETIME DEFAULT NULL,
        details TEXT DEFAULT NULL,
        attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX (attempted_student_id),
        INDEX (primary_student_id),
        INDEX (ip_address),
        INDEX (device_uuid)
      )
    `);
    try { await pool.query('ALTER TABLE device_ip_security_logs MODIFY COLUMN ip_address VARCHAR(100)'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_security_logs MODIFY COLUMN device_uuid VARCHAR(100)'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_security_logs ADD COLUMN primary_student_code VARCHAR(50) DEFAULT ""'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_security_logs ADD COLUMN primary_student_name VARCHAR(100) DEFAULT ""'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_security_logs ADD COLUMN attempted_student_code VARCHAR(50) DEFAULT ""'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_security_logs ADD COLUMN attempted_student_name VARCHAR(100) DEFAULT ""'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_security_logs ADD COLUMN device_uuid VARCHAR(100) DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_security_logs ADD COLUMN event_type VARCHAR(50) DEFAULT "CROSS_ACCOUNT_BLOCKED"'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_security_logs ADD COLUMN status VARCHAR(30) DEFAULT "BLOCKED"'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_security_logs ADD COLUMN resolved_by VARCHAR(50) DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_security_logs ADD COLUMN resolved_at DATETIME DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_security_logs ADD COLUMN details TEXT DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE device_ip_security_logs ADD COLUMN attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP'); } catch(e) {}

    try { await pool.query('ALTER TABLE students ADD COLUMN last_known_ip VARCHAR(100) DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE students MODIFY COLUMN last_known_ip VARCHAR(100)'); } catch(e) {}
    try { await pool.query('ALTER TABLE students ADD COLUMN device_uuid VARCHAR(100) DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE students MODIFY COLUMN device_uuid VARCHAR(100)'); } catch(e) {}
    try { await pool.query('ALTER TABLE students ADD COLUMN last_login_at DATETIME DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE students ADD COLUMN is_device_bound BOOLEAN DEFAULT FALSE'); } catch(e) {}

    tablesEnsured = true;
  } catch (err) {
    console.warn('[DeviceSecurity Init Warning]', err.message);
  }
}

/**
 * Returns current timestamp in Indian Standard Time (IST, UTC+5:30) as "YYYY-MM-DD HH:mm:ss"
 */
function getISTDate() {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const istDate = new Date(utc + (3600000 * 5.5));
  const pad = (n) => String(n).padStart(2, '0');
  const YYYY = istDate.getFullYear();
  const MM = pad(istDate.getMonth() + 1);
  const DD = pad(istDate.getDate());
  const hh = pad(istDate.getHours());
  const mm = pad(istDate.getMinutes());
  const ss = pad(istDate.getSeconds());
  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}

/**
 * Extracts normalized client IP address from express request
 */
function getClientIp(req) {
  if (!req) return '127.0.0.1';
  const forwarded = req.headers?.['cf-connecting-ip'] || 
                    req.headers?.['x-real-ip'] || 
                    req.headers?.['x-client-ip'] || 
                    req.headers?.['x-forwarded-for'] || 
                    req.connection?.remoteAddress || 
                    req.socket?.remoteAddress || 
                    req.ip;

  if (!forwarded) return '127.0.0.1';

  let ip = String(forwarded).trim();
  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  // Convert ::ffff:127.0.0.1 to 127.0.0.1
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  if (ip === '::1' || ip === 'localhost') {
    ip = '127.0.0.1';
  }
  return ip.trim();
}

/**
 * Records or updates a security conflict log without creating multiple duplicate rows on repeated logins
 */
async function upsertSecurityBlockedLog({
  ip_address,
  device_uuid,
  primary_student_id,
  primary_student_code,
  primary_student_name,
  attempted_student_id,
  attempted_student_code,
  attempted_student_name,
  event_type,
  details
}) {
  const istNow = getISTDate();
  try {
    // Check if an unresolved BLOCKED log already exists for this attempted student conflict
    const [existing] = await pool.query(
      `SELECT id FROM device_ip_security_logs 
       WHERE (attempted_student_id = ? OR attempted_student_code = ?) 
         AND (primary_student_id = ? OR primary_student_code = ?)
         AND status = 'BLOCKED'
       ORDER BY id DESC LIMIT 1`,
      [attempted_student_id, attempted_student_code, primary_student_id, primary_student_code]
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE device_ip_security_logs 
         SET ip_address = ?, device_uuid = COALESCE(?, device_uuid), details = ?, attempted_at = ? 
         WHERE id = ?`,
        [ip_address, device_uuid, details, istNow, existing[0].id]
      );
      return existing[0].id;
    } else {
      const [res] = await pool.query(
        `INSERT INTO device_ip_security_logs 
         (ip_address, device_uuid, primary_student_id, primary_student_code, primary_student_name, 
          attempted_student_id, attempted_student_code, attempted_student_name, event_type, status, details, attempted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'BLOCKED', ?, ?)`,
        [
          ip_address,
          device_uuid,
          primary_student_id,
          primary_student_code,
          primary_student_name,
          attempted_student_id,
          attempted_student_code,
          attempted_student_name,
          event_type,
          details,
          istNow
        ]
      );
      return res.insertId;
    }
  } catch (err) {
    console.warn('[DeviceSecurity Log Warning]', err.message);
  }
}

/**
 * Validates and binds Student ID to Device UUID and IP.
 * 1. Blocks student login if their ID is already assigned to another device_uuid without admin reset (1 Student ID -> 1 Device).
 * 2. Blocks cross-account login if another student is already bound to this device_uuid (1 Device -> 1 Student ID).
 * 3. Safely records real client IP and persistent device UUID on each login and request.
 */
async function checkAndBindDeviceIp(req, student, deviceUuid = null) {
  await ensureTablesExist();
  try {
    const clientIp = getClientIp(req);
    const studentId = student.id;
    const studentCode = String(student.student_code || student.bank_code || '').trim();
    const cleanStudentCode = studentCode.replace(/^0+/, '');
    const studentName = student.name || 'Student';

    // Normalize device UUID
    const cleanDeviceUuid = (deviceUuid && String(deviceUuid).trim() !== '' && String(deviceUuid).trim() !== 'NA') 
      ? String(deviceUuid).trim() 
      : null;

    console.log(`[DeviceSecurity] Checking IP (${clientIp}) & Device (${cleanDeviceUuid || 'NONE'}) for student ${studentName} (${studentCode}, ID: ${studentId})`);

    // -------------------------------------------------------------
    // Note: If the same student logs in (attempted == primary), they can log in freely.
    // Proxy conflict only occurs when a different student attempts to log in on an already assigned device/IP.
    // -------------------------------------------------------------

    // -------------------------------------------------------------
    // CHECK 2: Is THIS physical device already bound to ANOTHER student? (1 Device -> 1 Student ID)
    // -------------------------------------------------------------
    if (cleanDeviceUuid) {
      const [otherBindings] = await pool.query(
        `SELECT * FROM device_ip_bindings 
         WHERE (student_id != ? AND student_code != ? AND TRIM(LEADING '0' FROM student_code) != ?) 
           AND device_uuid = ? AND is_whitelisted = FALSE`,
        [studentId, studentCode, cleanStudentCode, cleanDeviceUuid]
      );

      const [otherStudents] = await pool.query(
        `SELECT id, student_code, name FROM students 
         WHERE (id != ? AND student_code != ? AND TRIM(LEADING '0' FROM student_code) != ?) 
           AND device_uuid = ? LIMIT 1`,
        [studentId, studentCode, cleanStudentCode, cleanDeviceUuid]
      );

      if (otherBindings.length > 0 || otherStudents.length > 0) {
        const primary = otherBindings[0] || otherStudents[0];
        const primaryId = primary.student_id || primary.id;
        const primaryCode = primary.student_code;
        const primaryName = primary.student_name || primary.name;

        // Check if admin has authorized this specific student on this device
        const [authorizations] = await pool.query(
          `SELECT id FROM device_ip_security_logs 
           WHERE device_uuid = ? AND (attempted_student_id = ? OR attempted_student_code = ?) AND status = 'AUTHORIZED_BY_ADMIN'`,
          [cleanDeviceUuid, studentId, studentCode]
        );

        if (authorizations.length === 0) {
          // Log or update the multi-account proxy attempt without creating duplicate rows
          await upsertSecurityBlockedLog({
            ip_address: clientIp,
            device_uuid: cleanDeviceUuid,
            primary_student_id: primaryId,
            primary_student_code: primaryCode,
            primary_student_name: primaryName,
            attempted_student_id: studentId,
            attempted_student_code: studentCode,
            attempted_student_name: studentName,
            event_type: 'CROSS_ACCOUNT_BLOCKED',
            details: `Multi-account login detected: Device (${cleanDeviceUuid}) was already registered to student ${primaryName} (${primaryCode}). Student ${studentName} (${studentCode}) attempted to log in on the same device.`
          });

          return {
            allowed: false,
            code: 'DEVICE_IP_CONFLICT',
            message: `This Phone/Device is already assigned to student (${primaryName}). First contact Admin to authorize or reset before logging in.`,
            primary_student: {
              id: primaryId,
              name: primaryName,
              code: primaryCode
            },
            attempted_student: {
              id: studentId,
              name: studentName,
              code: studentCode
            },
            device_uuid: cleanDeviceUuid,
            ip_address: clientIp
          };
        }
      }
    }

    // -------------------------------------------------------------
    // CHECK 3: Strictly Locked Dedicated IP check (if admin marked is_locked = true)
    // -------------------------------------------------------------
    if (clientIp && clientIp !== '127.0.0.1') {
      const [lockedIps] = await pool.query(
        `SELECT * FROM device_ip_bindings 
         WHERE ip_address = ? AND student_id != ? AND student_code != ? AND is_locked = TRUE AND is_whitelisted = FALSE`,
        [clientIp, studentId, studentCode]
      );

      if (lockedIps.length > 0) {
        const primary = lockedIps[0];
        const [auth] = await pool.query(
          `SELECT id FROM device_ip_security_logs 
           WHERE ip_address = ? AND (attempted_student_id = ? OR attempted_student_code = ?) AND status = 'AUTHORIZED_BY_ADMIN'`,
          [clientIp, studentId, studentCode]
        );

        if (auth.length === 0) {
          await upsertSecurityBlockedLog({
            ip_address: clientIp,
            device_uuid: cleanDeviceUuid,
            primary_student_id: primary.student_id,
            primary_student_code: primary.student_code,
            primary_student_name: primary.student_name,
            attempted_student_id: studentId,
            attempted_student_code: studentCode,
            attempted_student_name: studentName,
            event_type: 'LOCKED_IP_CONFLICT',
            details: `Dedicated locked IP (${clientIp}) access attempt by ${studentName} (${studentCode}). Registered to ${primary.student_name}.`
          });

          return {
            allowed: false,
            code: 'LOCKED_IP_CONFLICT',
            message: `This dedicated IP network is locked to student (${primary.student_name}). Contact Admin.`,
            primary_student: { id: primary.student_id, name: primary.student_name, code: primary.student_code },
            attempted_student: { id: studentId, name: studentName, code: studentCode },
            ip_address: clientIp
          };
        }
      }
    }

    const istNow = getISTDate();

    // -------------------------------------------------------------
    // 4. No conflict or authorized -> Upsert binding & update student table
    // -------------------------------------------------------------
    try {
      const [existingRow] = await pool.query(
        'SELECT id FROM device_ip_bindings WHERE student_id = ? OR student_code = ? OR TRIM(LEADING \'0\' FROM student_code) = ? LIMIT 1',
        [studentId, studentCode, cleanStudentCode]
      );
      if (existingRow.length > 0) {
        await pool.query(
          `UPDATE device_ip_bindings 
           SET student_id = ?, student_code = ?, student_name = ?, ip_address = ?, device_uuid = COALESCE(?, device_uuid), last_login_at = ? 
           WHERE id = ?`,
          [studentId, studentCode, studentName, clientIp, cleanDeviceUuid, istNow, existingRow[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO device_ip_bindings (student_id, student_code, student_name, ip_address, device_uuid, last_login_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [studentId, studentCode, studentName, clientIp, cleanDeviceUuid, istNow]
        );
      }
    } catch (insertErr) {
      console.warn('[DeviceSecurity Upsert Warning]', insertErr.message);
    }

    try {
      await pool.query(
        `UPDATE students SET 
           last_known_ip = ?,
           last_login_at = ?,
           device_uuid = COALESCE(?, device_uuid),
           is_device_bound = TRUE
         WHERE id = ? OR student_code = ? OR TRIM(LEADING '0' FROM student_code) = ?`,
        [clientIp, istNow, cleanDeviceUuid, studentId, studentCode, cleanStudentCode]
      );
    } catch (sErr) {
      console.warn('[DeviceSecurity Student Update Warning]', sErr.message);
    }

    // -------------------------------------------------------------
    // 5. If user logged in from iPhone / iOS / Bluefy, auto-assign iPhone tag
    // -------------------------------------------------------------
    try {
      const ua = (req.headers['user-agent'] || '').toLowerCase();
      const isIphone = ua.includes('iphone') || ua.includes('ipad') || ua.includes('bluefy') || ua.includes('ios') || ua.includes('cfnetwork');
      if (isIphone && studentId) {
        let [tagRows] = await pool.query("SELECT id FROM student_tags WHERE LOWER(name) = 'iphone' LIMIT 1");
        let tagId;
        if (tagRows.length === 0) {
          const [insertRes] = await pool.query(
            "INSERT INTO student_tags (name, color, is_system, description) VALUES ('iPhone', '#0284c7', TRUE, 'Student logged in from an iPhone device')"
          );
          tagId = insertRes.insertId;
        } else {
          tagId = tagRows[0].id;
        }

        await pool.query(
          `INSERT INTO student_tag_assignments (student_id, tag_id, assigned_by)
           VALUES (?, ?, 'System')
           ON DUPLICATE KEY UPDATE assigned_at = CURRENT_TIMESTAMP`,
          [studentId, tagId]
        );
        console.log(`[DeviceSecurity] Auto-assigned 'iPhone' tag to student ID ${studentId} (${studentName})`);
      }
    } catch (tagErr) {
      console.warn('[DeviceSecurity AutoAssign Tag Warning]', tagErr.message);
    }

    console.log(`[DeviceSecurity] Successfully bound IP (${clientIp}) & Device (${cleanDeviceUuid || 'NONE'}) at ${istNow} for student ${studentName}`);
    return { allowed: true, ip_address: clientIp, device_uuid: cleanDeviceUuid, last_login_at: istNow };

  } catch (err) {
    console.error('[DeviceSecurity Error]', err);
    return { allowed: true, error: err.message };
  }
}

module.exports = {
  getClientIp,
  getISTDate,
  checkAndBindDeviceIp,
  ensureTablesExist
};

