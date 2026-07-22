# -*- coding: utf-8 -*-
import re, os, glob
from collections import defaultdict

src = r'c:\Users\Administrator\Desktop\try real\zip\newrepo\src'
parts = sorted(
    glob.glob(os.path.join(src, 'calls-core.part*.js')),
    key=lambda p: int(re.search(r'part(\d+)', p).group(1)),
)
names = [os.path.basename(p) for p in parts]
texts = [open(p, encoding='utf-8').read() for p in parts]

top_re = re.compile(
    r'^( {0,4})(function|const|let|var|class)\s+([A-Za-z_][\w]*)',
    re.M,
)

defs = {}
defs_by_part = defaultdict(list)
for i, text in enumerate(texts):
    for m in top_re.finditer(text):
        kind, name = m.group(2), m.group(3)
        if name not in defs:
            defs[name] = i
            defs_by_part[i].append((kind, name))

SKIP = {
    'try', 'catch', 'true', 'false', 'null', 'undefined', 'window', 'document',
    'console', 'Math', 'Date', 'Map', 'Set', 'Promise', 'Error', 'JSON', 'Object',
    'Array', 'String', 'Number', 'Boolean', 'RegExp', 'parseInt', 'parseFloat',
    'isNaN', 'encodeURIComponent', 'decodeURIComponent', 'setTimeout',
    'clearTimeout', 'setInterval', 'clearInterval', 'fetch', 'navigator',
    'localStorage', 'sessionStorage', 'URLSearchParams', 'CustomEvent',
    'BroadcastChannel', 'RTCPeerConnection', 'MediaStream', 'userId', 'token',
    'data', 'requestId', 'isValid', 'sessionData', 'now', 'container', 'existing',
    'colors', 'notification', 'closeBtn', 'messageKey', 'indicators', 'state',
    'overlay', 'incomingId', 'currentId', 'resolve', 'acceptBtn', 'rejectBtn',
    'endCallBtn', 'muteBtn', 'videoBtn', 'incomingModal', 'newCallModal',
    'callContainer', 'activeSession', 'activeToken', 'permCheck', 'verifyResult',
    'duration', 'status', 'serverCallId', 'localCallId',
}

cross_total = 0
cross_by_pair = defaultdict(int)
symbol_cross = {}

for sym, def_part in defs.items():
    if len(sym) < 3 or sym in SKIP:
        continue
    pat = re.compile(r'\b' + re.escape(sym) + r'\b')
    refs = []
    for j in range(def_part + 1, len(parts)):
        count = len(pat.findall(texts[j]))
        if count:
            refs.append((j, count))
            cross_total += count
            cross_by_pair[(def_part, j)] += count
    if refs:
        symbol_cross[sym] = (def_part, refs)

print('=== SUMMARY ===')
print('parts', len(parts))
print('top_level_symbols', len(defs))
print('cross_part_ref_occurrences', cross_total)
print('unique_cross_referenced_symbols', len(symbol_cross))

print('\n=== DEFS BY PART ===')
for i in range(len(parts)):
    print(f'\nPART{i} {names[i]} ({len(defs_by_part[i])} decls)')
    for kind, name in defs_by_part[i]:
        print(f'  {kind:8} {name}')

ranked = sorted(symbol_cross.items(), key=lambda kv: -sum(c for _, c in kv[1][1]))
print('\n=== TOP 50 CROSS-REFERENCED SYMBOLS ===')
for sym, (dp, refs) in ranked[:50]:
    total = sum(c for _, c in refs)
    refstr = ', '.join(f'p{j}:{c}' for j, c in refs)
    print(f'  {sym:30} def=p{dp} total={total:4} -> {refstr}')

print('\n=== CROSS REFS BY PART PAIR ===')
for (a, b), c in sorted(cross_by_pair.items()):
    print(f'  p{a}->p{b}: {c}')

print('\n=== PER-PART OUTGOING/INCOMING ===')
out_counts = defaultdict(int)
in_counts = defaultdict(int)
for (a, b), c in cross_by_pair.items():
    out_counts[a] += c
    in_counts[b] += c
for i in range(len(parts)):
    print(f'  p{i}: outgoing_refs_from_its_defs={out_counts[i]} incoming_refs_to_earlier={in_counts[i]}')

# window assignments that look like public API
print('\n=== WINDOW ASSIGNMENTS (public-ish) ===')
win_asg = re.compile(r'window\.([A-Za-z_][\w]*)\s*=')
for i, text in enumerate(texts):
    found = sorted(set(win_asg.findall(text)))
    if found:
        print(f'  p{i}: {", ".join(found)}')

# IIFE open/close
print('\n=== IIFE BOUNDARY SCAN ===')
for i, text in enumerate(texts):
    opens = len(re.findall(r'\(function\s*\(', text))
    closes = len(re.findall(r'\}\)\s*\(\s*\)\s*;?', text))
    print(f'  p{i}: (function( count={opens}  }})() count={closes}')
    if i == 0:
        m = re.search(r'\(function\s*\(\s*\)\s*\{', text)
        print(f'    first IIFE open at char {m.start() if m else None}')
    if i == 7:
        # show last 800 chars ascii-safe
        tail = texts[7][-800:].encode('ascii', 'replace').decode('ascii')
        print('    TAIL:')
        print(tail)

# callCore methods + late attachments
p7 = texts[7]
m = re.search(r'window\.callCore\s*=\s*\{', p7)
chunk = p7[m.end():]
stop = chunk.find('const ModuleCoreController')
chunk = chunk[:stop]
keys = []
seen = set()
for km in re.finditer(r'^\s{4,12}([A-Za-z_][A-Za-z0-9_]*)\s*:', chunk, re.M):
    k = km.group(1)
    if k not in seen:
        seen.add(k)
        keys.append(k)
print('\n=== window.callCore KEYS ===')
print(len(keys), 'keys')
print(', '.join(keys))

late = re.findall(r'window\.callCore\.([A-Za-z_][\w]*)\s*=', p7)
print('\n=== Late window.callCore.* attachments ===')
print(sorted(set(late)))

# CallHandlers keys
m2 = re.search(r'window\.CallHandlers\s*=\s*\{', texts[6])
if m2:
    ch = texts[6][m2.end(): m2.end()+4000]
    end = ch.find('};')
    ch = ch[:end]
    ch_keys = re.findall(r'([A-Za-z_][\w]*)\s*:', ch)
    print('\n=== window.CallHandlers keys ===')
    print(', '.join(dict.fromkeys(ch_keys)))

# Check import/export
print('\n=== import/export ===')
for i, text in enumerate(texts):
    im = len(re.findall(r'^\s*import\s', text, re.M))
    ex = len(re.findall(r'^\s*export\s', text, re.M))
    print(f'  p{i}: import={im} export={ex}')

# Also check module.exports
print('\n=== module.exports ===')
for i, text in enumerate(texts):
    if 'module.exports' in text:
        print(f'  p{i}: yes')
        for line in text.splitlines():
            if 'module.exports' in line:
                print('   ', line.strip()[:120])
