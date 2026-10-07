"""Build a portable, allow-listed source package without business databases."""
from pathlib import Path
import shutil, zipfile
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'release'/'the-flag-event-finder'
FILES=['package.json','requirements.txt','event-server.js','event-server.test.js','events.html','event-search.js','event-search.test.js','event-sources.json','event-corrections.json','extract-event-document.py','setup.cmd','start.cmd','scripts/setup-windows.ps1','scripts/render-build.sh','scripts/doctor.js','scripts/package-release.js','scripts/package-release.py','.github/workflows/check.yml','.gitignore','DISTRIBUTION.md']
OUT.mkdir(parents=True,exist_ok=True)
for name in FILES:
    target=OUT/name
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/name,target)
shutil.copyfile(ROOT/'DISTRIBUTION.md',OUT/'README.md')
archive=ROOT/'release'/'the-flag-event-finder.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for name in FILES+['README.md']:
        z.write(OUT/name,'the-flag-event-finder/'+name)
print(f'GitHub upload folder: {OUT}')
print(f'Portable ZIP: {archive}')
print(f'Packaged files: {len(FILES)+1}; db, credentials, screenshots and local runtime are excluded.')
