// The kiosk browser talks to the dashboard over localhost, so it's always
// trusted with no key needed (keeps the auto-launch kiosk experience
// seamless). Any other device on the LAN calling the API directly needs
// DASHBOARD_API_KEY, if one is set - matches server-agent's AGENT_API_KEY
// pattern. Unset = open, same as server-agent, for easy initial setup.
const DASHBOARD_API_KEY = process.env.DASHBOARD_API_KEY || '';

function isLoopback(req) {
  const ip = req.ip || (req.connection && req.connection.remoteAddress) || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function requireApiKey(req, res, next) {
  if (!DASHBOARD_API_KEY || isLoopback(req)) return next();
  if (req.get('x-api-key') === DASHBOARD_API_KEY) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

module.exports = { requireApiKey, isLoopback };
