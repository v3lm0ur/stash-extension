import{MODULES,STORAGE_KEY,normalizeState,normalizeLastAth,LASTATH_DEFAULTS,MIGRATION_DEFAULTS,STRETCH_DEFAULTS,USERNAMES_DEFAULTS,DEVGLOW_DEFAULTS,PUMP_TWITTER_DEFAULTS,TRANSLATOR_DEFAULTS}from"./core/state.js";
const nav=document.querySelector("#navigation"),content=document.querySelector("#content"),status=document.querySelector("#save-state");let state;
const E=(t,c="",s)=>{const n=document.createElement(t);if(c)n.className=c;if(s!==undefined)n.textContent=s;return n;},field=(s,n)=>{const l=E("label","control-label",s);l.append(n);return l;};
async function read(){const d=await chrome.storage.local.get(STORAGE_KEY);return normalizeState(d[STORAGE_KEY]);}
async function write(v){status.textContent="SAVING…";await chrome.storage.local.set({[STORAGE_KEY]:v});state=v;status.textContent="ALL CHANGES SAVED";}
function navRender(){
 nav.replaceChildren();
 [{id:"overview",name:"Overview",number:"00"},...MODULES.map((m,i)=>({id:m.id,name:m.name,number:String(i+1).padStart(2,"0")}))].forEach(x=>{
  const a=E("a","nav-link"+((location.hash.slice(1)||"overview")===x.id?" active":""));
  a.href="#"+x.id;a.append(E("span","nav-number",x.number),E("span","",x.name));
  a.onclick=e=>{e.preventDefault();location.hash=x.id;render();};nav.append(a);
 });
 nav.append(E("div","side-label","COMMUNITY"));
 const community=E("div","side-community");
 const creator=E("a","side-community-link");creator.href="https://t.me/v3lm0ur";creator.target="_blank";creator.rel="noopener noreferrer";
 const creatorMark=E("span","side-community-mark","↗"),creatorCopy=E("span","side-community-copy");
 creatorCopy.append(E("strong","","Создатель"),E("small","","Telegram · @v3lm0ur"));
 creator.append(creatorMark,creatorCopy);
 const website=E("a","side-community-link");website.href="https://stashwiki.xyz";website.target="_blank";website.rel="noopener noreferrer";
 const websiteMark=E("span","side-community-mark","↗"),websiteCopy=E("span","side-community-copy");
 websiteCopy.append(E("strong","","STASH Wiki"),E("small","","Основной сайт проекта"));
 website.append(websiteMark,websiteCopy);
 community.append(creator,website);nav.append(community);
}
async function toggle(id){const n=structuredClone(state);n.modules[id]=!n.modules[id];await write(n);render();}
function overview(){const h=E("section","page-head");h.append(E("div","kicker","CONTROL PANEL — 7 MODULES"),E("h1","","Extension settings"),E("p","lead","Управление модулями STASH и их параметрами."));const stats=E("div","stats");[[ "MODULES ACTIVE",MODULES.filter(m=>m.implemented&&state.modules[m.id]).length+" / 07"],["INTEGRATED",MODULES.filter(m=>m.implemented).length+" / 07"],["STORAGE","LOCAL"]].forEach(([k,v])=>{const s=E("div","stat");s.append(E("span","",k),E("strong","",v));stats.append(s);});h.append(stats);const sec=E("section","section"),sh=E("div","section-head"),t=E("div");t.append(E("div","eyebrow","00 / MODULES"),E("h2","","Module control"));sh.append(t,E("span","section-note","Остальные модули подключаются поэтапно"));const grid=E("div","module-grid");MODULES.forEach((m,i)=>{const isAct=m.implemented&&state.modules[m.id];const a=E("article","module-card"+(isAct?" is-active":"")),top=E("div","module-top");top.append(E("span","module-id",String(i+1).padStart(2,"0")));const b=E("button","switch");b.type="button";b.disabled=!m.implemented;b.setAttribute("role","switch");b.setAttribute("aria-checked",String(m.implemented&&state.modules[m.id]));if(m.implemented)b.onclick=()=>toggle(m.id);top.append(b);a.append(top,E("h3","",m.name),E("p","",m.subtitle),E("div","module-target",m.target.toUpperCase()),E("div","module-status",isAct?"ACTIVE · RUNNING":(m.implemented?"READY · STANDBY":"INTEGRATION PENDING")));grid.append(a);});sec.append(sh,grid);
 const links=E("section","section community-links-section");
 const linksHead=E("div","section-head"),linksTitle=E("div");
 linksTitle.append(E("div","eyebrow","LINKS / COMMUNITY"),E("h2","","STASH links"));
 linksHead.append(linksTitle,E("span","section-note","Связь и полезные ресурсы проекта"));
 const linksGrid=E("div","community-links-grid");
 const creator=E("a","community-link");creator.href="https://t.me/v3lm0ur";creator.target="_blank";creator.rel="noopener noreferrer";
 const creatorMark=E("span","community-link-mark","↗"),creatorCopy=E("span","community-link-copy");
 creatorCopy.append(E("strong","","Создатель"),E("small","","Telegram · @v3lm0ur"));
 creator.append(creatorMark,creatorCopy,E("span","community-link-arrow","OPEN"));
 const website=E("a","community-link");website.href="https://stashwiki.xyz";website.target="_blank";website.rel="noopener noreferrer";
 const websiteMark=E("span","community-link-mark","↗"),websiteCopy=E("span","community-link-copy");
 websiteCopy.append(E("strong","","STASH Wiki"),E("small","","Основной сайт проекта"));
 website.append(websiteMark,websiteCopy,E("span","community-link-arrow","OPEN"));
 linksGrid.append(creator,website);links.append(linksHead,linksGrid);
 content.replaceChildren(h,sec,links);}
