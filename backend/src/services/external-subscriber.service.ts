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
    package: r.package_name || r.Sand_cardtype || r.cost_state || '—',
    speed: '—',
    expiration:
      r.last_expiration ||
      r.Sand_dateto ||
      r.cost_dateTo ||
      null,
    debt: Number(r.debt || 0),
    address: r.cost_address || '—',
    notes: r.cost_note || '',
    lastActivation:
      r.last_activation ||
      r.Sand_datefrom ||
      r.cost_dateFrom ||
      null,
    externalSource: 'mynet',
  };
}

export async function searchExternalSubscribers(q = ''): Promise<ExternalSubscriber[]> {
  if (!enabled) return [];

  const term = String(q || '').trim();
  const phone = cleanPhone(term);
  const compact = term.replace(/\s+/g, '');
  const words = term.split(/\s+/).filter(Boolean).slice(0, 5);

  try {
    const pool = await getPool();
    const req = pool.request()
      .input('q', sql.NVarChar, `%${term}%`)
      .input('qCompact', sql.NVarChar, `%${compact}%`)
      .input('phone', sql.NVarChar, phone);

    words.forEach((w, i) => req.input(`w${i}`, sql.NVarChar, `%${w}%`));

    const wordConds = words.length
      ? words.map((_, i) => `c.cost_name COLLATE Arabic_CI_AI LIKE @w${i}`).join(' AND ')
      : '1=1';

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
        lastSand.Sand_cardtype,
        lastSand.Sand_datefrom AS last_activation,
        lastSand.Sand_dateto AS last_expiration,
        ISNULL(SUM(ISNULL(s.Sand_money,0) - ISNULL(s.Sand_moneyin,0)),0) AS debt
      FROM dbo.costumer c

      OUTER APPLY (
          SELECT TOP 1
              Sand_cardtype,
              Sand_datefrom,
              Sand_dateto
          FROM dbo.Sand
          WHERE Sand_cosFk = c.cost_id
            AND ISNULL(Sand_isdel,0)=0
            AND Sand_dateto IS NOT NULL
          ORDER BY Sand_dateto DESC, Sand_id DESC
      ) lastSand

      LEFT JOIN dbo.Sand s
        ON s.Sand_cosFk = c.cost_id
       AND ISNULL(s.Sand_isdel,0)=0
      WHERE ISNULL(c.cost_isdel,0)=0
        AND (
          @q = '%%'
          OR c.cost_name COLLATE Arabic_CI_AI LIKE @q
          OR REPLACE(REPLACE(REPLACE(c.cost_name,' ',''), N'ـ', ''), CHAR(9), '') COLLATE Arabic_CI_AI LIKE @qCompact
          OR (${wordConds})
          OR c.cost_user LIKE @q
          OR RIGHT(REPLACE(REPLACE(REPLACE(ISNULL(c.cost_phone,''),' ',''),'-',''),'+',''),10) = @phone
          OR REPLACE(REPLACE(REPLACE(ISNULL(c.cost_phone,''),' ',''),'-',''),'+','') LIKE @q
        )
      GROUP BY
        c.cost_id,c.cost_name,c.cost_phone,c.cost_user,c.cost_state,
        c.cost_address,c.cost_note,c.cost_dateFrom,c.cost_dateTo,
        lastSand.Sand_cardtype,
        lastSand.Sand_datefrom,
        lastSand.Sand_dateto
      ORDER BY
        CASE
          WHEN c.cost_name COLLATE Arabic_CI_AI LIKE @q THEN 0
          WHEN (${wordConds}) THEN 1
          ELSE 2
        END,
        c.cost_id DESC
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

export async function listExternalSubscribersForCache(limit = 50000): Promise<ExternalSubscriber[]> {
  if (!enabled) return [];

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit)
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
        GROUP BY
          c.cost_id,c.cost_name,c.cost_phone,c.cost_user,c.cost_state,
          c.cost_address,c.cost_note,c.cost_dateFrom,c.cost_dateTo
        ORDER BY c.cost_id DESC
      `);

    return result.recordset.map(mapRow);
  } catch (err) {
    console.error('[external-subscriber] cache list failed:', err);
    return [];
  }
}


export async function listTodayExternalFinanceEvents(): Promise<any[]> {
  if (!enabled) return [];

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        c.cost_id,
        c.cost_name,
        c.cost_phone,
        c.cost_user,
        c.cost_state,
        c.cost_address,
        c.cost_note,
        c.cost_dateFrom,
        c.cost_dateTo,
        s.Sand_id,
        s.Sand_date,
        s.Sand_notes,
        s.Sand_datefrom,
        s.Sand_dateto,
        ISNULL(s.Sand_money,0) AS Sand_money,
        ISNULL(s.Sand_moneyin,0) AS Sand_moneyin,
        s.Sand_moneyType,
        s.Sand_cardtype,
        s.Sand_desc,
        s.Sand_operation,
        s.Sand_pushType,
        s.Sand_month
      FROM dbo.Sand s
      JOIN dbo.costumer c ON c.cost_id = s.Sand_cosFk
      WHERE ISNULL(s.Sand_isdel,0)=0
        AND ISNULL(c.cost_isdel,0)=0
        AND CONVERT(date, s.Sand_date) = CONVERT(date, GETDATE())
      ORDER BY s.Sand_date DESC, s.Sand_id DESC
    `);

    return result.recordset.map((r: any) => {
      const sub = mapRow(r);
      const moneyIn = Number(r.Sand_moneyin || 0);
      const moneyOut = Number(r.Sand_money || 0);
      const operation = String(r.Sand_operation || r.Sand_pushType || r.Sand_desc || '').trim();

      let type: ExternalPaymentRow['type'] = 'other';
      let amount = 0;
      let title = operation || 'حركة حساب';

      if (moneyIn > 0) {
        type = 'payment';
        amount = moneyIn;
        title = 'دفعة';
      } else if (moneyOut > 0 && r.Sand_dateto) {
        type = 'activation';
        amount = moneyOut;
        title = 'تفعيل اشتراك';
      } else if (moneyOut > 0) {
        type = 'debt';
        amount = moneyOut;
        title = 'دين / مستحقات';
      }

      return {
        ...sub,
        externalId: `ext-${r.cost_id}`,
        id: Number(r.Sand_id),
        date: r.Sand_date || null,
        amount,
        type,
        title,
        notes: String(r.Sand_notes || r.Sand_desc || r.Sand_operation || '').trim(),
        package: String(r.Sand_cardtype || sub.package || '').trim(),
        dateFrom: r.Sand_datefrom || null,
        dateTo: r.Sand_dateto || null,
        moneyIn,
        moneyOut,
      };
    });
  } catch (err) {
    console.error('[external-subscriber] today finance events failed:', err);
    return [];
  }
}


