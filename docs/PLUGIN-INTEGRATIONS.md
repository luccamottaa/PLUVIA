# Plugins conectados e integração no Pluvia — 01/10/2026

Plugins do ChatGPT fornecem ferramentas ao agente. Isso não disponibiliza automaticamente OAuth, secrets, plano comercial ou APIs ao navegador. O inventário considerou as capacidades expostas nesta sessão e a arquitetura estática do Pluvia antes de selecionar integrações.

| Conexão/capacidade | Estado encontrado | Uso nesta etapa |
| --- | --- | --- |
| PostHog | Projeto reconhecido pela flag existente; sem eventos recentes do Pluvia; preparação Amplitude inativa | Métricas opcionais sem SDK, replay, perfil ou vínculo à conta; painel operacional de três gráficos; ingestão sintética verificada. Ver `ANALYTICS.md`. |
| Supabase | Backend existente de conta, push, resumo IA e proxy meteorológico | Mantido. Endurecimento da função de raios e diagnóstico por códigos fixos, sem nova tabela ou exposição de secrets. |
| Xweather | Skills de Weather API/MapsGL/raster; camada Raios já existente. Skills não concedem credenciais de runtime | Consulta existente limitada explicitamente a cinco minutos, cache validado e reconstruído, deduplicação por área na instância, erros de autorização/cota/banco separados. Sem nova camada nem aumento do teto 150 consultas/mês. `/lightning` tem multiplicador 10 acessos por chamada. |
| Firecrawl | Scrape público disponível; ZDR não habilitado na conta | Verificação externa do site: HTTP 200 e conteúdo público obtidos. Não prova disponibilidade das APIs de clima ou renderização visual completa. Sem scraping como fonte meteorológica, monitor recorrente ou chave no app. |
| GitHub | Repositório, CI e Pages existentes | Revisão, checks e publicação pelo fluxo existente. |
| Vercel | Ferramentas e skills de navegador/deploy disponíveis | QA de navegador é útil; manter Pages, sem migração de hospedagem ou criação de projeto Vercel. |
| Amplitude | Conexão de análise e projeto, mas nenhuma chave pública configurada no código | Não ativar segundo coletor equivalente ao PostHog. |
| Railway, Neon, Base44, Sites | Infraestrutura/construção alternativa ao stack já usado | Não criar outra base, backend ou hospedagem sem problema que justifique manutenção e custo adicionais. Vínculo Sites existente preservado. |
| Figma, Canva, Adobe, Miro, Mobbin | Design e assets | Úteis em futuro trabalho de design autorizado; sem redesign ou dependência runtime nesta etapa. |
| Linear, Notion, Drive/Docs/Sheets/Slides | Gestão e documentação | Documentação técnica fica versionada no repositório; não duplicar conteúdo em espaços pessoais sem necessidade. |
| Gmail, Calendar, Spotify, Booking, Shazam, comércio, saúde, pets e demais ferramentas gerais | Capacidades sem benefício meteorológico identificado nesta etapa | Não acessar dados pessoais nem embutir integrações sem finalidade concreta. |

## Garantias e limites

A camada Raios utiliza dados observados CG/IC e continua distinta da animação estética de tempestade. Nunca converter falha do provedor em “zero raios”. Exige cobertura, entitlement e credenciais Xweather válidos no servidor; conexão ChatGPT não os substitui. Cache de cinco minutos conserva horário original e rejeita registros malformados, futuros/antigos. Consultas iguais compartilham trabalho apenas na mesma instância; contador mensal no Postgres continua protegendo todas as instâncias. Não alegar deduplicação global.

Durante a análise, a função publicada respondeu 503 `temporarily_unavailable`, embora tenha passado pela verificação de presença das variáveis. Tabelas de cache/cota e RPC existentes foram confirmados por consulta de catálogo. O diagnóstico ao vivo isolou um bug de contrato: PostgREST confirmava upsert `return=minimal` com HTTP 200 e corpo vazio, enquanto a função tentava parsear JSON salvo status 204. Cache/cota tinham grants corretos e o payload estava persistido. A correção aceita confirmação vazia em 200/201/204; teste contra regressão cobre os três casos. A confirmação da entrega ao cliente após publicação consta no PR. A configuração global de privacy/retenção e limites de consumo PostHog deve acompanhar a evolução do produto; esta implementação tem limites por visita, mas não um orçamento global de ingestão.

Não foram adicionadas bibliotecas, infraestrutura alternativa ou fontes meteorológicas. PostHog e Xweather devem ter seus limites e custos acompanhados nas respectivas contas. Nowcast de minutos, novos mapas e GLM processado continuam exigindo dados/entitlements/licenças confirmados. Não ativar recursos apenas porque há uma skill com o nome do fornecedor.

## Validação reproduzível

- `node --test --test-isolation=none tests/*.test.cjs`: 259 entradas passaram nesta etapa (mistura de casos node:test e arquivos com assertions diretas).
- Verificação sintática JS e `deno check` de todas as funções: passaram.
- `python scripts/verify-browser.py`: Chromium e WebKit com fixtures, sete viewports, sete estados visuais, privacidade, favoritos, troca de cidade, detalhes, compartilhamento e offline. Hardware Safari/iOS não foi testado.
- Não há lint, typecheck frontend ou build bundler configurados. Pages publica `dist/`; Deno verifica tipos das funções e CI valida o artefato estático.
- Publicação e diagnóstico ao vivo são registrados no PR desta etapa após execução; não confundir teste sintético com tráfego real ou cobertura de raios confirmada.

Próxima prioridade: acompanhar disponibilidade/cobertura do provedor e limites das duas integrações e usar as contagens de participantes para selecionar melhorias de produto. Não interpretar falhas amostradas como taxa total de indisponibilidade.
