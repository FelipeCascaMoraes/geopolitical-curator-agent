# =============================================================================
# tools/news_fetcher.py — Ferramenta de Busca de Notícias Geopolíticas
# =============================================================================
#
# Esta tool é responsável por buscar notícias sobre conflitos e eventos
# geopolíticos usando duas fontes complementares:
#
#   1. NewsData.io  — fonte primária (rica em metadados, fácil de usar)
#   2. GDELT        — fonte secundária (gratuita, 65 idiomas, sem chave de API)
#
# Fluxo:
#   buscar_noticias(query)
#       → NewsData.io busca os artigos
#       → Achou MIN_ARTICLES? → retorna
#       → Não achou?          → GDELT complementa
#       → Combina + deduplica → retorna lista final
#
# =============================================================================

# Imports
import os
import logging
from typing import Optional
from datetime import datetime, timedelta

import requests

# Logger para acompanhar o que está acontecendo
logger = logging.getLogger(__name__)

# Mínimo de artigos antes de acionar o GDELT como backup
MIN_ARTICLES = 5

# Palavras-chave geopolíticas usadas para enriquecer a busca
GEO_KEYWORDS = [
    "war", "conflict", "military", "attack", "ceasefire",
    "sanctions", "troops", "missile", "invasion", "tension",
    "nato", "nuclear", "refugee", "humanitarian", "crisis"
]


# =============================================================================
# NEWSDATA.IO
# =============================================================================

