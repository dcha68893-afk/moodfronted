// Message attachment transport: multipart uploads must never cross the iframe
// postMessage bridge because FormData is not structured-cloneable.
(function () {
  'use strict';

  function getToken() {
    try {
      if (typeof window.getAuthSession === 'function') {
        const s = window.getAuthSession();
        if (s && s.token) return s.token;
      }
    } catch (_) {}
    try { if (window.__kynToken) return window.__kynToken; } catch (_) {}
    try { if (window.authToken) return window.authToken; } catch (_) {}
    for (const key of ['kynecta_session', 'kynecta_auth', 'necpa_token', 'authToken', 'accessToken', 'token']) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        if (raw.charAt(0) === '{') {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.token) return parsed.token;
        } else return raw;
      } catch (_) {}
    }
    return '';
  }

  function resolveUploadUrl(path) {
    const base = typeof window.__getApiBase === 'function'
      ? String(window.__getApiBase()).replace(/\/+$/, '')
      : '';
    const p = String(path || '').startsWith('/') ? String(path) : `/${path}`;
    if (/\/api(?:\/|$)/i.test(p)) {
      const origin = typeof window.__getApiOrigin === 'function' ? window.__getApiOrigin() : '';
      return `${String(origin).replace(/\/+$/, '')}${p}`;
    }
    return `${base}${p}`;
  }

  async function uploadMultipart(file, onProgress) {
    if (!(file instanceof File) && !(file instanceof Blob)) {
      throw new Error('No attachment file was provided');
    }
    const form = new FormData();
    form.append('file', file, file.name || 'attachment');
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    // XMLHttpRequest gives us upload progress without ever serializing the
    // File/FormData through window.postMessage.
    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', resolveUploadUrl('/files/upload'), true);
      Object.keys(headers).forEach(k => xhr.setRequestHeader(k, headers[k]));
      xhr.upload.onprogress = e => {
        if (typeof onProgress === 'function' && e.lengthComputable) {
          try { onProgress(Math.round((e.loaded / e.total) * 100)); } catch (_) {}
        }
      };
      xhr.onerror = () => reject(new Error('Network error while uploading attachment'));
      xhr.ontimeout = () => reject(new Error('Attachment upload timed out'));
      xhr.timeout = 120000;
      xhr.onload = () => {
        let body = {};
        try { body = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch (_) {}
        if (xhr.status < 200 || xhr.status >= 300 || body.success === false) {
          reject(new Error(body.message || body.error || `Upload failed (${xhr.status})`));
          return;
        }
        const data = body.data || body;
        if (!data.url) {
          reject(new Error('Upload succeeded but the server did not return a file URL'));
          return;
        }
        resolve({
          url: data.url,
          mimeType: data.mimeType || file.type || '',
          size: data.size ?? file.size,
          type: data.type || (file.type.split('/')[0] || 'file'),
          originalName: data.originalName || file.name || 'attachment'
        });
      };
      xhr.send(form);
    });
    return result;
  }

  function install() {
    if (!window.MessageModule || typeof window.MessageModule.uploadAttachment !== 'function') return false;
    if (window.MessageModule.__multipartUploadPatched) return true;
    window.MessageModule.uploadAttachment = uploadMultipart;
    window.MessageModule.__multipartUploadPatched = true;
    console.info('[MessageUpload] multipart transport installed; FormData stays out of postMessage');
    return true;
  }

  if (!install()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 100) clearInterval(timer);
    }, 50);
  }

  window.NecpraMessageUploadTransport = { uploadMultipart, install };
})();
