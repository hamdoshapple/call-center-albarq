import sql from 'mssql';

export type ExternalSubscriber = {
  id: string;
  name: string;
  phone: string;
  pppoeUsername: string;
  status: 'active' | 'expired' | 'suspended' | 'disabled';
  package: string;
  speed: string;
  expiration: Date | null;
  debt: number;
  address: string;
  notes: string;
  lastActivation: Date | null;
  externalSource: 'mynet';
};

const enabled = process.env.EXTERNAL_MSSQL_ENABLED === 'true';
let poolPromise: Promise<sql.ConnectionPool> | null = null;

function cleanPhone(v?: string | null) {
  return String(v || '').replace(/\D/g, '').slice(-10);
}

function mapStatus(v?: string | null): ExternalSubscriber['status'] {
  const s = String(v || '');
  if (s.includes('معطلة') || s.includes('موقوف') || s.includes('disabled')) return 'disabled';
  if (s.includes('منته') || s.includes('expired')) return 'expired';
  if (s.includes('معلق') || s.includes('suspended')) return 'suspended';
  return 'active';
}

function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect({
      user: process.env.EXTERNAL_MSSQL_USER,
      password: process.env.EXTERNAL_MSSQL_PASSWORD,
      server: process.env.EXTERNAL_MSSQL_HOST || '192.168.0.25',
      port: Number(process.env.EXTERNAL_MSSQL_PORT || 1434),
      database: process.env.EXTERNAL_MSSQL_DATABASE || 'mynet',
      options: { encrypt: false, trustServerCertificate: true },
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
      requestTimeout: 8000,
      connectionTimeout: 8000,
    });
  }
  return poolPromise;
}

function mapRow(r: any): ExternalSubscriber {
  return {
    id: `ext-${r.cost_id}`,
    name: r.cost_name || '—',
    phone: r.cost_phone ? `0${cleanPhone(r.cost_phone)}` : '',
    pppoeUsername: r.cost_user || '',
    status: mapStatus(r.cost_state),
    package: r.cost_state || '—',
    speed: '—',
    expiration: r.cost_dateTo || null,
    debt: Number(r.debt || 0),
    address: r.cost_address || '—',
    notes: r.cost_note || '',
    lastActivation: r.cost_dateFrom || null,
    externalSource: 'mynet',
  };
}

export async function searchExternalSubscribers(q = ''): Promise<ExternalSubscriber[]> {
  if (!enabled) return [];

  const term = String(q || '').trim();
  const phone = cleanPhone(term);

  try {
    const pool = await getPool();
    const req = pool.request()
      .input('q', sql.NVarChar, `%${term}%`)
      .input('qCompact', sql.NVarChar, `%${term.replace(/\s+/g, '')}%`)
      .input('w1', sql.NVarChar, `%${term.split(/\s+/)[0] || ''}%`)
      .input('w2', sql.NVarChar, `%${term.split(/\s+/)[1] || ''}%`)
      .input('w3', sql.NVarChar, `%${term.split(/\s+/)[2] || ''}%`)
      .input('phone', sql.NVarChar, phone);

    const result = await req.query(`
      SELECT TOP 50
        c.cost_id,
        c.cost_name,
        c.cost_phone,
        c.cost_user,
        c.cost_state,
        c.cost_address,
        c.cost_note,
        c.cost_dateFrom,
        c.cost_dateTo,
        ISNULL(SUM(ISNULL(s.Sand_money,0) - ISNULL(s.Sand_moneyin,0)),0) AS debt
      FROM dbo.costumer c
      LEFT JOIN dbo.Sand s
        ON s.Sand_cosFk = c.cost_id
       AND ISNULL(s.Sand_isdel,0)=0
      WHERE ISNULL(c.cost_isdel,0)=0
        AND (
          @q = '%%'
          OR c.cost_name COLLATE Arabic_CI_AI LIKE @q
          OR REPLACE(c.cost_name,' ','') COLLATE Arabic_CI_AI LIKE @qCompact
          OR (
            c.cost_name COLLATE Arabic_CI_AI LIKE @w1
            AND (@w2 = '%%' OR c.cost_name COLLATE Arabic_CI_AI LIKE @w2)
            AND (@w3 = '%%' OR c.cost_name COLLATE Arabic_CI_AI LIKE @w3)
          )
          OR c.cost_user LIKE @q
          OR RIGHT(REPLACE(REPLACE(REPLACE(ISNULL(c.cost_phone,''),' ',''),'-',''),'+',''),10) = @phone
          OR REPLACE(REPLACE(REPLACE(ISNULL(c.cost_phone,''),' ',''),'-',''),'+','') LIKE @q
        )
      GROUP BY
        c.cost_id,c.cost_name,c.cost_phone,c.cost_user,c.cost_state,
        c.cost_address,c.cost_note,c.cost_dateFrom,c.cost_dateTo
      ORDER BY c.cost_id DESC
    `);

    return result.recordset.map(mapRow);
  } catch (err) {
    console.error('[external-subscriber] search failed:', err);
    return [];
  }
}

export async function getExternalSubscriberById(id: string): Promise<ExternalSubscriber | null> {
  if (!enabled || !id.startsWith('ext-')) return null;

  const costId = Number(id.replace('ext-', ''));
  if (!costId) return null;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, costId)
      .query(`
        SELECT TOP 1
          c.cost_id,
          c.cost_name,
          c.cost_phone,
          c.cost_user,
          c.cost_state,
          c.cost_address,
          c.cost_note,
          c.cost_dateFrom,
          c.cost_dateTo,
          ISNULL(SUM(ISNULL(s.Sand_money,0) - ISNULL(s.Sand_moneyin,0)),0) AS debt
        FROM dbo.costumer c
        LEFT JOIN dbo.Sand s
          ON s.Sand_cosFk = c.cost_id
         AND ISNULL(s.Sand_isdel,0)=0
        WHERE c.cost_id = @id
        GROUP BY
          c.cost_id,c.cost_name,c.cost_phone,c.cost_user,c.cost_state,
          c.cost_address,c.cost_note,c.cost_dateFrom,c.cost_dateTo
      `);

    return result.recordset[0] ? mapRow(result.recordset[0]) : null;
  } catch (err) {
    console.error('[external-subscriber] get failed:', err);
    return null;
  }
}
