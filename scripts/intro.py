# Génère l'ouverture de l'app (index.html, entre les marqueurs INTRO) : une sortie se trace sur un plan de
# ville, la comète rose, les bornes kilométriques, les chiffres qui défilent, l'éclat de la boucle fermée,
# « Boucle », puis la plongée dans la carte (main.ts). Seulement opacité et transform pendant le chargement.
# Usage : python3 scripts/intro.py
import math, random, re

random.seed(7)
S = 1.5  # boucle de l'icône (repère 200 × 160) agrandie
P = [(36.9,124.4),[(4.4,100.0),(8.1,34.4),(53.8,16.9)],[(82.5,5.9),(97.5,27.5),(123.1,18.1)],[(151.9,7.5),(181.2,16.2),(187.5,50.6)],[(194.4,87.5),(168.1,103.8),(140.6,115.0)],[(113.8,125.9),(114.4,151.2),(79.4,151.9)],[(61.2,152.2),(48.1,143.1),(36.9,124.4)]]
pts = [P[0]]; cur = P[0]
for c in P[1:]:
    (x1,y1),(x2,y2),(x3,y3) = c; x0,y0 = cur
    for i in range(1,81):
        t=i/80; u=1-t
        pts.append((u**3*x0+3*u*u*t*x1+3*u*t*t*x2+t**3*x3, u**3*y0+3*u*u*t*y1+3*u*t*t*y2+t**3*y3))
    cur=(x3,y3)
pts=[(x*S,y*S) for x,y in pts]
W,H=300,240
L=[0]
for i in range(1,len(pts)): L.append(L[-1]+math.dist(pts[i-1],pts[i]))
T=L[-1]
def at(s):
    s=max(0,min(T,s))
    for i in range(1,len(L)):
        if L[i]>=s:
            k=(s-L[i-1])/((L[i]-L[i-1]) or 1)
            return (pts[i-1][0]+(pts[i][0]-pts[i-1][0])*k, pts[i-1][1]+(pts[i][1]-pts[i-1][1])*k)
    return pts[-1]

T0, T1 = 350, 2150          # tracé (ms)
ease = lambda x: -(math.cos(math.pi*x)-1)/2   # easeInOutSine
def when(frac):               # instant où le tracé atteint frac
    lo,hi=0.0,1.0
    for _ in range(40):
        m=(lo+hi)/2
        if ease(m)<frac: lo=m
        else: hi=m
    return T0+(T1-T0)*lo

N=40
segs=[]; seg_delay=[]
for j in range(N):
    a=T*j/N; b=T*(j+1)/N
    sp=[at(a+(b-a)*q/6) for q in range(7)]
    segs.append(' '.join(f'{x:.1f},{y:.1f}' for x,y in sp))
    seg_delay.append(round(when(j/N)))
full=' '.join(f'{x:.1f},{y:.1f}' for x,y in pts[::4]+[pts[-1]])

# comète : positions à intervalles de temps réguliers
K=60
comet=[]
for q in range(K+1):
    x,y=at(T*ease(q/K))
    comet.append(f'{q*100/K:.2f}% {{ transform: translate({x:.1f}px, {y:.1f}px); }}')

# bornes kilométriques (10,2 km)
marks=[]
for km in range(1,10):
    frac=km/10.2
    if km % 3: continue
    x,y=at(T*frac)
    marks.append((km,x,y,round(when(frac))))

# plan de ville : rues un peu de travers, quelques grands axes, un fleuve
streets=[]
for i in range(-6,7):
    x=400+i*62+random.uniform(-14,14); a=random.uniform(-0.18,0.18)
    streets.append((x-420*a,-20,x+420*a,820, 1.2 if i%3 else 2.4))
for i in range(-6,7):
    y=400+i*60+random.uniform(-14,14); a=random.uniform(-0.16,0.16)
    streets.append((-20,y-420*a,820,y+420*a, 1.2 if i%3 else 2.4))
for _ in range(10):
    x=random.uniform(80,720); y=random.uniform(80,720); l=random.uniform(60,140); a=random.uniform(0,math.pi)
    streets.append((x,y,x+l*math.cos(a),y+l*math.sin(a),1))
grid='\n'.join(f'            <line x1="{a:.0f}" y1="{b:.0f}" x2="{c:.0f}" y2="{d:.0f}" stroke-width="{w}" />' for a,b,c,d,w in streets)
river='M-40 610 C 120 560 220 640 360 590 S 600 520 840 560'

