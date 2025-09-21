const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.SECRET;

// ===== 미들웨어 =====
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// 부팅 로그
console.log('🔧 서버 시작');
console.log('▶ TENANT_ID:', process.env.TENANT_ID || '[MISSING]');
console.log('▶ CLIENT_ID:', process.env.CLIENT_ID || '[MISSING]');
console.log('▶ CLIENT_SECRET:', process.env.CLIENT_SECRET ? '[OK]' : '[MISSING]');
console.log('▶ RESOURCE:', process.env.RESOURCE || '[MISSING]');
console.log('▶ SECRET:', SECRET ? '[OK]' : '[MISSING]');

// ===== 공통 유틸 =====
function escODataString(s) {
  // OData 문자열 이스케이프: 작은따옴표 2개로
  return String(s).replace(/'/g, "''");
}

async function getAccessToken() {
  const url = `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append('client_id', process.env.CLIENT_ID);
  params.append('client_secret', process.env.CLIENT_SECRET);
  params.append('grant_type', 'client_credentials');
  params.append('scope', `${process.env.RESOURCE}/.default`);

  console.log('🔐 Azure AD 토큰 요청…');

  const res = await axios.post(url, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  console.log('✅ Access Token OK');
  return res.data.access_token;
}

/**
 * Dataverse 사용자 조회
 * @param {string|number} num - 사번/ID
 * @param {string} pwd - 비밀번호(해시/문자열)
 * @param {string} token - AAD 액세스 토큰
 * @returns {Promise<object|undefined>}
 */
async function findUser(num, pwd, token) {
  const baseUrl = `${process.env.RESOURCE}/api/data/v9.2/cre4e_employees`;
  const n = Number(num);
  const isInt = Number.isInteger(n);

  const left = isInt
    ? `cre4e_employee_number eq ${n}`
    : `cre4e_employee_number eq '${escODataString(num)}'`;
  const right = `cre4e_employee_pwd eq '${escODataString(pwd)}'`;
  const filter = `${left} and ${right}`;

  console.log('📡 Dataverse 조회 필터:', filter);

  const res = await axios.get(baseUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    params: {
      $select:
        'cre4e_employee_number,cre4e_employee_name,cre4e_employee_department,cre4e_employeEid,cre4e_employeeid',
      $filter: filter,
      $top: 1
    }
  });

  // 일부 환경에서 logical name 대소문자/표기 혼동 방지를 위해 id 후보 2개 모두 select
  const user = res.data?.value?.[0];
  console.log('📦 사용자 조회 응답(첫건):', user ? 'FOUND' : 'EMPTY');
  return user;
}

// ===== 라우트 =====
app.get('/health', (_, res) => res.json({ ok: true }));

app.post('/login', async (req, res) => {
  console.log('🚀 /login');
  const { num, password } = req.body || {};

  if (!num || !password) {
    return res
      .status(400)
      .json({ error: 'num 또는 비밀번호가 누락되었습니다.' });
  }

  try {
    const accessToken = await getAccessToken();
    const user = await findUser(num, password, accessToken);

    if (!user) {
      return res
        .status(401)
        .json({ error: 'ID 또는 비밀번호가 일치하지 않습니다.' });
    }

    // Dataverse id 필드명 보정 (환경에 따라 cre4e_employeeid 또는 cre4e_employeEid)
    const dvId =
      user.cre4e_employeeid ||
      user.cre4e_employeEid ||
      user.cre4e_employee_id; // 혹시 기존 코드 호환

    const payload = {
      num: user.cre4e_employee_number,
      name: user.cre4e_employee_name,
      role: user.cre4e_employee_department,
      id: dvId
    };

    const token = jwt.sign(payload, SECRET, { expiresIn: '1h' });

    return res.json({
      token,
      user: payload
    });
  } catch (err) {
    console.error('❌ 로그인 실패:', err.response?.data || err.message);
    return res
      .status(500)
      .json({ error: '서버 오류 또는 인증 실패' });
  }
});

// ===== 서버 시작 =====
app.listen(PORT, () => {
  console.log(`✅ 서버 실행: http://localhost:${PORT}`);
  console.log(`   POST /login`);
});
