const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function verifyStudent(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing token' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Not a student token' });
    }
    
    // Check if the student still exists and is active in the DB
    if (decoded.id !== 99999) {
      const [rows] = await pool.query('SELECT id, is_active FROM students WHERE id = ?', [decoded.id]);
      if (rows.length === 0 || rows[0].is_active === 0) {
        return res.status(401).json({ success: false, message: 'Student account not found or inactive.' });
      }
    }
    
    req.student = decoded; // { id, student_code, floor_id, role }
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    console.error('Auth middleware error:', err);
    return res.status(500).json({ success: false, message: 'Server error in auth middleware' });
  }
}

async function verifyFloorLeader(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing token' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'floor_leader') {
      return res.status(403).json({ success: false, message: 'Not a floor leader token' });
    }

    // Fetch live permissions and assigned data directly from DB
    if (decoded.id && decoded.id !== 99999) {
      try {
        const [rows] = await pool.query('SELECT * FROM floor_leaders WHERE id = ?', [decoded.id]);
        if (rows.length === 0 || rows[0].is_active === 0) {
          return res.status(401).json({ success: false, message: 'Leader account not found or inactive.' });
        }
        const leader = rows[0];
        let sessionPermissions = {};
        if (leader.session_permissions) {
          try {
            sessionPermissions = typeof leader.session_permissions === 'string' ? JSON.parse(leader.session_permissions) : leader.session_permissions;
          } catch(e) {
            sessionPermissions = {};
          }
        }
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
        req.leader = {
          ...decoded,
          floor_id: assignedFloors[0] || leader.floor_id,
          assigned_floors: assignedFloors,
          assigned_sessions: assignedSessions,
          session_permissions: sessionPermissions
        };
      } catch (dbErr) {
        req.leader = decoded;
      }
    } else {
      req.leader = decoded;
    }

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function verifyAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing token' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not an admin token' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

async function verifyAdminOrFloorLeader(req, res, next) {
  let token;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'Missing token' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin' && decoded.role !== 'floor_leader' && decoded.role !== 'operator') {
      return res.status(403).json({ success: false, message: 'Not an admin, floor leader, or operator token' });
    }
    if (decoded.role === 'admin') {
      req.admin = decoded;
    } else {
      if (decoded.id && decoded.id !== 99999) {
        try {
          const [rows] = await pool.query('SELECT * FROM floor_leaders WHERE id = ?', [decoded.id]);
          if (rows.length === 0 || rows[0].is_active === 0) {
            return res.status(401).json({ success: false, message: 'Leader account not found or inactive.' });
          }
          const leader = rows[0];
          let sessionPermissions = {};
          if (leader.session_permissions) {
            try {
              sessionPermissions = typeof leader.session_permissions === 'string' ? JSON.parse(leader.session_permissions) : leader.session_permissions;
            } catch(e) {
              sessionPermissions = {};
            }
          }
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
          req.leader = {
            ...decoded,
            floor_id: assignedFloors[0] || leader.floor_id,
            assigned_floors: assignedFloors,
            assigned_sessions: assignedSessions,
            session_permissions: sessionPermissions
          };
        } catch (dbErr) {
          req.leader = decoded;
        }
      } else {
        req.leader = decoded;
      }
    }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function verifyOperator(req, res, next) {
  let token;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ success: false, message: 'Missing token' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'operator') {
      return res.status(403).json({ success: false, message: 'Not an operator token' });
    }
    req.operator = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

module.exports = { verifyStudent, verifyFloorLeader, verifyAdmin, verifyAdminOrFloorLeader, verifyOperator };
