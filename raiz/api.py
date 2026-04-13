# api.py - FastAPI server para o GeoPulse frontend
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
import requests as req_lib
from pydantic import BaseModel

from agent import geopolitical_workflow, relator
from tools.news_fetcher import buscar_noticias, formatar_para_agente

app = FastAPI(title="GeoPulse API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    mode: str = "RESUMO"


class AnalyzeRequest(BaseModel):
    title: str
    content: str = ""
    url: str = ""


PALAVRAS_COMPLETO = ["mais detalhes", "explica", "aprofunda", "completo", "relatorio", "relatorio"]

ultimo_tema = {"valor": ""}


def _extrair_conteudo(result) -> str:
    """Extrai texto de qualquer formato que o workflow/agent retorne."""
    if isinstance(result, str):
        return result

    if hasattr(result, "content") and result.content:
        c = result.content
        return c if isinstance(c, str) else str(c)

    if hasattr(result, "results"):
        items = result.results
        if isinstance(items, list) and items:
            last = items[-1]
            if hasattr(last, "content") and last.content:
                c = last.content
                return c if isinstance(c, str) else str(c)
            if hasattr(last, "output") and last.output:
                return str(last.output)

    if hasattr(result, "messages") and result.messages:
        for msg in reversed(result.messages):
            if hasattr(msg, "content") and msg.content:
                c = msg.content
                return c if isinstance(c, str) else str(c)

    if isinstance(result, dict):
        for key in ("content", "output", "text", "response"):
            if key in result and result[key]:
                return str(result[key])

    return str(result) if result else ""


def _extrair_conteudo_resposta(pergunta_final: str) -> str:
    """
    1. Itera sobre o workflow e pega o content do ultimo item nao vazio.
    2. Se falhar ou retornar vazio, fallback direto no relator.
    """
    conteudo = ""

    try:
        for item in geopolitical_workflow.run(pergunta_final, stream=False):
            if hasattr(item, "content") and item.content:
                conteudo = item.content
    except Exception as e:
        print(f"[WARN] Workflow falhou, tentando fallback: {e}")
        conteudo = ""

    if not conteudo or not conteudo.strip():
        try:
            result = relator.run(pergunta_final)
            conteudo = _extrair_conteudo(result)
        except Exception as e:
            print(f"[WARN] Relator direto tambem falhou: {e}")
            conteudo = ""

    return conteudo


# --- SSE generator helper ---

def _sse_generator(text: str):
    """Converte texto completo em chunks SSE com prefixo 'data: '."""
    yield f"data: {text}\ndata: [DONE]\n"


@app.get("/api/health")
def health():
    return {"status": "online"}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    pergunta = req.message
    modo = "COMPLETO" if any(p in pergunta.lower() for p in PALAVRAS_COMPLETO) else "RESUMO"

    if modo == "COMPLETO" and ultimo_tema["valor"]:
        pergunta_final = f"COMPLETO: {ultimo_tema['valor']}"
    else:
        pergunta_final = f"{modo}: {pergunta}"
        ultimo_tema["valor"] = pergunta

    resposta_texto = _extrair_conteudo_resposta(pergunta_final)

    if not resposta_texto or not resposta_texto.strip():
        resposta_texto = "Nao foi possivel gerar uma resposta. Tente novamente."

    return StreamingResponse(
        _sse_generator(resposta_texto),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# --- News endpoints (missing before) ---

TRENDING_QUERIES = [
    {"query": "guerra Russia Ucrania", "title": "Russia-Ucranía"},
    {"query": "conflito Israel Palestina Gaza", "title": "Israel-Gaza"},
    {"query": "tensao Taiwan China", "title": "Taiwan-China"},
    {"query": "sanções Russia energia", "title": "Sanções à Russia"},
    {"query": "petroleo OPEC preco", "title": "Petroleo e OPEC"},
    {"query": "coreia norte nuclear", "title": "Coreia do Norte"},
]


@app.get("/api/news")
def get_news(category: str = "", region: str = "", days: int = 7, max_results: int = 20):
    query_parts = []
    if category and category != "all":
        query_parts.append(category)
    if region and region != "all":
        query_parts.append(region)
    query = " ".join(query_parts) if query_parts else "world politics geopolitics"
    try:
        artigos = buscar_noticias(query, dias=days, max_results=max_results)
    except Exception as e:
        print(f"[WARN] buscar_noticias falhou: {e}")
        artigos = []
    return {"articles": [
        {
            "title": a.get("title", ""),
            "description": a.get("description", ""),
            "url": a.get("url", ""),
            "source": a.get("source", ""),
            "published_at": a.get("published_at", ""),
            "relative_time": a.get("relative_time", ""),
            "category": a.get("category", ""),
            "categoryKey": a.get("categoryKey", ""),
            "region": a.get("region", ""),
            "imageUrl": a.get("imageUrl", ""),
        }
        for a in artigos
    ]}

@app.get("/api/news/trending")
def get_trending():
    return {"topics": TRENDING_QUERIES}


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    """Usa o agente relator para gerar analise estruturada."""
    prompt = f"""Analise o seguinte tema geopolitico e retorne APENAS um JSON valido, sem markdown.

Titulo: {req.title}
Url: {req.url}
Contexto: {req.content}

Retorne EXATAMENTE este JSON:
{{
  "executive_summary": "resumo executivo em 2-3 paragrafos",
  "conflict": {{
    "title": "titulo do conflito",
    "region": "regiao",
    "risk_level": "baixo|medio|alto|critico",
    "conflict_type": "tipo",
    "summary": "descricao do conflito",
    "countries_involved": ["paises"],
    "entities": [{{"name": "nome", "role": "papel", "type": "pais|organizacao|grupo"}}],
    "escalation_indicators": ["indicadores"],
    "de_escalation_indicators": ["indicadores"],
    "key_events": ["eventos recentes"]
  }},
  "market_impact": {{
    "summary": "visao geral",
    "brazil_impact": "impacto no Brasil",
    "investor_alert": "alerta para investidores",
    "affected_assets": [{{"asset": "nome", "trend": "alta|queda|volátil|estável", "reason": "motivo"}}],
    "commodities": ["commodities afetadas"],
    "sanctions_active": true,
    "sanctions_details": "detalhes das sancoes"
  }},
  "humanitarian_impact": {{
    "summary": "resumo humanitario",
    "civilian_casualties": "descricao das baixas",
    "displaced_people": "descricao dos deslocados",
    "affected_population": "descricao da populacao afetada",
    "humanitarian_crises": ["crises"],
    "vulnerable_groups": ["grupos vulneraveis"],
    "inflation_effects": "efeitos inflacionarios",
    "international_response": "resposta internacional"
  }},
  "bias_analysis": {{
    "dominant_narrative": "narrativa dominante",
    "counter_narrative": "contranarrativa",
    "notes": "observacoes"
  }},
  "sources": []
}}"""

    try:
        result = relator.run(prompt)
        text = _extrair_conteudo(result)
        # Tenta parsear como JSON; se falhar, retorna JSON com o texto cru
        try:
            parsed = json.loads(text)
            return parsed
        except json.JSONDecodeError:
            # Fallback: estrutura padrao com o texto bruto
            return {
                "executive_summary": text,
                "conflict": {
                    "title": req.title, "region": "", "risk_level": "medio",
                    "conflict_type": "", "summary": text, "countries_involved": [],
                    "entities": [], "escalation_indicators": [],
                    "de_escalation_indicators": [], "key_events": []
                },
                "market_impact": {
                    "summary": text, "brazil_impact": "", "investor_alert": text,
                    "affected_assets": [], "commodities": [],
                    "sanctions_active": False, "sanctions_details": ""
                },
                "humanitarian_impact": {
                    "summary": text, "civilian_casualties": "", "displaced_people": "",
                    "affected_population": "", "humanitarian_crises": [],
                    "vulnerable_groups": [], "inflation_effects": "", "international_response": ""
                },
                "bias_analysis": None,
                "sources": []
            }
    except Exception as e:
        print(f"[ERROR] analyze falhou: {e}")
        return {
            "executive_summary": "Erro ao gerar analise.",
            "conflict": {
                "title": req.title, "region": "", "risk_level": "medio",
                "conflict_type": "", "summary": "", "countries_involved": [],
                "entities": [], "escalation_indicators": [],
                "de_escalation_indicators": [], "key_events": []
            },
            "market_impact": {
                "summary": "", "brazil_impact": "", "investor_alert": "",
                "affected_assets": [], "commodities": [],
                "sanctions_active": False, "sanctions_details": ""
            },
            "humanitarian_impact": {
                "summary": "", "civilian_casualties": "", "displaced_people": "",
                "affected_population": "", "humanitarian_crises": [],
                "vulnerable_groups": [], "inflation_effects": "", "international_response": ""
            },
            "bias_analysis": None,
            "sources": []
        }

@app.get("/api/image-proxy")
def image_proxy(url: str):
    try:
        resp = req_lib.get(url, timeout=6, headers={
            "User-Agent": "Mozilla/5.0 (compatible; GeopoliticalAgent/1.0)",
        })
        content_type = resp.headers.get("content-type", "image/jpeg")
        return Response(
            content=resp.content,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=3600"},
        )
    except Exception:
        return Response(status_code=404)

if __name__ == "__main__":
    import uvicorn
    print("Servidor iniciando na porta 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
