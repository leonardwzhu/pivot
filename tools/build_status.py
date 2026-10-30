# When each source was last fetched fresh, so the page can say how old its data is and flag a source stuck on its last good copy.
# Reads refresh.sh's status lines ("stats: fresh", "FantasyPros: last good") on stdin; writes <dir>/p2_build.js and work/sources.json.
# Usage: printf '%s\n' "${STATUS[@]}" | python3 -P tools/build_status.py daily|injuries [work|last]
import sys,json,os,datetime as D
mode=sys.argv[1];out=sys.argv[2] if len(sys.argv)>2 else 'work'
now=D.datetime.now(D.UTC).strftime('%Y-%m-%dT%H:%MZ')
try:src=json.load(open('last/sources.json'))
except Exception:src={}
for l in sys.stdin.read().splitlines():
  k,_,v=l.partition(': ')
  if v.strip()=='fresh':src[k]=now
json.dump(src,open('work/sources.json','w'))
open(f'{out}/p2_build.js','w').write('// Build time and when each source was last fetched fresh (tools/build_status.py)\nconst BUILD='+json.dumps(dict(at=now,mode=mode,src=src),separators=(',',':'))+';\n')
print('sources',', '.join(f'{k} {v}' for k,v in sorted(src.items())))
