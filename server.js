const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const SECRET = process.env.SECRET;
const app = express();

app.use(express.json());
app.use(cors());

console.log("🔧 서버 시작됨");
console.log("▶ TENANT_ID:", process.env.TENANT_ID);
console.log("▶ CLIENT_ID:", process.env.CLIENT_ID);
console.log("▶ CLIENT_SECRET:", process.env.CLIENT_SECRET ? process.env.CLIENT_SECRET : "[MISSING]");
console.log("▶ RESOURCE:", process.env.RESOURCE);
console.log("▶ SECRET:", SECRET ? "[OK]" : "[MISSING]");

async function getAccessToken() {
  const url = `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append('client_id', process.env.CLIENT_ID);
  params.append('client_secret', process.env.CLIENT_SECRET);
  params.append('grant_type', 'client_credentials');
  params.append('scope', `${process.env.RESOURCE}/.default`);

  console.log("🔐 Azure AD 토큰 요청 중:", url);

  try {
    const res = await axios.post(url, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log("✅ Access Token 발급 성공");
    return res.data.access_token;
  } catch (err) {
    console.error("❌ Access Token 요청 실패:", err.response?.data || err.message);
    throw new Error('토큰 요청 실패');
  }
}

async function findUser(num, pwd, token) {
  const url = `${process.env.RESOURCE}/api/data/v9.2/cre4e_employees?$filter=cre4e_employee_number eq '${num}' and cre4e_employee_pwd eq '${pwd}'`;

  console.log("📡 Dataverse 사용자 조회 요청:", url);

  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });

    console.log("📦 사용자 조회 응답:", res.data);
    return res.data.value[0];
  } catch (err) {
    console.error("❌ 사용자 조회 실패:", err.response?.data || err.message);
    throw new Error('사용자 조회 오류');
  }
}

app.post('/login', async (req, res) => {
  console.log("🚀 /login API 호출됨");
  console.log("📨 요청 헤더:", req.headers);
  console.log("📨 요청 바디:", req.body);

  const { num, password } = req.body;

  if (!num || !password) {
    console.warn("⚠️ 로그인 정보 누락:", { num, password });
    return res.status(400).json({ error: 'num 또는 비밀번호가 누락되었습니다.' });
  }

  try {
    const accessToken = await getAccessToken();
    console.log("🔑 AccessToken 일부:", accessToken?.slice(0, 30) + "...");

    const user = await findUser(id, password, accessToken);
    console.log("👤 사용자 객체:", user);

    if (!user) {
      console.warn("⚠️ 사용자 없음: 로그인 실패");
      return res.status(401).json({ error: 'ID 또는 비밀번호가 일치하지 않습니다.' });
    }

    const jwtToken = jwt.sign(
      {
        num: user.cre4e_employee_number,
        name: user.cre4e_employee_name,
        role: user.cre4e_employee_department,
        id: user.cre4e_employee_id
      },
      SECRET,
      { expiresIn: '1h' }
    );

    console.log("✅ 로그인 성공, JWT 생성됨");

    res.json({
      token: jwtToken,
      user: {
        num: user.cre4e_employee_number,
        name: user.cre4e_employee_name,
        role: user.cre4e_employee_department,
        id: user.cre4e_employee_id
      }
    });
  } catch (err) {
    console.error("❌ 로그인 실패:", err.message);
    res.status(500).json({ error: '서버 오류 또는 인증 실패' });
  }
});

app.listen(3000, () => {
  console.log('✅ 로그인 API 서버 실행됨: http://localhost:3000/login');
});
