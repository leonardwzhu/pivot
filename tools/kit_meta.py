# Read each pixel-art kit and decide where the number goes and what colors it uses, from the art itself:
# the number color is the chest wordmark's main color, its outline the color bordering it, and it sits in the first
# clear space below the wordmark (pinstripe columns count as background). Usage: python3 tools/kit_meta.py <dir of TEAM.png>
import sys,json,os
from PIL import Image
from collections import Counter
D=sys.argv[1];out={}
dist=lambda a,b:sum((x-y)**2 for x,y in zip(a[:3],b[:3]))**.5
def lum(c):
    f=lambda v:(v/255)/12.92 if v/255<=.03928 else ((v/255+.055)/1.055)**2.4
    return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2])
con=lambda a,b:(max(lum(a),lum(b))+.05)/(min(lum(a),lum(b))+.05)
hexc=lambda c:'%02X%02X%02X'%c[:3]
for fn in sorted(os.listdir(D)):
    if not fn.endswith('.png'):continue
    k=fn[:-4];im=Image.open(os.path.join(D,fn)).convert('RGBA');W,H=im.size;px=im.load()
    op=lambda x,y:px[x,y][3]>200
    base=Counter(px[x,y][:3] for x in range(12,27) for y in range(14,58) if op(x,y)).most_common(1)[0][0]
    mark=lambda x,y:op(x,y) and dist(px[x,y],base)>55
    body=[y for y in range(10,H) if op(19,y)]
    stripe={x for x in range(W) if sum(mark(x,y) for y in body)>.55*len(body)}   # pinstripes / side trim
    cols=[x for x in range(13,26) if x not in stripe]   # chest center: away from the swoosh and NBA marks near the shoulders
    rowmarks=[sum(mark(x,y) for x in cols) for y in range(H)]
    # chest wordmark: the first band of marked rows below the collar (the collar ends where the center column turns base color)
    y=0
    while y<H and not(op(19,y) and dist(px[19,y],base)<=55):y+=1
    y+=1
    while y<H and rowmarks[y]<3:y+=1
    top=y
    while y<H and rowmarks[y]>=2:y+=1
    bot=y-1
    wm=[px[x,yy][:3] for yy in range(top,bot+1) for x in cols if mark(x,yy)]
    cnt=Counter(wm).most_common()
    # number color: of the wordmark's main colors (each at least 15% of its pixels), the one that stands out most from the jersey
    tot=sum(n for _,n in cnt) or 1;main=[c for c,n in cnt if n>=.15*tot] or [c for c,_ in cnt[:1]] or [(255,255,255)]
    fill=max(main,key=lambda c:con(c,base))
    # outline: the most common other color touching the main color
    nb=Counter()
    for yy in range(top,bot+1):
        for x in cols:
            if px[x,yy][:3]!=fill:continue
            for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
                q=(x+dx,yy+dy)
                if 0<=q[0]<W and 0<=q[1]<H and op(*q):
                    c=px[q][:3]
                    if c!=fill and dist(c,fill)>60:nb[c]+=1
    line=nb.most_common(1)[0][0] if nb else base
    if con(fill,base)<1.6 and con(line,base)>con(fill,base):fill,line=line,fill
    # placement: first clear 15x9 box (two digits plus outline) at or below the wordmark, centered or nudged sideways
    def clear(x0,y0,w=15,h=9):
        return all(op(x,yy) and (x in stripe or not mark(x,yy)) for yy in range(y0,y0+h) for x in range(x0,x0+w))
    spot=None
    for y0 in range(max(bot+2,18),H-10):
        for dx in (0,-2,2,-4,4,-6,6):
            x0=12+dx
            if clear(x0,y0):spot=(x0,y0);break
        if spot:break
    out[k]=dict(y=spot[1]+1 if spot else 32,cx=(spot[0]+7.5) if spot else 19,f=hexc(fill),o=hexc(line),b=hexc(base),wm=[top,bot])
json.dump(out,sys.stdout,separators=(',',':'))
