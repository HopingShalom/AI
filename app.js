// ===== 상태 =====
let currentUser = null;
let authToken = localStorage.getItem('authToken');
let isRegisterMode = false;

// ===== DOM =====
const $ = (sel) => document.querySelector(sel);
const authModal = $('#authModal');
const authForm = $('#authForm');
const authTitle = $('#authTitle');
const authSubmit = $('#authSubmit');
const authSwitchText = $('#authSwitchText');
const authSwitchLink = $('#authSwitchLink');
const registerFields = $('#registerFields');
const authError = $('#authError');
const userName = $('#userName');
const logoutBtn = $('#logoutBtn');

// ===== 페이지 전환 =====
function showPage(tab) {
  document.querySelectorAll('.page').forEach(el => el.classList.add('hidden'));
  $(`#page-${tab}`)?.classList.remove('hidden');
  document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
  $(`.tab[data-tab="${tab}"]`)?.classList.add('active');
}

// ===== 인증 모드 전환 =====
function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;
  if (isRegisterMode) {
    authTitle.textContent = '회원가입';
    authSubmit.textContent = '가입하기';
    authSwitchText.textContent = '이미 계정이 있으신가요?';
    authSwitchLink.textContent = '로그인';
    registerFields.classList.remove('hidden');
  } else {
    authTitle.textContent = '로그인';
    authSubmit.textContent = '로그인';
    authSwitchText.textContent = '계정이 없으신가요?';
    authSwitchLink.textContent = '회원가입';
    registerFields.classList.add('hidden');
  }
  authError.classList.add('hidden');
}

// ===== 로그인/회원가입 처리 =====
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');

  const email = $('#authEmail').value;
  const password = $('#authPassword').value;

  try {
    if (isRegisterMode) {
      const displayName = $('#authName').value;
      const purposeTag = $('#authPurpose').value;
      const ageCheck = $('#authAge').checked;

      if (!ageCheck) {
        authError.textContent = '만 15세 이상만 가입할 수 있습니다';
        authError.classList.remove('hidden');
        return;
      }
      if (!displayName || !purposeTag) {
        authError.textContent = '모든 필드를 입력해주세요';
        authError.classList.remove('hidden');
        return;
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName, purposeTag })
      });
      const data = await res.json();

      if (!data.ok) {
        authError.textContent = data.error;
        authError.classList.remove('hidden');
        return;
      }

      localStorage.setItem('authToken', data.token);
      authToken = data.token;
      await loadCurrentUser();
    } else {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (!data.ok) {
        authError.textContent = data.error;
        authError.classList.remove('hidden');
        return;
      }

      localStorage.setItem('authToken', data.token);
      authToken = data.token;
      await loadCurrentUser();
    }
  } catch (err) {
    authError.textContent = '네트워크 오류가 발생했습니다';
    authError.classList.remove('hidden');
  }
});

authSwitchLink.addEventListener('click', (e) => {
  e.preventDefault();
  toggleAuthMode();
});

// ===== 현재 사용자 로드 =====
async function loadCurrentUser() {
  if (!authToken) {
    authModal.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();

    if (!data.ok) {
      localStorage.removeItem('authToken');
      authToken = null;
      authModal.classList.remove('hidden');
      return;
    }

    currentUser = data.user;
    userName.textContent = currentUser.display_name;
    logoutBtn.classList.remove('hidden');
    authModal.classList.add('hidden');
    renderProfile();
  } catch (err) {
    authModal.classList.remove('hidden');
  }
}

// ===== 로그아웃 =====
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('authToken');
  authToken = null;
  currentUser = null;
  userName.textContent = '로그인 필요';
  logoutBtn.classList.add('hidden');
  authModal.classList.remove('hidden');
});

// ===== 프로필 렌더링 =====
function renderProfile() {
  if (!currentUser) return;
  const visibility = { public: '전체 공개', followers: '팔로워만', private: '비공개' };
  $('#profileContent').innerHTML = `
    <div style="margin-bottom:16px;">
      <strong>이름:</strong> ${currentUser.display_name}
      ${currentUser.is_expert ? `<span style="color:var(--accent);"> ✓ ${currentUser.expert_type || '전문가'}</span>` : ''}
    </div>
    <div style="margin-bottom:16px;"><strong>이메일:</strong> ${currentUser.email}</div>
    <div style="margin-bottom:16px;"><strong>대화 목적:</strong> ${currentUser.purpose_tag}</div>
    <div style="margin-bottom:16px;"><strong>프로필 공개:</strong> ${visibility[currentUser.profile_visibility]}</div>
    <div style="margin-bottom:16px;"><strong>소개:</strong> ${currentUser.bio || '(없음)'}</div>
  `;
}

// ===== 탭 이벤트 =====
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.tab));
});

// ===== 초기화 =====
showPage('feed');
loadCurrentUser();
