#!/usr/bin/env node
// Syncs data/releases.json with every Spotify release whose label is "Hyard Records".
//
// Usage:
//   SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node scripts/sync-spotify.mjs [--dry-run]
//
// How releases are found:
//   1. Spotify search for albums with label:"Hyard Records"
//   2. Every album, single and appearance of the seed artists in data/sync-config.json
//   3. Every album of any artist found on a Hyard Records release (auto-discovery)
// Each candidate is then fetched in full and kept only if its `label` field is "Hyard Records".
//
// Catalog numbers (HYD-001, ...) live in data/catalog.json and never change once given.
// New releases get the next free number.
//
// Artists in data/artists.json get their Spotify name and profile picture refreshed.
// Spotify's API has no artist bios, so "about" stays as written in that file.

import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const API = process.env.SPOTIFY_API_BASE || 'https://api.spotify.com/v1';
const ACCOUNTS = process.env.SPOTIFY_ACCOUNTS_BASE || 'https://accounts.spotify.com';
const DRY_RUN = process.argv.includes('--dry-run');
const MAX_ARTISTS = 40;

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const readJson = async (file, fallback) => {
  try { return JSON.parse(await readFile(path.join(DATA, file), 'utf8')); } catch { return fallback; }
};
const writeJson = (file, data) => writeFile(path.join(DATA, file), `${JSON.stringify(data, null, 2)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Images are stored on the site itself (faster, no requests to Spotify's CDN from visitors).
// Returns the local path, or the remote URL if the download fails.
async function saveImage(url, relPath) {
  if (!url) return null;
  const abs = path.join(ROOT, relPath);
  try { await access(abs); return relPath; } catch { /* not downloaded yet */ }
  if (DRY_RUN) return relPath;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, Buffer.from(await res.arrayBuffer()));
    return relPath;
  } catch (e) {
    log(`couldn't save image ${url}: ${e.message}`);
    return url;
  }
}
const log = (...a) => console.log('[sync]', ...a);

// ---------- Spotify client ----------
let token = null;

async function getToken() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET (from developer.spotify.com/dashboard).');
  }
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Spotify token request failed: ${res.status} ${await res.text()}`);
  token = (await res.json()).access_token;
}

async function api(url, attempt = 0) {
  const full = url.startsWith('http') ? url : `${API}${url}`;
  const res = await fetch(full, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429 && attempt < 5) {
    const wait = Number(res.headers.get('retry-after') || 2) * 1000;
    log(`rate limited, waiting ${wait / 1000}s`);
    await sleep(wait);
    return api(url, attempt + 1);
  }
  if (res.status === 401 && attempt < 1) {
    await getToken();
    return api(url, attempt + 1);
  }
  if (res.status >= 500 && attempt < 3) {
    await sleep(1000 * (attempt + 1));
    return api(url, attempt + 1);
  }
  if (!res.ok) {
    const err = new Error(`${res.status} ${full}: ${(await res.text()).slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Some apps are limited to smaller page sizes; fall back to 10 when 50 is rejected.
async function paged(buildUrl, pick, maxItems = 1000) {
  let limit = 50;
  let offset = 0;
  const items = [];
  while (offset < maxItems) {
    let page;
    try {
      page = pick(await api(buildUrl(limit, offset)));
    } catch (e) {
      if (e.status === 400 && limit > 10) { limit = 10; continue; }
      throw e;
    }
    items.push(...(page.items || []).filter(Boolean));
    if (!page.next || !(page.items || []).length) break;
    offset += limit;
  }
  return items;
}

const searchLabel = (label) => paged(
  (limit, offset) => `/search?type=album&limit=${limit}&offset=${offset}&q=${encodeURIComponent(`label:"${label}"`)}`,
  (d) => d.albums || {},
);

const artistAlbums = (id) => paged(
  (limit, offset) => `/artists/${id}/albums?include_groups=album,single,appears_on,compilation&limit=${limit}&offset=${offset}`,
  (d) => d,
);

async function fullAlbums(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    try {
      const d = await api(`/albums?ids=${batch.join(',')}`);
      out.push(...(d.albums || []).filter(Boolean));
    } catch (e) {
      if (e.status !== 403 && e.status !== 404 && e.status !== 400) throw e;
      for (const id of batch) {
        try { out.push(await api(`/albums/${id}`)); } catch (err) { log(`skip album ${id}: ${err.message}`); }
      }
    }
  }
  return out;
}

async function allTracks(album) {
  const items = [...(album.tracks?.items || [])];
  let next = album.tracks?.next;
  while (next) {
    const page = await api(next);
    items.push(...(page.items || []));
    next = page.next;
  }
  return items;
}

