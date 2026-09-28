const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { verifyAdmin, verifyAdminOrFloorLeader } = require('../middleware/auth');
const { getCurrentIST } = require('../utils/time');

const CODE_EXPIRY_MIN = parseInt(process.env.REBIND_CODE_EXPIRY_MINUTES || '10', 10);

router.use(verifyAdminOrFloorLeader);

// ------------------------------------------------------------
// GET /api/admin/dashboard
// ------------------------------------------------------------
router.get('/dashboard', async (req, res) => {
  try {
    const requestedSessionKey = req.query.session_key || 'recent';
    const rawDate = req.query.date;
    const targetDate = (rawDate && typeof rawDate === 'string' && rawDate.trim())
      ? rawDate.trim().slice(0, 10)
      : new Date().toLocaleDateString('en-CA');

    // Determine if requester is a floor leader
    let leaderFloors = null;
    if (req.leader) {
      if (Array.isArray(req.leader.assigned_floors) && req.leader.assigned_floors.length > 0) {
        leaderFloors = req.leader.assigned_floors.map(f => parseInt(f, 10)).filter(f => !isNaN(f));
      } else if (req.leader.floor_id !== undefined) {
        leaderFloors = [parseInt(req.leader.floor_id, 10)];
      }
    }

    // 1. Total Active Students
    let total_students = 0;
    if (leaderFloors && leaderFloors.length > 0) {
      const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM students WHERE is_active = TRUE AND floor_id IN (?)', [leaderFloors]);
      total_students = count;
    } else {
      const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM students WHERE is_active = TRUE');
      total_students = total;
    }

    // 2. Fetch all configured dynamic sessions
    const [schedules] = await pool.query('SELECT session_key, session_name, icon_name FROM attendance_schedules WHERE is_active = TRUE ORDER BY start_time ASC');
    
    // 3. Find the most recent session taken/created (with records or latest session id on or before targetDate)
    const [recentSessions] = await pool.query(`
      SELECT s.id, s.session_type, s.session_date, s.starts_at, s.ends_at, sch.session_name
      FROM attendance_sessions s
      LEFT JOIN attendance_schedules sch ON s.session_type = sch.session_key
      WHERE s.session_date <= ?
      ORDER BY s.session_date DESC, s.id DESC
      LIMIT 1
    `, [targetDate]);

    let recentSessionKey = 'night';
    let recentSessionName = 'Night Attendance';
    let recentSessionDate = targetDate;

    if (recentSessions.length > 0) {
      recentSessionKey = recentSessions[0].session_type || 'night';
      recentSessionName = recentSessions[0].session_name || (recentSessionKey.charAt(0).toUpperCase() + recentSessionKey.slice(1) + ' Attendance');
      recentSessionDate = recentSessions[0].session_date;
    } else if (schedules.length > 0) {
      recentSessionKey = schedules[0].session_key;
      recentSessionName = schedules[0].session_name;
    }

    // Determine target session to display
    let activeFilterKey = requestedSessionKey;
    if (activeFilterKey === 'recent') {
      activeFilterKey = recentSessionKey;
    }

    let targetSessionName = 'All Combined';
    if (activeFilterKey !== 'all') {
      const foundSched = schedules.find(s => s.session_key === activeFilterKey);
      targetSessionName = foundSched ? foundSched.session_name : (activeFilterKey.charAt(0).toUpperCase() + activeFilterKey.slice(1) + ' Attendance');
    }

    // 4. Compute Present and Late for the target session on targetDate
    let present_today = 0;
    let late_today = 0;

    let sessionCondition = '';
    const sessionParams = [];

    if (activeFilterKey !== 'all') {
      sessionCondition = 'AND s.session_type = ?';
      sessionParams.push(activeFilterKey);
    }

    if (leaderFloors && leaderFloors.length > 0) {
      const [[presentRow]] = await pool.query(`
        SELECT COUNT(DISTINCT TRIM(LEADING '0' FROM ar.bank_code)) AS present_today 
        FROM attendance_records ar
        JOIN attendance_sessions s ON ar.session_id = s.id
        JOIN students st ON (TRIM(LEADING '0' FROM st.student_code) = TRIM(LEADING '0' FROM ar.bank_code) OR ar.student_id = st.id)
        WHERE (s.session_date = ? OR DATE(s.session_date) = ?) AND st.is_active = TRUE AND st.floor_id IN (?) ${sessionCondition}
      `, [targetDate, targetDate, leaderFloors, ...sessionParams]);
      present_today = presentRow ? presentRow.present_today : 0;

      const [[lateRow]] = await pool.query(`
        SELECT COUNT(DISTINCT TRIM(LEADING '0' FROM ar.bank_code)) AS late_today 
        FROM attendance_records ar
        JOIN attendance_sessions s ON ar.session_id = s.id
        JOIN students st ON (TRIM(LEADING '0' FROM st.student_code) = TRIM(LEADING '0' FROM ar.bank_code) OR ar.student_id = st.id)
        WHERE (s.session_date = ? OR DATE(s.session_date) = ?) AND (ar.is_late = TRUE OR ar.is_late = 1) AND st.is_active = TRUE AND st.floor_id IN (?) ${sessionCondition}
      `, [targetDate, targetDate, leaderFloors, ...sessionParams]);
      late_today = lateRow ? parseInt(lateRow.late_today || 0, 10) : 0;
    } else {
      const [[presentRow]] = await pool.query(`
        SELECT COUNT(DISTINCT TRIM(LEADING '0' FROM ar.bank_code)) AS present_today 
        FROM attendance_records ar
        JOIN attendance_sessions s ON ar.session_id = s.id
        JOIN students st ON (TRIM(LEADING '0' FROM st.student_code) = TRIM(LEADING '0' FROM ar.bank_code) OR ar.student_id = st.id)
        WHERE (s.session_date = ? OR DATE(s.session_date) = ?) AND st.is_active = TRUE ${sessionCondition}
      `, [targetDate, targetDate, ...sessionParams]);
      present_today = presentRow ? presentRow.present_today : 0;

      const [[lateRow]] = await pool.query(`
        SELECT COUNT(DISTINCT TRIM(LEADING '0' FROM ar.bank_code)) AS late_today 
        FROM attendance_records ar
        JOIN attendance_sessions s ON ar.session_id = s.id
        JOIN students st ON (TRIM(LEADING '0' FROM st.student_code) = TRIM(LEADING '0' FROM ar.bank_code) OR ar.student_id = st.id)
        WHERE (s.session_date = ? OR DATE(s.session_date) = ?) AND (ar.is_late = TRUE OR ar.is_late = 1) AND st.is_active = TRUE ${sessionCondition}
      `, [targetDate, targetDate, ...sessionParams]);
      late_today = lateRow ? parseInt(lateRow.late_today || 0, 10) : 0;
    }

    let isSessionConductedOrStarted = false;
    if (present_today > 0) {
      isSessionConductedOrStarted = true;
    } else {
      const nowIST = getCurrentIST();
      const todayStr = `${nowIST.getFullYear()}-${String(nowIST.getMonth() + 1).padStart(2, '0')}-${String(nowIST.getDate()).padStart(2, '0')}`;
      
      if (targetDate === todayStr && activeFilterKey !== 'all') {
        const foundSched = schedules.find(s => s.session_key === activeFilterKey);
        if (foundSched && foundSched.start_time && foundSched.end_time) {
          const nowMins = nowIST.getHours() * 60 + nowIST.getMinutes();
          const [sH, sM] = (foundSched.start_time || '00:00').split(':').map(Number);
          const [eH, eM] = (foundSched.end_time || '23:59').split(':').map(Number);
          const startMins = sH * 60 + sM;
          const endMins = eH * 60 + eM;
          if (startMins < endMins) {
            if (nowMins >= startMins) isSessionConductedOrStarted = true;
          } else {
            if (nowMins >= startMins || nowMins <= endMins) isSessionConductedOrStarted = true;
          }
        }
      }
    }

    const absent_today = isSessionConductedOrStarted ? Math.max(0, total_students - present_today) : 0;

    // 5. Compute summary for each available session on targetDate
    let allSessionsQuery = `
      SELECT s.session_type, COUNT(DISTINCT TRIM(LEADING '0' FROM ar.bank_code)) as present_count
      FROM attendance_sessions s
      LEFT JOIN attendance_records ar ON s.id = ar.session_id
      LEFT JOIN students st ON (TRIM(LEADING '0' FROM st.student_code) = TRIM(LEADING '0' FROM ar.bank_code) OR ar.student_id = st.id)
      WHERE (s.session_date = ? OR DATE(s.session_date) = ?) AND (st.is_active = TRUE OR ar.bank_code IS NULL)
    `;
    const allSessionsParams = [targetDate, targetDate];
    if (leaderFloors && leaderFloors.length > 0) {
      allSessionsQuery += ' AND (st.floor_id IN (?) OR ar.bank_code IS NULL)';
      allSessionsParams.push(leaderFloors);
    }
    allSessionsQuery += ' GROUP BY s.session_type';

    const [allSessionsToday] = await pool.query(allSessionsQuery, allSessionsParams);

    const sessionCountsMap = {};
    for (const row of allSessionsToday) {
      sessionCountsMap[row.session_type] = row.present_count;
    }

    const available_sessions = [
      {
        session_key: 'recent',
        session_name: `Recent (${recentSessionName})`,
        icon_name: 'clock',
        actual_key: recentSessionKey,
        present_today: sessionCountsMap[recentSessionKey] || 0
      },
      ...schedules.map(s => ({
        session_key: s.session_key,
        session_name: s.session_name,
        icon_name: s.icon_name || 'calendar',
        actual_key: s.session_key,
        present_today: sessionCountsMap[s.session_key] || 0
      })),
      {
        session_key: 'all',
        session_name: 'All Sessions Combined',
        icon_name: 'users',
        actual_key: 'all',
        present_today: present_today
      }
    ];

    // 6. 7-Day Trend leading up to targetDate
    let weeklySessionCondition = '';
    const weeklySessionParams = [];
    if (activeFilterKey !== 'all') {
      weeklySessionCondition = 'AND s.session_type = ?';
      weeklySessionParams.push(activeFilterKey);
    }

    let weeklyStatsQuery = `
      SELECT 
        s.session_date AS date, 
        COUNT(DISTINCT TRIM(LEADING '0' FROM ar.bank_code)) AS present,
        SUM(CASE WHEN ar.is_late = TRUE THEN 1 ELSE 0 END) AS late
      FROM attendance_sessions s
      JOIN attendance_records ar ON s.id = ar.session_id
      LEFT JOIN students st ON TRIM(LEADING '0' FROM st.student_code) = TRIM(LEADING '0' FROM ar.bank_code)
      WHERE s.session_date BETWEEN DATE_SUB(?, INTERVAL 6 DAY) AND ? AND (st.is_active = TRUE OR ar.bank_code IS NULL)
    `;
    const weeklyStatsParams = [targetDate, targetDate];
    if (leaderFloors && leaderFloors.length > 0) {
      weeklyStatsQuery += ' AND (st.floor_id IN (?) OR ar.bank_code IS NULL)';
      weeklyStatsParams.push(leaderFloors);
    }
    weeklyStatsQuery += ` ${weeklySessionCondition} GROUP BY s.session_date ORDER BY s.session_date ASC`;
    weeklyStatsParams.push(...weeklySessionParams);

    const [weeklyStatsRows] = await pool.query(weeklyStatsQuery, weeklyStatsParams);

    const weekly_stats = weeklyStatsRows.map(row => {
      const dateObj = new Date(row.date);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const presentCount = parseInt(row.present || 0, 10);
      const lateCount = parseInt(row.late || 0, 10);
      const absentCount = Math.max(0, total_students - presentCount);
      return {
        date: `${year}-${month}-${day}`,
        present: presentCount,
        late: lateCount,
        absent: absentCount
      };
    });

    // 7. Floor Status for the selected session on targetDate
    let floorsQuery = 'SELECT floor_id, floor_name FROM floors';
    const floorsParams = [];
    if (leaderFloors && leaderFloors.length > 0) {
      floorsQuery += ' WHERE floor_id IN (?)';
      floorsParams.push(leaderFloors);
    }
    floorsQuery += ' ORDER BY floor_id ASC';
    const [floors] = await pool.query(floorsQuery, floorsParams);

    // Live present count per floor specifically for activeFilterKey on targetDate
    let floorPresentQuery = `
      SELECT st.floor_id, COUNT(DISTINCT TRIM(LEADING '0' FROM ar.bank_code)) AS present_count
      FROM attendance_records ar
      JOIN attendance_sessions s ON ar.session_id = s.id
      JOIN students st ON (TRIM(LEADING '0' FROM st.student_code) = TRIM(LEADING '0' FROM ar.bank_code) OR ar.student_id = st.id)
      WHERE (s.session_date = ? OR DATE(s.session_date) = ?) AND st.is_active = TRUE
    `;
    const floorPresentParams = [targetDate, targetDate];
    if (activeFilterKey !== 'all') {
      floorPresentQuery += ' AND s.session_type = ?';
      floorPresentParams.push(activeFilterKey);
    }
    if (leaderFloors && leaderFloors.length > 0) {
      floorPresentQuery += ' AND st.floor_id IN (?)';
      floorPresentParams.push(leaderFloors);
    }
    floorPresentQuery += ' GROUP BY st.floor_id';

    const [floorPresentRows] = await pool.query(floorPresentQuery, floorPresentParams);
    const floorPresentMap = {};
    for (const row of floorPresentRows) {
      floorPresentMap[row.floor_id] = row.present_count;
    }

    // Floor total active students
    let floorTotalsQuery = 'SELECT floor_id, COUNT(*) AS floor_total FROM students WHERE is_active = TRUE';
    const floorTotalsParams = [];
    if (leaderFloors && leaderFloors.length > 0) {
      floorTotalsQuery += ' AND floor_id IN (?)';
      floorTotalsParams.push(leaderFloors);
    }
    floorTotalsQuery += ' GROUP BY floor_id';
    const [floorTotalRows] = await pool.query(floorTotalsQuery, floorTotalsParams);
    const floorTotalMap = {};
    for (const row of floorTotalRows) {
      floorTotalMap[row.floor_id] = row.floor_total;
    }

    const floor_status = floors.map(f => {
      const present = floorPresentMap[f.floor_id] || 0;
      const total = floorTotalMap[f.floor_id] || 0;
      return {
        floor_id: f.floor_id,
        floor_name: f.floor_name || (f.floor_id === 0 ? 'Ground Floor' : `Floor ${f.floor_id}`),
        present: present,
        present_students: present,
        total: total,
        total_students: total,
        percentage: total > 0 ? Math.round((present / total) * 100) : 0
      };
    });

    // 8. Find students absent for the last 3 actual occurrences of the selected session on or before targetDate
    let distinctDatesQuery = `
      SELECT DISTINCT ses.session_date 
      FROM attendance_sessions ses
      JOIN attendance_records ar ON ses.id = ar.session_id
      WHERE (ses.session_date <= ? OR DATE(ses.session_date) <= ?)
    `;
    const distinctDatesParams = [targetDate, targetDate];
    if (activeFilterKey !== 'all') {
      distinctDatesQuery += ' AND ses.session_type = ?';
      distinctDatesParams.push(activeFilterKey);
    }
    distinctDatesQuery += ' ORDER BY ses.session_date DESC LIMIT 3';

    let distinctDatesRows = [];
    try {
      const [rows] = await pool.query(distinctDatesQuery, distinctDatesParams);
      distinctDatesRows = rows;
    } catch (dErr) {}

    let targetDates = distinctDatesRows.map(r => {
      const d = new Date(r.session_date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    // Only compute consecutive defaulters if at least 3 distinct conducted sessions exist in history
    if (targetDates.length < 3) {
      targetDates = [];
    }

    let activeStudentsQuery = `
      SELECT s.id, s.student_code, s.name, s.floor_id, s.room_number, s.phone_number, f.floor_name
      FROM students s
      LEFT JOIN floors f ON s.floor_id = f.floor_id
      WHERE s.is_active = TRUE
    `;
    const activeStudentsParams = [];
    if (leaderFloors && leaderFloors.length > 0) {
      activeStudentsQuery += ' AND s.floor_id IN (?)';
      activeStudentsParams.push(leaderFloors);
    }
    activeStudentsQuery += ' ORDER BY s.floor_id ASC, s.room_number ASC, s.name ASC';

    const [activeStudents] = await pool.query(activeStudentsQuery, activeStudentsParams);

    let recentAttendanceRecords = [];
    let recentJustifications = [];

    if (targetDates.length > 0) {
      try {
        let recQuery = `
          SELECT TRIM(LEADING '0' FROM ar.bank_code) as bank_code, ses.session_date
          FROM attendance_records ar
          JOIN attendance_sessions ses ON ar.session_id = ses.id
          WHERE ses.session_date IN (?)
        `;
        const recParams = [targetDates];
        if (activeFilterKey !== 'all') {
          recQuery += ' AND ses.session_type = ?';
          recParams.push(activeFilterKey);
        }
        const [recRows] = await pool.query(recQuery, recParams);
        recentAttendanceRecords = recRows || [];
      } catch (recErr) {
        console.warn('Attendance records query warning in dashboard:', recErr.message);
      }

      try {
        let justQuery = `
          SELECT student_id, session_date, reason, is_justified
          FROM attendance_absent_reasons
          WHERE session_date IN (?) AND is_justified = 1
        `;
        const justParams = [targetDates];
        if (activeFilterKey !== 'all') {
          justQuery += ' AND (session_type = ? OR session_type IS NULL)';
          justParams.push(activeFilterKey);
        }
        const [justRows] = await pool.query(justQuery, justParams);
        recentJustifications = justRows || [];
      } catch (justErr) {
        console.warn('Absent reasons query warning in dashboard:', justErr.message);
      }

      // Check student_leaves for target dates
      try {
        const [leaveRows] = await pool.query(`
          SELECT student_id, bank_code, start_time, end_time, reason
          FROM student_leaves
          WHERE status = 'approved' AND (
            DATE(start_time) <= ? AND DATE(end_time) >= ?
          )
        `, [targetDates[0], targetDates[targetDates.length - 1]]);
        
        for (const lv of leaveRows) {
          const lStart = new Date(lv.start_time).toISOString().slice(0, 10);
          const lEnd = new Date(lv.end_time).toISOString().slice(0, 10);
          const cleanBank = lv.bank_code ? String(lv.bank_code).replace(/^0+/, '') : '';

          for (const d of targetDates) {
            if (d >= lStart && d <= lEnd) {
              if (lv.student_id) {
                justifiedSet.add(`${lv.student_id}_${d}`);
                justificationMap.set(`${lv.student_id}_${d}`, `[Approved Leave] ${lv.reason || 'Approved Leave'}`);
              }
              if (cleanBank) {
                justifiedSet.add(`${cleanBank}_${d}`);
                justificationMap.set(`${cleanBank}_${d}`, `[Approved Leave] ${lv.reason || 'Approved Leave'}`);
              }
            }
          }
        }
      } catch (lvErr) {
        console.warn('Leave records query warning in dashboard:', lvErr.message);
      }
    }

    const attendedSet = new Set();
    for (const r of recentAttendanceRecords) {
      const dateStr = new Date(r.session_date).toISOString().slice(0, 10);
      if (r.student_id) attendedSet.add(`${r.student_id}_${dateStr}`);
      if (r.bank_code) attendedSet.add(`${r.bank_code}_${dateStr}`);
    }

    const justifiedSet = new Set();
    const justificationMap = new Map();
    for (const j of recentJustifications) {
      const dateStr = new Date(j.session_date).toISOString().slice(0, 10);
      justifiedSet.add(`${j.student_id}_${dateStr}`);
      if (j.reason) {
        justificationMap.set(`${j.student_id}_${dateStr}`, j.reason);
        justificationMap.set(j.student_id, j.reason);
      }
    }

    // Fetch student tags from manual/direct assignments
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
      console.warn('Manual tag fetch warning:', tagErr.message);
    }

    // Fetch latest AI tag analysis logs as fallback
    let aiTagsMap = {};
    try {
      const [aiLogs] = await pool.query(`
        SELECT l.student_id, l.assigned_tag, t.color, t.id as tag_id
        FROM ai_tag_analysis_logs l
        LEFT JOIN student_tags t ON l.assigned_tag = t.name
        WHERE l.id IN (
          SELECT MAX(id) FROM ai_tag_analysis_logs GROUP BY student_id
        )
      `);
      for (const log of aiLogs) {
        if (log.assigned_tag) {
          aiTagsMap[log.student_id] = {
            id: log.tag_id || 2,
            name: log.assigned_tag,
            color: log.color || (log.assigned_tag === 'Regular' ? '#10b981' : log.assigned_tag === 'Irregular' ? '#f59e0b' : '#ef4444'),
            is_system: 1
          };
        }
      }
    } catch(e) {}

    const consecutive_absentees = [];
    const minRequiredMisses = Math.min(3, Math.max(1, targetDates.length));

    for (const s of activeStudents) {
      const cleanCode = (s.student_code || '').replace(/^0+/, '');
      const missedDates = [];
      const justifiedDates = [];
      let studentJustification = '';

      for (const d of targetDates) {
        const attended = attendedSet.has(`${s.id}_${d}`) || attendedSet.has(`${cleanCode}_${d}`);
        const isJust = justifiedSet.has(`${s.id}_${d}`);
        if (!attended) {
          missedDates.push(d);
          if (isJust) {
            justifiedDates.push(d);
            studentJustification = justificationMap.get(`${s.id}_${d}`) || studentJustification || justificationMap.get(s.id);
          }
        }
      }

      // If student was absent for all target dates of this session (up to 3)
      if (missedDates.length >= minRequiredMisses) {
        const isJustified = justifiedDates.length > 0;
        let studentTags = tagsMap[s.id] || tagsMap[s.student_code] || tagsMap[cleanCode] || [];
        if (studentTags.length === 0 && aiTagsMap[s.id]) {
          studentTags = [aiTagsMap[s.id]];
        }
        if (studentTags.length === 0) {
          studentTags = [{
            id: 2,
            name: 'Irregular',
            color: '#f59e0b',
            is_system: 1,
            description: 'Inconsistent attendance / frequent absences'
          }];
        }

        consecutive_absentees.push({
          student_id: s.id,
          student_code: s.student_code,
          name: s.name,
          floor_id: s.floor_id,
          floor_name: s.floor_name || (s.floor_id === 0 ? 'Ground Floor' : `Floor ${s.floor_id}`),
          room_number: s.room_number || 'N/A',
          phone_number: s.phone_number || '',
          tags: studentTags,
          consecutive_days: missedDates.length,
          missed_dates: missedDates,
          justified_dates: justifiedDates,
          is_justified: isJustified,
          justification_reason: studentJustification || (isJustified ? 'Justification provided' : ''),
          status: isJustified ? 'Justified Absent' : 'Unjustified Absent'
        });
      }
    }

    return res.json({
      success: true,
      data: {
        total_students,
        present_today,
        late_today,
        absent_today,
        recent_session_name: recentSessionName,
        recent_session_key: recentSessionKey,
        current_session: {
          key: activeFilterKey,
          name: targetSessionName,
          is_recent: activeFilterKey === recentSessionKey
        },
        available_sessions,
        weekly_stats,
        floor_status,
        consecutive_absentees,
        target_dates: targetDates,
        selected_date: targetDate,
        is_leader_view: Boolean(leaderFloors && leaderFloors.length > 0),
        assigned_floors: leaderFloors || []
      }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// GET /api/admin/rebind-requests
// ------------------------------------------------------------
router.get('/rebind-requests', async (req, res) => {
  try {
    const floorId = req.query.floor_id;
    let query = `
       SELECT rr.id, rr.student_id, s.student_code, s.name, s.phone_number,
              rr.new_device_uuid, rr.status, rr.created_at, f.floor_name
       FROM rebind_requests rr
       JOIN students s ON s.id = rr.student_id
       LEFT JOIN floors f ON rr.floor_id = f.floor_id
       WHERE rr.status IN ('pending','code_generated')
    `;
    const params = [];
    
    if (floorId && floorId !== 'ALL') {
      query += ` AND rr.floor_id = ?`;
      params.push(floorId);
    }
    
    query += ` ORDER BY rr.created_at ASC`;
    
    const [rows] = await pool.query(query, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// POST /api/admin/rebind-requests/:id/generate-code
// ------------------------------------------------------------
router.post('/rebind-requests/:id/generate-code', async (req, res) => {
  try {
    const requestId = req.params.id;

    const [rows] = await pool.query('SELECT * FROM rebind_requests WHERE id = ?', [requestId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Rebind request not found' });
    }
    const reqRow = rows[0];

    if (reqRow.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Already completed' });
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MIN * 60 * 1000);

    // Using admin.id from token
    await pool.query(
      `UPDATE rebind_requests
       SET status = 'code_generated', code_hash = ?, code_expires_at = ?, generated_by = ?
       WHERE id = ?`,
      [codeHash, expiresAt, req.admin.id, requestId]
    );

    return res.json({
      success: true,
      code,
      expires_at: expiresAt,
      message: 'Read this code to the student. It expires in ' + CODE_EXPIRY_MIN + ' minutes.'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// GET /api/admin/esp32/status
// ------------------------------------------------------------
router.get('/esp32/status', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT floor_id, floor_name, device_name, last_seen FROM floors WHERE floor_id >= 0 ORDER BY floor_id ASC');
    
    const floors = rows.map(r => {
      const lastSeen = r.last_seen ? new Date(r.last_seen) : null;
      const now = new Date();
      // Consider online if heartbeat was within the last 2 minutes (120000 ms)
      const isOnline = lastSeen ? (now - lastSeen < 120000) : false;
      return {
        floor_id: r.floor_id,
        floor_name: r.floor_name,
        device_name: r.device_name,
        last_seen: r.last_seen,
        is_online: isOnline
      };
    });

    return res.json({ success: true, data: floors });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// POST /api/admin/esp32/assign
// ------------------------------------------------------------
router.post('/esp32/assign', async (req, res) => {
  try {
    const { device_name, floor_id } = req.body;
    if (!device_name || floor_id === undefined) {
      return res.status(400).json({ success: false, message: 'Missing device_name or floor_id' });
    }

    // Unassign this device from any other floor first
    await pool.query('UPDATE floors SET device_name = NULL, last_seen = NULL WHERE device_name = ?', [device_name]);

    // Assign to new floor
    await pool.query('UPDATE floors SET device_name = ?, last_seen = NULL WHERE floor_id = ?', [device_name, floor_id]);

    return res.json({ success: true, message: 'ESP-32 assigned successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// POST /api/admin/esp32/unassign
// ------------------------------------------------------------
router.post('/esp32/unassign', async (req, res) => {
  try {
    const { floor_id } = req.body;
    if (floor_id === undefined) {
      return res.status(400).json({ success: false, message: 'Missing floor_id' });
    }

    await pool.query('UPDATE floors SET device_name = NULL, last_seen = NULL WHERE floor_id = ?', [floor_id]);

    return res.json({ success: true, message: 'ESP-32 unassigned successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// GET /api/admin/sessions
// ------------------------------------------------------------
router.get('/sessions', async (req, res) => {
  try {
    let query = 'SELECT * FROM attendance_schedules WHERE is_active = TRUE';
    const params = [];

    if (req.leader && Array.isArray(req.leader.assigned_sessions) && req.leader.assigned_sessions.length > 0 && !req.leader.assigned_sessions.includes('all')) {
      query += ' AND session_key IN (?)';
      params.push(req.leader.assigned_sessions);
    }

    query += ' ORDER BY start_time ASC';
    const [rows] = await pool.query(query, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// GET /api/admin/sessions/:session_key
// ------------------------------------------------------------
router.get('/sessions/:session_key', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM attendance_schedules WHERE session_key = ?', [req.params.session_key]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// POST /api/admin/sessions
// ------------------------------------------------------------
router.post('/sessions', verifyAdmin, async (req, res) => {
  try {
    const { session_name, icon_name, is_for_all_students } = req.body;
    if (!session_name || !icon_name) {
      return res.status(400).json({ success: false, message: 'Missing session_name or icon_name' });
    }
    const session_key = session_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const isForAll = is_for_all_students === false || is_for_all_students === 0 || is_for_all_students === 'false' ? 0 : 1;
    
    await pool.query(
      'INSERT INTO attendance_schedules (session_key, session_name, icon_name, is_for_all_students, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)',
      [session_key, session_name, icon_name, isForAll, '00:00', '00:00']
    );
    
    return res.json({ 
      success: true, 
      message: 'Session added successfully',
      data: {
        session_key,
        session_name,
        icon_name,
        is_for_all_students: isForAll === 1
      }
    });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'A session with this name already exists' });
    }
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// PUT /api/admin/sessions/:session_key
// ------------------------------------------------------------
router.put('/sessions/:session_key', verifyAdmin, async (req, res) => {
  try {
    const { session_name, is_for_all_students } = req.body;
    const { session_key } = req.params;
    
    const [existing] = await pool.query('SELECT * FROM attendance_schedules WHERE session_key = ?', [session_key]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const updatedName = session_name ? session_name.trim() : existing[0].session_name;
    const isForAll = is_for_all_students !== undefined 
      ? (is_for_all_students ? 1 : 0) 
      : existing[0].is_for_all_students;
    
    await pool.query(
      'UPDATE attendance_schedules SET session_name = ?, is_for_all_students = ? WHERE session_key = ?',
      [updatedName, isForAll, session_key]
    );
    
    return res.json({ success: true, message: 'Session updated successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// DELETE /api/admin/sessions/:session_key
// ------------------------------------------------------------
router.delete('/sessions/:session_key', async (req, res) => {
  try {
    const { session_key } = req.params;
    
    // We could either DELETE it completely or just set is_active = FALSE.
    // Let's actually delete it to keep it clean.
    await pool.query('DELETE FROM attendance_schedules WHERE session_key = ?', [session_key]);
    
    return res.json({ success: true, message: 'Session deleted successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// GET /api/admin/reports
// ------------------------------------------------------------
router.get('/reports', async (req, res) => {
  try {
    const timeFilter = req.query.time_filter;
    const floorIdFilter = req.query.floor_id;
    let dateConditionSessions = 'WHERE 1=1';
    let dateConditionAttendance = 'WHERE 1=1';
    
    let sessionCountsParams = [];
    let attendanceParams = [];

    if (timeFilter === 'today') {
      dateConditionSessions += ' AND session_date = CURDATE()';
      dateConditionAttendance += ' AND s.session_date = CURDATE()';
    } else if (timeFilter && timeFilter !== 'all') {
      // Treat as custom date (YYYY-MM-DD)
      dateConditionSessions += ' AND session_date = ?';
      dateConditionAttendance += ' AND s.session_date = ?';
      sessionCountsParams.push(timeFilter);
      attendanceParams.push(timeFilter);
    }

    let leaderFloors = null;
    if (req.leader) {
      leaderFloors = Array.isArray(req.leader.assigned_floors) && req.leader.assigned_floors.length > 0
        ? req.leader.assigned_floors.map(f => parseInt(f, 10)).filter(f => !isNaN(f))
        : (req.leader.floor_id !== undefined ? [parseInt(req.leader.floor_id, 10)] : []);
    }

    if (floorIdFilter) {
      dateConditionAttendance += ' AND ar.floor_id = ?';
      attendanceParams.push(floorIdFilter);
    } else if (leaderFloors && leaderFloors.length > 0) {
      dateConditionAttendance += ' AND ar.floor_id IN (?)';
      attendanceParams.push(leaderFloors);
    }

    // 1. Get conducted sessions and total counts per session type
    const [conductedSessions] = await pool.query(`
      SELECT DISTINCT s.id, s.session_type, DATE_FORMAT(s.session_date, '%Y-%m-%d') as session_date
      FROM attendance_sessions s
      JOIN attendance_records ar ON s.id = ar.session_id
      ${dateConditionAttendance.replace(/ar\.floor_id/g, 'ar.floor_id')}
    `, attendanceParams);
    
    const totals = {};
    for (const cs of conductedSessions) {
      if (cs.session_type) {
        totals[cs.session_type] = (totals[cs.session_type] || 0) + 1;
      }
    }

    // 2. Get attendance counts per student per session type
    const [attendance] = await pool.query(`
      SELECT TRIM(LEADING '0' FROM ar.bank_code) as bank_code, s.session_type, COUNT(DISTINCT s.id) as attended, SUM(ar.is_late) as late_count
      FROM attendance_records ar
      JOIN attendance_sessions s ON ar.session_id = s.id
      ${dateConditionAttendance}
      GROUP BY TRIM(LEADING '0' FROM ar.bank_code), s.session_type
    `, attendanceParams);

    const studentRecords = {};
    const lateRecords = {};

    attendance.forEach(a => {
      if (!studentRecords[a.bank_code]) {
        studentRecords[a.bank_code] = {};
      }
      if (a.session_type) studentRecords[a.bank_code][a.session_type] = a.attended;

      if (!lateRecords[a.bank_code]) {
        lateRecords[a.bank_code] = 0;
      }
      lateRecords[a.bank_code] += (parseInt(a.late_count) || 0);
    });

    // 3. Get active students metadata (room, floor, contact)
    let studentQuery = `
      SELECT s.id, s.student_code, s.name, s.floor_id, s.room_number, s.phone_number, f.floor_name
      FROM students s
      LEFT JOIN floors f ON s.floor_id = f.floor_id
      WHERE s.is_active = TRUE
    `;
    let studentQueryParams = [];
    if (leaderFloors && leaderFloors.length > 0) {
      studentQuery += ' AND s.floor_id IN (?)';
      studentQueryParams.push(leaderFloors);
    } else if (floorIdFilter && floorIdFilter !== 'All') {
      studentQuery += ' AND s.floor_id = ?';
      studentQueryParams.push(floorIdFilter);
    }
    studentQuery += ' ORDER BY s.floor_id ASC, s.room_number ASC, s.name ASC';

    const [students] = await pool.query(studentQuery, studentQueryParams);

    // Map student lookup tables
    const studentIdToCleanCode = new Map();
    for (const s of students) {
      const clean = (s.student_code ? String(s.student_code).replace(/^0+/, '') : '') || String(s.id);
      studentIdToCleanCode.set(s.id, clean);
    }

    // 3.5 Fetch approved leaves for conducted sessions
    const leaveRecords = {};
    try {
      const [leaveRows] = await pool.query(`
        SELECT student_id, TRIM(LEADING '0' FROM bank_code) as bank_code, DATE_FORMAT(start_time, '%Y-%m-%d') as start_date, DATE_FORMAT(end_time, '%Y-%m-%d') as end_date, reason
        FROM student_leaves
        WHERE LOWER(status) = 'approved'
      `);

      const studentLeaveSessions = new Map();

      for (const lv of leaveRows) {
        let clean = lv.bank_code;
        if (!clean && lv.student_id) {
          clean = studentIdToCleanCode.get(lv.student_id);
        }
        if (!clean) continue;

        if (!studentLeaveSessions.has(clean)) {
          studentLeaveSessions.set(clean, new Map());
        }
        const sessionMap = studentLeaveSessions.get(clean);

        for (const cs of conductedSessions) {
          if (cs.session_date >= lv.start_date && cs.session_date <= lv.end_date) {
            sessionMap.set(cs.id, cs.session_type);
          }
        }
      }

      for (const [clean, sessionMap] of studentLeaveSessions.entries()) {
        if (!leaveRecords[clean]) leaveRecords[clean] = { total: 0 };
        for (const [sId, sType] of sessionMap.entries()) {
          leaveRecords[clean].total = (leaveRecords[clean].total || 0) + 1;
          if (sType) {
            leaveRecords[clean][sType] = (leaveRecords[clean][sType] || 0) + 1;
          }
        }
      }
    } catch (lvErr) {
      console.warn('Manual leave fetch warning in reports:', lvErr.message);
    }

    // 4. Fetch tags for these students
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
      console.warn('Manual tag fetch warning in reports:', tagErr.message);
    }

    // Fetch AI tags as fallback
    let aiTagsMap = {};
    try {
      const [aiLogs] = await pool.query(`
        SELECT l.student_id, l.assigned_tag, t.color, t.id as tag_id
        FROM ai_tag_analysis_logs l
        LEFT JOIN student_tags t ON l.assigned_tag = t.name
        WHERE l.id IN (
          SELECT MAX(id) FROM ai_tag_analysis_logs GROUP BY student_id
        )
      `);
      for (const log of aiLogs) {
        if (log.assigned_tag) {
          aiTagsMap[log.student_id] = {
            id: log.tag_id || 2,
            name: log.assigned_tag,
            color: log.color || (log.assigned_tag === 'Regular' ? '#10b981' : log.assigned_tag === 'Irregular' ? '#f59e0b' : '#ef4444'),
            is_system: 1
          };
        }
      }
    } catch(e) {}

    const enrichedStudents = students.map(s => {
      let finalFloorId = s.floor_id;
      let finalFloorName = s.floor_name;
      if ((finalFloorId === null || finalFloorId === undefined) && s.room_number && !isNaN(parseInt(s.room_number, 10))) {
        const rNum = parseInt(s.room_number, 10);
        if (rNum >= 100) {
          finalFloorId = Math.floor(rNum / 100);
          finalFloorName = `Floor ${finalFloorId}`;
        }
      }

      const cleanCode = (s.student_code || '').replace(/^0+/, '');
      const studentLeaves = leaveRecords[s.student_code] || leaveRecords[cleanCode] || {};
      const totalLeaves = studentLeaves.total || 0;

      let studentTags = tagsMap[s.id] || tagsMap[s.student_code] || [];
      if (studentTags.length === 0 && aiTagsMap[s.id]) {
        studentTags = [aiTagsMap[s.id]];
      }
      if (studentTags.length === 0) {
        const rec = studentRecords[s.student_code] || studentRecords[cleanCode] || {};
        let totalAtt = 0;
        Object.values(rec).forEach(v => { totalAtt += (v || 0); });

        let totalPossible = 0;
        Object.values(totals || {}).forEach(v => { totalPossible += (v || 0); });
        const effectivePossible = Math.max(0, totalPossible - totalLeaves);
        const rate = effectivePossible > 0 ? (totalAtt / effectivePossible) * 100 : (totalPossible > 0 && totalLeaves >= totalPossible ? 100 : 0);

        if (rate >= 75) {
          studentTags = [{
            id: 1,
            name: 'Regular',
            color: '#10b981',
            is_system: 1
          }];
        } else {
          studentTags = [{
            id: 2,
            name: 'Irregular',
            color: '#f59e0b',
            is_system: 1
          }];
        }
      }

      return {
        ...s,
        floor_id: finalFloorId,
        floor_name: finalFloorName || (finalFloorId !== null && finalFloorId !== undefined ? (finalFloorId === 0 ? 'Ground Floor' : `Floor ${finalFloorId}`) : null),
        tags: studentTags
      };
    });

    return res.json({ success: true, totals, studentRecords, lateRecords, leaveRecords, students: enrichedStudents });
  } catch (err) {
    console.error('Reports Error:', err);
    return res.status(500).json({ success: false, message: err.toString() });
  }
});

router.get('/debug-reports', async (req, res) => {
  try {
    const [res1] = await pool.query('DESCRIBE attendance_records');
    const [res2] = await pool.query('DESCRIBE attendance_sessions');
    return res.json({ success: true, records: res1, sessions: res2 });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.toString() });
  }
});

// ============================================================
// DEVICE & IP MULTI-ACCOUNT SECURITY AUDIT ENDPOINTS
// ============================================================

// GET /api/admin/security/device-logs
router.get('/security/device-logs', async (req, res) => {
  try {
    const { ensureTablesExist } = require('../services/deviceSecurity');
    await ensureTablesExist();

    const [logs] = await pool.query(`
      SELECT 
        l.*,
        s1.room_number AS primary_room,
        s1.phone_number AS primary_phone,
        s2.room_number AS attempted_room,
        s2.phone_number AS attempted_phone
      FROM device_ip_security_logs l
      LEFT JOIN students s1 ON (l.primary_student_id = s1.id OR TRIM(LEADING '0' FROM l.primary_student_code) = TRIM(LEADING '0' FROM s1.student_code))
      LEFT JOIN students s2 ON (l.attempted_student_id = s2.id OR TRIM(LEADING '0' FROM l.attempted_student_code) = TRIM(LEADING '0' FROM s2.student_code))
      ORDER BY l.attempted_at DESC
      LIMIT 100
    `);

    const [bindings] = await pool.query(`
      SELECT 
        b.*,
        COALESCE(s.room_number, '') AS room_number,
        COALESCE(s.phone_number, '') AS phone_number
      FROM device_ip_bindings b
      LEFT JOIN students s ON (b.student_id = s.id OR TRIM(LEADING '0' FROM b.student_code) = TRIM(LEADING '0' FROM s.student_code))
      ORDER BY b.last_login_at DESC
      LIMIT 100
    `);

    return res.json({
      success: true,
      data: {
        logs,
        bindings
      }
    });
  } catch (err) {
    console.error('Security Device Logs Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/security/authorize
router.post('/security/authorize', async (req, res) => {
  try {
    const { log_id, ip_address, attempted_student_id } = req.body;
    const authorizerName = req.admin ? 'ADMIN' : (req.leader?.username || req.leader?.name || 'ADMIN');

    if (log_id) {
      const [logRows] = await pool.query('SELECT * FROM device_ip_security_logs WHERE id = ?', [log_id]);
      if (logRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Log entry not found' });
      }
      const log = logRows[0];

      await pool.query(
        `UPDATE device_ip_security_logs 
         SET status = 'AUTHORIZED_BY_ADMIN', resolved_by = ?, resolved_at = NOW() 
         WHERE id = ?`,
        [authorizerName, log_id]
      );

      // Upsert binding so the attempted student can login without friction
      await pool.query(
        `INSERT INTO device_ip_bindings (ip_address, student_id, student_code, student_name, device_uuid, last_login_at, is_whitelisted)
         VALUES (?, ?, ?, ?, ?, NOW(), FALSE)
         ON DUPLICATE KEY UPDATE 
           student_code = VALUES(student_code),
           student_name = VALUES(student_name),
           last_login_at = NOW()`,
        [log.ip_address, log.attempted_student_id, log.attempted_student_code, log.attempted_student_name, log.device_uuid]
      );

      return res.json({ success: true, message: `Authorized student ${log.attempted_student_name} on IP ${log.ip_address}` });
    } else if (ip_address && attempted_student_id) {
      await pool.query(
        `UPDATE device_ip_security_logs 
         SET status = 'AUTHORIZED_BY_ADMIN', resolved_by = ?, resolved_at = NOW() 
         WHERE ip_address = ? AND attempted_student_id = ?`,
        [authorizerName, ip_address, attempted_student_id]
      );
      return res.json({ success: true, message: 'Authorized successfully' });
    } else {
      return res.status(400).json({ success: false, message: 'Missing log_id or ip_address' });
    }
  } catch (err) {
    console.error('Authorize IP Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/security/clear-binding
router.post('/security/clear-binding', async (req, res) => {
  try {
    const { binding_id, ip_address, student_id } = req.body;
    if (student_id) {
      await pool.query('DELETE FROM device_ip_bindings WHERE student_id = ?', [student_id]);
      try {
        await pool.query(
          'UPDATE students SET device_uuid = NULL, registered_ip = NULL, registered_device_fingerprint = NULL, last_known_ip = NULL, is_device_bound = 0 WHERE id = ?',
          [student_id]
        );
      } catch (colErr) {
        // Fallback if some columns don't exist
        await pool.query('UPDATE students SET device_uuid = NULL WHERE id = ?', [student_id]);
      }
      try {
        await pool.query(
          `UPDATE device_ip_security_logs 
           SET status = 'RESOLVED', resolved_by = 'ADMIN', resolved_at = NOW() 
           WHERE attempted_student_id = ? OR primary_student_id = ?`,
          [student_id, student_id]
        );
      } catch (logErr) {}
      return res.json({ success: true, message: 'Device & IP binding cleared successfully' });
    } else if (binding_id) {
      // Find the binding first to know the student_id
      const [bRows] = await pool.query('SELECT student_id FROM device_ip_bindings WHERE id = ?', [binding_id]);
      await pool.query('DELETE FROM device_ip_bindings WHERE id = ?', [binding_id]);
      if (bRows.length > 0 && bRows[0].student_id) {
        try {
          await pool.query('UPDATE students SET device_uuid = NULL WHERE id = ?', [bRows[0].student_id]);
        } catch (e) {}
      }
      return res.json({ success: true, message: 'IP binding cleared successfully' });
    } else if (ip_address) {
      await pool.query('DELETE FROM device_ip_bindings WHERE ip_address = ?', [ip_address]);
      return res.json({ success: true, message: `All bindings for IP ${ip_address} cleared` });
    } else {
      return res.status(400).json({ success: false, message: 'Missing student_id, binding_id, or ip_address' });
    }
  } catch (err) {
    console.error('Clear Binding Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/security/whitelist-ip
router.post('/security/whitelist-ip', async (req, res) => {
  try {
    const { ip_address, is_whitelisted } = req.body;
    if (!ip_address) {
      return res.status(400).json({ success: false, message: 'Missing ip_address' });
    }
    const val = is_whitelisted !== false;
    await pool.query('UPDATE device_ip_bindings SET is_whitelisted = ? WHERE ip_address = ?', [val, ip_address]);
    return res.json({ success: true, message: `IP ${ip_address} whitelist status set to ${val}` });
  } catch (err) {
    console.error('Whitelist IP Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/security/logs/:id
router.delete('/security/logs/:id', async (req, res) => {
  try {
    const logId = req.params.id;
    await pool.query('DELETE FROM device_ip_security_logs WHERE id = ?', [logId]);
    return res.json({ success: true, message: 'Log entry deleted successfully' });
  } catch (err) {
    console.error('Delete Security Log Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
