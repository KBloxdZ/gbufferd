    function vanillaFogDistances(){
      const rd=RENDER_DISTANCE,rain=window.wgpuWeather?.rainFog||0,nether=window.wgpuDimension==='nether';
      let start=nether?10:0,end=nether?96:1024;
      start+=-160*rain;end=Math.max(Math.min(96,end),end+-256*rain);
      return{environmentalStart:start,environmentalEnd:end,renderStart:rd-Math.min(64,Math.max(4,rd/10)),renderEnd:rd};
    }
    const SIGN_OAK_PNG="@@datauri:assets/images/sign-oak.png@@",FONT_ASCII_PNG="@@datauri:assets/images/font-ascii.png@@";
    const SIGN_LINES=['Hello!','Welcome to','GBufferd',''];
    let spawnSign=null,signOakTexture=null,signFontTexture=null,signGlyphWidths=null,signMesh=null,signTextMesh=null;
    async function createSignTextures(){
      if(signOakTexture)return;
      const [oak,ascii]=await Promise.all([loadImage(SIGN_OAK_PNG),loadImage(FONT_ASCII_PNG)]);
      signOakTexture=textureFromImage(oak,gl.RGBA8,gl.RGBA,gl.NEAREST,gl.NEAREST);
      signFontTexture=textureFromImage(ascii,gl.RGBA8,gl.RGBA,gl.NEAREST,gl.NEAREST);
      const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d');c.drawImage(ascii,0,0);
      const pixels=c.getImageData(0,0,128,128).data;signGlyphWidths=new Array(256).fill(0);
      for(let code=0;code<256;code++){
        const gx=(code%16)*8,gy=Math.floor(code/16)*8;let width=0;
        for(let x=7;x>=0&&!width;x--)for(let y=0;y<8;y++)if(pixels[((gy+y)*128+gx+x)*4+3]!==0){width=x+1;break;}
        signGlyphWidths[code]=width;
      }
    }
    function setupSpawnSign(){
      if(spawnSign)return spawnSign;
      const heights=new Map(),heightAt=(x,z)=>{const k=x+','+z;if(!heights.has(k))heights.set(k,terrainHeight(x,z));return heights.get(k);};
      const columnAt=(x,z)=>{const h=heightAt(x,z),slope=Math.max(...[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dz])=>Math.abs(h-heightAt(x+dx,z+dz))));return terrainColumn(x,z,h,slope);};
      const blocks=buildTreeBlocks(Math.floor(SPAWN_X/CHUNK_SIZE),Math.floor(SPAWN_Z/CHUNK_SIZE),1,columnAt);
      let best=null;
      for(const [k,type] of blocks){
        if(!type.endsWith('_log'))continue;
        const [x,y,z]=k.split(',').map(Number);
        if(!blocks.get(x+','+(y-1)+','+z)?.endsWith('_log')||!blocks.get(x+','+(y-2)+','+z)?.endsWith('_log')||blocks.get(x+','+(y-3)+','+z)?.endsWith('_log'))continue;
        const dx=SPAWN_X+.5-(x+.5),dz=SPAWN_Z+.5-(z+.5),d=Math.hypot(dx,dz);if(d<3)continue;
        const step=Math.abs(dx)>=Math.abs(dz)?[Math.sign(dx),0]:[0,Math.sign(dz)],sx=x+step[0],sz=z+step[1],cell=sx+','+y+','+sz;
        if(blocks.has(cell)||solidBlockAt(sx,y,sz)||window.wgpuEndFrames?.has(cell)||window.wgpuPortals?.overworldEnd?.has(cell)||window.wgpuPortals?.overworld?.has(cell))continue;
        if(!best||d<best.d)best={d,x:sx,y,z:sz,facing:step[0]===1?'east':step[0]===-1?'west':step[1]===1?'south':'north'};
      }
      return spawnSign=best||{x:SPAWN_X+2,y:heightAt(SPAWN_X+2,SPAWN_Z)+2,z:SPAWN_Z,facing:'west'};
    }
    function applySpawnSign(touch){
      const sign=setupSpawnSign(),k=sign.x+','+sign.y+','+sign.z,chunk=Math.floor(sign.x/CHUNK_SIZE)+','+Math.floor(sign.z/CHUNK_SIZE);
      touch.add(chunk);removedBlocks.add(k);if(!removedByChunk.has(chunk))removedByChunk.set(chunk,new Set());removedByChunk.get(chunk).add(k);
    }
    function signPose(sign){
      const angle=-({south:0,west:90,north:180,east:270}[sign.facing])*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
      const rotate=([x,y,z])=>[x*cos+z*sin,y,-x*sin+z*cos];
      const place=p=>{const r=rotate([p[0],p[1]-.3125,p[2]-.4375]);return[sign.x+.5+r[0],sign.y+.5+r[1],sign.z+.5+r[2]];};
      return{place,rotate};
    }
    function signVertices(sign,vanilla,lightAttr){
      const {place,rotate}=signPose(sign),board=[],text=[],boardIdx=[],textIdx=[];
      const k=2/3/16,model=([x,y,z])=>place([x*k,-y*k,-z*k]),normal=([x,y,z])=>{const r=rotate([x,-y,-z]);const l=Math.hypot(...r)||1;return r.map(v=>v/l);};
      const x0=-12,y0=-14,z0=-1,x1=12,y1=-2,z1=1,W=64,H=32;
      const V=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
      const u=0,v=0,dx=24,dy=12,dz=2,U=[u,u+dz,u+dz+dx,u+dz+dx+dx,u+dz+dx+dz,u+dz+dx+dz+dx],T=[v,v+dz,v+dz+dy];
      const faces=[[[5,4,0,1],U[1],T[0],U[2],T[1],[0,-1,0]],[[2,3,7,6],U[2],T[1],U[3],T[0],[0,1,0]],[[0,4,7,3],U[0],T[1],U[1],T[2],[-1,0,0]],
        [[1,0,3,2],U[1],T[1],U[2],T[2],[0,0,-1]],[[5,1,2,6],U[2],T[1],U[4],T[2],[1,0,0]],[[4,5,6,7],U[4],T[1],U[5],T[2],[0,0,1]]];
      const lights=[[.2,1,-.7],[-.2,1,.7]].map(l=>{const n=Math.hypot(...l);return l.map(c=>c/n);});
      const mixLight=n=>Math.min(1,(Math.max(0,lights[0][0]*n[0]+lights[0][1]*n[1]+lights[0][2]*n[2])+Math.max(0,lights[1][0]*n[0]+lights[1][1]*n[1]+lights[1][2]*n[2]))*.6+.4);
      for(const [ids,ua,va,ub,vb,n] of faces){
        const base=board.length/31,nn=normal(n),uvs=[[ub,va],[ua,va],[ua,vb],[ub,vb]].map(([a,b])=>[a/W,b/H]);
        const mid=[(uvs[0][0]+uvs[2][0])/2,(uvs[0][1]+uvs[2][1])/2],p=ids.map(i=>model(V[i]));
        const t=[p[1][0]-p[0][0],p[1][1]-p[0][1],p[1][2]-p[0][2]],tl=Math.hypot(...t)||1,shade=vanilla?mixLight(nn):1;
        p.forEach((q,i)=>board.push(q[0],q[1],q[2],1,...nn,uvs[i][0],uvs[i][1],0,1,lightAttr[0],lightAttr[1],0,1,shade,shade,shade,1,0,0,0,0,mid[0],mid[1],0,1,t[0]/tl,t[1]/tl,t[2]/tl,1));
        boardIdx.push(base,base+1,base+2,base+2,base+3,base);
      }
      const s=.015625*2/3,textPlace=([x,y])=>place([x*s,1/3-y*s,.046666667]),textNormal=normal([0,0,-1]);
      const advance=ch=>ch===' '?4:(signGlyphWidths[ch.charCodeAt(0)]||0)+1;
      SIGN_LINES.forEach((line,i)=>{
        const width=Math.ceil([...line].reduce((sum,ch)=>sum+advance(ch),0));let x=Math.trunc(-width/2);const y=i*10-20;
        for(const ch of line){
          const code=ch.charCodeAt(0);
          if(ch!==' '&&code<256&&signGlyphWidths[code]){
            const w=signGlyphWidths[code],gu=(code%16)*8,gv=Math.floor(code/16)*8,u0=gu/128,u1=(gu+w)/128,v0=gv/128,v1=(gv+8)/128;
            const base=text.length/31,quad=[[x,y,u0,v0],[x,y+8,u0,v1],[x+w,y+8,u1,v1],[x+w,y,u1,v0]];
            for(const [qx,qy,qu,qv] of quad){const q=textPlace([qx,qy]);text.push(q[0],q[1],q[2],1,...textNormal,qu,qv,0,1,lightAttr[0],lightAttr[1],0,1,0,0,0,1,0,0,0,0,(u0+u1)/2,(v0+v1)/2,0,1,1,0,0,1);}
            textIdx.push(base,base+1,base+2,base+2,base+3,base);
          }
          x+=advance(ch);
        }
      });
      return{board,boardIdx,text,textIdx};
    }
    function renderSigns(eye,now){
      if(GB.state.active||window.wgpuDimension!=='overworld'||!signOakTexture||!signGlyphWidths||setupSpawnSign().broken)return;
      const sign=setupSpawnSign(),vanilla=window.wgpuPackBlockProgram===false;
      const block=blockLightLevels.get(sign.x+','+sign.y+','+sign.z)||0,sky=skyLightAt(sign.x,sign.y,sign.z)??15,lightAttr=[block*16+8,sky*16+8];
      const {board,boardIdx,text,textIdx}=signVertices(sign,vanilla,lightAttr);
      signMesh=uploadVanillaSkyMesh(board,boardIdx,signMesh);signTextMesh=uploadVanillaSkyMesh(text,textIdx,signTextMesh);
      const id=packBlockId('oak_wall_sign',63);
      const draw=(name,mesh,texture,blend)=>{
        const resolved=resolveIrisProgram(gbufferPrograms,name),program=resolved?.program;if(!program||!mesh.count)return;
        const targets=activePassTargets[resolved.name]||[0];
        attachColorTargets(targets,colortexCurrent,true);gl.viewport(0,0,width,height);
        gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.CULL_FACE);
        if(blend){gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);}else gl.disable(gl.BLEND);
        applyPackBlend(resolved.name,targets);
        skyTextureOverride=texture;gl.useProgram(program);setUniforms(program,cameraViewMatrix,cameraProjectionMatrix,eye,now);
        u1i(program,'renderStage',12);u1i(program,'blockEntityId',id);
        gl.bindVertexArray(mesh.vao);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_INT,0);
        u1i(program,'blockEntityId',0);skyTextureOverride=null;gl.disable(gl.BLEND);
      };
      draw('gbuffers_block',signMesh,signOakTexture,false);
      draw('gbuffers_block_translucent',signTextMesh,signFontTexture,true);
      inspectorCapture('gbuffers_block');
    }
