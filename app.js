// ===== 상태 =====
let currentUser = null;
let authToken = localStorage.getItem('authToken');
let isRegisterMode = false;

// ===== DOM 헬퍼 =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== API 헬퍼 =====
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(path, { ...options, headers });
  return res.json();
}

// ===== 페이지 전환 =====
function showPage(tab) {
  $$('.page').forEach(el => el.classList.add('hidden'));
  $(`#page-${tab}`)?.classList.remove('hidden');
  $$('.tab').forEach(btn => btn.classList.remove('active'));
  $(`.tab[data-tab="${tab}"]`)?.classList.add('active');

  // 탭별 초기화
  if (tab === 'search') loadSearchUsers();
  if (tab === 'profile') renderProfile();
}

// ===== 인증 =====
const authModal = $('#authModal');
const authForm = $('#authForm');
const authError = $('#authError');

function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;
  $('#authTitle').textContent = isRegisterMode ? '회원가입' : '로그인';
  $('#authSubmit').textContent = isRegisterMode ? '가입하기' : '로그인';
  $('#authSwitchText').textContent = isRegisterMode ? '이미 계정이 있으신가요?' : '계정이 없으신가요?';
  $('#authSwitchLink').textContent = isRegisterMode ? '로그인' : '회원가입';
  $('#registerFields').classList.toggle('hidden', !isRegisterMode);
  authError.classList.add('hidden');
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');

  const email = $('#authEmail').value;
  const password = $('#authPassword').value;

  try {
    if (isRegisterMode) {
      const displayName = $('#authName').value;
      const purposeTag = $('#authPurpose').value;
      if (!$('#authAge').checked) {
        authError.textContent = '만 15세 이상만 가입할 수 있습니다';
        authError.classList.remove('hidden');
        return;
      }
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName, purposeTag })
      });
      if (!data.ok) { authError.textContent = data.error; authError.classList.remove('hidden'); return; }
      localStorage.setItem('authToken', data.token);
      authToken = data.token;
    } else {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (!data.ok) { authError.textContent = data.error; authError.classList.remove('hidden'); return; }
      localStorage.setItem('authToken', data.token);
      authToken = data.token;
    }
    await loadCurrentUser();
  } catch (err) {
    authError.textContent = '네트워크 오류';
    authError.classList.remove('hidden');
  }
});

$('#authSwitchLink').addEventListener('click', (e) => { e.preventDefault(); toggleAuthMode(); });

async function loadCurrentUser() {
  if (!authToken) { authModal.classList.remove('hidden'); return; }
  const data = await api('/api/auth/me');
  if (!data.ok) {
    localStorage.removeItem('authToken');
    authToken = null;
    authModal.classList.remove('hidden');
    return;
  }
  currentUser = data.user;
  $('#userName').textContent = currentUser.display_name;
  $('#logoutBtn').classList.remove('hidden');
  authModal.classList.add('hidden');
  renderProfile();
}

$('#logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('authToken');
  authToken = null;
  currentUser = null;
  $('#userName').textContent = '로그인 필요';
  $('#logoutBtn').classList.add('hidden');
  authModal.classList.remove('hidden');
});

// ===== 프로필 =====
async function renderProfile() {
  if (!currentUser) return;

  const followData = await api('/api/follow/status');
  const followingCount = followData.followingCount || 0;
  const followersCount = followData.followersCount || 0;

  const visibilityLabels = { public: '전체 공개', followers: '팔로워만', private: '비공개' };

  $('#profileContent').innerHTML = `
    <div class="profile-header">
      <div class="profile-name">
        ${currentUser.display_name}
        ${currentUser.is_expert ? `<span class="badge">${currentUser.expert_type || '전문가'}</span>` : ''}
      </div>
      <div class="profile-stats">
        <span><strong>${followingCount}</strong> 팔로잉</span>
        <span><strong>${followersCount}</strong> 팔로워</span>
      </div>
    </div>

    <div class="profile-section">
      <label>소개</label>
      <textarea id="bioInput" placeholder="자기소개를 입력하세요">${currentUser.bio || ''}</textarea>
    </div>

    <div class="profile-section">
      <label>프로필 공개범위</label>
      <select id="visibilitySelect">
        <option value="public" ${currentUser.profile_visibility === 'public' ? 'selected' : ''}>전체 공개</option>
        <option value="followers" ${currentUser.profile_visibility === 'followers' ? 'selected' : ''}>팔로워만</option>
        <option value="private" ${currentUser.profile_visibility === 'private' ? 'selected' : ''}>비공개</option>
      </select>
    </div>

    <button id="saveProfileBtn" class="btn-primary">저장</button>
    <p id="profileMsg" class="msg hidden"></p>

    <hr style="margin:20px 0; border-color:var(--line);">

    <div class="profile-section">
      <label>이메일</label>
      <p>${currentUser.email}</p>
    </div>
    <div class="profile-section">
      <label>대화 목적</label>
      <p>${currentUser.purpose_tag}</p>
    </div>
  `;

  $('#saveProfileBtn').addEventListener('click', saveProfile);
}

async function saveProfile() {
  const bio = $('#bioInput').value;
  const profileVisibility = $('#visibilitySelect').value;
  const msg = $('#profileMsg');

  const data = await api('/api/profile/update', {
    method: 'POST',
    body: JSON.stringify({ bio, profileVisibility })
  });

  msg.classList.remove('hidden');
  if (data.ok) {
    msg.textContent = '저장되었습니다';
    msg.style.color = 'var(--accent)';
    currentUser.bio = bio;
    currentUser.profile_visibility = profileVisibility;
  } else {
    msg.textContent = data.error;
    msg.style.color = 'var(--danger)';
  }
  setTimeout(() => msg.classList.add('hidden'), 2000);
}

// ===== 검색 (사용자 목록) =====
async function loadSearchUsers(query = '') {
  const data = await api(`/api/users/search?q=${encodeURIComponent(query)}`);
  const container = $('#searchResults');

  if (!data.ok || !data.users?.length) {
    container.innerHTML = '<p class="muted">검색 결과가 없습니다</p>';
    return;
  }

  container.innerHTML = data.users.map(u => `
    <div class="user-card">
      <div class="user-info">
        <span class="user-name">${u.display_name}</span>
        ${u.is_expert ? `<span class="badge">${u.expert_type || '전문가'}</span>` : ''}
        <span class="user-purpose">${u.purpose_tag}</span>
      </div>
      <button class="btn-follow ${u.isFollowing ? 'following' : ''}" data-user-id="${u.id}">
        ${u.isFollowing ? '팔로잉' : '팔로우'}
      </button>
    </div>
  `).join('');

  // 팔로우 버튼 이벤트
  container.querySelectorAll('.btn-follow').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.userId;
      const data = await api('/api/follow/toggle', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: userId })
      });
      if (data.ok) {
        btn.textContent = data.action === 'followed' ? '팔로잉' : '팔로우';
        btn.classList.toggle('following', data.action === 'followed');
      }
    });
  });
}

// ===== 탭 이벤트 =====
$$('.tab').forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.tab));
});

// ===== 초기화 =====
showPage('feed');
loadCurrentUser();
