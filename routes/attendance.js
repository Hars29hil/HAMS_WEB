const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyStudent, verifyFloorLeader, verifyAdminOrFloorLeader, verifyOperator } = require('../middleware/auth');
const admin = require('../config/firebase');
const crypto = require('crypto');
const { getCurrentIST } = require('../utils/time');
const leaveService = require('../services/leaveService');

const SECRET_KEY = process.env.AES_SECRET_KEY || 'HAMS_SECRET_KEY!'; // Must be 16 bytes for AES-128

const MIN_RSSI = parseInt(process.env.MIN_RSSI || '-100', 10);

const { 
  normalizeHHMM, 
  isTimeInWindow, 
  resolveScheduleForDate, 
  getSessionDateTimes 
} = require('../utils/scheduleHelper');

// Helper to check if a floor leader has write/edit permissions for a specific session
function checkLeaderWritePermission(req, sessionKey) {
  if (!req.leader) return true; // Admins / super users have full access
  const sKey = (sessionKey || '').toLowerCase().trim();
  let perms = req.leader.session_permissions;
  if (typeof perms === 'string') {
    try { perms = JSON.parse(perms); } catch(e) { perms = {}; }
  }
  perms = perms || {};

  let mode = perms[sKey];
  if (!mode) {
    for (const k of Object.keys(perms)) {
      if (k.toLowerCase().trim() === sKey) {
        mode = perms[k];
        break;
      }
    }
  }
  if (!mode) {
    mode = perms['all'] || 'edit';
  }

  return mode === 'edit';
}


// ------------------------------------------------------------
// GET /api/attendance/schedule-data
// Returns dynamic session schedules
// ------------------------------------------------------------
router.get('/schedule-data', async (req, res) => {
  try {
    try { await pool.query('ALTER TABLE attendance_schedules ADD COLUMN day_schedules JSON DEFAULT NULL'); } catch(e) {}
    const includeInactive = req.query.all === 'true' || req.query.include_inactive === 'true';
    let query = 'SELECT * FROM attendance_schedules';
    if (!includeInactive) {
      query += ' WHERE is_active = TRUE';
    }
    query += ' ORDER BY start_time ASC';

    const [rows] = await pool.query(query);
    const now = getCurrentIST();

    const formattedSessions = rows.map(r => {
      const resolved = resolveScheduleForDate(r, now);
      let daySchedules = r.day_schedules;
      if (typeof daySchedules === 'string') {
        try { daySchedules = JSON.parse(daySchedules); } catch(e) { daySchedules = []; }
      }
      return {
        id: r.id,
        session_key: r.session_key,
        session_name: r.session_name,
        start_time: resolved.start_time || normalizeHHMM(r.start_time),
        end_time: resolved.end_time || normalizeHHMM(r.end_time),
        late_time: resolved.late_time || (r.late_time ? normalizeHHMM(r.late_time) : null),
        day_schedules: Array.isArray(daySchedules) && daySchedules.length > 0 ? daySchedules : (resolved.day_schedules || []),
        is_for_all_students: r.is_for_all_students !== undefined ? Boolean(r.is_for_all_students) : true,
        icon_name: r.icon_name || 'users',
        is_active: r.is_active !== undefined ? Boolean(r.is_active) : true,
        linked_session_key: r.linked_session_key || null,
        auto_message: r.auto_message || null,
        auto_message_time: r.auto_message_time || null,
        auto_message_audience: r.auto_message_audience || 'absent',
        auto_message_student: r.auto_message_student || r.auto_message || null,
        auto_message_parent: r.auto_message_parent || null,
        created_at: r.created_at
      };
    });

    return res.json(formattedSessions);
  } catch (err) {
    console.error('Error in /api/attendance/schedule-data:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve schedule data',
      error: err.message
    });
  }
});

// ------------------------------------------------------------
// GET /api/attendance/my-status
// Returns the student's attendance status for today
// ------------------------------------------------------------
router.get('/my-status', verifyStudent, async (req, res) => {
  try {
    const studentId = req.student.id;
    const floorId = req.student.floor_id || 0; // Default to 0 if undefined to prevent mysql2 crash

    // Keep student IP and active binding updated in background
    try {
      const { getClientIp } = require('../services/deviceSecurity');
      const clientIp = getClientIp(req);
      if (clientIp && studentId) {
        pool.query('UPDATE students SET last_known_ip = ?, last_login_at = NOW() WHERE id = ?', [clientIp, studentId]).catch(()=>{});
        pool.query('UPDATE device_ip_bindings SET ip_address = ?, last_login_at = NOW() WHERE student_id = ?', [clientIp, studentId]).catch(()=>{});
      }
    } catch (ipErr) {}

    // Fetch all schedules from dynamic table
    const [scheduleRows] = await pool.query(
      'SELECT session_key, session_name, icon_name, start_time, end_time, late_time, day_schedules, is_for_all_students FROM attendance_schedules WHERE is_active = TRUE ORDER BY start_time ASC'
    );
    
    const now = getCurrentIST();
    const sessionDate = now.toISOString().slice(0, 10);

    const allSchedules = scheduleRows.map(r => {
      const resolved = resolveScheduleForDate(r, now);
      let daySchedules = r.day_schedules;
      if (typeof daySchedules === 'string') {
        try { daySchedules = JSON.parse(daySchedules); } catch(e) { daySchedules = []; }
      }

      let activeDays = [];
      let defaultTimeSlot = null;
      if (Array.isArray(daySchedules) && daySchedules.length > 0) {
        for (const slot of daySchedules) {
          if (Array.isArray(slot.days)) {
            activeDays.push(...slot.days);
            if (!defaultTimeSlot && (slot.startTime || slot.start_time)) {
              defaultTimeSlot = slot;
            }
          }
        }
      }
      const uniqueDays = Array.from(new Set(activeDays));
      const isEveryDay = uniqueDays.length === 7 || uniqueDays.length === 0;
      const isScheduledToday = resolved.is_active_today !== false && resolved.start_time !== '00:00';
      const slotStartTime = defaultTimeSlot ? (defaultTimeSlot.startTime || defaultTimeSlot.start_time) : r.start_time;
      const slotEndTime = defaultTimeSlot ? (defaultTimeSlot.endTime || defaultTimeSlot.end_time) : r.end_time;

      return {
        session_key: r.session_key,
        session_name: r.session_name || r.session_key,
        icon_name: r.icon_name || 'moon',
        start_time: resolved.start_time,
        end_time: resolved.end_time,
        late_time: resolved.late_time,
        base_start_time: slotStartTime ? normalizeHHMM(slotStartTime) : '21:00',
        base_end_time: slotEndTime ? normalizeHHMM(slotEndTime) : '21:30',
        day_schedules: resolved.day_schedules,
        is_for_all_students: r.is_for_all_students,
        is_active_today: isScheduledToday,
        scheduled_days: uniqueDays,
        days_label: isEveryDay ? 'Every day' : uniqueDays.join(', ')
      };
    });

    const schedules = {};
    for (const row of allSchedules) {
      schedules[row.session_key] = { 
        start: row.start_time, 
        end: row.end_time, 
        name: row.session_name,
        start_time: row.start_time,
        end_time: row.end_time,
        is_active_today: row.is_active_today,
        days_label: row.days_label
      };
    }

    let activeSession = null;
    for (const sched of allSchedules) {
      if (sched.is_active_today && sched.start_time !== '00:00' && isTimeInWindow(now, sched.start_time, sched.end_time)) {
        activeSession = sched;
        break;
      }
    }

    let attendanceActive = activeSession !== null;
    let activeSessionType = activeSession ? activeSession.session_key : null;
    let activeSessionName = activeSession ? activeSession.session_name : (allSchedules.find(s => s.is_active_today)?.session_name || allSchedules[0]?.session_name || 'Night Attendance');
    let startTimeStr = activeSession ? activeSession.start_time : '';
    let endTimeStr = activeSession ? activeSession.end_time : '';

    // Ensure fallback for legacy app expecting 'night' in schedules
    if (!schedules.night) {
      const nightSchedule = allSchedules.find(s => s.session_key === 'night') || allSchedules[0];
      if (nightSchedule) {
        schedules.night = {
          start: nightSchedule.start_time,
          end: nightSchedule.end_time,
          name: nightSchedule.session_name,
          start_time: nightSchedule.start_time,
          end_time: nightSchedule.end_time
        };
      } else {
        schedules.night = {
          start: startTimeStr,
          end: endTimeStr,
          name: 'Night Attendance',
          start_time: startTimeStr,
          end_time: endTimeStr
        };
      }
    }

    let alreadyMarked = false;
    let bankCode = null;

    const [studentRows] = await pool.query('SELECT student_code FROM students WHERE id = ?', [studentId]);
    if (studentRows.length > 0) {
      bankCode = studentRows[0].student_code;
      
      if (attendanceActive && activeSession) {
        const isForAll = activeSession.is_for_all_students === 1 || activeSession.is_for_all_students === true || activeSession.is_for_all_students === '1' || activeSession.is_for_all_students === null || activeSession.is_for_all_students === undefined;
        
        if (!isForAll) {
          // Enforce Floor Leader Targets
          const [targetRows] = await pool.query(
            'SELECT target_type, student_ids FROM floor_session_targets WHERE floor_id = ? AND session_key = ?',
            [floorId, activeSessionType]
          );
          if (targetRows.length > 0) {
            const target = targetRows[0];
            if (target.target_type === 'SELECTED') {
              let ids = [];
              try {
                ids = typeof target.student_ids === 'string' ? JSON.parse(target.student_ids) : (target.student_ids || []);
              } catch (e) {
                ids = [];
              }
              const studentCodeClean = String(bankCode || '').replace(/^0+/, '');
              const studentIdStr = String(studentId);
              const isIncluded = Array.isArray(ids) && ids.some(id => {
                const idClean = String(id).replace(/^0+/, '');
                return idClean === studentCodeClean || idClean === studentIdStr;
              });
              if (!isIncluded) {
                attendanceActive = false;
                activeSessionType = null;
              }
            }
          }
        }
      }
      
      if (activeSessionType) {
        // 1. Check local database first
        const [sessions] = await pool.query('SELECT id FROM attendance_sessions WHERE session_date = ? AND session_type = ?', [sessionDate, activeSessionType]);
        if (sessions.length > 0) {
          const sessionIds = sessions.map(s => s.id);
          const [localRecords] = await pool.query(
            'SELECT session_id FROM attendance_records WHERE session_id IN (?) AND (bank_code = ? OR TRIM(LEADING "0" FROM bank_code) = TRIM(LEADING "0" FROM ?))', 
            [sessionIds, bankCode, bankCode]
          );
          if (localRecords.length > 0) {
            alreadyMarked = true;
          }
        }
      }
    }

    // 2. Fetch from Night Attendance API as fallback (only for night session)
    if (!alreadyMarked && bankCode && attendanceActive && activeSessionType === 'night') {
      try {
        const https = require('https');
        const apiData = await new Promise((resolve) => {
          const req = https.get(`https://api.avdvvn.org/public/getAttendance?date=${sessionDate}&type=night`, {
            headers: { 'x-hsh-auth-token': 'aF92Kx7QmN4Lp8Vz' },
            timeout: 2500
          }, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
              try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
            });
          });
          req.on('error', () => resolve(null));
          req.on('timeout', () => { req.destroy(); resolve(null); });
        });

        if (apiData && apiData.auth && apiData.data) {
          const match = apiData.data.find(s => String(s.bankCode).replace(/^0+(?=\d)/, '') === String(bankCode).replace(/^0+(?=\d)/, ''));
          if (match) {
            alreadyMarked = true;
          }
        }
      } catch (e) {}
    }

    const payload = {
      success: true,
      status: 'ok',
      already_marked: alreadyMarked,
      start_time: startTimeStr,
      end_time: endTimeStr,
      attendance_active: attendanceActive,
      active_session_type: activeSessionType,
      session_name: activeSessionName,
      all_schedules: allSchedules,
      schedules: schedules,
      data: {
        already_marked: alreadyMarked,
        start_time: startTimeStr,
        end_time: endTimeStr,
        attendance_active: attendanceActive,
        active_session_type: activeSessionType,
        session_name: activeSessionName,
        all_schedules: allSchedules,
        schedules: schedules
      }
    };

    return res.json(payload);
  } catch (err) {
    console.error('Error in /my-status:', err);
    return res.status(500).json({ success: false, message: 'Could not check attendance status. Please try again.' });
  }
});

