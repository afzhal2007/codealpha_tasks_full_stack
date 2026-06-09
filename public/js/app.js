let currentUser = null;
let activeComments = new Set();

const $ = (id) => document.getElementById(id);

function showSection(id) {
  document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
  if (id === 'people') loadPeople();
  if (id === 'profile') renderProfileEditor();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toast(message) {
  const box = $('toast');
  box.textContent = message;
  box.classList.add('show');
  setTimeout(() => box.classList.remove('show'), 2600);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Something went wrong');
  return data;
}

function avatarHtml(user, size = '') {
  const initial = (user?.name || user?.username || 'U').charAt(0).toUpperCase();
  if (user?.avatar) return `<div class="avatar ${size}"><img src="${escapeHtml(user.avatar)}" alt="avatar"></div>`;
  return `<div class="avatar ${size}">${initial}</div>`;
}

function escapeHtml(text = '') {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(date) {
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

async function loadMe() {
  const data = await api('/api/me');
  currentUser = data.user;
  renderAuthState();
}

function renderAuthState() {
  const authBtn = $('authNavBtn');
  const logoutBtn = $('logoutBtn');
  const userBox = $('currentUserBox');
  const composer = $('composerBox');

  if (currentUser) {
    authBtn.textContent = 'Account';
    logoutBtn.classList.remove('hidden');
    composer.classList.remove('hidden');
    userBox.innerHTML = `${avatarHtml(currentUser)}<div><b>${escapeHtml(currentUser.name)}</b><br><span>@${escapeHtml(currentUser.username)}</span></div>`;
  } else {
    authBtn.textContent = 'Login';
    logoutBtn.classList.add('hidden');
    composer.classList.add('hidden');
    userBox.textContent = 'Login to start posting.';
  }
}

function switchAuth(type) {
  const login = type === 'login';
  $('loginForm').classList.toggle('hidden', !login);
  $('registerForm').classList.toggle('hidden', login);
  $('loginTab').classList.toggle('active', login);
  $('registerTab').classList.toggle('active', !login);
}

async function loginUser(event) {
  event.preventDefault();
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('loginEmail').value, password: $('loginPassword').value })
    });
    currentUser = data.user;
    toast('Login successful');
    renderAuthState();
    showSection('home');
    loadAll();
  } catch (err) { toast(err.message); }
}

async function registerUser(event) {
  event.preventDefault();
  try {
    const data = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({
        name: $('regName').value,
        username: $('regUsername').value,
        email: $('regEmail').value,
        password: $('regPassword').value
      })
    });
    currentUser = data.user;
    toast('Account created');
    renderAuthState();
    showSection('home');
    loadAll();
  } catch (err) { toast(err.message); }
}

async function logoutUser() {
  await api('/api/logout', { method: 'POST' });
  currentUser = null;
  toast('Logged out');
  renderAuthState();
  loadAll();
}

async function loadStats() {
  const s = await api('/api/stats');
  $('statUsers').textContent = s.users;
  $('statPosts').textContent = s.posts;
  $('statLikes').textContent = s.likes;
  $('statComments').textContent = s.comments;
}

async function loadPosts() {
  const data = await api('/api/posts');
  const box = $('feedList');
  if (!data.posts.length) {
    box.innerHTML = '<div class="card">No posts yet. Create the first post!</div>';
    return;
  }
  box.innerHTML = data.posts.map(renderPost).join('');
  for (const id of activeComments) loadComments(id);
}

function renderPost(post) {
  const user = { name: post.name, username: post.username, avatar: post.avatar };
  const image = post.image_url ? `<img class="post-image" src="${escapeHtml(post.image_url)}" alt="post image">` : '';
  const canDelete = currentUser && currentUser.id === post.user_id;
  const likedClass = post.liked_by_me ? 'liked' : '';
  return `
    <article class="post-card card" id="post-${post.id}">
      <div class="post-inner">
        <div class="post-head">
          <div class="user-chip">
            ${avatarHtml(user)}
            <div>
              <a href="#" onclick="openProfile('${escapeHtml(post.username)}')">${escapeHtml(post.name)}</a><br>
              <span>@${escapeHtml(post.username)} • ${formatDate(post.created_at)}</span>
            </div>
          </div>
          ${canDelete ? `<button class="action-btn delete-btn" onclick="deletePost(${post.id})">Delete</button>` : ''}
        </div>
        <p class="post-content">${escapeHtml(post.content)}</p>
      </div>
      ${image}
      <div class="post-inner">
        <div class="post-actions">
          <button class="action-btn ${likedClass}" onclick="toggleLike(${post.id})">♥ ${post.likes_count}</button>
          <button class="action-btn" onclick="toggleComments(${post.id})">💬 ${post.comments_count} Comments</button>
        </div>
      </div>
      <div class="comments" id="comments-${post.id}"></div>
    </article>
  `;
}

async function createPost() {
  try {
    const content = $('postContent').value;
    const image_url = $('postImage').value;
    await api('/api/posts', { method: 'POST', body: JSON.stringify({ content, image_url }) });
    $('postContent').value = '';
    $('postImage').value = '';
    toast('Post published');
    loadAll();
  } catch (err) { toast(err.message); }
}