function lastath(){const cfg=state.settings.lastath,h=E("section","page-head");h.append(E("div","kicker","MODULE 01 / CONFIGURATION"),E("h1","","LastATH"),E("p","lead","История предыдущих запусков разработчика · Axiom"));const p=E("section","section settings-panel");const heading=(a,b)=>{const d=E("div","settings-section-head");d.append(E("div","eyebrow",a),E("h2","",b));return d;};p.append(heading("01 / FILTERS","Порог отображения"));const ath=E("input","text-input"),fees=E("input","text-input");Object.assign(ath,{type:"number",min:"0",step:"1",value:cfg.minAth/1000});Object.assign(fees,{type:"number",min:"0",step:".001",value:cfg.minFees});const g=E("div","control-grid");g.append(field("Минимальный ATH · $K",ath),field("Минимальные FEES · SOL",fees));p.append(g,E("div","settings-divider"),heading("02 / COLUMNS","Показывать в колонках"));
 const columns=E("div","lastath-columns");
 const columnInputs={};
 [["New Pairs","newPairs"],["Final Stretch","finalStretch"],["Migrated","migrated"]].forEach(([label,key])=>{
  const row=E("label","lastath-column-toggle"),copy=E("span","",label),input=E("input");
  input.type="checkbox";input.checked=cfg.showInColumns?.[key]!==false;columnInputs[key]=input;
  row.append(copy,input);columns.append(row);
 });
 p.append(columns,E("div","settings-divider"),heading("03 / HIGHLIGHTS","Подсветка значений"));const marks=E("div","highlight-grid"),at=E("input"),ac=E("input","color-input"),ft=E("input"),fc=E("input","color-input");at.type=ft.type="checkbox";ac.type=fc.type="color";at.checked=cfg.highlightAth;ft.checked=cfg.highlightFees;ac.value=cfg.athColor;fc.value=cfg.feesColor;for(const [name,desc,t,c]of[["ATH","Цвет исторического ATH",at,ac],["FEES","Цвет комиссий",ft,fc]]){const r=E("div","highlight-row"),d=E("div");d.append(E("strong","",name),E("small","",desc));r.append(d,t,c);marks.append(r);}p.append(marks,E("div","settings-divider"),heading("04 / POSITION","Положение панели"));const pos=E("div","control-grid"),x=E("input","range-input"),y=E("input","range-input");Object.assign(x,{type:"range",min:"0",max:"90",value:cfg.x});Object.assign(y,{type:"range",min:"-20",max:"100",value:cfg.y});const xr=E("div","range-wrap"),yr=E("div","range-wrap");xr.append(x,E("output","",x.value+"%"));yr.append(y,E("output","",y.value+" px"));pos.append(field("По горизонтали",xr),field("По вертикали",yr));p.append(pos);const preview=E("div","lastath-preview"),pd=E("div","lastath-preview-card");pd.append(E("span","preview-heading","ATH"),E("span","preview-heading","FEES"));for(const [athValue,feeValue]of[["$48K","2.36"],["$31.5K","1.82"]]){pd.append(E("strong","preview-ath",athValue),E("span","preview-fees",feeValue+" SOL"));}preview.append(pd);p.append(E("div","preview-caption","ПРИМЕР ОТОБРАЖЕНИЯ"),preview);const actions=E("div","settings-actions"),reset=E("button","action","СБРОСИТЬ НАСТРОЙКИ"),hint=E("span","save-hint","Изменения сохраняются автоматически");actions.append(reset,hint);p.append(actions);content.replaceChildren(h,p);let timer;const update=()=>{xr.querySelector("output").textContent=x.value+"%";yr.querySelector("output").textContent=y.value+" px";pd.style.left="min("+x.value+"%, calc(100% - 135px))";pd.style.bottom=Math.max(0,Math.min(55,+y.value*.45+8))+"px";pd.querySelectorAll(".preview-ath").forEach(el=>el.style.color=at.checked?ac.value:"#edf2ee");pd.querySelectorAll(".preview-fees").forEach(el=>el.style.color=ft.checked?fc.value:"#d7ded9");ac.disabled=!at.checked;fc.disabled=!ft.checked;};const save=()=>{update();clearTimeout(timer);hint.textContent="СОХРАНЕНИЕ…";timer=setTimeout(async()=>{const n=structuredClone(state);n.settings.lastath=normalizeLastAth({x:x.value,y:y.value,minAth:+ath.value*1000,minFees:fees.value,highlightAth:at.checked,athColor:ac.value,highlightFees:ft.checked,feesColor:fc.value,showInColumns:Object.fromEntries(Object.entries(columnInputs).map(([k,v])=>[k,v.checked]))});try{await write(n);hint.textContent="СОХРАНЕНО";}catch{hint.textContent="ОШИБКА СОХРАНЕНИЯ";}},180);};[ath,fees,at,ac,ft,fc,x,y,...Object.values(columnInputs)].forEach(i=>{i.addEventListener("input",save);i.addEventListener("change",save);});reset.onclick=async()=>{const n=structuredClone(state);n.settings.lastath={...LASTATH_DEFAULTS};await write(n);lastath();};update();}

function migration(){
 const cfg=state.settings.migration, h=E("section","page-head");
 h.append(E("div","kicker","MODULE 02 / CONFIGURATION"),E("h1","","Migration Percent"),E("p","lead","Процент миграций разработчика по X/Y · Axiom"));
 const p=E("section","section settings-panel");
 const head=(n,t)=>{const d=E("div","settings-section-head");d.append(E("div","eyebrow",n),E("h2","",t));return d;};
 const grid=E("div","control-grid"),scale=E("input","range-input"),x=E("input","range-input"),y=E("input","range-input");
 Object.assign(scale,{type:"range",min:".5",max:"2",step:".1",value:cfg.scale});
 Object.assign(x,{type:"range",min:"-100",max:"100",step:"1",value:cfg.offsetX});
 Object.assign(y,{type:"range",min:"-100",max:"100",step:"1",value:cfg.offsetY});
 const sizeOut=E("output","",cfg.scale.toFixed(1)+"×"),xOut=E("output","",cfg.offsetX+" px"),yOut=E("output","",cfg.offsetY+" px");
 const sizeWrap=E("div","range-wrap"),xWrap=E("div","range-wrap"),yWrap=E("div","range-wrap");
 sizeWrap.append(scale,sizeOut);xWrap.append(x,xOut);yWrap.append(y,yOut);
 grid.append(field("Размер индикатора",sizeWrap),field("По горизонтали",xWrap),field("По вертикали",yWrap));
 p.append(head("01 / DISPLAY","Отображение"),grid,E("div","settings-divider"),head("02 / APPEARANCE","Внешний вид"));
 const colors=E("div","highlight-grid");
 const colorInputs={};
 [["Обводка","borderColor"],["Процент","percentColor"],["X/Y","fractionColor"]].forEach(([label,key])=>{const row=E("div","highlight-row"),input=E("input","color-input");input.type="color";input.value=cfg[key];colorInputs[key]=input;row.append(E("strong","",label),input);colors.append(row);});
 p.append(colors,E("div","settings-divider"),head("03 / THRESHOLDS","Цветовые профили"));
 const list=E("div","profile-list");
 function renderProfiles(){
  list.replaceChildren();
  cfg.profiles.forEach((profile,index)=>{
   const row=E("div","profile-row"),enabled=E("input"),threshold=E("input");
   enabled.type="checkbox";enabled.checked=profile.enabled;threshold.type="number";threshold.min="0";threshold.max="100";threshold.step=".1";threshold.value=profile.threshold;
   const border=E("input"),percent=E("input"),fraction=E("input");[border,percent,fraction].forEach((el,i)=>{el.type="color";el.value=[profile.borderColor,profile.percentColor,profile.fractionColor][i];});
   const remove=E("button","action","УДАЛИТЬ");remove.type="button";
   row.append(enabled,field("≥ %",threshold),field("Рамка",border),field("%",percent),field("X/Y",fraction),remove);list.append(row);
   enabled.onchange=()=>{profile.enabled=enabled.checked;save();};
   threshold.onchange=()=>{profile.threshold=Math.min(100,Math.max(0,Number(threshold.value)||0));save();};
   [border,percent,fraction].forEach((el,i)=>el.oninput=()=>{profile[["borderColor","percentColor","fractionColor"][i]]=el.value;save();});
   remove.onclick=()=>{cfg.profiles.splice(index,1);save();renderProfiles();};
  });
 }
 const add=E("button","action","＋ ДОБАВИТЬ ПРОФИЛЬ");add.type="button";add.onclick=()=>{cfg.profiles.push({enabled:true,threshold:10,mode:"colorAbove",borderColor:"#d6b85a",percentColor:"#d6b85a",fractionColor:"#edf2ee"});save();renderProfiles();};
 p.append(list,add);
 const actions=E("div","settings-actions"),reset=E("button","action","СБРОСИТЬ НАСТРОЙКИ"),hint=E("span","save-hint","Изменения сохраняются автоматически");
 actions.append(reset,hint);p.append(actions);content.replaceChildren(h,p);
 let timer;function save(){sizeOut.textContent=Number(scale.value).toFixed(1)+"×";xOut.textContent=x.value+" px";yOut.textContent=y.value+" px";clearTimeout(timer);hint.textContent="СОХРАНЕНИЕ…";timer=setTimeout(async()=>{const n=structuredClone(state);n.settings.migration={...cfg,platform:"axiom",scale:Number(scale.value),offsetX:Number(x.value),offsetY:Number(y.value),...Object.fromEntries(Object.entries(colorInputs).map(([k,v])=>[k,v.value]))};try{await write(n);hint.textContent="СОХРАНЕНО";}catch{hint.textContent="ОШИБКА СОХРАНЕНИЯ";}},180);}
 [scale,x,y,...Object.values(colorInputs)].forEach(el=>{el.addEventListener("input",save);el.addEventListener("change",save);});
 reset.onclick=async()=>{const n=structuredClone(state);n.settings.migration={...MIGRATION_DEFAULTS,profiles:structuredClone(MIGRATION_DEFAULTS.profiles)};await write(n);migration();};
 renderProfiles();
}


