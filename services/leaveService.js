const https = require('https');
const pool = require('../config/db');

const LEAVE_API_URL = 'https://api.avdvvn.org/public/getTmpLeave';
const LEAVE_API_TOKEN = process.env.LEAVE_API_TOKEN || process.env.AVD_AUTH_TOKEN || 'aF92Kx7QmN4Lp8Vz';

/**
 * Fetch approved leaves from the external college portal
 */
function fetchRemoteLeaves(startDate, endDate) {
  return new Promise((resolve, reject) => {
    let url = LEAVE_API_URL;
    const params = [];
    if (startDate) params.push(`startDate=${encodeURIComponent(startDate)}`);
    if (endDate) params.push(`endDate=${encodeURIComponent(endDate)}`);
    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }

    const options = {
      headers: {
        'x-hsh-auth-token': LEAVE_API_TOKEN,
        'User-Agent': 'HAMS-Leave-Sync/1.0'
      },
      timeout: 10000
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            return reject(new Error(`External Leave API returned HTTP ${res.statusCode}: ${data}`));
          }
          const parsed = JSON.parse(data);
          if (parsed && parsed.auth && Array.isArray(parsed.data)) {
            resolve(parsed.data);
          } else {
            resolve([]);
          }
        } catch (err) {
          reject(new Error(`Failed to parse Leave API response: ${err.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    }).on('timeout', function() {
      this.destroy();
      reject(new Error('Leave API request timed out'));
    });
  });
}

/**
 * Synchronize approved leaves and retroactively mark attendance justification / leave reasons
 */
async function syncLeaves(options = {}) {
  const { startDate, endDate } = options;
  console.log(`[LeaveService] Syncing leaves from portal (startDate: ${startDate || 'now'}, endDate: ${endDate || 'now'})...`);

  try {
    const rawLeaves = await fetchRemoteLeaves(startDate, endDate);
    console.log(`[LeaveService] Received ${rawLeaves.length} approved leaves from external portal.`);

    let insertedCount = 0;
    let updatedCount = 0;

    // Get all active students for bankCode -> student_id mapping
    const [students] = await pool.query('SELECT id, student_code FROM students');
    const studentMap = new Map();
    for (const s of students) {
      if (s.student_code) {
        studentMap.set(String(s.student_code).trim(), s.id);
        studentMap.set(String(s.student_code).replace(/^0+/, ''), s.id);
      }
    }

    // Get all dynamic active sessions for automatic session-type leave marking
    let schedules = [];
    try {
      const [schedRows] = await pool.query('SELECT session_key FROM attendance_schedules WHERE is_active = TRUE');
      schedules = schedRows.map(r => r.session_key);
    } catch (e) {
      schedules = ['night', 'aarti', 'weekly_assembly'];
    }
    if (schedules.length === 0) schedules = ['night'];

    for (const item of rawLeaves) {
      if (!item.bankCode || !item.startTime || !item.endTime) continue;

      const bankCode = String(item.bankCode).trim();
      const cleanBankCode = bankCode.replace(/^0+/, '');
      const studentId = studentMap.get(bankCode) || studentMap.get(cleanBankCode) || null;

      const startTimeStr = item.startTime;
      const endTimeStr = item.endTime;
      const status = (item.status || 'approved').toLowerCase();
      const reason = (item.reason || 'Approved Leave').trim();
      const phone = item.phone ? String(item.phone).trim() : null;
      const room = item.room ? String(item.room).trim() : null;
      const aadhar = item.aadhar ? String(item.aadhar).trim() : null;
      const firstName = item.firstName ? String(item.firstName).trim() : null;
      const middleName = item.middleName ? String(item.middleName).trim() : null;
      const lastName = item.lastName ? String(item.lastName).trim() : null;

      // Upsert into student_leaves
      const [res] = await pool.query(`
        INSERT INTO student_leaves 
          (bank_code, student_id, first_name, middle_name, last_name, phone, room, aadhar, start_time, end_time, status, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          student_id = VALUES(student_id),
          first_name = VALUES(first_name),
          middle_name = VALUES(middle_name),
          last_name = VALUES(last_name),
          phone = VALUES(phone),
          room = VALUES(room),
          aadhar = VALUES(aadhar),
          end_time = VALUES(end_time),
          status = VALUES(status),
          reason = VALUES(reason),
          updated_at = CURRENT_TIMESTAMP
      `, [bankCode, studentId, firstName, middleName, lastName, phone, room, aadhar, startTimeStr, endTimeStr, status, reason]);

      if (res.affectedRows === 1) insertedCount++;
      else if (res.affectedRows >= 2) updatedCount++;

      // If approved and matched with student_id, retroactively populate/ensure attendance_absent_reasons
      if (status === 'approved' && studentId) {
        try {
          // Compute all dates between startTime and endTime
          const startDt = new Date(startTimeStr);
          const endDt = new Date(endTimeStr);
          const curDt = new Date(startDt);

          while (curDt <= endDt) {
            const dateStr = curDt.toISOString().slice(0, 10);
            
            // Mark absent justification for all sessions on this date
            for (const sessionKey of schedules) {
              await pool.query(`
                INSERT INTO attendance_absent_reasons (student_id, session_date, session_type, reason, is_justified)
                VALUES (?, ?, ?, ?, TRUE)
                ON DUPLICATE KEY UPDATE 
                  reason = VALUES(reason),
                  is_justified = TRUE
              `, [studentId, dateStr, sessionKey, `[Approved Leave] ${reason}`]).catch(() => {
                // Fallback if table doesn't have unique constraint or session_type
                return pool.query(`
                  UPDATE attendance_absent_reasons 
                  SET reason = ?, is_justified = TRUE 
                  WHERE student_id = ? AND session_date = ? AND (session_type = ? OR session_type IS NULL)
                `, [`[Approved Leave] ${reason}`, studentId, dateStr, sessionKey]);
              });
            }

            curDt.setDate(curDt.getDate() + 1);
          }
        } catch (markErr) {
          console.warn(`[LeaveService] Warning applying leave reasons for ${bankCode}:`, markErr.message);
        }
      }
    }

    console.log(`[LeaveService] Sync finished. Total: ${rawLeaves.length} (New: ${insertedCount}, Updated: ${updatedCount})`);
    return {
      success: true,
      total: rawLeaves.length,
      inserted: insertedCount,
      updated: updatedCount
    };
  } catch (err) {
    console.error(`[LeaveService] Error syncing leaves:`, err.message);
    throw err;
  }
}

/**
 * Check if a student is on approved leave for a specific date and time
 */
async function isStudentOnLeave(studentId, bankCode, sessionDate, startTimeStr = '00:00:00', endTimeStr = '23:59:59') {
  try {
    const cleanBank = bankCode ? String(bankCode).replace(/^0+/, '') : '';
    const startDateTime = `${sessionDate} ${startTimeStr}`;
    const endDateTime = `${sessionDate} ${endTimeStr}`;

    const [rows] = await pool.query(`
      SELECT id, reason, start_time, end_time, status
      FROM student_leaves
      WHERE (student_id = ? OR bank_code = ? OR TRIM(LEADING '0' FROM bank_code) = ?)
        AND status = 'approved'
        AND start_time <= ?
        AND end_time >= ?
      LIMIT 1
    `, [studentId || 0, bankCode || '', cleanBank, endDateTime, startDateTime]);

    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error('[LeaveService] Error checking leave:', err.message);
    return null;
  }
}

module.exports = {
  fetchRemoteLeaves,
  syncLeaves,
  isStudentOnLeave
};
