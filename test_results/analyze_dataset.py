import sys
import collections
import re
import sqlite3

# Force UTF-8 output
if hasattr(sys.stdout, 'buffer'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

conn = sqlite3.connect('backend/data/vectorstore/chroma.sqlite3')
cur = conn.cursor()

cur.execute('SELECT COUNT(*) FROM embeddings')
total = cur.fetchone()[0]
print(f'Total documents: {total}')

cur.execute('''
SELECT em.id, em.key, em.string_value
FROM embedding_metadata em
WHERE em.key IN ('domain', 'bis_division', 'title', 'standard_id', 'scope', 'status', 'year', 'revision', 'source', 'source_document', 'keywords', 'type_of_standard', 'amendment_no', 'date_of_publish', 'degree_of_equivalence')
''')
meta_by_id = collections.defaultdict(dict)
for eid, key, value in cur.fetchall():
    meta_by_id[eid][key] = value

print(f'Distinct embeddings with metadata: {len(meta_by_id)}')

domain_counts = collections.Counter()
for eid, meta in meta_by_id.items():
    d = meta.get('domain') or meta.get('bis_division') or 'unknown'
    domain_counts[d] += 1

print(f'Domain distribution ({len(domain_counts)} domains):')
for d, c in domain_counts.most_common():
    print(f'  {d}: {c}')

scope_count = sum(1 for m in meta_by_id.values() if m.get('scope'))
print(f'Records with scope: {scope_count} / {total}')

title_count = sum(1 for m in meta_by_id.values() if m.get('title'))
print(f'Records with title: {title_count} / {total}')

src_count = sum(1 for m in meta_by_id.values() if m.get('source'))
print(f'Records with source: {src_count} / {total}')

pdf_count = sum(1 for m in meta_by_id.values() if m.get('source_document'))
print(f'Records with source_document (PDF compendium): {pdf_count} / {total}')

kw_count = sum(1 for m in meta_by_id.values() if m.get('keywords'))
print(f'Records with keywords: {kw_count} / {total}')

st_count = sum(1 for m in meta_by_id.values() if m.get('status'))
print(f'Records with status: {st_count} / {total}')

yr_count = sum(1 for m in meta_by_id.values() if m.get('year'))
print(f'Records with year: {yr_count} / {total}')

rev_count = sum(1 for m in meta_by_id.values() if m.get('revision'))
print(f'Records with revision: {rev_count} / {total}')

type_count = sum(1 for m in meta_by_id.values() if m.get('type_of_standard'))
print(f'Records with type_of_standard: {type_count} / {total}')

amend_count = sum(1 for m in meta_by_id.values() if m.get('amendment_no'))
print(f'Records with amendment_no: {amend_count} / {total}')

date_count = sum(1 for m in meta_by_id.values() if m.get('date_of_publish'))
print(f'Records with date_of_publish: {date_count} / {total}')

doe_count = sum(1 for m in meta_by_id.values() if m.get('degree_of_equivalence'))
print(f'Records with degree_of_equivalence: {doe_count} / {total}')

bis_div_count = sum(1 for m in meta_by_id.values() if m.get('bis_division'))
print(f'Records with bis_division: {bis_div_count} / {total}')

sid_counts = collections.Counter()
for m in meta_by_id.values():
    sid = m.get('standard_id', '')
    if sid:
        sid_counts[sid] += 1

dups = {sid: c for sid, c in sid_counts.items() if c > 1}
print(f'Duplicate standard_ids: {len(dups)}')
if dups:
    for sid, c in list(dups.items())[:5]:
        print(f'  {sid}: {c}')

malformed = []
for m in meta_by_id.values():
    sid = m.get('standard_id', '')
    if sid and not re.match(r'^(IS|IS/ISO|IS/IEC|IS/IEEE|IS/ISO/IEC|IS/ISO/IEC/IEEE)[\s/\d\(\)PartSec:]+', sid, re.IGNORECASE):
        malformed.append(sid)
print(f'Malformed standard_ids: {len(malformed)}')
if malformed:
    for sid in malformed[:5]:
        print(f'  {sid}')

empty_title = sum(1 for m in meta_by_id.values() if not m.get('title'))
empty_scope = sum(1 for m in meta_by_id.values() if not m.get('scope'))
empty_domain = sum(1 for m in meta_by_id.values() if not (m.get('domain') or m.get('bis_division')))
empty_sid = sum(1 for m in meta_by_id.values() if not m.get('standard_id'))
print(f'Empty title: {empty_title} / {total}')
print(f'Empty scope: {empty_scope} / {total}')
print(f'Empty domain: {empty_domain} / {total}')
print(f'Empty standard_id: {empty_sid} / {total}')

src_counts = collections.Counter()
for m in meta_by_id.values():
    src = m.get('source', 'unknown')
    src_counts[src] += 1
print(f'Source distribution:')
for s, c in src_counts.most_common():
    print(f'  {s}: {c}')

conn.close()
print('Dataset analysis complete')