"""Extract text only; no macros or external document processes are executed."""
import io, json, sys, struct, zlib, zipfile, xml.etree.ElementTree as ET

def hwp_text(data):
    # Read Compound File Binary (HWP 5) streams with bounded sector chains.
    size = 1 << struct.unpack_from('<H', data, 30)[0]
    if size not in (512, 4096):
        raise ValueError('지원하지 않는 HWP 구조')
    def sector(n):
        if n >= len(data)//size: raise ValueError('손상된 HWP')
        return data[(n+1)*size:(n+2)*size]
    def ints(b): return struct.unpack('<'+'I'*(len(b)//4), b)
    difat = list(struct.unpack_from('<109I', data, 76))
    nxt, count = struct.unpack_from('<II', data, 68)
    for _ in range(min(count, 4096)):
        if nxt >= 0xfffffffa: break
        values = ints(sector(nxt)); difat.extend(values[:-1]); nxt = values[-1]
    fat = []
    for n in difat:
        if n < 0xfffffffa: fat.extend(ints(sector(n)))
    def chain(n, table, read):
        parts, seen = [], set()
        while n < 0xfffffffa:
            if n in seen or n >= len(table): raise ValueError('손상된 HWP 체인')
            seen.add(n); parts.append(read(n)); n = table[n]
            if len(seen) > 65536: raise ValueError('HWP 크기 제한')
        return b''.join(parts)
    directory = chain(struct.unpack_from('<I', data, 48)[0], fat, sector)
    entries = []
    for i in range(0, len(directory), 128):
        e = directory[i:i+128]
        if len(e)<128: continue
        length=struct.unpack_from('<H', e, 64)[0]
        name=e[:max(0,length-2)].decode('utf-16le', errors='ignore')
        entries.append((name,e[66],struct.unpack_from('<I',e,116)[0],struct.unpack_from('<Q',e,120)[0]))
    root=next(e for e in entries if e[1]==5)
    mini=chain(root[2],fat,sector)[:root[3]]
    mini_start=struct.unpack_from('<I',data,60)[0]
    minifat=list(ints(chain(mini_start,fat,sector))) if mini_start<0xfffffffa else []
    def stream(e):
        return (chain(e[2],minifat,lambda n:mini[n*64:(n+1)*64]) if e[3]<4096 else chain(e[2],fat,sector))[:e[3]]
    header=stream(next(e for e in entries if e[0]=='FileHeader'))
    flags=struct.unpack_from('<I',header,36)[0]
    if flags & (2|4): raise ValueError('암호화 또는 배포용 HWP: 원문 확인 필요')
    lines=[]
    for e in sorted((e for e in entries if e[0].startswith('Section')),key=lambda e:e[0]):
        body=stream(e)
        if flags&1:
            dec=zlib.decompressobj(-15); body=dec.decompress(body,20_000_000)
            if dec.unconsumed_tail: raise ValueError('HWP 압축 크기 제한')
        pos=0
        while pos+4<=len(body):
            value=struct.unpack_from('<I',body,pos)[0]; pos+=4
            tag=value&1023; length=value>>20
            if length==4095: length=struct.unpack_from('<I',body,pos)[0]; pos+=4
            payload=body[pos:pos+length]; pos+=length
            if tag==67:
                # HWP inline control codes occupy 8 UTF-16 code units.
                units=list(struct.unpack('<'+'H'*(len(payload)//2),payload[:len(payload)//2*2])); clean=[]; i=0
                while i<len(units):
                    c=units[i]
                    if c in (1,2,3,11,12,14,15,16,17,18,19,20,21,22,23): i+=8; continue
                    if c>=32: clean.append(c)
                    elif c in (9,10,13): clean.append(32)
                    i+=1
                lines.append(struct.pack('<'+'H'*len(clean),*clean).decode('utf-16le',errors='ignore'))
    return '\n'.join(lines)

def extract(data):
    if data.startswith(b'%PDF'):
        from pypdf import PdfReader
        reader=PdfReader(io.BytesIO(data))
        if len(reader.pages)>500: raise ValueError('PDF 페이지 제한')
        return '\n'.join(f'\n[페이지 {i+1}]\n'+(p.extract_text(extraction_mode='layout') or '') for i,p in enumerate(reader.pages))
    if data.startswith(b'PK'):
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            members=[n for n in z.namelist() if n.startswith('Contents/section') and n.endswith('.xml')]
            if not members: raise ValueError('지원하지 않는 첨부파일')
            if sum(z.getinfo(n).file_size for n in members)>20_000_000: raise ValueError('HWPX 크기 제한')
            # A table lives inside its enclosing paragraph. Extract each paragraph's
            # own runs only, so nested cell paragraphs are not duplicated/concatenated.
            lines=[]
            for n in sorted(members):
                root=ET.fromstring(z.read(n))
                parents={child:parent for parent in root.iter() for child in parent}
                for p in root.iter():
                    if p.tag.endswith('}tr'):
                        cells=[]
                        for cell in p:
                            if cell.tag.endswith('}tc'):
                                cells.append(' '.join(''.join(t.itertext()) for t in cell.iter() if t.tag.endswith('}t')))
                        if cells: lines.append('\t'.join(cells))
                        continue
                    if not p.tag.endswith('}p'): continue
                    ancestor=parents.get(p)
                    in_cell=False
                    while ancestor is not None:
                        if ancestor.tag.endswith('}tc'): in_cell=True; break
                        ancestor=parents.get(ancestor)
                    if in_cell: continue
                    runs=[]
                    for run in p:
                        if run.tag.endswith('}run'):
                            runs.extend(''.join(t.itertext()) for t in run if t.tag.endswith('}t'))
                    if runs: lines.append(''.join(runs))
            return '\n'.join(lines)
    if data.startswith(bytes.fromhex('d0cf11e0a1b11ae1')): return hwp_text(data)
    raise ValueError('PDF, HWP, HWPX 파일이 아니거나 다운로드가 제한됨')

if __name__=='__main__':
    try:
        text=extract(sys.stdin.buffer.read(15_000_001))
        if not text.strip(): raise ValueError('텍스트가 없는 문서: 스캔본 원문 확인 필요')
        sys.stdout.buffer.write(json.dumps({'text':text},ensure_ascii=False).encode('utf-8'))
    except Exception as e:
        sys.stdout.buffer.write(json.dumps({'error':str(e)},ensure_ascii=False).encode('utf-8'))
