import sql from 'mssql';

type ExternalSubscriber = {
  id: number;
  name: string;
  phone: string;
  username: string | null;
  status: string | null;
  address: string | null;
  expiresAt: Date | null;
  debt: number;
};

const enabled = process.env.EXTERNAL_MSSQL_ENABLED === 'true';

let poolPromise: Promise<sql.ConnectionPool> | null = null;

function cleanPhone(phone?: string | null) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function pool() {
  if (!poolPromise) {
    poolPromise = sql.connect({
      user: process.env.EXTERNAL_MSSQL_USER,
      password: process.env.EXTERNAL_MSSQL_PASSWORD,
      server: process.env.EXTERNAL_MSSQL_HOST || '192.168.0.25',
      port: Number(process.env.EXTERNAL_MSSQL_PORT || 1434),
      database: process.env.EXTERNAL_MSSQL_DATABASE || 'mynet',
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
      requestTimeout: 5000,
      connectionTimeout: 5000,
    });
  }
  return poolPromise;
}

export async function findExternalSubscriberByPhone(phone?: string | null): Promise<ExternalSubscriber | null> {
  if (!enabled) return null;

  const normalized = cleanPhone(phone);
  if (!normalized) return null;

  try {
    const p = await pool();
    const result = await p.request()
      .input('phone', sql.NVarChar, normalized)
      .query(`
        SELECT TOP 1
          c.cost_id AS id,
          c.cost_name AS name,
          c.cost_phone AS phone,
          c.cost_user AS username,
          c.cost_state AS status,
          c.cost_address AS address,
          c.cost_dateTo AS expiresAt,
          ISNULL(SUM(ISNULL(s.Sand_money,0) - ISNULL(s.Sand_moneyin,0)),0) AS debt
        FROM dbo.costumer c
        LEFT JOIN dbo.Sand s
          ON s.Sand_cosFk = c.cost_id
         AND ISNULL(s.Sand_isdel,0)=0
        WHERE RIGHT(REPLACE(REPLACE(REPLACE(c.cost_phone,' ',''),'-',''),'+',''),10) = RIGHT(@phone,10)
        GROUP BY
          c.cost_id,c.cost_name,c.cost_phone,c.cost_user,c.cost_state,c.cost_address,c.cost_dateTo
      `);

    return result.recordset[0] || null;
  } catch (err) {
    console.error('[external-subscriber] lookup failed:', err);
    return null;
  }
}
