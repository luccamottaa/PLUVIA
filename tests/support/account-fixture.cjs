// Local browser fixture only. No credentials and no production requests.
const readline=require('node:readline');
const {snapshot,operationsInput,applyOperations}=require('../../supabase/functions/_shared/account-preferences.js');
let metadata={name:'Teste',favorite_city_ids:['1302603'],named_places_v1:[{id:'home',name:'Casa',cityId:'1302603',cityName:'Manaus',uf:'AM',updatedAt:100}]};
readline.createInterface({input:process.stdin}).on('line',line=>{
  try{
    const body=JSON.parse(line);
    if(body.action==='apply')metadata={...metadata,...applyOperations(metadata,operationsInput(body.operations))};
    process.stdout.write(JSON.stringify({status:200,snapshot:snapshot(metadata)})+'\n');
  }catch(error){process.stdout.write(JSON.stringify({status:409,code:error.message,error:'Este local foi alterado em outro dispositivo. Confira a lista antes de salvar novamente.',snapshot:snapshot(metadata)})+'\n');}
});
