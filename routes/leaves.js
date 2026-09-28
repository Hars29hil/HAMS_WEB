const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const leaveService = require('../services/leaveService');
const { verifyAdmin, verifyAdminOrFloorLeader } = require('../middleware/auth');

let lastLeaveSyncTime = 0;

// ------------------------------------------------------------
// GET /api/leaves
// Returns list of student leaves with optional filtering
// ------------------------------------------------------------
router.get('/', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    const { 
      status, 
      floor_id, 
      search, 
      startDate, 
      endDate, 
      active_only 
    } = req.query;

    // On-demand background sync if specific dates are queried or if sync hasn't run in 30s
    const nowMs = Date.now();
    if (startDate || endDate || (nowMs - lastLeaveSyncTime > 30000)) {
      lastLeaveSyncTime = nowMs;
      const today = new Date();
      const defaultStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const defaultEnd = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      leaveService.syncLeaves({
        startDate: startDate || defaultStart,
        endDate: endDate || defaultEnd
      }).catch(err => {
        console.warn('[Leaves API] On-demand sync warning:', err.message);
      });
    }

    let leaderFloors = null;
    if (req.leader) {
      if (Array.isArray(req.leader.assigned_floors) && req.leader.assigned_floors.length > 0) {
        leaderFloors = req.leader.assigned_floors.map(f => parseInt(f, 10)).filter(f => !isNaN(f));
      } else if (req.leader.floor_id !== undefined) {
        leaderFloors = [parseInt(req.leader.floor_id, 10)];
      }
    }

    let query = `
      SELECT l.id, l.bank_code, l.student_id, 
             COALESCE(s.name, CONCAT_WS(' ', l.first_name, l.middle_name, l.last_name)) AS student_name,
             COALESCE(s.floor_id, f.floor_id) AS floor_id,
             f.floor_name,
             COALESCE(s.room_number, l.room) AS room_number,
             COALESCE(s.assigned_mobile, s.phone_number, l.phone) AS phone,
             s.parent_phone,
             l.aadhar,
             l.start_time,
             l.end_time,
             l.status,
             l.reason,
             l.created_at,
             l.updated_at
      FROM student_leaves l
      LEFT JOIN students s ON (l.student_id = s.id OR TRIM(LEADING '0' FROM l.bank_code) = TRIM(LEADING '0' FROM s.student_code))
      LEFT JOIN floors f ON s.floor_id = f.floor_id
      WHERE 1=1
    `;
    const params = [];

    if (active_only === 'true') {
      query += ` AND l.status = 'approved' AND NOW() BETWEEN l.start_time AND l.end_time`;
    }

    if (status && status !== 'all') {
      query += ` AND l.status = ?`;
      params.push(status);
    }

    if (startDate && endDate) {
      query += ` AND (DATE(l.start_time) <= ? AND DATE(l.end_time) >= ?)`;
      params.push(endDate, startDate);
    } else if (startDate) {
      query += ` AND DATE(l.end_time) >= ?`;
      params.push(startDate);
    } else if (endDate) {
      query += ` AND DATE(l.start_time) <= ?`;
      params.push(endDate);
    }

    if (floor_id && floor_id !== 'All') {
      query += ` AND s.floor_id = ?`;
      params.push(floor_id);
    }

    if (leaderFloors && leaderFloors.length > 0) {
      query += ` AND s.floor_id IN (?)`;
      params.push(leaderFloors);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` AND (
        l.bank_code LIKE ? OR 
        s.name LIKE ? OR 
        l.first_name LIKE ? OR 
        l.last_name LIKE ? OR 
        l.room LIKE ? OR 
        s.room_number LIKE ? OR
        l.phone LIKE ? OR
        l.reason LIKE ?
      )`;
      params.push(term, term, term, term, term, term, term, term);
    }

    query += ` ORDER BY l.start_time DESC LIMIT 500`;

    const [rows] = await pool.query(query, params);

    return res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (err) {
    console.error('Error fetching leaves:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch leaves',
      error: err.message
    });
  }
});

// ------------------------------------------------------------
// GET /api/leaves/stats
// Returns summary statistics of leaves
// ------------------------------------------------------------
router.get('/stats', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    const [[{ total_leaves }]] = await pool.query('SELECT COUNT(*) as total_leaves FROM student_leaves');
    const [[{ active_leaves_today }]] = await pool.query(`
      SELECT COUNT(*) as active_leaves_today 
      FROM student_leaves 
      WHERE status = 'approved' AND NOW() BETWEEN start_time AND end_time
    `);
    const [[{ upcoming_leaves }]] = await pool.query(`
      SELECT COUNT(*) as upcoming_leaves 
      FROM student_leaves 
      WHERE status = 'approved' AND start_time > NOW()
    `);

    return res.json({
      success: true,
      data: {
        total_leaves: total_leaves || 0,
        active_leaves_today: active_leaves_today || 0,
        upcoming_leaves: upcoming_leaves || 0
      }
    });
  } catch (err) {
    console.error('Error in leaves stats:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch leave stats', error: err.message });
  }
});

// ------------------------------------------------------------
// POST /api/leaves/sync
// Manually triggers leave synchronization from external API
// ------------------------------------------------------------
router.post('/sync', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    const { startDate, endDate } = req.body || {};
    const result = await leaveService.syncLeaves({ startDate, endDate });

    return res.json({
      success: true,
      message: `Successfully synced ${result.total} leaves from portal (${result.inserted} added, ${result.updated} updated).`,
      data: result
    });
  } catch (err) {
    console.error('Error during manual leave sync:', err);
    return res.status(500).json({
      success: false,
      message: 'Leave synchronization failed: ' + err.message
    });
  }
});

module.exports = router;
