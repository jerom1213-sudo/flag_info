const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const search=require('./event-search');
function createEventServer() {
  const send=(res,status,data,type='application/json; charset=utf-8')=>{
    res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(type.startsWith('application/json')?JSON.stringify(data):data);
  };
  return http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{ok:true,application:'the-flag-event-finder'});
      if(req.method==='GET'&&['/','/events','/events.html'].includes(url.pathname)) {
        const html=await fs.promises.readFile(path.join(__dirname,'events.html'),'utf8');
        return send(res,200,html.replace('<a href="/">통합관리 →</a>','<a href="/events">행사 검색 →</a>'),'text/html; charset=utf-8');
      }
      if(req.method==='GET'&&url.pathname==='/api/events/sources')return send(res,200,search.SOURCES);
      if(req.method==='GET'&&url.pathname.startsWith('/api/events/jobs/')) {
        const job=search.getJob(url.pathname.split('/').pop());
        return send(res,job?200:404,job||{error:'검색 세션이 만료되었습니다. 다시 검색하세요.'});
      }
      if(req.method==='POST'&&url.pathname==='/api/events/search') {
        let bytes=0,body='';
        for await(const chunk of req){bytes+=chunk.length;if(bytes>65536)return send(res,413,{error:'요청 크기 제한'});body+=chunk.toString('utf8');}
        try{return send(res,202,search.startSearch(JSON.parse(body)));}
        catch(e){return send(res,400,{error:e.message});}
      }
      return send(res,404,{error:'지원하지 않는 경로입니다.'});
    }catch(e){if(!res.headersSent)send(res,500,{error:'서버 처리 실패'});else res.end();}
  });
}
if(require.main===module) {
  const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||4174),server=createEventServer();
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`포트 ${port}를 다른 프로그램이 사용 중입니다. PORT를 변경하세요.`:e.message);process.exitCode=1;});
  server.listen(port,host,()=>console.log(`행사 검색: http://${host==='0.0.0.0'?'localhost':host}:${port}/events\n종료: Ctrl+C`));
}
module.exports={createEventServer};
