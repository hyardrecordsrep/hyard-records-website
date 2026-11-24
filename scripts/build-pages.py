#!/usr/bin/env python3
"""Writes one real page per release (release-hyd-020.html) and per artist (artist-blurfnes.html),
plus sitemap.xml.

Social apps and search engines don't run JavaScript, so release.html?c=... can only ever show the
label's logo when shared. These generated pages carry their own title, description and cover image,
then load the same scripts as release.html / artist.html.

Run after the Spotify sync or after editing data:  python3 scripts/build-pages.py
(Run scripts/build-layout.py first if the header/footer changed.)
"""
import glob, html, json, os, re
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SITE = 'https://hyardrecords.com'

releases = [r for r in json.load(open('data/releases.json'))['releases'] if (r.get('label') or '').lower() == 'hyard records']
artists = json.load(open('data/artists.json'))['artists']

def esc(s):
    return html.escape(str(s or ''), quote=True)

def absolute(url):
    if not url:
        return f'{SITE}/assets/og-image.jpg'
    return url if url.startswith('http') else f'{SITE}/{url}'

def release_file(r):
    return f"release-{r['catalog'].lower()}.html"

def artist_file(a):
    return f"artist-{a['slug']}.html"

def url_of(filename):
    # Pages are files ending in .html, but their public address has no extension
    return filename[:-5] if filename.endswith('.html') else filename

def fmt_date(d):
    try:
        y, m, dd = (int(x) for x in d.split('-'))
        return date(y, m, dd).strftime('%-d %B %Y')
    except Exception:
        return d or ''

def set_meta(page, title, desc, url, image, image_alt, og_type, marker):
    page = re.sub(r'<title>.*?</title>', f'<title>{esc(title)}</title>', page, count=1, flags=re.S)
    head_extra = '\n'.join([
        f'  <meta name="description" content="{esc(desc)}">',
        f'  <link rel="canonical" href="{esc(url)}">',
        '  <meta property="og:site_name" content="Hyard Records">',
        f'  <meta property="og:type" content="{og_type}">',
        f'  <meta property="og:title" content="{esc(title)}">',
        f'  <meta property="og:description" content="{esc(desc)}">',
        f'  <meta property="og:url" content="{esc(url)}">',
        f'  <meta property="og:image" content="{esc(image)}">',
        f'  <meta property="og:image:alt" content="{esc(image_alt)}">',
        '  <meta name="twitter:card" content="summary_large_image">',
        f'  <meta name="twitter:title" content="{esc(title)}">',
        f'  <meta name="twitter:description" content="{esc(desc)}">',
        f'  <meta name="twitter:image" content="{esc(image)}">',
        marker,
    ])
    # Drop the template's generic description / social tags, then add the specific ones
    page = re.sub(r'\n\s*<meta (?:name="description"|property="og:[^"]+"|name="twitter:[^"]+")[^>]*>', '', page)
    page = re.sub(r'\n\s*<link rel="canonical"[^>]*>', '', page)
    return page.replace('  <meta name="theme-color" content="#000000">', '  <meta name="theme-color" content="#000000">\n' + head_extra, 1)

# Remove pages from earlier runs so deleted releases don't linger
for old in glob.glob('release-hyd-*.html') + glob.glob('artist-*.html'):
    os.remove(old)

release_tpl = open('release.html').read()
for r in releases:
    names = ' × '.join(r.get('artists') or [])
    title = f"{r['title']} — {names} | Hyard Records"
    desc = f"{r['title']} by {names}. {r.get('type', 'Release')} on Hyard Records ({r['catalog']})"
    desc += f", released {fmt_date(r['releaseDate'])}." if r.get('releaseDate') else '.'
    page = set_meta(release_tpl, title, desc, f"{SITE}/{url_of(release_file(r))}", absolute(r.get('coverLarge') or r.get('cover')),
                    f"{r['title']} cover", 'music.album', f'  <meta name="hyard-release" content="{esc(r["catalog"])}">')
    open(release_file(r), 'w').write(page)

artist_tpl = open('artist.html').read()
for a in artists:
    about = (a.get('about') or [''])[0]
    desc = (about[:150].rsplit(' ', 1)[0] + '…') if len(about) > 155 else (about or f"{a['name']} on Hyard Records.")
    page = set_meta(artist_tpl, f"{a['name']} | Hyard Records", desc, f"{SITE}/{url_of(artist_file(a))}", absolute(a.get('image')),
                    f"{a['name']} profile picture", 'profile', f'  <meta name="hyard-artist" content="{esc(a["slug"])}">')
    open(artist_file(a), 'w').write(page)

# Sitemap
static = ['', 'about', 'news', 'store', 'artists', 'events', 'releases', 'contact', 'get-in-touch', 'press', 'privacy', 'legal', 'terms']
today = date.today().isoformat()
news_posts = [p for p in json.load(open('data/news.json')).get('posts', []) if p.get('status', 'published') == 'published']

# Live products and posts come from the public database, so search engines find them too
def firestore(coll):
    import urllib.request
    out, token = [], ''
    while True:
        u = f'https://firestore.googleapis.com/v1/projects/hyardrecords/databases/(default)/documents/{coll}?pageSize=300' + (f'&pageToken={token}' if token else '')
        try:
            d = json.load(urllib.request.urlopen(u, timeout=20))
        except Exception as err:
            print(f'Could not read {coll} from the database ({err}); the sitemap leaves them out')
            return []
        out += d.get('documents', [])
        token = d.get('nextPageToken')
        if not token:
            return out
def field(doc, k):
    v = doc.get('fields', {}).get(k, {})
    return next(iter(v.values()), None) if v else None
products = [d['name'].rsplit('/', 1)[1] for d in firestore('products') if field(d, 'active') is not False]
def public_posts():
    import urllib.request
    q = {'structuredQuery': {'from': [{'collectionId': 'posts'}], 'where': {'fieldFilter': {'field': {'fieldPath': 'status'}, 'op': 'IN',
         'value': {'arrayValue': {'values': [{'stringValue': 'published'}, {'stringValue': 'deleted'}]}}}}}}
    req = urllib.request.Request('https://firestore.googleapis.com/v1/projects/hyardrecords/databases/(default)/documents:runQuery',
                                 data=json.dumps(q).encode(), headers={'Content-Type': 'application/json'})
    try:
        return [r['document'] for r in json.load(urllib.request.urlopen(req, timeout=20)) if 'document' in r]
    except Exception as err:
        print(f'Could not read posts from the database ({err}); the sitemap uses data/news.json only')
        return []
db_posts = {d['name'].rsplit('/', 1)[1]: field(d, 'status') for d in public_posts()}
post_ids = [p['id'] for p in news_posts if db_posts.get(p['id'], 'published') == 'published']
post_ids += [i for i, st in db_posts.items() if st == 'published' and i not in post_ids]
urls = [f'{SITE}/{p}' for p in static] + [f"{SITE}/post?p={i}" for i in post_ids] + [f"{SITE}/product?p={i}" for i in products] + [f'{SITE}/{url_of(artist_file(a))}' for a in artists] + [f'{SITE}/{url_of(release_file(r))}' for r in releases]
open('sitemap.xml', 'w').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                               + ''.join(f'  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>\n' for u in urls) + '</urlset>\n')
print(f'{len(releases)} release pages, {len(artists)} artist pages, sitemap with {len(urls)} URLs')
