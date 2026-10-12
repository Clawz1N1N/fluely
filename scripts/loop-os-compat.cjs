// Scoped preload for the installed Loop CLI when restricted Windows userInfo fails.
// Pending files belong to the host profile; sandbox USERNAME can differ.
// This CLI-only fallback changes no tokens, permissions, or authentication.
const os = require('node:os');
const path = require('node:path');
const original = os.userInfo;
os.userInfo = function (options) {
  try { return original.call(os, options); }
  catch (error) {
    if (process.platform !== 'win32' || error.info?.syscall !== 'uv_os_get_passwd') throw error;
    const username = path.basename(os.homedir());
    if (!username || /[\\/]/.test(username)) throw error;
    return { username, homedir: os.homedir(), uid: -1, gid: -1, shell: null };
  }
};