# chiffres qui défilent (colonnes 0-9 répétées, composées en transform)
def roll(value, start, dur, spins):
    out=[]
    digits=[c for c in value]
    nd=sum(c.isdigit() for c in digits); k=0
    for c in digits:
        if not c.isdigit():
            out.append(f'<span class="sep">{c}</span>'); continue
        k+=1
        rep=spins+(nd-k)  # les derniers chiffres tournent plus
        strip=''.join(f'<span>{d}</span>' for _ in range(rep) for d in '0123456789')+f'<span>{c}</span>'
        steps=rep*10
        out.append(f'<span class="col"><span class="strip" style="--to: -{steps}em; --d: {start}ms; --t: {dur}ms">{strip}</span></span>')
    return ''.join(out)

stats=[('Distance','10,2','km',2),('Temps','51:24','',1),('Dénivelé','128','m',1)]
stats_html='\n'.join(f'''          <div class="st" style="--i: {i}">
            <span class="sk">{k}</span>
            <span class="sv">{roll(v, 520+i*90, T1-420-i*90, sp)}{f'<small>{u}</small>' if u else ''}</span>
          </div>''' for i,(k,v,u,sp) in enumerate(stats))

sparks=[]
for i in range(12):
    a=i/12*2*math.pi+random.uniform(-0.15,0.15); r=random.uniform(46,78)
    sparks.append(f'<span class="sp" style="--x: {math.cos(a)*r:.0f}px; --y: {math.sin(a)*r:.0f}px; --s: {random.uniform(0.6,1.1):.2f}"></span>')
sx,sy=pts[0]
word=''.join(f'<span style="--i: {i}">{c}</span>' for i,c in enumerate('Boucle'))

