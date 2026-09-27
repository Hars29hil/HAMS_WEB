const https = require('https');
const pool = require('../config/db');

const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

/**
 * Call Google Gemini REST API with key rotation and fallback models
 */
async function callGemini(promptText) {
  const models = [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3-flash-preview'
  ];

  const postData = JSON.stringify({
    contents: [
      {
        parts: [{ text: promptText }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  });

  // Try each key and model combination
  for (const currentKey of GEMINI_API_KEYS) {
    for (const model of models) {
      for (let attempt = 0; attempt <= 1; attempt++) {
        try {
          const response = await new Promise((resolve, reject) => {
            const req = https.request({
              hostname: 'generativelanguage.googleapis.com',
              path: `/v1beta/models/${model}:generateContent?key=${currentKey}`,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
              },
              timeout: 25000
            }, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
            });

            req.on('error', reject);
            req.on('timeout', () => {
              req.destroy();
              reject(new Error('Gemini API timeout'));
            });
            req.write(postData);
            req.end();
          });

          if (response.statusCode === 200) {
            const parsed = JSON.parse(response.body);
            const rawText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) {
              return JSON.parse(rawText);
            }
          } else if (response.statusCode === 429 || response.statusCode === 403 || response.statusCode === 503) {
            // Quota reached or model busy on this key -> switch to next key/model
            console.warn(`[Gemini AI] Key/Model (${model}) returned status ${response.statusCode}. Switching to next key/model...`);
            break;
          }
        } catch (err) {
          console.warn(`[Gemini AI] Call error on key/model ${model} (attempt ${attempt}):`, err.message);
        }
      }
    }
  }

  throw new Error('All Gemini API keys and models failed or timed out.');
}

/**
 * Ensures system tags (Regular, Irregular, Late) exist and are up to date
 */
async function ensureSystemTags() {
  // 0. Ensure description column exists in student_tags
  try {
    await pool.query('ALTER TABLE student_tags ADD COLUMN description VARCHAR(255) NULL');
  } catch (colErr) {
    // Column already exists or table not ready
  }

  // 1. Rename old "Late 3+ Days" to "Late" if exists
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

  // 2. Ensure standard 3 system tags exist
  const systemTags = [
    { name: 'Regular', color: '#10b981', description: 'Consistent daily attendance (>=75%)' },
    { name: 'Irregular', color: '#f59e0b', description: 'Inconsistent attendance / frequent absences' },
    { name: 'Late', color: '#ef4444', description: 'Comes late to attendance' }
  ];

  for (const st of systemTags) {
    try {
      await pool.query(`
        INSERT INTO student_tags (name, color, is_system, description)
        VALUES (?, ?, TRUE, ?)
        ON DUPLICATE KEY UPDATE color = VALUES(color), description = VALUES(description), is_system = TRUE
      `, [st.name, st.color, st.description]);
    } catch (dupErr) {
      try {
        await pool.query(`
          INSERT INTO student_tags (name, color, is_system)
          VALUES (?, ?, TRUE)
          ON DUPLICATE KEY UPDATE color = VALUES(color), is_system = TRUE
        `, [st.name, st.color]);
      } catch (fallbackErr) {}
    }
  }

  // 3. Ensure AI tag analysis logs table exists
  try {
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
  } catch (logTableErr) {}

  // Fetch mapping { "Regular": id, "Irregular": id, "Late": id }
  const [tagRows] = await pool.query('SELECT id, name FROM student_tags WHERE name IN ("Regular", "Irregular", "Late")');
  const tagMap = {};
  for (const r of tagRows) {
    tagMap[r.name] = r.id;
  }
  return tagMap;
}

/**
 * Gather complete attendance data for students (matching both id and bank_code)
 */
