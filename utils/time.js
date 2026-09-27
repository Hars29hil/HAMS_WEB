module.exports.getCurrentIST = function() { 
  const utcMillis = Date.now();
  // IST is UTC + 5:30
  const istMillis = utcMillis + (330 * 60000);
  // Return a Date object where the UTC methods (getUTCHours, etc) return IST values
  return new Date(istMillis);
};
