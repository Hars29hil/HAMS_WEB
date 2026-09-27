// Computes the SAME rotating token the ESP32 computes, independently.
// Both sides use: HMAC-SHA256(floor_id + time_slot, shared_secret) -> truncated hex
//
// This lets each floor's ESP32 broadcast a token with NO internet connection -
// it just needs its clock synced (via the ground-floor NTP relay over BLE).
// The backend verifies by recomputing the same value for the current
// (and previous, for clock-drift tolerance) time slot.

const crypto = require('crypto');

const SECRET = process.env.BLE_TOKEN_SECRET;
const ROTATION_SECONDS = parseInt(process.env.TOKEN_ROTATION_SECONDS || '45', 10);

/**
 * Computes the token for a given floor at a given unix time.
 * @param {number} floorId
 * @param {number} unixSeconds
 * @returns {string} 8-char hex token
 */
function computeToken(floorId, unixSeconds) {
  const timeSlot = Math.floor(unixSeconds / ROTATION_SECONDS);
  const payload = `${floorId}:${timeSlot}`;
  const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return hmac.substring(0, 8); // short token, easy to transmit over BLE
}

/**
 * Validates a token submitted by the app for a given floor.
 * Accepts the current slot AND the previous slot (grace window for
 * clock drift / network delay between BLE read and API call).
 * @param {number} floorId
 * @param {string} submittedToken
 * @returns {boolean}
 */
function isTokenValid(floorId, submittedToken) {
  if (!submittedToken) return false;
  const now = Math.floor(Date.now() / 1000);

  const currentToken = computeToken(floorId, now);
  const previousToken = computeToken(floorId, now - ROTATION_SECONDS);

  return submittedToken === currentToken || submittedToken === previousToken;
}

module.exports = { computeToken, isTokenValid, ROTATION_SECONDS };
