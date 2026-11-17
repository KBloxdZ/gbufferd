    function buildSkyGeometry() {
      const vertices=[],indices=[],stride=31,r=64;
      const push=(p,uv,color)=>vertices.push(
        p[0],p[1],p[2],1, 0,1,0, uv[0],uv[1],0,1,
         8,248,0,1, color[0],color[1],color[2],color[3], 0,0,0,0, .5,.5,0,1, 1,0,0,1
      );
      const quad=(a,b,c,d,color)=>{const base=vertices.length/stride;push(a,[0,0],color);push(b,[1,0],color);push(c,[1,1],color);push(d,[0,1],color);indices.push(base,base+1,base+2,base+2,base+3,base);};
      const sky=[...SKY_COLOR,1];
      quad([-r,r,-r],[r,r,-r],[r,r,r],[-r,r,r],sky);
      quad([-r,-r,r],[r,-r,r],[r,-r,-r],[-r,-r,-r],sky);
      quad([-r,-r,-r],[r,-r,-r],[r,r,-r],[-r,r,-r],sky);
      quad([r,-r,r],[-r,-r,r],[-r,r,r],[r,r,r],sky);
      quad([-r,-r,r],[-r,-r,-r],[-r,r,-r],[-r,r,r],sky);
      quad([r,-r,-r],[r,-r,r],[r,r,r],[r,r,-r],sky);
      skyIndexCount=indices.length;skyVao=gl.createVertexArray();gl.bindVertexArray(skyVao);
      const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
      const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
      [[0,4,0],[1,3,4],[2,4,7],[3,4,11],[4,4,15],[5,4,19],[6,4,23],[7,4,27]].forEach(([loc,size,offset])=>{gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,stride*4,offset*4);});
      gl.bindVertexArray(null);
    }

    const VANILLA_SKY_ASSETS={"sun": "@@datauri:assets/images/sun.png@@", "moon": "@@datauri:assets/images/moon.png@@", "clouds": "@@datauri:assets/images/clouds.png@@"};
    let vanillaSunTexture=null,vanillaMoonTexture=null,vanillaCloudTexture=null,vanillaCloudImage=null,skyTextureOverride=null;
    let vanillaCloudMask=null,vanillaCloudMesh=null,vanillaCloudKey='',vanillaCelestialMesh=null;
    function uploadVanillaSkyMesh(vertices,indices,mesh=null){
      if(!mesh){mesh={vao:gl.createVertexArray(),vb:gl.createBuffer(),ib:gl.createBuffer()};}
      gl.bindVertexArray(mesh.vao);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.vb);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.ib);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(indices),gl.STATIC_DRAW);
      for(const [loc,size,offset] of [[0,4,0],[1,3,4],[2,4,7],[3,4,11],[4,4,15],[5,4,19],[6,4,23],[7,4,27]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,31*4,offset*4);}
      mesh.count=indices.length;gl.bindVertexArray(null);return mesh;
    }
    function vanillaSkyVertex(vertices,p,n,uv,color){vertices.push(...p,1,...n,...uv,0,1,8,248,0,1,...color,0,0,0,0,.5,.5,0,1,1,0,0,1);}
    async function createVanillaSkyTextures(){
      const [sun,moon,clouds]=await Promise.all(Object.values(VANILLA_SKY_ASSETS).map(loadImage));
      vanillaSunTexture=textureFromImage(sun,gl.RGBA8,gl.RGBA,gl.NEAREST,gl.NEAREST);
      vanillaMoonTexture=textureFromImage(moon,gl.RGBA8,gl.RGBA,gl.NEAREST,gl.NEAREST);
      vanillaCloudTexture=makeTexture(1,()=>[255,255,255,255],false);
      vanillaCloudImage=textureFromImage(clouds,gl.RGBA8,gl.RGBA,gl.NEAREST,gl.NEAREST);
      const canvas=document.createElement('canvas');canvas.width=clouds.width;canvas.height=clouds.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(clouds,0,0);
      vanillaCloudMask={width:clouds.width,height:clouds.height,pixels:ctx.getImageData(0,0,clouds.width,clouds.height).data};
    }
    function renderVanillaCelestials(eye,now){if(window.wgpuDimension==='nether')return;if(window.wgpuDimension==='end')return renderEndSky(eye,now);
      const resolved=resolveIrisProgram(gbufferPrograms,'gbuffers_skytextured'),program=resolved?.program;if(!program||!vanillaSunTexture)return;
      const inverse=M4.invert(shadowViewMatrix),basisX=[inverse[0],inverse[1],inverse[2]],basisY=[inverse[4],inverse[5],inverse[6]],direction=[inverse[8],inverse[9],inverse[10]];
      const daySign=SUN_ANGLE>.5?-1:1,view=new Float32Array(cameraViewMatrix);view[12]=view[13]=view[14]=0;
      attachColorTargets(activePassTargets[resolved.name]||[0],colortexCurrent,true);gl.viewport(0,0,width,height);
      gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE,gl.ONE,gl.ONE);
      for(const [kind,texture,sign,size] of [['sun',vanillaSunTexture,daySign,30],['moon',vanillaMoonTexture,-daySign,20]]){
        if(String(activePackProperties[kind]).trim()==='false')continue;
        const vertices=[],indices=[0,1,2,0,2,3],uv=kind==='moon'?[[0,0],[.25,0],[.25,.5],[0,.5]]:[[0,0],[1,0],[1,1],[0,1]];
        [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([x,y],i)=>vanillaSkyVertex(vertices,direction.map((v,j)=>v*100*sign+basisX[j]*size*x+basisY[j]*size*y),[0,1,0],uv[i],[1,1,1,1-(window.wgpuWeather?.rain||0)]));
        vanillaCelestialMesh=uploadVanillaSkyMesh(vertices,indices,vanillaCelestialMesh);
        skyTextureOverride=texture;gl.useProgram(program);setUniforms(program,view,cameraProjectionMatrix,eye,now);u1i(program,'renderStage',kind==='sun'?4:5);
        gl.bindVertexArray(vanillaCelestialMesh.vao);gl.drawElements(gl.TRIANGLES,vanillaCelestialMesh.count,gl.UNSIGNED_INT,0);
      }
      skyTextureOverride=null;gl.disable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      inspectorCapture('gbuffers_skytextured');
    }
    function renderVanillaClouds(eye,now){if(!(window.wgpuDimension==='overworld'))return;
      const resolved=resolveIrisProgram(gbufferPrograms,'gbuffers_clouds'),program=resolved?.program;if(!program||!vanillaCloudMask||activePackProperties.clouds==='off')return;
      const cloudEye=GB.hooks.absolute(eye),drift=now*.6,cell=12,cx=Math.floor((cloudEye[0]+drift)/cell),cz=Math.floor(cloudEye[2]/cell);
      const cloudLight=Math.max(0,Math.min(1,Math.cos(vanillaCelestialAngle(WORLD_TIME)*Math.PI*2)*2+.5)),cloudColor=[1,1,1];
      {const rain=(window.wgpuWeather?.rain||0),thunder=(window.wgpuWeather?.thunder||0);
        if(rain>0){const grey=(cloudColor[0]*.3+cloudColor[1]*.59+cloudColor[2]*.11)*.6,keep=1-rain*.95;for(let i=0;i<3;i++)cloudColor[i]=cloudColor[i]*keep+grey*(1-keep);}
        cloudColor[0]*=cloudLight*.9+.1;cloudColor[1]*=cloudLight*.9+.1;cloudColor[2]*=cloudLight*.85+.15;
        if(thunder>0){const grey=(cloudColor[0]*.3+cloudColor[1]*.59+cloudColor[2]*.11)*.2,keep=1-thunder*.95;for(let i=0;i<3;i++)cloudColor[i]=cloudColor[i]*keep+grey*(1-keep);}}
      const key=cx+','+cz+','+cloudColor.map(v=>v.toFixed(3)).join(',');
      if(key!==vanillaCloudKey){
        const vertices=[],indices=[],mask=vanillaCloudMask,occupied=(x,z)=>mask.pixels[(((z%mask.height+mask.height)%mask.height)*mask.width+(x%mask.width+mask.width)%mask.width)*4+3]>127;
        const quad=(corners,n,shade)=>{const base=vertices.length/31;corners.forEach((p,i)=>vanillaSkyVertex(vertices,p,n,[[0,0],[1,0],[1,1],[0,1]][i],[shade*cloudColor[0],shade*cloudColor[1],shade*cloudColor[2],.8]));indices.push(base,base+1,base+2,base+2,base+3,base);};
        for(let z=cz-28;z<=cz+28;z++)for(let x=cx-28;x<=cx+28;x++)if(occupied(x,z)){
          const a=x*cell,b=a+cell,c=z*cell,d=c+cell,y=192,h=196;
          quad([[a,y,c],[b,y,c],[b,y,d],[a,y,d]],[0,-1,0],.7);
          quad([[a,h,c],[a,h,d],[b,h,d],[b,h,c]],[0,1,0],1);
          if(!occupied(x-1,z))quad([[a,y,c],[a,y,d],[a,h,d],[a,h,c]],[-1,0,0],.9);
          if(!occupied(x+1,z))quad([[b,y,d],[b,y,c],[b,h,c],[b,h,d]],[1,0,0],.9);
          if(!occupied(x,z-1))quad([[b,y,c],[a,y,c],[a,h,c],[b,h,c]],[0,0,-1],.8);
          if(!occupied(x,z+1))quad([[a,y,d],[b,y,d],[b,h,d],[a,h,d]],[0,0,1],.8);
        }
        vanillaCloudMesh=uploadVanillaSkyMesh(vertices,indices,vanillaCloudMesh);vanillaCloudKey=key;
      }
      attachColorTargets(activePassTargets[resolved.name]||[0],colortexCurrent,true);gl.viewport(0,0,width,height);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);applyPackBlend(resolved.name,activePassTargets[resolved.name]||[0]);
      skyTextureOverride=vanillaCloudTexture;gl.useProgram(program);setUniforms(program,M4.multiply(cameraViewMatrix,M4.translation(-drift-(GB.state.active?GB.state.renderOrigin[0]:0),-(GB.state.active?GB.state.renderOrigin[1]:0),-(GB.state.active?GB.state.renderOrigin[2]:0))),cameraProjectionMatrix,eye,now,true);u1i(program,'renderStage',20);
      gl.bindVertexArray(vanillaCloudMesh.vao);
      gl.colorMask(false,false,false,false);gl.drawElements(gl.TRIANGLES,vanillaCloudMesh.count,gl.UNSIGNED_INT,0);gl.colorMask(true,true,true,true);
      gl.depthFunc(515);gl.drawElements(gl.TRIANGLES,vanillaCloudMesh.count,gl.UNSIGNED_INT,0);gl.depthFunc(513);skyTextureOverride=null;gl.disable(gl.BLEND);
      copyDepthSnapshots(framebuffer,depthCopyFramebuffer,[sceneDepthTextures[0]],width,height);
      inspectorCapture('gbuffers_clouds');
    }

    function buildScreenGeometry() {
      const stride=31,vertices=[],indices=[0,1,2,0,2,3];
      const push=(x,y,u,v)=>vertices.push(
         x,y,0,1, 0,0,1, u,v,0,1, 8,248,0,1, 1,1,1,1,
        0,0,0,0, .5,.5,0,1, 1,0,0,1
      );
      push(0,0,0,0);push(1,0,1,0);push(1,1,1,1);push(0,1,0,1);
      screenIndexCount=indices.length;screenVao=gl.createVertexArray();gl.bindVertexArray(screenVao);
      const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
      const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
      [[0,4,0],[1,3,4],[2,4,7],[3,4,11],[4,4,15],[5,4,19],[6,4,23],[7,4,27]].forEach(([loc,size,offset])=>{gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,stride*4,offset*4);});
      gl.bindVertexArray(null);
    }