function stretch(){
 const cfg=state.settings.stretch,h=E("section","page-head");
 h.append(E("div","kicker","MODULE 03 / CONFIGURATION"),E("h1","","Axiom Stretch"),E("p","lead","Растяжение интерфейса под виртуальное разрешение · Axiom"));
 const p=E("section","section settings-panel");
 const head=(n,t)=>{const d=E("div","settings-section-head");d.append(E("div","eyebrow",n),E("h2","",t));return d;};
 p.append(head("01 / DISPLAY","Разрешение и масштаб"));
 const monitor=E("select","text-input");
 const monitorOptions=[["auto","Авто"],["1920x1080","1920 × 1080 · Full HD"],["2560x1440","2560 × 1440 · 2K"],["2560x1080","2560 × 1080 · 21:9"],["3440x1440","3440 × 1440 · Ultrawide"],["3840x1600","3840 × 1600 · Ultrawide"]];
 monitorOptions.forEach(([v,label])=>{const o=E("option","",label);o.value=v;monitor.append(o);});
 monitor.value=cfg.monitor;
 const monitorWrap=E("div","control-grid");monitorWrap.append(field("Физическое разрешение монитора",monitor));
 const summary=E("div","resolution-summary");
 const virtual=E("div","resolution-values");
 const actual=E("span","resolution-actual");
 const simulated=E("strong","resolution-simulated");
 virtual.append(actual,E("span","resolution-arrow","→"),simulated);
 summary.append(virtual,E("span","resolution-caption","ФАКТИЧЕСКОЕ РАЗРЕШЕНИЕ → ВИРТУАЛЬНОЕ"));
 monitorWrap.append(field("Текущее соотношение",summary));p.append(monitorWrap);
 const presetBox=E("div","preset-grid");
 const scaleGrid=E("div","control-grid"),sx=E("input","range-input"),sy=E("input","range-input");
 Object.assign(sx,{type:"range",min:".75",max:"2.5",step:".01",value:cfg.scaleX});
 Object.assign(sy,{type:"range",min:".75",max:"2.5",step:".01",value:cfg.scaleY});
 const sxOut=E("output","",Number(cfg.scaleX).toFixed(2)+"×"),syOut=E("output","",Number(cfg.scaleY).toFixed(2)+"×");
 const sxWrap=E("div","range-wrap"),syWrap=E("div","range-wrap");sxWrap.append(sx,sxOut);syWrap.append(sy,syOut);
 scaleGrid.append(field("Ширина · scale X",sxWrap),field("Высота · scale Y",syWrap));
 const off=E("button","action","БЕЗ РАСТЯЖЕНИЯ");off.type="button";
 p.append(E("div","preset-caption","ГОТОВЫЕ ПРОФИЛИ"),presetBox,scaleGrid,off,E("div","settings-divider"),head("02 / COMPATIBILITY","Дополнительные параметры"));
 const toggles=E("div","stretch-options");
 const sharp=E("input"),autofit=E("input"),foreign=E("input");
 sharp.type=autofit.type=foreign.type="checkbox";
 sharp.checked=cfg.sharp;autofit.checked=cfg.autofit;foreign.checked=cfg.foreign;
 const option=(title,desc,input)=>{const row=E("div","stretch-option"),copy=E("div");copy.append(E("strong","",title),E("small","",desc));row.append(copy,input);return row;};
 toggles.append(option("Чёткие графики","Повышенная чёткость canvas при растяжении",sharp),option("Автоподгонка по высоте","Уменьшать вертикальный масштаб, если нижняя панель обрезается",autofit),option("Не растягивать окна других расширений","Выносить сторонние попапы за пределы масштабируемой области",foreign));
 p.append(toggles);
 const actions=E("div","settings-actions"),reset=E("button","action","СБРОСИТЬ НАСТРОЙКИ"),hint=E("span","save-hint","Изменения сохраняются автоматически");
 actions.append(reset,hint);p.append(actions);content.replaceChildren(h,p);
 const known={
  "1920x1080":["1440x1080","1600x1080","1680x1050","1280x1024"],
  "2560x1440":["1920x1440","1920x1200","2240x1440","1920x1080"],
  "2560x1080":["1920x1080","2240x1080","1680x1050","1440x1080"],
  "3440x1440":["2560x1440","2880x1440","1920x1440","2560x1080"],
  "3840x1600":["2560x1600","3440x1440","2880x1600","1920x1200"]
 };
 const parse=s=>s.split("x").map(Number);
 const detected=()=>{const d=window.devicePixelRatio||1;return Math.round(screen.width*d)+"x"+Math.round(screen.height*d);};
 const monitorKey=()=>monitor.value==="auto"?detected():monitor.value;
 const generic=(W,H)=>[16/9,16/10,4/3,5/4].map(r=>Math.round(H*r/8)*8).filter(w=>w<W-8).slice(0,4).map(w=>w+"x"+H);
 function updateSummary(){
  const [W,H]=parse(monitorKey()),vx=Math.round(W/Number(sx.value)),vy=Math.round(H/Number(sy.value));
  actual.textContent=W+" × "+H;simulated.textContent="≈ "+vx+" × "+vy;
  sxOut.textContent=Number(sx.value).toFixed(2)+"×";syOut.textContent=Number(sy.value).toFixed(2)+"×";
  presetBox.querySelectorAll("button").forEach(b=>b.classList.toggle("active",Math.abs(Number(b.dataset.x)-Number(sx.value))<.005&&Math.abs(Number(b.dataset.y)-Number(sy.value))<.005));
 }
 function buildPresets(){
  presetBox.replaceChildren();
  const key=monitorKey(),[W,H]=parse(key),list=known[key]||generic(W,H);
  list.forEach(res=>{const [w,h]=parse(res),b=E("button","preset-button",w+" × "+h);b.type="button";b.dataset.x=(W/w).toFixed(4);b.dataset.y=(H/h).toFixed(4);b.onclick=()=>{sx.value=b.dataset.x;sy.value=b.dataset.y;save();};presetBox.append(b);});
  updateSummary();
 }
 let timer;
 function save(){
  updateSummary();clearTimeout(timer);hint.textContent="СОХРАНЕНИЕ…";
  timer=setTimeout(async()=>{const n=structuredClone(state);n.settings.stretch={scaleX:Number(sx.value),scaleY:Number(sy.value),sharp:sharp.checked,autofit:autofit.checked,foreign:foreign.checked,monitor:monitor.value};try{await write(n);hint.textContent="СОХРАНЕНО";}catch{hint.textContent="ОШИБКА СОХРАНЕНИЯ";}},160);
 }
 [sx,sy].forEach(el=>el.addEventListener("input",save));
 [sharp,autofit,foreign].forEach(el=>el.addEventListener("change",save));
 monitor.addEventListener("change",()=>{buildPresets();save();});
 off.onclick=()=>{sx.value="1";sy.value="1";save();};
 reset.onclick=async()=>{const n=structuredClone(state);n.settings.stretch={...STRETCH_DEFAULTS};await write(n);stretch();};
 buildPresets();
}


