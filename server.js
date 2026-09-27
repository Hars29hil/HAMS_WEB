process.env.TZ = 'Asia/Kolkata';
require('dotenv').config();
require('./services/cron');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const rebindRoutes = require('./routes/rebind');
const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');
const studentsRoutes = require('./routes/students');
const floorsRoutes = require('./routes/floors');
const esp32Routes = require('./routes/esp32');
const versionRoutes = require('./routes/version');
const whatsappRoutes = require('./routes/whatsapp');
const notificationRoutes = require('./routes/notification');
const tagsRoutes = require('./routes/tags');
const leadersRoutes = require('./routes/leaders');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-hsh-auth-token', 'Origin', 'Accept', 'X-Requested-With'],
  credentials: true
}));
app.options('*', cors());

// Manual fallback CORS middleware ensuring headers on every single response & preflight
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-hsh-auth-token, Origin, Accept, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), service: 'hostel-attendance-backend' });
});
const path = require('path');
const fs = require('fs');

const apksDir = path.join(__dirname, 'public', 'apks');
if (!fs.existsSync(apksDir)) {
  fs.mkdirSync(apksDir, { recursive: true });
}

app.use(express.json());
app.use('/apks', express.static(apksDir));
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'hostel-attendance-backend' });
});

const pool = require('./config/db');
(async function runMigrations() {
  try {
    const [columns] = await pool.query(`SHOW COLUMNS FROM students LIKE 'room_number'`);
    if (columns.length === 0) {
      await pool.query(`ALTER TABLE students ADD COLUMN room_number VARCHAR(20) DEFAULT NULL`);
    }

    try { await pool.query('ALTER TABLE students ADD COLUMN is_default_present BOOLEAN DEFAULT FALSE'); } catch(e) {}
    try { await pool.query('ALTER TABLE students ADD COLUMN father_phone VARCHAR(20) DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE students ADD COLUMN mother_phone VARCHAR(20) DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE students ADD COLUMN parent_phone VARCHAR(20) DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE attendance_schedules ADD COLUMN linked_session_key VARCHAR(50) DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE attendance_schedules ADD COLUMN late_time TIME DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE attendance_schedules ADD COLUMN auto_message TEXT DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE attendance_schedules ADD COLUMN auto_message_parent TEXT DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE attendance_schedules ADD COLUMN auto_message_student TEXT DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE attendance_schedules ADD COLUMN auto_message_time TIME DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE attendance_schedules ADD COLUMN auto_message_audience VARCHAR(50) DEFAULT "absent"'); } catch(e) {}
    try { await pool.query('ALTER TABLE attendance_schedules ADD COLUMN last_auto_message_date DATE NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE attendance_schedules ADD COLUMN is_for_all_students BOOLEAN DEFAULT TRUE'); } catch(e) {}
    try { await pool.query('ALTER TABLE attendance_records ADD COLUMN is_late BOOLEAN DEFAULT FALSE'); } catch(e) {}
    try { await pool.query('ALTER TABLE attendance_records ADD COLUMN bank_code VARCHAR(50) NOT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE attendance_records ADD COLUMN student_name VARCHAR(100) NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE attendance_records ADD COLUMN remarks TEXT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE floors ADD COLUMN device_name VARCHAR(100) DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE floors ADD COLUMN last_seen DATETIME DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE floors ADD COLUMN current_token VARCHAR(100) DEFAULT NULL'); } catch(e) {}

    // Floor Leaders Table Migration
    await pool.query(`
      CREATE TABLE IF NOT EXISTS floor_leaders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) UNIQUE NULL,
        name VARCHAR(100) NOT NULL,
        phone_number VARCHAR(50) DEFAULT NULL,
        password_hash VARCHAR(255) NOT NULL,
        assigned_floors JSON DEFAULT NULL,
        assigned_sessions JSON DEFAULT NULL,
        floor_id INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    try { await pool.query('ALTER TABLE floor_leaders ADD COLUMN username VARCHAR(100) UNIQUE NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE floor_leaders ADD COLUMN assigned_floors JSON DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE floor_leaders ADD COLUMN assigned_sessions JSON DEFAULT NULL'); } catch(e) {}
    try { await pool.query('ALTER TABLE floor_leaders ADD COLUMN is_active BOOLEAN DEFAULT TRUE'); } catch(e) {}
    try { await pool.query('ALTER TABLE floor_leaders MODIFY COLUMN phone_number VARCHAR(50) NULL'); } catch(e) {}

    // Floor Session Targets Migration
    await pool.query(`
      CREATE TABLE IF NOT EXISTS floor_session_targets (
        floor_id INT NOT NULL,
        session_key VARCHAR(50) NOT NULL,
        target_type VARCHAR(20) NOT NULL DEFAULT 'ALL',
        student_ids JSON,
        PRIMARY KEY (floor_id, session_key)
      )
    `);

    // Student Tags Migration
    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_tags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        color VARCHAR(20) DEFAULT '#6366f1',
        is_system BOOLEAN DEFAULT FALSE,
        description VARCHAR(255) DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_tag_assignments (
        student_id INT NOT NULL,
        tag_id INT NOT NULL,
        assigned_by VARCHAR(50) DEFAULT 'ADMIN',
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (student_id, tag_id)
      )
    `);

    try {
      try {
        await pool.query('ALTER TABLE student_tags ADD COLUMN description VARCHAR(255) NULL');
      } catch (colErr) {}

      try {
        await pool.query(`
          UPDATE student_tags 
          SET name = 'Late', description = 'Comes late to attendance' 
          WHERE name = 'Late 3+ Days'
        `);
      } catch (updErr) {
        try {
          await pool.query(`UPDATE student_tags SET name = 'Late' WHERE name = 'Late 3+ Days'`);
        } catch (e) {}
      }

      try {
        await pool.query(`
          INSERT INTO student_tags (id, name, color, is_system, description) VALUES
          (1, 'Regular', '#10b981', TRUE, 'Consistent daily attendance (>=75%)'),
          (2, 'Irregular', '#f59e0b', TRUE, 'Inconsistent attendance / frequent absences'),
          (3, 'Late', '#ef4444', TRUE, 'Comes late to attendance')
          ON DUPLICATE KEY UPDATE name = VALUES(name), color = VALUES(color), description = VALUES(description), is_system = TRUE
        `);
      } catch (insErr) {
        try {
          await pool.query(`
            INSERT INTO student_tags (id, name, color, is_system) VALUES
            (1, 'Regular', '#10b981', TRUE),
            (2, 'Irregular', '#f59e0b', TRUE),
            (3, 'Late', '#ef4444', TRUE)
            ON DUPLICATE KEY UPDATE name = VALUES(name), color = VALUES(color), is_system = TRUE
          `);
        } catch (e) {}
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS attendance_absent_reasons (
          id INT AUTO_INCREMENT PRIMARY KEY,
          student_id INT NOT NULL,
          session_date DATE NOT NULL,
          reason TEXT NOT NULL,
          is_justified BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX (student_id),
          INDEX (session_date)
        )
      `);
      try { await pool.query('ALTER TABLE attendance_absent_reasons ADD COLUMN session_type VARCHAR(50) DEFAULT "night"'); } catch(e) {}

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ai_tag_analysis_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          student_id INT NOT NULL,
          assigned_tag VARCHAR(50) NOT NULL,
          reason TEXT,
          analyzed_days INT DEFAULT 20,
          analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX (student_id),
          INDEX (analyzed_at)
        )
      `);

      // Device & IP Multi-Account Security Tables
      await pool.query(`
        CREATE TABLE IF NOT EXISTS device_ip_bindings (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ip_address VARCHAR(50) NOT NULL,
          student_id INT NOT NULL,
          student_code VARCHAR(50) NOT NULL,
          student_name VARCHAR(100) NOT NULL,
          device_uuid VARCHAR(100) DEFAULT NULL,
          last_login_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          is_locked BOOLEAN DEFAULT FALSE,
          is_whitelisted BOOLEAN DEFAULT FALSE,
          UNIQUE KEY uk_ip_student (ip_address, student_id),
          INDEX (ip_address),
          INDEX (student_id)
        )
      `);
      try { await pool.query('ALTER TABLE device_ip_bindings ADD COLUMN is_whitelisted BOOLEAN DEFAULT FALSE'); } catch(e) {}
      try { await pool.query('ALTER TABLE device_ip_bindings ADD COLUMN is_locked BOOLEAN DEFAULT FALSE'); } catch(e) {}
      try { await pool.query('ALTER TABLE attendance_records ADD COLUMN remarks VARCHAR(255) NULL'); } catch(e) {}


      await pool.query(`
        CREATE TABLE IF NOT EXISTS device_ip_security_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ip_address VARCHAR(50) NOT NULL,
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
          INDEX (ip_address),
          INDEX (primary_student_id),
          INDEX (attempted_student_id),
          INDEX (attempted_at)
        )
      `);
    } catch(e) {}

    console.log('Database schema auto-migration successful.');
  } catch (err) {
    console.error(`Error migrating schema: ${err.message}`);
  }
})();

