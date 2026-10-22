// Local Google OAuth 2.0 (installed desktop application) and read-only Gmail API.
// Tokens live exclusively under data/ and are never uploaded with the public source.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';

const SCOPE='https://www.googleapis.com/auth/gmail.readonly';
const API='https://gmail.googleapis.com/gmail/v1/users/me';
const AUTH='https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN='https://oauth2.googleapis.com/token';
const seconds=1000;
const tokenFolder=root=>path.join(root,'data','gmail-tokens');
const b64url=data=>Buffer.from(data).toString('base64url');
const tokenName=email=>crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0,20)+'.json';
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));

export function loadGmailOAuthClient(root){
  const file=path.join(root,'gmail-credentials.json');
  if(!fs.existsSync(file))return null;
  const raw=readJson(file);
  const client=raw.installed||raw.web;
  if(!client?.client_id||!client?.client_secret)throw new Error('gmail-credentials.json must contain a Google OAuth Desktop client ID and secret');
  if(!raw.installed)throw new Error('Use Google Cloud OAuth client type Desktop app, not Web application.');
  return client;
}
export function listGmailAccounts(root){
  const folder=tokenFolder(root);
  if(!fs.existsSync(folder))return [];
  return fs.readdirSync(folder).filter(x=>x.endsWith('.json')).map(x=>({file:path.join(folder,x),...readJson(path.join(folder,x))})).filter(x=>x.email&&x.refresh_token);
}
async function responseJson(url,options={}){
  const {signal,...opts}=options;
  const timer=AbortSignal.timeout(15000);
  const combined=signal?AbortSignal.any([signal,timer]):timer;
  const res=await fetch(url,{...opts,signal:combined});
  if(!res.ok){const error=await res.text().catch(()=>String(res.status));throw new Error(`Gmail API HTTP ${res.status}: ${error.slice(0,350)}`);}
  return res.json();
}
function tokenBody(client,params){
  return new URLSearchParams({client_id:client.client_id,client_secret:client.client_secret,...params});
}
export async function apiGet(accessToken,url,{signal}={}){
  return responseJson(url,{headers:{authorization:`Bearer ${accessToken}`},signal});
}
export async function authorizedToken(client,account,{signal}={}){
  if(account.access_token && account.expires_at>Date.now()+60000)return account.access_token;
  const json=await responseJson(TOKEN,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:tokenBody(client,{refresh_token:account.refresh_token,grant_type:'refresh_token'}),signal});
  const updated={...account,access_token:json.access_token,expires_at:Date.now()+Number(json.expires_in||3600)*seconds};
  const {file,...rest}=updated;
  fs.writeFileSync(file,JSON.stringify(rest,null,2),{mode:0o600});
  return json.access_token;
}
export async function gmailMessages(accessToken,{after,maxMessages=300,signal}={}){
  const date=(after instanceof Date?after:new Date(after||Date.now()-30*86400000));
  const dateText=[date.getUTCFullYear(),String(date.getUTCMonth()+1).padStart(2,'0'),String(date.getUTCDate()).padStart(2,'0')].join('/');
  const q=`after:${dateText} -in:spam -in:trash {subject:"thank you for applying" subject:"thank you for your application" subject:"thanks for applying" subject:"thanks for your application" subject:"application received" subject:"application confirmation" subject:"application submitted" "we have received your application" "we received your application"}`;
  const result=[];let pageToken='';
  while(result.length<maxMessages){
    if(signal?.aborted)throw signal.reason||new Error('Gmail query aborted');
    const url=new URL(`${API}/messages`);
    url.searchParams.set('q',q);url.searchParams.set('maxResults',String(Math.min(100,maxMessages-result.length)));
    if(pageToken)url.searchParams.set('pageToken',pageToken);
    const batch=await apiGet(accessToken,url,{signal});
    result.push(...(batch.messages||[]));pageToken=batch.nextPageToken||'';
    if(!pageToken)break;
  }
  return result;
}
function decodeBody(part,output,depth=0){
  if(depth>12 || output.length>=12)return;
  if(part?.mimeType==='text/plain' && part.body?.data)output.push(Buffer.from(part.body.data,'base64url').toString('utf8'));
  for(const sub of part?.parts||[])decodeBody(sub,output,depth+1);
  if(!output.length && part?.mimeType==='text/html' && part.body?.data){
    output.push(Buffer.from(part.body.data,'base64url').toString('utf8').replace(/<[^>]*>/g,' ').replaceAll('&amp;','&'));
  }
}
export async function gmailMessage(accessToken,id,{signal}={}){
  const url=new URL(`${API}/messages/${encodeURIComponent(id)}`);url.searchParams.set('format','full');
  const data=await apiGet(accessToken,url,{signal});
  const headers=Object.fromEntries((data.payload?.headers||[]).map(x=>[x.name.toLowerCase(),x.value]));
  const parts=[];decodeBody(data.payload,parts);
  return {id:data.id,from:headers.from||'',to:headers.to||'',subject:headers.subject||'',receivedAt:new Date(Number(data.internalDate)).toISOString(),
    bodySnippet:[data.snippet||'',...parts].join(' ').replace(/\s+/g,' ').slice(0,4000),labels:data.labelIds||[]};
}
function openBrowser(url){
  const cmd=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
  try{const child=spawn(cmd,args,{stdio:'ignore',detached:true});child.on('error',()=>{});child.unref();}catch{}
}
export async function connectGmail(root){
  const client=loadGmailOAuthClient(root);
  if(!client)throw new Error('Missing gmail-credentials.json. Download a Google OAuth Desktop app JSON file to this directory.');
  const state=b64url(crypto.randomBytes(24)),verifier=b64url(crypto.randomBytes(48));
  const challenge=b64url(crypto.createHash('sha256').update(verifier).digest());
  let resolveCode,rejectCode;const codePromise=new Promise((resolve,reject)=>{resolveCode=resolve;rejectCode=reject;});
  const server=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://127.0.0.1');
    if(u.pathname!=='/oauth2callback'){res.writeHead(404).end();return;}
    if(u.searchParams.get('state')!==state || !u.searchParams.get('code')){
      res.writeHead(400,{'content-type':'text/plain'}).end('Authorization failed or invalid state.');rejectCode(new Error('Invalid Gmail OAuth response'));return;
    }
    res.writeHead(200,{'content-type':'text/plain'}).end('Gmail read-only authorization successful. You may close this tab.');resolveCode(u.searchParams.get('code'));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const redirect=`http://127.0.0.1:${server.address().port}/oauth2callback`;
  const url=new URL(AUTH);
  Object.entries({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent select_account',state,code_challenge:challenge,code_challenge_method:'S256'}).forEach(([k,v])=>url.searchParams.set(k,v));
  console.log('Authorize Gmail (read-only) in your browser. To monitor two Gmail accounts, run this command separately for each account.');
  console.log(`Authorization URL if browser does not open:\n${url}`);openBrowser(String(url));
  let timer;
  try{
    const code=await Promise.race([codePromise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Gmail authorization timed out after 5 minutes')),300000);})]);
    const tokens=await responseJson(TOKEN,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:tokenBody(client,{grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:redirect})});
    const who=await apiGet(tokens.access_token,`${API}/profile`);
    if(!who.emailAddress||!tokens.refresh_token)throw new Error('Google did not return an email address and persistent authorization token. Retry with consent.');
    const folder=tokenFolder(root);fs.mkdirSync(folder,{recursive:true});
    fs.writeFileSync(path.join(folder,tokenName(who.emailAddress)),JSON.stringify({email:who.emailAddress,refresh_token:tokens.refresh_token,access_token:tokens.access_token,expires_at:Date.now()+Number(tokens.expires_in||3600)*1000,scope:tokens.scope},null,2),{mode:0o600});
    console.log(`Gmail connected: ${who.emailAddress} (read-only). Authorization saved privately to data/gmail-tokens.`);
    return who.emailAddress;
  }finally{clearTimeout(timer);server.close();}
}
