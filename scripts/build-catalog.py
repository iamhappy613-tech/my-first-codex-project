from pathlib import Path
import re,json
import hashlib,urllib.request
meta=json.loads(Path('data/provenance.json').read_text())['pronunciation']
cache=Path('.cache/cmudict.dict');cache.parent.mkdir(exist_ok=True)
if not cache.exists():
 with urllib.request.urlopen(f"https://raw.githubusercontent.com/cmusphinx/cmudict/{meta['commit']}/cmudict.dict",timeout=60) as r:cache.write_bytes(r.read())
assert hashlib.sha256(cache.read_bytes()).hexdigest()==meta['sha256'],'CMUdict checksum mismatch; do not use this artifact'
entries={}
for line in cache.read_text().splitlines():
 parts=line.split()
 if not parts or parts[0].startswith(';;;'):continue
 entries.setdefault(parts[0].split('(')[0].lower(),parts[1:])
vowels={'AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW'}
phonemes={'AA':'ɑː','AE':'æ','AH':'ʌ','AO':'ɔː','AW':'aʊ','AY':'aɪ','EH':'ɛ','ER':'ɝː','EY':'eɪ','IH':'ɪ','IY':'iː','OW':'oʊ','OY':'ɔɪ','UH':'ʊ','UW':'uː','B':'b','CH':'tʃ','D':'d','DH':'ð','F':'f','G':'ɡ','HH':'h','JH':'dʒ','K':'k','L':'l','M':'m','N':'n','NG':'ŋ','P':'p','R':'r','S':'s','SH':'ʃ','T':'t','TH':'θ','V':'v','W':'w','Y':'j','Z':'z','ZH':'ʒ'}
onsets={tuple(x.split()) for x in ['P L','P R','B L','B R','T R','D R','K L','K R','G L','G R','F L','F R','TH R','S L','S M','S N','S P','S T','S K','S W','S P L','S P R','S T R','S K R','S K W','K W','T W','D W','SH R','B Y','P Y','F Y','V Y','K Y','G Y','M Y','N Y','HH Y']}
overrides={'record':'ˈrɛkərd','conduct':'ˈkɑːndʌkt','refuse':'rɪˈfjuːz','object':'ˈɑːbdʒɛkt','contract':'ˈkɑːntrækt','content':'ˈkɑːntɛnt','tear':'tɪr','abuse':'əˈbjuːs','associate':'əˈsoʊʃieɪt','contrast':'ˈkɑːntræst','document':'ˈdɑːkjəmənt','progress':'ˈprɑːɡrɛs'}
def ipa(word):
 if word in overrides:return '/'+overrides[word]+'/'
 parts=entries[word];bare=[re.sub(r'\d','',p) for p in parts];vi=[i for i,p in enumerate(bare) if p in vowels];marks={}
 if len(vi)>1:
  for pos in vi:
   if parts[pos][-1:] not in ['1','2']:continue
   if parts[pos][-1]=='2' and any(parts[i].endswith('1') for i in vi if i<pos):continue
   previous=max([i for i in vi if i<pos],default=-1);gap=bare[previous+1:pos];start=0 if previous<0 else pos
   if previous>=0 and gap:
    start=pos-1
    for length in range(2,len(gap)+1):
     if tuple(gap[-length:]) in onsets:start=pos-length
   marks[start]='ˈ' if parts[pos][-1]=='1' else 'ˌ'
 result=''
 for i,p in enumerate(parts):
  b=bare[i];v=phonemes[b]
  if p=='AH0':v='ə'
  elif p=='ER0':v='ər'
  elif p in ['IY0','IY2'] and i not in marks:v='i'
  elif p in ['UW0','UW2'] and i not in marks:v='u'
  result+=marks.get(i,'')+v
 return '/'+result.replace('ərˈ','əˈr')+'/'
rows=json.loads(Path('data/catalog.json').read_text())[:300]
source={r['word']:r for r in json.loads(Path('data/extra-source.json').read_text())}
for line in Path('data/extra-lessons.psv').read_text().splitlines():
 word,meaning,example,translation=line.split('|')
 rows.append({'id':word,'word':word,'phonetic':ipa(word),'meaning':meaning,'example':example,'translation':translation,'level':'cet4-extension','reviewed':True,'frequency_rank':source[word]['frq'],'source':'ECDICT CET4 tag/frq (pinned revision); CMUdict broad-US IPA; Wordspace authored gloss/example'})
assert len(rows)==1000 and len({r['id'] for r in rows})==1000
Path('data/catalog.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
for w in rows[300:310]:print(w['word'],w['phonetic'])
