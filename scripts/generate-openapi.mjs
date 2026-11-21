import {writeFile} from 'node:fs/promises';
const id={type:'string',format:'uuid'},revision={type:'integer',minimum:1},wordIds={type:'array',items:{type:'string'},minItems:1,maxItems:43,uniqueItems:true};
const json=schema=>({content:{'application/json':{schema}}});
const response=description=>({'200':{description,...json({type:'object',additionalProperties:true})},'401':{description:'连接口令无效'},'403':{description:'账号已停用或没有权限'},'409':{description:'进度已变化，重新读取后再生成'},'429':{description:'访问过于频繁，请稍后再试'}});
const get=(operationId,summary,extra={})=>({operationId,summary,...extra,responses:response('成功；以响应数据为准')});
const spec={openapi:'3.1.0',info:{title:'词间专属学习数据接口',version:'1.0.0',description:'仅提供固定所有者的学习数据和推荐草稿，不调用任何模型 API。不要在 schema 内填入连接口令。'},servers:[{url:'https://YOUR_PROJECT.supabase.co/functions/v1/coach'}],security:[{CoachConnection:[]}],components:{securitySchemes:{CoachConnection:{type:'http',scheme:'bearer'}}},paths:{
 '/summary':{get:get('getLearningSummary','先读取最新进度、同步时间、版本与近期检测统计')},
 '/evidence':{get:get('getLearningEvidence','读取近期不看答案检测的证据；自评不能作为精确词汇量',{parameters:[{name:'page',in:'query',schema:{type:'integer',minimum:1,maximum:1000,default:1}}]})},
 '/candidates':{get:get('getLearningCandidates','分页读取可用候选 ID 与必须顺延的词；正式推荐不得编造 ID',{parameters:[{name:'page',in:'query',schema:{type:'integer',minimum:1,maximum:1000,default:1}}]})},
 '/recommendations':{post:{operationId:'saveRecommendationDraft',summary:'仅在用户要求保存时提交草稿；网站采用后下一学习日生效','x-openai-isConsequential':true,requestBody:{required:true,...json({type:'object',additionalProperties:false,required:['id','progress_revision','word_ids','rationale'],properties:{id,progress_revision:revision,word_ids:wordIds,rationale:{type:'string',maxLength:1500}}})},responses:response('返回实际保存的草稿。重复重试必须使用相同 id 和载荷。')}},
 '/recommendations/{id}':{get:get('getRecommendationDraft','核对草稿保存结果',{parameters:[{name:'id',in:'path',required:true,schema:id}]})}
}};
const string={type:'string'},integer={type:'integer'},boolean={type:'boolean'},ids={type:'array',items:string};
const object=properties=>({type:'object',properties,additionalProperties:true});
const summary=object(Object.fromEntries(['study_day','deck_size','recognized_count','tested_correct_count','delayed_pass_count','today_total','answered_today','unattempted_today','pending_count','evidence_count','progress_revision'].map(k=>[k,integer]).concat([['study_date',string],['last_synced_at',{type:'string',format:'date-time'}],['unfamiliar_ids',ids],['assessment_due_ids',ids],['assessment_note',string]])));
const draft=object({id, status:{type:'string',enum:['pending','accepted','ignored']},progress_revision:revision,word_ids:wordIds,rationale:string,created_at:{type:'string',format:'date-time'},expires_at:{type:'string',format:'date-time'}});
const outputs={
 '/summary':summary,
 '/evidence':object({progress_revision:revision,page:integer,events:{type:'array',items:object({word_id:string,correct:boolean,assisted:boolean,created_at:{type:'string',format:'date-time'}})}}),
 '/candidates':object({page:integer,has_more:boolean,available_new_count:integer,progress_revision:revision,mandatory_carry_ids:ids,candidates:{type:'array',maxItems:86,items:object({id:string,word:string,phonetic:string,meaning:string,example:string,translation:string,level:string,source:string,kind:{type:'string',enum:['review','new']}})}}),
 '/recommendations':draft,'/recommendations/{id}':draft
};
for(const [path,item] of Object.entries(spec.paths))for(const op of Object.values(item)){op.responses['200'].content['application/json'].schema=outputs[path];op.responses['400']={description:'候选、数量或请求格式无效；修正后再提交'};}
try{const existing=JSON.parse(await (await import('node:fs/promises')).readFile('gpt/openapi.json','utf8'));if(existing.servers?.[0]?.url&&!existing.servers[0].url.includes('YOUR_PROJECT'))spec.servers=existing.servers}catch{}
await writeFile('gpt/openapi.json',JSON.stringify(spec,null,2)+'\n');
const smoke={openapi:'3.1.0',info:{title:'词间 Actions 连通测试（纯模拟）',version:'1.0.0'},servers:[{url:'https://iamhappy613-tech.github.io/my-first-codex-project'}],paths:{'/gpt/smoke.json':{get:{operationId:'readSyntheticLearningProgress',summary:'读取公开模拟进度，绝不是用户真实记录',responses:{'200':{description:'模拟数据',...json({type:'object',properties:{synthetic:{type:'boolean'},message:{type:'string'},recognized_count:{type:'integer'},today_total:{type:'integer'},unfamiliar_words:{type:'array',items:{type:'string'}}}})}}}}}};
await writeFile('gpt/openapi-smoke.json',JSON.stringify(smoke,null,2)+'\n');
