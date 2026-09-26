import json
import time
import sys
sys.path.insert(0, '.')
import urllib.request
import urllib.error

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

host = 'http://localhost:8000'

def req(method, path, body=None, content_type='application/json'):
    if isinstance(body, (dict, list)):
        data = json.dumps(body).encode()
    elif isinstance(body, str):
        data = body.encode()
    else:
        data = body
    headers = {'Content-Type': content_type} if data else {}
    r = urllib.request.Request(host + path, data=data, headers=headers, method=method)
    t0 = time.time()
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            code = resp.getcode()
            text = resp.read().decode('utf-8', errors='replace')
        err = None
    except urllib.error.HTTPError as e:
        code = e.code
        text = e.read().decode('utf-8', errors='replace')
        err = text
    except Exception as e:
        code = 0
        text = str(e)
        err = str(e)
    lat = round(time.time() - t0, 3)
    return code, text[:300], lat, err

print('=== API ENDPOINT TESTS ===')
endpoints = [
    ('GET', '/health', None),
    ('GET', '/api/metadata', None),
    ('POST', '/api/discover', {"description": "ordinary portland cement"}),
    ('POST', '/api/insights', {"question": "What is IS 269 used for?", "product_description": "cement construction", "recommendations": [{"standard_id":"IS 269:2015","title":"Ordinary Portland Cement","domain":"Construction"}]}),
]

for method, path, body in endpoints:
    print(f"\n{method} {path}")
    c, t, la, err = req(method, path, body)
    has_json = 'recommendations' in t or 'system' in t or 'status' in t or 'results' in t
    print(f"  HTTP {c} in {la}s | has_json={has_json} | len={len(t)}")

print()
print('=== NEGATIVE QUERY TESTS ===')
neg_queries = [
    'quantum computing hardware',
    'movie recommendations for friday',
    'weather forecast tomorrow',
    'recipe for chicken biryani',
    'best gaming laptop under 50000',
]
for q in neg_queries:
    c, t, la, err = req('POST', '/api/discover', {"description": q})
    recs = []
    try:
        data = json.loads(t)
        recs = data.get('recommendations', [])
    except:
        pass
    print(f"  '...{q[-25:]}' -> HTTP {c} | {len(recs)} recs | scores={['{:.2f}'.format(r.get('similarity_score', 0)) for r in recs]}")

print()
print('=== SPECIAL CHARACTER TESTS ===')
special = [
    'IS 269:2015 specification check',
    'ordinary portland cement OPC - 43 Grade',
    'PVC cable / wire 1100V (Part 1)',
    'steel bars 1/2 inch Fe500',
]
for q in special:
    c, t, la, err = req('POST', '/api/discover', {"description": q})
    try:
        data = json.loads(t)
        recs = data.get('recommendations', [])
        ids = [r.get('standard_id', '?') for r in recs]
    except:
        ids = []
    print(f"  '{q[:35]}...' -> HTTP {c} | ids={ids}")

print()
print('=== EMPTY / INVALID INPUTS ===')
empty_tests = [
    ("POST", "/api/discover", {"description": ""}),
    ("POST", "/api/discover", {"description": "   "}),
]
for method, path, body in empty_tests:
    c, t, la, err = req(method, path, body)
    print(f"  {method} {path} body={str(body)} -> HTTP {c}")
