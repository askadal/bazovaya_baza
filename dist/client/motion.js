/* A progressive entrance: the catalogue remains usable if motion is interrupted. */
(() => {
 'use strict';
 const root=document.documentElement;
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 const activeEffects=new Set();
 let finishEntrance=()=>{};
 const canEnter=!preference.matches&&!new URLSearchParams(location.search).has('product')&&!location.hash;
 if(canEnter)root.classList.add('site-entering');
 // Also release the page if a font, animation, or later script fails to load.
 let entranceExpired=false;
 const release=setTimeout(()=>{
  entranceExpired=true;finishEntrance();
  root.classList.remove('site-entering','site-entering-ready');
 },3500);

 async function enter(){
  const title=document.querySelector('.intro h1');
  const subtitle=document.querySelector('.intro p');
  const catalog=document.querySelector('#catalog');
  const collection=document.querySelector('#collectionButton');
  const original=title?.textContent;
  const animations=[];
  let ended=false;
  const interruptions=['wheel','touchmove','pointerdown','keydown','resize','pagehide'];
  const finish=()=>{
   if(ended)return;
   ended=true;
   clearTimeout(release);
   animations.forEach(animation=>animation.cancel());
   root.classList.remove('site-entering','site-entering-ready');
   // Keep the same letter layout after the transition: restoring a text node
   // here re-enables kerning and visibly contracts the finished heading.
   interruptions.forEach(event=>window.removeEventListener(event,finish));
  };
  finishEntrance=finish;
  if(!canEnter||preference.matches||entranceExpired||!title||!catalog||!title.animate||window.scrollY>4){finish();return;}
  interruptions.forEach(event=>window.addEventListener(event,finish,{passive:true}));
  await Promise.race([document.fonts?.ready??Promise.resolve(),new Promise(resolve=>setTimeout(resolve,250))]);
  if(ended)return;
  try{
   title.setAttribute('aria-label',original);
   title.replaceChildren(...Array.from(original,(letter)=>{
    const span=document.createElement('span');
    span.className='entrance-letter';span.setAttribute('aria-hidden','true');
    span.textContent=letter===' '?'\u00a0':letter;
    return span;
   }));
   const bounds=title.getBoundingClientRect();
   const x=(window.innerWidth-bounds.width)/2-bounds.left;
   const y=(window.innerHeight-bounds.height)/2-bounds.top;
   const centered=`translate(${x}px,${y}px)`;
   const play=(element,frames,options)=>{
    if(!element)return null;
    const animation=element.animate(frames,{fill:'both',...options});
    animations.push(animation);return animation;
   };
   play(title,[{transform:centered},{transform:'translate(0,0)'}],
    {delay:1000,duration:950,easing:'cubic-bezier(.65,0,.2,1)'});
   title.querySelectorAll('.entrance-letter').forEach((letter,index)=>{
    play(letter,[{opacity:0,transform:'translateY(28px)',filter:'blur(5px)'},
     {opacity:1,transform:'translateY(0)',filter:'blur(0)'}],
     {delay:90+index*28,duration:480,easing:'cubic-bezier(.2,.75,.2,1)'});
   });
   play(subtitle,[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],
    {delay:1580,duration:580,easing:'cubic-bezier(.2,.7,.2,1)'});
   const reveal=play(catalog,[{opacity:0,transform:'translateY(32px)',clipPath:'inset(0 0 100% 0)'},
    {opacity:1,transform:'translateY(0)',clipPath:'inset(0 0 0% 0)'}],
    {delay:1600,duration:700,easing:'cubic-bezier(.2,.7,.2,1)'});
   play(collection,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],
    {delay:1840,duration:450,easing:'ease-out'});
   root.classList.add('site-entering-ready');
   reveal.finished.then(finish,finish);
  }catch{finish();}
 }

 function press(target){
  if(preference.matches||!target||target.matches(':disabled,[aria-disabled="true"],.card-image-button,[data-motion="off"]'))return;
  const bounds=target.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return;
  // Keep feedback in a dialog's top layer, including when its contents rerender.
  const host=target.closest('dialog[open]')||document.body;
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.classList.add('press-lines');svg.setAttribute('aria-hidden','true');
  const pad=26,w=bounds.width,h=bounds.height;
  svg.setAttribute('width',w+pad*2);svg.setAttribute('height',h+pad*2);
  svg.style.left=(bounds.left-pad)+'px';svg.style.top=(bounds.top-pad)+'px';
  // Eight separate straight ticks, with clear air between them and the button.
  const rays=[
   [w*.12,-5,-.78,-.63],[w*.48,-8,-.12,-.99],[w*.87,-5,.65,-.76],
   [w+8,h*.5,1,.12],[w*.88,h+5,.75,.66],
   [w*.54,h+8,.05,1],[w*.12,h+5,-.65,.76],[-8,h*.5,-.99,.15]
  ];
  for(const [x,y,dx,dy]of rays){
   const line=document.createElementNS(ns,'line');
   const length=7;
   for(const [key,value]of Object.entries({x1:pad+x,y1:pad+y,x2:pad+x+dx*length,y2:pad+y+dy*length}))line.setAttribute(key,value);
   svg.append(line);
   if(line.animate)line.animate([
    {opacity:.7,transform:'translate(0,0)'},
    {opacity:.7,transform:`translate(${dx*2}px,${dy*2}px)`,offset:.25},
    {opacity:0,transform:`translate(${dx*6}px,${dy*6}px)`}
   ],{duration:420,fill:'both',easing:'ease-out'});
  }
  host.append(svg);
  const remove=()=>{svg.remove();activeEffects.delete(svg);};
  activeEffects.add(svg);
  if(activeEffects.size>6){const first=activeEffects.values().next().value;first.remove();activeEffects.delete(first);}
  setTimeout(remove,470);
 }
 function buttonFor(event){return event.target instanceof Element?event.target.closest('button,a.primary,a.secondary,[role="button"],summary,select'):null;}
 document.addEventListener('pointerdown',event=>{if(event.button===0)press(buttonFor(event));},{capture:true,passive:true});
 document.addEventListener('click',event=>{if(event.detail===0)press(buttonFor(event));},{capture:true,passive:true});
 preference.addEventListener('change',()=>{if(preference.matches){finishEntrance();for(const effect of activeEffects)effect.remove();activeEffects.clear();}});
 window.addEventListener('pageshow',event=>{if(event.persisted)finishEntrance();});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enter,{once:true});else enter();
})();
