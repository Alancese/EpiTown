(() => {
  'use strict';
  const $=id=>document.getElementById(id),all=selector=>[...document.querySelectorAll(selector)];
  const map=$('town3d'),manifest=window.EPITOWN_TOWN;if(!map||!manifest)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),finePointer=matchMedia('(hover: hover) and (pointer: fine)');
  const motionAllowed=()=>!reduced.matches&&!document.hidden&&!document.body.classList.contains('motion-paused');
  const chapterData=[['top','立体小镇','38 栋建筑 / 交互地图'],['demo','城市回放','七天轨迹 / 原始 Demo'],['question','干预沙盘','信念更新 / 概念演示'],['town','角色视角','市长 / 医生 / 公安 / 居民'],['method','方法闭环','干预 / 识别 / 决策'],['experiments','实验探索','基准 / 消融 / 评价']];
  function goTo(id,focus=false){
    const element=$(id);if(!element)return;
    const move=()=>{element.scrollIntoView({behavior:motionAllowed()?'smooth':'auto',block:'start'});if(focus)$('town-canvas').focus({preventScroll:true});};
    if(document.fullscreenElement&&!document.fullscreenElement.contains(element)){document.exitFullscreen().then(move).catch(()=>{});}else move();
  }
  function focusBuilding(id,origin='ui',yaw=.34){map.dispatchEvent(new CustomEvent('epitown:focus',{detail:{id,origin,yaw}}));}
  function flash(element){if(motionAllowed()&&element.animate)element.animate([{opacity:.4,transform:'translateY(5px)'},{opacity:1,transform:'none'}],{duration:380,easing:'ease-out'});}

  // Optional theme preference is the only persistent UI state.
  function setTheme(theme){
    document.documentElement.dataset.theme=theme;
    const night=theme==='night';$('ui-theme').setAttribute('aria-pressed',String(night));$('ui-theme').setAttribute('aria-label',night?'切换日间主题':'切换夜间主题');
    try{localStorage.setItem('epitown-theme',theme);}catch{}
  }
  let initialTheme='day';try{if(localStorage.getItem('epitown-theme')==='night')initialTheme='night';}catch{}
  setTheme(initialTheme);$('ui-theme').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='night'?'day':'night'));

  // Native dialog supplies focus containment, Escape and backdrop isolation.
  const dialog=$('ui-command'),search=$('ui-command-input'),results=$('ui-command-results');
  const destinations=[...chapterData.map(([id,name,description],i)=>({id,name,description,kind:'chapter',code:String(i+1).padStart(2,'0')})),...manifest.buildings.map(b=>({...b,description:b.id+' / '+b.category,kind:'building'}))];
  let matches=[],active=0;
  function markActive(){
    for(const [i,button] of [...results.children].entries())button.setAttribute('aria-selected',String(i===active));
    const current=results.children[active];if(current){search.setAttribute('aria-activedescendant',current.id);current.scrollIntoView({block:'nearest'});}else search.removeAttribute('aria-activedescendant');
  }
  function visit(item){if(!item)return;dialog.close();if(item.kind==='building'){focusBuilding(item.id);goTo('town3d',true);}else goTo(item.id);}
  function renderResults(){
    const query=search.value.trim().toLowerCase(),found=destinations.filter(item=>(item.name+' '+item.id+' '+item.description).toLowerCase().includes(query));
    matches=found.slice(0,20);active=0;results.replaceChildren();
    for(const [i,item] of matches.entries()){
      const button=document.createElement('button');button.type='button';button.className='ui-command-option';button.id='ui-result-'+i;button.tabIndex=-1;button.setAttribute('role','option');
      let icon;if(item.kind==='building'){icon=document.createElement('img');icon.src=item.preview;icon.alt='';icon.width=48;icon.height=42;}else{icon=document.createElement('span');icon.className='ui-section-icon';icon.textContent=item.code;}
      const label=document.createElement('span'),small=document.createElement('small'),arrow=document.createElement('span');small.textContent=item.description;label.append(document.createTextNode(item.name),small);arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');button.append(icon,label,arrow);
      button.addEventListener('click',()=>visit(item));button.addEventListener('pointermove',()=>{active=i;markActive();});results.append(button);
    }
    $('ui-command-count').textContent=found.length>20?'20 / '+found.length+' 处':found.length+' 处';$('ui-command-empty').hidden=matches.length!==0;markActive();
  }
  function openSearch(){if(dialog.open)return;search.value='';dialog.showModal();search.setAttribute('aria-expanded','true');renderResults();search.focus();}
  $('ui-command-open').addEventListener('click',openSearch);$('ui-command-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>search.setAttribute('aria-expanded','false'));
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();});
  search.addEventListener('input',renderResults);search.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();active=matches.length?(active+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length:0;markActive();}
    else if(event.key==='Enter'){event.preventDefault();visit(matches[active]);}
  });
  document.addEventListener('keydown',event=>{
    const editing=event.target.closest?.('input,textarea,[contenteditable=true]');
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();dialog.open?dialog.close():openSearch();}
    else if(event.key==='/'&&!editing&&!dialog.open){event.preventDefault();openSearch();}
  });

  const routes={
    civic:[['B01','市政厅：城市政策与层级汇报在这里汇合。'],['B03','综合医院：从诊疗与健康反馈观察城市。'],['B02','公安局：走向街道，理解秩序与居民行为。'],['B16','咖啡馆：观察居民的社交与日常活动。'],['A01','居民公寓：不同个体共享相邻的生活空间。'],['H01','居民小屋：回到个体，理解每个人的选择。']],
    life:[['H01','从一间小屋出发，走进居民的日常。'],['B07','商店：生活需求与经济活动在这里相遇。'],['B16','咖啡馆：相聚、交流与休息的一站。'],['A01','居民公寓：从一个家庭，走向整个街区。']]
  };
  let route=routes.civic,tourIndex=0,tourActive=false,tourTimer=0,tourPlaying=false;
  function stopPlayback(){clearTimeout(tourTimer);tourTimer=0;tourPlaying=false;$('ui-tour-play').setAttribute('aria-pressed','false');$('ui-tour-play').textContent='自动播放';}
  function planNext(){clearTimeout(tourTimer);if(tourPlaying&&motionAllowed())tourTimer=setTimeout(()=>{showStop((tourIndex+1)%route.length);planNext();},5500);}
  function showStop(index){
    tourIndex=(index+route.length)%route.length;const [id,description]=route[tourIndex],building=manifest.buildings.find(b=>b.id===id);
    $('ui-tour-label').textContent=String(tourIndex+1).padStart(2,'0')+' / '+String(route.length).padStart(2,'0')+' · '+building.name;
    $('ui-tour-description').textContent=description;
    for(const [i,button] of [...$('ui-tour-stops').children].entries())button.setAttribute('aria-pressed',String(i===tourIndex));
    focusBuilding(id,'tour',.25+(tourIndex%3)*.18);flash($('ui-tour-description'));
  }
  function beginTour(name='civic'){
    stopPlayback();route=routes[name]||routes.civic;tourActive=true;$('ui-tour-controls').hidden=false;$('ui-tour-description').hidden=false;$('ui-tour-toggle').textContent='结束导览 ×';$('ui-tour-stops').replaceChildren();
    for(const [i,stop] of route.entries()){const button=document.createElement('button');button.type='button';button.setAttribute('aria-label','第 '+(i+1)+' 站：'+manifest.buildings.find(b=>b.id===stop[0]).name);button.addEventListener('click',()=>{stopPlayback();showStop(i);});$('ui-tour-stops').append(button);}
    showStop(0);
  }
  function endTour(){stopPlayback();tourActive=false;$('ui-tour-controls').hidden=true;$('ui-tour-description').hidden=true;$('ui-tour-toggle').textContent='开始导览 ↗';$('ui-tour-label').textContent='38 栋建筑，等你探索';}
  $('ui-tour-toggle').addEventListener('click',()=>tourActive?endTour():beginTour());
  all('[data-route]').forEach(button=>button.addEventListener('click',()=>{beginTour(button.dataset.route);goTo('town3d',true);}));
  $('ui-tour-prev').addEventListener('click',()=>{stopPlayback();showStop(tourIndex-1);});$('ui-tour-next').addEventListener('click',()=>{stopPlayback();showStop(tourIndex+1);});
  $('ui-tour-play').addEventListener('click',()=>{if(tourPlaying){stopPlayback();return;}if(!tourActive||!motionAllowed())return;tourPlaying=true;$('ui-tour-play').setAttribute('aria-pressed','true');$('ui-tour-play').textContent='暂停导览';planNext();});
  map.addEventListener('epitown:selection',event=>{if(tourActive&&event.detail.origin!=='tour')endTour();});
  for(const type of ['pointerdown','wheel','keydown'])$('town-canvas').addEventListener(type,stopPlayback,{passive:type==='wheel'});
  for(const id of ['town-reset','town-isolate','town-top'])$(id).addEventListener('click',endTour);
  new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)stopPlayback();},{threshold:.1}).observe(map);

  const places={mayor:['B01','市政厅'],doctor:['B03','综合医院'],police:['B02','公安局'],resident:['H01','居民小屋']};let role='mayor';
  function selectRole(name){
    if(!places[name])return;role=name;const [id,label]=places[name];$('ui-role-image').src='assets/town3d/previews/'+id+'.png';$('ui-role-image').alt=label+'立体模型';$('ui-role-place').textContent=label;
    all('.hierarchy .node').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.node===name)));flash($('role-panel'));
  }
  all('.role-tabs button').forEach(button=>button.addEventListener('click',()=>selectRole(button.dataset.role)));
  document.querySelector('.hierarchy').setAttribute('role','group');
  all('.hierarchy .node').forEach(node=>{
    node.setAttribute('role','button');node.setAttribute('tabindex','0');node.setAttribute('aria-label','查看'+{mayor:'市长',doctor:'医生',police:'公安',resident:'居民'}[node.dataset.node]+'视角');node.setAttribute('aria-pressed',String(node.dataset.node==='mayor'));
    const activate=()=>$('role-'+node.dataset.node).click();node.addEventListener('click',activate);node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}});
  });
  $('ui-role-locate').addEventListener('click',()=>{focusBuilding(places[role][0]);goTo('town3d',true);});

  const steps=[
    {code:'01 / ACT TO UNDERSTAND',title:'提出一个能被观察回答的问题。',action:'改变信息发布或服务安排。',observe:'居民如何回应这一次变化。',next:'把反馈带入机制判断。',phase:1,label:'体验一次干预 ↗'},
    {code:'02 / LEARN THE LEARNING',title:'从反馈中，重新分配我们的相信。',action:'结合已有判断与新观察。',observe:'不同机制对反馈的解释差异。',next:'保留不确定性，形成更新后的信念。',phase:3,label:'查看信念更新 ↗'},
    {code:'03 / DECIDE WITH INSIGHT',title:'让新的理解，影响下一次行动。',action:'把机制判断用于下一轮规划。',observe:'长期影响与新的信息需求。',next:'回到干预，继续识别与学习。',phase:0,label:'回到沙盘继续探索 ↗'}
  ];let methodIndex=0;
  function chooseMethod(index){
    const step=steps[index];if(!step)return;methodIndex=index;
    for(const key of ['code','title','action','observe','next'])$('ui-method-'+key).textContent=step[key];$('ui-method-demo').textContent=step.label;
    all('[data-method]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.method)===index)));
    all('[data-method-card]').forEach(card=>card.dataset.active=String(Number(card.dataset.methodCard)===index));
    all('.ui-method-track i').forEach((item,i)=>item.classList.toggle('active',i===index));flash($('ui-method-insight'));
  }
  all('[data-method]').forEach(button=>button.addEventListener('click',()=>chooseMethod(Number(button.dataset.method))));
  $('ui-method-demo').addEventListener('click',()=>{document.querySelector('[data-phase="'+steps[methodIndex].phase+'"]').click();goTo('lab');});chooseMethod(0);
  all('.experiment-tabs button').forEach(button=>button.addEventListener('click',()=>flash($('exp-panel'))));

  let snapshot=null;
  const probabilityNodes=all('[data-probability]'),beliefNames=['经验强化','风险更新','社会模仿'];
  function currentBelief(){return probabilityNodes.map(node=>Number.parseFloat(node.textContent)||0);}
  const rows=beliefNames.map(name=>{
    const row=document.createElement('div');row.className='ui-compare-row';const head=document.createElement('div'),label=document.createElement('span'),value=document.createElement('output'),bars=document.createElement('div'),saved=document.createElement('i'),current=document.createElement('b'),delta=document.createElement('small');
    label.textContent=name;head.append(label,value);bars.className='ui-compare-bars';bars.setAttribute('aria-hidden','true');bars.append(saved,current);row.append(head,bars,delta);$('ui-compare-rows').append(row);return {value,saved,current,delta};
  });
  function updateComparison(){
    if(!snapshot)return;const values=currentBelief();
    for(const [i,row] of rows.entries()){const change=values[i]-snapshot.values[i];row.value.textContent=snapshot.values[i].toFixed(1)+'% → '+values[i].toFixed(1)+'%';row.saved.style.width=snapshot.values[i]+'%';row.current.style.width=values[i]+'%';row.delta.textContent=(change>0?'+':'')+change.toFixed(1)+' 个百分点';}
  }
  $('ui-save-belief').addEventListener('click',()=>{
    const policy=document.querySelector('[data-policy][aria-pressed=true]').dataset.policy;
    snapshot={values:currentBelief(),context:{risk:'信息发布',service:'服务调整',social:'群体反馈'}[policy]+' · 区分度 '+$('lab-clarity').value+'%'};
    $('ui-saved-context').textContent='已保存：'+snapshot.context;$('ui-compare-results').hidden=false;$('ui-clear-belief').hidden=false;$('ui-save-belief').textContent='更新保存值 ↻';$('ui-compare-hint').textContent='灰色为保存值，绿色为当前值。差值来自本页概念沙盘，不代表真实实验结果。';$('ui-compare-live').textContent='当前信念已保存，可调整沙盘进行比较。';updateComparison();
  });
  $('ui-clear-belief').addEventListener('click',()=>{snapshot=null;$('ui-compare-results').hidden=true;$('ui-clear-belief').hidden=true;$('ui-save-belief').textContent='保存当前信念 ＋';$('ui-compare-hint').textContent='保存沙盘当前显示的三个概率，再调整情境或信号区分度，比较两次判断。';});
  new MutationObserver(updateComparison).observe($('lab'),{subtree:true,characterData:true,childList:true});

  let scrollFrame=0;
  function scrollUpdate(){
    scrollFrame=0;const y=window.scrollY||0,max=document.documentElement.scrollHeight-window.innerHeight,progress=max>0?Math.min(100,y/max*100):0;
    if(document.body.classList.contains('ui-scrolled')!==(y>24))document.body.classList.toggle('ui-scrolled',y>24);
    $('ui-back-top').hidden=y<500;$('ui-back-top').style.setProperty('--read-progress',progress.toFixed(2));
    let activeChapter='top';for(const [id] of chapterData)if($(id).getBoundingClientRect().top<=window.innerHeight*.32)activeChapter=id;
    all('[data-chapter]').forEach(link=>{if(link.dataset.chapter===activeChapter)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
    const closing=document.querySelector('.closing-word'),box=closing.getBoundingClientRect();if(box.top<window.innerHeight&&box.bottom>0)closing.style.setProperty('--closing-shift',motionAllowed()?Math.max(-18,Math.min(18,(box.top/window.innerHeight-.5)*28))+'px':'0px');
  }
  const queueScroll=()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(scrollUpdate);};
  window.addEventListener('scroll',queueScroll,{passive:true});window.addEventListener('resize',queueScroll);$('ui-back-top').addEventListener('click',()=>goTo('top'));queueScroll();
  const countObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;countObserver.unobserve(entry.target);const node=entry.target,final=node.textContent,value=Number(final);if(!motionAllowed())continue;let start=null;const step=time=>{if(start===null)start=time;const t=Math.min(1,(time-start)/850);node.textContent=motionAllowed()?String(Math.round(value*(1-Math.pow(1-t,3)))).padStart(final.length,'0'):final;if(t<1&&motionAllowed())requestAnimationFrame(step);else node.textContent=final;};requestAnimationFrame(step);}},{threshold:.7});
  all('.index-strip strong').filter(node=>/^\d+$/.test(node.textContent.trim())).forEach(node=>countObserver.observe(node));
  all('.method-card').forEach(card=>{card.addEventListener('pointermove',event=>{if(!finePointer.matches||!motionAllowed())return;const box=card.getBoundingClientRect();card.style.setProperty('--spot-x',event.clientX-box.left+'px');card.style.setProperty('--spot-y',event.clientY-box.top+'px');});});
  all('.button').forEach(button=>{
    button.addEventListener('pointermove',event=>{if(!finePointer.matches||!motionAllowed())return;const box=button.getBoundingClientRect();button.style.translate=((event.clientX-box.left)/box.width-.5)*5+'px '+((event.clientY-box.top)/box.height-.5)*5+'px';});button.addEventListener('pointerleave',()=>button.style.translate='');
    button.addEventListener('click',event=>{if(!motionAllowed())return;const box=button.getBoundingClientRect(),ripple=document.createElement('i');ripple.className='ui-ripple';ripple.setAttribute('aria-hidden','true');ripple.style.left=(event.detail?event.clientX-box.left:box.width/2)-6+'px';ripple.style.top=(event.detail?event.clientY-box.top:box.height/2)-6+'px';button.append(ripple);setTimeout(()=>ripple.remove(),700);});
  });
  function syncMotion(){if(!motionAllowed())stopPlayback();$('ui-tour-play').disabled=reduced.matches||document.body.classList.contains('motion-paused');queueScroll();}
  new MutationObserver(syncMotion).observe(document.body,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',syncMotion);reduced.addEventListener('change',syncMotion);syncMotion();
})();
