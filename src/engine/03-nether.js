    window.wgpuDimension='overworld';
    window.wgpuPortals={overworld:new Set(),nether:new Set()};
    const NETHER_LAVA_LEVEL=31,NETHER_TOP=127;
    let netherOverrides=new Map(),netherAssetsReady=false,portalsReady=false,overworldPortalSpot=null,netherPortalSpot=null;
    let overworldChunkRadius=null;
    const dimensionEdits={overworld:null,nether:null,end:null};
    function initNetherAssets(){
      if(netherAssetsReady)return;netherAssetsReady=true;
      Object.assign(ATLAS_SLOTS,{netherrack:[0,4],lava_still:[1,4],bedrock:[2,4],soul_sand:[3,4],nether_quartz_ore:[4,4],magma_block:[5,4],obsidian:[6,4],nether_portal:[7,4]});
      Object.assign(PACK_BLOCK_CANDIDATES,{netherrack:[['netherrack','']],lava:[['lava',''],['flowing_lava','']],bedrock:[['bedrock','']],
        soul_sand:[['soul_sand','']],nether_quartz_ore:[['nether_quartz_ore',''],['quartz_ore','']],magma_block:[['magma_block',''],['magma','']],
        obsidian:[['obsidian','']],nether_portal:[['nether_portal','axis=z'],['nether_portal',''],['portal','']]});
    }
    const NETHER_FALLBACK_IDS={netherrack:87,lava:10,bedrock:7,soul_sand:88,nether_quartz_ore:153,magma_block:213,obsidian:49,nether_portal:90,glowstone:89,
      white_concrete:10460,sea_lantern:10448,gold_block:10312};
    const netherMaterial=type=>packBlockId(type==='lava_still'?'lava':type,NETHER_FALLBACK_IDS[type==='lava_still'?'lava':type]??0);
    const NETHER_VANILLA_TEXTURES={"netherrack":{"src":"@@datauri:assets/images/netherrack.png@@","animation":null},"lava_still":{"src":"@@datauri:assets/images/lava-still.png@@","animation":{"frametime":2,"frames":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1]}},"bedrock":{"src":"@@datauri:assets/images/bedrock.png@@","animation":null},"soul_sand":{"src":"@@datauri:assets/images/soul-sand.png@@","animation":null},"nether_quartz_ore":{"src":"@@datauri:assets/images/nether-quartz-ore.png@@","animation":null},"magma_block":{"src":"@@datauri:assets/images/magma-block.png@@","animation":{"frametime":8,"interpolate":true,"frames":[0,1,2]}},"obsidian":{"src":"@@datauri:assets/images/obsidian.png@@","animation":null},"nether_portal":{"src":"@@datauri:assets/images/nether-portal.png@@","animation":{}}};
    const netherAnimations=[];
    async function netherAtlasImages(){
      initNetherAssets();initEndAssets();const entries=[];await createEndTextures();await createSignTextures();
      for(const [name,info] of Object.entries({...NETHER_VANILLA_TEXTURES,...END_VANILLA_TEXTURES})){
        const image=await loadImage(info.src),frames=Math.max(1,Math.floor(image.height/16)),canvas=document.createElement('canvas');canvas.width=16;canvas.height=16*frames;
        const context=canvas.getContext('2d');context.drawImage(image,0,0);
        const first=document.createElement('canvas');first.width=first.height=16;first.getContext('2d').drawImage(image,0,0,16,16,0,0,16,16);entries.push([name,first]);
        if(info.animation&&frames>1){
          const pixels=Array.from({length:frames},(_,i)=>context.getImageData(0,i*16,16,16).data);
          const sequence=(info.animation.frames||Array.from({length:frames},(_,i)=>i)).map(f=>typeof f==='object'?f.index:f);
          netherAnimations.push({name,pixels,sequence,frametime:info.animation.frametime||1,interpolate:!!info.animation.interpolate,last:-1});
        }
      }
      return entries;
    }
    function netherHash(x,y,z,seed){let v=Math.imul(x,0x1f123bb5)^Math.imul(y,0x2c1b3c6d)^Math.imul(z,0x5f356495)^seed;v=Math.imul(v^(v>>>15),0x2c1b3c6d);v=Math.imul(v^(v>>>12),0x297a2d39);return((v^(v>>>15))>>>0)/4294967295;}
    function netherNoise(x,y,z,scaleXZ,scaleY,seed){
      const sx=x/scaleXZ,sy=y/scaleY,sz=z/scaleXZ,x0=Math.floor(sx),y0=Math.floor(sy),z0=Math.floor(sz);
      const s=t=>t*t*(3-2*t),tx=s(sx-x0),ty=s(sy-y0),tz=s(sz-z0),m=(a,b,t)=>a+(b-a)*t,c=(i,j,k)=>netherHash(x0+i,y0+j,z0+k,seed);
      return m(m(m(c(0,0,0),c(1,0,0),tx),m(c(0,1,0),c(1,1,0),tx),ty),m(m(c(0,0,1),c(1,0,1),tx),m(c(0,1,1),c(1,1,1),tx),ty),tz)*2-1;
    }
    function netherTerrain(x,y,z){
      if(y<0||y>NETHER_TOP)return null;
      if(y<=4&&y<=Math.floor(netherHash(x,0,z,0x51)*5))return 'bedrock';
      if(y>=NETHER_TOP-4&&y>=NETHER_TOP-Math.floor(netherHash(x,1,z,0x52)*5))return 'bedrock';
      const t=y<72?(y-72)/68:(y-72)/46,bias=t*t*1.3-.3;
      const density=netherNoise(x,y,z,58,32,0x6e11)*.85+netherNoise(x,y,z,18,13,0x2a7)*.38+netherNoise(x,y,z,6,6,0x913)*.1+bias;
      if(density>0)return 'netherrack';
      return y<=NETHER_LAVA_LEVEL?'lava':null;
    }
    function netherBlockAt(x,y,z){
      const k=x+','+y+','+z;
      if(placedBlocks.has(k))return placedBlocks.get(k);
      if(removedBlocks.has(k))return null;
      if(netherOverrides.has(k))return netherOverrides.get(k)||null;
      return window.wgpuDimension==='end'?endTerrain(x,y,z):netherTerrain(x,y,z);
    }
    function netherDecorate(x,y,z,typeAt){
      if(typeAt(x,y-1,z)===null&&y>=44&&netherNoise(x,y,z,5,4,0x7e1)>.5&&netherNoise(x,y,z,26,22,0x3a)>.15)return 'glowstone';
      if(typeAt(x,y+1,z)===null&&y>=NETHER_LAVA_LEVEL-1&&y<=NETHER_LAVA_LEVEL+9&&netherNoise(x,0,z,9,1,0x5d)>.22)return 'soul_sand';
      if(netherHash(x,y,z,0x77)<.3&&(typeAt(x+1,y,z)==='lava'||typeAt(x-1,y,z)==='lava'||typeAt(x,y,z+1)==='lava'||typeAt(x,y,z-1)==='lava'||typeAt(x,y+1,z)==='lava'))return 'magma_block';
      if(netherHash(x,y,z,0x91)<.018)return 'nether_quartz_ore';
      return 'netherrack';
    }
    const NETHER_EMISSION={lava:15,glowstone:15,sea_lantern:15,magma_block:3,nether_portal:11,end_portal:15};
    const netherOpaque=type=>type!==null&&type!=='lava'&&type!=='nether_portal'&&type!=='end_portal';
    const LIGHT_PASSES=new Set(['lava','nether_portal','end_portal']);
    function* createNetherChunkMeshSteps(chunkX,chunkZ){
      initNetherAssets();
      const M=8,S=CHUNK_SIZE,minX=chunkX*S,minZ=chunkZ*S,maxX=minX+S-1,maxZ=minZ+S-1,ox=minX-M,oz=minZ-M,W=S+2*M,H=(window.wgpuDimension==='end'?END_TOP:NETHER_TOP)+1,inNether=window.wgpuDimension==='nether';
      const NAMES=[null,'netherrack','lava','bedrock','glowstone','soul_sand','nether_quartz_ore','magma_block','obsidian','nether_portal'];
      const CODE=new Map(NAMES.map((name,i)=>[name,i]));
      const codeOf=type=>{if(type==null)return 0;let code=CODE.get(type);if(code===undefined){code=NAMES.length;NAMES.push(type);CODE.set(type,code);}return code;};
      const grid=new Uint8Array(W*W*H),index=(x,y,z)=>(x-ox)+W*((z-oz)+W*y),inGrid=(x,y,z)=>x>=ox&&x<ox+W&&z>=oz&&z<oz+W&&y>=0&&y<H;
      const edited=new Uint8Array(W*W*H);
      for(let y=0;y<H;y++){
        if(!(y&15))yield;
        for(let z=oz;z<oz+W;z++)for(let x=ox;x<ox+W;x++){
          const k=x+','+y+','+z,i=index(x,y,z);
          if(placedBlocks.has(k)||removedBlocks.has(k)||netherOverrides.has(k))edited[i]=1;
          grid[i]=codeOf(netherBlockAt(x,y,z));
        }
      }
      const baseAt=(x,y,z)=>inGrid(x,y,z)?NAMES[grid[index(x,y,z)]]:netherBlockAt(x,y,z);
      const decorated=new Uint8Array(grid);
      for(let y=1;y<H-1;y++){
        if(!(y&15))yield;
        for(let z=oz;z<oz+W;z++)for(let x=ox;x<ox+W;x++){const i=index(x,y,z);if(inNether&&grid[i]===1&&!edited[i])decorated[i]=CODE.get(netherDecorate(x,y,z,baseAt));}
      }
      const typeAt=(x,y,z)=>inGrid(x,y,z)?NAMES[decorated[index(x,y,z)]]:(y<0||y>=H?(inNether?'bedrock':null):netherBlockAt(x,y,z));
      yield;
      const light=new Uint8Array(W*W*H);let queue=[];
      for(let i=0;i<decorated.length;i++){const e=NETHER_EMISSION[NAMES[decorated[i]]];if(e){light[i]=e;queue.push(i);}}
      const WW=W*W;
      for(let head=0;head<queue.length;head++){
        const i=queue[head],level=light[i]-1;if(level<=0)continue;
        const x=i%W,z=Math.floor(i/W)%W,y=Math.floor(i/WW);
        const next=[x>0?i-1:-1,x<W-1?i+1:-1,z>0?i-W:-1,z<W-1?i+W:-1,y>0?i-WW:-1,y<H-1?i+WW:-1];
        for(const n of next){if(n<0)continue;const t=decorated[n];if(t!==0&&!LIGHT_PASSES.has(NAMES[t]))continue;if(light[n]<level){light[n]=level;queue.push(n);}}
      }
      queue=null;yield;
      const lightAt=(x,y,z)=>inGrid(x,y,z)?light[index(x,y,z)]:0;
      const skyGrid=new Uint8Array(W*W*H);
      if(window.wgpuDimension==='end'){
        const skyQueue=[];
        for(let z=0;z<W;z++)for(let x=0;x<W;x++)for(let y=H-1;y>=0;y--){const i=x+W*(z+W*y),t=decorated[i];if(t!==0&&!LIGHT_PASSES.has(NAMES[t]))break;skyGrid[i]=15;skyQueue.push(i);}
        for(let head=0;head<skyQueue.length;head++){
          const i=skyQueue[head],level=skyGrid[i]-1;if(level<=0)continue;
          const x=i%W,z=Math.floor(i/W)%W,y=Math.floor(i/WW);
          for(const n of [x>0?i-1:-1,x<W-1?i+1:-1,z>0?i-W:-1,z<W-1?i+W:-1,y>0?i-WW:-1,y<H-1?i+WW:-1]){if(n<0)continue;const t=decorated[n];if(t!==0&&!LIGHT_PASSES.has(NAMES[t]))continue;if(skyGrid[n]<level){skyGrid[n]=level;skyQueue.push(n);}}
        }
        yield;
      }
      const skyAt=(x,y,z)=>inGrid(x,y,z)?skyGrid[index(x,y,z)]:(y>=H&&window.wgpuDimension==='end'?15:0);
      const vertices=[],indices=[],portalIndices=[],stride=35;let minY=Infinity,maxY=-Infinity;
      const atlas=(name,u,v)=>{const [column,row]=ATLAS_SLOTS[name];return[(column*ATLAS_CELL+ATLAS_PADDING+u*16)/ATLAS_WIDTH,(row*ATLAS_CELL+ATLAS_PADDING+(1-v)*16)/ATLAS_HEIGHT];};
      const textureOf=type=>type==='lava'?'lava_still':type;
      const corner=(x,y,z,n,p)=>{
        const front=[x+n[0],y+n[1],z+n[2]],axes=[0,1,2].filter(a=>n[a]===0),step=a=>p[a]<[x,y,z][a]+.5?-1:1;
        const da=[0,0,0],db=[0,0,0];da[axes[0]]=step(axes[0]);db[axes[1]]=step(axes[1]);
        const cell=(d1,d2)=>[front[0]+d1[0]+d2[0],front[1]+d1[1]+d2[1],front[2]+d1[2]+d2[2]];
        const zero=[0,0,0],cells=[cell(zero,zero),cell(da,zero),cell(zero,db),cell(da,db)];
        const opaque=cells.map(c=>netherOpaque(typeAt(...c))),levels=cells.map((c,j)=>opaque[j]?-1:lightAt(...c)),skies=cells.map((c,j)=>opaque[j]?-1:skyAt(...c));
        const own=Math.max(0,levels[0]),ownSky=Math.max(0,skies[0]);let sum=0,skySum=0;for(const l of levels)sum+=l<0?own:l;for(const l of skies)skySum+=l<0?ownSky:l;
        const ao=opaque[1]&&opaque[2]?.4:[1,.8,.6,.4][Number(opaque[1])+Number(opaque[2])+Number(opaque[3])];
        return [8+4*sum,ao,8+4*skySum];
      };
      const quad=(a,b,c,d,n,type,block,list,fluid,faceUvs=null)=>{
        const texture=textureOf(type),material=netherMaterial(type),emission=NETHER_EMISSION[type]||0,base=vertices.length/stride;
        const mid=atlas(texture,.5,.5),tx=b[0]-a[0],ty=b[1]-a[1],tz=b[2]-a[2],len=Math.hypot(tx,ty,tz)||1,tangent=[tx/len,ty/len,tz/len,1];
        const center=[block[0]+.5,block[1]+.5,block[2]+.5],uvs=faceUvs||[[0,0],[1,0],[1,1],[0,1]];
        [a,b,c,d].forEach((p,k)=>{
          const [blockLight,ao,skyLight]=emission>=11?[248,1,8+16*skyAt(block[0]+n[0],block[1]+n[1],block[2]+n[2])]:corner(...block,n,p),shade=type==='nether_portal'||fluid?1:ao,uv=atlas(texture,uvs[k][0],uvs[k][1]);
          const color=activePackProperties.separateAo==='true'?[1,1,1,shade]:[shade,shade,shade,1];
          vertices.push(p[0],p[1],p[2],1,n[0],n[1],n[2],uv[0],uv[1],0,1,blockLight,skyLight,0,1,color[0],color[1],color[2],color[3],material,fluid?1:-1,0,1,mid[0],mid[1],0,1,
            tangent[0],tangent[1],tangent[2],tangent[3],(center[0]-p[0])*64,(center[1]-p[1])*64,(center[2]-p[2])*64,emission);
        });
        list.push(base,base+1,base+2,base+2,base+3,base);
        minY=Math.min(minY,block[1]);maxY=Math.max(maxY,block[1]+1);
      };
      const face=(x,y,z,f,type,top,list,fluid)=>{
        const x1=x+1,z1=z+1,y1=y+top,b=[x,y,z];
        if(f==='top')quad([x,y1,z],[x,y1,z1],[x1,y1,z1],[x1,y1,z],[0,1,0],type,b,list,fluid);
        else if(f==='bottom')quad([x,y,z],[x1,y,z],[x1,y,z1],[x,y,z1],[0,-1,0],type,b,list,fluid);
        else if(f==='north')quad([x1,y,z],[x,y,z],[x,y1,z],[x1,y1,z],[0,0,-1],type,b,list,fluid);
        else if(f==='south')quad([x,y,z1],[x1,y,z1],[x1,y1,z1],[x,y1,z1],[0,0,1],type,b,list,fluid);
        else if(f==='west')quad([x,y,z],[x,y,z1],[x,y1,z1],[x,y1,z],[-1,0,0],type,b,list,fluid);
        else quad([x1,y,z1],[x1,y,z],[x1,y1,z],[x1,y1,z1],[1,0,0],type,b,list,fluid);
      };
      const FACES=[['top',0,1,0],['bottom',0,-1,0],['north',0,0,-1],['south',0,0,1],['west',-1,0,0],['east',1,0,0]];
      for(let y=0;y<H;y++){
        if(!(y&7))yield;
        for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
          const type=typeAt(x,y,z);if(!type||type==='end_portal')continue;
          if(type==='nether_portal'){
            const a=x+.375,b=x+.625;
            quad([a,y,z],[a,y,z+1],[a,y+1,z+1],[a,y+1,z],[-1,0,0],type,[x,y,z],portalIndices,false);
            quad([b,y,z+1],[b,y,z],[b,y+1,z],[b,y+1,z+1],[1,0,0],type,[x,y,z],portalIndices,false);
            continue;
          }
          const fluid=type==='lava',top=fluid&&typeAt(x,y+1,z)!=='lava'?.875:1;
          for(const [f,dx,dy,dz] of FACES){
            const neighbor=typeAt(x+dx,y+dy,z+dz);
            if(fluid?(neighbor===null||neighbor==='nether_portal'):!netherOpaque(neighbor))face(x,y,z,f,type,top,indices,fluid);
          }
        }
      }
      for(const f of endButtonFaces(minX,maxX,minZ,maxZ))quad(f.a,f.b,f.c,f.d,f.n,f.type,f.block,indices,false,f.uvs);
      const opaqueIndexCount=indices.length;for(const i of portalIndices)indices.push(i);
      if(minY===Infinity){minY=0;maxY=1;}
      const wide=vertices.length/stride>65535,vao=gl.createVertexArray(),vertexBuffer=gl.createBuffer(),indexBuffer=gl.createBuffer();gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);
      for(const [loc,size,offset] of [[0,4,0],[1,3,4],[2,4,7],[3,4,11],[4,4,15],[5,4,19],[6,4,23],[7,4,27],[9,4,31]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,stride*4,offset*4);}
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,wide?new Uint32Array(indices):new Uint16Array(indices),gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return{vao,vertexBuffer,indexBuffer,indexCount:opaqueIndexCount,solidIndexCount:opaqueIndexCount,cutoutIndexCount:0,plantIndexOffset:opaqueIndexCount,plantIndexCount:0,
        waterIndexCount:portalIndices.length,waterIndexOffset:opaqueIndexCount*(wide?4:2),indexType:wide?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,chunkX,chunkZ,minY,maxY,plantCount:0,plants:new Set()};
    }

    let portalOverlayCanvas=null,portalCurrentPixels=null;
    function writeAtlasSprite(name,pixels){
      if(!dirtTexture?.gpu||!ATLAS_SLOTS[name])return;
      const P=ATLAS_PADDING,C=16+2*P;let level=new Uint8Array(C*C*4);
      for(let y=0;y<C;y++)for(let x=0;x<C;x++){const sx=Math.min(15,Math.max(0,x-P)),sy=Math.min(15,Math.max(0,y-P)),s=(sy*16+sx)*4,o=(y*C+x)*4;level[o]=pixels[s];level[o+1]=pixels[s+1];level[o+2]=pixels[s+2];level[o+3]=pixels[s+3];}
      const [column,row]=ATLAS_SLOTS[name],levels=dirtTexture.gpu.mipLevelCount||1;let size=C;
      for(let mip=0;mip<levels&&size>=1;mip++){
        const ox=(column*ATLAS_CELL)>>mip,oy=(row*ATLAS_CELL)>>mip;
        if(ox+size<=dirtTexture.gpu.width>>mip&&oy+size<=dirtTexture.gpu.height>>mip)
          gl.device.queue.writeTexture({texture:dirtTexture.gpu,mipLevel:mip,origin:[ox,oy,0]},level,{bytesPerRow:size*4,rowsPerImage:size},[size,size,1]);
        if(size===1)break;
        const half=size>>1,next=new Uint8Array(half*half*4);
        for(let y=0;y<half;y++)for(let x=0;x<half;x++)for(let c=0;c<4;c++){
          const at=(yy,xx)=>level[((y*2+yy)*size+(x*2+xx))*4+c];next[(y*half+x)*4+c]=(at(0,0)+at(0,1)+at(1,0)+at(1,1)+2)>>2;
        }
        level=next;size=half;
      }
    }
    function animateNetherTextures(now){
      const ticks=Math.floor(now*WORLD_TICKS_PER_SECOND);
      for(const anim of netherAnimations){
        const step=Math.floor(ticks/anim.frametime),at=((step%anim.sequence.length)+anim.sequence.length)%anim.sequence.length;
        const key=anim.interpolate?ticks:step;if(key===anim.last)continue;anim.last=key;
        let pixels=anim.pixels[anim.sequence[at]];
        if(anim.interpolate){
          const next=anim.pixels[anim.sequence[(at+1)%anim.sequence.length]],f=(ticks%anim.frametime)/anim.frametime,mixed=new Uint8ClampedArray(pixels.length);
          for(let i=0;i<pixels.length;i++)mixed[i]=i%4===3?pixels[i]:Math.round(pixels[i]*(1-f)+next[i]*f);pixels=mixed;
        }
        writeAtlasSprite(anim.name,pixels);
        if(anim.name==='nether_portal'){portalCurrentPixels=pixels;if(portalOverlayCanvas){const c=portalOverlayCanvas.getContext('2d'),img=c.createImageData(16,16);img.data.set(pixels);c.putImageData(img,0,0);}}
      }
    }
    function portalFrame(x,baseY,z0,put){
      for(let dz=-1;dz<=2;dz++){put(x,baseY,z0+dz,'obsidian');put(x,baseY+4,z0+dz,'obsidian');}
      for(let dy=1;dy<=3;dy++){put(x,baseY+dy,z0-1,'obsidian');put(x,baseY+dy,z0+2,'obsidian');put(x,baseY+dy,z0,'nether_portal');put(x,baseY+dy,z0+1,'nether_portal');}
    }
    function setupOverworldPortal(){
      if(overworldPortalSpot)return;
      const x=SPAWN_X-6,z0=SPAWN_Z-4;let base=-Infinity;
      for(let dz=-1;dz<=2;dz++)base=Math.max(base,terrainHeight(x,z0+dz));
      overworldPortalSpot={x,y:base,z0};
    }
    function applyOverworldPortal(){
      setupOverworldPortal();const {x,y:base,z0}=overworldPortalSpot,portal=window.wgpuPortals.overworld;portal.clear();
      const touch=new Set();
      const put=(px,py,pz,type)=>{
        const k=px+','+py+','+pz,chunk=Math.floor(px/CHUNK_SIZE)+','+Math.floor(pz/CHUNK_SIZE);touch.add(chunk);
        if(type==='nether_portal'){if(brokenBlocks.overworld.has(k))return;portal.add(k);if(solidBlockAt(px,py,pz)&&!placedBlocks.has(k)){removedBlocks.add(k);if(!removedByChunk.has(chunk))removedByChunk.set(chunk,new Set());removedByChunk.get(chunk).add(k);}return;}
        placedBlocks.set(k,type);if(!placedByChunk.has(chunk))placedByChunk.set(chunk,new Set());placedByChunk.get(chunk).add(k);
      };
      for(let dz=-1;dz<=2;dz++)for(let y=terrainHeight(x,z0+dz)+1;y<base;y++)put(x,y,z0+dz,'obsidian');
      portalFrame(x,base,z0,put);
      applyOverworldEndPortal(touch);applySpawnSign(touch);
      return touch;
    }
    function setupNetherPortal(){
      const spot=overworldPortalSpot||{x:SPAWN_X-6,z0:SPAWN_Z-4};
      const x=Math.floor(spot.x/8),z0=Math.floor(spot.z0/8),y=70;
      netherPortalSpot={x,y,z0};netherOverrides=new Map();const portal=window.wgpuPortals.nether;portal.clear();
      for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=4;dz++){
        for(let dy=0;dy<=5;dy++)netherOverrides.set((x+dx)+','+(y+dy)+','+(z0+dz),'');
        netherOverrides.set((x+dx)+','+(y-1)+','+(z0+dz),'obsidian');
      }
      portalFrame(x,y-1,z0,(px,py,pz,type)=>{const k=px+','+py+','+pz;netherOverrides.set(k,type);if(type==='nether_portal'&&!brokenBlocks.nether.has(k))portal.add(k);});
    }