app.get('/api/migrate-room', async (req, res) => {
  res.send('Schema migrations now run automatically on backend startup.');
});

app.get('/api/force-cleanup', async (req, res) => {
  const pool = require('./config/db');
  const https = require('https');
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

    if (!apiData || !apiData.data) {
      return res.status(500).send('No data from API');
    }

    let logs = [];
    let deletedCount = 0;
    logs.push(`Total students from external API: ${apiData.data.length}`);
    
    for (const extStudent of apiData.data) {
      if (!extStudent.bankCode) continue;
      const canonicalUsername = extStudent.bankCode;
      
      const roomRaw = extStudent.room ? extStudent.room.toString().trim() : '';
      if (!roomRaw || roomRaw === 'null' || roomRaw === '') {
        const [existing] = await pool.query('SELECT id, name FROM students WHERE student_code = ?', [canonicalUsername]);
        if (existing.length > 0) {
          const sid = existing[0].id;
          logs.push(`Deleting ${existing[0].name} (Bank: ${canonicalUsername}, No Room)`);
          
          try {
            await pool.query('DELETE FROM rebind_requests WHERE student_id = ?', [sid]);
            await pool.query('DELETE FROM attendance_records WHERE TRIM(LEADING \'0\' FROM bank_code) = TRIM(LEADING \'0\' FROM ?)', [canonicalUsername]);
            await pool.query('DELETE FROM students WHERE id = ?', [sid]);
            deletedCount++;
          } catch(err) {
            logs.push(`ERROR DELETING ${canonicalUsername}: ${err.message}`);
          }
        }
      }
    }
    
    logs.push(`Cleanup complete! Successfully deleted ${deletedCount} unassigned students.`);
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM students');
    logs.push(`Total students remaining in database: ${total}`);
    
    res.type('text/plain').send(logs.join('\n'));
    
  } catch(e) {
    res.status(500).type('text/plain').send(`Fatal Error during cleanup:\n${e.stack}`);
  }
});

