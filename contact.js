(() => {
  const MAX_BYTES = 10 * 1024 * 1024; // FormSubmit's total attachment limit
  const OK_EXT = /\.(mp3|wav)$/i;

  const form = document.getElementById('demo-form');
  const sent = document.getElementById('sent');
  const params = new URLSearchParams(location.search);

  // Back from FormSubmit after a successful send
  if (params.get('sent') === '1') {
    form.hidden = true;
    document.getElementById('guidelines').hidden = true;
    sent.hidden = false;
    return;
  }

  // Where FormSubmit sends people after the email goes out
  const next = new URL('contact?sent=1', location.href);
  document.getElementById('next-url').value = next.href;

  const fileInput = document.getElementById('demo');
  const drop = document.getElementById('drop');
  const dropTitle = document.getElementById('drop-title');
  const dropSub = document.getElementById('drop-sub');
  const dropClear = document.getElementById('drop-clear');
  const demoError = document.getElementById('demo-error');
  const musicHint = document.getElementById('music-hint');
  const consentError = document.getElementById('consent-error');
  const status = document.getElementById('form-status');
  const submit = document.getElementById('send-btn');

  const message = document.getElementById('message');
  const messageCount = document.getElementById('message-count');
  const grow = () => {
    message.style.height = 'auto';
    message.style.height = `${message.scrollHeight + 2}px`;
    messageCount.textContent = message.value.length;
  };
  message.addEventListener('input', grow);

  const fmtSize = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

  const errorEl = (input) => input.closest('.field')?.querySelector('.field-error');
  const setError = (input, msg) => {
    const el = input === fileInput ? demoError : errorEl(input);
    if (el) el.textContent = msg || '';
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    input.closest('.field')?.classList.toggle('has-error', Boolean(msg));
  };

  const checkFile = () => {
    const f = fileInput.files[0];
    if (!f) return '';
    if (!OK_EXT.test(f.name)) return 'Use an MP3 or WAV file.';
    if (converting) return 'Wait for the file to finish converting.';
    if (f.size > MAX_BYTES) return `That file is ${fmtSize(f.size)} and couldn't be shrunk enough. Add a demo link below instead.`;
    return '';
  };

  // ---------- Big files: decode in the browser and re-encode as an MP3 that fits ----------
  // The email service accepts 10 MB in total, so anything bigger is turned into a high-quality MP3
  // right here on the visitor's device. Nothing is uploaded until they press Send.
  const TARGET_BYTES = 9.4 * 1024 * 1024;
  const BITRATES = [320, 256, 224, 192, 160, 128, 112, 96];
  const LAME_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
  const LAME_SRI = 'sha384-xuasJXVcyv3hZq0eYpelEkBC8l4yufatZXDsKuyCU2rqfhDCb+ftuE/mSfZAteiK';
  const progress = document.getElementById('drop-progress');
  let converting = false;
  let convertJob = 0;
  let lamePromise = null;

  const loadLame = () => {
    lamePromise = lamePromise || new Promise((resolve, reject) => {
      if (window.lamejs) { resolve(window.lamejs); return; }
      const s = document.createElement('script');
      s.src = LAME_SRC;
      s.integrity = LAME_SRI;
      s.crossOrigin = 'anonymous';
      s.onload = () => (window.lamejs ? resolve(window.lamejs) : reject(new Error('encoder missing')));
      s.onerror = () => { lamePromise = null; reject(new Error('encoder failed to load')); };
      document.head.appendChild(s);
    });
    return lamePromise;
  };

  const setProgress = (p) => {
    progress.hidden = p == null;
    if (p != null) progress.firstElementChild.style.width = `${Math.round(p * 100)}%`;
  };

  const toInt16 = (f32) => {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const v = Math.max(-1, Math.min(1, f32[i]));
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    return out;
  };

  const shrink = async (file, job) => {
    const lame = await loadLame();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    let ctx;
    try { ctx = new Ctx({ sampleRate: 44100 }); } catch { ctx = new Ctx(); }
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    ctx.close?.();
    if (job !== convertJob) return null;

    const kbps = BITRATES.find((b) => (b * 1000 / 8) * audio.duration <= TARGET_BYTES);
    if (!kbps) throw new Error('too-long');

    const channels = Math.min(2, audio.numberOfChannels);
    const left = toInt16(audio.getChannelData(0));
    const right = channels === 2 ? toInt16(audio.getChannelData(1)) : null;
    const encoder = new lame.Mp3Encoder(channels, audio.sampleRate, kbps);
    const parts = [];
    const BLOCK = 1152;
    for (let i = 0; i < left.length; i += BLOCK) {
      const l = left.subarray(i, i + BLOCK);
      const buf = right ? encoder.encodeBuffer(l, right.subarray(i, i + BLOCK)) : encoder.encodeBuffer(l);
      if (buf.length) parts.push(new Uint8Array(buf));
      if (i % (BLOCK * 200) === 0) {
        setProgress(0.15 + 0.85 * (i / left.length));
        await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
        if (job !== convertJob) return null;
      }
    }
    const end = encoder.flush();
    if (end.length) parts.push(new Uint8Array(end));
    const name = file.name.replace(/\.(wav|mp3)$/i, '') + '.mp3';
    return { file: new File(parts, name, { type: 'audio/mpeg' }), kbps };
  };

  const showFile = async () => {
    const f = fileInput.files[0];
    const job = ++convertJob;
    converting = false;
    setProgress(null);
    drop.classList.toggle('has-file', Boolean(f));
    drop.classList.remove('is-converting');
    dropClear.hidden = !f;
    dropTitle.textContent = f ? f.name : 'Drop your demo here';
    dropSub.textContent = f ? fmtSize(f.size) : 'or click to choose a file';
    setError(fileInput, '');
    if (!f) return;
    if (!OK_EXT.test(f.name)) { setError(fileInput, checkFile()); return; }
    if (f.size <= MAX_BYTES) return;

    // Too big for email: convert it
    converting = true;
    drop.classList.add('is-converting');
    dropSub.textContent = `${fmtSize(f.size)} · shrinking to an MP3 so it fits…`;
    setProgress(0.05);
    try {
      const result = await shrink(f, job);
      if (!result || job !== convertJob) return;
      const dt = new DataTransfer();
      dt.items.add(result.file);
      fileInput.files = dt.files;
      converting = false;
      drop.classList.remove('is-converting');
      setProgress(null);
      dropTitle.textContent = result.file.name;
      dropSub.textContent = `${fmtSize(result.file.size)} · MP3 ${result.kbps} kbps, shrunk from ${fmtSize(f.size)}. Your original stays on your device.`;
      setError(fileInput, checkFile());
    } catch (err) {
      if (job !== convertJob) return;
      converting = false;
      drop.classList.remove('is-converting');
      setProgress(null);
      dropSub.textContent = fmtSize(f.size);
      setError(fileInput, err.message === 'too-long'
        ? 'This track is too long to fit as an email attachment. Remove it and add a demo link below instead.'
        : "Your browser couldn't convert this file. Export an MP3 under 10 MB, or add a demo link below.");
    }
  };

  fileInput.addEventListener('change', showFile);
  dropClear.addEventListener('click', (e) => {
    e.preventDefault();
    fileInput.value = '';
    showFile();
  });
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => {
    e.preventDefault();
    drop.classList.add('is-over');
  }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) {
      fileInput.files = e.dataTransfer.files;
      showFile();
    }
  });

  const validateField = (input) => {
    if (input === fileInput) return !checkFile();
    const v = input.value.trim();
    let msg = '';
    if (input.required && !v) msg = 'Fill this in.';
    else if (v && input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = 'Enter an email like you@gmail.com.';
    else if (v && input.type === 'tel' && v.replace(/[^\d]/g, '').length < 6) msg = 'Enter a phone number with country code.';
    else if (v && input.type === 'url') {
      try {
        const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
        if (!u.hostname.includes('.')) throw new Error();
        input.value = u.href;
      } catch { msg = 'Enter a full link, starting with https://'; }
    }
    setError(input, msg);
    return !msg;
  };

  form.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=file]):not(.honey)').forEach((input) => {
    input.addEventListener('blur', () => { if (input.value.trim()) validateField(input); });
    input.addEventListener('input', () => { if (input.getAttribute('aria-invalid') !== null) setError(input, ''); });
  });
  form.addEventListener('input', () => musicHint.classList.remove('is-error'));
  const consent = form.querySelector('input[type=checkbox]');
  consent.addEventListener('change', () => { consentError.textContent = ''; });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    status.textContent = '';
    const inputs = [...form.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not(.honey)')];
    let ok = inputs.map(validateField).every(Boolean);

    const hasMusic = [...form.querySelectorAll('[data-music]')].some((i) => (i.type === 'file' ? i.files.length : i.value.trim()));
    musicHint.classList.toggle('is-error', !hasMusic);
    musicHint.textContent = hasMusic ? 'Add at least one link or a demo file.' : 'Add at least one link or a demo file before sending.';
    if (!hasMusic) ok = false;

    if (!consent.checked) {
      consentError.textContent = 'Tick the box to agree before sending.';
      ok = false;
    }

    if (!ok) {
      const first = form.querySelector('[aria-invalid], .is-error');
      (first?.matches('input') ? first : first?.closest('fieldset'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (first?.matches('input')) first.focus({ preventScroll: true });
      status.textContent = 'Check the highlighted fields.';
      return;
    }

    submit.disabled = true;
    submit.classList.add('is-sending');
    submit.querySelector('.submit-text').textContent = fileInput.files.length ? 'Uploading…' : 'Sending…';
    HTMLFormElement.prototype.submit.call(form);
  });
})();
