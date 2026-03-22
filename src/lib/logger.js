const levels = { debug: 0, info: 1, warn: 2, error: 3 };

export function createLogger(levelName = 'info') {
  const min = levels[levelName] ?? 1;
  function log(level, msg, extra) {
    if (levels[level] < min) return;
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}`;
    if (extra !== undefined) console[level === 'error' ? 'error' : 'log'](line, extra);
    else console[level === 'error' ? 'error' : 'log'](line);
  }
  return {
    debug: (m, e) => log('debug', m, e),
    info: (m, e) => log('info', m, e),
    warn: (m, e) => log('warn', m, e),
    error: (m, e) => log('error', m, e),
  };
}
