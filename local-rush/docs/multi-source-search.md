# Arquitetura de busca multi-fonte

## Etapa 1 - Analise atual

O fluxo atual esta concentrado em:

- `backend/app.py`: expoe `/api/search`, `/api/geocode` e arquivos estaticos.
- `backend/services/overpass.py`: consulta OpenStreetMap/Overpass, aplica fallback interno e normaliza parte dos campos.
- `frontend/script.js`: envia coordenadas/categoria/raio e salva historico, recentes e favoritos em `localStorage`.

A evolucao foi feita sem trocar o endpoint principal. O frontend continua chamando `/api/search` e recebendo `total`, `results` e `attribution`. Os novos campos `cache_key`, `cache_hit` e `providers` sao extras.

## Etapa 2 - Banco Supabase

1. Abra o SQL editor do Supabase.
2. Execute `supabase_schema.sql`.
3. No backend, configure somente variaveis de servidor:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
SEARCH_CACHE_TTL_HOURS=24
CACHE_CLEANUP_TOKEN=um-token-longo-aleatorio
```

Nao coloque `SUPABASE_SERVICE_ROLE_KEY` no frontend.

Tabelas criadas:

- `search_cache`: metadados da busca e expiracao.
- `leads`: leads normalizados, com `saved` e `expires_at`.
- `lead_sources`: rastreio de origem por provider.

Regras de limpeza:

- `saved = true` nunca e apagado automaticamente.
- `user_id is not null` nao e apagado pela rotina automatica.
- leads temporarios podem expirar por `expires_at`.
- cache expirado e removido por `cleanup_expired_cache()`.

## Etapa 3 - Cache

O backend gera uma `cache_key` com:

- categoria normalizada;
- cidade/local digitado;
- raio;
- latitude/longitude arredondadas;
- filtro `only_with_site`.

Consulta de cache valido equivalente:

```sql
select *
from public.search_cache
where cache_key = 'place_search:...'
  and expires_at > now()
limit 1;
```

Se existir cache valido, o backend busca os leads pelo `cache_id` e nao chama APIs externas.

## Etapa 4 - Normalizacao

Todos os providers devem retornar:

```json
{
  "name": "Nome da empresa",
  "category": "barbearia",
  "address": "Endereco completo ou parcial",
  "city": "Cidade",
  "district": "Bairro",
  "lat": -23.0,
  "lng": -46.0,
  "phone": null,
  "website": null,
  "instagram": null,
  "source": "osm",
  "external_id": "id_da_api",
  "raw_data": {}
}
```

Adapters implementados:

- `OpenStreetMapProvider`
- `GeoapifyProvider`
- `FoursquareProvider`
- `ManualProvider`

Geoapify e Foursquare ficam inativos enquanto as chaves estiverem vazias.

## Etapa 5 - Deduplicacao

Arquivo: `backend/services/place_dedupe.py`.

Regras:

- telefone igual: duplicado;
- website igual: duplicado;
- mesma categoria + distancia ate 120m + nome parecido acima de 0.82: duplicado.

O lead preservado prioriza fonte principal (`osm`) e dados de contato mais completos.

## Etapa 6 - Segunda API como fallback

Regras implementadas no `PlaceSearchService`:

- OSM com 30 ou mais resultados: nao chama provider complementar.
- OSM com menos de 10 resultados: chama provider complementar automaticamente, se houver chave.
- OSM entre 10 e 29 resultados: chama provider complementar se `expanded_search = true` ou `PLACE_COMPLEMENT_MID_RESULTS=true`.

Variaveis:

```env
GEOAPIFY_API_KEY=
FOURSQUARE_API_KEY=
PLACE_FALLBACK_AUTO_THRESHOLD=10
PLACE_FALLBACK_STRONG_THRESHOLD=30
PLACE_COMPLEMENT_MID_RESULTS=false
```

## Etapa 7 - Limpeza automatica

Funcao SQL:

```sql
select public.cleanup_expired_cache();
```

Com `pg_cron` disponivel, o SQL tenta agendar a limpeza diaria as 04:00. Se o plano nao permitir `pg_cron`, use a rota backend:

```bash
curl -X POST http://127.0.0.1:8000/api/cleanup-cache ^
  -H "X-Cleanup-Token: seu-token"
```

## Etapa 8 - Testes manuais sem quebrar o fluxo atual

1. Suba o app sem `SUPABASE_URL` e confirme que `/api/search` ainda busca no OSM.
2. Configure Supabase e rode a mesma busca duas vezes.
3. Na primeira busca, confira `cache_hit=false`.
4. Na segunda busca, confira `cache_hit=true`.
5. Salve uma empresa e confira `saved=true` na tabela `leads`.
6. Ajuste um lead temporario com `expires_at < now()` e rode `cleanup_expired_cache()`.
7. Confirme que leads `saved=true` continuam no banco.
8. Ative `GEOAPIFY_API_KEY` ou `FOURSQUARE_API_KEY` em ambiente separado e teste uma busca com poucos resultados.

## Etapa 9 - Checklist final

- Service role key somente no backend.
- RLS habilitado nas tabelas.
- Sem chamadas externas direto do frontend.
- Cache com TTL configuravel.
- Rate limit basico em `/api/search`.
- Logs minimos com provider/cache/falhas.
- Fallback complementar opcional.
- Leads salvos protegidos contra limpeza automatica.
- OpenStreetMap permanece como fonte principal.

