// SPDX-License-Identifier: MIT
// Local job-specific cover letters based only on facts entered in the applicant profile.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import PDFDocument from 'pdfkit';

const compact=s=>String(s??'').replace(/\s+/g,' ').trim();
const norm=s=>compact(s).toLowerCase().replace(/[^a-z0-9+#.]+/g,' ').trim();
const COVER=/\b(?:cover[\s_-]*letter|letter[\s_-]*of[\s_-]*(?:interest|motivation)|motivation[\s_-]*letter)\b/i;
const RESUME=/\b(?:resume|r[eé]sum[eé]|curriculum[\s_-]*vitae|\bcv\b)\b/i;

export const isCoverLetterLabel=s=>COVER.test(String(s||'').replace(/_/g,' '))&&!RESUME.test(String(s||'').replace(/_/g,' '));
export const isResumeLabel=s=>RESUME.test(String(s||'').replace(/_/g,' '))&&!COVER.test(String(s||'').replace(/_/g,' '));
const slug=s=>norm(s).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'job';
const sentence=s=>compact(s).replace(/[.!?]+$/,'')+'.';

export function generateCoverLetter({job={},profile={},postingText=''}) {
  const name=compact(profile.fullName||[profile.firstName,profile.lastName].filter(Boolean).join(' '));
  const skills=[...new Set((Array.isArray(profile.skills)?profile.skills:[]).filter(x=>typeof x==='string').map(compact).filter(Boolean))].slice(0,90);
  const summary=compact(profile.summary).slice(0,460);
  if(!name||(!skills.length&&!summary))return {ok:false,reason:'Applicant name and verified skills or summary are required.'};
  const posting=String(postingText||'').slice(0,25000);
  const matched=skills.filter(s=>{
    if(s.length<2)return false;
    const escaped=s.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&');
    return new RegExp('(^|[^a-z0-9])'+escaped+'(?=$|[^a-z0-9])','i').test(posting);
  }).slice(0,6);
  const title=compact(job.title).slice(0,100)||'the advertised position';
  const company=compact(job.company).slice(0,100);
  const parts=[
    'Dear Hiring Team,',
    'I am applying for '+title+(company?' at '+company:'')+'. I am interested in contributing to the software development work described in your posting.'
  ];
  if(summary)parts.push(sentence(summary));
  if(matched.length)parts.push('The job posting mentions '+matched.join(', ')+'. These technologies are also listed in my technical skills, and I would welcome the opportunity to apply them to the role.');
  else if(skills.length)parts.push('My documented technical skills include '+skills.slice(0,4).join(', ')+'. I would welcome the opportunity to discuss how they relate to the position.');
  const projects=Array.isArray(profile.projects)?profile.projects:[];
  const relevant=projects.filter(p=>p&&typeof p==='object'&&compact(p.name)&&compact(p.description)).find(p=>
    (Array.isArray(p.technologies)?p.technologies:[]).some(t=>matched.some(s=>norm(t)===norm(s))));
  if(relevant)parts.push('One relevant project described in my profile is '+compact(relevant.name)+'. '+sentence(compact(relevant.description).slice(0,300)));
  parts.push('Thank you for considering my application. I would appreciate the opportunity to discuss how my background relates to the team’s needs.');
  parts.push('Sincerely,\n'+name);
  return {ok:true,text:parts.join('\n\n')+'\n',matchedSkills:matched};
}

async function createPdf(filepath,text) {
  await new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'LETTER',margin:54,info:{Title:'Cover Letter',Author:'Applicant'}});
    const output=fs.createWriteStream(filepath,{flags:'w'});
    output.once('finish',resolve);output.once('error',reject);doc.once('error',reject);
    doc.pipe(output);
    doc.font('Helvetica').fontSize(10.5).fillColor('#222222').text(text,{lineGap:4,paragraphGap:11});
    doc.end();
  });
}

