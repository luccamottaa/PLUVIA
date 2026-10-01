"""Apply ONLY Pluvia's two hosted Auth email templates, then read them back.
Run with an owner-provided SUPABASE_ACCESS_TOKEN in a trusted environment.
No credentials, Auth settings, or email addresses are printed or stored.
"""
import argparse,json,os,urllib.request,urllib.error
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
payload={'mailer_subjects_confirmation':'Confirme seu e-mail e entre no Pluvia','mailer_templates_confirmation_content':(root/'supabase/templates/confirmation.html').read_text(),'mailer_subjects_recovery':'Redefina sua senha do Pluvia','mailer_templates_recovery_content':(root/'supabase/templates/recovery.html').read_text()}
if not args.apply:
 print(json.dumps(payload,ensure_ascii=False,indent=2));raise SystemExit(0)
token=os.environ.get('SUPABASE_ACCESS_TOKEN')
if not token:raise SystemExit('Falta SUPABASE_ACCESS_TOKEN. Use o Dashboard Auth / Email Templates ou configure a credencial no ambiente seguro.')
url='https://api.supabase.com/v1/projects/dszyyrcvwrpyiypwyvxe/config/auth'
def request(method,data=None):
 req=urllib.request.Request(url,data=json.dumps(data).encode() if data is not None else None,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=20) as response:return json.load(response)
 except urllib.error.HTTPError as error:raise SystemExit('API de configuração indisponível: HTTP '+str(error.code)) from None
 except (OSError,ValueError):raise SystemExit('Não foi possível confirmar a configuração. Verifique a conexão.') from None
request('PATCH',payload)
verified=request('GET')
if any(verified.get(key)!=value for key,value in payload.items()):raise SystemExit('A leitura após aplicação não confirmou todos os templates.')
print('Templates de confirmação e recuperação aplicados e conferidos.')
