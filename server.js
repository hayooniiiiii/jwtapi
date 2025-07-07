// 필요한 라이브러리 로드
const express = require('express');             // Node.js 웹서버 프레임워크
const axios = require('axios');                 // HTTP 요청용 라이브러리
const jwt = require('jsonwebtoken');            // JWT 토큰 생성/검증용
const cors = require('cors');                   // CORS 정책을 허용

//.env 파일에 정의된 환경변수 불러오기
require('dotenv').config();

// JWT 토큰 생성 시 사용할 비밀 키 (.env에서 가져옴)
const SECRET = process.env.SECRET;

// Express 서버 객체 생성
const app = express();
app.use(cors()); // 모든 도메인에서 API 요청 가능 (PowerApps 등 외부 앱 허용)
app.use(express.json()); // JSON 형식의 요청 body 자동 파싱


// Azure AD에서 Dataverse 인증 토큰 얻기
async function getAccessToken() {
  const url = `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`;

  // URL-encoded 형식으로 보낼 요청 파라미터 구성
  const params = new URLSearchParams();
  params.append('client_id', process.env.CLIENT_ID);
  params.append('client_secret', process.env.CLIENT_SECRET);
  params.append('grant_type', 'client_credentials');
  params.append('scope', `${process.env.RESOURCE}/.default`);

  try {
    const res = await axios.post(url, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    return res.data.access_token; // Access Token 반환
  } catch (err) {
    console.error("Access Token 요청 실패", err.response?.data || err.message);
    throw new Error('토큰 요청 실패');
  }
}


//  Dataverse에서 사용자 조회 함수
async function findUser(id, pwd, token) {
  // 'employees' 테이블에서 id(사번), pwd(비밀번호) 일치하는 사용자 찾기
  const url = `${process.env.RESOURCE}/api/data/v9.2/cre3b_employees?$filter=cre3b_employee_number eq '${id}' and cre3b_employee_pwd eq '${pwd}'`;


  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });

    return res.data.value[0]; // 일치하는 사용자 반환 (없으면 undefined)
  } catch (err) {
    console.error("사용자 조회 실패", err.response?.data || err.message);
    throw new Error('사용자 조회 오류');
  }
}

// 로그인 API 엔드포인트 (PowerApps에서 호출)

app.post('/login', async (req, res) => {
  console.log("req.body 👉", req.body);
  const { id, password } = req.body; // PowerApps에서 전달된 사번(id), 비밀번호(password)

  try {
    const accessToken = await getAccessToken();           //  Azure AD로부터 인증 토큰 발급
    const user = await findUser(id, password, accessToken); //  Dataverse에서 사용자 확인

    if (!user) {
      return res.status(401).json({ error: 'ID 또는 비밀번호가 일치하지 않습니다.' });
    }

    // JWT 토큰 생성 (1시간 유효)
    const jwtToken = jwt.sign(
      {
        id: user.cre3b_employee_number,
        name: user.cre3b_employee_name,
        role: user.cre3b_employee_department
      },
      SECRET,
      { expiresIn: '1h' }
    );

    //  로그인 성공 응답
    res.json({
      token: jwtToken,
      user: {
        id: user.cre3b_employee_number,
        name: user.cre3b_employee_name,
        role: user.cre3b_employee_department
      }
    });
  } catch (err) {
    console.error("로그인 실패", err.message);
    res.status(500).json({ error: '서버 오류 또는 인증 실패' });
  }
});


// 서버 실행

app.listen(3000, () => {
  console.log('로그인 API 서버 실행됨: http://localhost:3000/login');
});
