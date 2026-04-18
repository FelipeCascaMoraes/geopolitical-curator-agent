import os
import re
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

logger = logging.getLogger(__name__)

# =============================================================================
# FEEDS RSS — cada feed já carrega sua categoria.
# Assim não precisamos adivinhar a região por palavras-chave.
# =============================================================================
RSS_FEEDS = [
    # ── Oriente Médio ────────────────────────────────────────────────────────
    {
        "url":          "https://www.aljazeera.com/xml/rss/all.xml",
        "source":       "Al Jazeera",
        "category_key": "middle-east",
    },
    {
        "url":          "https://www.middleeasteye.net/rss",
        "source":       "Middle East Eye",
        "category_key": "middle-east",
    },
    {
        "url":          "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",
        "source":       "BBC",
        "category_key": "middle-east",
    },

    # ── Europa ───────────────────────────────────────────────────────────────
    {
        "url":          "https://www.euronews.com/rss",
        "source":       "Euronews",
        "category_key": "europe",
    },
    {
        "url":          "https://feeds.bbci.co.uk/news/world/europe/rss.xml",
        "source":       "BBC",
        "category_key": "europe",
    },
    {
        "url":          "https://www.theguardian.com/world/europe-news/rss",
        "source":       "The Guardian",
        "category_key": "europe",
    },

    # ── Brasil ───────────────────────────────────────────────────────────────
    {
        "url":          "https://g1.globo.com/rss/g1/mundo/feed.xml",
        "source":       "G1",
        "category_key": "brazil",
    },
    {
        "url":          "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml",
        "source":       "Agência Brasil",
        "category_key": "brazil",
    },
]

# Label que aparece no badge do card
CATEGORY_LABELS = {
    "middle-east": "ORIENTE MÉDIO",
    "europe":      "EUROPA",
    "brazil":      "BRASIL",
}

# Palavras-chave usadas apenas para filtrar ruído
# (artigos completamente fora de contexto geopolítico/mundial)
GEO_KEYWORDS = [
    "war", "conflict", "military", "attack", "ceasefire", "sanctions", "troops",
    "missile", "invasion", "tension", "nato", "nuclear", "refugee", "humanitarian",
    "crisis", "coup", "protest", "election", "russia", "ukraine", "israel", "gaza",
    "taiwan", "iran", "china", "guerra", "conflito", "tensão", "crise", "sanções",
    "coreia", "palestina", "hamas", "zelensky", "putin", "trump", "oriente", "médio",
    "middle east", "europa", "africa", "política", "governo", "presidente",
    "diplomacia", "acordo", "tratado", "sanção", "fronteira",
]

# Para feeds do Brasil, o filtro é mais amplo — notícia nacional também é relevante
BRAZIL_KEYWORDS = GEO_KEYWORDS + [
    "brasil", "brazil", "lula", "congresso", "senado", "stf", "ibge",
    "economia", "inflação", "real", "petrobras", "amazônia",
]

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; GeopoliticalAgent/1.0)"}


# =============================================================================
# HELPERS DE DATA
# =============================================================================

def _parse_rss_date(date_str: str) -> str:
    """Converte string de data RSS para ISO 8601."""
    if not date_str:
        return datetime.now(timezone.utc).isoformat()
    try:
        return parsedate_to_datetime(date_str).isoformat()
    except Exception:
        try:
            return datetime.fromisoformat(date_str).isoformat()
        except Exception:
            return datetime.now(timezone.utc).isoformat()


def _relative_time(iso_str: str) -> str:
    """Converte ISO 8601 para texto legível: 'há 3h', 'há 2d', etc."""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        diff    = datetime.now(timezone.utc) - dt
        minutes = int(diff.total_seconds() / 60)
        if minutes < 1:  return "agora"
        if minutes < 60: return f"há {minutes} min"
        hours = minutes // 60
        if hours < 24:   return f"há {hours}h"
        return f"há {hours // 24}d"
    except Exception:
        return ""


# =============================================================================
# HELPERS DE FILTRO E IMAGEM
# =============================================================================

def _is_relevant(text: str, category_key: str) -> bool:
    """
    Retorna True se o artigo parece relevante para o contexto do app.
    Feeds do Brasil usam uma lista mais ampla de palavras-chave.
    """
    keywords = BRAZIL_KEYWORDS if category_key == "brazil" else GEO_KEYWORDS
    return any(kw in text.lower() for kw in keywords)


def _extract_image(item: ET.Element, ns: dict) -> str:
    """
    Tenta extrair URL de imagem do item RSS.
    Ordem de prioridade:
      1. media:content / media:thumbnail  (Guardian, Al Jazeera)
      2. enclosure
      3. <img> dentro da description ou content:encoded
    """
    for tag in ["media:content", "media:thumbnail"]:
        el = item.find(tag, ns)
        if el is not None:
            url = el.get("url", "")
            if url.startswith("http") and any(
                ext in url for ext in [".jpg", ".jpeg", ".png", ".webp"]
            ):
                return url

    enc = item.find("enclosure")
    if enc is not None:
        url = enc.get("url", "")
        if url.startswith("http"):
            return url

    for tag in ["description", "content:encoded"]:
        raw = (
            item.findtext(tag, "")
            or item.findtext("{http://purl.org/rss/1.0/modules/content/}encoded", "")
        )
        match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', raw)
        if match:
            url = match.group(1)
            if url.startswith("http"):
                return url

    return ""


