const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../config/db');
const { verifyAdminOrFloorLeader } = require('../middleware/auth');

function generateFloorToken(floorId) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    rand += chars[bytes[i] % chars.length];
  }
  return `FLR${floorId}-${rand.slice(0, 4)}-${rand.slice(4, 8)}`;
}

// ------------------------------------------------------------
// GET /api/strings or /api/strings/all
// Fetch all created strings per floor
// ------------------------------------------------------------
router.get(['/', '/all'], async (req, res) => {
  try {
    const [floors] = await pool.query(`
      SELECT 
        floor_id, 
        floor_name, 
        security_string, 
        string_updated_at,
        device_name,
        last_seen
      FROM floors 
      ORDER BY floor_id ASC
    `);

    const result = floors.map(f => ({
      floor_id: f.floor_id,
      floor_name: f.floor_name,
      string_value: f.security_string || null,
      updated_at: f.string_updated_at || null,
      has_string: Boolean(f.security_string && f.security_string.trim().length > 0),
      device_name: f.device_name || null,
      last_seen: f.last_seen || null
    }));

    return res.json({
      success: true,
      count: result.length,
      active_strings_count: result.filter(r => r.has_string).length,
      data: result
    });
  } catch (err) {
    console.error('Error in /api/strings:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching strings' });
  }
});

// ------------------------------------------------------------
// GET /api/strings/:floorId
// ------------------------------------------------------------
router.get('/:floorId', async (req, res) => {
  try {
    const { floorId } = req.params;
    const [rows] = await pool.query(
      'SELECT floor_id, floor_name, security_string, string_updated_at FROM floors WHERE floor_id = ?',
      [floorId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Floor not found' });
    }

    const floor = rows[0];
    return res.json({
      success: true,
      data: {
        floor_id: floor.floor_id,
        floor_name: floor.floor_name,
        string_value: floor.security_string || null,
        updated_at: floor.string_updated_at || null,
        has_string: Boolean(floor.security_string && floor.security_string.trim().length > 0)
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ------------------------------------------------------------
// POST /api/strings/generate
// ------------------------------------------------------------
router.post('/generate', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    const { floor_id, string_value, custom_string } = req.body;

    if (floor_id === undefined || floor_id === null) {
      return res.status(400).json({ success: false, message: 'floor_id is required' });
    }

    const [existing] = await pool.query('SELECT floor_id, floor_name FROM floors WHERE floor_id = ?', [floor_id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: `Floor ID ${floor_id} not found` });
    }

    let finalString = (custom_string || string_value || '').trim();
    if (!finalString) {
      finalString = generateFloorToken(floor_id);
    }

    await pool.query(
      'UPDATE floors SET security_string = ?, string_updated_at = NOW() WHERE floor_id = ?',
      [finalString, floor_id]
    );

    return res.json({
      success: true,
      message: `Security string generated successfully for ${existing[0].floor_name}`,
      data: {
        floor_id,
        floor_name: existing[0].floor_name,
        string_value: finalString,
        updated_at: new Date()
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error generating string' });
  }
});

// ------------------------------------------------------------
// POST /api/strings/generate-all
// ------------------------------------------------------------
router.post('/generate-all', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    const [floors] = await pool.query('SELECT floor_id, floor_name FROM floors ORDER BY floor_id ASC');
    if (floors.length === 0) {
      return res.status(404).json({ success: false, message: 'No floors found in system' });
    }

    const updatedList = [];
    for (const fl of floors) {
      const token = generateFloorToken(fl.floor_id);
      await pool.query(
        'UPDATE floors SET security_string = ?, string_updated_at = NOW() WHERE floor_id = ?',
        [token, fl.floor_id]
      );
      updatedList.push({
        floor_id: fl.floor_id,
        floor_name: fl.floor_name,
        string_value: token
      });
    }

    return res.json({
      success: true,
      message: `Generated strings for ${updatedList.length} floors successfully`,
      data: updatedList
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error generating all strings' });
  }
});

// ------------------------------------------------------------
// DELETE /api/strings/:floorId
// ------------------------------------------------------------
router.delete('/:floorId', verifyAdminOrFloorLeader, async (req, res) => {
  try {
    const { floorId } = req.params;
    const [existing] = await pool.query('SELECT floor_id, floor_name FROM floors WHERE floor_id = ?', [floorId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Floor not found' });
    }

    await pool.query('UPDATE floors SET security_string = NULL, string_updated_at = NULL WHERE floor_id = ?', [floorId]);

    return res.json({
      success: true,
      message: `Security string cleared for ${existing[0].floor_name}`
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error clearing string' });
  }
});

module.exports = router;
