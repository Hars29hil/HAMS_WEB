const pool = require('../config/db');

/**
 * Extracts normalized client IP address from express request
 */
function getClientIp(req) {
  const forwarded = req.headers['cf-connecting-ip'] || 
                    req.headers['x-real-ip'] || 
                    req.headers['x-client-ip'] || 
                    req.headers['x-forwarded-for'] || 
                    req.connection?.remoteAddress || 
                    req.socket?.remoteAddress || 
                    req.ip;

  if (!forwarded) return '127.0.0.1';

  let ip = String(forwarded);
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
 * Validates and binds Student ID to Device UUID and IP.
 * 1. Blocks cross-account login if another student is already bound to this device_uuid (preventing multi-account proxy).
 * 2. Blocks student login if their ID is already assigned to another device_uuid without admin reset.
 * 3. Safely accommodates shared hostel Wi-Fi networks (NAT) while tracking real client IPs.
 */
async function checkAndBindDeviceIp(req, student, deviceUuid = null) {
  try {
    const clientIp = getClientIp(req);
    const studentId = student.id;
    const studentCode = student.student_code || student.bank_code || '';
    const studentName = student.name || 'Student';

    // Normalize device UUID
    const cleanDeviceUuid = (deviceUuid && String(deviceUuid).trim() !== '' && String(deviceUuid).trim() !== 'NA') 
      ? String(deviceUuid).trim() 
      : null;

    // -------------------------------------------------------------
    // CHECK 1: Is this student ID already assigned to another phone/device?
    // -------------------------------------------------------------
    const [studentExisting] = await pool.query(
      `SELECT * FROM device_ip_bindings WHERE student_id = ? AND is_whitelisted = FALSE`,
      [studentId]
    );

    if (studentExisting.length > 0) {
      const myBinding = studentExisting[0];
      const hasBoundDevice = Boolean(myBinding.device_uuid && myBinding.device_uuid !== 'NA');
      const isSameDevice = cleanDeviceUuid && hasBoundDevice && (myBinding.device_uuid === cleanDeviceUuid);

      // If student already has a bound device, and is now trying to log into a DIFFERENT device
      if (hasBoundDevice && cleanDeviceUuid && !isSameDevice) {
        // Check if Admin authorized this student on this new device
        const [auth] = await pool.query(
          `SELECT id FROM device_ip_security_logs 
           WHERE device_uuid = ? AND attempted_student_id = ? AND status = 'AUTHORIZED_BY_ADMIN'`,
          [cleanDeviceUuid, studentId]
        );

        if (auth.length === 0) {
          await pool.query(
            `INSERT INTO device_ip_security_logs 
             (ip_address, device_uuid, primary_student_id, primary_student_code, primary_student_name, 
              attempted_student_id, attempted_student_code, attempted_student_name, event_type, status, details)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NEW_DEVICE_BLOCKED', 'BLOCKED', ?)`,
            [
              clientIp,
              cleanDeviceUuid,
              studentId,
              studentCode,
              studentName,
              studentId,
              studentCode,
              studentName,
              `Student ${studentName} (${studentCode}) is already assigned to device (${myBinding.device_uuid}). Attempted login from new device (${cleanDeviceUuid}) on IP (${clientIp}).`
            ]
          );

          return {
            allowed: false,
            code: 'ALREADY_ASSIGNED_PHONE',
            message: `Already phone/device is assigned to this Student ID (${studentName}). Please contact Admin to remove or reset your bound device.`,
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
            device_uuid: cleanDeviceUuid,
            bound_device_uuid: myBinding.device_uuid,
            ip_address: clientIp,
            bound_ip: myBinding.ip_address
          };
        }
      }
    }

    // -------------------------------------------------------------
    // CHECK 2: Is THIS physical device already bound to ANOTHER student? (Multi-Account Proxy Check)
    // -------------------------------------------------------------
    if (cleanDeviceUuid) {
      const [existingDeviceBindings] = await pool.query(
        `SELECT * FROM device_ip_bindings 
         WHERE student_id != ? AND device_uuid = ? AND is_whitelisted = FALSE`,
        [studentId, cleanDeviceUuid]
      );

      if (existingDeviceBindings.length > 0) {
        const primary = existingDeviceBindings[0];

        // Check if admin has authorized this specific student on this device
        const [authorizations] = await pool.query(
          `SELECT id FROM device_ip_security_logs 
           WHERE device_uuid = ? AND attempted_student_id = ? AND status = 'AUTHORIZED_BY_ADMIN'`,
          [cleanDeviceUuid, studentId]
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
              cleanDeviceUuid,
              primary.student_id,
              primary.student_code,
              primary.student_name,
              studentId,
              studentCode,
              studentName,
              `Multi-account login detected: Device (${cleanDeviceUuid}) was already registered to student ${primary.student_name} (${primary.student_code}). Student ${studentName} (${studentCode}) attempted to log in on the same device.`
            ]
          );

          return {
            allowed: false,
            code: 'DEVICE_IP_CONFLICT',
            message: `This Phone/Device is already assigned to student (${primary.student_name}). First contact Admin to authorize or reset before logging in.`,
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
         WHERE ip_address = ? AND student_id != ? AND is_locked = TRUE AND is_whitelisted = FALSE`,
        [clientIp, studentId]
      );

      if (lockedIps.length > 0) {
        const primary = lockedIps[0];
        const [auth] = await pool.query(
          `SELECT id FROM device_ip_security_logs 
           WHERE ip_address = ? AND attempted_student_id = ? AND status = 'AUTHORIZED_BY_ADMIN'`,
          [clientIp, studentId]
        );

        if (auth.length === 0) {
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

    // -------------------------------------------------------------
    // 4. No conflict or authorized -> Upsert binding & update student table
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
      [clientIp, studentId, studentCode, studentName, cleanDeviceUuid]
    );

    if (cleanDeviceUuid) {
      await pool.query(
        'UPDATE students SET device_uuid = ? WHERE id = ?',
        [cleanDeviceUuid, studentId]
      );
    }

    return { allowed: true, ip_address: clientIp, device_uuid: cleanDeviceUuid };

  } catch (err) {
    console.error('[DeviceSecurity Error]', err);
    return { allowed: true, error: err.message };
  }
}

module.exports = {
  getClientIp,
  checkAndBindDeviceIp
};

