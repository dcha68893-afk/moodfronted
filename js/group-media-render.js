(() => {
  'use strict';
  if (window.__NECPRA_GROUP_MEDIA_RENDER__) return;
  window.__NECPRA_GROUP_MEDIA_RENDER__ = true;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render() {
    const box = document.getElementById('messages');
    const cache = Array.isArray(window.__GROUP_MESSAGES_CACHE) ? window.__GROUP_MESSAGES_CACHE : [];
    if (!box || !cache.length) return;
    [...box.querySelectorAll('.row')].forEach((row, i) => {
      const msg = cache[i]; const media = msg?.metadata?.media;
      if (!media?.url || row.dataset.groupMediaRendered === String(msg.id)) return;
      const bubble = row.querySelector('.bubble'); if (!bubble) return;
      const sender = bubble.querySelector('.sender'); const time = bubble.querySelector('.time');
      [...bubble.children].forEach(el => { if (el !== sender && el !== time && !el.classList.contains('group-message-actions')) el.remove(); });
      const body = document.createElement('div'); body.className = 'group-media-body';
      const mime = String(media.mimeType || '');
      if (mime.startsWith('image/')) {
        const img = document.createElement('img'); img.src = media.url; img.alt = media.name || 'Image'; img.loading = 'lazy'; img.style.cssText = 'display:block;max-width:min(420px,100%);max-height:360px;border-radius:12px;object-fit:contain'; body.appendChild(img);
      } else if (mime.startsWith('video/')) {
        const video = document.createElement('video'); video.src = media.url; video.controls = true; video.playsInline = true; video.style.cssText = 'display:block;max-width:min(420px,100%);max-height:360px;border-radius:12px'; body.appendChild(video);
      } else if (mime.startsWith('audio/')) {
        const audio = document.createElement('audio'); audio.src = media.url; audio.controls = true; body.appendChild(audio);
      } else {
        const link = document.createElement('a'); link.href = media.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = media.name || 'Open attachment'; link.style.color = 'inherit'; body.appendChild(link);
      }
      bubble.insertBefore(body, time || null); row.dataset.groupMediaRendered = String(msg.id);
    });
  }
  new MutationObserver(() => setTimeout(render, 0)).observe(document.body, { childList: true, subtree: true });
  setInterval(render, 700);
  render();
})();
