#!/usr/bin/env python3
"""Writes the shared header, menu and footer into every page.

Edit scripts/layout/header.html, scripts/layout/footer.html, data/socials.json or
data/artists.json, then run:  python3 scripts/build-layout.py
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

PAGES = {  # page -> menu item marked as current
    'index.html': None, 'about.html': 'about.html', 'artists.html': 'artists.html', 'artist.html': 'artists.html', 'events.html': 'events.html', 'press.html': None,
    'releases.html': 'releases.html', 'release.html': 'releases.html', 'contact.html': 'contact.html', 'get-in-touch.html': None,
    'privacy.html': 'privacy.html', 'legal.html': 'legal.html', '404.html': None, 'confirmed.html': None,
    'account.html': 'account.html', 'dashboard.html': 'account.html', 'cart.html': 'cart.html', 'order-confirmed.html': 'cart.html',
    'payment-failed.html': 'cart.html', 'admin.html': None, 'terms.html': None,
}
MENU = [('about.html', 'About the label'), ('artists.html', 'Artists'), ('events.html', 'Events'), ('#merch', 'Merch'), ('contact.html', 'Send your demo'),
        ('account.html', 'Log in / Sign up'), ('privacy.html', 'Privacy policy'), ('legal.html', 'Legal notice'), ('cart.html', 'Cart')]
EXPLORE = [('index.html', 'Home'), ('index.html#releases', 'Latest releases'), ('index.html#radio', 'Radio'),
           ('releases.html', 'Search releases'), ('artists.html', 'Artists'), ('events.html', 'Events')]
LABEL = [('about.html', 'About the label'), ('contact.html', 'Send your demo'), ('get-in-touch.html', 'Contact'), ('privacy.html', 'Privacy policy'),
         ('legal.html', 'Legal notice'), ('terms.html', 'Terms of service'), ('press.html', 'Press kit'), ('sitemap.xml', 'Sitemap')]
ACCOUNT = [('account.html', 'Log in / Sign up'), ('dashboard.html#services', 'Services'), ('dashboard.html#submit', 'Submit a demo'), ('cart.html', 'Cart')]

header_t = open('scripts/layout/header.html').read()
footer_t = open('scripts/layout/footer.html').read()
socials = json.load(open('data/socials.json'))['socials']
artists = json.load(open('data/artists.json'))['artists']

def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('"', '&quot;')

def build(page, current):
    pre = '/' if page == '404.html' else ''

    def L(href):
        # Clean addresses: about.html -> about, index.html -> the bare domain
        if href.startswith(('#', 'http')):
            return href
        path, hashmark, frag = href.partition('#')
        path, qmark, query = path.partition('?')
        if path.endswith('.html'):
            path = path[:-5]
        if path == 'index':
            path = ''
        tail = (qmark + query) + (hashmark + frag)
        if path == '':
            return (pre or './') + tail
        return pre + path + tail
    def menu_item(i, h, t):
        if h == '#merch':  # no shop yet: the button reveals "coming soon" in the menu
            return ('      <button class="menu-link display menu-soon" type="button" style="--i:%d" aria-expanded="false" aria-controls="merch-soon">'
                    '<span class="mono muted">%02d</span>%s<span class="mono menu-tag">Soon</span></button>\n'
                    '      <div class="merch-soon" id="merch-soon" hidden><span class="display">Coming soon</span>'
                    '<span class="mono muted">The Hyard Records merch store is on its way. Follow us on Instagram for the drop.</span></div>') % (i, i + 1, t)
        extra = ''
        if h == 'account.html':
            extra = ' data-account-link'
        if h == 'cart.html':
            extra = ' data-cart-link hidden'
            t = 'Cart<span class="mono menu-tag" data-cart-count></span>'
        return '      <a class="menu-link display" href="%s" style="--i:%d"%s%s><span class="mono muted">%02d</span>%s</a>' % (
            L(h), i, ' aria-current="page"' if h == current else '', extra, i + 1, t)
    menu = '\n'.join(menu_item(i, h, t) for i, (h, t) in enumerate(MENU))
    header = header_t.replace('{LINKS}', menu).replace('{LOCKUP}', '#top' if page == 'index.html' else L('index.html')).replace('{SEARCH}', L('releases.html')).replace('{MAINID}', 'main').replace('{I18N}', L('i18n.js')).replace('{ACCOUNT}', L('account.html'))

    def links(items):
        return '\n'.join('        <a href="%s">%s</a>' % (L(h), esc(t)) for h, t in items)
    artist_items = [('artist-%s.html' % a['slug'], a['name']) for a in artists]
    social_html = '\n'.join(
        '        <a class="social" href="%s" target="_blank" rel="noopener"><svg aria-hidden="true"><use href="#i-%s"/></svg><span>%s</span></a>'
        % (esc(s['url']), s['icon'], esc(s['label'])) for s in socials if s.get('url'))
    footer = (footer_t.replace('{HOME}', '#top' if page == 'index.html' else L('index.html'))
              .replace('{CONTACT}', L('contact.html')).replace('{PRIVACY}', L('privacy.html'))
              .replace('{EXPLORE}', links(EXPLORE)).replace('{ARTISTS}', links(artist_items))
              .replace('{LABEL}', links(LABEL)).replace('{ACCOUNTLINKS}', links(ACCOUNT)).replace('{SOCIALS}', social_html))
    # The newsletter sign-up and the "Send us your demo" button only show on the home page
    if page != 'index.html':
        footer = re.sub(r'\n        <a class="more footer-cta"[^\n]*</a>', '', footer)
        footer = re.sub(r'\n    <section class="footer-news"[\s\S]*?</section>\n', '', footer)
    return header, footer

for page, current in PAGES.items():
    s = open(page).read()
    header, footer = build(page, current)
    if '<!--CHROME-->\n' in s:
        s = s.replace('<!--CHROME-->\n', header, 1)
    else:
        a = s.index('  <svg width="0" height="0"')
        m = s.index('<div class="menu" id="menu" hidden>', a)
        b = s.index('</nav>\n  </div>\n', m) + len('</nav>\n  </div>\n')
        s = s[:a] + header + s[b:]
    s = re.sub(r'  <footer class="(?:site-footer|footer)"[\s\S]*?</footer>\n', footer, s, count=1)
    # Skip link target: the page's <main>, which gets an id and can take focus
    m = re.search(r'<main([^>]*)>', s)
    if m:
        attrs = m.group(1)
        idm = re.search(r'id="([^"]+)"', attrs)
        main_id = idm.group(1) if idm else 'main'
        if not idm:
            attrs += ' id="main"'
        if 'tabindex' not in attrs:
            attrs += ' tabindex="-1"'
        s = s[:m.start()] + '<main' + attrs + '>' + s[m.end():]
        s = re.sub(r'<a class="skip-link" href="#[^"]*">', '<a class="skip-link" href="#%s">' % main_id, s, count=1)
    open(page, 'w').write(s)
    print('updated', page)

# Release and artist pages are copies of release.html / artist.html, so refresh them too
import subprocess, sys
subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', 'build-pages.py')], check=True)
