# Generates the v3 ambient layers: photographic window light on paper (light), a dim light pool on graphite (dark), a paper grain tile.
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import random, math
random.seed(7)
O='/workspace/work/v3-front/assets/v3/img/'
W,H=1600,1000
def light():
    base=Image.new("RGB",(W,H),(239,237,232))
    # warm sun patch: a skewed window rectangle of light, mullions as shadow, leaf shadows
    lm=Image.new('L',(W,H),0); d=ImageDraw.Draw(lm)
    poly=[(520,-80),(1720,-80),(1500,1080),(180,1080)]
    d.polygon(poly,fill=255)
    # mullions (shadow bars) skewed
    for x0 in (900,1290):
        d.polygon([(x0,-80),(x0+46,-80),(x0-180+46,1080),(x0-180,1080)],fill=0)
    d.polygon([(400,430),(1700,430),(1690,470),(390,470)],fill=0)
    # leaves shadow blobs
    for _ in range(70):
        cx=random.randint(900,1650); cy=random.randint(-40,560); r=random.randint(14,46); a=random.random()*math.pi
        pts=[(cx+math.cos(a+t)*r*(1.0 if i%2==0 else .38), cy+math.sin(a+t)*r*(1.0 if i%2==0 else .38)) for i,t in enumerate([k*math.pi/2 for k in range(4)])]
        d.polygon(pts,fill=0)
    for _ in range(14):
        x=random.randint(950,1650); y=random.randint(-40,420); d.line([(x,y),(x+random.randint(-160,60),y+random.randint(80,240))],fill=0,width=5)
    lm=lm.filter(ImageFilter.GaussianBlur(14))
    lv=Image.new('L',(W,H),0); dl=ImageDraw.Draw(lv)
    for _ in range(160):
        cx=random.randint(1000,1700); cy=random.randint(-60,620); r=random.randint(18,58); a=random.random()*math.pi
        dl.ellipse([cx-r,cy-r*.42,cx+r,cy+r*.42],fill=255)
    for _ in range(18):
        x=random.randint(1000,1700); y=random.randint(-40,460); dl.line([(x,y),(x+random.randint(-220,40),y+random.randint(120,300))],fill=255,width=7)
    lv=lv.rotate(-28,center=(1350,250)).filter(ImageFilter.GaussianBlur(9))
    lm=ImageChops.subtract(lm,lv.point(lambda v:int(v*.8)))
    fall=Image.linear_gradient('L').rotate(-145,expand=False).resize((W,H)).point(lambda v:int(70+v*.73))
    lm=ImageChops.multiply(lm,fall)
    global MASK; MASK=lm
    warm=Image.new('RGB',(W,H),(255,250,238))
    img=Image.composite(warm,base,lm.point(lambda v:int(v*.95)))
    # overall vignette, cooler shade far left
    sh=Image.new('L',(W,H),0); ds=ImageDraw.Draw(sh); ds.ellipse([-700,200,700,1500],fill=255); sh=sh.filter(ImageFilter.GaussianBlur(180))
    img=Image.composite(Image.new('RGB',(W,H),(229,229,227)),img,sh.point(lambda v:int(v*.5)))
    return img
def dark():
    base=Image.new('RGB',(W,H),(5,5,6))
    base=Image.composite(Image.new('RGB',(W,H),(30,31,36)),base,MASK.point(lambda v:int(v*.8)))
    m=Image.new('L',(W,H),0); d=ImageDraw.Draw(m)
    d.ellipse([820,-300,1900,700],fill=255); m=m.filter(ImageFilter.GaussianBlur(200))
    img=Image.composite(Image.new('RGB',(W,H),(40,33,27)),base,m.point(lambda v:int(v*.45)))
    m2=Image.new('L',(W,H),0); d2=ImageDraw.Draw(m2); d2.ellipse([-300,600,700,1400],fill=255); m2=m2.filter(ImageFilter.GaussianBlur(220))
    img=Image.composite(Image.new('RGB',(W,H),(20,28,38)),img,m2.point(lambda v:int(v*.6)))
    return img
def grain(img,amt):
    n=Image.effect_noise((W,H),40).convert('L'); n=n.point(lambda v:128+int((v-128)*amt))
    return Image.blend(img,Image.merge('RGB',(n,n,n)),.035)
L=light(); grain(L,1).save(O+'amb-light.webp','WEBP',quality=58,method=6)
grain(dark(),1).save(O+'amb-dark.webp','WEBP',quality=72,method=6)
t=Image.effect_noise((128,128),60).convert('L')
a=t.point(lambda v:max(0,min(255,abs(v-128)*2)))
tile=Image.new('LA',(128,128)); tile.putdata([((0 if v<128 else 255),int(al*.10)) for v,al in zip(t.getdata(),a.getdata())])
tile.save(O+'grain.webp','WEBP',quality=40,method=6)