async function getStudentAttendanceStats(studentsList) {
  if (!studentsList || studentsList.length === 0) return {};

  const [sessions] = await pool.query(`
    SELECT id, session_date, session_type
    FROM attendance_sessions
    WHERE session_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    ORDER BY session_date DESC, id DESC
  `);

  const sessionIds = sessions.map(s => s.id);
  const statsMap = {};

  for (const s of studentsList) {
    statsMap[s.id] = {
      totalSessions: sessions.length,
      attended: 0,
      late: 0,
      onTime: 0,
      absent: sessions.length,
      recentDays: []
    };
  }

  if (sessionIds.length === 0) {
    return statsMap;
  }

  const [records] = await pool.query(`
    SELECT TRIM(LEADING '0' FROM ar.bank_code) as bank_code, ar.bank_code as raw_bank_code, ar.session_id, ar.is_late, ar.marked_at, ses.session_date, ses.session_type
    FROM attendance_records ar
    JOIN attendance_sessions ses ON ar.session_id = ses.id
    WHERE ses.id IN (?)
  `, [sessionIds]);

  for (const s of studentsList) {
    const cleanCode = (s.student_code || '').replace(/^0+/, '');
    const sRecords = records.filter(r => 
      (r.bank_code && (r.bank_code === cleanCode || r.bank_code === s.student_code)) ||
      (r.raw_bank_code && (r.raw_bank_code === s.student_code || r.raw_bank_code === cleanCode))
    );

    const attendedCount = sRecords.length;
    const lateCount = sRecords.filter(r => r.is_late).length;
    const onTimeCount = sRecords.filter(r => !r.is_late).length;
    const absentCount = Math.max(0, sessions.length - attendedCount);

    statsMap[s.id].attended = attendedCount;
    statsMap[s.id].late = lateCount;
    statsMap[s.id].onTime = onTimeCount;
    statsMap[s.id].absent = absentCount;

    // Timeline summary for last 5 sessions
    for (const ses of sessions.slice(0, 5)) {
      const rec = sRecords.find(r => r.session_id === ses.id);
      if (rec) {
        statsMap[s.id].recentDays.push(rec.is_late ? 'LATE' : 'ON_TIME');
      } else {
        statsMap[s.id].recentDays.push('ABSENT');
      }
    }
  }

  return statsMap;
}

/**
 * Main function to run AI Tag Analysis for all students or specific floor
 */
