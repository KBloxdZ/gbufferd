    const propertySmooth=new Map();let propertyFrame=-1,propertyResults=[];
    function parsePropertyExpression(source){
      source=source.trim().replace(/;\s*$/,'');
      const tokens=(source.match(/(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_]\w*(?:\.[0-3xyzw]\.[0-3xyzw]|\.[xyzwrgbastpq])?|==|!=|<=|>=|&&|\|\||[()+\-*/%,!<>]/g)||[])
        .map(token=>token.replace(/\.([0-3xyzw])\.([0-3xyzw])$/,(whole,column,row)=>'.'+'xyzw0123'.indexOf(column)%4+'.'+'xyzw0123'.indexOf(row)%4)
          .replace(/^([A-Za-z_]\w*)\.([stpq])$/,(whole,name,lane)=>name+'.'+'xyzw'['stpq'.indexOf(lane)]));
      const checked=source.replace(/\.([0-3xyzw])\.([0-3xyzw])\b/g,(whole,column,row)=>'.'+'xyzw0123'.indexOf(column)%4+'.'+'xyzw0123'.indexOf(row)%4)
        .replace(/([A-Za-z_]\w*)\.([stpq])\b/g,(whole,name,lane)=>name+'.'+'xyzw'['stpq'.indexOf(lane)]);
      if(tokens.join('')!==checked.replace(/\s+/g,''))throw new Error('Nicht unterstützter Ausdruck: '+source);
      let index=0;const precedence={'||':1,'&&':2,'==':3,'!=':3,'<':4,'>':4,'<=':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6};
      const expression=(minimum=0)=>{
        let token=tokens[index++],left;
        if(token==='!'||token==='-'||token==='+')left={unary:token,value:expression(7)};
        else if(token==='('){left=expression();if(tokens[index++]!==')')throw new Error('Klammer fehlt');}
        else if(token&&/^\d|^\./.test(token))left={number:Number(token)};
        else if(token&&/^[A-Za-z_]/.test(token)){
          if(tokens[index]==='('){index++;const args=[];if(tokens[index]!==')')do{args.push(expression());if(tokens[index]!==',')break;index++;}while(index<tokens.length);if(tokens[index++]!==')')throw new Error('Funktionsklammer fehlt');left={call:token,args,callId:index};}
          else left={name:token};
        }else throw new Error('Ungültiger Ausdruck');
        while(precedence[tokens[index]]>=minimum){const op=tokens[index++];left={op,left,right:expression(precedence[op]+1)};}return left;
      };
      const result=expression();if(index!==tokens.length)throw new Error('Ausdruck nicht vollständig');return result;
    }
    const SDV_UNIFORMS=[['uniform.vec3.camPosDelta','vec3(cameraPosition.x - previousCameraPosition.x, cameraPosition.y - previousCameraPosition.y, cameraPosition.z - previousCameraPosition.z)'],['uniform.float.borderFar','far'],['uniform.float.vertexFrameTime','frameTimeCounter'],['uniform.float.fragmentFrameTime','frameTimeCounter'],['variable.float.newSunAngle','sunAngle * pi * 2'],['uniform.float.celestialSinX','sin(newSunAngle)'],['variable.float.absCelestialSinX','abs(celestialSinX)'],['uniform.float.shdFade','min(absCelestialSinX * pi * 2, 1)'],['uniform.float.dayCycle','1 + celestialSinX'],['uniform.float.dayCycleAdjust','clamp(dayCycle - 0.5, 0, 1)'],['uniform.float.twilightPhase','absCelestialSinX * absCelestialSinX * (3 - 2 * absCelestialSinX)'],['uniform.float.lightningFlash','lightningBoltPosition.w'],['uniform.float.pixelWidth','1 / viewWidth'],['uniform.float.pixelHeight','1 / viewHeight'],['uniform.float.eyeSkylight','smooth(eyeBrightness.y / 240, 15)'],['uniform.float.volumetricCloudFar','far * 8.0 * (1.0 - rainStrength * 0.5)']];
    function withSdvUniforms(properties,sources){
      const defined=name=>Object.keys(properties||{}).some(key=>/^(?:uniform|variable)\./.test(key)&&key.split('.')[2]===name);
      if(defined('dayCycle')||defined('shdFade'))return properties;
      const text=Object.values(sources||{}).filter(value=>typeof value==='string').join('\n');
      if(!/\buniform\s+float\s+(?:dayCycle|shdFade|eyeSkylight)\s*;/.test(text))return properties;
      const result={...properties};
      for(const [key,value] of SDV_UNIFORMS){const name=key.split('.')[2];if(!defined(name)&&(key.startsWith('variable.')||new RegExp('\\buniform\\s+\\w+\\s+'+name+'\\s*;').test(text)||['celestialSinX','absCelestialSinX','dayCycle'].includes(name)))result[key]=value;}
      console.info('Super-Duper-Vanilla-Uniforms ergänzt: '+Object.keys(result).filter(key=>!(key in (properties||{}))).map(key=>key.split('.')[2]).join(', '));
      return result;
    }
    function compilePropertyUniforms(properties){
      return irisSortUniforms(Object.entries(properties).filter(([key])=>/^(uniform|variable)\.(float|int|bool|[ib]?vec[234])\./.test(key)).map(([key,value])=>{const [kind,type,name]=key.split('.');try{return{kind,type,name,node:parsePropertyExpression(value)};}catch(error){return{kind,type,name,error:error.message};}}));
    }
    function evaluateProperty(node,context,smoothKey){
      const run=value=>evaluateProperty(value,context,smoothKey);
      if('number'in node)return node.number;
      if(node.name){if(Object.hasOwn(context,node.name))return context[node.name];if(node.name.startsWith('BIOME_'))return -1;throw new Error('Unbekannte Iris-Variable '+node.name);}
      if(node.unary){const value=run(node.value);if(Array.isArray(value)&&node.unary==='-')return value.map(v=>-v);return node.unary==='!'?Number(!value):node.unary==='-'?-value:+value;}
      if(node.op){const a=run(node.left);if(node.op==='&&'&&!a)return 0;if(node.op==='||'&&a)return 1;const b=run(node.right);if((Array.isArray(a)||Array.isArray(b))&&'+-*/'.includes(node.op)){const size=Array.isArray(a)?a.length:b.length,at=(v,i)=>Array.isArray(v)?v[i]:v;return Array.from({length:size},(_,i)=>node.op==='+'?at(a,i)+at(b,i):node.op==='-'?at(a,i)-at(b,i):node.op==='*'?at(a,i)*at(b,i):at(a,i)/at(b,i));}switch(node.op){case'+':return a+b;case'-':return a-b;case'*':return a*b;case'/':return a/b;case'%':return a%b;case'==':return +(a===b);case'!=':return +(a!==b);case'<':return +(a<b);case'>':return +(a>b);case'<=':return +(a<=b);case'>=':return +(a>=b);case'&&':return +(!!a&&!!b);case'||':return +(!!a||!!b);}}
      if(node.call==='if'){for(let i=0;i<node.args.length-1;i+=2)if(run(node.args[i]))return run(node.args[i+1]);return run(node.args.at(-1));}
      const args=node.args.map(run);
      if(/^[ib]?vec[234]$/.test(node.call)){
        const size=Number(node.call.at(-1)),values=args.flat();
        if(values.length===1)return Array(size).fill(values[0]);
        if(values.length!==size)throw new Error('Vektor benötigt '+size+' Komponenten');
        return values;
      }
      if(node.call==='if'){for(let i=0;i<args.length-1;i+=2)if(args[i])return args[i+1];return args.at(-1);}
      if(node.call==='in')return +args.slice(1).includes(args[0]);
      if(node.call==='smooth'){
        const explicit=args.length===4||(args.length>=2&&Object.hasOwn(node.args[0],'number')),[id,value,up=1,down=up]=explicit?args:[node.callId,...args],key=smoothKey+':'+id,old=propertySmooth.get(key)??value;
        const halfLife=(value>old?up:down)*.1;
        const result=halfLife<=0?value:value+(old-value)*Math.pow(.5,frameDelta/halfLife);
        propertySmooth.set(key,result);return result;
      }
      if(args.some(Array.isArray)){
        const vectorFunction={abs:Math.abs,floor:Math.floor,ceil:Math.ceil,min:Math.min,max:Math.max,clamp:(value,low,high)=>Math.max(low,Math.min(high,value))}[node.call],size=args[0]?.length;
        if(!vectorFunction||!args.every(arg=>Array.isArray(arg)&&arg.length===size))throw new Error(node.call+' nimmt keine Vektoren');
        return Array.from({length:size},(_,index)=>vectorFunction(...args.map(arg=>arg[index])));
      }
      if(node.call==='clamp')return Math.max(args[1],Math.min(args[2],args[0]));
      if(node.call==='atan')return args.length>1?Math.atan2(args[0],args[1]):Math.atan(args[0]);
      if(node.call==='atan2')return Math.atan2(args[0],args[1]);
      if(node.call==='log')return args.length>1?Math.log(args[1])/Math.log(args[0]):Math.log(args[0]);
      if(node.call==='random')return args.length>1?args[0]+Math.random()*(args[1]-args[0]):Math.random();
      if(node.call==='randomInt')return args.length>1?Math.floor(args[0]+Math.random()*(args[1]-args[0]+1)):Math.floor(Math.random()*0x7fffffff);
      const fn={
        abs:Math.abs,sign:Math.sign,signum:Math.sign,sqrt:Math.sqrt,
        min:Math.min,max:Math.max,pow:Math.pow,
        sin:Math.sin,cos:Math.cos,tan:Math.tan,asin:Math.asin,acos:Math.acos,
        torad:value=>value*Math.PI/180,radians:value=>value*Math.PI/180,
        todeg:value=>value*180/Math.PI,degrees:value=>value*180/Math.PI,
        exp:Math.exp,exp2:value=>2**value,exp10:value=>10**value,
        log2:Math.log2,log10:Math.log10,
        float:Number,int:Math.trunc,floor:Math.floor,ceil:Math.ceil,round:Math.round,frac:value=>value-Math.floor(value),
        fmod:(value,modulus)=>modulus===0?0:value%modulus,
        mix:(from,to,amount)=>from+(to-from)*amount,
        edge:(threshold,value)=>value<threshold?0:1,
        between:(value,low,high)=>+(value>=low&&value<=high),
        equals:(a,b,epsilon)=>+(Math.abs(a-b)<=epsilon)
      }[node.call];
      if(!fn)throw new Error('Nicht unterstützte Funktion '+node.call);return fn(...args);
    }
    function bindPropertyUniforms(program,eye,now,engineVectors={}){
      if(!packSettings)return;
      if(propertyFrame!==renderedFrameCounter){
        propertyFrame=renderedFrameCounter;propertyResults=[];
        const water=eye[1]<RIVER_LEVEL+.875&&terrainColumn(Math.floor(eye[0]),Math.floor(eye[2])).water;
        const context={true:1,false:0,pi:Math.PI,frameCounter:renderedFrameCounter,frameTime:frameDelta,frameTimeCounter:now,worldTime:WORLD_TIME,worldDay:WORLD_DAY,sunAngle:SUN_ANGLE,eyeAltitude:eye[1],isEyeInWater:GB.state.active?GB.hooks.medium(eye):(water?1:0),rainStrength:(window.wgpuWeather?.rain||0),wetness:(window.wgpuWeather?.wetness||0),blindness:0,darknessFactor:0,biome:1,biome_precipitation:1,'eyeBrightness.x':currentEyeLight()[0],'eyeBrightness.y':currentEyeLight()[1]};
        Object.assign(context,{viewWidth:width,viewHeight:height,aspectRatio:width/height,near:CAMERA_NEAR,far:RENDER_DISTANCE,screenBrightness:.5,thunderStrength:(window.wgpuWeather?.thunder||0),currentPlayerHealth:1,maxPlayerHealth:20,is_alive:1,is_hurt:0,playerMood:0});
        for(const [name,values] of Object.entries({...engineVectors,eyeBrightnessSmooth:currentEyeLight(),lightningBoltPosition:(window.wgpuWeather?.boltPosition||[0,0,0,0])})){
          if(values==null)continue;context[name]=values;if(Array.isArray(values)||ArrayBuffer.isView(values))for(let i=0;i<Math.min(4,values.length);i++)context[name+'.'+'xyzw'[i]]=values[i];
        }
        const matrices={gbufferModelView:cameraGbufferViewMatrix,gbufferModelViewInverse:M4.invert(cameraGbufferViewMatrix),gbufferProjection:cameraProjectionMatrix,gbufferProjectionInverse:M4.invert(cameraProjectionMatrix),gbufferPreviousModelView:previousGbufferViewMatrix,gbufferPreviousProjection:previousProjectionMatrix,shadowModelView:shadowViewMatrix,shadowModelViewInverse:M4.invert(shadowViewMatrix),shadowProjection:shadowProjectionMatrix,shadowProjectionInverse:M4.invert(shadowProjectionMatrix)};
        for(const [name,matrix] of Object.entries(matrices))for(let column=0;column<4;column++)for(let row=0;row<4;row++)context[name+'.'+column+'.'+row]=matrix[column*4+row];
        for(const [i,axis] of ['x','y','z'].entries()){context['cameraPosition.'+axis]=GB.hooks.absolute(eye)[i];context['previousCameraPosition.'+axis]=GB.hooks.absolute(previousCameraPosition)[i];}
        for(const [name,id] of Object.entries(GLSL_BIOMES))context['BIOME_'+name]=id;for(const [i,name] of ['NONE','RAIN','SNOW'].entries())context['PPT_'+name]=i;
        for(const [i,name] of ['NONE','TAIGA','EXTREME_HILLS','JUNGLE','MESA','PLAINS','SAVANNA','ICY','THEEND',
          'BEACH','FOREST','OCEAN','DESERT','RIVER','SWAMP','MUSHROOM','NETHER','UNDERGROUND','MOUNTAIN'].entries())context['CAT_'+name]=i;context.CAT_THE_END=context.CAT_THEEND;
        context.biome_category=10;
        context.temperature=0.7;context.rainfall=0.8;context.dhRenderDistance=0;
        context.moonPhase=WORLD_DAY%8;
        context.heldItemId=-1;context.heldItemId2=-1;context.heldBlockLightValue=0;context.heldBlockLightValue2=0;if(GB.state.active)Object.assign(context,GB.hooks.heldLightUniforms(),GB.hooks.nativeEffectUniforms());
        context.nightVision=GB.state.active?GB.hooks.nativeEffectUniforms().nightVision:0;context.hideGUI=0;
        updateVanillaSkyColors();for(const [name,values] of Object.entries({skyColor:SKY_COLOR,fogColor:(GB.state.active?GB.hooks.fogColor(eye):(eyeInWater(eye)?WATER_FOG_COLOR:FOG_COLOR))})){
          context[name]=[...values];
          for(let i=0;i<values.length;i++){context[name+'.'+'xyzw'[i]]=values[i];context[name+'.'+'rgba'[i]]=values[i];}
        }
        Object.assign(context,irisExpressionContext(irisUniformState(eye,now)),irisExpressionContext(engineVectors));
        context.biomeCategory=context.biome_category;context.biomePrecipitation=context.biome_precipitation??1;
        for(const entry of packSettings.uniforms){
          if(entry.error)continue;
          try{const value=evaluateProperty(entry.node,context,entry.name);if(!(Array.isArray(value)?value.every(Number.isFinite):Number.isFinite(value)))continue;context[entry.name]=value;if(Array.isArray(value))Object.assign(context,irisExpressionContext({[entry.name]:value}));if(entry.kind==='uniform')propertyResults.push({...entry,value});}
          catch(error){entry.lastError=error.message;}
        }
      }
      for(const {name,type,value} of propertyResults){
        if(Array.isArray(value)){const loc=uniform(program,name);if(loc!==null)gl.writeUniform(loc,value.map(v=>type.startsWith('i')?Math.trunc(v):type.startsWith('b')?+!!v:v));}
        else if(type==='float')u1f(program,name,value);else u1i(program,name,type==='bool'?+!!value:Math.trunc(value));
      }
    }

