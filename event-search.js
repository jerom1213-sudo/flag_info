const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const SOURCES = require('./event-sources.json');
const CORRECTIONS = require('./event-corrections.json');
const cache = new Map();
const jobs = new Map();
const EVENT = /체육대회|결혼식|장례식|추모식|창립|개막식|개회식|개청식|발대식|전야제|축제|페스티벌|야시장|한마당|운동회|마라톤|선셋런|주민총회|경진대회|협의회|이\s*[·ㆍ]?\s*취임|전시회|기념일|구민의\s*날|시민의\s*날|결의대회|장기자랑|행사\s*(?:개최|추진|운영)|(?:지원|초청|공개|나눔|기념)\s*행사|기념식|예술제|노조|음악회|문화제|공연|간담회|발표회/;
const PLAN = /월\s*중.{0,15}(?:업무|계획)|월별\s*업무|주요\s*업무\s*(?:추진\s*)?계획|주요\s*행사|주간\s*업무|주간\s*행사/;
function decode(s) {
  return String(s).replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(x[\da-f]+|\d+);/gi, (m,n) => n ? String.fromCodePoint(parseInt(n.replace(/^x/i,''),/^x/i.test(n)?16:10)) : ({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '})[m.toLowerCase()] || m);
}
function plain(s) { return decode(s.replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<\/(?:p|div|tr|li|h[1-6])>|<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim(); }
function allowed(u, source) {
  const a = new URL(u), b = new URL(source.url);
  const host = b.hostname.replace(/^www\./,'');
  return ['http:','https:'].includes(a.protocol) && !a.username && !a.password && (!a.port || ['80','443'].includes(a.port)) && (a.hostname===host || a.hostname.endsWith('.'+host));
}
async function fetchOfficial(u, source, options={}) {
  let next=u;
  for(let n=0;n<5;n++) {
    if(!allowed(next,source)) throw Error('공식 기관 외부 링크는 원문으로 확인하세요');
    const r=await fetch(next,{...options,signal:AbortSignal.timeout(12000),redirect:'manual',headers:{'User-Agent':'TheFlagEventFinder/1.0','Accept':'text/html,application/pdf,*/*',...options.headers}});
    if(r.status>=300 && r.status<400) { next=new URL(r.headers.get('location'),next).href; if([301,302,303].includes(r.status))options={}; continue; }
    if(!r.ok) throw Error(`기관 응답 HTTP ${r.status}`);
    if(Number(r.headers.get('content-length'))>15_000_000) throw Error('첨부파일 크기 제한(15MB)');
    const chunks=[];let size=0;
    for await(const c of r.body) { size+=c.length;if(size>15_000_000)throw Error('첨부파일 크기 제한(15MB)');chunks.push(c); }
    return {buffer:Buffer.concat(chunks),url:next,type:r.headers.get('content-type')||''};
  }
  throw Error('리디렉션 횟수 제한');
}
function htmlOf(r) {
  const lead=r.buffer.subarray(0,3000).toString();
  return new TextDecoder(/euc-kr|ks_c_5601/i.test(r.type+lead)?'euc-kr':'utf-8').decode(r.buffer);
}
function links(html, base, source) {
  const result=[];
  for(const m of html.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi)) {
    const href=m[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if(!href || /^(?:javascript:|#|mailto:)/i.test(href))continue;
    try {const url=new URL(decode(href),base).href;if(allowed(url,source))result.push({url,title:plain(m[2])});}catch{}
  }
  return [...new Map(result.map(x=>[x.url,x])).values()];
}
function extractDocument(buffer) {
  const bundled=process.platform==='win32' && path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE||'','AppData','Local'),'..','..','.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe');
  const venv=path.join(__dirname,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const python=process.env.EVENT_PYTHON || (fs.existsSync(venv)?venv:bundled && fs.existsSync(bundled)?bundled:'python');
  return new Promise((resolve,reject)=>{
    const child=spawn(python,[path.join(__dirname,'extract-event-document.py')],{windowsHide:true});let out='';let err='';
    const timer=setTimeout(()=>{child.kill();reject(Error('첨부파일 분석 시간 초과'));},20000);
    child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);
    child.on('error',e=>{clearTimeout(timer);reject(e)});
    child.on('close',()=>{clearTimeout(timer);try{const r=JSON.parse(out);r.error?reject(Error(r.error)):resolve(r.text);}catch{reject(Error(err.slice(0,200)||'첨부파일 분석 실패'));}});
    child.stdin.on('error',()=>{});child.stdin.end(buffer);
  });
}
function labelledField(text,pattern) {
  const match=text.match(new RegExp('(?:^|[\\n○❍●])\\s*(?:[-·]|o)?\\s*(?:'+pattern+')(?:\\s*[:：]\\s*|\\s*\\n\\s*|[ \\t]{2,})([^○❍●\\uE000-\\uF8FF]+)'));
  return match?match[1].split(/\n\s*(?:※|\[페이지|[-–]\s*\d+\s*[-–]|(?:주\s*관|주\s*최|장\s*소|일\s*시|기\s*간)\s*[:：])/)[0].split('\n').map(s=>s.replace(/[ \t]+/g,' ').trim()).filter(Boolean).join('\n').trim():'';
}
function eventKey(name){return name.replace(/^20\d{2}\s*년?\s*/,'').replace(/개최|추진|[\s「」『』〔〕()（）]/g,'');}
function consolidateEvents(events) {
  const detailed=events.filter(e=>e.detailLevel==='detail');
  const comparable=name=>eventKey(name).replace(/제\d+회|동민/g,'');
  const kept=events.filter(e=>e.detailLevel==='detail'||!detailed.some(d=>d.sourceId===e.sourceId&&d.attachmentUrl===e.attachmentUrl&&eventKey(d.name).length>=6&&(eventKey(e.name).includes(eventKey(d.name))||(e.date===d.date&&comparable(e.name).length>=6&&comparable(d.name).includes(comparable(e.name))))));
  const groups=new Map();
  for(const e of kept){const key=(e.sourceId||e.source)+eventKey(e.name)+e.date+e.end;const previous=groups.get(key);if(!previous||e.detailLevel==='detail'&&previous.detailLevel!=='detail')groups.set(key,e);}
  return [...groups.values()];
}
function extractEvents(text, meta, date, endDate=date) {
  const documentMonth=meta.title.match(/(20\d{2})\s*년?\s*(\d{1,2})\s*월/);
  const year=documentMonth?+documentMonth[1]:Number(date.slice(0,4));
  // A short date inherits a year only from a matching monthly document title.
  const monthly=Boolean(documentMonth);
  // HWPX cells can flatten many paragraphs into one line; restore heading and field boundaries first.
  const normalized=text.replace(/\x00/g,' ').replace(/[①-⑳\uE000-\uF8FF\u{F0000}-\u{FFFFD}]/gu,'\n□ ').replace(/([○❍●])\s*/g,'\n$1 ').replace(/\s+-\s+(?=[가-힣「])/g,'\n- ');
  const lines=normalized.split('\n').map(x=>x.trim()).filter(Boolean), results=[];
  let department='';
  for(let i=0;i<lines.length;i++) {
    if(/^[가-힣0-9· ]{2,25}(?:과|실|담당관|동)$/.test(lines[i]))department=lines[i].replace(/\s+/g,'');
    if(lines[i].length>180 || /^(?:o\s|[-–·‣❍○:：]|\((?:기념행사|부스|프로그램)|축제명|※)|장[^가-힣\n]{0,20}소\s*[:：]|내\s*용\s*[:：]|대\s*상\s*[:：]|일\s*시\s*[:：]|추진배경|축제개요|방역|환경개선|모집|추진기간|안전관리|자원봉사자 배치/.test(lines[i]))continue;
    if(!EVENT.test(lines[i])&&!/^[□■]/.test(lines[i]))continue;
    const cells=lines[i].split('\t').map(c=>c.trim());
    const tableRow=cells.length>=3 && /\d{1,2}\s*[.월/]\s*\d{1,2}/.test(cells[0]) && EVENT.test(cells[1]);
    const detailLevel=/^[□■\uE000-\uF8FF]/.test(lines[i])?'detail':'summary';
    const title=(tableRow?cells[1]:lines[i]).replace(/^[□○❍▪■●\uE000-\uF8FF\s]+/,'').replace(/^(?:(?:20\d{2}\s*[.년/-]\s*)?\d{1,2}\s*[.월/]\s*)?\d{1,2}\.\s*\([월화수목금토일]\)\s*/,'').replace(/^\d{1,2}\.\s*/,'').replace(/^20\d{2}\s*년\s*/,'').replace(/\s*(?:개최|추진)\s*$/,'').replace(/\s+/g,' ').trim();
    if(/(?:축제장|행사장|공연장)$/.test(title))continue;
    const before=[];
    const after=[];
    if(!tableRow)for(let j=i+1;j<Math.min(lines.length,i+30);j++){if(/^[□■]|^\[페이지|^\d{1,2}\.\s*(?:[^\d\s]|20\d{2}\D)|^<\s*(?:일반|주요)업무/.test(lines[j])||/^[가-힣0-9· ]{2,25}(?:과|실|담당관|동)$/.test(lines[j]))break;after.push(lines[j]);}
    const window=[...before,lines[i],...after].join('\n');
    // Detailed scheduled gatherings need not contain a fixed festival/category keyword.
    if(!EVENT.test(lines[i])) {
      const when=labelledField(window,'일\\s*시(?:\\s*/\\s*장\\s*소)?');
      const where=labelledField(window,'장\\s*소')||(when.includes('/')?when.split('/').slice(1).join('/'):'');
      if(!when||!where||!/\d{1,2}\s*[.월/]\s*\d{1,2}/.test(when)||/조사|점검|접수|신청|모집|관리|정비|발급|지급|전수|공사/.test(title))continue;
    }
    // Prefer labelled event dates, never infer a date from a publication timestamp.
    const inlineDate=/(?:20\d{2}\s*[.년/-]\s*)?\d{1,2}\s*[.월/]\s*\d{1,2}(?![\d:])/.test(lines[i]);
    const labelled=window.split('\n').find(x=>/일\s*시|기\s*간/.test(x));
    if(labelled && /접수기간|신청기간|모집기간/.test(labelled))continue;
    const labelledDate=labelled && /\d{1,2}\s*[.월/]\s*\d{1,2}(?![\d:])/.test(labelled);
    const dateLine=tableRow?cells[0]:inlineDate?lines[i]:labelledDate?labelled:title+' '+after.slice(0,4).join(' ');
    const format=(y,m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const valid=(y,m,d)=>m>=1&&m<=12&&d>=1&&d<=31&&new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)===format(y,m,d);
    const tokens=[...dateLine.matchAll(/(?<![\d.])(?:(20\d{2}|[‘’']\d{2})\s*[.년/-]\s*)?(\d{1,2})\s*[.월/]\s*(\d{1,2})(?![\d:])\s*[.일]?/g)];
    const spans=[];
    let consumedUntil=-1;
    for(const token of tokens){
      if(token.index<consumedUntil)continue;
      if(!token[1]&&!monthly)continue;
      const y=token[1]?+(token[1].replace(/[‘’']/,'20')):year,m=+token[2],d=+token[3];if(!valid(y,m,d))continue;
      const start=format(y,m,d),tail=dateLine.slice(token.index+token[0].length);
      const range=tail.match(/^\s*(?:\([^)]*\))?\s*(?:~|∼|〜|부터)\s*(?:(20\d{2})\s*[.년/-]\s*)?(?:(\d{1,2})\s*[.월/]\s*)?(\d{1,2})(?![\d:])\s*[.일]?(?=\s|\(|$)/);
      const end=range&&valid(+(range[1]||y),+(range[2]||m),+range[3])?format(+(range[1]||y),+(range[2]||m),+range[3]):start;
      if(range)consumedUntil=token.index+token[0].length+range[0].length;
      spans.push({start,end});
    }
    if(!spans.length)continue;
    const opening=window.match(/(?:개막식|개회식|기념식)\s*[:：]?[^\n]*?\b([012]?\d:[0-5]\d)\b/);
    const time=opening?.[1]||dateLine.match(/\b([012]?\d:[0-5]\d)\b/)?.[1] || '';
    let place=tableRow?cells[2]:labelledField(window,'장\\s*소(?:\\s*/\\s*인원)?');
    const combined=labelledField(window,'일\\s*시\\s*/\\s*장\\s*소');
    if(combined)place=combined.split('/').slice(1).join('/').trim();
    if(/장\s*소\s*\/\s*인원/.test(window))place=place.split('/')[0].trim();
    place=place.split(/[❍○]|주요내용|주요\s*내용/)[0].replace(/\s+/g,' ').trim();
    if(/^(?:일\s*시|기\s*간|구\s*분)$/.test(place))place='';
    if(/20\d{2}\s*[.년/-]|’\d{2}\s*\./.test(place))place='';
    const explicitOrganizer=labelledField(window,'주\\s*관(?:기관)?|주\\s*최\\s*/\\s*주\\s*관');
    const organizer=(explicitOrganizer||(tableRow?cells[3]||'':'')||(department?meta.source+' '+department:'')).replace(/([가-힣])\s+동(?=\s|$)/g,'$1동');
    const host=labelledField(window,'주\\s*최(?:\\s*/\\s*협조)?').split('/')[0].trim();
    const content=labelledField(window,'행사\\s*내용|주요\\s*내용|내\\s*용')||labelledField(window,'종목\\s*/\\s*인원');
    for(const {start,end} of spans){
      const correction=CORRECTIONS.find(c=>c.sourceId===meta.sourceId&&c.date===start&&eventKey(c.name)===eventKey(title));
      results.push({...meta,name:title,date:start,end,time,place:place.replace(/\s+\(/g,'(')||'장소 확인 필요',organizer,organizerBasis:!explicitOrganizer&&department?'담당부서':'',host:host||correction?.host||'',hostBasis:!host&&correction?correction.basis:'',content,detailLevel,evidence:window+(correction?'\n주최기관 보완: '+correction.host+' ('+correction.basis+')':''),status:'원문 대조 필요'});
    }
  }
  return consolidateEvents(results).filter(e=>e.date<=endDate&&e.end>=date);
}
function monthMatch(title,date) {
  const [year,month]=date.split('-').map(Number);
  return title.includes(String(year)) && new RegExp(`(?:^|[^\\d])0?${month}\\s*월`).test(title);
}
function calendarEntries(html,month) {
  const entries=new Map();
  for(const m of html.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi)) {
    const date=m[1].match(/\bdata-date=["'](\d{4}-\d{2}-\d{2})["']/)?.[1];
    const idx=m[1].match(/\bdata-idx=["'](\d+)["']/)?.[1];
    if(date?.startsWith(month)&&idx)entries.set(idx,{idx,date,name:plain(m[2]).replace(/^행사\s*/,'')});
  }
  return [...entries.values()];
}
function calendarEvent(item,source) {
  const date=String(item.start_date||'').slice(0,10),end=String(item.finish_date||item.start_date||'').slice(0,10);
  const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  if(!valid(date)||!valid(end)||date>end||!/^\d+$/.test(String(item.idx))||!item.title)throw Error('행사 상세 날짜 또는 식별자 확인 필요');
  const url=new URL(source.url);url.searchParams.set('idx',item.idx);url.searchParams.set('mode','view');
  const time=item.all_day==='y'?'종일':[item.start_time,item.finish_time].filter(t=>/^\d{2}:\d{2}$/.test(t||'')).join(' ~ ');
  const name=plain(String(item.title)),place=plain(String(item.place||''))||'장소 확인 필요';
  const content=plain(String(item.contents||''));
  const organizer=content.match(/주\s*관(?:기관)?\s*[:：]\s*([^\n]+)/)?.[1]?.trim()||'';
  const host=content.match(/주\s*최\s*[:：]\s*([^\n]+)/)?.[1]?.trim()||'';
  return {source:source.name,sourceId:source.id,sourceUrl:url.href,title:name,name,date,end,time,place,organizer,host,content,evidence:`행사명: ${name}\n기간: ${date} ~ ${end}\n시간: ${time||'시간 확인 필요'}\n장소: ${place}\n${content}`,status:'공식 행사 일정 · 변경 여부 확인'};
}
async function collectCalendar(source,date,refresh) {
  const key=source.id+date.slice(0,7),saved=cache.get(key);
  if(!refresh&&saved&&Date.now()-saved.at<15*60*1000)return {...saved,events:saved.nativeEvents.filter(e=>e.date<=date&&e.end>=date),cached:true};
  const data={source:source.name,sourceId:source.id,url:source.url,documents:[],nativeEvents:[],materials:[],issues:[],pages:0,at:Date.now(),status:'기관 조회 실패'};
  try {
    const url=new URL(source.url);url.searchParams.set('date',date.slice(0,7)+'-01');
    data.pages++;const html=htmlOf(await fetchOfficial(url.href,source));
    if(!/data-date|calendar_icon|list_month/.test(html))throw Error('행사 달력 형식을 확인하지 못함');
    const entries=calendarEntries(html,date.slice(0,7));
    const material={url:url.href,title:date.slice(0,7)+' 목포시 행사 달력',source:source.name,attachments:[],status:'행사 상세 조회 완료'};data.materials.push(material);
    const byDate=new Map();
    for(const entry of entries) {
      try {
        if(!byDate.has(entry.date)) {
          data.pages++;
          const response=await fetchOfficial(source.url,source,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({mode:'list',idx:entry.idx,sub_mode:'thisdate',date:entry.date,return:'json'})});
          const json=JSON.parse(response.buffer.toString('utf8'));if(!Array.isArray(json.list))throw Error('행사 상세 응답 형식 확인 필요');byDate.set(entry.date,json.list);
        }
        const item=byDate.get(entry.date).find(x=>String(x.idx)===entry.idx);if(!item)throw Error('행사 상세 정보를 찾지 못함');
        data.nativeEvents.push(calendarEvent(item,source));
      }catch(e){data.issues.push(entry.name+': '+e.message);material.status='행사 상세 일부 조회 실패: 원문 확인 필요';}
    }
    data.status=entries.length?'행사 달력 조회 완료':'해당 월 등록 행사 없음';
  }catch(e){data.issues.push(e.message);}
  cache.set(key,data);if(cache.size>120)cache.delete(cache.keys().next().value);
  return {...data,events:data.nativeEvents.filter(e=>e.date<=date&&e.end>=date),cached:false};
}
async function collect(source,date,refresh=false) {
  if(source.kind==='calendar')return collectCalendar(source,date,refresh);
  const key=source.id+date.slice(0,7);
  let data=cache.get(key);
  if(!refresh && data && Date.now()-data.at<15*60*1000)return {...data,events:data.documents.flatMap(d=>extractEvents(d.text,d.meta,date)),cached:true};
  const documents=[], materials=[], issues=[];let pages=0;
  async function page(url){pages++;return htmlOf(await fetchOfficial(url,source));}
  try {
    const first=await page(source.url), firstLinks=links(first,source.url,source);
    let boardLinks=source.board?[{url:source.url,title:'월중업무계획'}]:firstLinks.filter(x=>PLAN.test(x.title)||/공지사항|보도자료|새소식/.test(x.title)).slice(0,4);
    if(!boardLinks.length) {
      for(const entry of firstLinks.filter(x=>/업무계획|행정정보|정보공개|시정소식|군정소식|주요일정/.test(x.title)).slice(0,3)) {
        try{const h=await page(entry.url);boardLinks.push(...links(h,entry.url,source).filter(x=>PLAN.test(x.title)));}catch(e){issues.push(e.message);}
      }
    }
    const posts=new Map();
    for(const board of boardLinks.slice(0,4)) {
      try {
        const h=board.url===source.url?first:await page(board.url);
        for(const post of links(h,board.url,source)) {
          if((PLAN.test(post.title) && monthMatch(post.title,date)) || (EVENT.test(post.title) && /20\d{2}/.test(post.title) && post.title.includes(date.slice(0,4))))posts.set(post.url,post);
        }
        // Search exact requested year on known boards, to find months beyond the first page.
        if(source.board && !posts.size) {
          const u=new URL(board.url);u.searchParams.set(source.searchParam||(u.pathname.includes('board.es')?'keyWord':'searchKeyword'),date.slice(0,4));
          u.searchParams.set(source.searchField||(u.pathname.includes('board.es')?'keyField':'searchCondition'),source.searchValue||'title');
          const searched=await page(u.href);
          for(const post of links(searched,u.href,source))if(PLAN.test(post.title)&&monthMatch(post.title,date))posts.set(post.url,post);
        }
      }catch(e){issues.push(e.message);}
    }
    for(const post of [...posts.values()].slice(0,5)) {
      const material={...post,source:source.name,attachments:[],status:'본문 조회 중'};materials.push(material);
      try {
        const h=await page(post.url);
        const meta={source:source.name,sourceId:source.id,sourceUrl:post.url,title:post.title};
        // Restrict HTML extraction to the post body where the site exposes it.
        const body=h.match(/<(?:div|td)[^>]+(?:class|id)=["'][^"']*(?:board_txt|board_cont|view_cont|view-content|bbs_content|board_view_con)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|td)>/i)?.[1];
        if(body)documents.push({text:plain(body),meta});
        const files=links(h,post.url,source).filter(x=>!/preview|viewer|action=zip/i.test(x.url) && ((x.title && /\.pdf|\.hwpx?/i.test(x.url+' '+x.title)) || /fileDownload|boardDown|download\.es/i.test(x.url))).slice(0,3);
        for(const file of files) {
          const attachment={...file,status:'분석 중'};material.attachments.push(attachment);
          try {const r=await fetchOfficial(file.url,source);const text=await extractDocument(r.buffer);documents.push({text,meta:{...meta,attachmentUrl:file.url,attachmentName:file.title}});attachment.status='텍스트 분석 완료';}
          catch(e){attachment.status='확인 필요: '+e.message;issues.push(file.title+': '+e.message);}
        }
        material.status=files.length?(material.attachments.some(a=>a.status.startsWith('확인 필요'))?'첨부파일 일부 분석 실패: 원문 확인 필요':'첨부파일 분석 완료'):body?'본문 조회 완료':'첨부 링크를 읽지 못함: 원문 확인 필요';
      }catch(e){material.status='조회 실패: '+e.message;issues.push(e.message);}
    }
    data={source:source.name,sourceId:source.id,url:source.url,documents,materials,issues,pages,at:Date.now(),status:materials.length?'자료 조회 완료':boardLinks.length?'해당 월 자료를 찾지 못함':'월중업무계획 게시판 자동 탐색 실패'};
  }catch(e){data={source:source.name,sourceId:source.id,url:source.url,documents,materials,issues:[e.message],pages,at:Date.now(),status:'기관 조회 실패'};}
  cache.set(key,data);if(cache.size>120)cache.delete(cache.keys().next().value);
  return {...data,events:documents.flatMap(d=>extractEvents(d.text,d.meta,date)),cached:false};
}
function searchRange(input) {
  const startDate=input.startDate||input.date,endDate=input.endDate||input.date||startDate;
  const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  if(!valid(startDate)||!valid(endDate))throw Error('올바른 시작일과 종료일을 선택하세요');
  if(startDate>endDate)throw Error('종료일은 시작일과 같거나 이후여야 합니다');
  const months=[];let cursor=startDate.slice(0,7)+'-01';
  while(cursor.slice(0,7)<=endDate.slice(0,7)){
    months.push(cursor);const next=new Date(cursor+'T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);cursor=next.toISOString().slice(0,10);
  }
  return {startDate,endDate,months};
}
function startSearch(input) {
  const {startDate,endDate,months}=searchRange(input);
  if(!Array.isArray(input.sources)||!input.sources.length||input.sources.some(id=>!SOURCES.some(s=>s.id===id)))throw Error('검색할 지자체를 선택하세요');
  const selected=SOURCES.filter(s=>input.sources.includes(s.id));
  for(const [id,j] of jobs)if(Date.now()-j.createdAt>3600000)jobs.delete(id);
  if([...jobs.values()].filter(j=>!j.done).length>=3)throw Error('다른 조회가 진행 중입니다. 잠시 후 다시 검색하세요');
  const id=require('node:crypto').randomUUID(),job={id,startDate,endDate,total:selected.length,completed:0,totalMonths:months.length,done:false,results:[],createdAt:Date.now()};jobs.set(id,job);
  let cursor=0;
  async function worker(){while(cursor<selected.length){
    const source=selected[cursor++],results=[];
    for(const month of months)results.push(await collect(source,month,input.refresh===true));
    const materials=[...new Map(results.flatMap(r=>r.materials).map(m=>[m.url,m])).values()];
    const events=[...new Map(results.flatMap(r=>[...r.documents.flatMap(d=>extractEvents(d.text,d.meta,startDate,endDate)),...(r.nativeEvents||[]).filter(e=>e.date<=endDate&&e.end>=startDate)]).map(e=>[e.name+e.date+e.end+e.place,e])).values()];
    job.results.push({source:source.name,sourceId:source.id,url:source.url,materials,events,issues:results.flatMap((r,i)=>r.issues.map(issue=>months[i].slice(0,7)+': '+issue)),pages:results.reduce((n,r)=>n+r.pages,0),at:Math.max(...results.map(r=>r.at)),cached:results.every(r=>r.cached),status:materials.length?'자료 조회 완료':results[0].status,months:results.map((r,i)=>({month:months[i].slice(0,7),status:r.status}))});job.completed++;
  } }
  Promise.all(Array.from({length:Math.min(3,selected.length)},worker)).then(()=>job.done=true).catch(e=>{job.error=e.message;job.done=true;});
  return {id};
}
module.exports={SOURCES,startSearch,getJob:id=>jobs.get(id),extractEvents,links,allowed,collect,extractDocument,searchRange,calendarEntries,calendarEvent};