async function runAiTagAnalysis({ floorId = null, batchSize = 25 } = {}) {
  console.log(`[Gemini AI] Starting comprehensive attendance tag analysis... (Floor: ${floorId || 'ALL'})`);
  
  const tagMap = await ensureSystemTags();
  const systemTagIds = Object.values(tagMap);

  let studentQuery = 'SELECT id, name, student_code, floor_id, room_number FROM students WHERE is_active = TRUE';
  let params = [];
  if (floorId && floorId !== 'All') {
    studentQuery += ' AND floor_id = ?';
    params.push(floorId);
  }
  studentQuery += ' ORDER BY id ASC';

  const [students] = await pool.query(studentQuery, params);
  if (students.length === 0) {
    return { success: true, message: 'No active students found to analyze', total: 0, updated: 0 };
  }

  console.log(`[Gemini AI] Found ${students.length} students to evaluate.`);
  let totalEvaluated = 0;
  let totalAssigned = 0;
  const analysisSummary = [];

  // Process in batches
  for (let i = 0; i < students.length; i += batchSize) {
    const batch = students.slice(i, i + batchSize);
    const statsMap = await getStudentAttendanceStats(batch);

    // Build compact prompt for Gemini with exact counts & percentages
    const studentsPromptData = batch.map(s => {
      const stat = statsMap[s.id] || {};
      const rateNum = stat.totalSessions > 0 ? (stat.attended / stat.totalSessions) * 100 : 0;
      return {
        id: s.id,
        name: s.name,
        code: s.student_code,
        total_sessions: stat.totalSessions,
        attended_sessions: stat.attended,
        late_sessions: stat.late,
        absent_sessions: stat.absent,
        attendance_rate: `${rateNum.toFixed(1)}%`,
        recent_sessions_timeline: stat.recentDays.join(',')
      };
    });

    const promptText = `
You are the strict AI Attendance Auditor for a student hostel.
Classify each student based on their complete attendance records into EXACTLY ONE tag:

TAGGING CRITERIA (Strict Rules):
- "Regular": Student MUST have attendance_rate >= 75% (attended majority on time).
- "Irregular": Student has attendance_rate < 75% (e.g. only attended 1 or 2 times out of 12, or frequent absences).
- "Late": Student attends but frequently arrives late (late_sessions >= 3 and late_sessions >= on-time sessions).

Students Data:
${JSON.stringify(studentsPromptData, null, 2)}

Return JSON array format:
[
  {
    "id": 123,
    "tag": "Irregular", // "Regular" | "Irregular" | "Late"
    "reason": "1-sentence reason mentioning attendance rate (e.g. Low attendance rate of 16.7% (2/12 attended))."
  }
]
`;

    let aiResults = [];
    try {
      aiResults = await callGemini(promptText);
    } catch (apiErr) {
      console.error(`[Gemini AI] API call fallback for batch ${i}-${i + batch.length}:`, apiErr.message);
      // Fallback rule engine
      aiResults = batch.map(s => {
        const stat = statsMap[s.id] || {};
        const rate = stat.totalSessions > 0 ? (stat.attended / stat.totalSessions) * 100 : 0;
        let tag = 'Irregular';
        let reason = `Low attendance rate (${rate.toFixed(1)}%) with ${stat.absent} absences.`;

        if (stat.totalSessions === 0) {
          tag = 'Irregular';
          reason = 'No session records found yet.';
        } else if (stat.late >= 3 && stat.late >= stat.onTime) {
          tag = 'Late';
          reason = `Frequently late (${stat.late} times).`;
        } else if (rate >= 75) {
          tag = 'Regular';
          reason = `Consistent on-time attendance (${rate.toFixed(1)}%).`;
        } else {
          tag = 'Irregular';
          reason = `Low attendance (${stat.attended}/${stat.totalSessions} attended, ${rate.toFixed(1)}%).`;
        }
        return { id: s.id, tag, reason };
      });
    }

    // Apply tags to database
    for (const res of aiResults) {
      const studentId = res.id || res.student_id;
      const stat = (statsMap && statsMap[studentId]) || {};
      const rate = stat.totalSessions > 0 ? (stat.attended / stat.totalSessions) * 100 : 0;
      
      let tagName = 'Irregular';
      if (['Late', 'Irregular', 'Regular'].includes(res.tag)) {
        // Enforce safety: if AI mistakenly says Regular for a student with < 75% attendance rate, override to Irregular
        if (res.tag === 'Regular' && rate < 75 && stat.totalSessions > 0) {
          tagName = 'Irregular';
        } else {
          tagName = res.tag;
        }
      } else {
        tagName = rate >= 75 ? 'Regular' : 'Irregular';
      }

      const targetTagId = tagMap[tagName];

      if (targetTagId && studentId) {
        // Remove existing system tags for this student to prevent duplicate conflicting system tags
        await pool.query(`
          DELETE FROM student_tag_assignments 
          WHERE student_id = ? AND tag_id IN (?)
        `, [studentId, systemTagIds]);

        // Insert new assigned system tag
        await pool.query(`
          INSERT INTO student_tag_assignments (student_id, tag_id, assigned_by)
          VALUES (?, ?, 'GEMINI_AI')
          ON DUPLICATE KEY UPDATE assigned_by = 'GEMINI_AI', assigned_at = CURRENT_TIMESTAMP
        `, [studentId, targetTagId]);

        // Record log
        await pool.query(`
          INSERT INTO ai_tag_analysis_logs (student_id, assigned_tag, reason, analyzed_days)
          VALUES (?, ?, ?, 20)
        `, [studentId, tagName, res.reason || `Assigned ${tagName} based on 20-day attendance pattern.`]);

        totalAssigned++;
        analysisSummary.push({
          student_id: studentId,
          tag: tagName,
          reason: res.reason
        });
      }
    }

    totalEvaluated += batch.length;
    console.log(`[Gemini AI] Processed ${totalEvaluated}/${students.length} students...`);
    
    // Short pause between batches to avoid throttling
    if (i + batchSize < students.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`[Gemini AI] Tag analysis completed! Evaluated: ${totalEvaluated}, Tags Assigned: ${totalAssigned}`);
  return {
    success: true,
    message: `Gemini AI 20-day attendance analysis completed successfully. Evaluated ${totalEvaluated} students.`,
    total_evaluated: totalEvaluated,
    total_assigned: totalAssigned,
    sample_results: analysisSummary.slice(0, 10)
  };
}

module.exports = {
  runAiTagAnalysis,
  ensureSystemTags,
  callGemini
};