export type ExternalPaymentRow = {
  id: number;
  date: Date | null;
  amount: number;
  type: 'payment' | 'debt' | 'activation' | 'other';
  title: string;
  notes: string;
  package: string;
  dateFrom: Date | null;
  dateTo: Date | null;
  moneyIn: number;
  moneyOut: number;
};

export async function getExternalSubscriberPayments(id: string, limit = 30): Promise<ExternalPaymentRow[]> {
  if (!enabled || !id.startsWith('ext-')) return [];

  const costId = Number(id.replace('ext-', ''));
  if (!costId) return [];

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, costId)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit)
          Sand_id,
          Sand_date,
          Sand_notes,
          Sand_datefrom,
          Sand_dateto,
          ISNULL(Sand_money,0) AS Sand_money,
          ISNULL(Sand_moneyin,0) AS Sand_moneyin,
          Sand_moneyType,
          Sand_cardtype,
          Sand_desc,
          Sand_operation,
          Sand_pushType,
          Sand_month
        FROM dbo.Sand
        WHERE Sand_cosFk = @id
          AND ISNULL(Sand_isdel,0)=0
        ORDER BY Sand_date DESC, Sand_id DESC
      `);

    return result.recordset.map((r: any) => {
      const moneyIn = Number(r.Sand_moneyin || 0);
      const moneyOut = Number(r.Sand_money || 0);
      const operation = String(r.Sand_operation || r.Sand_pushType || r.Sand_desc || '').trim();

      let type: ExternalPaymentRow['type'] = 'other';
      let amount = 0;
      let title = operation || 'حركة حساب';

      if (moneyIn > 0) {
        type = 'payment';
        amount = moneyIn;
        title = 'دفعة';
      } else if (moneyOut > 0 && r.Sand_dateto) {
        type = 'activation';
        amount = moneyOut;
        title = 'تفعيل اشتراك';
      } else if (moneyOut > 0) {
        type = 'debt';
        amount = moneyOut;
        title = 'دين / مستحقات';
      }

      return {
        id: Number(r.Sand_id),
        date: r.Sand_date || null,
        amount,
        type,
        title,
        notes: String(r.Sand_notes || r.Sand_desc || r.Sand_operation || '').trim(),
        package: String(r.Sand_cardtype || '').trim(),
        dateFrom: r.Sand_datefrom || null,
        dateTo: r.Sand_dateto || null,
        moneyIn,
        moneyOut,
      };
    });
  } catch (err) {
    console.error('[external-subscriber] payments failed:', err);
    return [];
  }
}
