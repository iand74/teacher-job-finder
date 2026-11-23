"""Send a push notification to the iPhone when jobs.json gains new jobs.
Run by .github/workflows/notify.yml. Needs repo secrets PUSH_SUBSCRIPTION and VAPID_PRIVATE_KEY."""
import json, os, subprocess, sys
from datetime import datetime, timezone

def load(ref):
    try:
        raw = subprocess.check_output(["git", "show", f"{ref}:jobs.json"], text=True)
        return json.loads(raw).get("jobs", [])
    except Exception:
        return []

def open_jobs(jobs):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    out = []
    for j in jobs:
        try:
            if datetime.fromisoformat(j["closes"]) < now:
                continue
        except Exception:
            pass
        out.append(j)
    return out

test = os.environ.get("TEST") == "true"
new_jobs = open_jobs(load("HEAD"))
old_ids = {j.get("url") for j in load("HEAD~1")}
added = [j for j in new_jobs if j.get("url") not in old_ids]

if test:
    payload = {"title": "Teacher Jobs test", "body": "Job alerts are working.", "count": 1, "ids": []}
elif not added:
    print("No new jobs, nothing to send."); sys.exit(0)
else:
    ft = [j for j in added if j.get("pattern") == "Full time"]
    n = len(added)
    body = "; ".join(f"{j['title']} – {j['school']}" for j in (ft + [j for j in added if j not in ft])[:3])
    payload = {"title": f"{n} new teacher job{'s' if n != 1 else ''}" + (f" ({len(ft)} full time)" if ft else ""),
               "body": body, "count": n, "ids": [j.get("url") for j in new_jobs]}
    if len(json.dumps(payload)) > 3000:
        payload["ids"] = []

sub = os.environ.get("PUSH_SUBSCRIPTION", "").strip()
key = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
if not sub or not key:
    print("Secrets PUSH_SUBSCRIPTION / VAPID_PRIVATE_KEY not set yet; skipping."); sys.exit(0)

from pywebpush import webpush, WebPushException
try:
    webpush(subscription_info=json.loads(sub), data=json.dumps(payload), vapid_private_key=key,
            vapid_claims={"sub": "https://iand74.github.io/teacher-job-finder/"}, ttl=86400)
    print("Sent:", payload["title"])
except WebPushException as e:
    print("Push failed:", e, getattr(e, "response", None) and e.response.text); sys.exit(1)
