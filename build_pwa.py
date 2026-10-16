# Builds the installable (PWA) version of Downtime into ./pwa
#   python3 build_pwa.py
# - Bakes in the database address and publishable key from environment variables
#   (DOWNTIME_SUPABASE_URL, DOWNTIME_SUPABASE_KEY) or a local .env file, which git ignores.
#   Refuses secret keys. On Netlify, refuses to build without them (the last good deploy stays live).
# - Removes any starter-data block and checks it's gone (hosted files are public)
# - Adds the manifest, icons, an offline service worker, and version.json (what's deployed)
# - Writes pwa/_headers: security headers, including a Content-Security-Policy that only allows
#   Downtime's own script (by its SHA-256 hash) and only talks to your Supabase project
# Deploy the pwa/ folder (Netlify runs this script itself; see netlify.toml).
import base64, datetime, hashlib, json, os, re, shutil, subprocess

here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'downtime.html'), encoding='utf-8').read()
out = os.path.join(here, 'pwa')
shutil.rmtree(out, ignore_errors=True)
os.makedirs(os.path.join(out, 'icons'))
for f in ('icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png'):
    shutil.copy(os.path.join(here, 'icons', f), os.path.join(out, 'icons', f))
# the wordmark font (Poppins Bold, only the letters of "downtime."; SIL Open Font License, see THIRD-PARTY-NOTICES.md)
os.makedirs(os.path.join(out, 'fonts'))
shutil.copy(os.path.join(here, 'fonts', 'wordmark.woff2'), os.path.join(out, 'fonts', 'wordmark.woff2'))
shutil.copy(os.path.join(here, 'fonts', 'OFL.txt'), os.path.join(out, 'fonts', 'OFL.txt'))

# 1) no starter data in hosted files
html, n = re.subn(r'<script type="application/json" id="baseData">.*?</script>\n?', '', src, count=1, flags=re.S)
assert n == 1, 'baseData block not found'
assert 'id="baseData"' not in html, 'starter data is still in the page'


# 2) database address + publishable key. Real environment variables win (Netlify sets these); otherwise .env.
def load_env_file(path):
    vals = {}
    if os.path.exists(path):
        for line in open(path):
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals


env = load_env_file(os.path.join(here, '.env'))
url = (os.environ.get('DOWNTIME_SUPABASE_URL') or env.get('DOWNTIME_SUPABASE_URL') or '').rstrip('/')
key = os.environ.get('DOWNTIME_SUPABASE_KEY') or env.get('DOWNTIME_SUPABASE_KEY') or ''
if key.startswith('sb_secret_') or 'service_role' in key:
    raise SystemExit('DOWNTIME_SUPABASE_KEY is a SECRET key. Use the publishable key (sb_publishable_...) instead.')
if url or key:
    assert (url.startswith('https://') or re.match(r'http://(localhost|127\.0\.0\.1)(:\d+)?$', url)) and len(key) > 20, \
        'set both DOWNTIME_SUPABASE_URL (https://...) and DOWNTIME_SUPABASE_KEY'
    html = html.replace('<script type="application/json" id="cloudConfig">{}</script>',
                        '<script type="application/json" id="cloudConfig">' + json.dumps({'url': url, 'key': key}) + '</script>', 1)
    print('baked database config for', url)
elif os.environ.get('NETLIFY') == 'true' or os.environ.get('DOWNTIME_REQUIRE_CONFIG') == '1':
    raise SystemExit('Missing DOWNTIME_SUPABASE_URL and DOWNTIME_SUPABASE_KEY. In Netlify: Site configuration > '
                     'Environment variables, add both, then Deploys > Trigger deploy.')
else:
    print('no DOWNTIME_SUPABASE_URL / DOWNTIME_SUPABASE_KEY: the shop will say it is not connected yet')

# 3) head tags
head = '''<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#20302B">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Downtime">
<meta name="description" content="Downtime: custom goods, one-offs, and resale finds. Goods by SB.co.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">'''
html = html.replace('<meta name="viewport" content="width=device-width, initial-scale=1">', head, 1)
assert 'manifest.webmanifest' in html
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(html)

# 4) manifest
manifest = {
    "name": "Downtime", "short_name": "Downtime",
    "description": "Custom goods, one-offs, and resale finds. Goods by SB.co.",
    "start_url": "./", "scope": "./", "display": "standalone", "orientation": "portrait",
    "background_color": "#E9ECE3", "theme_color": "#20302B",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
    ]
}
json.dump(manifest, open(os.path.join(out, 'manifest.webmanifest'), 'w'), indent=2)

# 5) service worker: the app's own files work offline; the cache name follows the page so updates roll out.
#    Photos and the database are never cached here (always fresh from Supabase).
ver = hashlib.sha1(html.encode()).hexdigest()[:10]
sw = f"""// Downtime offline helper. The cache version changes whenever index.html changes.
const CACHE='downtime-{ver}';
const FILES=['./','./index.html','./manifest.webmanifest','./fonts/wordmark.woff2','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))}});
self.addEventListener('activate',e=>{{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))}});
self.addEventListener('fetch',e=>{{
  const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==location.origin||u.pathname.endsWith('/version.json'))return;
  if(r.mode==='navigate'){{
    // network first so updates arrive; the saved copy when offline
    e.respondWith(fetch(r).then(res=>{{const cp=res.clone();caches.open(CACHE).then(c=>c.put('./index.html',cp));return res}}).catch(()=>caches.match('./index.html')));
    return;
  }}
  e.respondWith(caches.match(r).then(hit=>hit||fetch(r)));
}});
"""
open(os.path.join(out, 'sw.js'), 'w').write(sw)

# 6) what's deployed (version.json). Netlify sets COMMIT_REF, BRANCH and CONTEXT during its builds.
app_ver = re.search(r"const VERSION='([^']+)'", src).group(1)
commit = os.environ.get('COMMIT_REF', '')
if not commit:
    try:
        commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=here, capture_output=True, text=True).stdout.strip()
    except Exception:
        commit = ''
json.dump({'version': app_ver, 'commit': commit, 'branch': os.environ.get('BRANCH', ''), 'context': os.environ.get('CONTEXT', ''),
           'built_at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')},
          open(os.path.join(out, 'version.json'), 'w'))

# 7) security headers (Netlify reads pwa/_headers). Only Downtime's own inline script may run, allowed
#    by its SHA-256 hash, so an injected script can't run even if one got into the page.
hashes = ["'sha256-" + base64.b64encode(hashlib.sha256(m.group('body').encode()).digest()).decode() + "'"
          for m in re.finditer(r'<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>', html, flags=re.S)
          if 'application/json' not in m.group('attrs') and 'src=' not in m.group('attrs')]
assert len(hashes) == 1, 'expected exactly one inline script, found %d' % len(hashes)
db = url if url else 'https://*.supabase.co'
csp = '; '.join([
    "default-src 'self'",
    "script-src 'self' " + ' '.join(hashes),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: " + db,
    "font-src 'self'",
    "connect-src 'self' " + db,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
] + (["upgrade-insecure-requests"] if not url.startswith('http://') else []))
headers = f'''# Generated by build_pwa.py. Netlify applies these to every response.
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=31536000
  Content-Security-Policy: {csp}

/
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/sw.js
  Cache-Control: no-cache

/version.json
  Cache-Control: no-cache
'''
open(os.path.join(out, '_headers'), 'w').write(headers)
print('wrote security headers (connect-src ' + db + ')')
print('built pwa/ v' + app_ver + ' with cache', ver)
