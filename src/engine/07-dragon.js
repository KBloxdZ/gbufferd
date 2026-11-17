    const DRAGON_PNG="@@datauri:assets/images/dragon.png@@",DRAGON_EYES_PNG="@@datauri:assets/images/dragon-eyes.png@@",DRAGON_EXPLODING_PNG="@@datauri:assets/images/dragon-exploding.png@@",EXPLOSION_STRIP_PNG="@@datauri:assets/images/explosion-strip.png@@";
    const DRAGON_HOVER_TICKS=40,DRAGON_DEG=Math.PI/180;
    let dragonTextures=null,dragonTexturesLoading=null,dragon=null,dragonParticles=[],dragonParticleQueue=[],dragonClock=null;
    const dragonMeshes={};
    function loadDragonTextures(){
      if(dragonTextures)return Promise.resolve(dragonTextures);
      if(!dragonTexturesLoading)dragonTexturesLoading=Promise.all([DRAGON_PNG,DRAGON_EYES_PNG,DRAGON_EXPLODING_PNG,EXPLOSION_STRIP_PNG].map(loadImage)).then(([body,eyes,exploding,explosion])=>{
        const tex=image=>textureFromImage(image,gl.RGBA8,gl.RGBA,gl.NEAREST,gl.NEAREST);
        return dragonTextures={body:tex(body),eyes:tex(eyes),exploding:tex(exploding),explosion:tex(explosion)};
      });
      return dragonTexturesLoading;
    }
    function dragonJavaRandom(seed){
      const mask=(1n<<48n)-1n;let s=(BigInt(seed)^0x5DEECE66Dn)&mask;
      return{nextFloat(){s=(s*0x5DEECE66Dn+0xBn)&mask;return Number(s>>24n)/16777216;}};
    }
    const dragonWrap=d=>{d%=360;if(d>=180)d-=360;if(d<-180)d+=360;return d;};
    const dragonRotLerp=(t,a,b)=>a+t*dragonWrap(b-a);
    function dragonHistory(){
      const samples=new Array(64).fill({y:0,yRot:0});let head=-1;
      const get=i=>samples[(head-i)&63];
      return{record(y,yRot){const s={y,yRot};if(head<0)samples.fill(s);if(++head===64)head=0;samples[head]=s;},
        get(i,t){const a=get(i),b=get(i+1);return{y:b.y+(a.y-b.y)*t,yRot:dragonRotLerp(t,b.yRot,a.yRot)};}};
    }
    const dm={
      mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;},
      t(x,y,z){return[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];},
      s(x,y,z){return[x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1];},
      rx(a){const c=Math.cos(a),s=Math.sin(a);return[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];},
      ry(a){const c=Math.cos(a),s=Math.sin(a);return[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];},
      rz(a){const c=Math.cos(a),s=Math.sin(a);return[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];},
      point(m,[x,y,z]){return[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];},
      dir(m,[x,y,z]){const v=[m[0]*x+m[4]*y+m[8]*z,m[1]*x+m[5]*y+m[9]*z,m[2]*x+m[6]*y+m[10]*z],l=Math.hypot(...v)||1;return v.map(c=>c/l);}
    };
    function buildDragonModel(){
      const P=(x=0,y=0,z=0,xRot=0,yRot=0,zRot=0)=>({x,y,z,xRot,yRot,zRot});
      const C=(x,y,z,w,h,d,u,v,mirror=false)=>({x,y,z,w,h,d,u,v,mirror});
      const part=(pose,cubes,children={})=>({init:pose,...pose,cubes,children});
      const neckCubes=[C(-5,-5,-5,10,10,10,192,104),C(-1,-9,-3,2,4,6,48,0)];
      const head=part(P(0,20,-62),[C(-6,-1,-24,12,5,16,176,44),C(-8,-8,-10,16,16,16,112,30),
        C(-5,-12,-4,2,4,6,0,0,true),C(-5,-3,-22,2,2,4,112,0,true),C(3,-12,-4,2,4,6,0,0,true),C(3,-3,-22,2,2,4,112,0,true)],
        {jaw:part(P(0,4,-8),[C(-6,0,-16,12,4,16,176,65)])});
      const necks=[...Array(5)].map((_,i)=>part(P(0,20,-12-i*10),neckCubes));
      const tails=[...Array(12)].map((_,i)=>part(P(0,10,60+i*10),neckCubes));
      const wing=s=>{const m=s>0,x=s>0?0:-56;
        return part(P(12*s,2,-6),[C(x,-4,-4,56,8,8,112,88,m),C(x,0,2,56,0,56,-56,88,m)],
          {tip:part(P(56*s,0,0),[C(x,-2,-2,56,4,4,112,136,m),C(x,0,2,56,0,56,-56,144,m)])});};
      const frontLeg=s=>part(P(12*s,17,-6,1.3),[C(-4,-4,-4,8,24,8,112,104)],
        {tip:part(P(0,20,-1,-.5),[C(-3,-1,-3,6,24,6,226,138)],{foot:part(P(0,23,0,.75),[C(-4,0,-12,8,4,16,144,104)])})});
      const hindLeg=s=>part(P(16*s,13,34,1),[C(-8,-4,-8,16,32,16,0,0)],
        {tip:part(P(0,32,-4,.5),[C(-6,-2,0,12,32,12,196,0)],{foot:part(P(0,31,4,.75),[C(-9,0,-20,18,6,24,112,0)])})});
      const body=part(P(0,3,8),[C(-12,1,-16,24,24,64,0,0),C(-1,-5,-10,2,6,12,220,53),C(-1,-5,10,2,6,12,220,53),C(-1,-5,30,2,6,12,220,53)],
        {left_wing:wing(1),left_front_leg:frontLeg(1),left_hind_leg:hindLeg(1),right_wing:wing(-1),right_front_leg:frontLeg(-1),right_hind_leg:hindLeg(-1)});
      const children={head};necks.forEach((n,i)=>children['neck'+i]=n);tails.forEach((t,i)=>children['tail'+i]=t);children.body=body;
      const root=part(P(),[],children);
      return{root,head,jaw:head.children.jaw,necks,tails,body,
        leftWing:body.children.left_wing,leftWingTip:body.children.left_wing.children.tip,
        rightWing:body.children.right_wing,rightWingTip:body.children.right_wing.children.tip,
        leftFront:[body.children.left_front_leg,body.children.left_front_leg.children.tip,body.children.left_front_leg.children.tip.children.foot],
        leftHind:[body.children.left_hind_leg,body.children.left_hind_leg.children.tip,body.children.left_hind_leg.children.tip.children.foot],
        rightFront:[body.children.right_front_leg,body.children.right_front_leg.children.tip,body.children.right_front_leg.children.tip.children.foot],
        rightHind:[body.children.right_hind_leg,body.children.right_hind_leg.children.tip,body.children.right_hind_leg.children.tip.children.foot]};
    }
    let dragonModel=null;
    function setupDragonAnim(model,flapTime,H,headOffset){
      const reset=p=>{Object.assign(p,p.init);for(const c of Object.values(p.children))reset(c);};reset(model.root);
      const f=flapTime*6.2831855;
      model.jaw.xRot=(Math.sin(f)+1)*.2;
      let f3=Math.sin(f-1)+1;f3=(f3*f3+f3*2)*.05;
      model.root.y=(f3-2)*16;model.root.z=-48;model.root.xRot=f3*2*DRAGON_DEG;
      let x=model.necks[0].x,y=model.necks[0].y,z=model.necks[0].z;
      const s6=H(6),f9=dragonWrap(H(5).yRot-H(10).yRot),f10=dragonWrap(H(5).yRot+f9/2);
      for(let i=0;i<5;i++){
        const part=model.necks[i],s=H(5-i),f14=Math.cos(i*.45+f)*.15;
        part.yRot=dragonWrap(s.yRot-s6.yRot)*DRAGON_DEG*1.5;
        part.xRot=f14+headOffset(i,s6,s)*DRAGON_DEG*1.5*5;
        part.zRot=-dragonWrap(s.yRot-f10)*DRAGON_DEG*1.5;
        part.y=y;part.z=z;part.x=x;
        x-=Math.sin(part.yRot)*Math.cos(part.xRot)*10;y+=Math.sin(part.xRot)*10;z-=Math.cos(part.yRot)*Math.cos(part.xRot)*10;
      }
      model.head.y=y;model.head.z=z;model.head.x=x;
      const s0=H(0);
      model.head.yRot=dragonWrap(s0.yRot-s6.yRot)*DRAGON_DEG;
      model.head.xRot=dragonWrap(headOffset(6,s6,s0))*DRAGON_DEG*1.5*5;
      model.head.zRot=-dragonWrap(s0.yRot-f10)*DRAGON_DEG;
      model.body.zRot=-f9*1.5*DRAGON_DEG;
      model.leftWing.xRot=.125-Math.cos(f)*.2;model.leftWing.yRot=-.25;model.leftWing.zRot=-(Math.sin(f)+.125)*.8;
      model.leftWingTip.zRot=(Math.sin(f+2)+.5)*.75;
      model.rightWing.xRot=model.leftWing.xRot;model.rightWing.yRot=-model.leftWing.yRot;model.rightWing.zRot=-model.leftWing.zRot;
      model.rightWingTip.zRot=-model.leftWingTip.zRot;
      const limbs=(front,rear)=>{rear[0].xRot=1+f3*.1;rear[1].xRot=.5+f3*.1;rear[2].xRot=.75+f3*.1;front[0].xRot=1.3+f3*.1;front[1].xRot=-.5-f3*.1;front[2].xRot=.75+f3*.1;};
      limbs(model.leftFront,model.leftHind);limbs(model.rightFront,model.rightHind);
      let f12=0;y=model.tails[0].y;z=model.tails[0].z;x=model.tails[0].x;
      const s11=H(11);
      for(let i=0;i<12;i++){
        const s=H(12+i),part=model.tails[i];f12+=Math.sin(i*.45+f)*.05;
        part.yRot=(dragonWrap(s.yRot-s11.yRot)*1.5+180)*DRAGON_DEG;
        part.xRot=f12+(s.y-s11.y)*DRAGON_DEG*1.5*5;
        part.zRot=dragonWrap(s.yRot-f10)*DRAGON_DEG*1.5;
        part.y=y;part.z=z;part.x=x;
        y+=Math.sin(part.xRot)*10;z-=Math.cos(part.yRot)*Math.cos(part.xRot)*10;x-=Math.sin(part.yRot)*Math.cos(part.xRot)*10;
      }
    }
    function dragonRenderState(pt){
      const d=dragon,hp=d.dead?0:pt,H=i=>d.history.get(i,hp);
      const lerp=(a,b)=>a+(b-a)*pt,x=lerp(d.xo,d.x),y=lerp(d.yo,d.y),z=lerp(d.zo,d.z);
      let m=dm.t(x,y,z);
      m=dm.mul(m,dm.ry(-H(7).yRot*DRAGON_DEG));m=dm.mul(m,dm.rx((H(5).y-H(10).y)*10*DRAGON_DEG));
      m=dm.mul(m,dm.t(0,0,1));m=dm.mul(m,dm.s(-1,-1,1));m=dm.mul(m,dm.t(0,-1.501,0));
      if(!dragonModel)dragonModel=buildDragonModel();
      const flap=d.oFlapTime+(d.flapTime-d.oFlapTime)*pt;
      setupDragonAnim(dragonModel,flap,H,(i,s6,s)=>i===6?0:s.y-s6.y);
      const polygons=[];
      const walk=(p,pose)=>{
        let mm=dm.mul(pose,dm.t(p.x/16,p.y/16,p.z/16));
        if(p.xRot||p.yRot||p.zRot)mm=dm.mul(mm,dm.mul(dm.rz(p.zRot),dm.mul(dm.ry(p.yRot),dm.rx(p.xRot))));
        for(const c of p.cubes)dragonCubePolygons(c,mm,polygons);
        for(const child of Object.values(p.children))walk(child,mm);
      };
      walk(dragonModel.root,m);
      const deathTime=d.deathTime>0?d.deathTime+pt:0;
      const block=blockLightLevels.get(Math.floor(x)+','+Math.floor(y)+','+Math.floor(z))||0,sky=skyLightAt(Math.floor(x),Math.floor(y),Math.floor(z))??15;
      return{pose:m,polygons,deathTime,red:d.hurtTime>0,light:[block*16+8,sky*16+8],pos:[x,y,z]};
    }
    function dragonCubePolygons(c,m,out){
      let x0=c.x,x1=c.x+c.w;const y0=c.y,y1=c.y+c.h,z0=c.z,z1=c.z+c.d;
      if(c.mirror)[x0,x1]=[x1,x0];
      const V=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
      const u=c.u,v=c.v,dx=c.w,dy=c.h,dz=c.d,U=[u,u+dz,u+dz+dx,u+dz+dx+dx,u+dz+dx+dz,u+dz+dx+dz+dx],T=[v,v+dz,v+dz+dy];
      const faces=[[[5,4,0,1],U[1],T[0],U[2],T[1],[0,-1,0]],[[2,3,7,6],U[2],T[1],U[3],T[0],[0,1,0]],[[0,4,7,3],U[0],T[1],U[1],T[2],[-1,0,0]],
        [[1,0,3,2],U[1],T[1],U[2],T[2],[0,0,-1]],[[5,1,2,6],U[2],T[1],U[4],T[2],[1,0,0]],[[4,5,6,7],U[4],T[1],U[5],T[2],[0,0,1]]];
      for(const [ids,ua,va,ub,vb,n] of faces){
        let p=ids.map(i=>dm.point(m,V[i].map(q=>q/16))),uv=[[ub,va],[ua,va],[ua,vb],[ub,vb]].map(([a,b])=>[a/256,b/256]);
        if(c.mirror){p=p.reverse();uv=uv.reverse();}
        out.push({p,uv,n:dm.dir(m,c.mirror?[-n[0],n[1],n[2]]:n)});
      }
    }
    const DRAGON_LIGHTS=[[.2,1,-.7],[-.2,1,.7]].map(l=>{const n=Math.hypot(...l);return l.map(c=>c/n);});
    const dragonShade=n=>Math.min(1,(Math.max(0,DRAGON_LIGHTS[0][0]*n[0]+DRAGON_LIGHTS[0][1]*n[1]+DRAGON_LIGHTS[0][2]*n[2])+Math.max(0,DRAGON_LIGHTS[1][0]*n[0]+DRAGON_LIGHTS[1][1]*n[1]+DRAGON_LIGHTS[1][2]*n[2]))*.6+.4);
    function dragonQuad(out,idx,p,n,uv,colors,light,reverse=false){
      const base=out.length/31,t=[p[1][0]-p[0][0],p[1][1]-p[0][1],p[1][2]-p[0][2]],tl=Math.hypot(...t)||1;
      const mid=[(uv[0][0]+uv[2][0])/2,(uv[0][1]+uv[2][1])/2];
      for(let i=0;i<p.length;i++){const c=colors[i]||colors[0];out.push(p[i][0],p[i][1],p[i][2],1,n[0],n[1],n[2],uv[i][0],uv[i][1],0,1,light[0],light[1],0,1,c[0],c[1],c[2],c[3],0,0,0,0,mid[0],mid[1],0,1,t[0]/tl,t[1]/tl,t[2]/tl,1);}
      if(p.length===3)idx.push(base,base+1,base+2);
      else if(reverse)idx.push(base,base+2,base+1,base+2,base,base+3);
      else idx.push(base,base+1,base+2,base+2,base+3,base);
    }
    function dragonMesh(key,state,shading,alpha=1){
      const v=[],idx=[];
      for(const q of state.polygons){
        const s=shading==='none'?1:dragonShade(q.n);
        dragonQuad(v,idx,q.p,q.n,q.uv,[[s,s,s,alpha]],state.light);
        if(shading==='face'){const b=dragonShade(q.n.map(c=>-c));dragonQuad(v,idx,q.p,q.n.map(c=>-c),q.uv,[[b,b,b,alpha]],state.light,true);}
      }
      return dragonMeshes[key]=uploadVanillaSkyMesh(v,idx,dragonMeshes[key]);
    }
    function summonDragon(){
      if(dragonBeamTest()){beamTestPaused=!beamTestPaused;return;}
      if(GB.state.active||window.wgpuDimension!=='end'||dragon)return;
      loadDragonTextures().then(()=>{
        if(dragon||window.wgpuDimension!=='end')return;
        const origin=(endColumn(0,0)?.top??60)+1,y=origin+4+6;
        dragon={x:.5,y,z:.5,xo:.5,yo:y,zo:.5,yRot:90,flapTime:0,oFlapTime:0,history:dragonHistory(),age:0,dead:false,hurtTime:0,deathTime:0};
        dragon.history.record(dragon.y,dragon.yRot);
        dragonClock=performance.now()/1000;
        window.dispatchEvent(new CustomEvent('wgpuDragon',{detail:{state:'spawned',x:dragon.x,y:dragon.y,z:dragon.z}}));
      });
    }
    window.addEventListener('wgpuEndButton',summonDragon);
    function dragonActive(){return!!dragon||dragonParticles.length>0||dragonParticleQueue.length>0;}
    function dragonExplosion(x,y,z,size){
      dragonParticleQueue.push({x,y,z,age:0,lifetime:6+Math.floor(Math.random()*4),gray:Math.random()*.6+.4,size:2*(1-size*.5),sprite:0});
    }
    function tickDragon(){
      const d=dragon;
      if(d){
        d.xo=d.x;d.yo=d.y;d.zo=d.z;
        const r=()=>Math.random();
        if(d.dead){
          if(d.hurtTime>0)d.hurtTime--;
          d.deathTime++;
          if(d.deathTime>=180&&d.deathTime<=200)dragonParticleQueue.push({seed:true,x:d.x+(r()-.5)*8,y:d.y+2+(r()-.5)*4,z:d.z+(r()-.5)*8,age:0,lifetime:8});
          d.y+=.1;
          const removed=d.deathTime===200;
          d.oFlapTime=d.flapTime;
          dragonExplosion(d.x+(r()-.5)*8,d.y+2+(r()-.5)*4,d.z+(r()-.5)*8,0);
          if(removed){dragon=null;window.dispatchEvent(new CustomEvent('wgpuDragon',{detail:{state:'removed'}}));}
        }else{
          d.oFlapTime=d.flapTime;d.flapTime+=.2;d.history.record(d.y,d.yRot);
          if(++d.age>=DRAGON_HOVER_TICKS){d.dead=true;d.hurtTime=10;window.dispatchEvent(new CustomEvent('wgpuDragon',{detail:{state:'dying'}}));}
        }
      }
      const kept=[];
      for(const p of dragonParticles){
        if(p.seed){
          for(let i=0;i<6;i++)dragonExplosion(p.x+(Math.random()-Math.random())*4,p.y+(Math.random()-Math.random())*4,p.z+(Math.random()-Math.random())*4,p.age/p.lifetime);
          if(++p.age!==p.lifetime)kept.push(p);
        }else if(p.age++<p.lifetime){p.sprite=Math.floor(p.age*15/p.lifetime);kept.push(p);}
      }
      dragonParticles=kept.concat(dragonParticleQueue);dragonParticleQueue=[];
    }
    function updateDragon(){
      if(!dragon&&!dragonParticles.length&&!dragonParticleQueue.length)return;
      if(GB.state.active||window.wgpuDimension!=='end'){dragon=null;dragonParticles=[];dragonParticleQueue=[];return;}
      const now=(window.wgpuDbgFrozen??performance.now())/1000;
      if(dragonClock===null||now-dragonClock>1)dragonClock=now;
      while(now-dragonClock>=dragonTickLength()){const step=dragonTickLength();tickDragon();dragonClock+=step;}
    }
    const DRAGON_DEATH_TICK_LENGTH=.1;
    const dragonTickLength=()=>dragon&&!dragon.dead?.05:DRAGON_DEATH_TICK_LENGTH;
    const dragonPartialTick=()=>dragonClock===null?0:Math.min(1,Math.max(0,((window.wgpuDbgFrozen??performance.now())/1000-dragonClock)/dragonTickLength()));
    function dragonWarmMesh(){
      if(!dragonMeshes.warm){const v=[],idx=[],p=[0,-4096,0];dragonQuad(v,idx,[p,p,p],[0,1,0],[[0,0],[0,0],[0,0]],[[1,1,1,1]],[248,248]);dragonMeshes.warm=uploadVanillaSkyMesh(v,idx,null);}
      return dragonMeshes.warm;
    }
    function dragonDraw(o,eye,now){
      const resolved=resolveIrisProgram(gbufferPrograms,o.vanilla?'gbuffers_block':o.name),program=resolved?.program;if(!program||!o.mesh?.count)return;
      const targets=activePassTargets[resolved.name]||[0];
      attachColorTargets(targets,colortexCurrent,true);gl.viewport(0,0,width,height);
      gl.enable(gl.DEPTH_TEST);gl.depthMask(o.depthWrite!==false);gl.depthFunc(o.depthFunc||515);
      if(o.cull){gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);}else gl.disable(gl.CULL_FACE);
      if(o.blend){gl.enable(gl.BLEND);gl.blendFuncSeparate(...o.blend);}else gl.disable(gl.BLEND);
      if(!o.vanilla)applyPackBlend(resolved.name,targets);
      if(o.colorWrite===false)gl.colorMask(false,false,false,false);
      skyTextureOverride=o.texture||whiteTexture;gl.useProgram(program);setUniforms(program,cameraViewMatrix,cameraProjectionMatrix,eye,now);
      u1i(program,'renderStage',o.stage??11);u1i(program,'entityId',o.entityId??0);
      if(o.vanilla){u1i(program,'wgpuVanillaMode',o.mode);u4f(program,'wgpuOverlay',...(o.red?[1,0,0,178/255]:[0,0,0,1]));}
      else{
        if(o.red)u4f(program,'entityColor',1,0,0,1-178/255);
        if(o.vertexAlpha!=null){u1f(program,'viewerAlphaTestRef',o.vertexAlpha);u1f(program,'alphaTestRef',o.vertexAlpha);u1f(program,'iris_currentAlphaTest',o.vertexAlpha);}
      }
      gl.bindVertexArray(o.mesh.vao);gl.drawElements(gl.TRIANGLES,o.mesh.count,gl.UNSIGNED_INT,0);
      if(o.vanilla)u1i(program,'wgpuVanillaMode',0);
      u4f(program,'entityColor',0,0,0,0);u1i(program,'entityId',0);
      gl.colorMask(true,true,true,true);gl.depthFunc(513);gl.depthMask(true);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);skyTextureOverride=null;
      if(o.colorWrite!==false)inspectorCapture(resolved.name);
    }
    function renderDragon(eye,now){
      if(GB.state.active||window.wgpuDimension!=='end')return;
      if(!dragonTextures){loadDragonTextures();return;}
      const vanilla=window.wgpuPackBlockProgram===false,entityId=packEntityId('ender_dragon'),warm=!dragon,W=warm?dragonWarmMesh():null;
      const state=warm?null:dragonRenderState(dragonPartialTick());if(dragon)dragon.lastState=state;
      if(warm||state.deathTime>0){
        const alpha=warm?.5:Math.floor(state.deathTime/200*255)/255;
        dragonDraw({vanilla,name:'gbuffers_entities',mode:2,mesh:W||dragonMesh('explode',state,'none',vanilla?alpha:1),texture:dragonTextures.exploding,vertexAlpha:alpha,entityId},eye,now);
        dragonDraw({vanilla,name:'gbuffers_entities',mode:3,mesh:W||dragonMesh('decal',state,vanilla?'vertex':'none'),texture:dragonTextures.body,depthFunc:514,red:!warm&&state.red,entityId},eye,now);
      }
      if(warm||!(state.deathTime>0))
        dragonDraw({vanilla,name:'gbuffers_entities',mode:6,mesh:W||dragonMesh('body',state,vanilla?'face':'none'),texture:dragonTextures.body,cull:vanilla,red:!warm&&state.red,entityId},eye,now);
      dragonDraw({vanilla,name:'gbuffers_spidereyes',mode:4,mesh:W||dragonMesh('eyes',state,'none'),texture:dragonTextures.eyes,cull:true,depthWrite:false,
        blend:vanilla?[770,771,1,771]:[770,1,0,1],entityId},eye,now);
      if(warm&&!dragonParticles.length)dragonDraw({vanilla,name:'gbuffers_particles',mode:0,mesh:W,texture:dragonTextures.explosion,stage:19},eye,now);
      if(dragonParticles.length){
        const V=cameraViewMatrix,right=[V[0],V[4],V[8]],up=[V[1],V[5],V[9]],v=[],idx=[];
        for(const p of dragonParticles){
          if(p.seed)continue;
          const s=p.size,u0=p.sprite/16,u1=(p.sprite+1)/16;
          const corner=(a,b)=>[p.x+right[0]*a*s+up[0]*b*s,p.y+right[1]*a*s+up[1]*b*s,p.z+right[2]*a*s+up[2]*b*s];
          dragonQuad(v,idx,[corner(1,-1),corner(1,1),corner(-1,1),corner(-1,-1)],[0,1,0],[[u1,1],[u1,0],[u0,0],[u0,1]],[[p.gray,p.gray,p.gray,1]],[248,248]);
        }
        if(idx.length){
          dragonMeshes.particles=uploadVanillaSkyMesh(v,idx,dragonMeshes.particles);
          dragonDraw({vanilla,name:'gbuffers_particles',mode:0,mesh:dragonMeshes.particles,texture:dragonTextures.explosion,stage:19},eye,now);
        }
      }
    }
    const dragonBeamTest=()=>/[?&]beamtest(?:[=&]|$)/.test(location.search);
    let beamTestPaused=false,beamTestPhase=0,beamTestLast=null;
    function renderDragonRays(eye,now){
      if(GB.state.active||window.wgpuDimension!=='end')return;
      const vanilla=window.wgpuPackBlockProgram===false,state=dragon?.lastState;
      if(dragonBeamTest()){
        const time=(window.wgpuDbgFrozen??performance.now())/1000,v=[],idx=[],h=Math.sqrt(3)/2,f1=28,f2=3;
        if(beamTestLast!==null&&!beamTestPaused)beamTestPhase+=Math.min(.1,time-beamTestLast);beamTestLast=time;
        const m=dm.mul(dm.t(.5,88,.5),dm.mul(dm.ry(.6),dm.mul(dm.rz(Math.PI/2),dm.t(0,Math.sin(beamTestPhase*1.2)*8,0))));
        const p0=dm.point(m,[0,0,0]),p1=dm.point(m,[-h*f2,f1,-.5*f2]),p2=dm.point(m,[h*f2,f1,-.5*f2]),p3=dm.point(m,[0,f1,f2]);
        for(const [a1,a2] of [[p1,p2],[p2,p3],[p3,p1]])dragonQuad(v,idx,[p0,a1,a2],[0,1,0],[[0,0],[0,0],[0,0]],[[1,1,1,1],[1,0,1,0],[1,0,1,0]],[248,248]);
        dragonMeshes.rays=uploadVanillaSkyMesh(v,idx,dragonMeshes.rays);
        dragonDraw({vanilla,name:'gbuffers_lightning',mode:5,mesh:dragonMeshes.rays,cull:true,colorWrite:false,entityId:-1},eye,now);
        dragonDraw({vanilla,name:'gbuffers_lightning',mode:5,mesh:dragonMeshes.rays,cull:true,depthWrite:false,blend:[770,1,770,1],entityId:-1},eye,now);
        return true;
      }
      if(!dragonTextures)return;
      if(!dragon){
        const W=dragonWarmMesh();
        dragonDraw({vanilla,name:'gbuffers_lightning',mode:5,mesh:W,cull:true,colorWrite:false,entityId:-1},eye,now);
        dragonDraw({vanilla,name:'gbuffers_lightning',mode:5,mesh:W,cull:true,depthWrite:false,blend:[770,1,770,1],entityId:-1},eye,now);
        return false;
      }
      if(!state||!(state.deathTime>0))return;
      const t=state.deathTime/200,f=Math.min(t>.8?(t-.8)/.2:0,1),center=[1,1,1,1-f],edge=[1,0,1,0],h=Math.sqrt(3)/2;
      const random=dragonJavaRandom(432),count=Math.floor((t+t*t)/2*60),v=[],idx=[];
      let m=dm.mul(state.pose,dm.t(0,-1,-2));
      const tau=6.2831855;
      for(let i=0;i<count;i++){
        const a=random.nextFloat()*tau,b=random.nextFloat()*tau,c=random.nextFloat()*tau,d=random.nextFloat()*tau,e=random.nextFloat()*tau,g=random.nextFloat()*tau+t*1.5707964;
        m=dm.mul(m,dm.mul(dm.rx(a),dm.mul(dm.ry(b),dm.mul(dm.rz(c),dm.mul(dm.rx(d),dm.mul(dm.ry(e),dm.rz(g)))))));
        const f1=random.nextFloat()*20+5+f*10,f2=random.nextFloat()*2+1+f*2;
        const p0=dm.point(m,[0,0,0]),p1=dm.point(m,[-h*f2,f1,-.5*f2]),p2=dm.point(m,[h*f2,f1,-.5*f2]),p3=dm.point(m,[0,f1,f2]);
        for(const [a1,a2] of [[p1,p2],[p2,p3],[p3,p1]])dragonQuad(v,idx,[p0,a1,a2],[0,1,0],[[0,0],[0,0],[0,0]],[center,edge,edge],[248,248]);
      }
      if(!idx.length)return;
      dragonMeshes.rays=uploadVanillaSkyMesh(v,idx,dragonMeshes.rays);
      dragonDraw({vanilla,name:'gbuffers_lightning',mode:5,mesh:dragonMeshes.rays,cull:true,colorWrite:false,entityId:-1},eye,now);
      dragonDraw({vanilla,name:'gbuffers_lightning',mode:5,mesh:dragonMeshes.rays,cull:true,depthWrite:false,blend:[770,1,770,1],entityId:-1},eye,now);
      return true;
    }
    function renderDragonShadow(baseProgram,eye,now){
      if(GB.state.active||window.wgpuDimension!=='end'||!dragonTextures)return;
      if(String(activePackProperties.shadowEntities??'true').trim().toLowerCase()==='false')return;
      const program=pipelinePrograms.get('shadow_entities')||baseProgram;if(!program)return;
      const state=dragon?dragonRenderState(dragonPartialTick()):null,W=dragon?null:dragonWarmMesh();
      const targets=activePassTargets[programNames.get(program)]||[0];
      attachShadowTargets(targets,shadowColorTextures,true);gl.viewport(0,0,SHADOW_RESOLUTION,SHADOW_RESOLUTION);
      gl.drawBuffers(targets.map((_,index)=>gl.COLOR_ATTACHMENT0+index));
      gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
      gl.useProgram(program);
      const draw=(mesh,texture,func)=>{
        skyTextureOverride=texture;setUniforms(program,shadowGeometryViewMatrix,shadowProjectionMatrix,eye,now);
        u1i(program,'renderStage',11);u1i(program,'entityId',packEntityId('ender_dragon'));gl.depthFunc(func);
        gl.bindVertexArray(mesh.vao);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_INT,0);
      };
      if(W){draw(W,dragonTextures.exploding,515);draw(W,dragonTextures.body,514);}
      else if(state.deathTime>0){
        draw(dragonMesh('shadowExplode',state,'none',Math.floor(state.deathTime/200*255)/255),dragonTextures.exploding,515);
        draw(dragonMesh('shadowDecal',state,'none'),dragonTextures.body,514);
      }else draw(dragonMesh('shadowBody',state,'none'),dragonTextures.body,515);
      gl.depthFunc(513);skyTextureOverride=null;u1i(program,'entityId',0);
    }