// ------------------------------------------------------------
// GET /api/schedule-data
// Returns dynamic attendance sessions data (session name, start/end/late times, etc.)
// ------------------------------------------------------------
app.get('/api/schedule-data', async (req, res) => {
  try {
    const includeInactive = req.query.all === 'true' || req.query.include_inactive === 'true';
    let query = 'SELECT * FROM attendance_schedules';
    if (!includeInactive) {
      query += ' WHERE is_active = TRUE';
    }
    query += ' ORDER BY start_time ASC';

    const [rows] = await pool.query(query);

    const formattedSessions = rows.map(r => ({
      id: r.id,
      session_key: r.session_key,
      session_name: r.session_name,
      start_time: r.start_time,
      end_time: r.end_time,
      late_time: r.late_time || null,
      is_for_all_students: r.is_for_all_students !== undefined ? Boolean(r.is_for_all_students) : true,
      icon_name: r.icon_name || 'moon',
      is_active: r.is_active !== undefined ? Boolean(r.is_active) : true,
      linked_session_key: r.linked_session_key || null,
      auto_message: r.auto_message || null,
      auto_message_time: r.auto_message_time || null,
      auto_message_audience: r.auto_message_audience || 'all',
      auto_message_student: r.auto_message_student || null,
      auto_message_parent: r.auto_message_parent || null,
      created_at: r.created_at
    }));

    return res.json(formattedSessions);
  } catch (err) {
    console.error('Error in /api/schedule-data:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve schedule data',
      error: err.message
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/rebind', rebindRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/floors', floorsRoutes);
app.use('/api/esp32', esp32Routes);
app.use('/api/version', versionRoutes);
const whatsappService = require('./services/whatsapp');
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/leaders', leadersRoutes);

// Fallback error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ success: false, message: err.message || 'Unexpected server error' });
});

// Prevent Node process from crashing on uncaught exceptions in production
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Attendance backend running on http://localhost:${PORT}`);
  // Auto-connect WhatsApp if credentials exist
  whatsappService.connectWhatsApp().catch(err => console.error('Auto-connect failed:', err));
});
