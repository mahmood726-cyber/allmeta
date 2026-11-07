import json,subprocess,sys,time
repo=sys.argv[1]
out=[];page=1
while True:
    for a in range(6):
        r=subprocess.run(['gh','api',f'repos/mahmood726-cyber/{repo}/pulls?state=open&per_page=100&page={page}'],capture_output=True,text=True,encoding='utf-8')
        if r.returncode==0: break
        time.sleep(5*(a+1))
    else:
        sys.exit(f'failed page {page}: {r.stderr[:200]}')
    d=json.loads(r.stdout)
    if not d: break
    out+= [dict(number=p['number'],title=p['title'],head=p['head']['ref'],sha=p['head']['sha'],base=p['base']['ref'],draft=p['draft'],created=p['created_at'],updated=p['updated_at'],user=p['user']['login']) for p in d]
    page+=1
json.dump(out,open(f'prs_{repo}.json','w'),indent=0)
print(repo,len(out))