css=f'''    <!-- INTRO (scripts/intro.py) -->
    <style>
      html {{ background: #090c0b; }}
      #intro {{ position: fixed; inset: 0; z-index: 1000; overflow: hidden; pointer-events: none; color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Rounded", "Segoe UI", Roboto, sans-serif; }}
      /* Le fond (ville de nuit) : plongée par le trou qui s'ouvre au centre de la boucle à la sortie. */
      #intro .bg {{ position: absolute; inset: -2%; background: radial-gradient(52% 40% at 50% 40%, rgba(255, 45, 85, 0.15), transparent 70%), radial-gradient(130% 95% at 50% 38%, #18211d 0%, #0b100e 60%, #060807 100%);
        transform-origin: 50% 40%; will-change: transform; }}
      #intro .city {{ position: absolute; left: 50%; top: 40%; width: max(820px, 130vmax); height: max(820px, 130vmax);
        margin: calc(max(410px, 65vmax) * -1) 0 0 calc(max(410px, 65vmax) * -1); opacity: 0;
        transform: perspective(900px) rotateX(46deg) scale(1.05); will-change: transform, opacity;
        animation: ib-fade 900ms ease-out 60ms forwards, ib-dolly 5s cubic-bezier(0.25, 0.1, 0.25, 1) forwards; }}
      #intro .city line {{ stroke: rgba(255, 255, 255, 0.075); }}
      #intro .city .river {{ fill: none; stroke: rgba(70, 130, 160, 0.22); stroke-width: 26; stroke-linecap: round; }}
      #intro .stage {{ position: absolute; left: 50%; top: 40%; width: {W}px; height: {H}px; margin: -{H//2}px 0 0 -{W//2}px; will-change: transform, opacity; }}
      #intro .stage > svg {{ position: absolute; inset: 0; overflow: visible; }}
      #intro .glow {{ opacity: 0; animation: ib-fade 1200ms ease-out 900ms forwards; }}
      #intro .glow polyline {{ fill: none; stroke: #ff2d55; stroke-width: 22; stroke-linejoin: round; filter: blur(12px); opacity: 0.32; }}
      #intro .sg {{ opacity: 0; animation: ib-fade 160ms linear forwards; animation-delay: var(--d); will-change: opacity; }}
      #intro .sg polyline {{ fill: none; stroke: #ff3b62; stroke-width: 7.5; stroke-linecap: round; stroke-linejoin: round; }}
      #intro .start {{ position: absolute; left: {sx:.1f}px; top: {sy:.1f}px; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: #fff;
        box-shadow: inset 0 0 0 6px #ff2d55, 0 6px 18px -4px rgba(0, 0, 0, 0.6); animation: ib-pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) 180ms both; will-change: transform; }}
      #intro .comet {{ position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0; will-change: transform, opacity;
        animation: ib-comet {T1-T0}ms linear {T0}ms both, ib-in 120ms linear {T0}ms forwards, ib-out 260ms ease-in {T1-40}ms forwards; }}
      #intro .comet::before {{ content: ""; position: absolute; left: -26px; top: -26px; width: 52px; height: 52px; border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 90, 120, 0.75) 0%, rgba(255, 45, 85, 0.25) 40%, transparent 70%); }}
      #intro .comet::after {{ content: ""; position: absolute; left: -7px; top: -7px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 0 12px 3px #fff; }}
      #intro .km {{ position: absolute; width: 0; height: 0; }}
      #intro .km b {{ position: absolute; left: -13px; top: -13px; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
        font-size: 12px; font-weight: 800; color: #ff2d55; background: #fff; box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.5);
        animation: ib-pop 460ms cubic-bezier(0.34, 1.7, 0.64, 1) var(--d) both; will-change: transform; }}
      #intro .ring {{ position: absolute; left: {sx:.1f}px; top: {sy:.1f}px; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%;
        border: 3px solid #ff3b62; opacity: 0; transform: scale(0.15); animation: ib-ring 900ms cubic-bezier(0.16, 1, 0.3, 1) {T1}ms forwards; will-change: transform, opacity; }}
      #intro .sp {{ position: absolute; left: {sx:.1f}px; top: {sy:.1f}px; width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px; border-radius: 50%; background: #ffd1db; opacity: 0;
        animation: ib-spark 820ms cubic-bezier(0.16, 1, 0.3, 1) {T1+20}ms forwards; will-change: transform, opacity; }}
      #intro .stats {{ position: absolute; left: 50%; top: calc(40% + {H//2 + 34}px); width: min(360px, calc(100vw - 32px)); translate: -50% 0;
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; will-change: transform, opacity; }}
      #intro .st {{ display: grid; gap: 4px; justify-items: center; opacity: 0; transform: translateY(14px);
        animation: ib-rise 640ms cubic-bezier(0.16, 1, 0.3, 1) calc(420ms + var(--i) * 90ms) forwards; }}
      #intro .sk {{ font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255, 255, 255, 0.55); }}
      #intro .sv {{ display: inline-flex; align-items: baseline; font-size: 30px; font-weight: 800; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; line-height: 1; }}
      #intro .sv small {{ margin-left: 3px; font-size: 14px; font-weight: 700; color: rgba(255, 255, 255, 0.6); }}
      #intro .col {{ display: inline-block; height: 1.1em; padding: 0.05em 0; margin: -0.05em 0; overflow: hidden;
        -webkit-mask: linear-gradient(transparent, #000 10%, #000 90%, transparent); mask: linear-gradient(transparent, #000 10%, #000 90%, transparent); }}
      #intro .strip {{ display: flex; flex-direction: column; will-change: transform; animation: ib-roll var(--t) cubic-bezier(0.22, 0.61, 0.36, 1) var(--d) both; }}
      #intro .strip span {{ display: block; height: 1em; line-height: 1; }}
      #intro .word {{ position: absolute; left: 0; right: 0; top: calc(40% - {H//2 + 74}px); margin: 0; display: flex; justify-content: center;
        font-size: 40px; font-weight: 800; letter-spacing: -0.04em; will-change: transform, opacity; }}
      #intro .word span {{ display: inline-block; opacity: 0; transform: translateY(22px) scale(0.9);
        animation: ib-letter 720ms cubic-bezier(0.34, 1.4, 0.64, 1) calc({T1+120}ms + var(--i) * 45ms) forwards; }}
      /* Sortie : plongée dans la boucle vers la carte. */
      #intro.out .bg {{ -webkit-mask: radial-gradient(circle at 50% 40%, transparent 0 22px, #000 23px); mask: radial-gradient(circle at 50% 40%, transparent 0 22px, #000 23px);
        animation: ib-dive 1000ms cubic-bezier(0.6, 0, 0.8, 0.4) forwards; }}
      #intro.out .city {{ animation: ib-out 500ms ease-in forwards; }}
      #intro.out .stage {{ animation: ib-push 900ms cubic-bezier(0.55, 0, 0.75, 0.2) forwards; }}
      #intro.out .stats, #intro.out .word {{ animation: ib-sink 520ms cubic-bezier(0.4, 0, 1, 1) forwards; }}
      @keyframes ib-fade {{ to {{ opacity: 1; }} }}
      @keyframes ib-in {{ to {{ opacity: 1; }} }}
      @keyframes ib-out {{ to {{ opacity: 0; }} }}
      @keyframes ib-pop {{ from {{ transform: scale(0); }} }}
      @keyframes ib-rise {{ to {{ opacity: 1; transform: none; }} }}
      @keyframes ib-letter {{ to {{ opacity: 1; transform: none; }} }}
      @keyframes ib-roll {{ from {{ transform: translateY(0); }} to {{ transform: translateY(var(--to)); }} }}
      @keyframes ib-dolly {{ to {{ transform: perspective(900px) rotateX(46deg) scale(1.22); }} }}
      @keyframes ib-ring {{ 0% {{ opacity: 1; transform: scale(0.15); }} 100% {{ opacity: 0; transform: scale(2.4); }} }}
      @keyframes ib-spark {{ 0% {{ opacity: 1; transform: translate(0, 0) scale(var(--s)); }} 100% {{ opacity: 0; transform: translate(var(--x), var(--y)) scale(0.2); }} }}
      @keyframes ib-dive {{ to {{ transform: scale(42); }} }}
      @keyframes ib-push {{ to {{ transform: scale(3.6); opacity: 0; }} }}
      @keyframes ib-sink {{ to {{ transform: translateY(26px); opacity: 0; }} }}
      @keyframes ib-comet {{ {' '.join(comet)} }}
      @media (prefers-reduced-motion: reduce) {{
        #intro *, #intro *::before, #intro *::after {{ animation-duration: 1ms !important; animation-delay: 0ms !important; }}
        #intro .comet, #intro .ring, #intro .sp {{ display: none; }}
        #intro.out .bg, #intro.out .stage, #intro.out .city, #intro.out .stats, #intro.out .word {{ animation: ib-out 300ms ease forwards !important; -webkit-mask: none; mask: none; }}
      }}
    </style>
    <!-- /INTRO -->
'''
segsvg='\n'.join(f'          <svg class="sg" style="--d: {d}ms" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><polyline points="{p}" /></svg>' for p,d in zip(segs,seg_delay))
marks_html='\n'.join(f'          <span class="km" style="left: {x:.1f}px; top: {y:.1f}px; --d: {d}ms"><b>{k}</b></span>' for k,x,y,d in marks)
body=f'''    <!-- INTRO-BODY (scripts/intro.py) -->
    <div id="intro" aria-hidden="true">
      <div class="bg">
        <svg class="city" viewBox="0 0 800 800" width="820" height="820">
          <path class="river" d="{river}" />
{grid}
        </svg>
      </div>
      <p class="word">{word}</p>
      <div class="stage">
        <svg class="glow" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><polyline points="{full}" /></svg>
{segsvg}
{marks_html}
        <span class="start"></span>
        <span class="ring"></span>
        {''.join(sparks)}
        <span class="comet"></span>
      </div>
      <div class="stats">
{stats_html}
      </div>
    </div>
    <!-- /INTRO-BODY -->
'''
s=open('index.html').read()
# Ancienne ouverture (sans marqueurs) : on la remplace une fois, puis entre les marqueurs.
if '<!-- INTRO (scripts/intro.py) -->' in s:
    s=re.sub(r'    <!-- INTRO \(scripts/intro.py\) -->.*?<!-- /INTRO -->\n', lambda m: css, s, flags=re.S)
    s=re.sub(r'    <!-- INTRO-BODY \(scripts/intro.py\) -->.*?<!-- /INTRO-BODY -->\n', lambda m: body, s, flags=re.S)
else:
    i0=s.index('    <!--\n      Ouverture'); i1=s.index('    </style>\n',i0)+len('    </style>\n')
    s=s[:i0]+css+s[i1:]
    j0=s.index('    <div id="intro"'); end='        <p class="word">Boucle</p>\n      </div>\n    </div>\n'
    j1=s.index(end,j0)+len(end)
    s=s[:j0]+body+s[j1:]
open('index.html','w').write(s)
print('ouverture :', len(css)+len(body), 'octets ; tracé', T0, '→', T1, 'ms')
