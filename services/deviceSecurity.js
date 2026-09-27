const pool = require('../config/db');

/**
 * Extracts normalized client IP address from express request
 */
function getClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress || 
           req.ip || 
           '127.0.0.1';

  if (typeof ip === 'string' && ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  // Convert ::ffff:127.0.0.1 to 127.0.0.1
  if (typeof ip === 'string' && ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  if (ip === '::1') {
    ip = '127.0.0.1';
  }
  return String(ip).trim();
}

/**
 * Validates and binds Student ID to IP & Device.
 * 1. Blocks cross-account login if another student is already bound to this device/IP.
 * 2. Blocks student login if their ID is already assigned to another device/IP without admin reset.
 */
async function checkAndBindDeviceIp(req, student, deviceUuid = null) {
  try {
    const clientIp = getClientIp(req);
    const studentId = student.id;
    const studentCode = student.student_code || student.bank_code || '';
    const studentName = student.name || 'Student';

    // -------------------------------------------------------------
    // CHECK 1: Is this student ID already assigned to another phone/IP?
    // -------------------------------------------------------------
    const [studentExisting] = await pool.query(
      `SELECT * FROM device_ip_bindings WHERE student_id = ? AND is_whitelisted = FALSE`,
      [studentId]
    );

    if (studentExisting.length > 0) {
      const myBinding = studentExisting[0];
      const isSameIp = myBinding.ip_address === clientIp;
      const isSameDevice = deviceUuid && myBinding.device_uuid && myBinding.device_uuid === deviceUuid;

      if (!isSameIp && !isSameDevice) {
        // Check if Admin authorized this student on this new IP/Device
        const [auth] = await pool.query(
          `SELECT id FROM device_ip_security_logs 
           WHERE (ip_address = ? OR (device_uuid IS NOT NULL AND device_uuid = ?)) 
             AND attempted_student_id = ? AND status = 'AUTHORIZED_BY_ADMIN'`,
          [clientIp, deviceUuid || 'NA', studentId]
        );

        if (auth.length === 0) {
          await pool.query(
            `INSERT INTO device_ip_security_logs 
             (ip_address, device_uuid, primary_student_id, primary_student_code, primary_student_name, 
              attempted_student_id, attempted_student_code, attempted_student_name, event_type, status, details)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NEW_DEVICE_BLOCKED', 'BLOCKED', ?)`,
            [
              clientIp,
              deviceUuid || 'NA',
              studentId,
              studentCode,
              studentName,
              studentId,
              studentCode,
              studentName,
              `Student ${studentName} (${studentCode}) already assigned to IP (${myBinding.ip_address}). Attempted new device/IP (${clientIp}).`
            ]
          );

          return {
            allowed: false,
            code: 'ALREADY_ASSIGNED_PHONE',
            message: `Already phone is assigned to this Student ID. Please contact Admin to remove or reset your bound IP.`,
            primary_student: {
              id: studentId,
              name: studentName,
              code: studentCode
            },
            attempted_student: {
              id: studentId,
              name: studentName,
              code: studentCode
            },
            ip_address: clientIp,
            bound_ip: myBinding.ip_address
          };
        }
      }
    }

    // -------------------------------------------------------------
    // CHECK 2: Is this device / IP already bound to ANOTHER student?
    // -------------------------------------------------------------
    let checkQuery = `SELECT * FROM device_ip_bindings WHERE student_id != ? AND is_whitelisted = FALSE AND (ip_address = ?`;
    const checkParams = [studentId, clientIp];
    if (deviceUuid && deviceUuid !== 'NA') {
      checkQuery += ` OR (device_uuid IS NOT NULL AND device_uuid != '' AND device_uuid = ?))`;
      checkParams.push(deviceUuid);
    } else {
      checkQuery += `)`;
    }
    const [existingBindings] = await pool.query(checkQuery, checkParams);

    if (existingBindings.length > 0) {
      const primary = existingBindings[0];

      // Check if admin has already authorized this specific student on this IP/Device
      const [authorizations] = await pool.query(
        `SELECT id FROM device_ip_security_logs 
         WHERE (ip_address = ? OR (device_uuid IS NOT NULL AND device_uuid = ?)) 
           AND attempted_student_id = ? AND status = 'AUTHORIZED_BY_ADMIN'`,
        [clientIp, deviceUuid || 'NA', studentId]
      );

      if (authorizations.length === 0) {
        // Log the multi-account proxy attempt
        await pool.query(
          `INSERT INTO device_ip_security_logs 
           (ip_address, device_uuid, primary_student_id, primary_student_code, primary_student_name, 
            attempted_student_id, attempted_student_code, attempted_student_name, event_type, status, details)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CROSS_ACCOUNT_BLOCKED', 'BLOCKED', ?)`,
          [
            clientIp,
            deviceUuid || primary.device_uuid || 'NA',
            primary.student_id,
            primary.student_code,
            primary.student_name,
            studentId,
            studentCode,
            studentName,
            `Student ${primary.student_name} (${primary.student_code}) was already logged in on device/IP ${clientIp}. Student ${studentName} (${studentCode}) attempted to log in.`
          ]
        );

        return {
          allowed: false,
          code: 'DEVICE_IP_CONFLICT',
          message: `Phone/Device is already assigned to student (${primary.student_name}). First go to Admin to authorize or reset before login.`,
          primary_student: {
            id: primary.student_id,
            name: primary.student_name,
            code: primary.student_code
          },
          attempted_student: {
            id: studentId,
            name: studentName,
            code: studentCode
          },
          ip_address: clientIp
        };
      }
    }

    // -------------------------------------------------------------
    // 3. No conflict or authorized -> Upsert binding
    // -------------------------------------------------------------
    await pool.query(
      `INSERT INTO device_ip_bindings (ip_address, student_id, student_code, student_name, device_uuid, last_login_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE 
         student_code = VALUES(student_code),
         student_name = VALUES(student_name),
         ip_address = VALUES(ip_address),
         device_uuid = COALESCE(VALUES(device_uuid), device_uuid),
         last_login_at = NOW()`,
      [clientIp, studentId, studentCode, studentName, deviceUuid]
    );

    return { allowed: true, ip_address: clientIp };

  } catch (err) {
    console.error('[DeviceSecurity Error]', err);
    return { allowed: true, error: err.message };
  }
}

module.exports = {
  getClientIp,
  checkAndBindDeviceIp
};
