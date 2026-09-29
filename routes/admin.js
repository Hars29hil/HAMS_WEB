const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { verifyAdmin, verifyAdminOrFloorLeader } = require('../middleware/auth');
const { getCurrentIST } = require('../utils/time');
const { normalizeHHMM, isTimeInWindow, resolveScheduleForDate } = require('../utils/scheduleHelper');

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
    let leaderAllowedSessions = null;
    if (req.leader) {
      if (Array.isArray(req.leader.assigned_floors) && req.leader.assigned_floors.length > 0) {
        leaderFloors = req.leader.assigned_floors.map(f => parseInt(f, 10)).filter(f => !isNaN(f));
      } else if (req.leader.floor_id !== undefined) {
        leaderFloors = [parseInt(req.leader.floor_id, 10)];
      }

      let rawSessions = req.leader.assigned_sessions;
      if (typeof rawSessions === 'string') {
        try { rawSessions = JSON.parse(rawSessions); } catch(e) { rawSessions = []; }
      }
      if (Array.isArray(rawSessions) && rawSessions.length > 0 && !rawSessions.includes('all')) {
        leaderAllowedSessions = rawSessions.map(s => String(s).toLowerCase().trim());
      }
    }

    // 1. Total Active Students
    let total_students = 0;
    try {
      if (leaderFloors && leaderFloors.length > 0) {
        const [[countRow]] = await pool.query('SELECT COUNT(*) AS count FROM students WHERE is_active = TRUE AND floor_id IN (?)', [leaderFloors]);
        total_students = countRow ? (parseInt(countRow.count, 10) || 0) : 0;
      } else {
        const [[totalRow]] = await pool.query('SELECT COUNT(*) AS total FROM students WHERE is_active = TRUE');
        total_students = totalRow ? (parseInt(totalRow.total, 10) || 0) : 0;
      }
    } catch (e) {
      console.warn('Dashboard total_students query warning:', e.message);
    }

    // 2. Fetch configured dynamic sessions (filtered for floor leader)
    let schedules = [];
    try {
      let schedQuery = 'SELECT * FROM attendance_schedules WHERE is_active = TRUE';
      const schedParams = [];
      if (leaderAllowedSessions && leaderAllowedSessions.length > 0) {
        schedQuery += ' AND LOWER(session_key) IN (?)';
        schedParams.push(leaderAllowedSessions);
      }
      schedQuery += ' ORDER BY start_time ASC';
      const [schedRows] = await pool.query(schedQuery, schedParams);
      schedules = schedRows || [];
    } catch (e) {
      console.warn('Dashboard schedules query warning:', e.message);
    }
    
    // 3. Find the most recent session taken/created (filtered for floor leader)
    let recentSessions = [];
    try {
      let sessFilterClause = '';
      const exactParams = [targetDate, targetDate, targetDate];
      if (leaderAllowedSessions && leaderAllowedSessions.length > 0) {
        sessFilterClause = ' AND LOWER(s.session_type) IN (?)';
        exactParams.push(leaderAllowedSessions);
      }

      // First try to find a session on targetDate
      const [exactDaySessions] = await pool.query(`
        SELECT s.id, s.session_type, s.session_date, s.starts_at, s.ends_at, sch.session_name
        FROM attendance_sessions s
        LEFT JOIN attendance_schedules sch ON LOWER(s.session_type) = LOWER(sch.session_key)
        WHERE (DATE(s.session_date) = ? OR LEFT(s.session_date, 10) = ? OR s.session_date = ?)
          ${sessFilterClause}
        ORDER BY s.id DESC
        LIMIT 1
      `, exactParams);
      
      if (exactDaySessions && exactDaySessions.length > 0) {
        recentSessions = exactDaySessions;
      } else {
        const histParams = [targetDate, targetDate, targetDate];
        if (leaderAllowedSessions && leaderAllowedSessions.length > 0) {
          histParams.push(leaderAllowedSessions);
        }
        const [rSessions] = await pool.query(`
          SELECT s.id, s.session_type, s.session_date, s.starts_at, s.ends_at, sch.session_name
          FROM attendance_sessions s
          LEFT JOIN attendance_schedules sch ON LOWER(s.session_type) = LOWER(sch.session_key)
          WHERE (DATE(s.session_date) <= ? OR LEFT(s.session_date, 10) <= ? OR s.session_date <= ?)
            ${sessFilterClause}
          ORDER BY s.session_date DESC, s.id DESC
          LIMIT 1
        `, histParams);
        recentSessions = rSessions || [];
      }
    } catch (e) {
      console.warn('Dashboard recentSessions query warning:', e.message);
    }

    let recentSessionKey = schedules.length > 0 ? schedules[0].session_key : 'night';
    let recentSessionName = schedules.length > 0 ? schedules[0].session_name : 'Night Attendance';
    let recentSessionDate = targetDate;

    if (recentSessions.length > 0) {
      recentSessionKey = recentSessions[0].session_type || (schedules.length > 0 ? schedules[0].session_key : 'night');
      recentSessionName = recentSessions[0].session_name || (recentSessionKey.charAt(0).toUpperCase() + recentSessionKey.slice(1) + ' Attendance');
      recentSessionDate = recentSessions[0].session_date;
    }

    // Determine target session to display
    let activeFilterKey = requestedSessionKey;
    if (activeFilterKey === 'recent') {
      activeFilterKey = recentSessionKey;
    }
    // If leader is assigned specific sessions and requested key is invalid or not allowed, default to first assigned
    if (leaderAllowedSessions && leaderAllowedSessions.length > 0) {
      if (activeFilterKey !== 'all' && !leaderAllowedSessions.includes(activeFilterKey.toLowerCase())) {
        activeFilterKey = schedules.length > 0 ? schedules[0].session_key : leaderAllowedSessions[0];
      }
    }

    let targetSessionName = 'All Combined';
    if (activeFilterKey !== 'all') {
      const foundSched = schedules.find(s => s.session_key && s.session_key.toLowerCase() === activeFilterKey.toLowerCase());
      targetSessionName = foundSched ? foundSched.session_name : (activeFilterKey.charAt(0).toUpperCase() + activeFilterKey.slice(1) + ' Attendance');
    }

    // 4. Compute Present and Late for the target session on targetDate
    let present_today = 0;
    let late_today = 0;

    let sessionCondition = '';
    const sessionParams = [];

    if (activeFilterKey !== 'all') {
      sessionCondition = 'AND (LOWER(s.session_type) = LOWER(?) OR LOWER(REPLACE(s.session_type, "_", "")) = LOWER(REPLACE(?, "_", "")) OR LOWER(s.session_type) LIKE CONCAT(LOWER(?), "%"))';
      sessionParams.push(activeFilterKey, activeFilterKey, activeFilterKey);
    }

    try {
      if (leaderFloors && leaderFloors.length > 0) {
        const [[presentRow]] = await pool.query(`
          SELECT COUNT(DISTINCT TRIM(LEADING '0' FROM ar.bank_code)) AS present_today 
          FROM attendance_records ar
          JOIN attendance_sessions s ON ar.session_id = s.id
          LEFT JOIN students st ON (TRIM(LEADING '0' FROM st.student_code) = TRIM(LEADING '0' FROM ar.bank_code) OR st.student_code = ar.bank_code)
          WHERE (DATE(s.session_date) = ? OR LEFT(s.session_date, 10) = ? OR s.session_date = ?)
            AND (st.is_active = TRUE OR ar.bank_code IS NOT NULL)
            AND (st.floor_id IN (?) OR ar.floor_id IN (?)) ${sessionCondition}
        `, [targetDate, targetDate, targetDate, leaderFloors, leaderFloors, ...sessionParams]);
        present_today = presentRow ? (parseInt(presentRow.present_today, 10) || 0) : 0;

        const [[lateRow]] = await pool.query(`
          SELECT COUNT(DISTINCT TRIM(LEADING '0' FROM ar.bank_code)) AS late_today 
          FROM attendance_records ar
          JOIN attendance_sessions s ON ar.session_id = s.id
          LEFT JOIN students st ON (TRIM(LEADING '0' FROM st.student_code) = TRIM(LEADING '0' FROM ar.bank_code) OR st.student_code = ar.bank_code)
          WHERE (DATE(s.session_date) = ? OR LEFT(s.session_date, 10) = ? OR s.session_date = ?)
            AND (ar.is_late = TRUE OR ar.is_late = 1)
            AND (st.is_active = TRUE OR ar.bank_code IS NOT NULL)
            AND (st.floor_id IN (?) OR ar.floor_id IN (?)) ${sessionCondition}
        `, [targetDate, targetDate, targetDate, leaderFloors, leaderFloors, ...sessionParams]);
        late_today = lateRow ? (parseInt(lateRow.late_today, 10) || 0) : 0;
      } else {
        const [[presentRow]] = await pool.query(`
          SELECT COUNT(DISTINCT TRIM(LEADING '0' FROM ar.bank_code)) AS present_today 
          FROM attendance_records ar
          JOIN attendance_sessions s ON ar.session_id = s.id
          LEFT JOIN students st ON (TRIM(LEADING '0' FROM st.student_code) = TRIM(LEADING '0' FROM ar.bank_code) OR st.student_code = ar.bank_code)
          WHERE (DATE(s.session_date) = ? OR LEFT(s.session_date, 10) = ? OR s.session_date = ?)
            AND (st.is_active = TRUE OR ar.bank_code IS NOT NULL)
            ${sessionCondition}
        `, [targetDate, targetDate, targetDate, ...sessionParams]);
        present_today = presentRow ? (parseInt(presentRow.present_today, 10) || 0) : 0;

        const [[lateRow]] = await pool.query(`
          SELECT COUNT(DISTINCT TRIM(LEADING '0' FROM ar.bank_code)) AS late_today 
          FROM attendance_records ar
          JOIN attendance_sessions s ON ar.session_id = s.id
          LEFT JOIN students st ON (TRIM(LEADING '0' FROM st.student_code) = TRIM(LEADING '0' FROM ar.bank_code) OR st.student_code = ar.bank_code)
          WHERE (DATE(s.session_date) = ? OR LEFT(s.session_date, 10) = ? OR s.session_date = ?)
            AND (ar.is_late = TRUE OR ar.is_late = 1)
            AND (st.is_active = TRUE OR ar.bank_code IS NOT NULL)
            ${sessionCondition}
        `, [targetDate, targetDate, targetDate, ...sessionParams]);
        late_today = lateRow ? (parseInt(lateRow.late_today, 10) || 0) : 0;
      }
    } catch (e) {
      console.warn('Dashboard present/late query warning:', e.message);
    }

    // 5. Compute summary for each available session on targetDate
    const sessionCountsMap = {};
    let allSessionsPresentCount = 0;
    try {
      let allSessionsQuery = `
        SELECT s.session_type, COUNT(DISTINCT TRIM(LEADING '0' FROM ar.bank_code)) as present_count
        FROM attendance_sessions s
        LEFT JOIN attendance_records ar ON s.id = ar.session_id
        LEFT JOIN students st ON (TRIM(LEADING '0' FROM st.student_code) = TRIM(LEADING '0' FROM ar.bank_code) OR st.student_code = ar.bank_code)
        WHERE (DATE(s.session_date) = ? OR LEFT(s.session_date, 10) = ? OR s.session_date = ?)
          AND (st.is_active = TRUE OR ar.bank_code IS NULL OR ar.bank_code IS NOT NULL)
      `;
      const allSessionsParams = [targetDate, targetDate, targetDate];
      if (leaderFloors && leaderFloors.length > 0) {
        allSessionsQuery += ' AND (st.floor_id IN (?) OR ar.floor_id IN (?) OR ar.bank_code IS NULL)';
        allSessionsParams.push(leaderFloors, leaderFloors);
      }
      allSessionsQuery += ' GROUP BY s.session_type';

      const [allSessionsToday] = await pool.query(allSessionsQuery, allSessionsParams);
      for (const row of allSessionsToday) {
        if (row.session_type) {
          const c = parseInt(row.present_count || 0, 10);
          sessionCountsMap[row.session_type.toLowerCase()] = c;
          sessionCountsMap[row.session_type] = c;
        }
      }

      // Compute total distinct across all sessions for 'all'
      let totalAllQuery = `
        SELECT COUNT(DISTINCT TRIM(LEADING '0' FROM ar.bank_code)) as total_all
        FROM attendance_records ar
        JOIN attendance_sessions s ON ar.session_id = s.id
        LEFT JOIN students st ON (TRIM(LEADING '0' FROM st.student_code) = TRIM(LEADING '0' FROM ar.bank_code) OR st.student_code = ar.bank_code)
        WHERE (DATE(s.session_date) = ? OR LEFT(s.session_date, 10) = ? OR s.session_date = ?)
          AND (st.is_active = TRUE OR ar.bank_code IS NOT NULL)
      `;
      const totalAllParams = [targetDate, targetDate, targetDate];
      if (leaderFloors && leaderFloors.length > 0) {
        totalAllQuery += ' AND (st.floor_id IN (?) OR ar.floor_id IN (?))';
        totalAllParams.push(leaderFloors, leaderFloors);
      }
      const [[totalAllRow]] = await pool.query(totalAllQuery, totalAllParams);
      allSessionsPresentCount = totalAllRow ? (parseInt(totalAllRow.total_all, 10) || 0) : 0;
    } catch (e) {
      console.warn('Dashboard allSessionsToday query warning:', e.message);
    }

    let isSessionConductedOrStarted = false;
    if (present_today > 0) {
      isSessionConductedOrStarted = true;
    } else {
      const nowIST = getCurrentIST();
      const todayStr = nowIST.toISOString().slice(0, 10);
      if (targetDate === todayStr && activeFilterKey !== 'all') {
        const sched = schedules.find(s => s.session_key && s.session_key.toLowerCase() === activeFilterKey.toLowerCase());
        if (sched) {
          const resolved = resolveScheduleForDate(sched, nowIST);
          isSessionConductedOrStarted = isTimeInWindow(nowIST, resolved.start_time, resolved.end_time);
        }
      }
    }

    const absent_today = isSessionConductedOrStarted ? Math.max(0, total_students - present_today) : 0;

    let available_sessions = [];
    if (leaderAllowedSessions && leaderAllowedSessions.length > 0) {
      available_sessions = schedules.map(s => ({
        session_key: s.session_key,
        session_name: s.session_name,
        icon_name: s.icon_name || 'calendar',
        actual_key: s.session_key,
        present_today: sessionCountsMap[s.session_key.toLowerCase()] || sessionCountsMap[s.session_key] || 0
      }));
      if (available_sessions.length > 1) {
        available_sessions.push({
          session_key: 'all',
          session_name: 'All Assigned Sessions',
          icon_name: 'users',
          actual_key: 'all',
          present_today: allSessionsPresentCount
        });
      }
    } else {
      available_sessions = [
        {
          session_key: 'recent',
          session_name: `Recent (${recentSessionName})`,
          icon_name: 'clock',
          actual_key: recentSessionKey,
          present_today: sessionCountsMap[recentSessionKey.toLowerCase()] || sessionCountsMap[recentSessionKey] || 0
        },
        ...schedules.map(s => ({
          session_key: s.session_key,
          session_name: s.session_name,
          icon_name: s.icon_name || 'calendar',
          actual_key: s.session_key,
          present_today: sessionCountsMap[s.session_key.toLowerCase()] || sessionCountsMap[s.session_key] || 0
        })),
        {
          session_key: 'all',
          session_name: 'All Sessions Combined',
          icon_name: 'users',
          actual_key: 'all',
          present_today: allSessionsPresentCount
        }
      ];
    }

    // 6. 7-Day Trend leading up to targetDate (Always complete 7 days)
    let weekly_stats = [];
    try {
      let weeklySessionCondition = '';
      const weeklySessionParams = [];
      if (activeFilterKey !== 'all') {
        weeklySessionCondition = 'AND (LOWER(s.session_type) = LOWER(?) OR LOWER(REPLACE(s.session_type, "_", "")) = LOWER(REPLACE(?, "_", "")) OR LOWER(s.session_type) LIKE CONCAT(LOWER(?), "%"))';
        weeklySessionParams.push(activeFilterKey, activeFilterKey, activeFilterKey);
      }

      let weeklyStatsQuery = `
        SELECT 
          LEFT(s.session_date, 10) AS date, 
          COUNT(DISTINCT TRIM(LEADING '0' FROM ar.bank_code)) AS present,
          SUM(CASE WHEN ar.is_late = TRUE OR ar.is_late = 1 THEN 1 ELSE 0 END) AS late
        FROM attendance_sessions s
        JOIN attendance_records ar ON s.id = ar.session_id
        LEFT JOIN students st ON TRIM(LEADING '0' FROM st.student_code) = TRIM(LEADING '0' FROM ar.bank_code)
        WHERE (DATE(s.session_date) BETWEEN DATE_SUB(?, INTERVAL 6 DAY) AND ? OR LEFT(s.session_date, 10) BETWEEN DATE_SUB(?, INTERVAL 6 DAY) AND ?)
          AND (st.is_active = TRUE OR ar.bank_code IS NOT NULL)
      `;
      const weeklyStatsParams = [targetDate, targetDate, targetDate, targetDate];
      if (leaderFloors && leaderFloors.length > 0) {
        weeklyStatsQuery += ' AND (st.floor_id IN (?) OR ar.floor_id IN (?))';
        weeklyStatsParams.push(leaderFloors, leaderFloors);
      }
      weeklyStatsQuery += ` ${weeklySessionCondition} GROUP BY LEFT(s.session_date, 10) ORDER BY LEFT(s.session_date, 10) ASC`;
      weeklyStatsParams.push(...weeklySessionParams);

      const [weeklyStatsRows] = await pool.query(weeklyStatsQuery, weeklyStatsParams);
      const statsByDate = {};
      for (const row of weeklyStatsRows || []) {
        const dStr = row.date ? String(row.date).slice(0, 10) : '';
        if (dStr) {
          statsByDate[dStr] = {
            present: parseInt(row.present || 0, 10),
            late: parseInt(row.late || 0, 10)
          };
        }
      }

      // Generate continuous 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date(targetDate + 'T00:00:00');
        d.setDate(d.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateKey = `${yyyy}-${mm}-${dd}`;
        const found = statsByDate[dateKey];
        if (found && found.present > 0) {
          const absent = Math.max(0, total_students - found.present);
          weekly_stats.push({
            date: dateKey,
            present: found.present,
            late: found.late,
            absent: absent
          });
        } else {
          weekly_stats.push({
            date: dateKey,
            present: 0,
            late: 0,
            absent: 0
          });
        }
      }
    } catch (e) {
      console.warn('Dashboard weekly_stats query warning:', e.message);
    }

    // 7. Floor Status for the selected session on targetDate
    let floor_status = [];
    try {
      let floorsQuery = 'SELECT floor_id, floor_name FROM floors';
      const floorsParams = [];
      if (leaderFloors && leaderFloors.length > 0) {
        floorsQuery += ' WHERE floor_id IN (?)';
        floorsParams.push(leaderFloors);
      }
      floorsQuery += ' ORDER BY floor_id ASC';
      let [floors] = await pool.query(floorsQuery, floorsParams);

      if (!floors || floors.length === 0) {
        const defaultFloors = [
          { floor_id: 0, floor_name: 'Ground Floor' },
          { floor_id: 1, floor_name: 'Floor 1' },
          { floor_id: 2, floor_name: 'Floor 2' },
          { floor_id: 3, floor_name: 'Floor 3' },
          { floor_id: 4, floor_name: 'Floor 4' },
          { floor_id: 5, floor_name: 'Floor 5' },
          { floor_id: 6, floor_name: 'Floor 6' },
          { floor_id: 7, floor_name: 'Floor 7' },
          { floor_id: 8, floor_name: 'Floor 8' },
          { floor_id: 9, floor_name: 'Floor 9' }
        ];
        floors = (leaderFloors && leaderFloors.length > 0)
          ? defaultFloors.filter(f => leaderFloors.includes(f.floor_id))
          : defaultFloors;
      }

      // Live present count per floor specifically for activeFilterKey on targetDate
      let floorPresentQuery = `
        SELECT COALESCE(st.floor_id, ar.floor_id, 0) AS floor_id, COUNT(DISTINCT TRIM(LEADING '0' FROM ar.bank_code)) AS present_count
        FROM attendance_records ar
        JOIN attendance_sessions s ON ar.session_id = s.id
        LEFT JOIN students st ON (TRIM(LEADING '0' FROM st.student_code) = TRIM(LEADING '0' FROM ar.bank_code) OR st.student_code = ar.bank_code)
        WHERE (DATE(s.session_date) = ? OR LEFT(s.session_date, 10) = ? OR s.session_date = ?)
          AND (st.is_active = TRUE OR ar.bank_code IS NOT NULL)
      `;
      const floorPresentParams = [targetDate, targetDate, targetDate];
      if (activeFilterKey !== 'all') {
        floorPresentQuery += ' AND (LOWER(s.session_type) = LOWER(?) OR LOWER(REPLACE(s.session_type, "_", "")) = LOWER(REPLACE(?, "_", "")) OR LOWER(s.session_type) LIKE CONCAT(LOWER(?), "%"))';
        floorPresentParams.push(activeFilterKey, activeFilterKey, activeFilterKey);
      }
      if (leaderFloors && leaderFloors.length > 0) {
        floorPresentQuery += ' AND (st.floor_id IN (?) OR ar.floor_id IN (?))';
        floorPresentParams.push(leaderFloors, leaderFloors);
      }
      floorPresentQuery += ' GROUP BY COALESCE(st.floor_id, ar.floor_id, 0)';

      const [floorPresentRows] = await pool.query(floorPresentQuery, floorPresentParams);
      const floorPresentMap = {};
      for (const row of floorPresentRows || []) {
        floorPresentMap[row.floor_id] = parseInt(row.present_count || 0, 10);
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
      for (const row of floorTotalRows || []) {
        floorTotalMap[row.floor_id] = parseInt(row.floor_total || 0, 10);
      }

      floor_status = (floors || []).map(f => {
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
    } catch (e) {
      console.warn('Dashboard floor_status query warning:', e.message);
    }

    // 8. Find students absent for the last 3 actual occurrences of the selected session on or before targetDate
    let distinctDatesRows = [];
    try {
      let distinctDatesQuery = `
        SELECT DISTINCT LEFT(ses.session_date, 10) as session_date 
        FROM attendance_sessions ses
        JOIN attendance_records ar ON ses.id = ar.session_id
        WHERE (LEFT(ses.session_date, 10) <= ? OR ses.session_date <= ? OR DATE(ses.session_date) <= ?)
      `;
      const distinctDatesParams = [targetDate, targetDate, targetDate];
      if (activeFilterKey !== 'all') {
        distinctDatesQuery += ' AND LOWER(ses.session_type) = LOWER(?)';
        distinctDatesParams.push(activeFilterKey);
      }
      distinctDatesQuery += ' ORDER BY LEFT(ses.session_date, 10) DESC LIMIT 3';
      const [rows] = await pool.query(distinctDatesQuery, distinctDatesParams);
      distinctDatesRows = rows || [];
    } catch (dErr) {
      console.warn('Dashboard distinct dates query warning:', dErr.message);
    }

    let targetDates = distinctDatesRows.map(r => {
      const d = new Date(r.session_date);
      return !isNaN(d.getTime())
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        : String(r.session_date).slice(0, 10);
    });

    // Only compute consecutive defaulters if at least 3 distinct conducted sessions exist in history
    if (targetDates.length < 3) {
      targetDates = [];
    }

    let activeStudents = [];
    try {
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
      const [stRows] = await pool.query(activeStudentsQuery, activeStudentsParams);
      activeStudents = stRows || [];
    } catch (e) {
      console.warn('Dashboard activeStudents query warning:', e.message);
    }

    // Initialize tracking sets and maps
    const attendedSet = new Set();
    const justifiedSet = new Set();
    const justificationMap = new Map();

    if (targetDates.length > 0) {
      try {
        let recQuery = `
          SELECT TRIM(LEADING '0' FROM ar.bank_code) as bank_code, LEFT(ses.session_date, 10) as session_date
          FROM attendance_records ar
          JOIN attendance_sessions ses ON ar.session_id = ses.id
          WHERE LEFT(ses.session_date, 10) IN (?) OR ses.session_date IN (?) OR DATE(ses.session_date) IN (?)
        `;
        const recParams = [targetDates, targetDates, targetDates];
        if (activeFilterKey !== 'all') {
          recQuery += ' AND LOWER(ses.session_type) = LOWER(?)';
          recParams.push(activeFilterKey);
        }
        const [recRows] = await pool.query(recQuery, recParams);
        for (const r of recRows || []) {
          const dObj = new Date(r.session_date);
          const dateStr = !isNaN(dObj.getTime())
            ? `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`
            : String(r.session_date).slice(0, 10);
          if (r.bank_code) attendedSet.add(`${r.bank_code}_${dateStr}`);
        }
      } catch (recErr) {
        console.warn('Dashboard attendance records query warning:', recErr.message);
      }

      try {
        let justQuery = `
          SELECT student_id, session_date, reason, is_justified
          FROM attendance_absent_reasons
          WHERE (session_date IN (?) OR DATE(session_date) IN (?)) AND is_justified = 1
        `;
        const justParams = [targetDates, targetDates];
        if (activeFilterKey !== 'all') {
          justQuery += ' AND (session_type = ? OR session_type IS NULL)';
          justParams.push(activeFilterKey);
        }
        const [justRows] = await pool.query(justQuery, justParams);
        for (const j of justRows || []) {
          const dObj = new Date(j.session_date);
          const dateStr = !isNaN(dObj.getTime())
            ? `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`
            : String(j.session_date).slice(0, 10);
          justifiedSet.add(`${j.student_id}_${dateStr}`);
          if (j.reason) {
            justificationMap.set(`${j.student_id}_${dateStr}`, j.reason);
            justificationMap.set(j.student_id, j.reason);
          }
        }
      } catch (justErr) {
        console.warn('Dashboard absent reasons query warning:', justErr.message);
      }

      // Check student_leaves for target dates
      try {
        const sortedDates = [...targetDates].sort();
        const minDate = sortedDates[0];
        const maxDate = sortedDates[sortedDates.length - 1];

        const [leaveRows] = await pool.query(`
          SELECT student_id, bank_code, start_time, end_time, reason
          FROM student_leaves
          WHERE status = 'approved' AND (
            DATE(start_time) <= ? AND DATE(end_time) >= ?
          )
        `, [maxDate, minDate]);
        
        for (const lv of leaveRows || []) {
          const lStart = lv.start_time ? new Date(lv.start_time).toISOString().slice(0, 10) : '';
          const lEnd = lv.end_time ? new Date(lv.end_time).toISOString().slice(0, 10) : '';
          const cleanBank = lv.bank_code ? String(lv.bank_code).replace(/^0+/, '') : '';

          for (const d of targetDates) {
            if (lStart && lEnd && d >= lStart && d <= lEnd) {
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
        console.warn('Dashboard leave records query warning:', lvErr.message);
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
      for (const tr of tagRows || []) {
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
      for (const log of aiLogs || []) {
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
        const isJust = justifiedSet.has(`${s.id}_${d}`) || justifiedSet.has(`${cleanCode}_${d}`);
        if (!attended) {
          missedDates.push(d);
          if (isJust) {
            justifiedDates.push(d);
            studentJustification = justificationMap.get(`${s.id}_${d}`) || justificationMap.get(`${cleanCode}_${d}`) || studentJustification || justificationMap.get(s.id);
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
    console.error('GET /api/admin/dashboard error:', err);
    return res.status(500).json({ success: false, message: 'Server error: ' + (err.message || 'Unknown error') });
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
    try {
      await pool.query('ALTER TABLE attendance_schedules ADD COLUMN is_active BOOLEAN DEFAULT TRUE');
    } catch(e) {}

    let query = 'SELECT * FROM attendance_schedules WHERE (is_active = TRUE OR is_active = 1 OR is_active IS NULL)';
    const params = [];

    if (req.leader && Array.isArray(req.leader.assigned_sessions) && req.leader.assigned_sessions.length > 0 && !req.leader.assigned_sessions.includes('all')) {
      query += ' AND session_key IN (?)';
      params.push(req.leader.assigned_sessions);
    }

    query += ' ORDER BY start_time ASC';
    let [rows] = await pool.query(query, params);

    if (rows.length === 0 && (!req.leader || !req.leader.assigned_sessions || req.leader.assigned_sessions.length === 0 || req.leader.assigned_sessions.includes('all'))) {
      try {
        await pool.query(`
          INSERT INTO attendance_schedules (session_key, session_name, icon_name, start_time, end_time, is_active, is_for_all_students)
          VALUES 
          ('night', 'Night Attendance', 'moon', '21:00', '21:30', 1, 1),
          ('aarti', 'Aarti Attendance', 'sun', '06:00', '06:30', 1, 1),
          ('weekly_assembly', 'Weekly Assembly', 'users', '08:00', '09:00', 1, 1)
          ON DUPLICATE KEY UPDATE is_active = 1
        `);
        const [seededRows] = await pool.query(query, params);
        rows = seededRows;
      } catch (seedErr) {
        console.warn('Could not seed default attendance schedules:', seedErr.message);
      }
    }

    return res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('GET /api/admin/sessions error:', err);
    return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
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
// Cascades: Deletes all attendance_records, attendance_sessions,
// attendance_absent_reasons, floor_session_targets, and attendance_schedules
// ------------------------------------------------------------
router.delete('/sessions/:session_key', async (req, res) => {
  try {
    const { session_key } = req.params;
    const sKey = (session_key || '').toLowerCase();

    // 1. Find all attendance_sessions of this type
    const [sessRows] = await pool.query(
      `SELECT id FROM attendance_sessions 
       WHERE LOWER(session_type) = LOWER(?) OR LOWER(REPLACE(session_type, "_", "")) = LOWER(REPLACE(?, "_", "")) OR LOWER(session_type) LIKE CONCAT(LOWER(?), "%")`,
      [sKey, sKey, sKey]
    );

    if (sessRows.length > 0) {
      const sids = sessRows.map(s => s.id);
      // Delete all attendance records
      await pool.query('DELETE FROM attendance_records WHERE session_id IN (?)', [sids]);
      // Delete attendance session instances
      await pool.query('DELETE FROM attendance_sessions WHERE id IN (?)', [sids]);
    }

    // 2. Delete absence reasons for this session
    try {
      await pool.query('DELETE FROM attendance_absent_reasons WHERE LOWER(session_type) = LOWER(?)', [sKey]);
    } catch(e) {}

    // 3. Delete floor session target assignments for this session
    try {
      await pool.query('DELETE FROM floor_session_targets WHERE LOWER(session_key) = LOWER(?)', [sKey]);
    } catch(e) {}

    // 4. Delete the schedule itself
    await pool.query('DELETE FROM attendance_schedules WHERE LOWER(session_key) = LOWER(?)', [sKey]);
    
    return res.json({ success: true, message: 'Session and all associated attendance records deleted successfully' });
  } catch (err) {
    console.error('Error deleting session:', err);
    return res.status(500).json({ success: false, message: 'Server error: ' + (err.sqlMessage || err.message) });
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
        COALESCE(s1.phone_number, s1.assigned_mobile) AS primary_phone,
        s2.room_number AS attempted_room,
        COALESCE(s2.phone_number, s2.assigned_mobile) AS attempted_phone
      FROM device_ip_security_logs l
      LEFT JOIN students s1 ON (l.primary_student_id = s1.id OR TRIM(LEADING '0' FROM l.primary_student_code) = TRIM(LEADING '0' FROM s1.student_code))
      LEFT JOIN students s2 ON (l.attempted_student_id = s2.id OR TRIM(LEADING '0' FROM l.attempted_student_code) = TRIM(LEADING '0' FROM s2.student_code))
      ORDER BY l.attempted_at DESC
      LIMIT 100
    `);

    // Fetch active session schedules to resolve session name for each attempt
    let schedules = [];
    try {
      const [schedRows] = await pool.query('SELECT * FROM attendance_schedules WHERE is_active = TRUE ORDER BY start_time ASC');
      schedules = schedRows || [];
    } catch (schedErr) {}

    // Fetch external student basic details map for accurate phone numbers and rooms
    const extMap = new Map();
    try {
      const https = require('https');
      const apiData = await new Promise((resolve) => {
        const reqExt = https.get('https://api.avdvvn.org/public/getStudentBasicDetails', {
          headers: { 'x-hsh-auth-token': 'aF92Kx7QmN4Lp8Vz' },
          timeout: 4000
        }, (resExt) => {
          let data = '';
          resExt.on('data', chunk => data += chunk);
          resExt.on('end', () => {
            try { resolve(JSON.parse(data)); } catch(e) { resolve(null); }
          });
        });
        reqExt.on('error', () => resolve(null));
        reqExt.on('timeout', () => { reqExt.destroy(); resolve(null); });
      });

      if (apiData && Array.isArray(apiData.data)) {
        for (const s of apiData.data) {
          const cCode = String(s.bankCode).replace(/^0+(?=\d)/, '');
          extMap.set(cCode, s);
          extMap.set(String(s.bankCode), s);
        }
      }
    } catch (e) {}

    function getSessionNameForTime(attemptedAtStr) {
      if (!attemptedAtStr) return 'General';
      try {
        const parts = String(attemptedAtStr).split(/[- :]/);
        let h = 0, m = 0;
        if (parts.length >= 5) {
          h = parseInt(parts[3], 10) || 0;
          m = parseInt(parts[4], 10) || 0;
        }
        const timeMinutes = h * 60 + m;
        for (const s of schedules) {
          const [sh, sm] = (s.start_time || '00:00').split(':').map(Number);
          const [eh, em] = (s.end_time || '23:59').split(':').map(Number);
          const sMin = sh * 60 + sm;
          const eMin = eh * 60 + em;
          if (timeMinutes >= sMin && timeMinutes <= eMin) {
            return s.session_name || s.session_key;
          }
        }
        if (h >= 5 && h < 12) return 'Morning Session';
        if (h >= 12 && h < 17) return 'Afternoon Session';
        if (h >= 17 && h < 22) return 'Evening Session';
        return 'Night Session';
      } catch (e) {
        return 'General';
      }
    }

    // Fetch all student tags map
    const tagsByStudentId = {};
    const tagsByStudentCode = {};
    try {
      const [tagRows] = await pool.query(`
        SELECT sta.student_id, s.student_code, t.id as tag_id, t.name, t.color, t.is_system
        FROM student_tag_assignments sta
        JOIN student_tags t ON sta.tag_id = t.id
        JOIN students s ON sta.student_id = s.id
      `);
      for (const tr of tagRows) {
        const tagObj = { id: tr.tag_id, name: tr.name, color: tr.color, is_system: tr.is_system };
        if (!tagsByStudentId[tr.student_id]) tagsByStudentId[tr.student_id] = [];
        tagsByStudentId[tr.student_id].push(tagObj);

        if (tr.student_code) {
          const cleanCode = String(tr.student_code).replace(/^0+/, '');
          if (!tagsByStudentCode[cleanCode]) tagsByStudentCode[cleanCode] = [];
          tagsByStudentCode[cleanCode].push(tagObj);
          if (!tagsByStudentCode[tr.student_code]) tagsByStudentCode[tr.student_code] = [];
          tagsByStudentCode[tr.student_code].push(tagObj);
        }
      }
    } catch (tagErr) {
      console.warn('[SecurityLogs Tag Fetch Warning]', tagErr.message);
    }

    const enrichedLogs = logs.map(log => {
      const pCleanCode = String(log.primary_student_code || '').replace(/^0+(?=\d)/, '');
      const aCleanCode = String(log.attempted_student_code || '').replace(/^0+(?=\d)/, '');
      const pExt = extMap.get(pCleanCode) || extMap.get(String(log.primary_student_code || ''));
      const aExt = extMap.get(aCleanCode) || extMap.get(String(log.attempted_student_code || ''));

      const pTags = tagsByStudentId[log.primary_student_id] || tagsByStudentCode[pCleanCode] || tagsByStudentCode[log.primary_student_code] || [];
      const aTags = tagsByStudentId[log.attempted_student_id] || tagsByStudentCode[aCleanCode] || tagsByStudentCode[log.attempted_student_code] || [];

      return {
        ...log,
        primary_phone: pExt?.phone || log.primary_phone || '',
        primary_room: pExt?.room || log.primary_room || '',
        primary_tags: pTags,
        attempted_phone: aExt?.phone || log.attempted_phone || '',
        attempted_room: aExt?.room || log.attempted_room || '',
        attempted_tags: aTags,
        session_name: getSessionNameForTime(log.attempted_at)
      };
    });

    const [bindings] = await pool.query(`
      SELECT 
        b.*,
        COALESCE(s.room_number, '') AS room_number,
        COALESCE(s.phone_number, s.assigned_mobile, '') AS phone_number
      FROM device_ip_bindings b
      LEFT JOIN students s ON (b.student_id = s.id OR TRIM(LEADING '0' FROM b.student_code) = TRIM(LEADING '0' FROM s.student_code))
      ORDER BY b.last_login_at DESC
      LIMIT 100
    `);

    const enrichedBindings = bindings.map(bind => {
      const bClean = String(bind.student_code || '').replace(/^0+(?=\d)/, '');
      const bExt = extMap.get(bClean) || extMap.get(String(bind.student_code || ''));
      const bTags = tagsByStudentId[bind.student_id] || tagsByStudentCode[bClean] || tagsByStudentCode[bind.student_code] || [];
      return {
        ...bind,
        phone_number: bExt?.phone || bind.phone_number || '',
        room_number: bExt?.room || bind.room_number || '',
        tags: bTags
      };
    });

    return res.json({
      success: true,
      data: {
        logs: enrichedLogs,
        bindings: enrichedBindings
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
    const { log_id, ip_address, attempted_student_id, reason, justification } = req.body;
    const authorizerName = req.admin ? 'ADMIN' : (req.leader?.username || req.leader?.name || 'ADMIN');
    const justificationText = String(reason || justification || '').trim();

    if (log_id) {
      const [logRows] = await pool.query('SELECT * FROM device_ip_security_logs WHERE id = ?', [log_id]);
      if (logRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Log entry not found' });
      }
      const log = logRows[0];
      const updatedDetails = justificationText 
        ? `${log.details || ''} [Justification: ${justificationText}]`.trim() 
        : (log.details || 'Authorized by admin office');

      const { getISTDate } = require('../services/deviceSecurity');
      const istNow = getISTDate();

      await pool.query(
        `UPDATE device_ip_security_logs 
         SET status = 'AUTHORIZED_BY_ADMIN', resolved_by = ?, resolved_at = ?, details = ? 
         WHERE id = ?`,
        [authorizerName, istNow, updatedDetails, log_id]
      );

      // Reset the Previously Bound Student's IP and device binding so they can log in cleanly
      if (log.primary_student_id || log.primary_student_code) {
        const pId = log.primary_student_id;
        const pCode = log.primary_student_code;
        const cleanPCode = String(pCode || '').replace(/^0+/, '');

        try {
          await pool.query(
            `DELETE FROM device_ip_bindings 
             WHERE student_id = ? OR student_code = ? OR TRIM(LEADING '0' FROM student_code) = ?`,
            [pId, pCode, cleanPCode]
          );
        } catch (delErr) {
          console.warn('Reset previous binding warning:', delErr.message);
        }

        try {
          await pool.query(
            `UPDATE students 
             SET device_uuid = NULL, last_known_ip = NULL, is_device_bound = FALSE 
             WHERE id = ? OR student_code = ? OR TRIM(LEADING '0' FROM student_code) = ?`,
            [pId, pCode, cleanPCode]
          );
        } catch (stErr) {
          console.warn('Reset student device warning:', stErr.message);
        }
      }

      // Upsert binding so the attempted student can login without friction
      try {
        await pool.query(
          `INSERT INTO device_ip_bindings (ip_address, student_id, student_code, student_name, device_uuid, last_login_at, is_whitelisted)
           VALUES (?, ?, ?, ?, ?, ?, FALSE)
           ON DUPLICATE KEY UPDATE 
             student_code = VALUES(student_code),
             student_name = VALUES(student_name),
             last_login_at = VALUES(last_login_at)`,
          [log.ip_address, log.attempted_student_id, log.attempted_student_code, log.attempted_student_name, log.device_uuid, istNow]
        );
      } catch (bindErr) {
        console.warn('Binding attempted student warning:', bindErr.message);
      }

      return res.json({ 
        success: true, 
        message: `Student ${log.attempted_student_name} authorized and previously bound device/IP for ${log.primary_student_name || 'student'} reset successfully!` 
      });
    } else if (ip_address && attempted_student_id) {
      const { getISTDate } = require('../services/deviceSecurity');
      const istNow = getISTDate();

      await pool.query(
        `UPDATE device_ip_security_logs 
         SET status = 'AUTHORIZED_BY_ADMIN', resolved_by = ?, resolved_at = ? 
         WHERE ip_address = ? AND attempted_student_id = ?`,
        [authorizerName, istNow, ip_address, attempted_student_id]
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

// POST /api/admin/security/un-justify (Revoke Authorization / Re-block)
router.post('/security/un-justify', async (req, res) => {
  try {
    const { log_id } = req.body;
    if (!log_id) {
      return res.status(400).json({ success: false, message: 'Missing log_id' });
    }

    const [logRows] = await pool.query('SELECT * FROM device_ip_security_logs WHERE id = ?', [log_id]);
    if (logRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Log entry not found' });
    }
    const log = logRows[0];

    // Revert status to BLOCKED and clear resolution details
    await pool.query(
      `UPDATE device_ip_security_logs 
       SET status = 'BLOCKED', resolved_by = NULL, resolved_at = NULL 
       WHERE id = ?`,
      [log_id]
    );

    // Remove any active binding created for this attempted student on this device/IP
    if (log.attempted_student_id) {
      await pool.query(
        `DELETE FROM device_ip_bindings 
         WHERE (student_id = ? OR student_code = ?) AND (ip_address = ? OR (device_uuid IS NOT NULL AND device_uuid = ?))`,
        [log.attempted_student_id, log.attempted_student_code, log.ip_address, log.device_uuid]
      );
    }

    return res.json({ 
      success: true, 
      message: `Justification revoked. Student ${log.attempted_student_name} is now blocked again.` 
    });
  } catch (err) {
    console.error('Unjustify Security Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});


// POST /api/admin/security/clear-binding
router.post('/security/clear-binding', async (req, res) => {
  try {
    const { binding_id, ip_address, student_id } = req.body;
    if (student_id) {
      const cleanId = String(student_id).replace(/^0+/, '');
      await pool.query(
        'DELETE FROM device_ip_bindings WHERE student_id = ? OR student_code = ? OR TRIM(LEADING \'0\' FROM student_code) = ?',
        [student_id, student_id, cleanId]
      );
      try {
        await pool.query(
          'UPDATE students SET device_uuid = NULL, last_known_ip = NULL, is_device_bound = FALSE WHERE id = ? OR student_code = ? OR TRIM(LEADING \'0\' FROM student_code) = ?',
          [student_id, student_id, cleanId]
        );
      } catch (colErr) {
        await pool.query('UPDATE students SET device_uuid = NULL WHERE id = ? OR student_code = ?', [student_id, student_id]);
      }
      try {
        await pool.query(
          `UPDATE device_ip_security_logs 
           SET status = 'RESOLVED', resolved_by = 'ADMIN', resolved_at = NOW() 
           WHERE attempted_student_id = ? OR primary_student_id = ? OR attempted_student_code = ? OR primary_student_code = ?`,
          [student_id, student_id, student_id, student_id]
        );
      } catch (logErr) {}
      return res.json({ success: true, message: 'Device & IP binding cleared successfully' });
    } else if (binding_id) {
      // Find the binding first to know the student_id
      const [bRows] = await pool.query('SELECT student_id, student_code FROM device_ip_bindings WHERE id = ?', [binding_id]);
      await pool.query('DELETE FROM device_ip_bindings WHERE id = ?', [binding_id]);
      if (bRows.length > 0) {
        const sId = bRows[0].student_id;
        const sCode = bRows[0].student_code;
        try {
          await pool.query('UPDATE students SET device_uuid = NULL, last_known_ip = NULL, is_device_bound = FALSE WHERE id = ? OR student_code = ?', [sId, sCode]);
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
