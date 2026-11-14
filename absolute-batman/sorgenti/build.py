"""Rigenera ../data.json dalle sorgenti.
cpg.json: ComicsPriceGuide [num, codice, sezione M/V/R/E, tipo, artista, negozio, ha_immagine]
bc.json:  Bleeding Cool {num: [[nome, percorso immagine wp-content/uploads], ...]} - per questi numeri sostituisce le exclusive CPG
extra.json: aggiunte manuali {num: [[nome, url immagine completo, gruppo D/R/E], ...]}
"""
import json,re,os
H=os.path.dirname(os.path.abspath(__file__))
L=lambda f,d: json.load(open(os.path.join(H,f))) if os.path.exists(os.path.join(H,f)) else d
cpg=L('cpg.json',[]); bc=L('bc.json',{}); extra=L('extra.json',{})
M="https://media.comicade.com/"
c26=[["26","Nick Dragotta","Principale","133863/conversions/media-libraryTx7dE3-thumb.jpg","D"],["26B","Cliff Chiang","Card Stock Cover","133862/conversions/media-libraryYevwnD-thumb.jpg","D"],["26C","JeeHyung Lee","Card Stock Cover","133865/conversions/media-libraryqPDmkI-thumb.jpg","D"],["26D","Chuma Hill","Card Stock Cover","133864/conversions/media-libraryIphBid-thumb.jpg","D"],["26E","Nick Dragotta","Foil Cover","","D"],["26-RI","Stephen Green","1:25 Ratio","133866/conversions/media-libraryfV4g1c-thumb.jpg","R"],["26G","DC Worlds Collide","Card Stock Cover","133885/conversions/media-libraryiSOEqn-thumb.jpg","D"]]
rows=[];have=set()
def slug(n,name): return f"{n}-"+re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-')[:70]
for n,code,id_,sec,sub,art,store,has in cpg:
    if sec=='E' and str(n) in bc: continue
    reprint=bool(re.search(r'-\d+(st|nd|rd|th)\b',code))
    g={'M':'D','R':'R','E':'E'}.get(sec,'P' if reprint else 'D')
    rows.append([n,code,g,sub,art,store,"https://www.comicspriceguide.com/image/piqqmt/"+id_]); have.add(n)
if 26 not in have:
    for code,art,sub,img,g in c26: rows.append([26,code,g,sub,art,'',(M+img) if img else ''])
for n,items in bc.items():
    for i,(name,img) in enumerate(items):
        rows.append([int(n),slug(n,name),'E','',name,'',("https://bleedingcool.com/wp-content/uploads/"+img) if img else ''])
for n,items in extra.items():
    for i,(name,img,g) in enumerate(items):
        rows.append([int(n),slug(n,name),g,'',name,'',img])
order={'D':0,'R':1,'E':2,'P':3}
rows.sort(key=lambda r:(r[0],order[r[2]]))
json.dump(rows,open(os.path.join(H,'..','data.json'),'w'),ensure_ascii=False,separators=(',',':'))
from collections import Counter
print(len(rows),dict(Counter(r[2] for r in rows)))
