# Local Rush

Local Rush é uma aplicação local para prospecção comercial com dados do OpenStreetMap. O backend em FastAPI consulta Overpass API e Nominatim, enquanto o frontend em HTML, CSS e JavaScript puro exibe filtros, mapa, resultados, histórico e empresas salvas no navegador.

## Pré-Requisitos

- Python 3.11 ou superior.
- Navegador moderno.
- Acesso à internet para consultar OpenStreetMap, Overpass API e Nominatim.

## Instalação

Crie o ambiente virtual:

```bash
py -3 -m venv .venv
```

Ative no Windows:

```bash
.\.venv\Scripts\activate
```

Ative no Linux/macOS:

```bash
source .venv/bin/activate
```

Instale as dependências:

```bash
pip install -r requirements.txt
```

Crie o arquivo de configuração:

```bash
copy .env.example .env
```

No Linux/macOS:

```bash
cp .env.example .env
```

## Configuração

Variáveis disponíveis em `.env.example`:

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

## Como Rodar

Com a `.venv` ativa:

```bash
uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

Acesse:

```text
http://127.0.0.1:8000
```

No Windows, o script abaixo liga ou desliga o servidor local na porta `8000`:

```bash
toggle_localhost.bat
```

## Endpoints

### `GET /api/health`

Retorna status da aplicação e timeouts configurados.

### `POST /api/geocode`

Resolve cidade, bairro ou CEP para coordenadas.

```json
{
  "query": "Centro, São Paulo"
}
```

### `POST /api/search`

Busca empresas próximas usando coordenadas e filtros.

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

## Categorias Suportadas

```text
business_contact, restaurant, barber, hairdresser, gym, clinic, dentist,
store, car_repair, real_estate, pharmacy, bakery, supermarket, cafe,
hotel, school
```

## Estrutura

```text
local-rush/
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

## Observações

- O projeto não usa banco de dados.
- Histórico, recentes e salvos são persistidos no `localStorage`.
- Os resultados dependem da cobertura e qualidade dos dados do OpenStreetMap.
- Serviços públicos podem sofrer rate limit ou indisponibilidade temporária.

## Atribuição

Dados fornecidos por OpenStreetMap contributors, licença ODbL.