async function deletePost(id) {
  if (!confirm('Delete this post?')) return;
  try {
    await api(`/api/posts/${id}`, { method: 'DELETE' });
    activeComments.delete(id);
    toast('Post deleted');
    loadAll();
  } catch (err) { toast(err.message); }
}

async function toggleLike(id) {
  try {
    await api(`/api/posts/${id}/like`, { method: 'POST' });
    loadAll();
  } catch (err) { toast('Please login to like posts'); showSection('auth'); }
}

async function toggleComments(id) {
  const panel = $(`comments-${id}`);
  if (panel.style.display === 'block') {
    panel.style.display = 'none';
    activeComments.delete(id);
    return;
  }
  activeComments.add(id);
  panel.style.display = 'block';
  await loadComments(id);
}

async function loadComments(id) {
  const panel = $(`comments-${id}`);
  if (!panel) return;
  panel.style.display = 'block';
  const data = await api(`/api/posts/${id}/comments`);
  const rows = data.comments.map((c) => `
    <div class="comment-row">
      ${avatarHtml({ name: c.name, avatar: c.avatar })}
      <div><b>${escapeHtml(c.name)}</b><br>${escapeHtml(c.content)}</div>
    </div>
  `).join('');
  panel.innerHTML = `
    ${rows || '<p class="subtext">No comments yet.</p>'}
    <div class="comment-form">
      <input id="comment-input-${id}" placeholder="Write a comment...">
      <button class="primary" onclick="addComment(${id})">Send</button>
    </div>
  `;
}

async function addComment(id) {
  try {
    const input = $(`comment-input-${id}`);
    await api(`/api/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ content: input.value }) });
    input.value = '';
    toast('Comment added');
    await loadPosts();
    await loadStats();
  } catch (err) { toast('Please login to comment'); showSection('auth'); }
}

async function loadPeople() {
  const data = await api('/api/users');
  $('peopleList').innerHTML = data.users.map((u) => `
    <div class="person-card card">
      <div class="person-top">
        ${avatarHtml(u)}
        <div>
          <h3>${escapeHtml(u.name)}</h3>
          <p>@${escapeHtml(u.username)}</p>
        </div>
      </div>
      <p>${escapeHtml(u.bio || '')}</p>
      <div class="person-stats">
        <span>${u.followers_count} followers</span>
        <span>${u.following_count} following</span>
      </div>
      <button class="secondary" onclick="openProfile('${escapeHtml(u.username)}')">View Profile</button>
      ${currentUser && currentUser.id !== u.id ? `<button class="primary" onclick="toggleFollow(${u.id})">${u.followed_by_me ? 'Unfollow' : 'Follow'}</button>` : ''}
    </div>
  `).join('');
}

async function toggleFollow(id) {
  try {
    await api(`/api/users/${id}/follow`, { method: 'POST' });
    toast('Follow updated');
    loadPeople();
  } catch (err) { toast('Please login to follow'); showSection('auth'); }
}

async function openProfile(username) {
  showSection('people');
  const data = await api(`/api/users/${username}`);
  const u = data.user;
  $('peopleList').innerHTML = `
    <div class="person-card card" style="grid-column: 1 / -1;">
      <div class="person-top">
        ${avatarHtml(u)}
        <div>
          <h3>${escapeHtml(u.name)}</h3>
          <p>@${escapeHtml(u.username)}</p>
        </div>
      </div>
      <p>${escapeHtml(u.bio || '')}</p>
      <div class="person-stats"><span>${u.followers_count} followers</span><span>${u.following_count} following</span></div>
      <button class="secondary" onclick="loadPeople()">Back to People</button>
    </div>
    ${data.posts.map(renderPost).join('') || '<div class="card">No posts from this user.</div>'}
  `;
}

function renderProfileEditor() {
  if (!currentUser) {
    $('profilePreview').innerHTML = '<h3>Login Required</h3><p class="subtext">Please login to edit your profile.</p><button class="primary" onclick="showSection(\'auth\')">Login Now</button>';
    return;
  }
  $('profileName').value = currentUser.name || '';
  $('profileBio').value = currentUser.bio || '';
  $('profileAvatar').value = currentUser.avatar || '';
  renderProfilePreview();
}

function renderProfilePreview() {
  if (!currentUser) return;
  $('profilePreview').innerHTML = `
    ${avatarHtml(currentUser)}
    <h2>${escapeHtml(currentUser.name)}</h2>
    <p>@${escapeHtml(currentUser.username)}</p>
    <p class="subtext">${escapeHtml(currentUser.bio || '')}</p>
  `;
}

async function updateProfile() {
  if (!currentUser) return toast('Login required');
  try {
    const data = await api('/api/me', {
      method: 'PUT',
      body: JSON.stringify({
        name: $('profileName').value,
        bio: $('profileBio').value,
        avatar: $('profileAvatar').value
      })
    });
    currentUser = data.user;
    toast('Profile saved');
    renderAuthState();
    renderProfileEditor();
  } catch (err) { toast(err.message); }
}

async function loadAll() {
  await loadMe();
  await loadStats();
  await loadPosts();
}

document.addEventListener('DOMContentLoaded', loadAll);
