// Run actual .ws method bodies with erased types and mocked game APIs.
// This validates control flow, not WitcherScript compilation or in-game behavior.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'../scripts/local/missingCardTracker.ws'),'utf8');
function method(name){
    const start=source.indexOf('    private function '+name+'(');
    assert(start>=0,'Missing method '+name);
    const end=source.indexOf('    private function ',start+1);
    return source.slice(start,end<0?source.length:end)
        .replace(/private function (\w+)\(\) : [\w<>]+/,'function $1()')
        .replace(/var ([\w, ]+) : ([\w<>]+);/g,(_,names,type)=>{
            const init=type.startsWith('array<')?'[]':type==='int'?'0':type==='bool'?'false':type==='name'?"''":type==='SCardSourceData'?'{}':'null';
            return 'var '+names.split(',').map(n=>n.trim()+'='+init).join(',')+';';
        });
}
const code=['ExtractCardData','RandomRemaining','FilterLocations'].map(method).join('\n');
function run(locations,facts={},randomRemaining=true,inventory={},options={}){
    const context=vm.createContext({input:JSON.stringify({locations,facts,randomRemaining,inventory,...options})});
    return JSON.parse(vm.runInContext(`
        Array.prototype.Size=function(){return this.length;};
        Array.prototype.PushBack=function(x){this.push(typeof x==='object'?JSON.parse(JSON.stringify(x)):x);};
        Array.prototype.Contains=function(x){return this.includes(x);};
        Array.prototype.Resize=function(n){this.length=n;for(var i=0;i<n;i++)this[i]={};};
        var {locations,facts,randomRemaining,inventory,sourceRows,activeCards,cardRows}=JSON.parse(input);
        // Empty WitcherScript string-array reads yield the default empty string.
        locations.forEach(l=>l.query=new Proxy(l.query,{get:(t,p)=>p==='0'&&t.length===0?'':Reflect.get(t,p)}));
        var cards=cardRows||[{cardName:'gwint_card_zoltan',originArea:'Prologue'}];
        var thePlayer={inv:{GetItemQuantityByName:n=>inventory[n]||0}};
        var FactsQuerySum=n=>facts[n]||0,NameToString=n=>n;
        var theGame={GetDefinitionsManager:()=>({ItemHasTag:(n,tag)=>activeCards.includes(n)})};
        var LoadCSV=()=>({GetNumRows:()=>sourceRows.length,GetValueAsName:(k,i)=>sourceRows[i][k],GetValue:(k,i)=>sourceRows[i][k]});
        ${code}
        if(sourceRows)cards=ExtractCardData();
        if(randomRemaining===null)randomRemaining=RandomRemaining();
        JSON.stringify({ids:FilterLocations().map(l=>l.entryIdx),cards,randomRemaining});
    `,context));
}
const opponent=(query,cards=[])=>({entryIdx:'opponent',query,cards});
const location=cards=>({entryIdx:'card',query:[],cards});
const ids=(...args)=>run(...args).ids;
const tests=[];
function test(name,fn){tests.push([name,fn]);}
for(const facts of [{},{a:1},{b:1},{a:1,b:1}])test('alternate facts '+JSON.stringify(facts),()=>{
    assert.deepEqual(ids([opponent(['a','b'])],facts),Object.keys(facts).length?[]:['opponent']);
});
test('single unplayed opponent',()=>assert.deepEqual(ids([opponent(['a'])]),['opponent']));
test('single claimed opponent',()=>assert.deepEqual(ids([opponent(['a'])],{a:1}),[]));
test('exhausted random pool',()=>assert.deepEqual(ids([opponent(['a'])],{},false),[]));
test('exhausted random pool preserves missing specific reward',()=>assert.deepEqual(ids([opponent(['a'],['gwint_card_zoltan'])],{},false),['opponent']));
test('missing unique card',()=>assert.deepEqual(ids([location(['gwint_card_zoltan'])]),['card']));
test('owned unique card',()=>assert.deepEqual(ids([location(['gwint_card_zoltan'])],{},true,{gwint_card_zoltan:1}),[]));
test('disabled source items removed without sparse array entries',()=>{
    const r=run([],{},null,{}, {sourceRows:[{CardName:'removed',OriginArea:'Random'},{CardName:'live',OriginArea:'Random'}],activeCards:['live']});
    assert.deepEqual(r.cards,[{cardName:'live',originArea:'Random'}]);assert.equal(r.randomRemaining,true);
});
test('disabled random items do not keep pool open',()=>{
    const r=run([opponent(['a'])],{},null,{}, {sourceRows:[{CardName:'removed',OriginArea:'Random'}],activeCards:[]});
    assert.equal(r.randomRemaining,false);assert.deepEqual(r.ids,[]);
});
test('restored item still tracked if mod defines it',()=>assert.deepEqual(ids([location(['restored'])],{},true,{}, {sourceRows:[{CardName:'restored',OriginArea:'NML'}],activeCards:['restored']}),['card']));
test('owned random card closes pool',()=>assert.equal(run([],{},null,{live:1},{cardRows:[{cardName:'live',originArea:'Random'}]}).randomRemaining,false));
for(const card of ['gwint_card_dummy','gwint_card_horn','gwint_card_scorch','gwint_card_mrmirror_foglet'])for(const count of [0,1,2,3,4])test(`${card}: ${count} copies`,()=>{
    assert.deepEqual(ids([location([card])],{},true,{[card]:count},{cardRows:[{cardName:card}]}),count<3?['card']:[]);
});
for(const hero of ['ciri','geralt'])for(const prefix of ['','gog_'])test(hero+' owned as '+prefix,()=>{
    const normal='gwint_card_'+hero,gog='gwint_card_gog_'+hero;
    assert.deepEqual(ids([location([normal])],{},true,{['gwint_card_'+prefix+hero]:1},{cardRows:[{cardName:normal},{cardName:gog}]}),[]);
});
const flag=process.argv.indexOf('--fixture');
if(flag>=0){
    const {locations,sourceRows,activeCards}=JSON.parse(fs.readFileSync(process.argv[flag+1],'utf8'));
    const options={sourceRows,activeCards},inventory=Object.fromEntries(activeCards.map(c=>[c,3]));
    for(const row of locations){
        if(row.query.length){
            for(const fact of row.query)test('row '+row.entryIdx+': claimed '+fact,()=>assert.deepEqual(ids([row],{[fact]:1},true,{},options),[]));
            const hasSpecificReward=row.cards.some(c=>activeCards.includes(c));
            test('row '+row.entryIdx+': exhausted pool preserves specific rewards',()=>assert.deepEqual(ids([row],{},false,{},options),hasSpecificReward?[row.entryIdx]:[]));
            test('row '+row.entryIdx+': unclaimed reward remains',()=>assert.deepEqual(ids([row],{},true,{},options),[row.entryIdx]));
        }else{
            test('row '+row.entryIdx+': all cards owned',()=>assert.deepEqual(ids([row],{},true,inventory,options),[]));
            for(const card of row.cards.filter(c=>activeCards.includes(c)))test('row '+row.entryIdx+': missing '+card,()=>{
                const missing={...inventory,[card]:0};
                if(card==='gwint_card_ciri')missing.gwint_card_gog_ciri=0;
                if(card==='gwint_card_geralt')missing.gwint_card_gog_geralt=0;
                assert.deepEqual(ids([row],{},true,missing,options),[row.entryIdx]);
            });
        }
    }
    test('all 101 rows: complete collection yields empty guide',()=>assert.deepEqual(ids(locations,{},null,inventory,options),[]));
}
let failed=0;
for(const [name,fn]of tests){try{fn();}catch(e){failed++;console.error('FAIL',name,e.message);}}
console.log(`${tests.length-failed}/${tests.length} checks passed`);
process.exitCode=failed?1:0;
