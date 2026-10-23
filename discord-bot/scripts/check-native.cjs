const { spawnSync } = require('node:child_process');
const path = require('node:path');

const cwd = path.resolve(__dirname, '..');
const probe = "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.prepare('SELECT 1').get(); db.close();";

function check() {
  return spawnSync(process.execPath, ['-e', probe], { cwd, encoding: 'utf8' });
}

let result = check();
if (result.status === 0) process.exit(0);

// Run the probe in a separate process so a rebuilt DLL is loaded fresh on Windows.
console.error(`Native SQLite check failed on Node.js ${process.version}. Rebuilding better-sqlite3...`);
const rebuild = spawnSync('npm rebuild better-sqlite3', {
  cwd,
  shell: true,
  stdio: 'inherit',
});
if (rebuild.status === 0) {
  result = check();
  if (result.status === 0) process.exit(0);
}

console.error(result.stderr || result.error || 'Native SQLite could not be loaded.');
console.error('Use Node.js 22 and run npm install in discord-bot, then retry npm start.');
console.error('If you keep your current Node.js version, rebuilding may require Python and Visual Studio C++ Build Tools on Windows.');
process.exit(1);