function usernames(){
 const cfg=state.settings.usernames,h=E("section","page-head");
 h.append(E("div","kicker","MODULE 04 / CONFIGURATION"),E("h1","","Usernames"),E("p","lead","X-профили, твиты и сообщества на карточках токенов · Axiom"));
 const p=E("section","section settings-panel");
 const head=(n,t)=>{const d=E("div","settings-section-head");d.append(E("div","eyebrow",n),E("h2","",t));return d;};
 p.append(head("01 / CONTENT","Что отображать"));
 const toggles=E("div","stretch-options"),accounts=E("input"),tweets=E("input"),communities=E("input");
 [accounts,tweets,communities].forEach(x=>x.type="checkbox");
 accounts.checked=cfg.showAccounts;tweets.checked=cfg.showTweets;communities.checked=cfg.showCommunities;
 const option=(title,desc,input)=>{const row=E("div","stretch-option"),copy=E("div");copy.append(E("strong","",title),E("small","",desc));row.append(copy,input);return row;};
 toggles.append(option("X-профили","Показывать @username из ссылок на профиль",accounts),option("Твиты","Извлекать username из ссылок /status/",tweets),option("X Communities","Показывать screenName сообщества",communities));
 p.append(toggles,E("div","settings-divider"),head("02 / APPEARANCE","Внешний вид"));
 const colors=E("div","highlight-grid"),textColor=E("input","color-input"),bgColor=E("input","color-input");
 textColor.type=bgColor.type="color";textColor.value=cfg.textColor;bgColor.value=cfg.badgeBgColor;
 for(const [name,desc,input] of [["Текст","Цвет username и community",textColor],["Фон","Фон бейджа",bgColor]]){const row=E("div","highlight-row"),copy=E("div");copy.append(E("strong","",name),E("small","",desc));row.append(copy,input);colors.append(row);}
 p.append(colors);
 const size=E("input","range-input"),padding=E("input","range-input");
 Object.assign(size,{type:"range",min:"8",max:"20",step:"1",value:cfg.logFontSize});
 Object.assign(padding,{type:"range",min:"0",max:"12",step:"1",value:cfg.badgePadding});
 const sizeOut=E("output","",cfg.logFontSize+" px"),padOut=E("output","",cfg.badgePadding+" px"),sg=E("div","control-grid"),sw=E("div","range-wrap"),pw=E("div","range-wrap");
 sw.append(size,sizeOut);pw.append(padding,padOut);sg.append(field("Размер текста",sw),field("Внутренний отступ",pw));
 p.append(sg,E("div","settings-divider"),head("03 / POSITION","Положение на карточке"));
 const x=E("input","range-input"),y=E("input","range-input");
 Object.assign(x,{type:"range",min:"-100",max:"100",step:"1",value:cfg.badgeOffsetX});
 Object.assign(y,{type:"range",min:"-100",max:"100",step:"1",value:cfg.badgeOffsetY});
 const xOut=E("output","",cfg.badgeOffsetX+" px"),yOut=E("output","",cfg.badgeOffsetY+" px");
 const xw=E("div","range-wrap"),yw=E("div","range-wrap"),pg=E("div","control-grid");
 xw.append(x,xOut);yw.append(y,yOut);pg.append(field("По горизонтали",xw),field("По вертикали",yw));p.append(pg);
 const actions=E("div","settings-actions"),reset=E("button","action","СБРОСИТЬ НАСТРОЙКИ"),hint=E("span","save-hint","Изменения сохраняются автоматически");
 actions.append(reset,hint);p.append(actions);content.replaceChildren(h,p);
 let timer;
 function save(){
  sizeOut.textContent=size.value+" px";padOut.textContent=padding.value+" px";xOut.textContent=x.value+" px";yOut.textContent=y.value+" px";
  clearTimeout(timer);hint.textContent="СОХРАНЕНИЕ…";
  timer=setTimeout(async()=>{const n=structuredClone(state);n.settings.usernames={
   platform:"axiom",textColor:textColor.value,badgeBgColor:bgColor.value,logFontSize:Number(size.value),badgePadding:Number(padding.value),
   badgeOffsetX:Number(x.value),badgeOffsetY:Number(y.value),showAccounts:accounts.checked,showTweets:tweets.checked,showCommunities:communities.checked
  };try{await write(n);hint.textContent="СОХРАНЕНО";}catch{hint.textContent="ОШИБКА СОХРАНЕНИЯ";}},180);
 }
 [textColor,bgColor,size,padding,x,y,accounts,tweets,communities].forEach(el=>{el.addEventListener("input",save);el.addEventListener("change",save);});
 reset.onclick=async()=>{const n=structuredClone(state);n.settings.usernames={...USERNAMES_DEFAULTS};await write(n);usernames();};
}