def _fetch_og_image(url: str) -> str:
    """
    Último recurso: busca og:image na página do artigo.
    Timeout curto para não travar o servidor.
    """
    try:
        resp  = requests.get(url, timeout=4, headers=HEADERS)
        # Tenta as duas ordens possíveis dos atributos do <meta>
        for pattern in [
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        ]:
            match = re.search(pattern, resp.text)
            if match:
                return match.group(1)
    except Exception:
        pass
    return ""


# =============================================================================
# DEDUPLICAÇÃO
# =============================================================================

def _deduplicar(artigos: list[dict]) -> list[dict]:
    """Remove artigos com URL duplicada, mantendo o primeiro encontrado."""
    vistos, unicos = set(), []
    for a in artigos:
        url = a.get("url", "")
        if url and url not in vistos:
            vistos.add(url)
            unicos.append(a)
    return unicos


# =============================================================================
# BUSCA PRINCIPAL
# =============================================================================

def buscar_rss(max_results: int = 40) -> list[dict]:
    """
    Busca todos os feeds RSS, filtra por relevância e monta os artigos.
    A categoria já vem do feed — não precisa de classificação por keywords.
    """
    artigos = []

    # Namespaces usados por alguns feeds (Guardian, Yahoo Media RSS)
    ns = {
        "media":   "http://search.yahoo.com/mrss/",
        "content": "http://purl.org/rss/1.0/modules/content/",
        "dc":      "http://purl.org/dc/elements/1.1/",
    }

    for feed in RSS_FEEDS:
        try:
            resp = requests.get(feed["url"], timeout=8, headers=HEADERS)
            resp.raise_for_status()
            root  = ET.fromstring(resp.content)
            items = root.findall(".//item")

            for item in items[:20]:  # máx 20 itens por feed
                title       = item.findtext("title", "").strip()
                description = item.findtext("description", "").strip()
                url         = item.findtext("link", "").strip()
                pub_date    = item.findtext("pubDate", "")
                image_url   = _extract_image(item, ns)

                # Remove tags HTML da descrição
                description = re.sub(r"<[^>]+>", "", description).strip()

                full_text    = f"{title} {description}"
                category_key = feed["category_key"]

                # Filtra artigos irrelevantes
                if not _is_relevant(full_text, category_key):
                    continue

                published_at = _parse_rss_date(pub_date)

                artigos.append({
                    "title":         title,
                    "description":   description[:300] if description else "",
                    "url":           url,
                    "source":        feed["source"],
                    "published_at":  published_at,
                    "relative_time": _relative_time(published_at),
                    "category":      CATEGORY_LABELS[category_key],
                    "categoryKey":   category_key,
                    "imageUrl":      image_url,
                    "origem":        "rss",
                })

        except Exception as e:
            logger.warning(f"RSS {feed['source']} ({feed['category_key']}) falhou: {e}")
            continue

    # Ordena do mais recente para o mais antigo
    artigos.sort(key=lambda a: a.get("published_at", ""), reverse=True)
    artigos = _deduplicar(artigos)[:max_results]

    # Para artigos sem imagem, tenta og:image em paralelo (máx 8 simultâneos)
    sem_imagem = [a for a in artigos if not a["imageUrl"]]
    if sem_imagem:
        with ThreadPoolExecutor(max_workers=8) as ex:
            futures = {ex.submit(_fetch_og_image, a["url"]): a for a in sem_imagem}
            for future in as_completed(futures, timeout=6):
                artigo = futures[future]
                try:
                    img = future.result()
                    if img:
                        artigo["imageUrl"] = img
                except Exception:
                    pass

    return artigos


def buscar_noticias(query: str = "", dias: int = 7, max_results: int = 40) -> list[dict]:
    """
    Ponto de entrada principal.
    Se vier um query de busca, filtra os artigos pelo texto.
    """
    artigos = buscar_rss(max_results)

    if query and query.strip():
        lower     = query.lower()
        filtrados = [
            a for a in artigos
            if lower in a["title"].lower() or lower in a["description"].lower()
        ]
        # Se o filtro zerou os resultados, devolve tudo mesmo
        artigos = filtrados if filtrados else artigos

    return artigos[:max_results]


# =============================================================================
# FORMATAÇÃO PARA O AGENTE
# =============================================================================

def formatar_para_agente(artigos: list[dict]) -> str:
    """Formata lista de artigos em markdown para o agente LLM consumir."""
    if not artigos:
        return "Nenhum artigo encontrado."
    linhas = [f"## Notícias ({len(artigos)} artigos)\n"]
    for i, a in enumerate(artigos, 1):
        linhas.append(f"### [{i}] {a.get('title', '')}")
        linhas.append(f"- Fonte: {a.get('source', '')} | {a.get('relative_time', '')}")
        linhas.append(f"- URL: {a.get('url', '')}")
        if a.get("description"):
            linhas.append(f"- {a['description']}")
        linhas.append("")
    return "\n".join(linhas)


def fetch_geopolitical_news(query: str, days: int = 7) -> str:
    """Wrapper usado pelo agente Agno para buscar notícias."""
    artigos = buscar_noticias(query=query, dias=int(days))
    return formatar_para_agente(artigos)