(() => {
  'use strict';

  const state = {
    active: false,
    callId: null,
    chatId: null,
    type: 'audio',
    room: null,
    localStream: null,
    peers: new Map(),
    cursor: 0,
    pollTimer: null,
    currentUserId: '',
    root: null,
    grid: null,
    status: null,
  };

  const apiBase = () => {
    const b = typeof window.__getApiBase === 'function' ? window.__getApiBase() : (window.API_BASE_URL || '');
    return String(b).replace(/\/$/, '') + '/group-calls';
  };
  const token = () => localStorage.getItem('authToken') || localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
  const userId = () => String(window.__GROUP_CALL_USER_ID || localStorage.getItem('userId') || '');

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    const r = await fetch(apiBase() + path, { ...options, headers });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || `Group call request failed (${r.status})`);
    return d;
  }

  function ensureUi() {
    if (state.root) return;
    const style = document.createElement('style');
    style.textContent = `
      #groupCallOverlay{position:fixed;inset:0;z-index:9999;background:#05070b;color:#fff;display:flex;flex-direction:column}
      #groupCallOverlay.gc-hidden{display:none!important}
      .gc-head{height:58px;display:flex;align-items:center;gap:12px;padding:8px 14px;background:#111827;border-bottom:1px solid #263244}
      .gc-title{font-weight:800;flex:1}.gc-status{font-size:11px;opacity:.75}.gc-grid{flex:1;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;padding:10px;overflow:auto}
      .gc-tile{position:relative;min-height:180px;background:#111827;border:1px solid #263244;border-radius:14px;overflow:hidden;display:grid;place-items:center}
      .gc-tile video{width:100%;height:100%;object-fit:cover;background:#020617}.gc-name{position:absolute;left:8px;bottom:8px;padding:4px 7px;border-radius:7px;background:#0009;font-size:11px}
      .gc-controls{display:flex;justify-content:center;gap:9px;padding:12px;background:#111827;border-top:1px solid #263244}.gc-btn{border:0;border-radius:12px;padding:11px 15px;background:#263244;color:#fff}.gc-btn.end{background:#dc2626}.gc-btn.off{background:#475569}
    `;
    document.head.appendChild(style);
    const root = document.createElement('section');
    root.id = 'groupCallOverlay';
    root.className = 'gc-hidden';
    root.innerHTML = `
      <div class="gc-head"><div class="gc-title" id="gcTitle">Group call</div><div class="gc-status" id="gcStatus">Connecting…</div></div>
      <div class="gc-grid" id="gcGrid"></div>
      <div class="gc-controls"><button class="gc-btn" id="gcMute">🎙 Mute</button><button class="gc-btn" id="gcCamera">📷 Camera</button><button class="gc-btn end" id="gcEnd">End call</button></div>`;
    document.body.appendChild(root);
    state.root = root;
    state.grid = root.querySelector('#gcGrid');
    state.status = root.querySelector('#gcStatus');
    root.querySelector('#gcMute').onclick = toggleMute;
    root.querySelector('#gcCamera').onclick = toggleCamera;
    root.querySelector('#gcEnd').onclick = leave;
  }

  function setStatus(text) { if (state.status) state.status.textContent = text; }

  function tile(id, stream, name, muted = false) {
    const key = 'gc-' + String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
    let el = document.getElementById(key);
    if (!el) {
      el = document.createElement('div');
      el.className = 'gc-tile';
      el.id = key;
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = muted;
      el.appendChild(video);
      const label = document.createElement('div');
      label.className = 'gc-name';
      label.textContent = name || id;
      el.appendChild(label);
      state.grid.appendChild(el);
    }
    const video = el.querySelector('video');
    if (video.srcObject !== stream) video.srcObject = stream;
    return el;
  }

  async function getMedia() {
    if (state.localStream) return state.localStream;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support camera/microphone access.');
    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: state.type === 'video' });
    tile(state.currentUserId, state.localStream, 'You', true);
    return state.localStream;
  }

  function rtcConfig() {
    return { iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ] };
  }

  function peerKey(remoteId) { return String(remoteId); }

  async function ensurePeer(remoteId, initiator) {
    const key = peerKey(remoteId);
    let entry = state.peers.get(key);
    if (entry) return entry.pc;

    const pc = new RTCPeerConnection(rtcConfig());
    entry = { pc, candidateQueue: [], makingOffer: false };
    state.peers.set(key, entry);

    const stream = await getMedia();
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = event => {
      if (event.candidate) sendSignal(remoteId, 'ice-candidate', event.candidate.toJSON ? event.candidate.toJSON() : event.candidate).catch(console.warn);
    };
    pc.ontrack = event => {
      const remoteStream = event.streams?.[0];
      if (remoteStream) tile(key, remoteStream, `Member ${remoteId}`);
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) removePeer(key);
    };

    if (initiator) {
      entry.makingOffer = true;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal(remoteId, 'offer', pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription);
      } finally { entry.makingOffer = false; }
    }
    return pc;
  }

  async function sendSignal(to, kind, data) {
    if (!state.callId) return;
    await api(`/${encodeURIComponent(state.callId)}/signals`, {
      method: 'POST', body: JSON.stringify({ to: String(to), kind, data })
    });
  }

  async function handleSignal(signal) {
    const from = String(signal.from);
    if (!from || from === state.currentUserId) return;
    if (signal.kind === 'participant-left') return removePeer(from);
    if (signal.kind === 'host-changed') return;
    if (signal.kind === 'participant-joined') {
      // Deterministic offerer rule avoids duplicate simultaneous offers.
      if (state.currentUserId < from) await ensurePeer(from, true);
      return;
    }

    const pc = await ensurePeer(from, false);
    const entry = state.peers.get(from);
    if (!entry) return;

    if (signal.kind === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
      while (entry.candidateQueue.length) await pc.addIceCandidate(entry.candidateQueue.shift());
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(from, 'answer', pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription);
    } else if (signal.kind === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
      while (entry.candidateQueue.length) await pc.addIceCandidate(entry.candidateQueue.shift());
    } else if (signal.kind === 'ice-candidate') {
      const candidate = new RTCIceCandidate(signal.data);
      if (pc.remoteDescription) await pc.addIceCandidate(candidate);
      else entry.candidateQueue.push(candidate);
    }
  }

  function removePeer(id) {
    const key = peerKey(id);
    const entry = state.peers.get(key);
    if (entry) { try { entry.pc.close(); } catch (_) {} }
    state.peers.delete(key);
    document.getElementById('gc-' + key.replace(/[^a-zA-Z0-9_-]/g, '_'))?.remove();
  }

  async function poll() {
    if (!state.active) return;
    try {
      const r = await api(`/${encodeURIComponent(state.callId)}/signals?after=${state.cursor}`);
      state.cursor = Number(r.cursor || state.cursor);
      for (const signal of r.signals || []) await handleSignal(signal);
      const room = await api(`/${encodeURIComponent(state.callId)}`);
      if (!room?.room?.active) return leave(false);
      const participants = room.room.participants || [];
      setStatus(`${participants.length} participant${participants.length === 1 ? '' : 's'}`);
      for (const p of participants) {
        const id = String(p.userId);
        if (id !== state.currentUserId && !state.peers.has(id) && state.currentUserId < id) await ensurePeer(id, true);
      }
    } catch (e) {
      if (state.active) console.warn('[GroupCall] polling:', e.message);
    }
    if (state.active) state.pollTimer = setTimeout(poll, 900);
  }

  async function start(type, group) {
    if (!group?.id) throw new Error('No group selected.');
    ensureUi();
    if (state.active) return;
    state.currentUserId = userId();
    if (!state.currentUserId) throw new Error('Your session/user ID is not available.');
    state.chatId = String(group.id);
    state.type = type === 'video' ? 'video' : 'audio';
    state.root.classList.remove('gc-hidden');
    state.grid.innerHTML = '';
    setStatus('Starting…');
    try {
      await getMedia();
      const created = await api('/', { method: 'POST', body: JSON.stringify({ chatId: state.chatId, callType: state.type }) });
      state.room = created.room;
      state.callId = state.room.callId;
      state.active = true;
      state.cursor = 0;
      $('title', state.root).textContent = `${group.name || 'Group'} · ${state.type}`;
      setStatus('Waiting for members…');
      // Publish a lightweight system message so members who open the group can see the call.
      try {
        const marker = JSON.stringify({ __groupCall: true, callId: state.callId, type: state.type });
        await fetch((typeof window.__getApiBase === 'function' ? window.__getApiBase() : '') + '/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) },
          body: JSON.stringify({ chatId: state.chatId, content: marker, type: 'system', clientMessageId: 'gcall_' + state.callId })
        }).catch(() => {});
      } catch (_) {}
      await poll();
    } catch (e) {
      stopLocal();
      state.root.classList.add('gc-hidden');
      throw e;
    }
  }

  async function join(callId, type = 'audio') {
    ensureUi();
    if (state.active) return;
    state.currentUserId = userId();
    state.callId = callId;
    state.type = type === 'video' ? 'video' : 'audio';
    state.root.classList.remove('gc-hidden');
    await getMedia();
    const r = await api(`/${encodeURIComponent(callId)}/join`, { method: 'POST', body: JSON.stringify({ media: state.type }) });
    state.room = r.room;
    state.chatId = String(state.room.chatId);
    state.active = true;
    state.cursor = 0;
    for (const p of state.room.participants || []) {
      const id = String(p.userId);
      if (id !== state.currentUserId && state.currentUserId < id) await ensurePeer(id, true);
    }
    await poll();
  }

  function stopLocal() {
    if (state.localStream) state.localStream.getTracks().forEach(t => t.stop());
    state.localStream = null;
    state.peers.forEach(({ pc }) => { try { pc.close(); } catch (_) {} });
    state.peers.clear();
  }

  async function leave(notify = true) {
    if (!state.active && !state.callId) return;
    const id = state.callId;
    state.active = false;
    if (state.pollTimer) clearTimeout(state.pollTimer);
    state.pollTimer = null;
    if (notify && id) await api(`/${encodeURIComponent(id)}/leave`, { method: 'POST' }).catch(() => {});
    stopLocal();
    state.callId = null;
    state.room = null;
    state.chatId = null;
    if (state.root) state.root.classList.add('gc-hidden');
  }

  function toggleMute() {
    const track = state.localStream?.getAudioTracks?.()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const btn = state.root?.querySelector('#gcMute');
    if (btn) btn.textContent = track.enabled ? '🎙 Mute' : '🔇 Unmute';
  }

  function toggleCamera() {
    const track = state.localStream?.getVideoTracks?.()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const btn = state.root?.querySelector('#gcCamera');
    if (btn) btn.textContent = track.enabled ? '📷 Camera' : '🚫 Camera';
  }

  function $(selector, root) { return root?.querySelector(selector); }

  window.GroupCall = { start, join, leave, isActive: () => state.active };
})();