def buscar_newsdata(query: str, dias: int = 7, max_results: int = 10) -> list[dict]:
    """
    Busca notícias geopolíticas na NewsData.io.

    Args:
        query       : termo de busca (ex: "conflito Russia Ucrania")
        dias        : quantos dias atrás buscar (padrão: 7)
        max_results : máximo de artigos a retornar (padrão: 10)

    Returns:
        Lista de dicionários com os artigos encontrados.
        Cada artigo tem: title, description, url, source, published_at, language, country
    """
    api_key = os.getenv("NEWSDATA_API_KEY")
    if not api_key:
        logger.warning("NEWSDATA_API_KEY não encontrada no .env — pulando NewsData.io")
        return []

    # Monta a URL base da API
    url = "https://newsdata.io/api/1/news"

    # Parâmetros da requisição
    # q        → termo de busca
    # language → inglês e português
    # category → politics e world (mais relevantes pro nosso caso)
    # size     → quantos artigos por página
    params = {
        "apikey"  : api_key,
        "q"       : query,
        "language": "en,pt",
        "category": "politics,world",
        "size"    : max_results,
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        # A NewsData.io retorna os artigos dentro de data["results"]
        artigos = data.get("results", [])

        # Normaliza o formato pra ser igual ao do GDELT
        resultado = []
        for artigo in artigos:
            resultado.append({
                "title"       : artigo.get("title", ""),
                "description" : artigo.get("description", ""),
                "url"         : artigo.get("link", ""),
                "source"      : artigo.get("source_id", ""),
                "published_at": artigo.get("pubDate", ""),
                "language"    : artigo.get("language", ""),
                "country"     : artigo.get("country", [""]),
                "origem"      : "newsdata",
            })

        logger.info(f"NewsData.io: {len(resultado)} artigos encontrados para '{query}'")
        return resultado

    except requests.exceptions.Timeout:
        logger.error("NewsData.io: timeout na requisição")
        return []
    except requests.exceptions.HTTPError as e:
        logger.error(f"NewsData.io: erro HTTP {e}")
        return []
    except Exception as e:
        logger.error(f"NewsData.io: erro inesperado — {e}")
        return []


# =============================================================================
# GDELT
# =============================================================================

def buscar_gdelt(query: str, dias: int = 7, max_results: int = 10) -> list[dict]:
    """
    GDELT removido — dependência gdeltdoc descontinuada.
    Retorna lista vazia silenciosamente.
    """
    logger.debug("GDELT: dependência removida, retornando []")
    return []


# =============================================================================
# DEDUPLICAÇÃO
# =============================================================================

def deduplica_artigos(artigos: list[dict]) -> list[dict]:
    """
    Remove artigos duplicados baseado na URL.

    Isso é importante porque NewsData.io e GDELT podem retornar
    o mesmo artigo de fontes como Reuters ou BBC.

    Args:
        artigos: lista combinada de artigos das duas fontes

    Returns:
        Lista sem duplicatas, mantendo a primeira ocorrência
    """
    vistos = set()
    unicos = []

    for artigo in artigos:
        url = artigo.get("url", "")
        if url and url not in vistos:
            vistos.add(url)
            unicos.append(artigo)

    return unicos


# =============================================================================
# FUNÇÃO PRINCIPAL — usada pelo agente
# =============================================================================

def buscar_noticias(
    query: str,
    dias: int = 7,
    max_results: int = 10,
    forcar_gdelt: bool = False,
) -> list[dict]:
    """
    Busca notícias geopolíticas combinando NewsData.io e GDELT.

    Esta é a função que o agente Agno vai chamar como tool.

    Fluxo:
        1. Tenta NewsData.io
        2. Se não achar MIN_ARTICLES → aciona GDELT também
        3. Combina os resultados
        4. Remove duplicatas
        5. Retorna lista final

    Args:
        query        : tema da busca (ex: "guerra Gaza Hamas Israel")
        dias         : janela de tempo em dias (padrão: 7)
        max_results  : máximo de artigos por fonte (padrão: 10)
        forcar_gdelt : se True, usa GDELT mesmo que NewsData.io já tenha o suficiente

    Returns:
        Lista de artigos normalizada e deduplicada.
    """
    logger.info(f"Iniciando busca: '{query}' | últimos {dias} dias")

    artigos_newsdata = buscar_newsdata(query, dias, max_results)
    artigos_gdelt    = []

    # Aciona o GDELT se:
    # - NewsData.io retornou menos que o mínimo, OU
    # - forcar_gdelt=True foi passado explicitamente
    if len(artigos_newsdata) < MIN_ARTICLES or forcar_gdelt:
        logger.info(
            f"NewsData.io retornou {len(artigos_newsdata)} artigos "
            f"(mínimo: {MIN_ARTICLES}) — acionando GDELT"
        )
        artigos_gdelt = buscar_gdelt(query, dias, max_results)

    # Combina as duas listas (NewsData primeiro — mais rico em metadados)
    combinados = artigos_newsdata + artigos_gdelt

    # Remove duplicatas
    resultado = deduplica_artigos(combinados)

    logger.info(
        f"Busca finalizada: {len(resultado)} artigos únicos "
        f"({len(artigos_newsdata)} NewsData + {len(artigos_gdelt)} GDELT)"
    )

    return resultado


# =============================================================================
# FORMATADOR — transforma a lista em texto pro agente
# =============================================================================

def formatar_para_agente(artigos: list[dict]) -> str:
    """
    Converte a lista de artigos em texto markdown para o agente processar.

    O agente Agno trabalha com texto, não com listas Python.
    Esta função formata os artigos de um jeito que o agente consegue
    entender e referenciar facilmente.

    Args:
        artigos: lista de artigos retornada por buscar_noticias()

    Returns:
        String em markdown com todos os artigos numerados
    """
    if not artigos:
        return "Nenhum artigo encontrado para o tema informado."

    linhas = [f"## Notícias encontradas ({len(artigos)} artigos)\n"]

    for i, artigo in enumerate(artigos, start=1):
        titulo      = artigo.get("title", "Sem título")
        url         = artigo.get("url", "")
        source      = artigo.get("source", "Fonte desconhecida")
        published   = artigo.get("published_at", "")
        description = artigo.get("description", "")
        origem      = artigo.get("origem", "")
        language    = artigo.get("language", "")

        linhas.append(f"### [{i}] {titulo}")
        linhas.append(f"- **Fonte**: {source} `({origem})`")
        linhas.append(f"- **Publicado**: {published}")
        linhas.append(f"- **Idioma**: {language}")
        linhas.append(f"- **URL**: {url}")
        if description:
            linhas.append(f"- **Descrição**: {description}")
        linhas.append("")  # linha em branco entre artigos

    return "\n".join(linhas)


# =============================================================================
# TOOL AGNO — função que o agente chama diretamente
# =============================================================================

def fetch_geopolitical_news(query: str, days: int = 7) -> str:
    """
    Tool principal para o agente Agno buscar noticias geopoliticas.

    Args:
        query : tema da busca em linguagem natural
        days  : quantos dias atras buscar (padrao: 7)

    Returns:
        Texto markdown com os artigos encontrados
    """
    artigos = buscar_noticias(query=query, dias=int(days))
    return formatar_para_agente(artigos)