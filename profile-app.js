/***************************
  profile-app.js
  - Connects profile.html to Firebase
  - Real-time user profile, posts, friends, friend requests
  - Avatar & cover upload (Cropper.js)
  - Theme persistence
  - Basic AI hooks (server-side required)
****************************/

/* ---------- CONFIG: Replace with your Firebase config ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
  authDomain: "uniconnect-ee95c.firebaseapp.com",
  projectId: "uniconnect-ee95c",
  storageBucket: "uniconnect-ee95c.firebasestorage.app",
  messagingSenderId: "1003264444309",
  appId: "1:1003264444309:web:9f0307516e44d21e97d89c"
};
/* -------------------------------------------------------------- */

/* Initialize Firebase */
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const messaging = firebase.messaging();

/* DOM */
const connectionStatus = document.getElementById('connectionStatus');
const connectionText = document.getElementById('connectionText');
const loadingSpinner = document.getElementById('loadingSpinner');

const profileNameEl = document.getElementById('profileName');
const profileUsernameEl = document.getElementById('profileUsername');
const profileLocationEl = document.getElementById('profileLocation');
const profileBioEl = document.getElementById('profileBio');
const profileAvatarImg = document.getElementById('profileAvatarImg');
const avatarInitials = document.getElementById('avatarInitials');

const postsCountEl = document.getElementById('postsCount');
const followersCountEl = document.getElementById('followersCount');
const followingCountEl = document.getElementById('followingCount');

const editProfileBtn = document.getElementById('editProfileBtn');
const editProfileModal = document.getElementById('editProfileModal');
const cancelEdit = document.getElementById('cancelEdit');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const editDisplayName = document.getElementById('editDisplayName');
const editUsername = document.getElementById('editUsername');
const editBio = document.getElementById('editBio');
const editLocation = document.getElementById('editLocation');

const avatarInput = document.getElementById('avatarInput');
const editAvatarBtn = document.getElementById('editAvatarBtn');
const profileAvatarEl = document.getElementById('profileAvatar');
const profileAvatarImgEl = document.getElementById('profileAvatarImg');

const coverInput = document.getElementById('coverInput');
const editCoverBtn = document.getElementById('editCoverBtn');
const profileCoverEl = document.getElementById('profileCover');

const cropperModal = document.getElementById('cropperModal');
const cropperImage = document.getElementById('cropperImage');
const closeCropper = document.getElementById('closeCropper');
const applyCropBtn = document.getElementById('applyCrop');
const cancelCropBtn = document.getElementById('cancelCrop');

const postsContainer = document.getElementById('postsContainer');
const friendsContainer = document.getElementById('friendsContainer');
const friendRequestsContainer = document.getElementById('friendRequestsContainer');
const mediaGrid = document.getElementById('mediaGrid');

const logoutBtn = document.getElementById('logoutBtn');
const themeToggle = document.getElementById('themeToggle');
const connectionSpinnerTimeout = 4000;

let currentUser = null;
let userDocUnsubscribe = null;
let postsUnsubscribe = null;
let friendRequestsUnsubscribe = null;
let cropper = null;
let cropTarget = null; // 'avatar' | 'cover'
let latestImageBlob = null;

/* Utility helpers */
function showConnection(state, text){
  connectionStatus.className = 'connection-status ' + (state || '');
  connectionText.textContent = text || '';
}
function showLoading(show){ loadingSpinner.style.display = show ? 'block' : 'none'; }
function uid(){ return currentUser ? currentUser.uid : null; }
function safeText(s){ return (s || '').toString(); }
function initialsFromName(name){
  if(!name) return '';
  let parts = name.trim().split(' ');
  return (parts[0][0] || '') + (parts[1] ? parts[1][0] : '');
}

/* -------- Presence (basic) --------
   Writes a simple presence field in users/{uid}/presence with lastSeen timestamp.
   For robust presence use Realtime DB / onDisconnect in production.
------------------------------------*/
async function setPresence(status='online'){
  if(!currentUser) return;
  const ref = db.collection('users').doc(currentUser.uid);
  try{
    await ref.set({ presence: { status, lastSeen: firebase.firestore.FieldValue.serverTimestamp() } }, { merge: true });
  }catch(e){
    console.warn('presence update failed', e);
  }
}

