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

## Ligar e desligar localhost

### Opção recomendada (automática)
Use o script abaixo na raiz do projeto:

```bash
toggle_localhost.bat
```

- Se a porta `8000` estiver desligada, ele inicia o backend.
- Se a porta `8000` estiver ligada, ele encerra o backend.

### Opção manual
Ligar:

```bash
.\.venv\Scripts\python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

Desligar (Windows):

```bash
for /f "tokens=5" %a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do taskkill /PID %a /T /F
```

## Atribuição obrigatória
Dados © OpenStreetMap contributors, licença ODbL.
