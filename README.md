# Local Rush

![Local Rush Banner](./banner.png)

Local Rush é um MVP local-first para prospecção comercial usando dados públicos do OpenStreetMap por meio da Overpass API. A aplicação permite buscar empresas próximas por categoria, visualizar resultados em mapa, salvar empresas no navegador e consultar histórico local sem banco de dados, autenticação ou APIs pagas.

## Principais Recursos

- Busca de empresas por latitude/longitude, cidade, bairro ou CEP.
- Consulta a dados do OpenStreetMap via Overpass API.
- Geocoding com Nominatim para transformar local informado em coordenadas.
- Filtros por categoria, raio, limite e presença de website.
- Mapa com Leaflet local e fallback por iframe do OpenStreetMap.
- Histórico, empresas recentes e empresas salvas em `localStorage`.
- Backend FastAPI com validação de payload via Pydantic.
- Frontend em HTML, CSS e JavaScript puro.

## Stack

- Python 3.11+
- FastAPI
- Uvicorn
- httpx
- python-dotenv
- HTML, CSS e JavaScript puro
- Leaflet
- OpenStreetMap, Overpass API e Nominatim

## Estrutura

```text
CodexSkillPack/
├── banner.png
├── README.md
└── local-rush/
    ├── backend/
    │   ├── app.py
    │   └── services/
    │       ├── geocoding.py
    │       ├── overpass.py
    │       └── site_analyzer.py
    ├── frontend/
    │   ├── index.html
    │   ├── script.js
    │   ├── style.css
    │   └── assets/
    ├── .env.example
    ├── requirements.txt
    ├── toggle_localhost.bat
    └── README.md
```

## Pré-Requisitos

- Windows, Linux ou macOS.
- Python 3.11 ou superior instalado.
- Acesso à internet para consultas ao OpenStreetMap, Overpass API e Nominatim.
- Navegador moderno com suporte a JavaScript.

## Instalação e Configuração

Entre na pasta da aplicação:

```bash
cd local-rush
```

Crie o ambiente virtual:

```bash
py -3 -m venv .venv
```

Ative o ambiente virtual no Windows:

```bash
.\.venv\Scripts\activate
```

No Linux/macOS:

```bash
source .venv/bin/activate
```

Instale as dependências:

```bash
pip install -r requirements.txt
```

Crie o arquivo `.env` com base no exemplo:

```bash
copy .env.example .env
```

No Linux/macOS:

```bash
cp .env.example .env
```

Configurações disponíveis:

```env
OVERPASS_TIMEOUT_SECONDS=25
OVERPASS_USER_AGENT=LocalRush/0.1 (localhost; contact:local@localhost)
OVERPASS_REFERER=http://localhost
OVERPASS_RETRIES=2
OVERPASS_ENDPOINTS=https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter
GEOCODING_TIMEOUT_SECONDS=20
GEOCODING_USER_AGENT=LocalRush/0.1 (localhost; contact:local@localhost)
GEOCODING_REFERER=http://localhost
GEOCODING_RETRIES=2
```

## Rodando Localmente

Com o ambiente virtual ativo, execute:

```bash
uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

Acesse:

```text
http://127.0.0.1:8000
```

No Windows, também é possível usar:

```bash
toggle_localhost.bat
```

Esse script inicia o servidor se a porta `8000` estiver livre e encerra o processo se já houver um servidor escutando nessa porta.

## Endpoints

### Health Check

```http
GET /api/health
```

Retorna o status básico da aplicação e os timeouts configurados.

### Geocoding

```http
POST /api/geocode
Content-Type: application/json
```

Payload:

```json
{
  "query": "Centro, São Paulo"
}
```

### Busca de Empresas

```http
POST /api/search
Content-Type: application/json
```

Payload:

```json
{
  "lat": -23.55052,
  "lng": -46.633308,
  "radius": 1500,
  "category": "restaurant",
  "limit": 10,
  "only_with_site": false
}
```

Categorias suportadas:

```text
business_contact, restaurant, barber, hairdresser, gym, clinic, dentist,
store, car_repair, real_estate, pharmacy, bakery, supermarket, cafe,
hotel, school
```

## Observações Operacionais

- O projeto não usa banco de dados; histórico e favoritos ficam no `localStorage` do navegador.
- A qualidade dos resultados depende dos dados públicos cadastrados no OpenStreetMap.
- APIs públicas como Overpass e Nominatim podem aplicar rate limit ou instabilidade temporária.
- Para produção, revise CORS, rate limiting, cache, logs estruturados e política de uso dos serviços externos.

## Atribuição

Dados fornecidos por OpenStreetMap contributors, licença ODbL.

## Licença

MIT.