/* -------- Auth & initialization -------- */
auth.onAuthStateChanged(async user => {
  if(!user){
    // Not logged in - redirect to login or show placeholder
    console.log('No user signed in — redirecting to login');
    // window.location.href = '/login.html'; // uncomment if you have a login page
    showConnection('error', 'Not signed in');
    return;
  }
  currentUser = user;
  showConnection('connecting', 'Loading profile...');
  showLoading(true);

  // Initialize token for push (optional) - requires server key & permission
  try{
    // messaging.getToken() etc. - omitted here, set up on your server
  }catch(e){ /* ignore for now */ }

  // Attach real-time profile listener
  attachUserProfileListener(user.uid);
  attachPostsListener(user.uid);
  attachFriendRequestsListener(user.uid);
  await setPresence('online');
  showLoading(false);
  showConnection('connected', 'Connected');
});

/* Logout */
logoutBtn?.addEventListener('click', async ()=>{
  try{
    await setPresence('offline');
    await auth.signOut();
    // window.location.href = '/'; // optional redirect
  }catch(e){ console.error(e); }
});

/* -------- Profile listeners & DOM updates -------- */
function attachUserProfileListener(uid){
  if(userDocUnsubscribe) userDocUnsubscribe();

  const userRef = db.collection('users').doc(uid);
  userDocUnsubscribe = userRef.onSnapshot(doc=>{
    if(!doc.exists) return;
    const data = doc.data();
    profileNameEl.textContent = data.displayName || data.name || 'Unnamed';
    profileUsernameEl.textContent = data.username ? ('@' + data.username) : '@' + (data.email || '').split('@')[0];
    profileLocationEl.textContent = data.location || 'Location not set';
    profileBioEl.textContent = data.bio || '';
    postsCountEl.textContent = data.postsCount || 0;
    followersCountEl.textContent = data.followersCount || 0;
    followingCountEl.textContent = data.followingCount || 0;

    // Avatar
    if(data.photoURL){
      profileAvatarImg.src = data.photoURL;
      profileAvatarImg.style.display = 'block';
      avatarInitials.style.display = 'none';
    } else {
      profileAvatarImg.style.display = 'none';
      avatarInitials.style.display = 'block';
      avatarInitials.textContent = initialsFromName(data.displayName || data.name || currentUser.email);
    }

    // Cover
    if(data.coverURL){
      profileCoverEl.style.backgroundImage = `url(${data.coverURL})`;
      profileCoverEl.style.backgroundSize = 'cover';
      profileCoverEl.style.backgroundPosition = 'center';
    }

    // Theme (persisted)
    if(data.theme) document.documentElement.setAttribute('data-theme', data.theme);
  }, err=>{
    console.error('user snapshot error', err);
  });
}

/* -------- Posts (user's posts) -------- */
function attachPostsListener(uid){
  if(postsUnsubscribe) postsUnsubscribe();

  postsUnsubscribe = db.collection('posts')
    .where('authorId','==', uid)
    .orderBy('createdAt','desc')
    .onSnapshot(snapshot=>{
      postsContainer.innerHTML = '';
      snapshot.forEach(doc=>{
        const p = doc.data();
        postsContainer.appendChild(renderPostCard(doc.id, p));
      });
      if(snapshot.empty){
        postsContainer.innerHTML = `<div class="text-gray-400">No posts yet.</div>`;
      }
    }, err=>{
      console.error('posts listener err', err);
    });
}

function renderPostCard(id, p){
  const wrap = document.createElement('div');
  wrap.className = 'p-3 bg-white/3 rounded';

  const title = document.createElement('div');
  title.innerHTML = `<strong>${escapeHtml(p.title || 'Untitled')}</strong>`;
  const body = document.createElement('div');
  body.className = 'mt-2 text-gray-200';
  body.textContent = p.text || '';

  wrap.appendChild(title);
  wrap.appendChild(body);

  if(p.media && p.media.length){
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-3 gap-2 mt-3';
    p.media.forEach(url=>{
      const img = document.createElement('img');
      img.src = url;
      img.style.width='100%';
      img.style.borderRadius='8px';
      img.style.objectFit='cover';
      grid.appendChild(img);
    });
    wrap.appendChild(grid);
  }

  return wrap;
}