export async function inspectCoverLetterFields(root) {
  const els=root.locator('textarea,input[type="text"],input[type="file"]');
  const fields=await els.evaluateAll(controls=>controls.slice(0,160).map((e,index)=>{
    const labels=[...(e.labels||[])].map(l=>l.textContent||'').join(' ');
    const group=e.closest('fieldset,.application-question,.form-group,[data-automation-id="formField"]');
    const heading=group?.querySelector('legend,.application-label,.question-label')?.textContent||'';
    const aria=(e.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>e.ownerDocument.getElementById(id)?.textContent||'').join(' ');
    const label=[labels,e.getAttribute('aria-label'),aria,e.name,e.id,e.placeholder,heading].filter(Boolean).join(' ').slice(0,600);
    return {index,label,required:!!e.required||e.getAttribute('aria-required')==='true'||!!e.closest('.required-field'),
      kind:e.type==='file'?'file':'text',accept:e.getAttribute('accept')||'',
      occupied:e.type==='file'?!!e.files?.length:!!String(e.value||'').trim()};
  })).catch(()=>[]);
  return fields.filter(f=>isCoverLetterLabel(f.label));
}
function supportedFormat(accept){
  const text=compact(accept).toLowerCase();
  if(!text||text==='*/*'||text.includes('pdf'))return 'pdf';
  if(text.includes('text/plain')||text.includes('.txt'))return 'txt';
  return '';
}

export async function fillCoverLetterFields({root,profile={},config={},job={},postingText='',outboxDir,draft=null}) {
  const fields=await inspectCoverLetterFields(root);
  if(!fields.length)return {found:false,used:'no',inserted:0,draft,errors:[]};
  const pending=fields.filter(x=>!x.occupied&&(x.required||config.coverLetter?.generateForOptional===true));
  if(!pending.length)return {found:true,used:fields.some(f=>f.occupied)?'existing':'no',inserted:0,draft,errors:[]};
  if(config.coverLetter?.enabled===false)return {found:true,used:'no',inserted:0,draft,
    errors:pending.filter(x=>x.required).map(()=> 'Required cover-letter field is empty but generation is disabled.')};
  const letter=draft||generateCoverLetter({job,profile,postingText});
  if(!letter.ok)return {found:true,used:'no',inserted:0,draft:letter,
    errors:pending.filter(x=>x.required).map(()=>letter.reason)};
  const folder=path.join(outboxDir,'cover-letters');
  fs.mkdirSync(folder,{recursive:true});
  const key=createHash('sha256').update(String(job.url||job.title||'job')).digest('hex').slice(0,12);
  const base='cover-letter-'+slug(job.title)+'-'+key;
  const txt=path.join(folder,base+'.txt');
  fs.writeFileSync(txt,letter.text,'utf8');
  const controls=root.locator('textarea,input[type="text"],input[type="file"]');
  const errors=[];let inserted=0,pdf='';
  for(const field of pending){
    const el=controls.nth(field.index);
    try{
      if(field.kind==='text'){
        await el.fill(letter.text,{timeout:4500});
        if((await el.inputValue({timeout:2500})).trim()===letter.text.trim())inserted++;
        else if(field.required)errors.push('Cover-letter text not verified.');
      }else{
        const format=supportedFormat(field.accept);
        if(!format){if(field.required)errors.push('Cover-letter upload format unsupported: '+field.accept);continue;}
        const filename=format==='pdf'?path.join(folder,base+'.pdf'):txt;
        if(format==='pdf'&&!fs.existsSync(filename))await createPdf(filename,letter.text);
        if(format==='pdf')pdf=filename;
        await el.setInputFiles(filename,{timeout:6500});
        const filenames=await el.evaluate(e=>[...(e.files||[])].map(f=>f.name));
        if(filenames.includes(path.basename(filename)))inserted++;
        else if(field.required)errors.push('Cover-letter upload not verified.');
      }
    }catch(error){if(field.required)errors.push('Could not fill required cover-letter field: '+String(error?.message||error).slice(0,100));}
  }
  return {found:true,used:inserted?'generated':'no',inserted,draft:letter,errors,
    path:path.join('cover-letters',base+'.txt'),
    pdfPath:pdf?path.join('cover-letters',path.basename(pdf)):''};
}
