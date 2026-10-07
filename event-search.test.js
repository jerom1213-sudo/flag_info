const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extractEvents,allowed,startSearch,searchRange,calendarEntries,calendarEvent,SOURCES}=require('./event-search');
const meta={title:'2026년 10월중 업무계획',source:'시험 기관',sourceUrl:'https://example.go.kr/post'};
test('행사 개최라는 일반 제목과 원형 번호 항목도 누락 없이 조회',()=>{
 const text='송암동\n② 「돌봄이웃 건강음료 지원」행사 개최\n○ 일시/장소:10.13.(화)10:00/송암동 행정복지센터 2층 회의실\n○ 대상:복지사각 저소득 돌봄이웃 60세대\n○ 주요내용:거동불편 취약계층에게 건강음료 지원\n○ 주관:송암동 지역사회보장협의체';
 const e=extractEvents(text,meta,'2026-10-01','2026-10-31');assert.equal(e.length,1);assert.equal(e[0].name,'「돌봄이웃 건강음료 지원」행사');assert.equal(e[0].date,'2026-10-13');assert.equal(e[0].time,'10:00');assert.equal(e[0].place,'송암동 행정복지센터 2층 회의실');assert.equal(e[0].organizer,'송암동 지역사회보장협의체');assert.equal(e[0].content,'거동불편 취약계층에게 건강음료 지원');assert.equal(extractEvents(text,meta,'2026-10-14').length,0);
});
test('분류 키워드 없이도 구체적인 일시·장소가 있는 모임 조회, 행정 접수는 제외',()=>{
 const text='□ 이웃과 함께하는 복지 나눔\n○ 일시:10.14.(수)10:00\n○ 장소:주민센터\n○ 내용:지역주민 공동활동\n□ 지원금 신청 접수\n○ 일시:10.14.(수)10:00\n○ 장소:주민센터';
 const e=extractEvents(text,meta,'2026-10-14');assert.equal(e.length,1);assert.equal(e[0].name,'이웃과 함께하는 복지 나눔');assert.equal(e[0].place,'주민센터');
});
test('HWPX 한 셀에 합쳐진 송암동 본문에서 행사별 필드를 복원',()=>{
 const text='송암동\n10.17.(토)10:00\t송암동 동민한마음축제\t효천 물빛노닐터근린공원\t송암동\n󰊱 2026년 송암동 동민한마음축제 개최  ❍ 일시/장소 : 10.17.(토)10:00/효천 물빛노닐터근린공원 (효천로 140) ❍ 주요내용   - 동민한마음축제 : 기념행사(개회식, 표창 등), 장기자랑, 체험부스 운영 등   - 주민총회 : ’26년 마을사업 성과공유 및 ’27년 마을의제 선정 ❍ 주 관 : 송암 동 동민한마음축제추진위원회 󰊲 돌봄이웃 행사 ❍ 일시/장소 : 10.13.(화)10:00/행정복지센터 ❍ 주요내용 : 건강음료 ❍ 주관 : 지역사회보장협의체';
 const e=extractEvents(text,{...meta,source:'광주 남구',sourceId:'namgu'},'2026-10-01','2026-10-31');assert.equal(e.length,2);const s=e.find(x=>x.name==='송암동 동민한마음축제');const welfare=e.find(x=>x.name==='돌봄이웃 행사');assert.equal(welfare.date,'2026-10-13');assert.equal(welfare.organizer,'지역사회보장협의체');assert.equal(s.place,'효천 물빛노닐터근린공원(효천로 140)');assert.equal(s.time,'10:00');assert.equal(s.date,'2026-10-17');assert.equal(s.end,s.date);assert.equal(s.organizer,'송암동 동민한마음축제추진위원회');assert.equal(s.host,'광주남구청');assert.equal(s.hostBasis,'사용자 확인 정보');assert.match(s.content,/\n- 주민총회/);assert.doesNotMatch(s.content,/건강음료|지역사회보장협의체/);
});
test('다른 명칭의 요약표와 상세 본문 연결 및 장소의 참석인원 분리',()=>{
 const text='대촌동\n10.8.(목)10:30\t대촌동 동민한마음축제\t빛고을농촌테마공원\t대촌동\n󰊱 대촌동 한마음축제 및 제70회 체육대회 개최 ❍ 일시 : 10.8.(목)09:30~16:30 ※개회식 10:30 ❍ 장소/인원 : 빛고을농촌테마공원/주민 650명 ❍ 주요내용 : 공연, 체육활동 ❍ 주관 : 대촌동 축제추진위원회';
 const e=extractEvents(text,meta,'2026-10-08');assert.equal(e.length,1);assert.equal(e[0].place,'빛고을농촌테마공원');assert.equal(e[0].time,'10:30');assert.equal(e[0].organizer,'대촌동 축제추진위원회');
});
test('상세 행사 기간·개막 시각·주관 부서·내용을 우선하고 요약표 중복 제외',()=>{
 const text='10.15.(목) 제11회 광주서창억새축제 영산강변\n※ 개막식:10.15.(목)17:00\n10.18.(일)\n문화예술과\n\uF000 제11회 광주서창억새축제 개최\n○ 기간:2026.10.15.(목) ~ 10.18.(일)\n※ 개막식:2026.10.15.(목) 17:00\n○ 장소:영산강변(극락교~서창교 나눔누리숲)\n○ 주요내용:뚜벅뚜벅 억새탐험대, SG 억새밭 라운지,\n왈왈 런!, 선셋 라이브\n○ 주최:서구\n\uF000 2026년 광주서창 억새노을마라톤(선셋런) 개최\n○ 일시:2026.10.17.(토)16:00~18:00\n○ 장소:(출발)상무시민공원 → (도착)서창억새축제장\n○ 종목/인원:2개 종목(5km, 10km) / 2,500명\n○ 주최:서구';
 const events=extractEvents(text,{...meta,source:'광주 서구',sourceId:'seogu'},'2026-10-07','2026-10-31');
 assert.equal(events.length,2);const [festival,run]=events;assert.equal(festival.name,'제11회 광주서창억새축제');assert.equal(festival.date,'2026-10-15');assert.equal(festival.end,'2026-10-18');assert.equal(festival.time,'17:00');assert.equal(festival.organizer,'광주 서구 문화예술과');assert.match(festival.content,/선셋 라이브/);assert.doesNotMatch(festival.content,/주최/);
 assert.equal(run.date,'2026-10-17');assert.equal(run.time,'16:00');assert.equal(run.end,run.date);assert.equal(run.content,'2개 종목(5km, 10km) / 2,500명');
 assert.equal(extractEvents(text,{...meta,source:'광주 서구'},'2026-10-19','2026-10-31').length,0);
});
test('명시된 주관기관은 담당부서보다 우선',()=>{
 const e=extractEvents('문화예술과\n□ 마을축제\n○ 일시:2026.10.7. 10:00\n○ 장소:광장\n○ 주관:마을축제추진위원회\n○ 행사내용:공연과 체험',meta,'2026-10-07')[0];assert.equal(e.organizer,'마을축제추진위원회');assert.equal(e.organizerBasis,'');assert.equal(e.content,'공연과 체험');
});
test('공식 달력 중복 일정과 다른 달 날짜 제외',()=>{
 const html='<a data-idx="1" data-date="2026-10-16">음악제</a><a data-date="2026-10-17" data-idx="1">음악제</a><a data-date="2026-11-01" data-idx="2">축제</a>';
 assert.equal(calendarEntries(html,'2026-10').length,1);
});
test('공식 달력 상세의 날짜·시간·장소와 출처 보존',()=>{
 const source=SOURCES.find(s=>s.id==='mokpo');
 const e=calendarEvent({idx:'6237',title:'제23회 전남교육음악제',start_date:'2026-10-16',finish_date:'2026-10-16',start_time:'14:00',finish_time:'16:00',place:'목포시민문화체육센터 대공연장'},source);
 assert.equal(e.date,'2026-10-16');assert.equal(e.time,'14:00 ~ 16:00');assert.equal(e.place,'목포시민문화체육센터 대공연장');assert.equal(new URL(e.sourceUrl).searchParams.get('idx'),'6237');
 assert.throws(()=>calendarEvent({idx:'1',title:'행사',start_date:'2026-02-30'},source));
});
test('기간 양 끝 포함 및 겹치는 행사 중복 방지',()=>{
 const text='□ 마을축제\n일시:2026.10.6. ~ 10.9.\n장소:광장\n□ 추모식\n일시:2026.10.10.\n장소:기념관';
 const e=extractEvents(text,meta,'2026-10-07','2026-10-10');assert.equal(e.length,2);assert.equal(e[0].end,'2026-10-09');
 assert.equal(extractEvents(text,meta,'2026-10-11','2026-10-12').length,0);
});
test('떨어진 두 행사 날짜는 기간 조회에서도 따로 제공',()=>{
 const text='□ 골목상권 활력축제\n일시/장소:2026.10.2.(금),10.30.(금)~10.31.(토)/ 광장';
 const e=extractEvents(text,meta,'2026-10-01','2026-10-31');assert.equal(e.length,2);assert.deepEqual(e.map(x=>x.date),['2026-10-02','2026-10-30']);
});
test('월·연도를 넘는 검색 대상 월 및 역순 날짜 검증',()=>{
 assert.deepEqual(searchRange({startDate:'2026-12-31',endDate:'2027-02-01'}).months,['2026-12-01','2027-01-01','2027-02-01']);
 assert.throws(()=>searchRange({startDate:'2026-10-08',endDate:'2026-10-07'}));
 assert.throws(()=>searchRange({startDate:'2026-02-30',endDate:'2026-03-02'}));
 const e=extractEvents('□ 마을축제\n일시:11.1.\n장소:광장',{...meta,title:'2026년 11월중 업무계획'},'2026-10-31','2026-11-02');assert.equal(e.length,1);assert.equal(e[0].date,'2026-11-01');
});
test('월중업무계획 표의 날짜·행사명·장소 대응',()=>{
 const text='10.7.(수)10:00\t제30회 남구 노인의날 기념행사\t남구다목적체육관\t으뜸효정책과\n10.8.(목)10:30\t대촌동 동민한마음축제\t빛고을농촌테마공원\t대촌동';
 const events=extractEvents(text,meta,'2026-10-07');assert.equal(events.length,1);assert.equal(events[0].name,'제30회 남구 노인의날 기념행사');assert.equal(events[0].place,'남구다목적체육관');
});
test('시간 범위를 날짜 범위로 잘못 확장하지 않음',()=>{
 const text='□ 마을축제\n- 일시: 2026.10.3.(토)14:00~22:00\n- 장소: 마을광장';
 assert.equal(extractEvents(text,meta,'2026-10-07').length,0);
 const e=extractEvents(text,meta,'2026-10-03')[0];assert.equal(e.end,'2026-10-03');assert.equal(e.place,'마을광장');
});
test('분리된 행사 날짜 사이를 행사 기간으로 만들지 않음',()=>{
 const text='□ 골목상권 활력축제\no일시/장소:2026.10.2.(금),10.30.(금)~10.31.(토)/ 첨단문화광장';
 assert.equal(extractEvents(text,meta,'2026-10-07').length,0);
 assert.equal(extractEvents(text,meta,'2026-10-31')[0].place,'첨단문화광장');
});
test('행사 블록 사이의 날짜와 장소가 섞이지 않음',()=>{
 const text='□ 마을축제\n일시:10.3.(토) 14:00\n장소:광장\n□ 추모식\n일시:10.7.(수) 10:00\n장소:기념관';
 const e=extractEvents(text,meta,'2026-10-07');assert.equal(e.length,1);assert.equal(e[0].name,'추모식');assert.equal(e[0].place,'기념관');
});
test('연도 근거 없는 날짜와 잘못된 날짜 제외',()=>{
 assert.equal(extractEvents('□ 마을축제\n일시:10.7.',{...meta,title:'보도자료'},'2026-10-07').length,0);
 assert.equal(extractEvents('□ 마을축제\n일시:2026.2.30.',meta,'2026-03-02').length,0);
 assert.throws(()=>startSearch({date:'2026-02-30',sources:['namgu']}));
});
test('공연 표의 시간 라벨이 날짜 줄을 가리지 않음',()=>{
 const text='□ 문화예술축제 공연\n구분 염주어린이공원\n10.7.(수) 10.31.(토)\n일 시 18:30~19:10';
 assert.equal(extractEvents(text,meta,'2026-10-07').length,1);
});
test('기관 외부 또는 로컬 주소 접근 제외',()=>{
 const s={url:'https://www.gwangsan.go.kr/'};assert.equal(allowed('http://127.0.0.1/',s),false);assert.equal(allowed('https://www.gwangsan.go.kr.evil.com/',s),false);assert.equal(allowed('https://www.gwangsan.go.kr:8080/',s),false);assert.equal(allowed('https://www.gwangsan.go.kr/boardView.do',s),true);
});