/* -------- Friend requests & friends -------- */
function attachFriendRequestsListener(uid){
  if(friendRequestsUnsubscribe) friendRequestsUnsubscribe();

  const reqsRef = db.collection('friendRequests')
    .where('to','==', uid)
    .orderBy('createdAt','desc');

  friendRequestsUnsubscribe = reqsRef.onSnapshot(snapshot => {
    friendRequestsContainer.innerHTML = '';
    snapshot.forEach(doc=>{
      const r = doc.data();
      const el = renderFriendRequest(doc.id, r);
      friendRequestsContainer.appendChild(el);
    });
    if(snapshot.empty) friendRequestsContainer.innerHTML = `<div class="text-gray-400">No friend requests</div>`;
  }, err=>console.error(err));

  // friends list
  db.collection('friendships').where('members','array-contains', uid).onSnapshot(snapshot=>{
    friendsContainer.innerHTML = '';
    snapshot.forEach(doc=>{
      const f = doc.data();
      // show the other member
      const other = f.members.find(m => m !== uid);
      if(!other) return;
      db.collection('users').doc(other).get().then(userdoc=>{
        const user = userdoc.data();
        const el = document.createElement('div');
        el.className='p-2 rounded border mb-2 flex items-center gap-3';
        el.innerHTML = `<div style="width:44px;height:44px;border-radius:50%;background:url(${user.photoURL || ''}) center/cover"></div>
          <div><strong>${user.displayName||user.name}</strong><div class="text-sm text-gray-300">${user.username?('@'+user.username):''}</div></div>`;
        friendsContainer.appendChild(el);
      });
    });
    if(snapshot.empty) friendsContainer.innerHTML = `<div class="text-gray-400">You have no friends yet.</div>`;
  });
}

function renderFriendRequest(id, r){
  const row = document.createElement('div');
  row.className = 'p-2 border rounded mb-2 flex items-center justify-between';
  const left = document.createElement('div');
  left.innerHTML = `<div><strong>${escapeHtml(r.fromName || 'Someone')}</strong><div class="text-sm text-gray-300">${r.message || ''}</div></div>`;
  const right = document.createElement('div');
  const acceptBtn = document.createElement('button');
  acceptBtn.textContent = 'Accept';
  acceptBtn.className = 'px-3 py-1 bg-indigo-600 text-white rounded mr-2';
  acceptBtn.onclick = ()=>acceptFriendRequest(id, r);
  const rejectBtn = document.createElement('button');
  rejectBtn.textContent = 'Reject';
  rejectBtn.className = 'px-3 py-1 border rounded';
  rejectBtn.onclick = ()=>rejectFriendRequest(id, r);
  right.appendChild(acceptBtn);
  right.appendChild(rejectBtn);

  row.appendChild(left);
  row.appendChild(right);
  return row;
}

