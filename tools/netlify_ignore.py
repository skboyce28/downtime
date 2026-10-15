#!/usr/bin/env python3
"""Netlify's "ignore" step (see netlify.toml): decides whether a Git-triggered build may deploy.

Downtime deploys only commits whose tests passed. A push to main starts both the GitHub Actions tests
and a Netlify build; this script skips that build unless the commit's "test" job already passed.
When the tests pass, the workflow's deploy job calls a Netlify build hook, and Netlify never skips
hook builds (the hook builds the newest commit on main, which the workflow checks first).

Exit codes are Netlify's: 1 = go ahead and build, 0 = skip this build.
Needs only Python's standard library. GitHub's API is read without signing in (the repo is public).
"""
import json, os, re, sys, urllib.request

API = os.environ.get('DOWNTIME_GITHUB_API', 'https://api.github.com').rstrip('/')
BUILD, SKIP = 1, 0


def say(msg):
    print('[downtime] ' + msg, flush=True)


def main():
    commit = os.environ.get('COMMIT_REF', '')
    m = re.match(r'https://github\.com/([\w.-]+/[\w.-]+?)(?:\.git)?/?$', os.environ.get('REPOSITORY_URL', ''))
    repo = m.group(1) if m else os.environ.get('DOWNTIME_GITHUB_REPO', '')
    if os.environ.get('CONTEXT', 'production') != 'production':
        say('not a production deploy; building as usual')
        return BUILD
    if not commit or not repo:
        say('no commit or repository to check; building as usual')
        return BUILD
    url = f'{API}/repos/{repo}/commits/{commit}/check-runs?check_name=test&per_page=20'
    try:
        req = urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'downtime-netlify-ignore'})
        runs = json.load(urllib.request.urlopen(req, timeout=15)).get('check_runs', [])
    except Exception as e:  # GitHub unreachable or rate-limited: wait for the tests' build hook instead
        say(f'could not ask GitHub about {commit[:7]} ({e}); skipping, the tests will start the deploy when they pass')
        return SKIP
    if any(r.get('status') == 'completed' and r.get('conclusion') == 'success' for r in runs):
        say(f'tests passed for {commit[:7]}; building')
        return BUILD
    state = ', '.join(sorted({(r.get('conclusion') or r.get('status') or '?') for r in runs})) or 'not started'
    say(f'tests for {commit[:7]}: {state}; skipping, the deploy starts when they pass')
    return SKIP


if __name__ == '__main__':
    sys.exit(main())