function devglow(){
 const cfg=state.settings.devglow;
 const page=E("section","page-head");
 page.append(E("div","kicker","MODULE 05 / CONFIGURATION"),E("h1","","Dev Glow"),E("p","lead","Подсветка строк Axiom, если кошелёк дева или его фандера есть в твоём трекере."));
 const panel=E("section","section settings-panel");
 const sectionHead=(id,title,note)=>{const h=E("div","settings-section-head devglow-head");const copy=E("div");copy.append(E("div","eyebrow",id),E("h2","",title));h.append(copy);if(note)h.append(E("span","save-hint",note));return h;};
 const saveHint=E("span","save-hint","Настройки сохраняются автоматически");
 panel.append(sectionHead("01 / MATCHING","Кого подсвечивать"));
 const match=E("div","preset-grid devglow-presets");
 [["both","Дев + фандер"],["dev","Только дев"],["funder","Только фандер"]].forEach(([v,label])=>{
  const b=E("button","preset-button",label);b.type="button";b.classList.toggle("active",cfg.matchMode===v);
  b.onclick=()=>{cfg.matchMode=v;match.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));saveConfig();};match.append(b);
 });
 panel.append(match,E("div","settings-divider"),sectionHead("02 / APPEARANCE","Внешний вид"));
 const styles=E("div","preset-grid devglow-presets");
 [["glow","Свечение"],["ring","Контур"],["tint","Заливка"]].forEach(([v,label])=>{
  const b=E("button","preset-button",label);b.type="button";b.classList.toggle("active",cfg.style===v);
  b.onclick=()=>{cfg.style=v;styles.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));saveConfig();};styles.append(b);
 });
 const intensity=E("input","range-input");Object.assign(intensity,{type:"range",min:"0.3",max:"2",step:"0.1",value:cfg.intensity});
 const intensityOut=E("output","",Number(cfg.intensity).toFixed(1)+"×");
 const range=E("div","range-wrap");range.append(intensity,intensityOut);
 const animate=E("input");animate.type="checkbox";animate.checked=!!cfg.animate;
 const animation=E("div","stretch-option");animation.append(E("div","","Пульсация свечения"),animate);
 panel.append(styles,field("Интенсивность подсветки",range),animation,E("div","settings-divider"));

 const trackerHead=sectionHead("03 / WALLET TRACKER","Отслеживаемые кошельки");
 const count=E("span","save-hint","0 кошельков");
 trackerHead.append(count);
 panel.append(trackerHead);
 const trackerInfo=E("p","lead devglow-info","Список синхронизируется с Wallet Tracker Axiom. Ручные записи и выбранные цвета сохраняются.");
 const syncRow=E("div","devglow-toolbar");
 const sync=E("button","action","↻  СИНХРОНИЗИРОВАТЬ С AXIOM"),syncStatus=E("span","save-hint","");
 sync.type="button";syncRow.append(sync,syncStatus);panel.append(trackerInfo,syncRow);

 const addPanel=E("div","devglow-add");
 const addr=E("input","text-input"),name=E("input","text-input"),emojiInput=E("input","text-input");
 const add=E("button","action","＋ ДОБАВИТЬ");
 addr.placeholder="Solana wallet address";addr.autocomplete="off";addr.spellcheck=false;
 name.placeholder="Имя / метка";emojiInput.placeholder="👛";emojiInput.maxLength=8;
 const addFields=E("div","devglow-add-fields");
 addFields.append(field("АДРЕС",addr),field("ИМЯ",name),field("ЭМОДЗИ",emojiInput),add);
 addPanel.append(addFields);panel.append(addPanel);
 const searchRow=E("div","devglow-search-row");
 const search=E("input","text-input");search.placeholder="Поиск по имени или адресу…";search.autocomplete="off";
 searchRow.append(search);panel.append(searchRow);
 const list=E("div","devglow-wallet-list");panel.append(list);

 const dataDetails=E("details","devglow-data");
 const dataSummary=E("summary","","Импорт и экспорт списка");
 const json=E("textarea","text-input");json.rows=7;json.placeholder="JSON-массив кошельков…";
 const dataButtons=E("div","devglow-data-actions");
 const exportBtn=E("button","action","ЭКСПОРТ В ПОЛЕ"),copyBtn=E("button","action","КОПИРОВАТЬ JSON"),importBtn=E("button","action","ИМПОРТИРОВАТЬ");
 const dataStatus=E("span","save-hint","");
 dataButtons.append(exportBtn,copyBtn,importBtn,dataStatus);dataDetails.append(dataSummary,json,dataButtons);panel.append(dataDetails);

 const footer=E("div","devglow-footer");
 const clear=E("button","action action-danger","ОЧИСТИТЬ СПИСОК");
 footer.append(clear,saveHint);panel.append(E("div","settings-divider"),footer);
 content.replaceChildren(page,panel);

 let saveTimer=0;
 function saveConfig(){
  intensityOut.textContent=Number(intensity.value).toFixed(1)+"×";
  clearTimeout(saveTimer);saveHint.textContent="СОХРАНЕНИЕ…";
  saveTimer=setTimeout(async()=>{
   const next=structuredClone(state);
   next.settings.devglow={intensity:Number(intensity.value),style:cfg.style,matchMode:cfg.matchMode,animate:animate.checked};
   try{await write(next);saveHint.textContent="СОХРАНЕНО";}catch{saveHint.textContent="ОШИБКА СОХРАНЕНИЯ";}
  },180);
 }
 intensity.addEventListener("input",saveConfig);
 animate.addEventListener("change",()=>{cfg.animate=animate.checked;saveConfig();});

 const validAddress=a=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
 const palette=["#ff0000","#ff8000","#ffff00","#00ff00","#00a000","#00ffff","#0000ff","#8000ff","#ff00ff","#ff69b4","#ffffff","#ffd700"];
 function defaultColor(a){let x=0;for(let i=0;i<a.length;i++)x=(x*31+a.charCodeAt(i))>>>0;return palette[x%palette.length];}
 const shortAddress=a=>a.length>12?a.slice(0,5)+"…"+a.slice(-4):a;
 async function tracker(){const d=await chrome.storage.local.get(["trackedWallets","walletColors","hiddenWallets"]);return{wallets:Array.isArray(d.trackedWallets)?d.trackedWallets.filter(w=>w&&typeof w.trackedWalletAddress==="string"):[],colors:d.walletColors||{},hidden:Array.isArray(d.hiddenWallets)?d.hiddenWallets:[]};}
 async function storeTracker(data){await chrome.storage.local.set(data);}
 function status(el,message,error=false){el.textContent=message;el.classList.toggle("error",error);}
 async function renderWallets(){
  const data=await tracker(),q=search.value.trim().toLowerCase();
  const visible=data.wallets.filter(w=>(w.name||"").toLowerCase().includes(q)||w.trackedWalletAddress.toLowerCase().includes(q));
  const n=data.wallets.length,last=n%10,lastTwo=n%100,word=last===1&&lastTwo!==11?"кошелёк":last>=2&&last<=4&&(lastTwo<12||lastTwo>14)?"кошелька":"кошельков";
  count.textContent=n+" "+word;
  list.replaceChildren();
  if(!data.wallets.length){list.append(E("div","empty-state","Список пуст. Добавь кошелёк вручную или синхронизируй Wallet Tracker Axiom."));return;}
  if(!visible.length){list.append(E("div","empty-state","Совпадений не найдено."));return;}
  for(const w of visible){
   const a=w.trackedWalletAddress;
   const row=E("div","devglow-wallet-row");
   const emoji=E("input","text-input devglow-emoji");emoji.value=w.emoji||"👛";emoji.maxLength=8;emoji.title="Эмодзи";
   const identity=E("div","devglow-identity");
   const label=E("input","text-input devglow-name");label.value=w.name||shortAddress(a);label.title="Имя / метка";
   const address=E("button","devglow-address",shortAddress(a));address.type="button";address.title="Скопировать полный адрес: "+a;
   identity.append(label,address);
   const color=E("input","color-input devglow-color");color.type="color";color.value=data.colors[a]||defaultColor(a);color.title="Цвет подсветки";
   const del=E("button","devglow-remove","×");del.type="button";del.title="Удалить кошелёк";
   row.append(emoji,identity,color,del);list.append(row);
   const commit=async()=>{
    const fresh=await tracker(),item=fresh.wallets.find(x=>x.trackedWalletAddress.toLowerCase()===a.toLowerCase());
    if(!item)return;
    const nextName=label.value.trim()||shortAddress(a),nextEmoji=emoji.value.trim().slice(0,8);
    if(item.name===nextName&&item.emoji===(nextEmoji||"👛"))return;
    item.name=nextName;item.emoji=nextEmoji||"👛";item.edited=true;
    await storeTracker({trackedWallets:fresh.wallets});
   };
   label.addEventListener("change",commit);emoji.addEventListener("change",commit);
   for(const input of [label,emoji])input.addEventListener("keydown",e=>{if(e.key==="Enter")input.blur();});
   color.addEventListener("input",()=>row.style.setProperty("--wallet-color",color.value));
   color.addEventListener("change",async()=>{const fresh=await tracker();await storeTracker({walletColors:{...fresh.colors,[a]:color.value}});});
   address.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(a);address.textContent="СКОПИРОВАНО";setTimeout(()=>{if(address.isConnected)address.textContent=shortAddress(a);},900);}catch{status(syncStatus,"НЕ УДАЛОСЬ СКОПИРОВАТЬ",true);}});
   del.addEventListener("click",async()=>{
    const fresh=await tracker(),low=a.toLowerCase();
    const wallets=fresh.wallets.filter(x=>x.trackedWalletAddress.toLowerCase()!==low);
    const colors={...fresh.colors};for(const k of Object.keys(colors))if(k.toLowerCase()===low)delete colors[k];
    const hidden=fresh.hidden.filter(x=>String(x).toLowerCase()!==low);hidden.push(a);
    await storeTracker({trackedWallets:wallets,walletColors:colors,hiddenWallets:hidden});renderWallets();
   });
  }
 }
 add.addEventListener("click",async()=>{
  const a=addr.value.trim();
  if(!validAddress(a)){status(syncStatus,"ПРОВЕРЬ SOLANA-АДРЕС",true);addr.focus();return;}
  const d=await tracker();
  if(d.wallets.some(w=>w.trackedWalletAddress.toLowerCase()===a.toLowerCase())){status(syncStatus,"КОШЕЛЁК УЖЕ В СПИСКЕ",true);return;}
  const low=a.toLowerCase(),hidden=d.hidden.filter(x=>String(x).toLowerCase()!==low);
  const item={trackedWalletAddress:a,name:name.value.trim()||shortAddress(a),emoji:emojiInput.value.trim().slice(0,8)||"👛",source:"manual"};
  await storeTracker({trackedWallets:[item,...d.wallets],hiddenWallets:hidden});
  addr.value="";name.value="";emojiInput.value="";status(syncStatus,"КОШЕЛЁК ДОБАВЛЕН");renderWallets();
 });
 [addr,name,emojiInput].forEach(input=>input.addEventListener("keydown",e=>{if(e.key==="Enter")add.click();}));
 search.addEventListener("input",renderWallets);
 sync.addEventListener("click",()=>{
  sync.disabled=true;status(syncStatus,"СИНХРОНИЗАЦИЯ…");
  chrome.runtime.sendMessage({type:"FETCH_WALLETS"},res=>{
   sync.disabled=false;
   if(chrome.runtime.lastError||!res?.success){status(syncStatus,"ОШИБКА: "+(chrome.runtime.lastError?.message||res?.reason||"не удалось"),true);return;}
   status(syncStatus,"СИНХРОНИЗИРОВАНО: "+res.synced+" · ВСЕГО: "+res.total);renderWallets();
  });
 });
 exportBtn.addEventListener("click",async()=>{
  const d=await tracker();
  json.value=JSON.stringify(d.wallets.map(w=>({trackedWalletAddress:w.trackedWalletAddress,name:w.name||shortAddress(w.trackedWalletAddress),emoji:w.emoji||"👛",color:d.colors[w.trackedWalletAddress]||defaultColor(w.trackedWalletAddress)})),null,2);
  status(dataStatus,"ЭКСПОРТ ГОТОВ");
 });
 copyBtn.addEventListener("click",async()=>{try{if(!json.value.trim()){const d=await tracker();json.value=JSON.stringify(d.wallets.map(w=>({trackedWalletAddress:w.trackedWalletAddress,name:w.name||shortAddress(w.trackedWalletAddress),emoji:w.emoji||"👛",color:d.colors[w.trackedWalletAddress]||defaultColor(w.trackedWalletAddress)})),null,2);}await navigator.clipboard.writeText(json.value);status(dataStatus,"JSON СКОПИРОВАН");}catch{status(dataStatus,"НЕ УДАЛОСЬ СКОПИРОВАТЬ",true);}});
 importBtn.addEventListener("click",async()=>{
  let parsed;try{parsed=JSON.parse(json.value);}catch{status(dataStatus,"НЕКОРРЕКТНЫЙ JSON",true);return;}
  if(!Array.isArray(parsed)){status(dataStatus,"ОЖИДАЕТСЯ JSON-МАССИВ",true);return;}
  const d=await tracker(),wallets=[...d.wallets],colors={...d.colors};
  let added=0,updated=0;
  for(const w of parsed){
   const a=w?.trackedWalletAddress;if(!validAddress(a))continue;
   const low=a.toLowerCase(),existing=wallets.find(x=>x.trackedWalletAddress.toLowerCase()===low);
   if(existing){const c=typeof w.color==="string"&&/^#[0-9a-f]{6}$/i.test(w.color)?w.color:null;if(c)colors[existing.trackedWalletAddress]=c;updated++;continue;}
   wallets.push({trackedWalletAddress:a,name:w.name||shortAddress(a),emoji:w.emoji||"👛",source:"manual"});
   if(typeof w.color==="string"&&/^#[0-9a-f]{6}$/i.test(w.color))colors[a]=w.color;added++;
  }
  const imported=new Set(parsed.filter(w=>validAddress(w?.trackedWalletAddress)).map(w=>w.trackedWalletAddress.toLowerCase()));
  const hidden=d.hidden.filter(a=>!imported.has(String(a).toLowerCase()));
  await storeTracker({trackedWallets:wallets,walletColors:colors,hiddenWallets:hidden});
  status(dataStatus,"ДОБАВЛЕНО: "+added+" · ЦВЕТОВ ОБНОВЛЕНО: "+updated);renderWallets();
 });
 clear.addEventListener("click",async()=>{
  if(!window.confirm("Удалить все кошельки из Dev Glow?"))return;
  await storeTracker({trackedWallets:[],walletColors:{},hiddenWallets:[]});
  status(syncStatus,"СПИСОК ОЧИЩЕН");renderWallets();
 });
 window.__stashDevGlowRefresh=renderWallets;
 if(!window.__stashDevGlowStorageListener){
  window.__stashDevGlowStorageListener=true;
  chrome.storage.onChanged.addListener((changes,area)=>{
   if(area==="local"&&["trackedWallets","walletColors"].some(k=>k in changes)&&location.hash.slice(1)==="devglow"&&!document.activeElement?.closest(".devglow-wallet-list"))window.__stashDevGlowRefresh?.();
  });
 }
 renderWallets();
}


function pumpTwitter(){
 const cfg=state.settings.pumpTwitter;
 const page=E("section","page-head");
 page.append(E("div","kicker","MODULE 06 / CONFIGURATION"),E("h1","","Pump & Twitter"),E("p","lead","Описание Pump.fun и возраст публикаций X в интерфейсе Axiom."));
 const panel=E("section","section settings-panel");
 const head=(id,title)=>{const h=E("div","settings-section-head");h.append(E("div","eyebrow",id),E("h2","",title));return h;};
 panel.append(head("01 / PUMP.FUN","Описание токена"));
 const options=E("div","stretch-options");
 const desc=E("input");desc.type="checkbox";desc.checked=cfg.showDescription;
 const age=E("input");age.type="checkbox";age.checked=cfg.showAge;
 const translator=E("input");translator.type="checkbox";translator.checked=cfg.showTranslator!==false;
 const option=(title,description,input)=>{const row=E("div","stretch-option"),copy=E("div");copy.append(E("strong","",title),E("small","",description));row.append(copy,input);return row;};
 options.append(option("Описание Pump.fun","Показывать описание при наведении на значок Pump в Pulse.",desc));
 options.append(option("Перевод описания","Переключение между русским переводом и оригиналом во всплывающем окне.",translator));
 panel.append(options,E("div","settings-divider"),head("02 / X","Возраст твита"));
 const ageOptions=E("div","stretch-options");
 ageOptions.append(option("Возраст публикации","Показывать время с момента публикации рядом с иконкой X.",age));
 const filter=E("select","text-input");
 [["0","Без фильтра"],["60","От 1 минуты"],["300","От 5 минут"],["1800","От 30 минут"],["3600","От 1 часа"],["21600","От 6 часов"],["86400","От 1 дня"]].forEach(([v,label])=>{const o=E("option","",label);o.value=v;filter.append(o);});
 filter.value=String(cfg.minAge);
 ageOptions.append(field("Показывать твиты старше",filter));
 panel.append(ageOptions);
 const actions=E("div","settings-actions"),reset=E("button","action","СБРОСИТЬ НАСТРОЙКИ"),hint=E("span","save-hint","Изменения сохраняются автоматически");
 actions.append(reset,hint);panel.append(E("div","settings-divider"),actions);
 content.replaceChildren(page,panel);
 let timer=0;
 function save(){
  clearTimeout(timer);hint.textContent="СОХРАНЕНИЕ…";
  timer=setTimeout(async()=>{const next=structuredClone(state);next.settings.pumpTwitter={showDescription:desc.checked,showAge:age.checked,showTranslator:translator.checked,minAge:Number(filter.value)};try{await write(next);hint.textContent="СОХРАНЕНО";}catch{hint.textContent="ОШИБКА СОХРАНЕНИЯ";}},160);
 }
 [desc,age,translator,filter].forEach(el=>{el.addEventListener("change",save);});
 reset.onclick=async()=>{const next=structuredClone(state);next.settings.pumpTwitter={...PUMP_TWITTER_DEFAULTS};await write(next);pumpTwitter();};
}

function translator(){
 const cfg=state.settings.translator;
 const page=E("section","page-head");
 page.append(E("div","kicker","MODULE 07 / CONFIGURATION"),E("h1","","Translator"),E("p","lead","Перевод публикаций Axiom и X/Twitter. Быстрый перевод без ключа или AI через собственный API-ключ."));
 const panel=E("section","section settings-panel");
 const section=(n,t)=>{const h=E("div","settings-section-head");h.append(E("div","eyebrow",n),E("h2","",t));return h;};
 const option=(title,desc,input)=>{const row=E("div","stretch-option"),copy=E("div");copy.append(E("strong","",title),E("small","",desc));row.append(copy,input);return row;};
 panel.append(section("01 / PLATFORMS","Где работает Translator"));
 const toggles=E("div","stretch-options"),axiom=E("input"),x=E("input"),autoAxiom=E("input"),autoX=E("input");
 [axiom,x,autoAxiom,autoX].forEach(el=>el.type="checkbox");
 axiom.checked=cfg.axiom!==false;x.checked=cfg.x!==false;autoAxiom.checked=cfg.autoAxiom===true;autoX.checked=cfg.autoX===true;
 toggles.append(option("Axiom","Кнопка перевода у встроенных X-публикаций в окне профиля.",axiom),option("X / Twitter","Кнопка перевода в публикациях на x.com.",x));
 panel.append(toggles,E("div","settings-divider"),section("02 / AUTOMATION","Автоматический перевод"));
 const autos=E("div","stretch-options");
 autos.append(option("Автоперевод в Axiom","Переводить публикации сразу после появления, без нажатия RU.",autoAxiom),option("Автоперевод на X","Автоматически переводить найденные публикации на x.com.",autoX));
 panel.append(autos,E("div","settings-divider"),section("03 / ENGINE","Метод перевода"));
 const method=E("select","text-input");
 [["fast","Быстрый · Google Translate, без API-ключа"],["ai","AI · собственный API-ключ"]].forEach(([v,t])=>{const o=E("option","",t);o.value=v;method.append(o);});
 method.value=cfg.method;
 const methodWrap=E("div","translator-form-grid");methodWrap.append(field("Метод",method));
 const language=E("select","text-input");
 [["ru","Русский"],["en","English"],["uk","Українська"],["es","Español"],["zh","中文"],["pt","Português"],["tr","Türkçe"],["ar","العربية"]].forEach(([v,t])=>{const o=E("option","",t);o.value=v;language.append(o);});
 language.value=cfg.targetLanguage||"ru";methodWrap.append(field("Язык перевода",language));panel.append(methodWrap);
 const ai=E("div","translator-ai-settings"),provider=E("select","text-input");
 const providers=[["openrouter","OpenRouter"],["gemini","Google Gemini"],["anthropic","Claude (Anthropic)"],["groq","Groq"]];
 providers.forEach(([v,t])=>{const o=E("option","",t);o.value=v;provider.append(o);});
 provider.value=cfg.provider||"openrouter";
 const key=E("input","text-input");key.type="password";key.autocomplete="off";key.spellcheck=false;
 const model=E("input","text-input");model.type="text";model.autocomplete="off";model.spellcheck=false;
 const details={
  openrouter:{url:"https://openrouter.ai/keys",hint:"sk-or-v1-…",model:"openrouter/auto"},
  gemini:{url:"https://aistudio.google.com/apikey",hint:"AIza…",model:"gemini-3.8-flash"},
  anthropic:{url:"https://console.anthropic.com/settings/keys",hint:"sk-ant-…",model:"claude-sonnet-5-5"},
  groq:{url:"https://console.groq.com/keys",hint:"gsk_…",model:"openai/gpt-oss-120b"}
 };
 const keyLabel=E("div","translator-key-label");keyLabel.append(E("span","","API key"));
 const keyTools=E("div","translator-key-tools");
 const reveal=E("button","translator-reveal","ПОКАЗАТЬ");reveal.type="button";reveal.onclick=()=>{const show=key.type==="password";key.type=show?"text":"password";reveal.textContent=show?"СКРЫТЬ":"ПОКАЗАТЬ";};
 const keyLink=E("a","translator-key-link","Получить ключ ↗");keyLink.target="_blank";keyLink.rel="noopener noreferrer";
 keyTools.append(reveal,keyLink);keyLabel.append(keyTools);
 const keyField=E("label","translator-field");keyField.append(keyLabel,key);
 const aiGrid=E("div","translator-form-grid");aiGrid.append(field("Провайдер",provider),keyField,field("Модель API",model));
 const hint=E("p","translator-hint","Ключи хранятся в локальном хранилище Chrome на этом устройстве. Запросы отправляются напрямую выбранному API-провайдеру.");
 const testRow=E("div","translator-test-row"),test=E("button","action","ПРОВЕРИТЬ ПЕРЕВОД"),testStatus=E("span","save-hint","");
 testRow.append(test,testStatus);ai.append(aiGrid,hint,testRow);panel.append(ai);
 let activeProvider=provider.value;
 const keyMap={...(cfg.apiKeys||{})},modelMap={...(cfg.models||{})};
 function syncProvider(){
  activeProvider=provider.value;const info=details[activeProvider];
  keyLink.href=info.url;key.placeholder=info.hint;key.value=keyMap[activeProvider]||"";
  model.value=modelMap[activeProvider]||info.model;
 }
 function syncMethod(){ai.hidden=method.value!=="ai";}
 syncProvider();syncMethod();
 const actions=E("div","settings-actions"),reset=E("button","action","СБРОСИТЬ НАСТРОЙКИ"),saveHint=E("span","save-hint","Изменения сохраняются автоматически");
 actions.append(reset,saveHint);panel.append(E("div","settings-divider"),actions);
 content.replaceChildren(page,panel);
 let timer=0;
 function captureProvider(){keyMap[activeProvider]=key.value.trim();modelMap[activeProvider]=model.value.trim();}
 function save(){
  captureProvider();clearTimeout(timer);saveHint.textContent="СОХРАНЕНИЕ…";
  timer=setTimeout(async()=>{
   const next=structuredClone(state);
   next.settings.translator={...cfg,axiom:axiom.checked,x:x.checked,autoAxiom:autoAxiom.checked,autoX:autoX.checked,method:method.value,provider:provider.value,apiKeys:{...keyMap},models:{...modelMap},targetLanguage:language.value};
   try{await write(next);saveHint.textContent="СОХРАНЕНО";}catch{saveHint.textContent="ОШИБКА СОХРАНЕНИЯ";}
  },220);
 }
 provider.addEventListener("change",()=>{captureProvider();syncProvider();save();});
 method.addEventListener("change",()=>{syncMethod();save();});
 [axiom,x,autoAxiom,autoX,language,key,model].forEach(el=>{el.addEventListener("change",save);el.addEventListener("input",save);});
 test.onclick=async()=>{
  captureProvider();test.disabled=true;testStatus.textContent="ПРОВЕРКА…";
  try{
   const settings={...cfg,method:method.value,provider:provider.value,apiKeys:{...keyMap},models:{...modelMap},targetLanguage:language.value};
   const res=await chrome.runtime.sendMessage({type:"STASH_TRANSLATE_TEXT",text:"gm fren, testing $SOL",to:language.value,settings});
   if(!res?.ok)throw new Error(res?.error||"Не удалось получить ответ");
   testStatus.textContent="API РАБОТАЕТ · "+res.text.slice(0,70);
  }catch(e){testStatus.textContent="ОШИБКА · "+(e.message||"API error");}
  finally{test.disabled=false;}
 };
 reset.onclick=async()=>{const next=structuredClone(state);next.settings.translator={...TRANSLATOR_DEFAULTS};await write(next);translator();};
}
function render(){navRender();const id=location.hash.slice(1)||"overview";if(id==="overview")overview();else if(id==="lastath")lastath();else if(id==="migration")migration();else if(id==="stretch")stretch();else if(id==="usernames")usernames();else if(id==="devglow")devglow();else if(id==="pumpTwitter")pumpTwitter();else if(id==="translator")translator();else{const m=MODULES.find(x=>x.id===id);if(!m)return overview();const h=E("section","page-head");h.append(E("div","kicker","MODULE CONFIGURATION"),E("h1","",m.name),E("p","lead",m.subtitle+" · "+m.target));const p=E("section","section settings-panel");p.append(E("div","empty-state","Модуль пока не подключён. Его оригинальные функции и настройки будут перенесены отдельным этапом."));content.replaceChildren(h,p);}}
async function init(){state=await read();render();chrome.storage.onChanged.addListener((c,a)=>{if(a==="local"&&c[STORAGE_KEY]){state=normalizeState(c[STORAGE_KEY].newValue);if(!document.activeElement?.closest(".settings-panel"))render();}});window.addEventListener("hashchange",render);}init().catch(e=>{status.textContent="ERROR";content.textContent="Не удалось загрузить настройки: "+e.message;});