async function acceptFriendRequest(docId, r){
  try{
    const me = uid();
    // create friendship document
    await db.collection('friendships').add({
      members: [r.from, r.to],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // remove request
    await db.collection('friendRequests').doc(docId).delete();
    // increment follower/following counters
    const fromRef = db.collection('users').doc(r.from);
    const toRef = db.collection('users').doc(r.to);
    await fromRef.update({ followersCount: firebase.firestore.FieldValue.increment(1) });
    await toRef.update({ followingCount: firebase.firestore.FieldValue.increment(1) });
  }catch(e){ console.error('accept request', e); }
}

async function rejectFriendRequest(docId, r){
  try{
    await db.collection('friendRequests').doc(docId).delete();
  }catch(e){ console.error('reject request', e); }
}

/* -------- Edit profile modal handlers -------- */
editProfileBtn?.addEventListener('click', async ()=>{
  // populate fields with current user doc
  const doc = await db.collection('users').doc(uid()).get();
  const d = doc.exists ? doc.data() : {};
  editDisplayName.value = d.displayName || d.name || '';
  editUsername.value = d.username || '';
  editBio.value = d.bio || '';
  editLocation.value = d.location || '';
  editProfileModal.classList.remove('hidden');
});
cancelEdit?.addEventListener('click', ()=> editProfileModal.classList.add('hidden'));

saveProfileBtn?.addEventListener('click', async ()=>{
  const toSave = {
    displayName: safeText(editDisplayName.value),
    username: safeText(editUsername.value),
    bio: safeText(editBio.value),
    location: safeText(editLocation.value),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  // basic validation: ensure username uniqueness (simple)
  if(toSave.username){
    const q = await db.collection('users').where('username','==', toSave.username).get();
    const conflict = q.docs.some(d=>d.id !== uid());
    if(conflict){ alert('Username already taken'); return; }
  }
  try{
    await db.collection('users').doc(uid()).set(toSave, { merge: true });
    editProfileModal.classList.add('hidden');
  }catch(e){ console.error(e); alert('Failed to save profile'); }
});

/* -------- Avatar & Cover upload with Cropper.js -------- */
editAvatarBtn?.addEventListener('click', ()=> avatarInput.click());
editCoverBtn?.addEventListener('click', ()=> coverInput.click());

avatarInput?.addEventListener('change', (e)=> handleImageSelect(e, 'avatar'));
coverInput?.addEventListener('change', (e)=> handleImageSelect(e, 'cover'));

function handleImageSelect(e, target){
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  if(file.size > 6 * 1024 * 1024){ alert('Image too large (max 6MB)'); return; }
  const reader = new FileReader();
  reader.onload = ()=> {
    cropperImage.src = reader.result;
    cropTarget = target;
    openCropper();
  };
  reader.readAsDataURL(file);
  e.target.value = ''; // reset
}

function openCropper(){
  cropperModal.classList.remove('hidden');
  if(cropper) cropper.destroy();
  cropper = new Cropper(cropperImage, {
    aspectRatio: cropTarget === 'avatar' ? 1 : 16/6,
    viewMode: 1,
    autoCropArea: 0.9
  });
}

closeCropper?.addEventListener('click', ()=> closeCropperModal());
cancelCropBtn?.addEventListener('click', ()=> closeCropperModal());

applyCropBtn?.addEventListener('click', async ()=>{
  if(!cropper) return;
  showLoading(true);
  const canvas = cropper.getCroppedCanvas({
    width: cropTarget === 'avatar' ? 600 : 1600,
    height: cropTarget === 'avatar' ? 600 : 600,
    imageSmoothingQuality: 'high'
  });
  canvas.toBlob(async blob=>{
    try{
      const storagePath = `users/${uid()}/${cropTarget}-${Date.now()}.jpg`;
      const ref = storage.ref().child(storagePath);
      await ref.put(blob);
      const url = await ref.getDownloadURL();
      const update = {};
      if(cropTarget === 'avatar') update.photoURL = url;
      else update.coverURL = url;
      await db.collection('users').doc(uid()).set(update, { merge: true });
    }catch(e){
      console.error('upload err', e);
      alert('Upload failed');
    }finally{
      showLoading(false);
      closeCropperModal();
    }
  }, 'image/jpeg', 0.85);
});

function closeCropperModal(){
  cropperModal.classList.add('hidden');
  if(cropper){ cropper.destroy(); cropper = null; }
  cropperImage.src = '';
  cropTarget = null;
}

/* -------- Theme toggle (persist to user doc) -------- */
themeToggle?.addEventListener('click', async ()=>{
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  // save to user document
  if(uid()){
    await db.collection('users').doc(uid()).set({ theme: next }, { merge: true });
  } else {
    localStorage.setItem('kynecta_theme', next);
  }
});

/* On load, apply saved theme (fallback to localStorage) */
(async function applySavedTheme(){
  const theme = (await (async ()=>{
    try{
      if(auth.currentUser) {
        const doc = await db.collection('users').doc(auth.currentUser.uid).get();
        if(doc.exists) return doc.data().theme;
      }
      return localStorage.getItem('kynecta_theme');
    }catch(e){ return localStorage.getItem('kynecta_theme'); }
  })()) || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
})();

/* -------- Basic helper: escapeHtml -------- */
function escapeHtml(s){ return String(s).replace(/[&<>"'`=\/]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[c]; }); }

/* -------- Simple media loading for 'Media' tab -------- */
db.collection('posts').where('authorId','==', (auth.currentUser && auth.currentUser.uid) || null).orderBy('createdAt','desc').limit(20).get()
  .then(snap=>{
    mediaGrid.innerHTML = '';
    snap.forEach(doc=>{
      const d = doc.data();
      (d.media || []).forEach(url=>{
        const div = document.createElement('div');
        div.className = 'media-item';
        div.style.backgroundImage = `url(${url})`;
        div.style.height = '100px';
        mediaGrid.appendChild(div);
      });
    });
    if(mediaGrid.children.length === 0) mediaGrid.innerHTML = `<div class="text-gray-400">No media yet</div>`;
  })
  .catch(err=> console.warn(err));

/* -------- Presence cleanup on unload -------- */
window.addEventListener('beforeunload', ()=> {
  if(currentUser) setPresence('offline');
});

/* -------- AI helper (server-side required) ----------
   Example: call your server endpoint that proxies OpenAI calls securely.
   DO NOT put OpenAI keys in client JS.
-----------------------------------------------------*/
async function generateBioDraft() {
  // Example payload. Implement server endpoint at /api/generate-bio (or similar).
  try{
    const resp = await fetch('/api/generate-bio', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ userId: uid(), prompt: 'Write a short friendly profile bio for this user based on their interests' })
    });
    const data = await resp.json();
    return data.text; // server should return { text: '...' }
  }catch(e){
    console.warn('AI bio error', e);
    return null;
  }
}

/* ---------- Small helper: when page loads try to pre-fill if already signed in ---------- */
(async function tryPrefillIfSignedIn(){
  showLoading(true);
  // If user already signed in, onAuthStateChanged will run; wait briefly
  await new Promise(r=>setTimeout(r, 800));
  showLoading(false);
})();

/* -------- Small security note --------
   - Set Firestore Security Rules to restrict writes to user's doc
   - Use server-side endpoints for payments and OpenAI
--------------------------------------------------*/
