// check-pm2-status.js — Doc "pm2 jlist" tu stdin, in ra status cua process souldiary-api.
// Tach rieng thanh file (thay vi node -e) de tranh loi escaping khi goi tu PowerShell tren Windows.
let data = '';
process.stdin.on('data', chunk => { data += chunk; });
process.stdin.on('end', () => {
  try {
    // PowerShell pipe them BOM UTF-8 (U+FEFF) o dau, JSON.parse khong chap nhan
    if (data.charCodeAt(0) === 0xFEFF) data = data.slice(1);
    const procs = JSON.parse(data);
    const api = procs.find(p => p.name === 'souldiary-api');
    console.log(api ? api.pm2_env.status : 'NOT_FOUND');
  } catch (err) {
    console.log('PARSE_ERROR: ' + err.message);
  }
});
