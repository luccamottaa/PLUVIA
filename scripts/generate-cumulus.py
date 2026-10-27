"""Gera sky-cloud-cumulus.webp: banco de cúmulos com volume para o céu da noite (nublado, chuva, trovoada).

Pedido do usuário (outubro/2026, 1.31.1): "as da Apple parecem 3D enquanto as nossas parecem 2D". Em vez de um
campo de ruído com sombreado chapado (generate-soft-clouds.py), cada nuvem é um aglomerado de bolhas iluminadas
como esferas (luz de cima, à esquerda), desenhadas de trás para a frente: as mais altas primeiro e as mais baixas
por cima, com a base plana e mais escura. O contorno das bolhas é perturbado por ruído periódico (borda fofa) e
tudo dá a volta em x (a camada desliza em repeat-x). Semente fixa: a mesma arte a cada execução.

  python3 scripts/generate-cumulus.py dist/assets/sky-cloud-cumulus.webp
"""
import importlib.util, os, sys
import numpy as np
from PIL import Image
spec = importlib.util.spec_from_file_location('soft', os.path.join(os.path.dirname(__file__), 'generate-soft-clouds.py'))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
if len(sys.argv) != 2: sys.exit(__doc__)
out = sys.argv[1]
W, H, seed = 3984, 1328, 7   # 3:1, múltiplo de 16 (emenda do WebP), 1:1 com a tela do iPhone como as outras
g.set_size(W, H)
rng=np.random.default_rng(seed); k=H/704
C=np.zeros((H,W),np.float32)   # premultiplied light
A=np.zeros((H,W),np.float32)
noise=g.spectral_noise(rng,3.3,1.4); noise2=g.spectral_noise(rng,2.6,1.1)
L=np.array([-.4,-.8,.45]);L/=np.linalg.norm(L)
puffs=[]
n=8
for i in range(n):
    cx=(i+rng.uniform(.2,.8))*W/n; base=H*rng.uniform(.5,.72); width=W/n*rng.uniform(.95,1.3)
    hgt=rng.uniform(.13,.22)
    for j in range(int(rng.integers(70,95))):
        u=rng.uniform(-1,1)
        x=cx+u*width*.5
        top=(1-u*u)**1.2                        # low wide dome
        y=base-rng.uniform(0,1)**1.6*top*H*hgt
        r=H*rng.uniform(.028,.064)*(.7+.5*top)
        y=min(y,base-r*.35)                     # flat base
        puffs.append((y,x,r))
puffs.sort()   # higher puffs first; lower ones painted in front
for y,x,r in puffs:
    R=int(r*1.6); x0,x1=int(x-R),int(x+R); y0,y1=max(0,int(y-R)),min(H,int(y+R))
    if y1<=y0: continue
    xi=np.arange(x0,x1)%W
    yy=(np.arange(y0,y1)[:,None]-y)/r; xx=(np.arange(x0,x1)[None,:]-x)/r
    d=np.sqrt(xx*xx+yy*yy)
    d=d*(1+.18*noise[y0:y1][:,xi]+.08*noise2[y0:y1][:,xi])  # fluffy, irregular outline
    a=np.clip(1-g.smoothstep(.72,1.12,d),0,1)
    z=np.sqrt(np.clip(1-np.minimum(d,1)**2,0,1))
    diff=np.clip(-xx*L[0]*0+(xx*L[0]+yy*L[1]+z*L[2])/np.maximum(1e-3,np.sqrt(xx*xx+yy*yy+z*z)),0,1)
    vert=np.clip(1-(y/H-.3)*1.1,.45,1)          # lower in the sky = more in the shade of the cloud above
    shade=(.38+.62*diff)*vert
    Cs=C[y0:y1][:,xi]; As=A[y0:y1][:,xi]
    C[y0:y1][:,xi]=Cs*(1-a)+shade*a
    A[y0:y1][:,xi]=As+a*(1-As)
light=np.where(A>1e-4,C/np.maximum(A,1e-4),1)
light=g.blur(light,3.2*k); A=g.blur(A,1.8*k)
bright=np.array([255,255,255],np.float32); shadow=np.array([96,106,132],np.float32)
rgb=shadow+(bright-shadow)*np.clip(light,0,1)[...,None]
im=Image.fromarray(np.dstack([rgb,np.clip(A,0,1)*255]).round().clip(0,255).astype(np.uint8),'RGBA')
im.save(out,'WEBP',quality=80,method=6,alpha_quality=100)
print(out, os.path.getsize(out)//1024, 'KiB')
