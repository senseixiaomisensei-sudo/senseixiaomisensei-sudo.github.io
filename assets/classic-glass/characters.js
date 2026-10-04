import { Spring } from './motion.js';
import { clamp, expansionThreshold, dragAxis, deckExtent, visualPosition, neighborId } from './interaction-core.js?v=20261003-fluid-1';

// Presentation only. Original option buttons still own role IDs and selection.
export function initCharacterModes({ root, document, isClassic, text, reduced,
  storage, Observer = globalThis.MutationObserver, Resize = globalThis.ResizeObserver,
  raf = globalThis.requestAnimationFrame, caf = globalThis.cancelAnimationFrame,
  now = () => performance.now() }) {
  let mode = 'default';
  try { storage ??= globalThis.localStorage; if (storage.getItem('postprep-character-view') === 'stack') mode = 'stack'; } catch {}
  const galleries = ['rvc-model-gallery','rvc-trained-model-gallery'].map(id=>document.getElementById(id)).filter(Boolean);
  if (!galleries.length) return () => {};
  const switcher=document.createElement('div'); switcher.className='classic-only classic-character-toolbar';
  const label=document.createElement('span'), toggle=document.createElement('div');
  toggle.className='classic-character-switch'; toggle.setAttribute('role','group');
  const pill=document.createElement('span'); pill.className='classic-character-pill'; pill.setAttribute('aria-hidden','true'); toggle.append(pill);
  const modes=['default','stack'].map(value=>{
    const button=document.createElement('button'); button.type='button'; button.dataset.view=value;
    button.addEventListener('click',()=>{mode=value;try{storage.setItem('postprep-character-view',mode);}catch{} refresh();});
    toggle.append(button);return button;
  });
  switcher.append(label,toggle);galleries[0].before(switcher);
  const controllers=galleries.map(gallery=>{
    const nav=document.createElement('div');nav.className='classic-character-nav';
    const prev=document.createElement('button'),status=document.createElement('span'),next=document.createElement('button');
    prev.type=next.type='button';prev.textContent='←';next.textContent='→';
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');nav.append(prev,status,next);
    const layouts=document.createElement('div');layouts.className='classic-character-layouts';layouts.setAttribute('role','group');
    const layoutButtons=['stack','horizontal','vertical'].map(value=>{
      const button=document.createElement('button');button.type='button';button.dataset.layout=value;
      button.addEventListener('click',()=>setLayout(value));layouts.append(button);return button;
    });
    const hint=document.createElement('small');hint.className='classic-character-hint';nav.append(layouts,hint);gallery.after(nav);
    let cards=[],order=[],snapshots=new Map(),motion=new Map(),byId=new Map(),renderCards=new Set(),frontId='';
    let layout='stack',frame=0,previous=0,grab=null,suppressClick=false,width=300,height=184,galleryWidth=332;
    let accessKey='',paintedHeight='';
    const expansion=new Spring(0),vertical=new Spring(0);
    const active=()=>isClassic()&&mode==='stack';
    const frontCard=()=>byId.get(frontId);
    const rect=()=>gallery.getBoundingClientRect?.()||{width:332,height:246};
    function measure(){
      galleryWidth=rect().width;width=Math.min(380,Math.max(120,galleryWidth-32));
      if(!active())return;
      gallery.classList.add('is-character-stack');
      cards.forEach(card=>{card.style.width=`${width}px`;card.style.removeProperty('height');});
      // Read natural content heights together after width is set; long role names remain whole.
      height=Math.max(184,...cards.map(card=>card.offsetHeight||184));
      cards.forEach(card=>card.style.height=`${height}px`);
    }
    function cancelCapture(){
      const held=grab;grab=null;delete gallery.dataset.dragging;
      delete gallery.dataset.panning;
      if(held){delete held.card.dataset.stackHeld;try{held.capture.releasePointerCapture?.(held.id);}catch{}}
    }
    function restore(){
      cancelCapture();caf(frame);frame=0;
      cards.forEach(card=>{
        const saved=snapshots.get(card);if(!saved)return;
        ['transform','filter','opacity','z-index','width','height','--character-content'].forEach(name=>card.style.removeProperty(name));
        card.inert=saved.inert;
        for(const [key,value]of[['aria-hidden',saved.hidden],['tabindex',saved.tab]]){if(value===null)card.removeAttribute(key);else card.setAttribute(key,value);}
        for(const key of['stackRear','stackOff','stackHeld'])delete card.dataset[key];
      });
      gallery.classList.remove('is-character-stack');gallery.style.removeProperty('height');gallery.style.removeProperty('--stack-width');
      delete gallery.dataset.stackLayout;delete gallery.dataset.animating;gallery.scrollLeft=0;
      expansion.value=expansion.target=expansion.velocity=0;vertical.value=vertical.target=vertical.velocity=0;
      layout='stack';suppressClick=false;accessKey='';paintedHeight='';renderCards.clear();
    }
    function announce(){
      const position=visualPosition(order,frontId);
      status.textContent=cards.length?`${position.position} / ${position.total} · ${frontCard()?.getAttribute('aria-selected')==='true'?text('已选用','Selected'):text('点击选用','Click to select')}`:text('没有匹配角色','No matching voices');
      prev.disabled=next.disabled=cards.length<2;
      layoutButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.layout===layout)));
    }
    function access(){
      const spread=expansion.target>.8;
      const key=`${frontId}:${spread}:${layout}`;
      if(key===accessKey)return;accessKey=key;
      cards.forEach(card=>{
        const rear=card.dataset.modelId!==frontId;card.dataset.stackRear=String(rear&&!spread);
        card.inert=rear&&!spread;card.setAttribute('aria-hidden',String(rear&&!spread));card.tabIndex=rear&&!spread?-1:0;
      });announce();
    }
    function includeVisible(){
      const front=order.indexOf(frontId),spread=expansion.target>0||expansion.value>.001;
      order.forEach((id,position)=>{
        const card=byId.get(id),depth=(position-front+order.length)%order.length;
        if(spread||depth<3||card===grab?.card){renderCards.add(card);card.dataset.stackOff='false';}
        else if(!renderCards.has(card))card.dataset.stackOff='true';
      });
    }
    function targets(){
      const front=order.indexOf(frontId),q=clamp(expansion.value,0,1),v=clamp(vertical.value,0,1);
      const center=Math.max(0,(galleryWidth-width)/2);
      for(const card of renderCards){
        const position=motion.get(card).position,state=motion.get(card);
        const depth=Math.min(3,(position-front+order.length)%order.length);
        state.x.target=center*(1-q)+position*(width+18)*q*(1-v)+center*q*v;
        state.y.target=10+depth*22*(1-q)+position*(height+16)*q*v;
        state.depth.target=depth*(1-q);state.rotation.target=(grab?.dx<0?-1:1)*depth*1.5*(1-q);
      }
    }
    function paintCard(card){
      const state=motion.get(card),held=grab?.dragged&&grab.card===card,depth=clamp(state.depth.value,0,3);
      const x=held?grab.visualX+grab.dx:state.x.value,y=held?grab.visualY+grab.dy:state.y.value;
      const angle=held?clamp(grab.dx/35,-7,7):state.rotation.value;
      const hidden=!held&&expansion.value<.001&&state.depth.target>2&&depth>=2.98;
      card.style.transform=`translate3d(${x}px,${y}px,0) rotate(${angle}deg)`;
      card.style.opacity=String(held?1:Math.max(.62,1-depth*.12));
      card.style.zIndex=held?'100':String(Math.round((4-depth)*10));
      card.dataset.stackOff=String(hidden);
      return{id:card.dataset.modelId,x,y,w:width,h:height,r:angle,opacity:hidden?0:1};
    }
    function paint(time){
      frame=0;if(!active()||document.hidden)return;
      const dt=(time-previous)/1000||1/60;previous=time;
      // One geometry read per animation frame, before writes; never per pointer event.
      if(grab?.dragged){const current=rect();
        grab.visualX=grab.anchorX+grab.originX-(current.left||0)+(gallery.scrollLeft||0)-grab.scrollX;
        grab.visualY=grab.anchorY+grab.originY-(current.top||0);}
      let moving=expansion.step(dt,reduced.matches)|vertical.step(dt,reduced.matches);targets();
      const bounds=[];
      for(const card of renderCards){const state=motion.get(card);
        for(const key of ['x','y','depth','rotation'])moving=state[key].step(dt,reduced.matches)||moving;
        bounds.push(paintCard(card));
        if(card.dataset.stackOff==='true')renderCards.delete(card);
      }
      const targetHeight=10+height+(layout==='vertical'?Math.max(0,cards.length-1)*(height+16):52);
      // Current rendered bounds keep controls outside the entire in-flight deck.
      const nextHeight=`${Math.ceil(deckExtent(bounds,{targetHeight,gap:20,heldId:grab?.dragged?grab.card.dataset.modelId:null}))}px`;
      if(nextHeight!==paintedHeight){gallery.style.height=nextHeight;paintedHeight=nextHeight;}
      if(moving)frame=raf(paint);else if(!grab?.dragged)delete gallery.dataset.animating;
    }
    function wake(){if(active()&&!document.hidden&&!frame){gallery.dataset.animating='true';previous=now();frame=raf(paint);}if(!active()||document.hidden){caf(frame);frame=0;delete gallery.dataset.animating;}}
    function setLayout(value){
      if(!active())return;if(grab)cancelCapture();
      const previousLayout=layout;
      if(layout==='horizontal'&&value!=='horizontal'){
        const offset=gallery.scrollLeft||0;
        for(const state of motion.values())state.x.value-=offset;
      }
      if(layout==='stack'&&value!=='stack')rotateOrder();
      layout=value;gallery.dataset.stackLayout=value;expansion.target=value==='stack'?0:1;vertical.target=value==='vertical'?1:0;
      if(previousLayout!=='horizontal'||value!=='horizontal')gallery.scrollLeft=0;
      includeVisible();access();wake();
    }
    function rotateOrder(){const i=order.indexOf(frontId);order=[...order.slice(i),...order.slice(0,i)];
      order.forEach((id,position)=>{motion.get(byId.get(id)).position=position;});}
    function browse(delta){
      if(!active()||!cards.length)return;frontId=neighborId(order,frontId,delta);
      if(layout==='horizontal')gallery.scrollLeft=order.indexOf(frontId)*(width+18);
      if(layout==='vertical')frontCard()?.scrollIntoView?.({block:'nearest',behavior:reduced.matches?'auto':'smooth'});
      includeVisible();access();wake();
    }
    prev.addEventListener('click',()=>browse(-1));next.addEventListener('click',()=>browse(1));
    gallery.addEventListener('keydown',event=>{
      if(!active()||event.target.closest('input,select,textarea')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Escape'].includes(event.key))return;
      event.preventDefault();if(event.key==='Escape'){
        const focused=event.target.closest?.('[data-model-id]');if(focused)frontId=focused.dataset.modelId;
        setLayout('stack');frontCard()?.focus({preventScroll:true});return;
      }
      if(event.key==='Home'||event.key==='End'){frontId=order[event.key==='Home'?0:order.length-1]||'';includeVisible();access();wake();}
      else browse(['ArrowRight','ArrowDown'].includes(event.key)?1:-1);frontCard()?.focus({preventScroll:true});
    });
    gallery.addEventListener('pointerdown',event=>{
      if(!active()||event.button!==0||event.isPrimary===false||cards.length<2||grab)return;
      const card=event.target.closest?.('[data-model-id]')||frontCard();if(!card||card.inert)return;
      frontId=card.dataset.modelId;suppressClick=false;access();const state=motion.get(card);
      const origin=rect();
      grab={id:event.pointerId,card,x:event.clientX,y:event.clientY,dx:0,dy:0,visualX:state.x.value,visualY:state.y.value,
        anchorX:state.x.value,anchorY:state.y.value,
        originX:origin.left||0,originY:origin.top||0,scrollX:gallery.scrollLeft||0,
        threshold:expansionThreshold(width,height,{ratio:.95,min:180,max:240}),startLayout:layout,
        axis:layout==='vertical'?'vertical':'horizontal',kind:layout==='horizontal'?null:'card',pointerType:event.pointerType,
        dragged:false,expanded:false};
      grab.capture=card.setPointerCapture?card:gallery;
      try{grab.capture.setPointerCapture(event.pointerId);}catch{}
    });
    gallery.addEventListener('pointermove',event=>{
      if(!grab||grab.id!==event.pointerId)return;grab.dx=event.clientX-grab.x;grab.dy=event.clientY-grab.y;
      if(grab.kind===null&&Math.hypot(grab.dx,grab.dy)>3)grab.kind=Math.abs(grab.dx)>=Math.abs(grab.dy)?'pan':'card';
      if(grab.kind==='pan'){
        grab.dragged=true;gallery.dataset.panning='true';
        if(grab.pointerType!=='touch'){event.preventDefault?.();gallery.scrollLeft=grab.scrollX-grab.dx;}
        return;
      }
      if(!grab.dragged&&Math.hypot(grab.dx,grab.dy)>3){grab.dragged=true;gallery.dataset.dragging='true';grab.card.dataset.stackHeld='true';}
      if(!grab.dragged)return;event.preventDefault?.();
      const candidate=dragAxis(grab.dx,grab.dy,grab.axis);
      grab.axis=candidate;
      const pull=grab.axis==='vertical'?Math.abs(grab.dy):Math.abs(grab.dx),oldLayout=layout;
      if(pull>=grab.threshold){
        if(layout==='stack')rotateOrder();
        layout=grab.axis;grab.expanded=true;
      }else if(grab.expanded&&pull<grab.threshold*.44){layout='stack';grab.expanded=false;}
      // Short swipes only move the held card; do not fan the entire catalog out.
      expansion.target=grab.expanded||layout!=='stack'?1:0;
      vertical.target=grab.axis==='vertical'?1:0;gallery.dataset.stackLayout=layout;access();
      if(oldLayout!==layout)includeVisible();
      // Held position follows this event immediately; neighbouring cards follow springs.
      paintCard(grab.card);wake();
    });
    function release(event,cancelled=false){
      if(!grab||grab.id!==event.pointerId)return;const held=grab,state=motion.get(held.card);
      if(held.kind==='pan'){
        cancelCapture();delete gallery.dataset.panning;suppressClick=held.dragged&&!cancelled;
        frontId=order[clamp(Math.round((gallery.scrollLeft||0)/(width+18)),0,order.length-1)]||frontId;announce();return;
      }
      // Dropping on another spread card stacks around that identity. The gesture
      // that first opens a deck cannot accidentally hit its original neighbours.
      const destination=!cancelled&&held.dragged&&held.startLayout!=='stack'?cards.find(card=>{
        if(card===held.card)return false;const box=card.getBoundingClientRect?.();
        return box&&event.clientX>=box.left&&event.clientX<=box.right&&event.clientY>=box.top&&event.clientY<=box.bottom;
      }):null;
      if(held.dragged){state.x.value=held.visualX+held.dx;state.y.value=held.visualY+held.dy;state.x.velocity=state.y.velocity=0;}
      cancelCapture();suppressClick=held.dragged&&!cancelled;
      if(!held.dragged)return;
      if(cancelled){setLayout(held.startLayout);return;}
      if(destination){frontId=destination.dataset.modelId;setLayout('stack');return;}
      if(held.expanded)setLayout(layout);
      else if(held.startLayout!=='stack')setLayout(layout);
      else{setLayout('stack');const distance=held.axis==='vertical'?held.dy:held.dx;
        if(Math.abs(distance)>=24)browse(distance<0?1:-1);}
    }
    gallery.addEventListener('pointerup',event=>release(event));gallery.addEventListener('pointercancel',event=>release(event,true));
    gallery.addEventListener('lostpointercapture',event=>release(event,true));
    gallery.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
    gallery.addEventListener('scroll',()=>{
      if(layout!=='horizontal'||grab||Math.abs(expansion.value-1)>.001)return;
      frontId=order[clamp(Math.round(gallery.scrollLeft/(width+18)),0,order.length-1)]||frontId;announce();
    },{passive:true});
    document.addEventListener('scroll',()=>{
      if(layout!=='vertical'||grab||Math.abs(expansion.value-1)>.001)return;
      const viewport=document.documentElement?.clientHeight||globalThis.innerHeight||600,reference=Math.max(132,viewport*.35);
      let closest=null,distance=Infinity;
      for(const card of cards){const box=card.getBoundingClientRect?.();if(!box||box.bottom<=112||box.top>=viewport)continue;
        const delta=Math.abs(box.top+box.height/2-reference);if(delta<distance){distance=delta;closest=card;}}
      if(closest){frontId=closest.dataset.modelId;announce();}
    },{passive:true});
    if(Resize)new Resize(()=>{
      // Height is driven by the spring: reacting to our own height would cancel every drag.
      if(Math.abs(rect().width-galleryWidth)<.5)return;
      if(grab)release({pointerId:grab.id},true);measure();wake();
    }).observe(gallery);
    return{
      refresh(){
        const nextCards=[...gallery.querySelectorAll('[data-model-id]')];
        if(nextCards.length!==cards.length||nextCards.some((card,i)=>card!==cards[i])){
          const sameIds=nextCards.length===cards.length&&nextCards.every((card,i)=>card.dataset.modelId===cards[i].dataset.modelId);
          const savedLayout=layout,savedOrder=[...order],savedExpansion=expansion.value,savedVertical=vertical.value,savedScroll=gallery.scrollLeft||0;
          const savedMotion=new Map(cards.map(card=>[card.dataset.modelId,motion.get(card)]));
          restore();cards=nextCards;order=cards.map(card=>card.dataset.modelId);snapshots=new Map();motion=new Map();byId=new Map(cards.map(card=>[card.dataset.modelId,card]));
          if(sameIds){order=savedOrder;layout=savedLayout;expansion.value=expansion.target=layout==='stack'?0:savedExpansion;vertical.value=savedVertical;vertical.target=layout==='vertical'?1:0;}
          if(!order.includes(frontId))frontId=(cards.find(card=>card.getAttribute('aria-selected')==='true')||cards[0])?.dataset.modelId||'';
          measure();cards.forEach((card,i)=>{
            snapshots.set(card,{inert:card.inert,hidden:card.getAttribute('aria-hidden'),tab:card.getAttribute('tabindex')});
            const depth=Math.min(3,(i-order.indexOf(frontId)+cards.length)%cards.length);
            const state=sameIds?savedMotion.get(card.dataset.modelId):{x:new Spring((galleryWidth-width)/2),y:new Spring(10+depth*22),depth:new Spring(depth),rotation:new Spring(0)};
            state.position=order.indexOf(card.dataset.modelId);motion.set(card,state);
          });
          if(sameIds&&layout==='horizontal')gallery.scrollLeft=savedScroll;
        }
        nav.hidden=!active()||!cards.length;
        prev.setAttribute('aria-label',text('上一个角色','Previous voice'));next.setAttribute('aria-label',text('下一个角色','Next voice'));
        layouts.setAttribute('aria-label',text('卡片展开方向','Card arrangement'));
        layoutButtons.forEach((button,i)=>button.textContent=[text('收拢','Stack'),text('横向摊开','Horizontal'),text('纵向摊开','Vertical')][i]);
        hint.textContent=text('短滑翻阅 · 大幅横拖或竖拖摊开 · 回拉收拢','Short swipe to browse · Long horizontal or vertical pull to spread · Pull back to stack');
        if(active()){if(!gallery.classList.contains?.('is-character-stack'))measure();gallery.dataset.stackLayout=layout;includeVisible();access();wake();}else restore();
      },wake,visibility(){if(document.hidden&&grab)release({pointerId:grab.id},true);wake();}
    };
  });
  function refresh(){
    switcher.hidden=!isClassic();label.textContent=text('角色呈现','Voice view');toggle.setAttribute('aria-label',text('角色选择模式','Voice selection view'));toggle.dataset.active=mode;
    modes.forEach((button,i)=>{button.textContent=i===0?text('默认','Default'):text('组件堆叠','Stack');button.setAttribute('aria-pressed',String(button.dataset.view===mode));});
    controllers.forEach(controller=>controller.refresh());
  }
  galleries.forEach(gallery=>new Observer(refresh).observe(gallery,{childList:true,subtree:true}));
  document.addEventListener('visibilitychange',()=>controllers.forEach(controller=>controller.visibility()));
  reduced.addEventListener?.('change',refresh);refresh();return refresh;
}
