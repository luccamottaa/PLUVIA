# Solicitação de acesso ao radar de Manaus

Rascunho preparado em 03/10/2026. **Não enviado.** Preencha a assinatura e confirme os contatos antes de encaminhar. A publicação do piloto METAR não depende deste pedido; radar quantitativo e estimativas de chegada dependem de acesso autorizado e validação regional.

## Canal institucional confirmado

O [diretório oficial do Censipam](https://www.gov.br/censipam/pt-br/composicao/quem-e-quem), consultado em 03/10/2026 e identificado como modificado em 23/09/2026, lista `alexandre.moreira@sipam.gov.br` para a gerência do Centro Regional de Manaus. Esse é um contato institucional para solicitar encaminhamento à equipe responsável; não foi confirmado como canal específico de licenciamento/API. O gabinete geral listado é `gabinete@sipam.gov.br`.

Não enviar credenciais, localização de usuários ou dados de contas. A autenticação de um eventual feed deverá ocorrer exclusivamente no backend.

## Texto para encaminhar

**Assunto:** PLUVIA — consulta sobre acesso autorizado a dados de radar meteorológico de Manaus

Prezados responsáveis pelo Centro Regional de Manaus/Censipam,

Sou responsável pelo PLUVIA, aplicação meteorológica disponível em https://pluviaweather.com.br. Estamos desenvolvendo um piloto observacional para Manaus e entorno, complementar à previsão por modelos. Atualmente utilizamos boletins METAR do aeroporto Eduardo Gomes, com fonte, horário e limites explícitos, sem estimativas de chegada de chuva baseadas nesses boletins.

Gostaríamos de consultar a possibilidade de acesso programático autorizado aos dados do radar que cobre Manaus, para estudar a proximidade e o deslocamento de áreas de precipitação. Poderiam encaminhar este pedido à equipe técnica e à área responsável pelas condições de utilização?

Precisamos confirmar:

1. Produtos disponíveis: refletividade, taxa/acumulado de precipitação, CAPPI, velocidade Doppler e respectivas unidades, calibração e flags de qualidade/no-data.
2. Serviço oficialmente suportado e documentação: API, arquivos meteorológicos, grades, WMS/WMTS ou imagens georreferenciadas; autenticação, formatos, projeção e resolução espacial.
3. Horários de observação/varredura, timezone, atraso esperado, frequência atual de atualização, cobertura válida e informação de indisponibilidade/manutenção.
4. Histórico e possibilidade de acessar ao menos três varreduras consecutivas, além de episódios passados para validar deslocamento, crescimento/dissipação e erros de chegada.
5. Limites de acesso, política de cache/retenção, custos ou acordos necessários e canal de suporte.
6. Autorização e condições de utilização no PLUVIA: exibição pública, processamento, armazenamento temporário, redistribuição de imagens/dados e de inferências derivadas, atribuição e eventual uso comercial ou monetização futura. Não presumimos essa autorização a partir do acesso visual público.

Consultamos o SipamHidro, S.O.S. Manaus, Radares da Amazônia e a documentação de meteorologia do Panorama. A especificação consultada documenta previsão e estações EMS, mas não encontramos nela um contrato de radar. Não desejamos construir uma integração baseada em scraping ou em endpoints não suportados.

O sistema distinguirá observação, inferência experimental e previsão de modelo. Estimativas de chegada e notificações somente serão habilitadas após validação regional com eventos reais; dados atrasados ou insuficientes suspenderão a inferência. Podemos compartilhar a arquitetura e ajustar o piloto às condições institucionais estabelecidas.

Agradeço as orientações sobre a viabilidade, o processo de solicitação e os documentos necessários.

Atenciosamente,

[Nome do responsável]

[Organização, se aplicável]

[E-mail de contato]

PLUVIA — https://pluviaweather.com.br

## Após a resposta

Registrar documentação e autorização em `docs/NOWCAST.md`, sem versionar tokens. Confirmar contratos com um payload autorizado, preservar timestamps/unidades/qualidade e adicionar o adaptador ao provider existente. Não habilitar ETA ou camada SIPAM apenas por receber um link de visualização: aplicar os critérios de validação regional descritos naquele documento.
