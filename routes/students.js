const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyAdmin, verifyAdminOrFloorLeader } = require('../middleware/auth');
const https = require('https');

router.use(verifyAdminOrFloorLeader);

// Auto-create the floor_session_targets table
pool.query(`
  CREATE TABLE IF NOT EXISTS floor_session_targets (
    floor_id INT NOT NULL,
    session_key VARCHAR(50) NOT NULL,
    target_type VARCHAR(20) NOT NULL DEFAULT 'ALL',
    student_ids JSON,
    PRIMARY KEY (floor_id, session_key)
  )
`).catch(console.error);

// ------------------------------------------------------------
// GET /api/students/floor-targets
// ------------------------------------------------------------
router.get('/floor-targets', async (req, res) => {
  try {
    const { session_key, floor_id } = req.query;
    if (!session_key || floor_id === undefined) {
      return res.status(400).json({ success: false, message: 'Missing session_key or floor_id' });
    }
    const [rows] = await pool.query(
      'SELECT target_type, student_ids FROM floor_session_targets WHERE floor_id = ? AND session_key = ?',
      [floor_id, session_key]
    );
    if (rows.length === 0) {
      return res.json({ success: true, data: { target_type: 'ALL', student_ids: [] } });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// POST /api/students/floor-targets
// ------------------------------------------------------------
router.post('/floor-targets', async (req, res) => {
  try {
    const { session_key, floor_id, target_type, student_ids } = req.body;
    if (!session_key || floor_id === undefined || !target_type) {
      return res.status(400).json({ success: false, message: 'Missing fields' });
    }
    
    const idsJson = JSON.stringify(student_ids || []);
    
    await pool.query(`
      INSERT INTO floor_session_targets (floor_id, session_key, target_type, student_ids)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE target_type = VALUES(target_type), student_ids = VALUES(student_ids)
    `, [floor_id, session_key, target_type, idsJson]);
    
    return res.json({ success: true, message: 'Targets saved successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// GET /api/students/sessions
// ------------------------------------------------------------
router.get('/sessions', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM attendance_schedules ORDER BY start_time ASC');
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Helper function to sync students from AVD API
async function syncStudentsFromApi() {
  try {
    const apiData = await new Promise((resolve, reject) => {
      https.get('https://api.avdvvn.org/public/getStudentBasicDetails', {
        headers: { 'x-hsh-auth-token': 'aF92Kx7QmN4Lp8Vz' }
      }, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });

    if (!apiData || !apiData.data) return;

    for (const extStudent of apiData.data) {
      if (!extStudent.bankCode) continue;
      const canonicalUsername = extStudent.bankCode;
      
      const roomRaw = extStudent.room ? extStudent.room.toString().trim() : '';
      const isActive = (roomRaw && roomRaw !== 'null' && roomRaw !== '') ? true : false;
      const roomValue = isActive ? roomRaw : null;
      
      let floorId = 0;
      if (isActive) {
        const roomStr = roomRaw;
        if (roomStr.length === 5) {
          floorId = parseInt(roomStr.substring(0, 2)) || 0;
        } else if (roomStr.length === 4) {
          floorId = parseInt(roomStr.substring(0, 1)) || 0;
        } else if (roomStr.length === 3) {
          floorId = parseInt(roomStr.substring(0, 1)) || 0;
        }
      }

      const fullName = [extStudent.firstName, extStudent.middleName, extStudent.lastName]
        .filter(Boolean)
        .map(s => String(s).trim())
        .filter(Boolean)
        .join(' ');
      const status = extStudent.status ? extStudent.status.toLowerCase() : '';
      const phone = extStudent.phone ? String(extStudent.phone).trim() : canonicalUsername;
      const fatherPhone = extStudent.fatherPhone ? String(extStudent.fatherPhone).trim() : null;
      const motherPhone = extStudent.motherPhone ? String(extStudent.motherPhone).trim() : null;
      const parentPhone = fatherPhone || motherPhone || (extStudent.whatsAppNumber ? String(extStudent.whatsAppNumber).trim() : null);
      const dummyHash = '$2b$10$DKYfBMxGt00SY4/kwh1yeeGZChSF6/9uvosxdWV63dJe.AUQPPME6';
      
      // Try to insert them if they are new
      await pool.query(
        `INSERT IGNORE INTO students (student_code, name, phone_number, father_phone, mother_phone, parent_phone, password_hash, floor_id, room_number, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [canonicalUsername, fullName, phone, fatherPhone, motherPhone, parentPhone, dummyHash, floorId, roomValue, isActive]
      );

      if (isActive) {
        // API has a room. Overwrite local completely.
        await pool.query(
          `UPDATE students 
           SET room_number = ?, name = ?, is_active = 1, floor_id = ?, 
               father_phone = COALESCE(?, father_phone), 
               mother_phone = COALESCE(?, mother_phone), 
               parent_phone = COALESCE(?, parent_phone), 
               phone_number = COALESCE(phone_number, ?) 
           WHERE student_code = ? OR TRIM(LEADING '0' FROM student_code) = TRIM(LEADING '0' FROM ?)`,
          [roomValue, fullName, floorId, fatherPhone, motherPhone, parentPhone, phone, canonicalUsername, canonicalUsername]
        );
      } else {
        // API has NO room.
        if (status === 'left') {
          // They left the hostel. Deactivate them.
          await pool.query(
            `UPDATE students 
             SET is_active = 0, room_number = NULL, floor_id = 0, name = ?, 
                 father_phone = COALESCE(?, father_phone), 
                 mother_phone = COALESCE(?, mother_phone), 
                 parent_phone = COALESCE(?, parent_phone) 
             WHERE student_code = ? OR TRIM(LEADING '0' FROM student_code) = TRIM(LEADING '0' FROM ?)`,
            [fullName, fatherPhone, motherPhone, parentPhone, canonicalUsername, canonicalUsername]
          );
        } else {
          // They don't have a room in API yet, but might have been added manually.
          // Just update their name and contact info, preserve their manual room/floor.
          await pool.query(
            `UPDATE students 
             SET name = ?, 
                 father_phone = COALESCE(?, father_phone), 
                 mother_phone = COALESCE(?, mother_phone), 
                 parent_phone = COALESCE(?, parent_phone), 
                 phone_number = COALESCE(phone_number, ?) 
             WHERE student_code = ? OR TRIM(LEADING '0' FROM student_code) = TRIM(LEADING '0' FROM ?)`,
            [fullName, fatherPhone, motherPhone, parentPhone, phone, canonicalUsername, canonicalUsername]
          );
        }
      }
      
      // We no longer update the floor blindly here because it overwrites manual floor assignments.
    }
  } catch (err) {
    console.error('Error syncing students from API:', err.message || err);
    // Do not throw the error, just let it fail silently so the local DB still loads
  }
}

// ------------------------------------------------------------
// GET /api/students
// ------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    // 1. Sync first
    await syncStudentsFromApi();

    // 2. Fetch all active students
    let query = `
      SELECT 
        id AS student_id, 
        name, 
        floor_id, 
        student_code, 
        phone_number, 
        assigned_mobile, 
        room_number, 
        is_default_present, 
        father_phone, 
        mother_phone, 
        parent_phone,
        last_known_ip,
        device_uuid,
        last_login_at,
        is_device_bound
      FROM students 
      WHERE is_active = TRUE
    `;
    let params = [];
    if (req.leader) {
      const leaderFloors = Array.isArray(req.leader.assigned_floors) && req.leader.assigned_floors.length > 0
        ? req.leader.assigned_floors.map(f => parseInt(f, 10)).filter(f => !isNaN(f))
        : (req.leader.floor_id !== undefined ? [parseInt(req.leader.floor_id, 10)] : []);

      if (leaderFloors.length > 0) {
        query += ' AND floor_id IN (?)';
        params.push(leaderFloors);
      }
    }
    query += ' ORDER BY name ASC';
    const [students] = await pool.query(query, params);

    // 3. Fetch tags for these students
    try {
      const [tagRows] = await pool.query(`
        SELECT sta.student_id, t.id as tag_id, t.name, t.color, t.is_system, t.description
        FROM student_tag_assignments sta
        JOIN student_tags t ON sta.tag_id = t.id
      `);

      const tagsMap = {};
      for (const tr of tagRows) {
        if (!tagsMap[tr.student_id]) tagsMap[tr.student_id] = [];
        tagsMap[tr.student_id].push({
          id: tr.tag_id,
          name: tr.name,
          color: tr.color,
          is_system: tr.is_system,
          description: tr.description
        });
      }

      const [bindingRows] = await pool.query(`
        SELECT student_id, student_code, ip_address, device_uuid, last_login_at
        FROM device_ip_bindings
      `);
      const ipMap = {};
      const devMap = {};
      const lastLoginMap = {};
      for (const b of bindingRows) {
        if (b.student_id) {
          ipMap[b.student_id] = b.ip_address;
          devMap[b.student_id] = b.device_uuid;
          lastLoginMap[b.student_id] = b.last_login_at;
        }
        if (b.student_code) {
          ipMap[b.student_code] = b.ip_address;
          devMap[b.student_code] = b.device_uuid;
          lastLoginMap[b.student_code] = b.last_login_at;
          const cleanCode = String(b.student_code).replace(/^0+/, '');
          ipMap[cleanCode] = b.ip_address;
          devMap[cleanCode] = b.device_uuid;
          lastLoginMap[cleanCode] = b.last_login_at;
        }
      }

      const enrichedStudents = students.map(s => {
        const cleanCode = String(s.student_code || '').replace(/^0+/, '');
        const boundIp = ipMap[s.student_id] || ipMap[s.student_code] || ipMap[cleanCode] || s.last_known_ip || null;
        const deviceUuid = devMap[s.student_id] || devMap[s.student_code] || devMap[cleanCode] || s.device_uuid || null;
        const lastLogin = lastLoginMap[s.student_id] || lastLoginMap[s.student_code] || lastLoginMap[cleanCode] || s.last_login_at || null;

        return {
          ...s,
          bound_ip: boundIp,
          last_known_ip: boundIp,
          device_uuid: deviceUuid,
          last_login_at: lastLogin,
          tags: tagsMap[s.student_id] || []
        };
      });

      return res.json({ success: true, data: enrichedStudents });
    } catch(tagErr) {
      return res.json({ success: true, data: students });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// GET /api/students/details/:code
// ------------------------------------------------------------
router.get('/details/:code', async (req, res) => {
  try {
    const studentCode = String(req.params.code).trim();

    // 1. Try matching student_code first (since student_code is the canonical student ID e.g. '0876')
    let [rows] = await pool.query(`
      SELECT s.*, f.floor_name 
      FROM students s
      LEFT JOIN floors f ON s.floor_id = f.floor_id
      WHERE s.student_code = ? 
         OR TRIM(LEADING '0' FROM s.student_code) = TRIM(LEADING '0' FROM ?)
      LIMIT 1
    `, [studentCode, studentCode]);

    // 2. If not found by student_code, try matching by primary key id
    if (rows.length === 0 && !isNaN(studentCode)) {
      const numericId = parseInt(studentCode, 10);
      const [idRows] = await pool.query(`
        SELECT s.*, f.floor_name 
        FROM students s
        LEFT JOIN floors f ON s.floor_id = f.floor_id
        WHERE s.id = ?
        LIMIT 1
      `, [numericId]);
      rows = idRows;
    }

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found in database' });
    }

    const student = rows[0];

    // Fetch tags
    const [tags] = await pool.query(`
      SELECT t.id, t.name, t.color, t.is_system, t.description
      FROM student_tag_assignments sta
      JOIN student_tags t ON sta.tag_id = t.id
      WHERE sta.student_id = ?
    `, [student.id]);

    // Fetch session schedules and attendance breakdown
    let sessionStats = [];
    let overallStats = { total_held: 0, total_attended: 0, percentage: 0 };
    let totalAttended = 0;
    try {
      // 1. Get all schedules
      let schedules = [];
      try {
        const [schedRows] = await pool.query('SELECT session_key, session_name, icon_name FROM attendance_schedules ORDER BY start_time ASC');
        schedules = schedRows || [];
      } catch (e) {}

      if (schedules.length === 0) {
        schedules = [
          { session_key: 'night', session_name: 'Night Attendance', icon_name: 'moon' },
          { session_key: 'aarti', session_name: 'Aarti Session', icon_name: 'sun' },
          { session_key: 'weekly_assembly', session_name: 'Weekly Assembly', icon_name: 'users' }
        ];
      }

      // 2. Count total sessions held per session_type
      const [totalHeldRows] = await pool.query(`
        SELECT LOWER(TRIM(session_type)) as session_type, COUNT(*) as total_held
        FROM attendance_sessions
        GROUP BY LOWER(TRIM(session_type))
      `);
      const totalHeldMap = {};
      let totalSessionsCount = 0;
      for (const r of totalHeldRows || []) {
        if (r.session_type) {
          totalHeldMap[r.session_type] = r.total_held || 0;
          totalSessionsCount += (r.total_held || 0);
        }
      }

      // 3. Count attended sessions per session_type for this student
      const cleanCode = String(student.student_code || '').replace(/^0+/, '');
      const [attendedRows] = await pool.query(`
        SELECT LOWER(TRIM(ses.session_type)) as session_type, COUNT(DISTINCT ar.session_id) as attended_count
        FROM attendance_records ar
        JOIN attendance_sessions ses ON ar.session_id = ses.id
        WHERE ar.student_id = ? 
           OR ar.bank_code = ? 
           OR TRIM(LEADING '0' FROM ar.bank_code) = ?
        GROUP BY LOWER(TRIM(ses.session_type))
      `, [student.id, student.student_code, cleanCode]);

      const attendedMap = {};
      let totalStudentAttended = 0;
      for (const r of attendedRows || []) {
        if (r.session_type) {
          attendedMap[r.session_type] = r.attended_count || 0;
          totalStudentAttended += (r.attended_count || 0);
        }
      }

      totalAttended = totalStudentAttended;

      const seenKeys = new Set();
      for (const s of schedules) {
        const key = (s.session_key || '').toLowerCase().trim();
        seenKeys.add(key);
        const held = totalHeldMap[key] || 0;
        const attended = attendedMap[key] || 0;
        const percentage = held > 0 ? Math.round((attended / held) * 100) : 0;
        sessionStats.push({
          session_key: s.session_key,
          session_name: s.session_name,
          icon_name: s.icon_name || 'users',
          held,
          attended,
          percentage
        });
      }

      for (const key of Object.keys(totalHeldMap)) {
        if (!seenKeys.has(key)) {
          const held = totalHeldMap[key] || 0;
          const attended = attendedMap[key] || 0;
          const percentage = held > 0 ? Math.round((attended / held) * 100) : 0;
          const formattedName = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          sessionStats.push({
            session_key: key,
            session_name: formattedName,
            icon_name: 'calendar',
            held,
            attended,
            percentage
          });
        }
      }

      overallStats = {
        total_held: totalSessionsCount,
        total_attended: totalStudentAttended,
        percentage: totalSessionsCount > 0 ? Math.round((totalStudentAttended / totalSessionsCount) * 100) : 0
      };
    } catch (attErr) {
      console.warn('Error computing student session attendance stats:', attErr.message);
    }

    // Fetch Security / Rule violation logs (Cross-Device IP conflicts, unauthorized login attempts)
    let securityLogs = [];
    const cleanCode = String(student.student_code || '').replace(/^0+/, '');
    try {
      const [secRows] = await pool.query(`
        SELECT 
          id,
          event_type,
          status,
          ip_address,
          device_uuid,
          details,
          primary_student_id,
          primary_student_code,
          primary_student_name,
          attempted_student_id,
          attempted_student_code,
          attempted_student_name,
          resolved_by,
          resolved_at,
          attempted_at
        FROM device_ip_security_logs
        WHERE primary_student_id = ?
           OR attempted_student_id = ?
           OR TRIM(LEADING '0' FROM primary_student_code) = ?
           OR TRIM(LEADING '0' FROM attempted_student_code) = ?
        ORDER BY attempted_at DESC
        LIMIT 20
      `, [student.id, student.id, cleanCode, cleanCode]);
      securityLogs = secRows || [];
    } catch (secErr) {
      console.warn('Error fetching security logs for student:', secErr.message);
    }

    // Fetch AI behavioral tag audit logs
    let aiAuditLogs = [];
    try {
      const [aiRows] = await pool.query(`
        SELECT id, assigned_tag, reason, analyzed_days, analyzed_at
        FROM ai_tag_analysis_logs
        WHERE student_id = ?
        ORDER BY analyzed_at DESC
        LIMIT 10
      `, [student.id]);
      aiAuditLogs = aiRows || [];
    } catch (aiErr) {}

    // Fetch absent reasons / disciplinary records
    let absentRecords = [];
    try {
      const [absRows] = await pool.query(`
        SELECT id, session_date, reason, created_at
        FROM attendance_absent_reasons
        WHERE student_id = ?
        ORDER BY session_date DESC
        LIMIT 10
      `, [student.id]);
      absentRecords = absRows || [];
    } catch (absErr) {}

    // Fetch bound IP address
    let boundIp = null;
    let boundIpAt = null;
    try {
      const [ipRows] = await pool.query('SELECT ip_address, last_login_at FROM device_ip_bindings WHERE student_id = ? LIMIT 1', [student.id]);
      if (ipRows.length > 0) {
        boundIp = ipRows[0].ip_address;
        boundIpAt = ipRows[0].last_login_at;
      }
    } catch (e) {}

    const nameParts = (student.name || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const details = {
      bankCode: student.student_code,
      studentId: student.id,
      name: student.name,
      firstName: firstName,
      lastName: lastName,
      group: 'Hostel Student',
      dateOfBirth: 'N/A',
      mobileNumber: student.assigned_mobile || student.phone_number || 'N/A',
      phone: student.phone_number || 'N/A',
      fatherPhone: student.father_phone || 'N/A',
      parentPhone: student.parent_phone || student.father_phone || 'N/A',
      emailId: 'N/A',
      city: 'N/A',
      state: 'Gujarat',
      room: student.room_number || 'Not Assigned',
      room_number: student.room_number || 'Not Assigned',
      floor_id: student.floor_id,
      floor_name: student.floor_name || (student.floor_id ? `Floor ${student.floor_id}` : 'Unassigned'),
      is_default_present: !!student.is_default_present,
      bound_ip: boundIp,
      bound_ip_at: boundIpAt,
      tags: tags,
      total_attended: totalAttended,
      session_stats: sessionStats,
      overall_stats: overallStats,
      security_logs: securityLogs,
      ai_audit_logs: aiAuditLogs,
      absent_records: absentRecords
    };

    return res.json({ success: true, data: details });
  } catch (err) {
    console.error('Error fetching student details:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// DELETE /api/students/:id
// Cascades: Deletes all attendance_records, absent justifications, leaves,
// tag assignments, IP bindings, rebind requests, and student entry
// ------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const studentId = req.params.id;
    
    // Find the student first to retrieve their student_code
    const [students] = await pool.query('SELECT id, student_code, floor_id FROM students WHERE id = ?', [studentId]);
    if (students.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    const student = students[0];

    // If it's a leader, ensure they can only delete students on their floor
    if (req.leader) {
      if (student.floor_id !== req.leader.floor_id) {
        return res.status(403).json({ success: false, message: 'Not authorized to delete this student' });
      }
    }

    const code = student.student_code;

    // 1. Delete all attendance records for this student
    try {
      await pool.query(
        `DELETE FROM attendance_records 
         WHERE bank_code = ? 
            OR TRIM(LEADING '0' FROM bank_code) = TRIM(LEADING '0' FROM ?)
            OR CAST(bank_code AS UNSIGNED) = CAST(? AS UNSIGNED)`,
        [code, code, code]
      );
    } catch(e) {
      console.warn('Student attendance_records cleanup warning:', e.message);
    }

    // 2. Delete all absent reasons / justifications
    try {
      await pool.query('DELETE FROM attendance_absent_reasons WHERE student_id = ?', [studentId]);
    } catch(e) {}

    // 3. Delete student leaves
    try {
      await pool.query(
        `DELETE FROM student_leaves 
         WHERE student_id = ? 
            OR bank_code = ? 
            OR TRIM(LEADING '0' FROM bank_code) = TRIM(LEADING '0' FROM ?)`,
        [studentId, code, code]
      );
    } catch(e) {}

    // 4. Delete student tag assignments
    try {
      await pool.query('DELETE FROM student_tag_assignments WHERE student_id = ?', [studentId]);
    } catch(e) {}

    // 5. Delete device IP bindings & logs
    try {
      await pool.query('DELETE FROM device_ip_bindings WHERE student_id = ?', [studentId]);
    } catch(e) {}
    try {
      await pool.query('DELETE FROM device_ip_login_logs WHERE student_id = ?', [studentId]);
    } catch(e) {}

    // 6. Delete rebind requests
    try {
      await pool.query('DELETE FROM rebind_requests WHERE student_id = ?', [studentId]);
    } catch(e) {}

    // 7. Delete student row
    await pool.query('DELETE FROM students WHERE id = ?', [studentId]);
    
    return res.json({ success: true, message: 'Student and all associated attendance data deleted successfully' });
  } catch (err) {
    console.error('Error deleting student:', err);
    return res.status(500).json({ success: false, message: 'Server error: ' + (err.sqlMessage || err.message) });
  }
});

// ------------------------------------------------------------
// POST /api/students
// ------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { name, student_code, phone_number, floor_id, room_number } = req.body;
    if (!name || !student_code || !floor_id) {
       return res.status(400).json({ success: false, message: 'Name, Bank Code, and Floor are required' });
    }
    const dummyHash = '$2b$10$DKYfBMxGt00SY4/kwh1yeeGZChSF6/9uvosxdWV63dJe.AUQPPME6'; // dummy 'password123'
    
    // Check if leader and enforce their floor id
    let finalFloorId = floor_id;
    if (req.leader) {
      finalFloorId = req.leader.floor_id;
    }

    // Use student_code as a fallback for phone to prevent UNIQUE and NOT NULL constraint errors
    const finalPhone = phone_number || student_code;
    
    const finalRoom = room_number || null;

    await pool.query(
      `INSERT INTO students (student_code, name, phone_number, password_hash, floor_id, is_active, assigned_mobile, room_number)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         floor_id = VALUES(floor_id),
         is_active = 1,
         room_number = VALUES(room_number),
         assigned_mobile = VALUES(assigned_mobile),
         phone_number = VALUES(phone_number)`,
      [student_code, name, finalPhone, dummyHash, finalFloorId, finalPhone, finalRoom]
    );
    return res.json({ success: true, message: 'Student added successfully' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ success: false, message: 'Student with this Bank Code already exists' });
    }
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// POST /api/students/sync
// ------------------------------------------------------------
router.post('/sync', async (req, res) => {
  try {
    await syncStudentsFromApi();
    return res.json({ success: true, message: 'Students synced successfully from External API' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// PUT /api/students/:id/room
// ------------------------------------------------------------
router.put('/:id/room', async (req, res) => {
  try {
    const studentId = req.params.id;
    const { floor_id } = req.body;
    
    // floor_id can be null or empty string to unassign
    const newFloorId = (floor_id && floor_id !== 'null') ? floor_id : null;
    
    await pool.query('UPDATE students SET floor_id = ? WHERE id = ?', [newFloorId, studentId]);
    return res.json({ success: true, message: 'Floor assigned successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// PUT /api/students/:id/mobile
// ------------------------------------------------------------
router.put('/:id/mobile', async (req, res) => {
  try {
    const studentId = req.params.id;
    const { assigned_mobile } = req.body;
    
    // assigned_mobile can be null or empty string to unassign
    const newMobile = (assigned_mobile && assigned_mobile.trim() !== '') ? assigned_mobile.trim() : null;
    
    console.log(`Assigning mobile ${newMobile} to student ID ${studentId}`);
    
    const [result] = await pool.query('UPDATE students SET assigned_mobile = ? WHERE id = ?', [newMobile, studentId]);
    
    if (result.affectedRows === 0) {
      console.log(`Failed to assign mobile: Student ID ${studentId} not found in database.`);
      return res.status(404).json({ success: false, message: `Student ID ${studentId} not found in database` });
    }

    return res.json({ success: true, message: 'Mobile assigned successfully' });
  } catch (err) {
    console.error('Error assigning mobile:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// PUT /api/students/:id/default-attendance
// ------------------------------------------------------------
router.put('/:id/default-attendance', async (req, res) => {
  try {
    const studentId = req.params.id;
    const { is_default_present } = req.body;

    let newVal = is_default_present;
    if (newVal === undefined) {
      const [rows] = await pool.query('SELECT is_default_present FROM students WHERE id = ?', [studentId]);
      if (rows.length === 0) return res.status(404).json({ success: false, message: 'Student not found' });
      newVal = !rows[0].is_default_present;
    }

    await pool.query('UPDATE students SET is_default_present = ? WHERE id = ?', [newVal ? 1 : 0, studentId]);

    return res.json({ 
      success: true, 
      is_default_present: !!newVal, 
      message: `Default attendance set to ${newVal ? 'ON (Auto-Mark Present)' : 'OFF'}` 
    });
  } catch (err) {
    console.error('Error updating default attendance:', err);
    return res.status(500).json({ success: false, message: 'Server error: ' + (err.sqlMessage || err.message) });
  }
});

// ------------------------------------------------------------
// POST /api/students/:id/reset-ip (RESET IP / REMOVE BOUND IP)
// ------------------------------------------------------------
router.post('/:id/reset-ip', async (req, res) => {
  try {
    const studentIdentifier = req.params.id;
    const cleanIdentifier = String(studentIdentifier).replace(/^0+/, '');

    // 1. Get student info by ID or student_code
    const [students] = await pool.query(
      `SELECT id, name, student_code FROM students 
       WHERE id = ? OR student_code = ? OR TRIM(LEADING '0' FROM student_code) = ?`,
      [studentIdentifier, studentIdentifier, cleanIdentifier]
    );

    if (students.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    const student = students[0];
    const sId = student.id;
    const sCode = student.student_code;
    const cleanCode = String(sCode).replace(/^0+/, '');

    // 2. Remove IP bindings for this student
    await pool.query(
      `DELETE FROM device_ip_bindings 
       WHERE student_id = ? OR student_code = ? OR TRIM(LEADING '0' FROM student_code) = ?`,
      [sId, sCode, cleanCode]
    );

    // 3. Clear device_uuid and IP in students table so they can bind a new phone/browser
    await pool.query(
      `UPDATE students SET device_uuid = NULL, last_known_ip = NULL, is_device_bound = FALSE 
       WHERE id = ? OR student_code = ? OR TRIM(LEADING '0' FROM student_code) = ?`,
      [sId, sCode, cleanCode]
    );

    // 4. Resolve any security logs
    await pool.query(
      `UPDATE device_ip_security_logs 
       SET status = 'RESOLVED', resolved_by = ?, resolved_at = NOW() 
       WHERE attempted_student_id = ? OR primary_student_id = ? OR attempted_student_code = ? OR primary_student_code = ?`,
      [req.admin ? 'ADMIN' : (req.leader?.username || 'ADMIN'), sId, sId, sCode, sCode]
    );

    return res.json({
      success: true,
      message: `IP & Device binding removed for ${student.name}. Student can now log in freely from any new IP/Device.`
    });
  } catch (err) {
    console.error('Error resetting IP binding:', err);
    return res.status(500).json({ success: false, message: 'Server error: ' + (err.sqlMessage || err.message) });
  }
});

// Also support POST /api/students/api/students/:id/reset-ip as fallback
router.post('/api/students/:id/reset-ip', async (req, res, next) => {
  req.url = `/${req.params.id}/reset-ip`;
  return router.handle(req, res, next);
});

router.delete('/:id/ip', async (req, res) => {
  try {
    const studentIdentifier = req.params.id;
    const cleanIdentifier = String(studentIdentifier).replace(/^0+/, '');
    const [students] = await pool.query(
      `SELECT id, name, student_code FROM students 
       WHERE id = ? OR student_code = ? OR TRIM(LEADING '0' FROM student_code) = ?`,
      [studentIdentifier, studentIdentifier, cleanIdentifier]
    );
    const sId = students[0]?.id || studentIdentifier;
    const sCode = students[0]?.student_code || studentIdentifier;

    await pool.query('DELETE FROM device_ip_bindings WHERE student_id = ? OR student_code = ?', [sId, sCode]);
    await pool.query('UPDATE students SET device_uuid = NULL, last_known_ip = NULL, is_device_bound = FALSE WHERE id = ? OR student_code = ?', [sId, sCode]);
    return res.json({ success: true, message: 'IP binding removed successfully' });
  } catch (err) {
    console.error('Error removing IP binding:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
