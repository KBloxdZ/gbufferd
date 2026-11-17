    const PACK_GAME_VERSION=11900;
    const PACK_BLOCK_CANDIDATES={"grass":[["grass_block","snowy=false"],["grass_block",""],["grass","snowy=false"]],"dirt":[["dirt",""]],"stone":[["stone",""]],"sand":[["sand",""]],"gravel":[["gravel",""]],"snow":[["snow_block",""],["snow",""]],"oak_log":[["oak_log",""],["log","variant=oak"]],"spruce_log":[["spruce_log",""],["log","variant=spruce"]],"birch_log":[["birch_log",""],["log","variant=birch"]],"oak_leaves":[["oak_leaves",""],["leaves",""]],"spruce_leaves":[["spruce_leaves",""],["leaves",""]],"birch_leaves":[["birch_leaves",""],["leaves",""]],"white_concrete":[["white_concrete",""]],"glowstone":[["glowstone",""]],"sea_lantern":[["sea_lantern",""]],"gold_block":[["gold_block",""]],"water":[["water",""],["flowing_water",""]],"short_grass":[["short_grass",""],["grass",""],["tallgrass",""]],"fern":[["fern",""]],"tall_grass_bottom":[["tall_grass","half=lower"],["double_plant","half=lower"]],"tall_grass_top":[["tall_grass","half=upper"],["double_plant","half=upper"]],"poppy":[["poppy",""],["red_flower",""]],"dandelion":[["dandelion",""],["yellow_flower",""]],"oxeye_daisy":[["oxeye_daisy",""],["red_flower",""]],"cornflower":[["cornflower",""],["red_flower",""]]};
    let packBlockIds=null,emissiveMaterials=new Set();
    function parseBlockProperties(text){
      const ids=new Map();
      for(const raw of text.split('\n')){
        const line=raw.trim();
        if(line.startsWith('#'))continue;
        for(const part of line.split(/(?=\bblock\.\d+\s*=)/)){
          const head=part.match(/^block\.(\d+)\s*=\s*([\s\S]*)$/);
          if(!head)continue;
          const id=Number(head[1]);
          for(const entry of head[2].trim().split(/\s+/)){
            if(!entry)continue;
            const pieces=entry.split(':');
            let name=pieces[0],state=pieces.slice(1).join(':');
            if(pieces.length>1&&!pieces[1].includes('=')){name=pieces[1];state=pieces.slice(2).join(':');}
            for(const key of state?[name+':'+state,name]:[name])if(!ids.has(key))ids.set(key,id);
          }
        }
      }
      return ids;
    }
    const LEGACY_BLOCK_PROPERTIES=['block.1=stone granite diorite andesite','block.2=grass_block','block.4=cobblestone','block.50=torch','block.89=glowstone','block.124=redstone_lamp','block.12=sand','block.24=sandstone','block.41=gold_block','block.42=iron_block','block.57=diamond_block','block.-123=emerald_block','block.9=water','block.11=lava','block.79=ice','block.18=oak_leaves birch_leaves jungle_leaves spruce_leaves acacia_leaves dark_oak_leaves','block.31=grass seagrass sweet_berry_bush','block.59=wheat carrots potatoes','block.37=dandelion poppy blue_orchid allium azure_bluet red_tulip pink_tulip white_tulip orange_tulip oxeye_daisy cornflower lily_of_the_valley wither_rose','block.175=sunflower lilac tall_grass large_fern rose_bush peony tall_seagrass tall_grass:half=lower tall_grass:half=upper','block.51=fire','block.111=lily_pad'].join('\n');
    function readBlockProperties(settings){
      const path=Object.keys(settings.packSources).find(name=>/^shaders\/block\.properties$/i.test(name));
      if(!path)return parseBlockProperties(LEGACY_BLOCK_PROPERTIES);
      const overrides={...Object.fromEntries(Object.entries(settings.options).map(([name,option])=>[name,option.value])),...settings.values};
      const defines=Object.fromEntries(Object.entries(overrides).filter(([,value])=>value!==false).map(([name,value])=>[name,value===true?'1':String(value)]));
      try{return parseBlockProperties(glslPreprocess(path,{files:settings.packSources,defines,undefine:['IRIS_TAG_SUPPORT'],overrides,text:true,continuation:' '}).code);}catch(error){return null;}
    }
    function packBlockId(type,fallback){
      if(!packBlockIds)return fallback;
      for(const [name,state] of PACK_BLOCK_CANDIDATES[type]||[]){
        const id=packBlockIds.get(state?name+':'+state:name);
        if(id!==undefined)return id;
      }
      return 0;
    }
    function refreshEmissiveMaterials(){
      emissiveMaterials=new Set(['glowstone','sea_lantern','lava','magma_block','nether_portal'].map(type=>packBlockId(type,0)).filter(id=>id>0));
    }
    const isEmissiveMaterial=material=>emissiveMaterials.has(material);
    let meshedSeparateAo=null;
    function applyPackBlockIds(ids){
      const signature=list=>{
        const saved=packBlockIds;packBlockIds=list;
        const value=Object.keys(PACK_BLOCK_CANDIDATES).map(type=>packBlockId(type,-1)).join(',');
        packBlockIds=saved;return value;
      };
      const before=signature(packBlockIds),after=signature(ids);
      packBlockIds=ids;refreshEmissiveMaterials();
      const separateAo=activePackProperties.separateAo==='true',sameAo=meshedSeparateAo===separateAo;meshedSeparateAo=separateAo;
      if(before===after&&sameAo)return;
      meshJob=null;pendingChunkKeys=[];
      if(typeof pendingChunkRebuilds!=='undefined')pendingChunkRebuilds.clear();
      for(const mesh of worldChunks.values())destroyChunkMesh(mesh);
      worldChunks.clear();visibleChunkMeshes=[];
      ensureWorldGeometry(true);
    }
