(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getJson = (url) => fetch(url, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

  const STATUS = { 'on-sale': 'Tickets on sale', 'sold-out': 'Sold out', free: 'Free entry', announced: 'Announced' };
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

  const parts = (iso) => {
    const d = new Date(`${iso}T12:00:00`);
    return {
      day: d.toLocaleDateString('en-GB', { day: '2-digit' }),
      month: d.toLocaleDateString('en-GB', { month: 'short' }),
      year: d.getFullYear(),
      weekday: d.toLocaleDateString('en-GB', { weekday: 'long' }),
    };
  };

  // Download a calendar file for one event
  const ics = (e) => {
    const stamp = (date, time) => `${date.replace(/-/g, '')}${time ? `T${time.replace(':', '')}00` : ''}`;
    const start = stamp(e.date, e.time);
    let end;
    if (e.time) {
      const d = new Date(`${e.date}T${e.time}:00`);
      d.setHours(d.getHours() + 4);
      end = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
    } else {
      const d = new Date(`${e.date}T12:00:00`);
      d.setDate(d.getDate() + 1);
      end = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    }
    const clean = (s) => String(s || '').replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
    const body = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hyard Records//Events//EN', 'BEGIN:VEVENT',
      `UID:${e.date}-${clean(e.title).replace(/\W+/g, '-')}@hyardrecords.com`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      e.time ? `DTSTART:${start}` : `DTSTART;VALUE=DATE:${start}`,
      e.time ? `DTEND:${end}` : `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${clean(e.title)}`,
      `LOCATION:${clean(e.location || [e.venue, e.city, e.country].filter(Boolean).join(', '))}`,
      `DESCRIPTION:${clean([e.description || e.note, e.ticketUrl].filter(Boolean).join(' — '))}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
    a.download = `${e.date}-${String(e.title).toLowerCase().replace(/\W+/g, '-')}.ics`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  let all = [];
  let roster = [];
  let artistFilter = '';

  const row = (e, i, past) => {
    const p = parts(e.date);
    const names = (e.artists || []).map((slug) => {
      const a = roster.find((x) => x.slug === slug);
      return a ? `<a href="artist-${slug}">${esc(a.name)}</a>` : esc(slug);
    }).concat(e.otherArtists ? [esc(e.otherArtists)] : []).join(' <span class="muted">·</span> ');
    const where = e.location || [e.venue, [e.city, e.country].filter(Boolean).join(', ')].filter(Boolean).join(' — ');
    const desc = e.description || e.note || '';
    const media = e.image && e.image.url
      ? `<img src="${esc(e.image.url)}" alt="" loading="lazy">`
      : '<svg aria-hidden="true"><use href="#globe"/></svg>';
    const status = STATUS[e.status] || '';
    const ticket = !past && e.ticketUrl && e.status !== 'sold-out'
      ? `<a class="news-btn display ev-ticket" href="${esc(e.ticketUrl)}" target="_blank" rel="noopener">${e.status === 'free' ? 'Details' : 'Tickets'} <svg aria-hidden="true"><use href="#i-arrow"/></svg></a>` : '';
    const info = e.infoUrl ? `<a class="more ev-info" href="${esc(e.infoUrl)}" target="_blank" rel="noopener">More info</a>` : '';
    const cal = past ? '' : `<button class="more ev-cal" type="button" data-cal="${all.indexOf(e)}">Add to calendar</button>`;
    return `
      <li class="ev has-pic${past ? ' is-past' : ''}" data-slide="up" style="--d:${(i % 6) * 70}ms">
        <div class="ev-date">
          <span class="display ev-day">${p.day}</span>
          <span class="mono ev-month">${esc(p.month)} ${p.year}</span>
          <span class="mono muted ev-weekday">${esc(p.weekday)}${e.time ? ` · ${esc(e.time)}` : ''}</span>
        </div>
        <div class="ev-pic ev-media">${media}</div>
        <div class="ev-main">
          ${status ? `<span class="mono ev-status ev-${esc(e.status)}">${esc(status)}</span>` : ''}
          <h3 class="display ev-title">${esc(e.title)}</h3>
          ${where ? `<p class="mono ev-where">${esc(where)}</p>` : ''}
          ${names ? `<p class="mono muted ev-artists">${names}</p>` : ''}
          ${desc ? `<p class="ev-desc">${esc(desc)}</p>` : ''}
        </div>
        <div class="ev-actions">${ticket}${info}${cal}</div>
      </li>`;
  };

  const render = () => {
    const match = (e) => !artistFilter || (e.artists || []).includes(artistFilter);
    const upcoming = all.filter((e) => e.date >= today && match(e)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const past = all.filter((e) => e.date < today && match(e)).sort((a, b) => b.date.localeCompare(a.date));

    $('upcoming').innerHTML = upcoming.map((e, i) => row(e, i, false)).join('');
    $('upcoming-empty').hidden = upcoming.length > 0;
    $('upcoming-count').textContent = upcoming.length ? `${upcoming.length} ${upcoming.length === 1 ? 'date' : 'dates'}` : '';
    $('past').innerHTML = past.map((e, i) => row(e, i, true)).join('');
    $('past-wrap').hidden = past.length === 0;
    $('past-count').textContent = past.length ? `${past.length} ${past.length === 1 ? 'event' : 'events'}` : '';
    if (window.hyardObserve) window.hyardObserve();
  };

  document.addEventListener('click', (e) => {
    const cal = e.target.closest('[data-cal]');
    if (cal) ics(all[Number(cal.dataset.cal)]);
  });

  // Events added on the admin page (Firestore "events"), plus any written into data/events.json
  const fromAdmin = () => (window.HyardFirebase ? window.HyardFirebase.ready : Promise.resolve({}))
    .then(async (fb) => {
      if (!fb.configured) return [];
      const snap = await fb.F.getDocs(fb.F.collection(fb.db, 'events'));
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    })
    .catch((err) => { console.warn('Events from admin did not load', err); return []; });

  Promise.all([getJson('data/events.json'), getJson('data/artists.json'), fromAdmin()])
    .then(([ev, ar, live]) => {
      all = [...(ev.events || []), ...live].filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date || ''));
      roster = ar.artists || [];

      // Artist filter, only when there's more than one artist with events
      const used = roster.filter((a) => all.some((e) => (e.artists || []).includes(a.slug)));
      const filter = $('events-filter');
      if (used.length > 1) {
        used.forEach((a) => filter.insertAdjacentHTML('beforeend', `<button class="filter" type="button" data-value="${esc(a.slug)}" aria-pressed="false">${esc(a.name)}</button>`));
        filter.hidden = false;
        filter.addEventListener('click', (e) => {
          const b = e.target.closest('.filter');
          if (!b) return;
          artistFilter = b.dataset.value;
          filter.querySelectorAll('.filter').forEach((x) => {
            const on = x === b;
            x.classList.toggle('is-active', on);
            x.setAttribute('aria-pressed', String(on));
          });
          render();
        });
      }
      render();
    })
    .catch(() => { $('events-error').hidden = false; });
})();
