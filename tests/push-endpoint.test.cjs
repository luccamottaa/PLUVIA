const {test}=require('node:test'),assert=require('node:assert/strict');
const {allowedPushEndpoint}=require('../supabase/functions/_shared/push-endpoint.ts');
test('aceita destinos Web Push dos navegadores suportados',()=>{
 for(const url of ['https://fcm.googleapis.com/fcm/send/token','https://android.googleapis.com/gcm/send/token','https://updates.push.services.mozilla.com/wpush/v2/token','https://web.push.apple.com/token','https://wns2-par02p.notify.windows.com/w/?token=x']) assert.equal(allowedPushEndpoint(url),true,url);
});
test('rejeita SSRF, credenciais, serviços desconhecidos e domínios que imitam o provedor',()=>{
 for(const url of ['https://127.0.0.1/path','https://[::1]/push','https://169.254.169.254/meta','https://supabase.co/functions/send','https://fcm.googleapis.com.evil.test/push','https://evilweb.push.apple.com/push','https://web.push.apple.com@evil.test/push','https://user:password@web.push.apple.com/push','http://fcm.googleapis.com/send','https://fcm.googleapis.com:444/send','https://fcm.googleapis.com/','https://fcm.googleapis.com/send#fragment',null,'not-a-url']) assert.equal(allowedPushEndpoint(url),false,String(url));
});
