const {spawnSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const root=path.join(__dirname,'..');
const venv=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const python=process.env.EVENT_PYTHON||(fs.existsSync(venv)?venv:'python');
const result=spawnSync(python,[path.join(__dirname,'package-release.py')],{cwd:root,stdio:'inherit',windowsHide:true});
if(result.error){console.error(result.error.message);process.exitCode=1;}else process.exitCode=result.status||0;
