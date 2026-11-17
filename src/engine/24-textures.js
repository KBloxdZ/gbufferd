    let lightmapTexture=null;
    const SKY_LIGHT_TINT=[0.86,0.91,1.0];
    function lightmapPixels(){
      const d=window.wgpuDimension,w=window.wgpuWeather||{};
      const ambient=d==='nether'?.1:d==='end'?.25:0,ambientColor=d==='end'?[.99,1.12,1]:[1,1,1];
      const NIGHT=[0x7a,0x7a,0xff],WHITE=[255,255,255];
      const lerpInt=(t,a,b)=>a+Math.floor(t*(b-a)),srgbLerp=(t,a,b)=>a.map((v,i)=>lerpInt(t,v,b[i]));
      const alphaBlend=(dest,src,alpha)=>{const a=Math.floor(alpha*255);return dest.map((v,i)=>Math.trunc((src[i]*a+v*(255-a))/255));};
      let skyColor,skyFactor;
      if(d==='nether'){skyColor=[0x7a,0x7a,0xff];skyFactor=0;}
      else if(d==='end'){skyColor=[0xe5,0x80,0xff];skyFactor=0;}
      else{
        const t=((WORLD_TIME%24000)+24000)%24000;
        const day=t>=730&&t<=11270?1:t>11270&&t<13140?1-(t-11270)/(13140-11270):t>=13140&&t<=22860?0:(t>22860?t-22860:t+24000-22860)/(730+24000-22860);
        skyColor=srgbLerp(day,NIGHT,WHITE);skyFactor=.24+(1-.24)*day;
        const thunder=Math.max(0,Math.min(1,w.thunder||0)),rain=Math.max(0,(w.rain||0)-thunder);
        if(rain>0){skyFactor+=(skyFactor+(.24-skyFactor)*.3125-skyFactor)*rain;skyColor=srgbLerp(rain,skyColor,alphaBlend(skyColor,NIGHT,.3125));}
        if(thunder>0){skyFactor+=(skyFactor+(.24-skyFactor)*.52734375-skyFactor)*thunder;skyColor=srgbLerp(thunder,skyColor,alphaBlend(skyColor,NIGHT,.52734375));}
      }
      if(w.skyFlash>0)skyFactor=1;
      const sky=skyColor.map(v=>v/255),brightness=level=>{const f=level/15;return f/(4-3*f);};
      const clamp=x=>Math.min(1,Math.max(0,x)),mix=(a,b,t)=>a+(b-a)*t;
      const data=new Uint8Array(16*16*4);
      for(let skyLevel=0;skyLevel<16;skyLevel++)for(let block=0;block<16;block++){
        const b=brightness(block)*1.5,s=brightness(skyLevel)*skyFactor;
        let c=[b,b*((b*0.6+0.4)*0.6+0.4),b*(b*b*0.6+0.4)];
        c=c.map((v,i)=>mix(v,ambientColor[i],ambient));
        c=c.map((v,i)=>v+sky[i]*s);
        c=c.map(v=>mix(v,.75,.04));
        c=c.map(clamp);
        const m=Math.max(...c),scaled=1-Math.pow(1-m,4),notGamma=m>0?c.map(v=>v*(scaled/m)):c;
        c=c.map((v,i)=>mix(v,notGamma[i],.5));
        c=c.map(v=>mix(v,.75,.04));
        const offset=(skyLevel*16+block)*4;
        for(let channel=0;channel<3;channel++)data[offset+channel]=Math.round(clamp(c[channel])*255);
        data[offset+3]=255;
      }
      return data;
    }
    function buildLightmapTexture(){
      const texture=lightmapTexture||gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,16,16,0,gl.RGBA,gl.UNSIGNED_BYTE,lightmapPixels());
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D,null);
      return texture;
    }
    function makeTexture(size, pixelFn, repeat = true) {
      const data = new Uint8Array(size*size*4);
      for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
        const p = pixelFn(x,y), i=(y*size+x)*4;
        data[i]=p[0]; data[i+1]=p[1]; data[i+2]=p[2]; data[i+3]=p[3] ?? 255;
      }
      const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
      return t;
    }

    function packDeadline(promise,what,ms=20000){let timer;return Promise.race([promise,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error(what+' antwortet nach '+ms/1000+' s nicht')),ms);})]).finally(()=>clearTimeout(timer));}
    function loadImage(source,crossOrigin=false) {
      return new Promise((resolve,reject)=>{
        const image=new Image();
        if(crossOrigin)image.crossOrigin='anonymous';
        image.addEventListener('load',()=>resolve(image),{once:true});
        image.addEventListener('error',()=>reject(new Error(`Textur konnte nicht geladen werden: ${source}`)),{once:true});
        image.src=source;
      });
    }

    function textureFromImage(image,internalFormat,format,minFilter,magFilter,maxLevel=0) {
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,internalFormat,format,gl.UNSIGNED_BYTE,image);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,minFilter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,magFilter);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_BASE_LEVEL,0);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAX_LEVEL,maxLevel);
      if(maxLevel>0)gl.generateMipmap(gl.TEXTURE_2D);
      return texture;
    }

    const VANILLA_MIP_GAMMA=Array.from({length:256},(_,value)=>Math.pow(value/255,2.2));

    function vanillaMipmapLevel(source,width,height,checkAlpha) {
      const nextWidth=Math.max(1,width>>1),nextHeight=Math.max(1,height>>1),target=new Uint8Array(nextWidth*nextHeight*4);
      for(let y=0;y<nextHeight;y++)for(let x=0;x<nextWidth;x++){
        const sx=x*2,sy=y*2,samples=[(sy*width+sx)*4,(sy*width+Math.min(sx+1,width-1))*4,(Math.min(sy+1,height-1)*width+sx)*4,(Math.min(sy+1,height-1)*width+Math.min(sx+1,width-1))*4];
        let weight=0,alpha=0;const rgb=[0,0,0];
        for(const sample of samples){
          const a=source[sample+3]/255;
          alpha+=a;weight+=a;
          for(let channel=0;channel<3;channel++)rgb[channel]+=VANILLA_MIP_GAMMA[source[sample+channel]]*a;
        }
        const out=(y*nextWidth+x)*4;
        for(let channel=0;channel<3;channel++)target[out+channel]=weight>0?Math.round(255*Math.pow(rgb[channel]/weight,1/2.2)):0;
        target[out+3]=Math.round(alpha*.25*255);
      }
      return{pixels:target,width:nextWidth,height:nextHeight};
    }

    function textureFromVanillaAtlas(atlas,maxLevel) {
      const context=atlas.getContext('2d'),base=context.getImageData(0,0,atlas.width,atlas.height).data;
      for(const [column,row] of Object.values(ATLAS_SLOTS)){
        const x0=column*ATLAS_CELL+ATLAS_PADDING,y0=row*ATLAS_CELL+ATLAS_PADDING;let weight=0;const rgb=[0,0,0];
        for(let y=y0;y<y0+16;y++)for(let x=x0;x<x0+16;x++){const at=(y*atlas.width+x)*4,a=base[at+3]/255;weight+=a;for(let c=0;c<3;c++)rgb[c]+=base[at+c]*a;}
        if(!weight)continue;const color=rgb.map(value=>Math.round(value/weight));
        for(let y=row*ATLAS_CELL;y<(row+1)*ATLAS_CELL&&y<atlas.height;y++)for(let x=column*ATLAS_CELL;x<(column+1)*ATLAS_CELL&&x<atlas.width;x++){const at=(y*atlas.width+x)*4;if(base[at+3]===0){base[at]=color[0];base[at+1]=color[1];base[at+2]=color[2];}}
      }
      const checkAlpha=(()=>{for(let index=3;index<base.length;index+=4)if(base[index]===0)return true;return false;})();
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
      let level={pixels:new Uint8Array(base.buffer,base.byteOffset,base.byteLength),width:atlas.width,height:atlas.height};
      const spriteAverages=level=>{
        const scale=1<<maxLevel,cell=ATLAS_CELL/scale;if(maxLevel<1||cell<1||!Number.isInteger(cell))return;
        for(const [column,row] of Object.values(ATLAS_SLOTS)){
          const x0=column*ATLAS_CELL+ATLAS_PADDING,y0=row*ATLAS_CELL+ATLAS_PADDING;let weight=0,alpha=0;const rgb=[0,0,0];
          for(let y=y0;y<y0+16;y++)for(let x=x0;x<x0+16;x++){const at=(y*atlas.width+x)*4,a=base[at+3]/255;alpha+=a;weight+=a;for(let c=0;c<3;c++)rgb[c]+=VANILLA_MIP_GAMMA[base[at+c]]*a;}
          const color=rgb.map(value=>weight>0?Math.round(255*Math.pow(value/weight,1/2.2)):0),coverage=Math.round(alpha/256*255);
          for(let y=row*cell;y<(row+1)*cell&&y<level.height;y++)for(let x=column*cell;x<(column+1)*cell&&x<level.width;x++){const at=(y*level.width+x)*4;level.pixels[at]=color[0];level.pixels[at+1]=color[1];level.pixels[at+2]=color[2];level.pixels[at+3]=coverage;}
        }
      };
      for(let index=0;index<=maxLevel;index++){
        if(index===maxLevel&&index>0)spriteAverages(level);
        gl.texImage2D(gl.TEXTURE_2D,index,gl.RGBA8,level.width,level.height,0,gl.RGBA,gl.UNSIGNED_BYTE,level.pixels);
        if(index<maxLevel)level=vanillaMipmapLevel(level.pixels,level.width,level.height,checkAlpha);
      }
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_BASE_LEVEL,0);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAX_LEVEL,maxLevel);
      return texture;
    }

    async function createSourceTextures() {
      await createVanillaSkyTextures();
      const imageEntries=await Promise.all(Object.entries(VANILLA_TEXTURES).map(async([name,source])=>[name,await loadImage(source)]));imageEntries.push(...await netherAtlasImages());
      const [noiseImage,cloudWaterImage]=await Promise.all([loadImage(PACK_TEXTURES.noise),loadImage(PACK_TEXTURES.cloudWater)]);
      const atlas=document.createElement('canvas');atlas.width=ATLAS_WIDTH;atlas.height=ATLAS_HEIGHT;
      const context=atlas.getContext('2d');context.imageSmoothingEnabled=false;
      for(const [name,image] of imageEntries){
        const [column,row]=ATLAS_SLOTS[name],x=column*ATLAS_CELL+ATLAS_PADDING,y=row*ATLAS_CELL+ATLAS_PADDING,p=ATLAS_PADDING;
        context.drawImage(image,0,0,16,16,x,y,16,16);
        context.drawImage(image,0,0,16,1,x,y-p,16,p);context.drawImage(image,0,15,16,1,x,y+16,16,p);
        context.drawImage(image,0,0,1,16,x-p,y,p,16);context.drawImage(image,15,0,1,16,x+16,y,p,16);
        context.drawImage(image,0,0,1,1,x-p,y-p,p,p);context.drawImage(image,15,0,1,1,x+16,y-p,p,p);
        context.drawImage(image,0,15,1,1,x-p,y+16,p,p);context.drawImage(image,15,15,1,1,x+16,y+16,p,p);
      }
      const imageMap=Object.fromEntries(imageEntries),tinted=document.createElement('canvas');tinted.width=16;tinted.height=16;
      const tintContext=tinted.getContext('2d');tintContext.drawImage(imageMap.grass_side_overlay,0,0);
      tintContext.globalCompositeOperation='source-in';tintContext.fillStyle='rgb(145,189,89)';tintContext.fillRect(0,0,16,16);
      tintContext.globalCompositeOperation='multiply';tintContext.drawImage(imageMap.grass_side_overlay,0,0);
      tintContext.globalCompositeOperation='destination-in';tintContext.drawImage(imageMap.grass_side_overlay,0,0);
      const [grassColumn,grassRow]=ATLAS_SLOTS.grass_side;
      context.drawImage(tinted,grassColumn*ATLAS_CELL+ATLAS_PADDING,grassRow*ATLAS_CELL+ATLAS_PADDING);
      if(GB.config.atlas){const hostAtlasImage=await loadImage(GB.config.atlas.url);context.clearRect(0,0,atlas.width,atlas.height);context.drawImage(hostAtlasImage,0,0);}dirtTexture=textureFromVanillaAtlas(atlas,3);
      noiseTexture=textureFromImage(noiseImage,gl.RGB8,gl.RGB,gl.LINEAR,gl.LINEAR);
      cloudWaterTexture=textureFromImage(cloudWaterImage,gl.RGBA8,gl.RGBA,gl.LINEAR,gl.LINEAR);
      neutralTexture = makeTexture(1, () => [128,128,128,255], false);
      whiteTexture = makeTexture(1, () => [255,255,255,255], false);
      lightmapTexture = buildLightmapTexture();
      normalTexture = makeTexture(1, () => [128,128,255,255], false);
      specularTexture = makeTexture(1, () => [0,0,0,0], false);
      emptyDepthTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,emptyDepthTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT16,1,1,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_SHORT,new Uint16Array([65535]));
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.NONE);
      neutral3DTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,neutral3DTexture);
      gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,1,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,128,255]));
      gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      signed2DTexture=gl.createTexture();gl.allocateTexture(signed2DTexture,1,1,1,'rgba8sint',1);
      signed3DTexture=gl.createTexture();gl.allocateTexture(signed3DTexture,1,1,1,'rgba8sint',1,'3d');
      unsigned2DTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,unsigned2DTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8UI,1,1,0,gl.RGBA_INTEGER,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      unsigned3DTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,unsigned3DTexture);
      gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8UI,1,1,1,0,gl.RGBA_INTEGER,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));
      gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    }

