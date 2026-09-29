const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { verifyStudent, verifyAdminOrFloorLeader } = require('../middleware/auth');
const { checkAndBindDeviceIp } = require('../services/deviceSecurity');

const SALT_ROUNDS = 10;

// ------------------------------------------------------------
// GET /api/auth/me
// Returns current authenticated user/leader profile & permissions
// ------------------------------------------------------------
router.get('/me', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    if (req.admin) {
      return res.json({
        success: true,
        data: {
          id: req.admin.id || 9999,
          role: 'ADMIN',
          name: 'Super Admin',
          floor_id: 0,
          assigned_floors: [],
          assigned_sessions: ['all'],
          session_permissions: {
            can_access_whatsapp: true,
            can_access_leaves: true,
            can_access_security: true,
            can_reset_ip: true
          }
        }
      });
    }

    if (req.leader) {
      const [rows] = await pool.query('SELECT * FROM floor_leaders WHERE id = ?', [req.leader.id]);
      if (rows.length === 0 || rows[0].is_active === 0) {
        return res.status(401).json({ success: false, message: 'Leader account inactive' });
      }
      const leader = rows[0];

      let assignedFloors = [];
      if (leader.assigned_floors) {
        try {
          assignedFloors = typeof leader.assigned_floors === 'string' ? JSON.parse(leader.assigned_floors) : leader.assigned_floors;
        } catch(e) {
          assignedFloors = [leader.floor_id];
        }
      } else {
        assignedFloors = [leader.floor_id];
      }

      let assignedSessions = ['all'];
      if (leader.assigned_sessions) {
        try {
          assignedSessions = typeof leader.assigned_sessions === 'string' ? JSON.parse(leader.assigned_sessions) : leader.assigned_sessions;
        } catch(e) {
          assignedSessions = ['all'];
        }
      }

      let sessionPermissions = {};
      if (leader.session_permissions) {
        try {
          sessionPermissions = typeof leader.session_permissions === 'string' ? JSON.parse(leader.session_permissions) : leader.session_permissions;
        } catch(e) {
          sessionPermissions = {};
        }
      }

      return res.json({
        success: true,
        data: {
          id: leader.id,
          role: 'LEADER',
          name: leader.name,
          username: leader.username,
          phone_number: leader.phone_number,
          floor_id: assignedFloors[0] || 0,
          assigned_floors: assignedFloors,
          assigned_sessions: assignedSessions,
          session_permissions: sessionPermissions
        }
      });
    }

    return res.status(401).json({ success: false, message: 'Unauthorized' });
  } catch (err) {
    console.error('Error in /api/auth/me:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// POST /api/auth/student/register
// Registers a student AND binds their first device_uuid.
// device_uuid is generated on the phone (flutter_secure_storage)
// and sent here on first signup.
// ------------------------------------------------------------
router.post('/student/register', async (req, res) => {
  try {
    const { student_code, name, phone_number, password, floor_id, device_uuid } = req.body;

    if (!student_code || !name || !phone_number || !password || !floor_id || !device_uuid) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const [existing] = await pool.query(
      'SELECT id FROM students WHERE student_code = ? OR phone_number = ?',
      [student_code, phone_number]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Student already registered' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const [result] = await pool.query(
      `INSERT INTO students (student_code, name, phone_number, password_hash, floor_id, device_uuid, assigned_mobile)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [student_code, name, phone_number, password_hash, floor_id, device_uuid, phone_number]
    );

    const token = jwt.sign(
      { id: result.insertId, student_code, floor_id, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return res.status(201).json({ success: true, token, student_id: result.insertId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// POST /api/auth/student/login
// Logs a student in AND checks their device_uuid matches the
// one bound in the DB. If it doesn't match, login is refused
// and the app should route the student to the rebind flow.
// ------------------------------------------------------------
router.post('/student/login', async (req, res) => {
  try {
    const { phone_number, password, device_uuid } = req.body;
    if (!phone_number || !password || !device_uuid) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const [rows] = await pool.query('SELECT * FROM students WHERE phone_number = ?', [phone_number]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    const student = rows[0];

    const passwordOk = await bcrypt.compare(password, student.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ success: false, message: 'Incorrect password' });
    }

    // Check IP & Device binding (1 Device <-> 1 Student ID)
    const secCheck = await checkAndBindDeviceIp(req, student, device_uuid);
    if (!secCheck.allowed) {
      return res.status(403).json({
        success: false,
        code: secCheck.code || 'DEVICE_IP_CONFLICT',
        message: secCheck.message,
        primary_user: secCheck.primary_student?.name,
        attempted_user: secCheck.attempted_student?.name,
        ip_address: secCheck.ip_address,
        bound_ip: secCheck.bound_ip,
        device_uuid: secCheck.device_uuid,
        bound_device_uuid: secCheck.bound_device_uuid
      });
    }

    const token = jwt.sign(
      { id: student.id, student_code: student.student_code, floor_id: student.floor_id, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return res.json({ success: true, token, student: {
      id: student.id, name: student.name, student_code: student.student_code, floor_id: student.floor_id
    }});
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// POST /api/auth/leader/login
// ------------------------------------------------------------
router.post('/leader/login', async (req, res) => {
  try {
    const { phone_number, username, password } = req.body;
    const identifier = username || phone_number;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Missing login credentials' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM floor_leaders WHERE (username = ? OR phone_number = ?) AND is_active = TRUE', 
      [identifier, identifier]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Floor leader not found or inactive' });
    }
    const leader = rows[0];

    const passwordOk = await bcrypt.compare(password, leader.password_hash);
    if (!passwordOk && password !== leader.password_hash) {
      return res.status(401).json({ success: false, message: 'Incorrect password' });
    }

    let assignedFloors = [];
    if (leader.assigned_floors) {
      try {
        assignedFloors = typeof leader.assigned_floors === 'string' 
          ? JSON.parse(leader.assigned_floors) 
          : leader.assigned_floors;
      } catch(e) {
        assignedFloors = [leader.floor_id];
      }
    } else {
      assignedFloors = [leader.floor_id];
    }

    let assignedSessions = ['all'];
    if (leader.assigned_sessions) {
      try {
        assignedSessions = typeof leader.assigned_sessions === 'string'
          ? JSON.parse(leader.assigned_sessions)
          : leader.assigned_sessions;
      } catch(e) {
        assignedSessions = ['all'];
      }
    }

    let sessionPermissions = {};
    if (leader.session_permissions) {
      try {
        sessionPermissions = typeof leader.session_permissions === 'string'
          ? JSON.parse(leader.session_permissions)
          : leader.session_permissions;
      } catch(e) {
        sessionPermissions = {};
      }
    }

    const token = jwt.sign(
      { 
        id: leader.id, 
        username: leader.username || leader.name, 
        floor_id: assignedFloors[0] || 0, 
        assigned_floors: assignedFloors, 
        assigned_sessions: assignedSessions,
        session_permissions: sessionPermissions,
        role: 'floor_leader' 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return res.json({ 
      success: true, 
      token, 
      leader: { 
        id: leader.id, 
        name: leader.name, 
        username: leader.username, 
        floor_id: assignedFloors[0] || 0,
        assigned_floors: assignedFloors,
        assigned_sessions: assignedSessions,
        session_permissions: sessionPermissions
      } 
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// POST /api/auth/login (EXTERNAL API & SIM AUTHENTICATION)
// ------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    // Read new payload format
    const bankCode = req.body.username || req.body.bank_code;
    const simNumbers = req.body.sim_numbers || [];

    if (!bankCode) {
      return res.status(400).json({ success: false, message: 'Missing ID' });
    }

    const password = req.body.password;

    // ==========================================
    // 1. HARDCODED MAIN ADMIN LOGIN
    // ==========================================
    // Admin uses Bank Code: 172300, 173200 or "admin"
    const cleanedCode = String(bankCode).trim().replace(/^0+/, '');
    if (cleanedCode === '172300' || cleanedCode === '173200' || cleanedCode.toLowerCase() === 'admin') {
      if (!password || !String(password).trim()) {
        return res.status(400).json({ success: false, message: 'Password is required' });
      }
      const token = jwt.sign(
        { id: 9999, floor_id: 0, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );
      return res.json({
        success: true,
        status: 'ok',
        token,
        user: { role: 'ADMIN', name: 'Super Admin', floor_id: 0 },
        data: { token, user: { role: 'ADMIN', name: 'Super Admin', floor_id: 0 } }
      });
    }

    // ==========================================
    // 2. DATABASE FLOOR LEADER LOGIN
    // ==========================================
    const [dbLeaders] = await pool.query(
      'SELECT * FROM floor_leaders WHERE (LOWER(username) = LOWER(?) OR phone_number = ?) AND is_active = TRUE',
      [String(bankCode).trim(), String(bankCode).trim()]
    );

    if (dbLeaders.length > 0) {
      const leader = dbLeaders[0];
      if (!password || !String(password).trim()) {
        return res.status(400).json({ success: false, message: 'Password is required' });
      }

      const passwordOk = await bcrypt.compare(String(password).trim(), leader.password_hash);
      if (!passwordOk && String(password).trim() !== leader.password_hash) {
        return res.status(401).json({ success: false, message: 'Incorrect password' });
      }

      let assignedFloors = [];
      if (leader.assigned_floors) {
        try {
          assignedFloors = typeof leader.assigned_floors === 'string' 
            ? JSON.parse(leader.assigned_floors) 
            : leader.assigned_floors;
        } catch(e) {
          assignedFloors = [leader.floor_id];
        }
      } else {
        assignedFloors = [leader.floor_id];
      }

      let assignedSessions = ['all'];
      if (leader.assigned_sessions) {
        try {
          assignedSessions = typeof leader.assigned_sessions === 'string'
            ? JSON.parse(leader.assigned_sessions)
            : leader.assigned_sessions;
        } catch(e) {
          assignedSessions = ['all'];
        }
      }

      let sessionPermissions = {};
      if (leader.session_permissions) {
        try {
          sessionPermissions = typeof leader.session_permissions === 'string'
            ? JSON.parse(leader.session_permissions)
            : leader.session_permissions;
        } catch(e) {
          sessionPermissions = {};
        }
      }

      const token = jwt.sign(
        { 
          id: leader.id, 
          username: leader.username || leader.name, 
          floor_id: assignedFloors[0] || 0, 
          assigned_floors: assignedFloors, 
          assigned_sessions: assignedSessions,
          session_permissions: sessionPermissions,
          role: 'floor_leader' 
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );

      const leaderData = { 
        role: 'LEADER', 
        id: leader.id,
        username: leader.username,
        name: leader.name, 
        floor_id: assignedFloors[0] || 0,
        assigned_floors: assignedFloors,
        assigned_sessions: assignedSessions,
        session_permissions: sessionPermissions
      };

      return res.json({
        success: true,
        status: 'ok',
        token,
        user: leaderData,
        leader: leaderData,
        data: { 
          token, 
          user: leaderData,
          leader: leaderData
        } 
      });
    }

    // ==========================================
    // 3. HARDCODED FLOOR LEADER FALLBACK LOGIN (36X90)
    // ==========================================
    let isLeader = false;
    let leaderFloorId = 0;
    
    const leaderMatch = bankCode ? String(bankCode).match(/^36(\d)90$/) : null;
    if (leaderMatch) {
      isLeader = true;
      leaderFloorId = parseInt(leaderMatch[1], 10);
    }
    
    if (isLeader) {
      if (!password || !String(password).trim()) {
        return res.status(400).json({ success: false, message: 'Password is required' });
      }
      const token = jwt.sign(
        { id: 8000 + leaderFloorId, floor_id: leaderFloorId, assigned_floors: [leaderFloorId], role: 'floor_leader' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );
      return res.json({
        success: true,
        data: { token, user: { role: 'LEADER', name: `Floor ${leaderFloorId} Leader`, floor_id: leaderFloorId, assigned_floors: [leaderFloorId] } }
      });
    }

    // ==========================================
    // 3. HARDCODED TEST STUDENT LOGIN
    // ==========================================
    if (bankCode === '0000' || bankCode === '99999') {
      const token = jwt.sign(
        { id: 99999, student_code: bankCode, floor_id: 9, role: 'student' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );
      return res.json({
        success: true,
        data: {
          token,
          user: { 
            role: 'STUDENT', 
            name: 'Test Student', 
            floor_id: 9,
            room: '9000',
            phone: '0000000000',
            email: 'test@student.com'
          }
        }
      });
    }

    // ==========================================
    // 4. HARDCODED MANUAL ATTENDANCE OPERATOR
    // ==========================================
    if (bankCode === '36960') {
      const token = jwt.sign(
        { id: 99998, floor_id: 0, role: 'operator' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );
      return res.json({
        success: true,
        data: {
          token,
          user: { 
            role: 'OPERATOR', 
            name: 'Manual Operator', 
            floor_id: 0,
          }
        }
      });
    }

    // ==========================================
    // 5. REGULAR STUDENT LOGIN (FALLBACK)
    // ==========================================
    // Check browser requirement: Bluefy on iPhone OR Parent Control Tag permission
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const isBluefy = userAgent.includes('bluefy');

    // Normalize bankCode by removing leading zeros
    const normalizedInputUsername = String(bankCode).replace(/^0+(?=\d)/, '');

    // Fetch the list of students from the AVD API
    const https = require('https');
    const apiData = await new Promise((resolve, reject) => {
      https.get('https://api.avdvvn.org/public/getStudentBasicDetails', {
        headers: { 'x-hsh-auth-token': 'aF92Kx7QmN4Lp8Vz' }
      }, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
    
    if (!apiData || !apiData.data) {
      return res.status(500).json({ success: false, message: 'Failed to fetch external API' });
    }

    // Find the student by bankCode
    const extStudent = apiData.data.find(s => 
      String(s.bankCode).replace(/^0+(?=\d)/, '') === normalizedInputUsername
    );

    if (!extStudent) {
      return res.status(401).json({ success: false, message: 'Invalid code' });
    }

    // Use the canonical bankCode from the external API from now on
    const canonicalUsername = extStudent.bankCode;

    // Check Parent Control permission if not on Bluefy browser
    if (!isBluefy) {
      const parentControlAllowed = await hasParentControlTag(null, canonicalUsername);
      if (!parentControlAllowed) {
        return res.status(403).json({
          success: false,
          code: 'PARENT_CONTROL_REQUIRED',
          message: 'Access Restricted: You do not have Parent Control permission to log in via Chrome. Please mark attendance in the mobile app / Bluefy on iPhone, or contact the Hostel Admin Office.'
        });
      }
    }

    // Calculate floor from room (e.g. 409 -> Floor 4)
    let floorId = 0;
    if (extStudent.room) {
      const roomStr = extStudent.room.toString().trim();
      if (roomStr.length === 5) {
        floorId = parseInt(roomStr.substring(0, 2)) || 0;
      } else if (roomStr.length === 4) {
        floorId = parseInt(roomStr.substring(0, 1)) || 0;
      } else if (roomStr.length === 3) {
        floorId = parseInt(roomStr.substring(0, 1)) || 0;
      }
    }

    // Check if they exist in our local database
    const [localStudents] = await pool.query(
      'SELECT * FROM students WHERE student_code IN (?, ?)', 
      [canonicalUsername, normalizedInputUsername]
    );
    let student = null;

    if (localStudents.length === 0) {
      const fullName = [extStudent.firstName, extStudent.middleName, extStudent.lastName]
        .filter(Boolean)
        .map(s => String(s).trim())
        .filter(Boolean)
        .join(' ');
      // Use canonicalUsername (which is unique) as a fallback for phone to prevent UNIQUE constraint errors
      const phone = extStudent.phone || canonicalUsername;
      const dummyHash = '$2b$10$DKYfBMxGt00SY4/kwh1yeeGZChSF6/9uvosxdWV63dJe.AUQPPME6'; // dummy 'password123'
      
      const [insertResult] = await pool.query(
        `INSERT INTO students (student_code, name, phone_number, password_hash, floor_id, device_uuid, assigned_mobile)
         VALUES (?, ?, ?, ?, ?, NULL, ?)`,
        [canonicalUsername, fullName, phone, dummyHash, floorId, phone]
      );
      
      student = {
        id: insertResult.insertId,
        student_code: canonicalUsername,
        name: fullName,
        floor_id: floorId,
        device_uuid: null,
        assigned_mobile: phone
      };
    } else {
      student = localStudents[0];
    }
    
    // Check IP & Device multi-account binding to prevent duplicate proxy attendance
    const clientDeviceUuid = req.body.device_uuid || req.headers['x-device-uuid'] || null;
    const secCheck = await checkAndBindDeviceIp(req, student, clientDeviceUuid);
    if (!secCheck.allowed) {
      return res.status(403).json({
        success: false,
        code: secCheck.code || 'DEVICE_IP_CONFLICT',
        message: secCheck.message,
        primary_user: secCheck.primary_student?.name,
        attempted_user: secCheck.attempted_student?.name,
        ip_address: secCheck.ip_address,
        bound_ip: secCheck.bound_ip,
        device_uuid: secCheck.device_uuid,
        bound_device_uuid: secCheck.bound_device_uuid
      });
    }

    // Issue JWT Token
    const token = jwt.sign(
      { id: student.id, student_code: student.student_code, floor_id: student.floor_id, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const userData = {
      role: 'STUDENT', 
      id: student.id,
      name: student.name, 
      student_code: student.student_code,
      bankCode: student.student_code,
      floor_id: student.floor_id,
      floor: student.floor_id,
      room: extStudent.room || student.room_number || '',
      room_number: extStudent.room || student.room_number || '',
      phone: extStudent.phone || student.phone_number || '',
      phone_number: extStudent.phone || student.phone_number || '',
      email: extStudent.email || ''
    };

    // Ensure iPhone tag is assigned if request came from an iPhone / iOS
    const reqUa = (req.headers['user-agent'] || '').toLowerCase();
    if (reqUa.includes('iphone') || reqUa.includes('ipad') || reqUa.includes('bluefy') || reqUa.includes('ios')) {
      try {
        let [tagRows] = await pool.query("SELECT id FROM student_tags WHERE LOWER(name) = 'iphone' LIMIT 1");
        let tagId = tagRows.length > 0 ? tagRows[0].id : null;
        if (!tagId) {
          const [tRes] = await pool.query(
            "INSERT INTO student_tags (name, color, is_system, description) VALUES ('iPhone', '#0284c7', TRUE, 'Student logged in from an iPhone device')"
          );
          tagId = tRes.insertId;
        }
        await pool.query(
          `INSERT INTO student_tag_assignments (student_id, tag_id, assigned_by)
           VALUES (?, ?, 'System')
           ON DUPLICATE KEY UPDATE assigned_at = CURRENT_TIMESTAMP`,
          [student.id, tagId]
        );
      } catch (tErr) {
        console.warn('[AutoAssign iPhone Tag Warning]', tErr.message);
      }
    }

    return res.json({
      success: true,
      status: 'ok',
      token,
      user: userData,
      student: userData,
      data: {
        token,
        user: userData,
        student: userData
      }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again later.' });
  }
});

// ------------------------------------------------------------
// POST /api/auth/fcm-token
// Save FCM token for push notifications
// ------------------------------------------------------------
router.post('/fcm-token', verifyStudent, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Missing token' });
    }
    await pool.query('UPDATE students SET fcm_token = ? WHERE id = ?', [token, req.student.id]);
    return res.json({ success: true, message: 'FCM token saved' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// POST /api/auth/auto-login
// ------------------------------------------------------------
router.post('/auto-login', async (req, res) => {
  try {
    const { sim_numbers } = req.body;
    if (!sim_numbers || !Array.isArray(sim_numbers) || sim_numbers.length === 0) {
      return res.status(400).json({ success: false, message: 'No SIM numbers provided' });
    }

    // Find any student whose assigned_mobile matches ANY of the sim_numbers
    const [students] = await pool.query('SELECT * FROM students WHERE is_active = TRUE AND assigned_mobile IS NOT NULL');
    
    let matchedStudent = null;
    for (const student of students) {
      const assignedLast10 = String(student.assigned_mobile).slice(-10);
      for (const sim of sim_numbers) {
        if (!sim) continue;
        const simLast10 = String(sim).replace(/[^0-9]/g, '').slice(-10);
        if (simLast10 === assignedLast10) {
          matchedStudent = student;
          break;
        }
      }
      if (matchedStudent) break;
    }

    if (!matchedStudent) {
      return res.status(404).json({ success: false, message: 'No matching student found' });
    }

    // Check IP & Device binding
    const clientDeviceUuid = req.body.device_uuid || req.headers['x-device-uuid'] || null;
    await checkAndBindDeviceIp(req, matchedStudent, clientDeviceUuid);

    const token = jwt.sign(
      { id: matchedStudent.id, student_code: matchedStudent.student_code, floor_id: matchedStudent.floor_id, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Fetch the list of students from the AVD API to get room and email
    const https = require('https');
    const apiData = await new Promise((resolve, reject) => {
      https.get('https://api.avdvvn.org/public/getStudentBasicDetails', {
        headers: { 'x-hsh-auth-token': 'aF92Kx7QmN4Lp8Vz' }
      }, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
    
    let room = '';
    let email = '';
    if (apiData && apiData.data) {
      const extStudent = apiData.data.find(s => 
        String(s.bankCode).replace(/^0+(?=\d)/, '') === String(matchedStudent.student_code).replace(/^0+(?=\d)/, '')
      );
      if (extStudent) {
        room = extStudent.room || '';
        email = extStudent.email || '';
      }
    }

    return res.json({
      success: true,
      data: {
        token,
        user: { 
          role: 'STUDENT', 
          name: matchedStudent.name, 
          floor_id: matchedStudent.floor_id,
          phone: matchedStudent.phone_number,
          room: room,
          email: email
        }
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// GET /api/auth/device-status
// Checks if the client's current device_uuid or IP is actively blocked
// ------------------------------------------------------------
router.get('/device-status', async (req, res) => {
  try {
    const { getClientIp } = require('../services/deviceSecurity');
    const clientIp = getClientIp(req);
    const deviceUuid = req.query.device_uuid || req.headers['x-device-uuid'] || null;

    if (!deviceUuid && (!clientIp || clientIp === '127.0.0.1')) {
      return res.json({ success: true, is_blocked: false });
    }

    const [logs] = await pool.query(
      `SELECT * FROM device_ip_security_logs 
       WHERE ((device_uuid IS NOT NULL AND device_uuid = ?) OR (ip_address IS NOT NULL AND ip_address = ? AND ip_address != '127.0.0.1')) 
         AND status = 'BLOCKED' 
       ORDER BY id DESC LIMIT 1`,
      [deviceUuid, clientIp]
    );

    if (logs.length > 0) {
      return res.json({
        success: true,
        is_blocked: true,
        log: {
          code: logs[0].event_type === 'NEW_DEVICE_BLOCKED' ? 'ALREADY_ASSIGNED_PHONE' : 'DEVICE_IP_CONFLICT',
          message: logs[0].details || 'Device access blocked. Please contact Admin.',
          primary_user: logs[0].primary_student_name,
          attempted_user: logs[0].attempted_student_name,
          ip_address: logs[0].ip_address,
          device_uuid: logs[0].device_uuid
        }
      });
    }

    return res.json({ success: true, is_blocked: false });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Helper: Check if student has Parent Control tag (allows login on Chrome)
async function hasParentControlTag(studentId, studentCode) {
  try {
    const cleanCode = String(studentCode || '').trim().replace(/^0+/, '');
    const [rows] = await pool.query(
      `SELECT t.id, t.name 
       FROM student_tag_assignments sta
       JOIN student_tags t ON sta.tag_id = t.id
       JOIN students s ON sta.student_id = s.id
       WHERE (s.id = ? OR s.student_code = ? OR TRIM(LEADING '0' FROM s.student_code) = ?)
         AND LOWER(REPLACE(t.name, ' ', '')) = 'parentcontrol'`,
      [studentId || 0, String(studentCode || ''), cleanCode]
    );
    return rows.length > 0;
  } catch (err) {
    console.error('[hasParentControlTag Error]', err);
    return false;
  }
}

// ------------------------------------------------------------
// GET /api/auth/lookup-student
// Looks up student name and details by bank_code / student_code before login confirmation
// ------------------------------------------------------------
router.get('/lookup-student', async (req, res) => {
  try {
    const rawCode = req.query.code || req.query.student_code || req.query.username;
    if (!rawCode) {
      return res.status(400).json({ success: false, message: 'Missing student ID' });
    }

    const cleanCode = String(rawCode).trim().replace(/^0+(?=\d)/, '');

    let foundStudent = null;

    // 1. Check local database first
    const [localStudents] = await pool.query(
      `SELECT id, student_code, name, floor_id 
       FROM students 
       WHERE student_code = ? OR TRIM(LEADING '0' FROM student_code) = ? 
       LIMIT 1`,
      [rawCode, cleanCode]
    );

    if (localStudents.length > 0) {
      foundStudent = {
        id: localStudents[0].id,
        student_code: localStudents[0].student_code,
        name: localStudents[0].name,
        floor_id: localStudents[0].floor_id,
        room: ''
      };
    } else {
      // 2. If not found in local DB, fetch from external AVD API
      const https = require('https');
      const apiData = await new Promise((resolve, reject) => {
        https.get('https://api.avdvvn.org/public/getStudentBasicDetails', {
          headers: { 'x-hsh-auth-token': 'aF92Kx7QmN4Lp8Vz' }
        }, (response) => {
          let data = '';
          response.on('data', chunk => data += chunk);
          response.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });

      if (apiData && apiData.data) {
        const extStudent = apiData.data.find(s => 
          String(s.bankCode).replace(/^0+(?=\d)/, '') === cleanCode
        );

        if (extStudent) {
          const fullName = [extStudent.firstName, extStudent.middleName, extStudent.lastName]
            .filter(Boolean)
            .map(s => String(s).trim())
            .filter(Boolean)
            .join(' ');

          foundStudent = {
            id: null,
            student_code: extStudent.bankCode,
            name: fullName || 'Student',
            room: extStudent.room || ''
          };
        }
      }
    }

    if (!foundStudent) {
      return res.status(404).json({ success: false, message: 'Student not found with this ID' });
    }

    // 3. Check browser permissions (Bluefy on iPhone OR Parent Control tag)
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const isBluefy = userAgent.includes('bluefy');

    if (!isBluefy) {
      const parentControlAllowed = await hasParentControlTag(foundStudent.id, foundStudent.student_code);
      if (!parentControlAllowed) {
        return res.status(403).json({
          success: false,
          code: 'PARENT_CONTROL_REQUIRED',
          message: 'Access Restricted: You do not have Parent Control permission to log in via Chrome. Please mark attendance in the mobile app / Bluefy on iPhone, or contact the Hostel Admin Office.'
        });
      }
    }

    return res.json({
      success: true,
      has_parent_control: !isBluefy,
      student: {
        student_code: foundStudent.student_code,
        name: foundStudent.name,
        room: foundStudent.room || ''
      }
    });

  } catch (err) {
    console.error('Lookup Student Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to look up student name' });
  }
});

module.exports = router;


