# Dashboard Next.js (informe 2.2)

## Datos

Tras un scrape, desde la raíz del monorepo:

```bash
npm run analyze
npm run insights
```

- `analyze` genera `output/runs/<run>/analysis.json` y lo copia a `dashboard/public/data/analysis.json`.
- `insights` llama a OpenRouter (requiere `OPENROUTER_API_KEY`) y escribe `insights.json` + `informe.md` en el mismo run, y copia `insights.json` al dashboard. Sin clave, usa modo offline determinístico.

Variables de entorno (solo para insights con LLM):

- `OPENROUTER_API_KEY` — API key de [OpenRouter](https://openrouter.ai/).

**Dónde ponerla:** en la raíz del repo (junto a `package.json`), creá un archivo `.env` con:

```env
OPENROUTER_API_KEY=sk-or-v1-tu-clave-aqui
```

(Tenés un ejemplo en [`.env.example`](../.env.example); el archivo `.env` no se commitea — ver [README raíz](../README.md).) También podés exportarla en la terminal: `export OPENROUTER_API_KEY='...'` antes de `npm run insights`.

Opciones útiles:

```bash
node scripts/generate-insights.mjs --run=output/runs/<carpeta> --model=qwen/qwen-2.5-7b-instruct
node scripts/generate-insights.mjs --offline --run=output/runs/<carpeta>
```

## Desarrollo

```bash
npm run dashboard:dev
```

Abre [http://localhost:3001](http://localhost:3001).

## PDF

Abrí [http://localhost:3001/print](http://localhost:3001/print) y usá Imprimir → Guardar como PDF.
