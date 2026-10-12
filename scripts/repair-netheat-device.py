from pathlib import Path
p=Path('scripts/repair-netheat-capture.py');t=p.read_text()
# Append to the temporary builder so it runs after its existing exact replacements.
t += '''
# netheat measures text before its first plotting page. Initialise the WebR
# canvas context explicitly, then discard that deliberately empty first page.
p=Path('IPD-Meta-Pro/src/diagnostic-plots.js');t=p.read_text()
old='withCallingHandlers(netmeta::netheat(nm, random=FALSE, showall=TRUE)'
assert t.count(old)==1
t=t.replace(old,'graphics::plot.new(); withCallingHandlers(netmeta::netheat(nm, random=FALSE, showall=TRUE)',1)
old="      const err=capture.output.find(x=>x.type==='error');"
assert t.count(old)==1
t=t.replace(old,"      // Discard the context-initialisation page; it is never user output.\\n      if(capture.images?.length){capture.images[0].close();capture.images=capture.images.slice(1);}\\n"+old,1)
p.write_text(t)
'''
p.write_text(t)