// ---------- Main ----------
async function main() {
  const config = await readJson('sync-config.json', {});
  const LABEL = config.label || 'Hyard Records';
  const catalog = await readJson('catalog.json', { prefix: 'HYD', next: 1, entries: {} });
  const previous = await readJson('releases.json', { releases: [] });
  const localCovers = config.localCovers || {};
  const artistsFile = await readJson('artists.json', { artists: [] });
  const rosterIds = artistsFile.artists.map((a) => a.spotifyId).filter(Boolean);

  await getToken();
  log(`looking for releases on label "${LABEL}"`);

  const candidates = new Set();
  const labelHits = new Set(); // found by Spotify's own label:"Hyard Records" search
  try {
    (await searchLabel(LABEL)).forEach((a) => { candidates.add(a.id); labelHits.add(a.id); });
    log(`label search: ${candidates.size} candidates`);
  } catch (e) {
    log(`label search unavailable (${e.message}), continuing with artist scan`);
  }

  const scannedArtists = new Set();
  const queue = [...new Set([...(config.artistIds || []), ...rosterIds])];
  const checked = new Map();
  const matches = new Map();
  const labelsSeen = new Map();

  // Some Spotify apps don't get the album "label" field back. When it's missing, a release
  // counts as ours only if Spotify's label:"Hyard Records" search returned it.
  const onLabel = (album) => {
    const label = typeof album.label === 'string' ? album.label.trim() : '';
    labelsSeen.set(label || '(missing)', (labelsSeen.get(label || '(missing)') || 0) + 1);
    return label ? norm(label) === norm(LABEL) : labelHits.has(album.id);
  };

  const checkCandidates = async () => {
    const todo = [...candidates].filter((id) => !checked.has(id));
    const albums = await fullAlbums(todo);
    for (const album of albums) {
      checked.set(album.id, album);
      if (!onLabel(album)) continue;
      matches.set(album.id, album);
      album.artists.forEach((a) => { if (!scannedArtists.has(a.id)) queue.push(a.id); });
    }
  };

  await checkCandidates();
  while (queue.length && scannedArtists.size < MAX_ARTISTS) {
    const id = queue.shift();
    if (scannedArtists.has(id)) continue;
    scannedArtists.add(id);
    try {
      (await artistAlbums(id)).forEach((a) => candidates.add(a.id));
    } catch (e) {
      log(`skip artist ${id}: ${e.message}`);
      continue;
    }
    await checkCandidates();
  }
  log(`checked ${checked.size} releases from ${scannedArtists.size} artists, ${matches.size} on ${LABEL}`);
  log(`labels Spotify returned: ${[...labelsSeen].map(([l, n]) => `${l} ×${n}`).join(', ')}`);

  if (!matches.size) {
    throw new Error(`No releases with label "${LABEL}" found. Leaving data/releases.json unchanged.`);
  }

  // Oldest first so brand-new catalog numbers follow release order
  const sorted = [...matches.values()].sort((a, b) => String(a.release_date).localeCompare(String(b.release_date)));
  const releases = [];
  for (const album of sorted) {
    const titleKey = `title:${norm(album.name)}`;
    const idKey = `spotify:${album.id}`;
    let cat = catalog.entries[idKey] || catalog.entries[titleKey];
    if (!cat) {
      cat = `${catalog.prefix || 'HYD'}-${String(catalog.next).padStart(3, '0')}`;
      catalog.next += 1;
      log(`new release ${cat}: ${album.name}`);
    }
    catalog.entries[idKey] = cat;
    catalog.entries[titleKey] = cat;

    const tracks = await allTracks(album);
    // Spotify's API calls EPs "single"; keep the type we already know, otherwise guess from track count
    const known = (previous.releases || []).find((p) => p.spotifyId === album.id)?.type;
    const type = known || (album.album_type === 'single'
      ? (album.total_tracks >= 3 ? 'EP' : 'Single')
      : album.album_type === 'compilation' ? 'Compilation' : 'Album');

    releases.push({
      catalog: cat,
      spotifyId: album.id,
      title: album.name,
      type,
      artists: album.artists.map((a) => a.name),
      artistIds: album.artists.map((a) => a.id),
      releaseDate: album.release_date,
      label: (typeof album.label === "string" && album.label.trim()) || LABEL,
      cover: localCovers[norm(album.name)]
        || await saveImage(album.images?.[1]?.url || album.images?.[0]?.url, `assets/covers/spotify/${album.id}-300.jpg`),
      coverLarge: localCovers[norm(album.name)]
        || await saveImage(album.images?.[0]?.url, `assets/covers/spotify/${album.id}-640.jpg`),
      url: album.external_urls?.spotify || `https://open.spotify.com/album/${album.id}`,
      upc: album.external_ids?.upc || null,
      tracks: tracks.map((t) => ({
        number: t.track_number,
        title: t.name,
        artists: t.artists.map((a) => a.name),
        durationMs: t.duration_ms,
        spotifyId: t.id,
        url: t.external_urls?.spotify || null,
      })),
    });
  }

  releases.sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)) || b.catalog.localeCompare(a.catalog));

  const before = new Set((previous.releases || []).map((r) => r.catalog));
  const after = new Set(releases.map((r) => r.catalog));
  const added = [...after].filter((c) => !before.has(c));
  const removed = [...before].filter((c) => !after.has(c));
  log(`${releases.length} releases (${added.length} added, ${removed.length} no longer on the label)`);
  if (removed.length) log(`not found on Spotify under "${LABEL}": ${removed.join(', ')}`);

  // Refresh roster artists' Spotify name and profile picture
  for (const artist of artistsFile.artists) {
    if (!artist.spotifyId) continue;
    try {
      const a = await api(`/artists/${artist.spotifyId}`);
      artist.spotifyName = a.name;
      const img = a.images?.find((i) => i.width >= 600) || a.images?.[0];
      if (img?.url) artist.image = await saveImage(img.url, `assets/artists/${artist.slug}.jpg`);
      artist.spotifyUrl = a.external_urls?.spotify || artist.spotifyUrl;
    } catch (e) {
      log(`couldn't refresh artist ${artist.name}: ${e.message}`);
    }

    // Top tracks
    try {
      const { tracks = [] } = await api(`/artists/${artist.spotifyId}/top-tracks?market=${config.market || 'HR'}`);
      if (tracks.length) {
        artist.topTracks = tracks.slice(0, 10).map((t) => ({
          title: t.name,
          artists: t.artists.map((a) => a.name),
          durationMs: t.duration_ms,
          spotifyId: t.id,
          url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
        }));
      }
    } catch (e) {
      log(`couldn't refresh top tracks for ${artist.name}: ${e.message}`);
    }

    // Collaborators: everyone credited next to this artist on any track, across their whole
    // Spotify discography (own releases and releases they appear on), not just the label's
    try {
      const albumIds = (await artistAlbums(artist.spotifyId)).map((a) => a.id);
      const missing = albumIds.filter((id) => !checked.has(id));
      (await fullAlbums(missing)).forEach((al) => checked.set(al.id, al));
      const found = new Map();
      for (const id of albumIds) {
        const album = checked.get(id);
        if (!album) continue;
        for (const t of await allTracks(album)) {
          if (!t.artists.some((a) => a.id === artist.spotifyId)) continue;
          for (const a of t.artists) {
            if (a.id === artist.spotifyId) continue;
            const c = found.get(a.id) || { spotifyId: a.id, name: a.name, works: new Set() };
            c.works.add(album.name);
            found.set(a.id, c);
          }
        }
      }
      const ids = [...found.keys()];
      const images = new Map();
      for (let i = 0; i < ids.length; i += 50) {
        try {
          const { artists = [] } = await api(`/artists?ids=${ids.slice(i, i + 50).join(',')}`);
          artists.filter(Boolean).forEach((a) => images.set(a.id, (a.images?.find((im) => im.width >= 300) || a.images?.[0])?.url));
        } catch {
          for (const id of ids.slice(i, i + 50)) {
            try { const a = await api(`/artists/${id}`); images.set(id, a.images?.[0]?.url); } catch { /* keep going */ }
          }
        }
      }
      artist.collaborators = [...found.values()]
        .map((c) => ({
          spotifyId: c.spotifyId,
          name: c.name,
          url: `https://open.spotify.com/artist/${c.spotifyId}`,
          image: artistsFile.artists.find((x) => x.spotifyId === c.spotifyId)?.image || null,
          _remoteImage: images.get(c.spotifyId) || null,
          count: c.works.size,
          works: [...c.works].sort().slice(0, 6),
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      for (const c of artist.collaborators) {
        if (!c.image && c._remoteImage) c.image = await saveImage(c._remoteImage, `assets/artists/collab-${c.spotifyId}.jpg`);
        delete c._remoteImage;
      }
      log(`${artist.name}: ${artist.collaborators.length} collaborators from ${albumIds.length} releases`);
    } catch (e) {
      log(`couldn't refresh collaborators for ${artist.name}: ${e.message}`);
    }
  }

  const out = { label: LABEL, syncedAt: new Date().toISOString(), source: 'spotify', releases };
  if (DRY_RUN) {
    releases.forEach((r) => log(`${r.catalog}  ${r.releaseDate}  ${r.artists.join(', ')} — ${r.title} (${r.type})`));
    log('dry run, nothing written');
    return;
  }
  await writeJson('releases.json', out);
  await writeJson('catalog.json', catalog);
  await writeJson('artists.json', artistsFile);
  log('wrote data/releases.json, data/catalog.json and data/artists.json');
}

main().catch((e) => {
  console.error(`[sync] ${e.message}`);
  process.exit(1);
});
