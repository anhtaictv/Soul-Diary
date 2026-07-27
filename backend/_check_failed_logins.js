require('dotenv').config();
const sql = require('mssql');
const config = {
  server: process.env.DB_SERVER, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: 'master',
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
};
(async () => {
  const pool = await sql.connect(config);
  // Check how many archived error logs exist
  const archives = await pool.request().query(`EXEC master.dbo.xp_enumerrorlogs`);
  console.log('--- Archived logs ---', JSON.stringify(archives.recordset));
  process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1);});
