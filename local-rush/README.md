# Local Rush

MVP local para prospecção comercial usando dados gratuitos do OpenStreetMap via Overpass API.

> Documento completo será finalizado nos próximos blocos.

## Stack
- Python + FastAPI
- Frontend em HTML, CSS e JavaScript puro
- Sem banco de dados
- Sem autenticação

## Rodando localmente
```bash
py -3 -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.app:app --reload
```

Abra: http://127.0.0.1:8000

## Atribuição obrigatória
Dados © OpenStreetMap contributors, licença ODbL.