// ------------------------------------------------------------
// GET /api/attendance/schedule
// ------------------------------------------------------------
router.get('/schedule', async (req, res) => {
  try {
    try { await pool.query('ALTER TABLE attendance_schedules ADD COLUMN day_schedules JSON DEFAULT NULL'); } catch(e) {}
    const type = (req.query.type || 'night').toLowerCase();
    const [rows] = await pool.query(
      'SELECT start_time, end_time, late_time, linked_session_key, auto_message, auto_message_student, auto_message_parent, auto_message_time, auto_message_audience, auto_alerts_config, is_for_all_students, day_schedules FROM attendance_schedules WHERE LOWER(session_key) = LOWER(?)',
      [type]
    );
    let startTimeStr = '00:00';
    let endTimeStr = '00:00';
    let lateTimeStr = null;
    let linkedSessionKey = null;
    let autoMessage = null;
    let autoMessageStudent = null;
    let autoMessageParent = null;
    let autoMessageTime = null;
    let autoMessageAudience = 'all';
    let autoAlertsConfig = null;
    let daySchedules = [];

    if (rows.length > 0) {
      startTimeStr = rows[0].start_time;
      endTimeStr = rows[0].end_time;
      lateTimeStr = rows[0].late_time;
      linkedSessionKey = rows[0].linked_session_key;
      autoMessage = rows[0].auto_message_student || rows[0].auto_message;
      autoMessageStudent = rows[0].auto_message_student || rows[0].auto_message;
      autoMessageParent = rows[0].auto_message_parent;
      autoMessageTime = rows[0].auto_message_time;
      autoMessageAudience = rows[0].auto_message_audience;
      if (rows[0].day_schedules) {
        try {
          daySchedules = typeof rows[0].day_schedules === 'string' ? JSON.parse(rows[0].day_schedules) : rows[0].day_schedules;
        } catch(e) {
          daySchedules = [];
        }
      }
      if (rows[0].auto_alerts_config) {
        try {
          autoAlertsConfig = typeof rows[0].auto_alerts_config === 'string' ? JSON.parse(rows[0].auto_alerts_config) : rows[0].auto_alerts_config;
        } catch(e) {
          autoAlertsConfig = null;
        }
      }
    }

    if (!autoAlertsConfig || typeof autoAlertsConfig !== 'object') {
      autoAlertsConfig = {
        absent: {
          enabled: Boolean(autoMessageStudent || autoMessageParent),
          target: (autoMessageStudent && autoMessageParent) ? 'both' : (autoMessageParent ? 'parent' : 'student'),
          student_message: autoMessageStudent || 'Dear {name}, you were marked Absent for {session_name} on {date}. Please contact your floor leader.',
          parent_message: autoMessageParent || 'Respected Parent, your ward {name} (Room {room}) was marked Absent for {session_name} attendance on {date} at AVD Hostel.'
        },
        late: {
          enabled: false,
          target: 'both',
          student_message: 'Dear {name}, you were marked Late for {session_name} on {date}. Please ensure to be on time.',
          parent_message: 'Respected Parent, your ward {name} (Room {room}) arrived Late for {session_name} attendance on {date}.'
        },
        leave: {
          enabled: false,
          target: 'both',
          student_message: 'Dear {name}, your leave for {session_name} on {date} is recorded ({reason}).',
          parent_message: 'Respected Parent, your ward {name} (Room {room}) is on approved leave for {session_name} on {date}.'
        },
        present: {
          enabled: false,
          target: 'both',
          student_message: 'Dear {name}, your attendance for {session_name} on {date} was recorded successfully.',
          parent_message: 'Respected Parent, your ward {name} (Room {room}) was marked Present for {session_name} on {date}.'
        }
      };
    }

    return res.json({
      success: true,
      data: {
        start_time: startTimeStr,
        end_time: endTimeStr,
        late_time: lateTimeStr,
        linked_session_key: linkedSessionKey,
        day_schedules: daySchedules || [],
        auto_message: autoMessage,
        auto_message_student: autoMessageStudent,
        auto_message_parent: autoMessageParent,
        auto_message_time: autoMessageTime,
        auto_message_audience: autoMessageAudience,
        auto_alerts_config: autoAlertsConfig
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// PUT /api/attendance/schedule
// ------------------------------------------------------------
router.put('/schedule', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    try { await pool.query('ALTER TABLE attendance_schedules ADD COLUMN day_schedules JSON DEFAULT NULL'); } catch(e) {}
    const { 
      startTime, 
      endTime, 
      type, 
      lateTime, 
      linkedSessionKey, 
      daySchedules,
      autoMessage, 
      autoMessageStudent, 
      autoMessageParent, 
      autoMessageTime 
    } = req.body;
    const sessionType = (type || 'night').toLowerCase();

    if (!checkLeaderWritePermission(req, sessionType)) {
      return res.status(403).json({ success: false, message: 'You have View-Only permission for this session and cannot modify schedule settings.' });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({ success: false, message: 'Missing startTime or endTime' });
    }

    // Validation: Auto-message time must be AFTER attendance end time
    if (autoMessageTime && autoMessageTime.trim()) {
      const [endH, endM] = endTime.split(':').map(Number);
      const [msgH, msgM] = autoMessageTime.split(':').map(Number);
      const endMins = endH * 60 + endM;
      const msgMins = msgH * 60 + msgM;

      // Handle normal & overnight windows
      const [startH, startM] = startTime.split(':').map(Number);
      const startMins = startH * 60 + startM;

      if (startMins <= endMins) {
        // Normal daytime window (e.g. 07:00 to 19:30)
        if (msgMins <= endMins) {
          return res.status(400).json({
            success: false,
            message: `Automated message time (${autoMessageTime}) must be set AFTER attendance end time (${endTime})!`
          });
        }
      }
    }

    const studentMsg = (autoMessageStudent !== undefined ? autoMessageStudent : autoMessage) || null;
    const parentMsg = autoMessageParent !== undefined ? autoMessageParent : null;
    let alertsConfigJson = null;
    if (req.body.autoAlertsConfig) {
      alertsConfigJson = typeof req.body.autoAlertsConfig === 'object' ? JSON.stringify(req.body.autoAlertsConfig) : req.body.autoAlertsConfig;
    }

    let daySchedulesJson = null;
    if (daySchedules) {
      daySchedulesJson = typeof daySchedules === 'object' ? JSON.stringify(daySchedules) : daySchedules;
    }

    const [updateRes] = await pool.query(
      `UPDATE attendance_schedules 
       SET start_time = ?, end_time = ?, late_time = ?, linked_session_key = ?, 
           day_schedules = ?,
           auto_message = ?, auto_message_student = ?, auto_message_parent = ?, auto_message_time = ?, auto_message_audience = 'absent',
           auto_alerts_config = COALESCE(?, auto_alerts_config)
       WHERE LOWER(session_key) = LOWER(?)`,
      [
        startTime, 
        endTime, 
        lateTime || null, 
        linkedSessionKey || null, 
        daySchedulesJson,
        (studentMsg && studentMsg.trim()) ? studentMsg.trim() : null,
        (studentMsg && studentMsg.trim()) ? studentMsg.trim() : null,
        (parentMsg && parentMsg.trim()) ? parentMsg.trim() : null,
        (autoMessageTime && autoMessageTime.trim()) ? autoMessageTime.trim() : null,
        alertsConfigJson,
        sessionType
      ]
    );

    if (updateRes.affectedRows === 0) {
      const defaultName = sessionType.charAt(0).toUpperCase() + sessionType.slice(1) + ' Attendance';
      await pool.query(
        `INSERT INTO attendance_schedules (session_key, session_name, start_time, end_time, late_time, linked_session_key, day_schedules, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [sessionType, defaultName, startTime, endTime, lateTime || null, linkedSessionKey || null, daySchedulesJson]
      );
    }

    const now = getCurrentIST();
    if (startTime !== endTime) {
      try {
        const [students] = await pool.query('SELECT fcm_token FROM students WHERE fcm_token IS NOT NULL');
        const tokens = students.map(s => s.fcm_token).filter(t => t);

        if (tokens.length > 0) {
          const message = {
            notification: {
              title: `${sessionType} Attendance Update ⏰`,
              body: `The ${sessionType.toLowerCase()} attendance window has been scheduled from ${startTime} to ${endTime}.`,
            },
            tokens: tokens,
          };

          admin.messaging().sendMulticast(message)
            .then((response) => console.log(response.successCount + ' messages sent'))
            .catch((error) => console.error('Error sending FCM:', error));
        }
      } catch (fcmErr) {
        console.error('FCM DB error:', fcmErr);
      }
    }

    return res.json({ success: true, message: `${sessionType} schedule and alert settings updated successfully` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error: ' + (err.sqlMessage || err.message) });
  }
});

// ------------------------------------------------------------
// PUT /api/attendance/schedule/:session_key/auto-message
// ------------------------------------------------------------
router.put('/schedule/:session_key/auto-message', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    const sessionKey = req.params.session_key.toLowerCase();
    if (!checkLeaderWritePermission(req, sessionKey)) {
      return res.status(403).json({ success: false, message: 'You have View-Only permission for this session and cannot modify message settings.' });
    }
    const { auto_message, auto_message_student, auto_message_parent, auto_message_time, auto_message_audience, auto_alerts_config } = req.body;

    // Check against session end time
    if (auto_message_time && auto_message_time.trim()) {
      const [rows] = await pool.query('SELECT end_time, start_time FROM attendance_schedules WHERE session_key = ?', [sessionKey]);
      if (rows.length > 0 && rows[0].end_time) {
        const [endH, endM] = rows[0].end_time.split(':').map(Number);
        const [msgH, msgM] = auto_message_time.split(':').map(Number);
        const endMins = endH * 60 + endM;
        const msgMins = msgH * 60 + msgM;
        if (msgMins <= endMins) {
          return res.status(400).json({
            success: false,
            message: `Automated message time must be set AFTER attendance end time (${rows[0].end_time.slice(0, 5)})!`
          });
        }
      }
    }

    const studentMsg = (auto_message_student !== undefined ? auto_message_student : auto_message) || null;
    const parentMsg = auto_message_parent !== undefined ? auto_message_parent : null;
    let alertsConfigJson = null;
    if (auto_alerts_config) {
      alertsConfigJson = typeof auto_alerts_config === 'object' ? JSON.stringify(auto_alerts_config) : auto_alerts_config;
    }

    await pool.query(
      'UPDATE attendance_schedules SET auto_message = ?, auto_message_student = ?, auto_message_parent = ?, auto_message_time = ?, auto_message_audience = ?, auto_alerts_config = COALESCE(?, auto_alerts_config) WHERE session_key = ?',
      [
        (studentMsg && studentMsg.trim()) ? studentMsg.trim() : null,
        (studentMsg && studentMsg.trim()) ? studentMsg.trim() : null,
        (parentMsg && parentMsg.trim()) ? parentMsg.trim() : null,
        (auto_message_time && auto_message_time.trim()) ? auto_message_time.trim() : null,
        auto_message_audience || 'absent',
        alertsConfigJson,
        sessionKey
      ]
    );

    return res.json({ success: true, message: 'Auto-message saved successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Helper function to send multi-status session alerts
async function processSessionAlerts({ sessionKey, alertsConfig, sessionDate, leader, fallbackStudentTemplate, fallbackParentTemplate }) {
  const { sendMessage } = require('../services/whatsapp');

  const [scheduleRows] = await pool.query(
    'SELECT session_name, start_time, end_time, late_time, auto_message, auto_message_student, auto_message_parent, auto_alerts_config, is_for_all_students FROM attendance_schedules WHERE session_key = ?',
    [sessionKey]
  );

  let activeConfig = alertsConfig;
  if (!activeConfig && scheduleRows.length > 0 && scheduleRows[0].auto_alerts_config) {
    try {
      activeConfig = typeof scheduleRows[0].auto_alerts_config === 'string' ? JSON.parse(scheduleRows[0].auto_alerts_config) : scheduleRows[0].auto_alerts_config;
    } catch(e) {}
  }

  // If no config object, construct from legacy fields
  if (!activeConfig || typeof activeConfig !== 'object') {
    const sTpl = (fallbackStudentTemplate !== undefined ? fallbackStudentTemplate : (scheduleRows[0] && (scheduleRows[0].auto_message_student || scheduleRows[0].auto_message))) || '';
    const pTpl = (fallbackParentTemplate !== undefined ? fallbackParentTemplate : (scheduleRows[0] && scheduleRows[0].auto_message_parent)) || '';
    activeConfig = {
      absent: {
        enabled: Boolean((sTpl && sTpl.trim()) || (pTpl && pTpl.trim())),
        target: (sTpl.trim() && pTpl.trim()) ? 'both' : (pTpl.trim() ? 'parent' : 'student'),
        student_message: sTpl,
        parent_message: pTpl
      },
      late: { enabled: false, target: 'both', student_message: '', parent_message: '' },
      leave: { enabled: false, target: 'both', student_message: '', parent_message: '' },
      present: { enabled: false, target: 'both', student_message: '', parent_message: '' }
    };
  }

  const sessionName = (scheduleRows[0] && scheduleRows[0].session_name) || sessionKey;
  const lateTime = scheduleRows[0] ? scheduleRows[0].late_time : null;
  const isForAll = scheduleRows.length === 0 || scheduleRows[0].is_for_all_students === 1 || scheduleRows[0].is_for_all_students === true;

  let targetFilterClause = '';
  const targetFilterParams = [];

  if (!isForAll) {
    const [targetRows] = await pool.query('SELECT student_ids FROM floor_session_targets WHERE session_key = ? AND target_type = "SELECTED"', [sessionKey]);
    let assignedStudentIds = [];
    for (const tr of targetRows) {
      let sids = tr.student_ids;
      if (typeof sids === 'string') {
        try { sids = JSON.parse(sids); } catch(e) { sids = []; }
      }
      if (Array.isArray(sids)) {
        assignedStudentIds.push(...sids.map(id => String(id).trim()));
      }
    }

    if (assignedStudentIds.length === 0) {
      return { success: true, count: 0, message: 'No students are assigned to this selective session.' };
    }

    targetFilterClause += ' AND (s.id IN (?) OR s.student_code IN (?) OR TRIM(LEADING "0" FROM s.student_code) IN (?))';
    targetFilterParams.push(assignedStudentIds, assignedStudentIds, assignedStudentIds);
  }

  if (leader) {
    const leaderFloors = Array.isArray(leader.assigned_floors) && leader.assigned_floors.length > 0
      ? leader.assigned_floors.map(f => parseInt(f, 10))
      : (leader.floor_id !== undefined ? [parseInt(leader.floor_id, 10)] : []);
    if (leaderFloors.length > 0) {
      targetFilterClause += ' AND s.floor_id IN (?)';
      targetFilterParams.push(leaderFloors);
    }
  }

  // Fetch all eligible active students
  const [students] = await pool.query(`
    SELECT 
      s.id,
      s.phone_number as phone, 
      s.father_phone as fatherPhone,
      s.mother_phone as motherPhone,
      s.parent_phone as parentPhone,
      s.name, 
      s.student_code as bankCode, 
      s.room_number as roomNumber, 
      s.floor_id as floorId
    FROM students s
    WHERE s.is_active = TRUE ${targetFilterClause}
    ORDER BY s.name ASC
  `, targetFilterParams);

  if (students.length === 0) {
    return { success: true, count: 0, message: 'No students found.' };
  }

  // Fetch session attendance records for this date
  const [records] = await pool.query(`
    SELECT TRIM(LEADING '0' FROM ar.bank_code) as clean_bank_code, ar.bank_code, ar.marked_at, ar.is_late
    FROM attendance_records ar
    JOIN attendance_sessions ses ON ar.session_id = ses.id
    WHERE (DATE(ses.session_date) = ? OR LEFT(ses.session_date, 10) = ? OR ses.session_date = ?) 
      AND (LOWER(ses.session_type) = LOWER(?) OR LOWER(REPLACE(ses.session_type, '_', '')) = LOWER(REPLACE(?, '_', '')) OR LOWER(ses.session_type) LIKE CONCAT(LOWER(?), '%'))
  `, [sessionDate, sessionDate, sessionDate, sessionKey, sessionKey, sessionKey]);

  const recordMap = new Map();
  records.forEach(r => {
    if (r.student_id) recordMap.set(String(r.student_id), r);
    if (r.clean_bank_code) recordMap.set(String(r.clean_bank_code), r);
    if (r.bank_code) recordMap.set(String(r.bank_code).trim(), r);
  });

  // Fetch approved student leaves for this date
  const [leaves] = await pool.query(`
    SELECT student_id, TRIM(LEADING '0' FROM bank_code) as clean_bank_code, bank_code, reason
    FROM student_leaves
    WHERE status = 'approved' AND ? BETWEEN DATE(start_time) AND DATE(end_time)
  `, [sessionDate]);

  const leaveMap = new Map();
  leaves.forEach(l => {
    if (l.student_id) leaveMap.set(String(l.student_id), l);
    if (l.clean_bank_code) leaveMap.set(String(l.clean_bank_code), l);
    if (l.bank_code) leaveMap.set(String(l.bank_code).trim(), l);
  });

  // Classify students into categories: absent, late, leave, present
  const categorized = {
    absent: [],
    late: [],
    leave: [],
    present: []
  };

  for (const student of students) {
    const cleanCode = String(student.bankCode || '').replace(/^0+/, '');
    const rec = recordMap.get(String(student.id)) || (cleanCode ? recordMap.get(cleanCode) : null) || recordMap.get(String(student.bankCode));
    const lev = leaveMap.get(String(student.id)) || (cleanCode ? leaveMap.get(cleanCode) : null) || leaveMap.get(String(student.bankCode));

    let status = 'absent';
    let reason = '';

    if (rec) {
      if (rec.record_status === 'Late') {
        status = 'late';
      } else if (lateTime && rec.created_at) {
        const recTime = new Date(rec.created_at).toISOString().slice(11, 16);
        status = recTime >= lateTime ? 'late' : 'present';
      } else {
        status = 'present';
      }
    } else if (lev) {
      status = 'leave';
      reason = lev.reason || 'Approved Leave';
    } else {
      status = 'absent';
    }

    categorized[status].push({ ...student, status, reason });
  }

  // Format message helper
  const formatMessage = (tpl, student) => {
    let msg = tpl;
    msg = msg.replace(/{name}/gi, student.name || 'Student');
    msg = msg.replace(/{student_name}/gi, student.name || 'Student');
    msg = msg.replace(/{session_name}/gi, sessionName);
    msg = msg.replace(/{date}/gi, sessionDate);
    msg = msg.replace(/{room}/gi, student.roomNumber || 'N/A');
    msg = msg.replace(/{floor}/gi, student.floorId !== undefined ? `Floor ${student.floorId}` : '');
    msg = msg.replace(/{reason}/gi, student.reason || '');
    msg = msg.replace(/{status}/gi, student.status ? student.status.toUpperCase() : '');
    msg = msg.replace(/{student_phone}/gi, student.phone || '');
    msg = msg.replace(/{parent_phone}/gi, student.parentPhone || student.fatherPhone || student.motherPhone || '');
    return msg;
  };

  // Run dispatch asynchronously in background
  (async () => {
    let totalSent = 0;
    const categories = ['absent', 'late', 'leave', 'present'];

    for (const cat of categories) {
      const cfg = activeConfig[cat];
      if (!cfg || !cfg.enabled) continue;

      const targetAudience = cfg.target || 'both'; // 'student' | 'parent' | 'both'
      const studentTpl = (cfg.student_message || '').trim();
      const parentTpl = (cfg.parent_message || '').trim();
      const studentList = categorized[cat] || [];

      console.log(`[Alert Dispatch] Processing ${studentList.length} students for category "${cat}" (Target: ${targetAudience})...`);

      for (const student of studentList) {
        // Send to Student
        if ((targetAudience === 'student' || targetAudience === 'both') && studentTpl && student.phone) {
          const sMsg = formatMessage(studentTpl, student);
          try {
            await sendMessage(student.phone, sMsg);
            totalSent++;
            console.log(`[Alert Dispatch][${cat}] Sent student msg to ${student.name} (${student.phone})`);
          } catch(err) {
            console.error(`[Alert Dispatch][${cat}] Student send error (${student.phone}):`, err.message);
          }
          await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 800));
        }

        // Send to Parent
        const parentDestination = student.parentPhone || student.fatherPhone || student.motherPhone;
        if ((targetAudience === 'parent' || targetAudience === 'both') && parentTpl && parentDestination) {
          const pMsg = formatMessage(parentTpl, student);
          try {
            await sendMessage(parentDestination, pMsg);
            totalSent++;
            console.log(`[Alert Dispatch][${cat}] Sent parent msg for ${student.name} to (${parentDestination})`);
          } catch(err) {
            console.error(`[Alert Dispatch][${cat}] Parent send error (${parentDestination}):`, err.message);
          }
          await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 800));
        }
      }
    }

    console.log(`[Alert Dispatch] Finished dispatching for session ${sessionName}. Total WhatsApp messages sent: ${totalSent}`);
  })();

  const enabledCount = Object.keys(categorized).reduce((acc, k) => {
    if (activeConfig[k] && activeConfig[k].enabled) return acc + categorized[k].length;
    return acc;
  }, 0);

  return {
    success: true,
    message: `Alert dispatch initiated for ${enabledCount} matching recipient(s). Delivery running in background.`,
    counts: {
      absent: categorized.absent.length,
      late: categorized.late.length,
      leave: categorized.leave.length,
      present: categorized.present.length
    }
  };
}

// ------------------------------------------------------------
// POST /api/attendance/session/:session_key/send-session-alerts
// ------------------------------------------------------------
router.post('/session/:session_key/send-session-alerts', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    const sessionKey = req.params.session_key.toLowerCase();
    if (!checkLeaderWritePermission(req, sessionKey)) {
      return res.status(403).json({ success: false, message: 'You have View-Only permission for this session and cannot send alerts.' });
    }
    const { alertsConfig, date, studentMessageTemplate, parentMessageTemplate, messageTemplate } = req.body;
    const sessionDate = date || getCurrentIST().toISOString().slice(0, 10);

    const result = await processSessionAlerts({
      sessionKey,
      alertsConfig,
      sessionDate,
      leader: req.leader,
      fallbackStudentTemplate: studentMessageTemplate || messageTemplate,
      fallbackParentTemplate: parentMessageTemplate
    });

    return res.json(result);
  } catch(err) {
    console.error('Error sending session alerts:', err);
    return res.status(500).json({ success: false, message: 'Server error sending alerts: ' + (err.sqlMessage || err.message) });
  }
});

// ------------------------------------------------------------
// POST /api/attendance/session/:session_key/send-absent-alerts (Alias)
// ------------------------------------------------------------
router.post('/session/:session_key/send-absent-alerts', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    const sessionKey = req.params.session_key.toLowerCase();
    if (!checkLeaderWritePermission(req, sessionKey)) {
      return res.status(403).json({ success: false, message: 'You have View-Only permission for this session and cannot send alerts.' });
    }
    const { alertsConfig, date, studentMessageTemplate, parentMessageTemplate, messageTemplate } = req.body;
    const sessionDate = date || getCurrentIST().toISOString().slice(0, 10);

    const result = await processSessionAlerts({
      sessionKey,
      alertsConfig,
      sessionDate,
      leader: req.leader,
      fallbackStudentTemplate: studentMessageTemplate || messageTemplate,
      fallbackParentTemplate: parentMessageTemplate
    });

    return res.json(result);
  } catch(err) {
    console.error('Error sending absent alerts:', err);
    return res.status(500).json({ success: false, message: 'Server error sending alerts: ' + (err.sqlMessage || err.message) });
  }
});

// ------------------------------------------------------------
// GET /api/attendance/leave
// ------------------------------------------------------------
router.get('/leave', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const axios = require('axios');

    let url = 'https://api.avdvvn.org/public/getTmpLeave';
    const params = [];
    if (startDate) params.push(`startDate=${startDate}`);
    if (endDate) params.push(`endDate=${endDate}`);
    if (params.length > 0) {
      url += '?' + params.join('&');
    }

    const response = await axios.get(url, {
      headers: {
        'x-hsh-auth-token': 'aF92Kx7QmN4Lp8Vz'
      }
    });

    return res.json(response.data);
  } catch (error) {
    console.error('Error fetching tmp leave:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch leave data' });
  }
});

// ------------------------------------------------------------

// GET /api/attendance/debug-reports
// ------------------------------------------------------------
router.get('/debug-reports', async (req, res) => {
  try {
    const [res1] = await pool.query('DESCRIBE attendance_records');
    const [res2] = await pool.query('DESCRIBE attendance_sessions');
    
    // Test the actual query too
    let err1 = null;
    let counts = null;
    try {
      const [sessionCounts] = await pool.query(`
        SELECT session_type, COUNT(id) as total
        FROM attendance_sessions
        GROUP BY session_type
      `);
      counts = sessionCounts;
    } catch(e) { err1 = e.toString(); }

    return res.json({ success: true, records: res1, sessions: res2, err1, counts });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.toString() });
  }
});

// ------------------------------------------------------------
// GET /api/attendance/debug-sql
// ------------------------------------------------------------
router.get('/debug-sql', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.json({ success: false, message: 'No query' });
    const [rows] = await pool.query(query);
    return res.json({ success: true, data: rows });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.toString() });
  }
});

// Helper: Check if student has Parent Control tag (allows login & marking on Chrome)
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
    console.error('[hasParentControlTag in Attendance Error]', err);
    return false;
  }
}

// ------------------------------------------------------------
// POST /api/attendance/mark
// ------------------------------------------------------------
router.post('/mark', verifyStudent, async (req, res) => {
  try {
    // 0. Enforce Browser / Device Authorization: Bluefy on iPhone OR Parent Control Tag
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const isBluefy = userAgent.includes('bluefy');

    if (!isBluefy) {
      const studentId = req.student?.id;
      const studentCode = req.student?.student_code;
      const isParentControlAllowed = await hasParentControlTag(studentId, studentCode);
      if (!isParentControlAllowed) {
        return res.status(403).json({
          success: false,
          code: 'UNAUTHORIZED_DEVICE_OR_BROWSER',
          message: 'You are not authorized. Please login again.'
        });
      }
    }

    const { rssi } = req.body;
    if (rssi === undefined) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const floorId = req.student.floor_id || 0;
    const studentId = req.student.id;

    // Fetch all schedules from dynamic table
    const [scheduleRows] = await pool.query(
      'SELECT session_key, start_time, end_time, linked_session_key, late_time, day_schedules FROM attendance_schedules WHERE is_active = TRUE'
    );
    
    const now = getCurrentIST();
    let activeSessionType = null;
    let activeSchedule = null;
    
    for (const row of scheduleRows) {
      const resolved = resolveScheduleForDate(row, now);
      if (resolved.is_active_today && resolved.start_time !== '00:00' && isTimeInWindow(now, resolved.start_time, resolved.end_time)) {
        activeSessionType = row.session_key;
        activeSchedule = { start: resolved.start_time, end: resolved.end_time };
        break;
      }
    }

    if (!activeSessionType) {
      return res.status(400).json({ success: false, code: 'NO_ACTIVE_SESSION', message: 'Attendance window is currently closed' });
    }

    const { startDt, endDt } = getSessionDateTimes(now.toISOString().slice(0, 10), activeSchedule?.start || '00:00', activeSchedule?.end || '23:59');

    // Enforce Floor Leader & Session Targets
    const [sessInfo] = await pool.query('SELECT is_for_all_students FROM attendance_schedules WHERE session_key = ?', [activeSessionType]);
    const isForAll = sessInfo.length === 0 || sessInfo[0].is_for_all_students === null || sessInfo[0].is_for_all_students === true || sessInfo[0].is_for_all_students === 1;

    const [targetRows] = await pool.query(
      'SELECT target_type, student_ids FROM floor_session_targets WHERE floor_id = ? AND session_key = ?',
      [floorId, activeSessionType]
    );

    if (!isForAll) {
      let isTargeted = false;
      if (targetRows.length > 0) {
        let ids = targetRows[0].student_ids || [];
        if (typeof ids === 'string') {
          try { ids = JSON.parse(ids); } catch (e) { ids = []; }
        }
        if (Array.isArray(ids) && (
          ids.includes(req.student.student_code) ||
          ids.includes(req.student.id) ||
          ids.includes(Number(req.student.id)) ||
          ids.includes(String(req.student.id))
        )) {
          isTargeted = true;
        }
      }
      if (!isTargeted) {
        return res.status(403).json({ success: false, code: 'NOT_TARGETED', message: 'You are not assigned to attend this session' });
      }
    } else if (targetRows.length > 0 && targetRows[0].target_type === 'SELECTED') {
      let ids = targetRows[0].student_ids || [];
      if (typeof ids === 'string') {
        try { ids = JSON.parse(ids); } catch (e) { ids = []; }
      }
      if (Array.isArray(ids) && !(
        ids.includes(req.student.student_code) ||
        ids.includes(req.student.id) ||
        ids.includes(Number(req.student.id)) ||
        ids.includes(String(req.student.id))
      )) {
        return res.status(403).json({ success: false, code: 'NOT_TARGETED', message: 'You are not assigned to attend this session' });
      }
    }

    if (rssi < MIN_RSSI) {
      return res.status(403).json({ success: false, code: 'WEAK_SIGNAL', message: 'Move closer to the classroom device' });
    }

    const sessionDate = now.toISOString().slice(0, 10);

    let [sessions] = await pool.query(
      `SELECT id FROM attendance_sessions WHERE session_date = ? AND session_type = ?`,
      [sessionDate, activeSessionType]
    );

    let activeSessionId;
    if (sessions.length === 0) {
      const [result] = await pool.query(
        `INSERT INTO attendance_sessions (session_date, starts_at, ends_at, session_type)
         VALUES (?, ?, ?, ?)`,
        [sessionDate, startDt, endDt, activeSessionType]
      );
      activeSessionId = result.insertId;
    } else {
      activeSessionId = sessions[0].id;
    }

    let [students] = await pool.query('SELECT student_code, name FROM students WHERE id = ?', [studentId]);
    if (students.length === 0) {
      if (req.student && req.student.student_code) {
        students = [{ student_code: req.student.student_code, name: req.student.name || 'Student' }];
      } else {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
    }

    const bankCode = students[0].student_code;
    const studentName = students[0].name;

    // Check if already marked for this session
    const [existing] = await pool.query(
      "SELECT session_id FROM attendance_records WHERE session_id = ? AND TRIM(LEADING '0' FROM bank_code) = TRIM(LEADING '0' FROM ?)",
      [activeSessionId, bankCode]
    );

    if (existing.length > 0) {
      return res.status(200).json({ success: true, message: 'Attendance already marked for today' });
    }

    // --- Late Logic ---
    const activeScheduleRow = scheduleRows.find(r => r.session_key === activeSessionType);
    let isLate = false;
    if (activeScheduleRow && activeScheduleRow.late_time) {
       const [lateH, lateM] = activeScheduleRow.late_time.split(':').map(Number);
       let lateDt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), lateH, lateM, 0));
       // Handle cross-midnight late times (e.g., if late_time is 01:00 and now is 23:30)
       if (startDt.getTime() > endDt.getTime() && now.getUTCHours() > 12 && lateH < 12) {
          lateDt.setUTCDate(lateDt.getUTCDate() + 1);
       }
       if (now > lateDt) {
          isLate = true;
          // Check how many times they've been late this month
          const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
          const [lateCountRes] = await pool.query(
             "SELECT COUNT(*) as count FROM attendance_records WHERE TRIM(LEADING '0' FROM bank_code) = TRIM(LEADING '0' FROM ?) AND is_late = TRUE AND marked_at >= ?",
             [bankCode, monthStart]
          );
          if (lateCountRes[0].count >= 10) {
             return res.status(403).json({ success: false, code: 'LATE_LIMIT_EXCEEDED', message: 'You have exceeded the maximum allowed late days this month (10).' });
          }
       }
    }

    // Store in local MySQL DB
    await pool.query(
      `INSERT INTO attendance_records (session_id, bank_code, student_name, floor_id, device_uuid, rssi, ble_token_used, is_late)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [activeSessionId, bankCode, studentName, floorId, 'NA', rssi, 'BEACON_ONLY', isLate]
    );

    // --- Linked Session Logic ---
    if (activeSchedule && activeSchedule.linked_session_key) {
        let [linkedSessions] = await pool.query(
          `SELECT id FROM attendance_sessions WHERE session_date = ? AND session_type = ?`,
          [sessionDate, activeSchedule.linked_session_key]
        );
        let linkedSessionId;
        if (linkedSessions.length === 0) {
          const [result] = await pool.query(
            `INSERT INTO attendance_sessions (session_date, starts_at, ends_at, session_type) VALUES (?, ?, ?, ?)`,
            [sessionDate, startDt, endDt, activeSchedule.linked_session_key]
          );
          linkedSessionId = result.insertId;
        } else {
          linkedSessionId = linkedSessions[0].id;
        }
        
        await pool.query(
          `INSERT IGNORE INTO attendance_records (session_id, bank_code, student_name, floor_id, device_uuid, rssi, ble_token_used, is_late)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [linkedSessionId, bankCode, studentName, floorId, 'NA', rssi, 'LINKED_AUTO', false]
        );
    }

    console.log(`[INFO] Attendance marked successfully for ${bankCode}.`);
    return res.status(201).json({ success: true, message: 'Attendance marked successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error: ' + (err.sqlMessage || err.message) });
  }
});

// ------------------------------------------------------------
// POST /api/attendance/manual-mark (OPERATOR ONLY)
// ------------------------------------------------------------
router.post('/manual-mark', verifyOperator, async (req, res) => {
  try {
    const { bank_code, session_key } = req.body;
    if (!bank_code) {
      return res.status(400).json({ success: false, message: 'Missing bank code' });
    }

    // 1. Find student
    let studentId = null;
    let floorId = 0;
    let studentName = req.body.student_name || 'Unknown';
    
    // Default floor extraction from room string (e.g. "913" -> 9)
    if (req.body.room) {
        const match = req.body.room.toString().match(/^(\d)/);
        if (match) floorId = parseInt(match[1], 10);
    }

    const [students] = await pool.query('SELECT id, student_code, name, floor_id, is_active FROM students WHERE CAST(student_code AS UNSIGNED) = CAST(? AS UNSIGNED)', [bank_code]);
    if (students.length > 0) {
      const student = students[0];
      studentId = student.id;
      floorId = student.floor_id;
      studentName = student.name;
      if (!student.is_active) {
        await pool.query('UPDATE students SET is_active = TRUE WHERE id = ?', [studentId]);
      }
    } else {
      const [insertRes] = await pool.query(
        'INSERT INTO students (student_code, name, is_active, floor_id) VALUES (?, ?, 1, ?)', 
        [bank_code, studentName, floorId]
      );
      studentId = insertRes.insertId;
    }

    // 2. Find active session
    const [scheduleRows] = await pool.query(
      'SELECT session_key, start_time, end_time, late_time, day_schedules FROM attendance_schedules WHERE is_active = TRUE'
    );
    
    const now = getCurrentIST();
    let activeSessionType = null;
    let activeSchedule = null;
    
    if (session_key) {
      const targetRow = scheduleRows.find(r => r.session_key === session_key);
      const resolved = targetRow ? resolveScheduleForDate(targetRow, now) : null;
      if (resolved && resolved.is_active_today && resolved.start_time !== '00:00' && isTimeInWindow(now, resolved.start_time, resolved.end_time)) {
        activeSessionType = session_key;
        activeSchedule = { start: resolved.start_time, end: resolved.end_time };
      }
    } else {
      for (const row of scheduleRows) {
        const resolved = resolveScheduleForDate(row, now);
        if (resolved.is_active_today && resolved.start_time !== '00:00' && isTimeInWindow(now, resolved.start_time, resolved.end_time)) {
          activeSessionType = row.session_key;
          activeSchedule = { start: resolved.start_time, end: resolved.end_time };
          break;
        }
      }
    }

    if (!activeSessionType) {
      return res.status(400).json({ success: false, message: 'No active attendance session currently open.' });
    }

    const sessionDate = now.toISOString().slice(0, 10);
    const { startDt, endDt } = getSessionDateTimes(sessionDate, activeSchedule?.start || '00:00', activeSchedule?.end || '23:59');

    let [sessions] = await pool.query(
      `SELECT id FROM attendance_sessions WHERE session_date = ? AND session_type = ?`,
      [sessionDate, activeSessionType]
    );

    let activeSessionId;
    if (sessions.length === 0) {
      const [result] = await pool.query(
        `INSERT INTO attendance_sessions (session_date, starts_at, ends_at, session_type)
         VALUES (?, ?, ?, ?)`,
        [sessionDate, startDt, endDt, activeSessionType]
      );
      activeSessionId = result.insertId;
    } else {
      activeSessionId = sessions[0].id;
    }

    // 3. Check if already marked
    const [existing] = await pool.query(
      "SELECT session_id FROM attendance_records WHERE session_id = ? AND TRIM(LEADING '0' FROM bank_code) = TRIM(LEADING '0' FROM ?)",
      [activeSessionId, bank_code]
    );

    if (existing.length > 0) {
      return res.status(200).json({ success: true, message: 'Attendance already marked' });
    }

    // --- Late Logic ---
    const activeScheduleRow = scheduleRows.find(r => r.session_key === activeSessionType);
    let isLate = false;
    if (activeScheduleRow && activeScheduleRow.late_time) {
       const [lateH, lateM] = activeScheduleRow.late_time.split(':').map(Number);
       let lateDt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), lateH, lateM, 0));
       if (startDt.getTime() > endDt.getTime() && now.getUTCHours() > 12 && lateH < 12) {
          lateDt.setUTCDate(lateDt.getUTCDate() + 1);
       }
       if (now > lateDt) {
          isLate = true;
          const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
          const [lateCountRes] = await pool.query(
             "SELECT COUNT(*) as count FROM attendance_records WHERE TRIM(LEADING '0' FROM bank_code) = TRIM(LEADING '0' FROM ?) AND is_late = TRUE AND marked_at >= ?",
             [bank_code, monthStart]
          );
          if (lateCountRes[0].count >= 10) {
             return res.status(403).json({ success: false, code: 'LATE_LIMIT_EXCEEDED', message: 'Student exceeded the maximum allowed late days this month (10).' });
          }
       }
    }

    // 4. Insert record
    await pool.query(
      `INSERT INTO attendance_records (session_id, bank_code, student_name, floor_id, device_uuid, rssi, ble_token_used, is_late)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [activeSessionId, bank_code, studentName, floorId, 'MANUAL', 0, 'MANUAL_ENTRY', isLate]
    );

    // --- Linked Session Logic ---
    if (activeSchedule && activeSchedule.linked_session_key) {
        let [linkedSessions] = await pool.query(
          `SELECT id FROM attendance_sessions WHERE session_date = ? AND session_type = ?`,
          [sessionDate, activeSchedule.linked_session_key]
        );
        let linkedSessionId;
        if (linkedSessions.length === 0) {
          const [result] = await pool.query(
            `INSERT INTO attendance_sessions (session_date, starts_at, ends_at, session_type) VALUES (?, ?, ?, ?)`,
            [sessionDate, startDt, endDt, activeSchedule.linked_session_key]
          );
          linkedSessionId = result.insertId;
        } else {
          linkedSessionId = linkedSessions[0].id;
        }
        
        await pool.query(
          `INSERT IGNORE INTO attendance_records (session_id, bank_code, student_name, floor_id, device_uuid, rssi, ble_token_used, is_late)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [linkedSessionId, bank_code, studentName, floorId, 'MANUAL', 0, 'LINKED_AUTO_MANUAL', false]
        );
    }

    // Call External Apps Script Webhook asynchronously
    if (process.env.APPS_SCRIPT_URL) {
      try {
        axios.post(process.env.APPS_SCRIPT_URL, {
          action: 'mark_attendance',
          bank_code: bank_code,
          floor_id: floorId,
          session_type: activeSessionType,
          timestamp: new Date().toISOString()
        }).catch(err => {
          console.error(`[WARN] Failed to trigger Apps Script: ${err.message}`);
        });
      } catch (err) {
        console.error(`[WARN] Failed to trigger Apps Script: ${err.message}`);
      }
    }

    return res.status(201).json({ success: true, message: 'Manual attendance marked successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error: ' + (err.sqlMessage || err.message) });
  }
});

// ------------------------------------------------------------
// GET /api/attendance/session/:id/records
// ------------------------------------------------------------
router.get('/session/:id/records', verifyFloorLeader, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT bank_code as student_code, student_name as name, rssi, marked_at
       FROM attendance_records
       WHERE session_id = ? AND floor_id = ?
       ORDER BY marked_at ASC`,
      [req.params.id, req.leader.floor_id]
    );
    return res.json({ success: true, records: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// DELETE /api/attendance/session/:type/records (and aliases)
// Delete all attendance records and absent justifications for a session on a date
// ------------------------------------------------------------
const handleDeleteSessionAttendance = async (req, res) => {
  try {
    const sessionType = (req.params.type || 'night').toLowerCase();
    if (!checkLeaderWritePermission(req, sessionType)) {
      return res.status(403).json({ success: false, message: 'You have View-Only permission for this session and cannot delete records.' });
    }
    const rawDate = req.query.date || req.body.date || new Date().toISOString().slice(0, 10);
    const sessionDate = typeof rawDate === 'string' ? rawDate.slice(0, 10) : new Date().toISOString().slice(0, 10);

    let floorCondition = '';
    let leaderFloors = null;

    if (req.leader) {
      leaderFloors = Array.isArray(req.leader.assigned_floors) && req.leader.assigned_floors.length > 0
        ? req.leader.assigned_floors.map(f => parseInt(f, 10)).filter(f => !isNaN(f))
        : (req.leader.floor_id !== undefined && !isNaN(parseInt(req.leader.floor_id, 10)) ? [parseInt(req.leader.floor_id, 10)] : []);
      if (leaderFloors.length > 0) {
        floorCondition = 'AND floor_id IN (?)';
      }
    }

    // 1. Find matching sessions
    const [sessions] = await pool.query(
      `SELECT id FROM attendance_sessions 
       WHERE (DATE(session_date) = ? OR LEFT(session_date, 10) = ? OR session_date = ?)
         AND (LOWER(session_type) = LOWER(?) OR LOWER(REPLACE(session_type, '_', '')) = LOWER(REPLACE(?, '_', '')) OR LOWER(session_type) LIKE CONCAT(LOWER(?), '%'))`,
      [sessionDate, sessionDate, sessionDate, sessionType, sessionType, sessionType]
    );

    let deletedRecords = 0;
    if (sessions.length > 0) {
      const sessionIds = sessions.map(s => s.id);
      let delQuery = 'DELETE FROM attendance_records WHERE session_id IN (?)';
      let delParams = [sessionIds];

      if (floorCondition && leaderFloors && leaderFloors.length > 0) {
        delQuery += ' ' + floorCondition;
        delParams.push(leaderFloors);
      }

      const [delResult] = await pool.query(delQuery, delParams);
      deletedRecords = delResult.affectedRows || 0;

      // If user is admin (no leader floor restriction), also clean up session from attendance_sessions
      if (!req.leader) {
        await pool.query('DELETE FROM attendance_sessions WHERE id IN (?)', [sessionIds]);
      }
    }

    // 2. Also delete absent justification records for this session and date
    let absentQuery = `
      DELETE FROM attendance_absent_reasons 
      WHERE (session_date = ? OR DATE(session_date) = ?) 
        AND (LOWER(session_type) = LOWER(?) OR session_type IS NULL)
    `;
    let absentParams = [sessionDate, sessionDate, sessionType];

    if (req.leader && leaderFloors && leaderFloors.length > 0) {
      absentQuery += ' AND student_id IN (SELECT id FROM students WHERE floor_id IN (?))';
      absentParams.push(leaderFloors);
    }

    await pool.query(absentQuery, absentParams);

    return res.json({
      success: true,
      message: `Successfully deleted attendance for ${sessionType} on ${sessionDate}.`,
      deleted_count: deletedRecords
    });
  } catch (err) {
    console.error('Error deleting session attendance:', err);
    return res.status(500).json({ success: false, message: 'Server error deleting attendance: ' + (err.sqlMessage || err.message) });
  }
};

router.delete('/session/:type/records', verifyAdminOrFloorLeader, handleDeleteSessionAttendance);
router.delete('/session/:type/clear', verifyAdminOrFloorLeader, handleDeleteSessionAttendance);
router.delete('/session/:type/attendance', verifyAdminOrFloorLeader, handleDeleteSessionAttendance);

// ------------------------------------------------------------
// POST /api/attendance/gateway-sync
// ------------------------------------------------------------
router.post('/gateway-sync', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.GATEWAY_API_KEY) {
      return res.status(401).json({ success: false, message: 'Unauthorized Gateway' });
    }

    const { student_id, device_id, floor_id, rssi, token } = req.body;
    if (!student_id || !device_id || !floor_id || !token) {
      return res.status(400).json({ success: false, message: 'Missing fields' });
    }

    const [students] = await pool.query('SELECT student_code, name FROM students WHERE name = ?', [student_id]);
    if (students.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    const bankCode = students[0].student_code;
    const studentName = students[0].name;

    const sessionDate = new Date().toISOString().slice(0, 10);
    const [sessions] = await pool.query(
      `SELECT id FROM attendance_sessions WHERE session_date = ?`,
      [sessionDate]
    );

    let activeSessionId;
    if (sessions.length === 0) {
      const [settingsRows] = await pool.query('SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ("DAILY_START_TIME", "DAILY_END_TIME")');
      let startTimeStr = '21:00';
      let endTimeStr = '21:30';
      for (const row of settingsRows) {
        if (row.setting_key === 'DAILY_START_TIME') startTimeStr = row.setting_value;
        if (row.setting_key === 'DAILY_END_TIME') endTimeStr = row.setting_value;
      }

      const now = new Date();
      const [startH, startM] = startTimeStr.split(':').map(Number);
      const [endH, endM] = endTimeStr.split(':').map(Number);

      const startDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startH, startM, 0);
      const endDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endH, endM, 0);

      const [result] = await pool.query(
        `INSERT INTO attendance_sessions (session_date, starts_at, ends_at)
         VALUES (?, ?, ?)`,
        [sessionDate, startDt, endDt]
      );
      activeSessionId = result.insertId;
    } else {
      activeSessionId = sessions[0].id;
    }

    try {
      await pool.query(
        `INSERT INTO attendance_records (session_id, bank_code, student_name, floor_id, device_uuid, rssi, ble_token_used)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [activeSessionId, bankCode, studentName, floor_id, device_id, rssi || -50, token]
      );
    } catch (dbErr) {
      if (dbErr.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, message: 'Already marked' });
      }
      throw dbErr;
    }

    return res.json({ success: true, message: 'Synced' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// GET /api/attendance/live
// ------------------------------------------------------------
router.get('/live', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    let floorId = null;
    if (req.leader) {
      floorId = req.leader.floor_id;
    }

    let queryParams = [];
    const sessionDate = new Date().toISOString().slice(0, 10);

    let sessionsQuery = 'SELECT id FROM attendance_sessions WHERE session_date = ?';
    let sessionsParams = [sessionDate];

    if (floorId !== null) {
      sessionsQuery += ' AND floor_id = ?';
      sessionsParams.push(floorId);
    }

    const [sessions] = await pool.query(sessionsQuery, sessionsParams);

    if (sessions.length === 0) {
      return res.json({ success: true, records: [] });
    }

    const sessionIds = sessions.map(s => s.id);

    let recordsQuery = `
       SELECT ar.bank_code as student_code, ar.student_name as name, ar.rssi, ar.marked_at, f.floor_name
       FROM attendance_records ar
       LEFT JOIN floors f ON ar.floor_id = f.floor_id
       WHERE ar.session_id IN (?)
    `;
    let recordsParams = [sessionIds];

    if (floorId !== null) {
      recordsQuery += ' AND ar.floor_id = ?';
      recordsParams.push(floorId);
    }

    recordsQuery += ' ORDER BY ar.marked_at DESC';

    const [rows] = await pool.query(recordsQuery, recordsParams);

    return res.json({ success: true, records: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// GET /api/attendance/export
// ------------------------------------------------------------
router.get('/export', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    const sessionDate = req.query.date || new Date().toISOString().slice(0, 10);

    const query = `
       SELECT ar.bank_code as student_code, ar.student_name as name, f.floor_name, ar.marked_at
       FROM attendance_records ar
       LEFT JOIN floors f ON ar.floor_id = f.floor_id
       JOIN attendance_sessions ses ON ar.session_id = ses.id
       WHERE ses.session_date = ?
       ORDER BY ar.marked_at DESC
    `;

    const [rows] = await pool.query(query, [sessionDate]);

    const headers = ['Student Code', 'Name', 'Floor', 'Time Marked'];
    const csvRows = [headers.join(',')];

    for (const row of rows) {
      const dateStr = new Date(row.marked_at).toLocaleString();
      const name = `"${(row.name || '').replace(/"/g, '""')}"`;
      const floor = `"${(row.floor_name || '').replace(/"/g, '""')}"`;

      csvRows.push([row.student_code, name, floor, `"${dateStr}"`].join(','));
    }

    const csvData = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${sessionDate}.csv"`);

    return res.send(csvData);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error during export' });
  }
});

// ------------------------------------------------------------
// POST /api/attendance/mark-manual (and /manual-mark alias)
// ------------------------------------------------------------
const handleManualMark = async (req, res) => {
  try {
    const { student_code, student_id, bank_code, session_key, session_type, date, session_date, status, is_late, description, remarks } = req.body;
    const lookupCode = student_code || bank_code;
    const sKey = (session_key || session_type || 'night').toLowerCase();
    if (!checkLeaderWritePermission(req, sKey)) {
      return res.status(403).json({ success: false, message: 'You have View-Only permission for this session and cannot mark attendance.' });
    }
    const sDate = session_date || date || getCurrentIST().toISOString().slice(0, 10);
    const lateFlag = is_late === true || is_late === 1 || String(status).toLowerCase() === 'late';
    const noteText = description || remarks || null;

    if (!lookupCode && !student_id) {
      return res.status(400).json({ success: false, message: 'Missing student identifier (student_code or student_id)' });
    }

    // 1. Find student
    let student = null;
    if (student_id) {
      const [rows] = await pool.query('SELECT id, student_code, name, floor_id, is_active FROM students WHERE id = ?', [student_id]);
      if (rows.length > 0) student = rows[0];
    }
    if (!student && lookupCode) {
      const [rows] = await pool.query(
        'SELECT id, student_code, name, floor_id, is_active FROM students WHERE student_code = ? OR CAST(student_code AS UNSIGNED) = CAST(? AS UNSIGNED)',
        [lookupCode, lookupCode]
      );
      if (rows.length > 0) student = rows[0];
    }

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found in database' });
    }

    // 2. Find or create attendance session
    const [scheduleRows] = await pool.query(
      'SELECT session_key, start_time, end_time, linked_session_key FROM attendance_schedules WHERE session_key = ?',
      [sKey]
    );

    const now = getCurrentIST();
    let startDt = now;
    let endDt = now;

    if (scheduleRows.length > 0) {
      const [startH, startM] = (scheduleRows[0].start_time || '21:00').split(':').map(Number);
      const [endH, endM] = (scheduleRows[0].end_time || '21:30').split(':').map(Number);
      const y = parseInt(sDate.slice(0, 4), 10);
      const m = parseInt(sDate.slice(5, 7), 10) - 1;
      const d = parseInt(sDate.slice(8, 10), 10);
      startDt = new Date(Date.UTC(y, m, d, startH, startM, 0));
      endDt = new Date(Date.UTC(y, m, d, endH, endM, 0));
    }

    let [sessions] = await pool.query(
      'SELECT id FROM attendance_sessions WHERE session_date = ? AND LOWER(session_type) = LOWER(?)',
      [sDate, sKey]
    );

    let activeSessionId;
    if (sessions.length === 0) {
      const [insertSess] = await pool.query(
        'INSERT INTO attendance_sessions (session_date, starts_at, ends_at, session_type) VALUES (?, ?, ?, ?)',
        [sDate, startDt, endDt, sKey]
      );
      activeSessionId = insertSess.insertId;
    } else {
      activeSessionId = sessions[0].id;
    }

    // 3. Upsert attendance record
    const [existing] = await pool.query(
      'SELECT session_id, bank_code FROM attendance_records WHERE session_id = ? AND (TRIM(LEADING "0" FROM bank_code) = TRIM(LEADING "0" FROM ?) OR bank_code = ?)',
      [activeSessionId, student.student_code, student.student_code]
    );

    if (existing.length > 0) {
      await pool.query(
        'UPDATE attendance_records SET is_late = ?, ble_token_used = "MANUAL_ENTRY", remarks = ?, marked_at = CURRENT_TIMESTAMP WHERE session_id = ? AND bank_code = ?',
        [lateFlag ? 1 : 0, noteText, existing[0].session_id, existing[0].bank_code]
      );
    } else {
      await pool.query(
        `INSERT INTO attendance_records (session_id, bank_code, student_name, floor_id, device_uuid, rssi, ble_token_used, is_late, remarks)
         VALUES (?, ?, ?, ?, 'MANUAL', 0, 'MANUAL_ENTRY', ?, ?)`,
        [activeSessionId, student.student_code, student.name, student.floor_id || 0, lateFlag ? 1 : 0, noteText]
      );
    }

    // 4. Handle Linked Session if configured
    if (scheduleRows.length > 0 && scheduleRows[0].linked_session_key) {
      const linkedKey = scheduleRows[0].linked_session_key;
      let [linkedSessions] = await pool.query(
        'SELECT id FROM attendance_sessions WHERE session_date = ? AND LOWER(session_type) = LOWER(?)',
        [sDate, linkedKey]
      );
      let linkedSessionId;
      if (linkedSessions.length === 0) {
        const [resLink] = await pool.query(
          'INSERT INTO attendance_sessions (session_date, starts_at, ends_at, session_type) VALUES (?, ?, ?, ?)',
          [sDate, startDt, endDt, linkedKey]
        );
        linkedSessionId = resLink.insertId;
      } else {
        linkedSessionId = linkedSessions[0].id;
      }

      await pool.query(
        `INSERT INTO attendance_records (session_id, bank_code, student_name, floor_id, device_uuid, rssi, ble_token_used, is_late, remarks)
         VALUES (?, ?, ?, ?, 'MANUAL', 0, 'LINKED_AUTO_MANUAL', 0, 'Auto-marked from linked session')
         ON DUPLICATE KEY UPDATE is_late = 0`,
        [linkedSessionId, student.student_code, student.name, student.floor_id || 0]
      );
    }

    // 5. Clean up absent justification if it existed
    try {
      await pool.query(
        'DELETE FROM attendance_absent_reasons WHERE student_id = ? AND session_date = ? AND LOWER(session_type) = LOWER(?)',
        [student.id, sDate, sKey]
      );
    } catch(e) {}

    return res.status(200).json({
      success: true,
      message: `Manual attendance marked as ${lateFlag ? 'Late' : 'Present'} for ${student.name}`
    });
  } catch (err) {
    console.error('Error marking manual attendance:', err);
    return res.status(500).json({ success: false, message: 'Server error: ' + (err.sqlMessage || err.message) });
  }
};

router.post('/mark-manual', verifyAdminOrFloorLeader, handleManualMark);
router.post('/manual-mark', verifyAdminOrFloorLeader, handleManualMark);

// ------------------------------------------------------------
// GET /api/attendance/session/:type/targets
// Fetch targets for a session (per floor or all)
// ------------------------------------------------------------
router.get('/session/:type/targets', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    const sessionKey = req.params.type.toLowerCase();
    const floorId = req.query.floor_id;

    let query = 'SELECT floor_id, session_key, target_type, student_ids FROM floor_session_targets WHERE session_key = ?';
    const params = [sessionKey];

    if (floorId !== undefined && floorId !== 'All' && floorId !== 'ALL') {
      query += ' AND floor_id = ?';
      params.push(parseInt(floorId, 10));
    }

    const [rows] = await pool.query(query, params);

    const formatted = rows.map(r => {
      let sids = r.student_ids;
      if (typeof sids === 'string') {
        try { sids = JSON.parse(sids); } catch(e) { sids = []; }
      }
      return {
        floor_id: r.floor_id,
        session_key: r.session_key,
        target_type: r.target_type,
        student_ids: Array.isArray(sids) ? sids : []
      };
    });

    return res.json({ success: true, data: formatted });
  } catch (err) {
    console.error('Error fetching session targets:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// POST /api/attendance/session/:type/targets
// Save student target assignments for a session on a floor
// ------------------------------------------------------------
router.post('/session/:type/targets', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    const sessionKey = req.params.type.toLowerCase();
    if (!checkLeaderWritePermission(req, sessionKey)) {
      return res.status(403).json({ success: false, message: 'You have View-Only permission for this session and cannot modify student targets.' });
    }
    const { floor_id, target_type, student_ids } = req.body;

    if (floor_id === undefined) {
      return res.status(400).json({ success: false, message: 'floor_id is required' });
    }

    const tType = target_type === 'ALL' ? 'ALL' : 'SELECTED';
    const sidsJson = JSON.stringify(Array.isArray(student_ids) ? student_ids : []);

    await pool.query(`
      INSERT INTO floor_session_targets (floor_id, session_key, target_type, student_ids)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE target_type = VALUES(target_type), student_ids = VALUES(student_ids)
    `, [parseInt(floor_id, 10), sessionKey, tType, sidsJson]);

    return res.json({ success: true, message: 'Session student targets updated successfully' });
  } catch (err) {
    console.error('Error updating session targets:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// GET /api/attendance/session/:type/students
// ------------------------------------------------------------
router.get('/session/:type/students', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    const sessionType = (req.params.type || 'night').toLowerCase();
    const rawDate = req.query.date || new Date().toISOString().slice(0, 10);
    const sessionDate = typeof rawDate === 'string' ? rawDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
    
    // Check if session is for all students
    let isForAll = true;
    try {
      const [scheduleRows] = await pool.query('SELECT is_for_all_students FROM attendance_schedules WHERE LOWER(session_key) = ?', [sessionType]);
      if (scheduleRows.length > 0) {
        isForAll = scheduleRows[0].is_for_all_students === 1 || scheduleRows[0].is_for_all_students === true;
      }
    } catch (e) {}

    let floorCondition = '';
    let targetCondition = '';
    let leaderFloors = null;
    let assignedStudentIds = null;
    
    if (req.leader) {
      leaderFloors = Array.isArray(req.leader.assigned_floors) && req.leader.assigned_floors.length > 0
        ? req.leader.assigned_floors.map(f => parseInt(f, 10)).filter(f => !isNaN(f))
        : (req.leader.floor_id !== undefined && !isNaN(parseInt(req.leader.floor_id, 10)) ? [parseInt(req.leader.floor_id, 10)] : []);
      if (leaderFloors.length > 0) {
        floorCondition = 'AND s.floor_id IN (?)';
      }
    }

    if (!isForAll) {
      try {
        const [targetRows] = await pool.query('SELECT student_ids FROM floor_session_targets WHERE LOWER(session_key) = ? AND target_type = "SELECTED"', [sessionType]);
        let studentIdsList = [];
        for (const tr of targetRows) {
          let sids = tr.student_ids;
          if (typeof sids === 'string') {
            try { sids = JSON.parse(sids); } catch(e) { sids = []; }
          }
          if (Array.isArray(sids)) {
            studentIdsList.push(...sids.map(id => String(id).trim()));
          }
        }

        if (studentIdsList.length === 0) {
          return res.json({ success: true, data: [] });
        }

        assignedStudentIds = studentIdsList;
        targetCondition = 'AND (s.id IN (?) OR s.student_code IN (?) OR TRIM(LEADING "0" FROM s.student_code) IN (?))';
      } catch (tErr) {
        console.warn('Target query error:', tErr.message);
      }
    }

    // Auto-mark default attendance students if session exists for this date & type
    try {
      let [sessRows] = await pool.query(
        'SELECT id FROM attendance_sessions WHERE (DATE(session_date) = ? OR session_date = ?) AND LOWER(session_type) = LOWER(?)',
        [sessionDate, sessionDate, sessionType]
      );
      if (sessRows.length > 0) {
        const activeSessId = sessRows[0].id;
        const [defaultStudents] = await pool.query(
          'SELECT id, student_code, name, floor_id FROM students WHERE is_active = TRUE AND is_default_present = TRUE'
        );
        for (const st of defaultStudents) {
          const onLeave = await leaveService.isStudentOnLeave(st.id, st.student_code, sessionDate);
          if (onLeave) continue;
          const [existing] = await pool.query(
            'SELECT session_id FROM attendance_records WHERE session_id = ? AND (TRIM(LEADING "0" FROM bank_code) = TRIM(LEADING "0" FROM ?) OR bank_code = ?)',
            [activeSessId, st.student_code, st.student_code]
          );
          if (existing.length === 0) {
            await pool.query(
              `INSERT INTO attendance_records (session_id, bank_code, student_name, floor_id, device_uuid, rssi, ble_token_used, is_late, remarks)
               VALUES (?, ?, ?, ?, 'AUTO_DEFAULT', 0, 'DEFAULT_AUTO_PRESENT', 0, 'Auto-marked as Default Present')`,
              [activeSessId, st.student_code, st.name, st.floor_id || 0]
            );
          }
        }
      }
    } catch (defErr) {
      console.warn('Auto-mark default present check error:', defErr.message);
    }

    const query = `
      SELECT s.id as student_id, s.student_code, s.name, s.floor_id, s.room_number,
             ar.marked_at, 
             IF(ar.session_id IS NULL, false, true) as is_present,
             COALESCE(ar.is_late, false) as is_late,
             ar.remarks as attendance_remarks,
             aar.reason as absent_reason,
             aar.is_justified,
             sl.id as leave_id,
             sl.reason as leave_reason,
             sl.start_time as leave_start,
             sl.end_time as leave_end
      FROM students s
      LEFT JOIN (
        SELECT 
          TRIM(LEADING '0' FROM ar.bank_code) AS clean_bank_code,
          ar.bank_code,
          MIN(ar.marked_at) AS marked_at,
          MAX(CASE WHEN ar.is_late = TRUE OR ar.is_late = 1 THEN 1 ELSE 0 END) AS is_late,
          MAX(ar.remarks) AS remarks,
          MAX(ar.session_id) AS session_id
        FROM attendance_records ar
        JOIN attendance_sessions ses ON ar.session_id = ses.id
        WHERE (DATE(ses.session_date) = ? OR LEFT(ses.session_date, 10) = ? OR ses.session_date = ?) 
          AND (LOWER(ses.session_type) = LOWER(?) OR LOWER(REPLACE(ses.session_type, '_', '')) = LOWER(REPLACE(?, '_', '')) OR LOWER(ses.session_type) LIKE CONCAT(LOWER(?), '%'))
        GROUP BY TRIM(LEADING '0' FROM ar.bank_code), ar.bank_code
      ) ar ON (
        (ar.clean_bank_code IS NOT NULL AND ar.clean_bank_code != '' AND ar.clean_bank_code = TRIM(LEADING '0' FROM s.student_code)) OR
        ar.bank_code = s.student_code
      )
      LEFT JOIN attendance_absent_reasons aar ON s.id = aar.student_id AND (aar.session_date = ? OR DATE(aar.session_date) = ?) AND (LOWER(aar.session_type) = LOWER(?) OR aar.session_type IS NULL)
      LEFT JOIN student_leaves sl ON (
        (s.id = sl.student_id OR TRIM(LEADING '0' FROM s.student_code) = TRIM(LEADING '0' FROM sl.bank_code))
        AND sl.status = 'approved'
        AND ? BETWEEN DATE(sl.start_time) AND DATE(sl.end_time)
      )
      WHERE s.is_active = TRUE ${floorCondition} ${targetCondition}
      ORDER BY s.name ASC
    `;

    const queryParams = [sessionDate, sessionDate, sessionDate, sessionType, sessionType, sessionType, sessionDate, sessionDate, sessionType, sessionDate];
    if (floorCondition && leaderFloors && leaderFloors.length > 0) {
      queryParams.push(leaderFloors);
    }
    if (targetCondition && assignedStudentIds && assignedStudentIds.length > 0) {
      queryParams.push(assignedStudentIds, assignedStudentIds, assignedStudentIds);
    }

    // Check if session has started or was conducted
    const [recCountRow] = await pool.query(`
      SELECT COUNT(*) as rec_count
      FROM attendance_records ar
      JOIN attendance_sessions ses ON ar.session_id = ses.id
      WHERE (DATE(ses.session_date) = ? OR LEFT(ses.session_date, 10) = ? OR ses.session_date = ?) 
        AND (LOWER(ses.session_type) = LOWER(?) OR LOWER(REPLACE(ses.session_type, '_', '')) = LOWER(REPLACE(?, '_', '')) OR LOWER(ses.session_type) LIKE CONCAT(LOWER(?), '%'))
    `, [sessionDate, sessionDate, sessionDate, sessionType, sessionType, sessionType]);

    const recordCount = recCountRow[0]?.rec_count || 0;
    let sessionStarted = recordCount > 0;

    if (!sessionStarted) {
      const nowIST = getCurrentIST();
      const todayStr = nowIST.toISOString().slice(0, 10);
      if (sessionDate === todayStr) {
        const [sched] = await pool.query('SELECT start_time, end_time FROM attendance_schedules WHERE LOWER(session_key) = ?', [sessionType]);
        if (sched.length > 0) {
          sessionStarted = isTimeInWindow(nowIST, sched[0].start_time, sched[0].end_time);
        }
      }
    }

    const [rows] = await pool.query(query, queryParams);

    // Fetch tags for these students safely
    const tagsMap = {};
    try {
      const [tagRows] = await pool.query(`
        SELECT sta.student_id, t.id as tag_id, t.name, t.color, t.is_system, t.description
        FROM student_tag_assignments sta
        JOIN student_tags t ON sta.tag_id = t.id
      `);
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
    } catch (tagErr) {
      console.warn('Tag fetch warning:', tagErr.message);
    }
    
    const formattedRows = rows.map(r => {
      const isPresent = Boolean(r.is_present && r.is_present !== 0 && r.is_present !== '0');
      const isLate = Boolean(r.is_late && r.is_late !== 0 && r.is_late !== '0');
      const isOnLeave = Boolean(r.leave_id || (r.absent_reason && r.absent_reason.includes('[Approved Leave]')));
      
      let status = 'Absent';
      if (isPresent) {
        status = isLate ? 'Late' : 'Present';
      } else if (isOnLeave) {
        status = 'Leave';
      } else if (!sessionStarted) {
        status = 'Not Started';
      }

      const effectiveReason = r.leave_reason ? `[Approved Leave] ${r.leave_reason}` : (r.absent_reason || null);
      const isJustified = isPresent ? true : (isOnLeave ? true : Boolean(r.is_justified));

      return {
        ...r,
        status,
        session_started: sessionStarted,
        is_justified: isJustified,
        reason: effectiveReason,
        remarks: r.attendance_remarks || (isOnLeave ? (r.leave_reason || 'Approved Leave') : null),
        tags: tagsMap[r.student_id] || []
      };
    });

    return res.json({ success: true, session_started: sessionStarted, total_present: recordCount, data: formattedRows });
  } catch (err) {
    console.error('Error fetching student session attendance:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching student attendance: ' + (err.sqlMessage || err.message) });
  }
});

// ------------------------------------------------------------
// GET /api/attendance/session/:type/absent-reasons
// ------------------------------------------------------------
router.get('/session/:type/absent-reasons', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    const sessionType = (req.params.type || 'night').toLowerCase();
    const rawDate = req.query.date || new Date().toISOString().slice(0, 10);
    const sessionDate = typeof rawDate === 'string' ? rawDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
    
    // Check if session has started or was conducted
    const [recCountRow] = await pool.query(`
      SELECT COUNT(*) as rec_count
      FROM attendance_records ar
      JOIN attendance_sessions ses ON ar.session_id = ses.id
      WHERE (DATE(ses.session_date) = ? OR LEFT(ses.session_date, 10) = ? OR ses.session_date = ?) 
        AND (LOWER(ses.session_type) = LOWER(?) OR LOWER(REPLACE(ses.session_type, '_', '')) = LOWER(REPLACE(?, '_', '')) OR LOWER(ses.session_type) LIKE CONCAT(LOWER(?), '%'))
    `, [sessionDate, sessionDate, sessionDate, sessionType, sessionType, sessionType]);

    const recordCount = recCountRow[0]?.rec_count || 0;
    let sessionStarted = recordCount > 0;

    if (!sessionStarted) {
      const nowIST = getCurrentIST();
      const todayStr = nowIST.toISOString().slice(0, 10);
      if (sessionDate === todayStr) {
        const [sched] = await pool.query('SELECT start_time, end_time FROM attendance_schedules WHERE LOWER(session_key) = ?', [sessionType]);
        if (sched.length > 0) {
          sessionStarted = isTimeInWindow(nowIST, sched[0].start_time, sched[0].end_time);
        }
      }
    }

    if (!sessionStarted) {
      return res.json({ success: true, session_started: false, data: [] });
    }
    
    // Check if session is for all students
    let isForAll = true;
    try {
      const [scheduleRows] = await pool.query('SELECT is_for_all_students FROM attendance_schedules WHERE LOWER(session_key) = ?', [sessionType]);
      if (scheduleRows.length > 0) {
        isForAll = scheduleRows[0].is_for_all_students === 1 || scheduleRows[0].is_for_all_students === true;
      }
    } catch (e) {}

    let floorCondition = '';
    let targetCondition = '';
    let leaderFloors = null;
    let assignedStudentIds = null;
    
    if (req.leader) {
      leaderFloors = Array.isArray(req.leader.assigned_floors) && req.leader.assigned_floors.length > 0
        ? req.leader.assigned_floors.map(f => parseInt(f, 10)).filter(f => !isNaN(f))
        : (req.leader.floor_id !== undefined && !isNaN(parseInt(req.leader.floor_id, 10)) ? [parseInt(req.leader.floor_id, 10)] : []);
      if (leaderFloors.length > 0) {
        floorCondition = 'AND s.floor_id IN (?)';
      }
    }

    if (!isForAll) {
      try {
        const [targetRows] = await pool.query('SELECT student_ids FROM floor_session_targets WHERE LOWER(session_key) = ? AND target_type = "SELECTED"', [sessionType]);
        let studentIdsList = [];
        for (const tr of targetRows) {
          let sids = tr.student_ids;
          if (typeof sids === 'string') {
            try { sids = JSON.parse(sids); } catch(e) { sids = []; }
          }
          if (Array.isArray(sids)) {
            studentIdsList.push(...sids.map(id => String(id).trim()));
          }
        }

        if (studentIdsList.length === 0) {
          return res.json({ success: true, data: [] });
        }

        assignedStudentIds = studentIdsList;
        targetCondition = 'AND (s.id IN (?) OR s.student_code IN (?) OR TRIM(LEADING "0" FROM s.student_code) IN (?))';
      } catch (tErr) {
        console.warn('Target query error:', tErr.message);
      }
    }

    const query = `
      SELECT s.id as student_id, s.student_code, s.name, s.floor_id, s.room_number,
             COALESCE(aar.reason, CONCAT('[Approved Leave] ', sl.reason)) as reason,
             IF(sl.id IS NOT NULL, 1, COALESCE(aar.is_justified, 0)) as is_justified,
             sl.id as leave_id,
             sl.reason as leave_reason
      FROM students s
      LEFT JOIN (
        SELECT 
          TRIM(LEADING '0' FROM ar.bank_code) AS clean_bank_code,
          ar.bank_code,
          MAX(ar.session_id) AS session_id
        FROM attendance_records ar
        JOIN attendance_sessions ses ON ar.session_id = ses.id
        WHERE (DATE(ses.session_date) = ? OR LEFT(ses.session_date, 10) = ? OR ses.session_date = ?) 
          AND (LOWER(ses.session_type) = LOWER(?) OR LOWER(REPLACE(ses.session_type, '_', '')) = LOWER(REPLACE(?, '_', '')) OR LOWER(ses.session_type) LIKE CONCAT(LOWER(?), '%'))
        GROUP BY TRIM(LEADING '0' FROM ar.bank_code), ar.bank_code
      ) ar ON (
        (ar.clean_bank_code IS NOT NULL AND ar.clean_bank_code != '' AND ar.clean_bank_code = TRIM(LEADING '0' FROM s.student_code)) OR
        ar.bank_code = s.student_code
      )
      LEFT JOIN attendance_absent_reasons aar ON s.id = aar.student_id AND (aar.session_date = ? OR DATE(aar.session_date) = ?) AND (LOWER(aar.session_type) = LOWER(?) OR aar.session_type IS NULL)
      LEFT JOIN student_leaves sl ON (
        (s.id = sl.student_id OR TRIM(LEADING '0' FROM s.student_code) = TRIM(LEADING '0' FROM sl.bank_code))
        AND sl.status = 'approved'
        AND ? BETWEEN DATE(sl.start_time) AND DATE(sl.end_time)
      )
      WHERE s.is_active = TRUE AND ar.session_id IS NULL ${floorCondition} ${targetCondition}
      ORDER BY s.name ASC
    `;

    const queryParams = [sessionDate, sessionDate, sessionDate, sessionType, sessionType, sessionType, sessionDate, sessionDate, sessionType, sessionDate];
    if (floorCondition && leaderFloors && leaderFloors.length > 0) {
      queryParams.push(leaderFloors);
    }
    if (targetCondition && assignedStudentIds && assignedStudentIds.length > 0) {
      queryParams.push(assignedStudentIds, assignedStudentIds, assignedStudentIds);
    }

    const [rows] = await pool.query(query, queryParams);

    // Fetch tags safely
    const tagsMap = {};
    try {
      const [tagRows] = await pool.query(`
        SELECT sta.student_id, t.id as tag_id, t.name, t.color, t.is_system, t.description
        FROM student_tag_assignments sta
        JOIN student_tags t ON sta.tag_id = t.id
      `);
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
    } catch (tagErr) {
      console.warn('Tag fetch warning:', tagErr.message);
    }

    const enrichedRows = rows.map(r => ({
      ...r,
      tags: tagsMap[r.student_id] || []
    }));

    return res.json({ success: true, data: enrichedRows });
  } catch (err) {
    console.error('Error fetching absent records:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching absent records: ' + (err.sqlMessage || err.message) });
  }
});

router.post('/session/absent-reason', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    const { student_id, student_code, session_type, session_key, session_date, date, dates, reason, description, is_justified } = req.body;
    const sKey = (session_key || session_type || 'night').toLowerCase();
    if (!checkLeaderWritePermission(req, sKey)) {
      return res.status(403).json({ success: false, message: 'You have View-Only permission for this session and cannot modify absence justifications.' });
    }
    const reasonText = (reason || description || '').trim();

    if (!reasonText) {
      return res.status(400).json({ success: false, message: 'Description is required' });
    }

    let sid = student_id;
    if (!sid && student_code) {
      const [stuRows] = await pool.query('SELECT id FROM students WHERE student_code = ?', [student_code]);
      if (stuRows.length > 0) sid = stuRows[0].id;
    }

    if (!sid) {
      return res.status(400).json({ success: false, message: 'Student ID not found' });
    }

    const targetDates = Array.isArray(dates) && dates.length > 0 ? dates : [session_date || date || getCurrentIST().toISOString().slice(0, 10)];

    // Insert or update the reason for each date
    const query = `
      INSERT INTO attendance_absent_reasons (session_date, session_type, student_id, reason, is_justified)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE reason = VALUES(reason), is_justified = VALUES(is_justified), created_at = CURRENT_TIMESTAMP
    `;
    
    for (const d of targetDates) {
      await pool.query(query, [d, sKey, sid, reasonText, is_justified !== false ? 1 : 0]);
    }
    
    return res.json({ success: true, message: 'Absence justification saved successfully' });
  } catch (err) {
    console.error('Error saving absent reason:', err);
    return res.status(500).json({ success: false, message: 'Server error saving reason: ' + (err.sqlMessage || err.message) });
  }
});

// removed request-token

module.exports = router;
