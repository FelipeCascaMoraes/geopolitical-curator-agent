import os
import re
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

logger = logging.getLogger(__name__)

# Guardian inclui media:content com imagem por item
RSS_FEEDS = [
    {"url": "https://www.theguardian.com/world/rss",          "source": "The Guardian"},
    {"url": "https://www.theguardian.com/world/conflict/rss", "source": "The Guardian"},
    {"url": "https://feeds.bbci.co.uk/news/world/rss.xml",    "source": "BBC"},
    {"url": "https://www.aljazeera.com/xml/rss/all.xml",      "source": "Al Jazeera"},
]

GEO_KEYWORDS = [
    "war","conflict","military","attack","ceasefire","sanctions","troops","missile",
    "invasion","tension","nato","nuclear","refugee","humanitarian","crisis","coup",
    "protest","election","russia","ukraine","israel","gaza","taiwan","iran","china",
    "guerra","conflito","tensão","crise","sanções","coreia","palestina","hamas",
    "zelensky","putin","biden","trump","oriente","médio","middle east","africa",
]

CATEGORY_MAP = {
    "conflict":     ["war","conflict","attack","military","troops","missile","invasion",
                     "ceasefire","battle","fighting","guerra","conflito","bombing","strike",
                     "killed","casualties","offensive","hamas","hezbollah"],
    "diplomacy":    ["diplomacy","sanctions","nato","summit","treaty","agreement",
                     "negotiations","talks","diplomat","sanções","ceasefire","peace"],
    "economy":      ["economy","oil","sanctions","trade","market","inflation","energy",
                     "price","gdp","currency","petróleo","economia","tariff","brent"],
    "latin-america":["brazil","venezuela","colombia","argentina","chile","peru",
                     "mexico","latin","brasil","maduro","lula","bolsonaro"],
}

CATEGORY_LABELS = {
    "conflict":      "CONFLITO",
    "diplomacy":     "DIPLOMACIA",
    "economy":       "ECONOMIA",
    "latin-america": "AMÉRICA LATINA",
}

REGION_MAP = {
    "ukraine": ["ukraine","ucrânia","kyiv","zelensky","donetsk","kharkiv"],
    "gaza":    ["gaza","israel","hamas","palestin","west bank","netanyahu"],
    "taiwan":  ["taiwan","strait","tsai","taipei"],
    "iran":    ["iran","tehran","khamenei","irgc"],
    "korea":   ["north korea","kim jong","pyongyang","coreia"],
    "sahel":   ["sahel","mali","niger","burkina","sudan","ethiopia"],
    "russia":  ["russia","putin","kremlin","moscow","moscou"],
    "china":   ["china","beijing","xi jinping","prc","ccp"],
    "latin-america": ["brazil","venezuela","colombia","argentina","brasil"],
}

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; GeopoliticalAgent/1.0)"}


def _parse_rss_date(date_str: str) -> str:
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
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        diff = datetime.now(timezone.utc) - dt
        minutes = int(diff.total_seconds() / 60)
        if minutes < 1:  return "agora"
        if minutes < 60: return f"há {minutes} min"
        hours = minutes // 60
        if hours < 24:   return f"há {hours}h"
        days = hours // 24
        return f"há {days}d"
    except Exception:
        return ""


def _classify(text: str) -> tuple[str, str]:
    lower = text.lower()
    for key, keywords in CATEGORY_MAP.items():
        if any(kw in lower for kw in keywords):
            return key, CATEGORY_LABELS[key]
    return "conflict", "GEOPOLÍTICA"


def _get_region(text: str) -> str:
    lower = text.lower()
    for region, keywords in REGION_MAP.items():
        if any(kw in lower for kw in keywords):
            return region
    return ""


def _is_geopolitical(text: str) -> bool:
    return any(kw in text.lower() for kw in GEO_KEYWORDS)


def _extract_image(item: ET.Element, ns: dict) -> str:
    """Extrai imagem do item RSS — tenta várias tags em ordem de prioridade."""

    # 1. media:content (Guardian usa isso, alta qualidade)
    for tag in ["media:content", "media:thumbnail"]:
        el = item.find(tag, ns)
        if el is not None:
            url = el.get("url", "")
            if url.startswith("http") and any(ext in url for ext in [".jpg", ".jpeg", ".png", ".webp"]):
                return url

    # 2. enclosure
    enc = item.find("enclosure")
    if enc is not None:
        url = enc.get("url", "")
        if url.startswith("http"):
            return url

    # 3. <img> dentro da description ou content:encoded
    for tag in ["description", "content:encoded"]:
        text = item.findtext(tag, "") or item.findtext("{http://purl.org/rss/1.0/modules/content/}encoded", "")
        match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', text)
        if match:
            url = match.group(1)
            if url.startswith("http"):
                return url

    return ""


def _fetch_og_image(url: str) -> str:
    """Busca og:image da página como último recurso. Timeout curto."""
    try:
        resp = requests.get(url, timeout=4, headers=HEADERS)
        match = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', resp.text)
        if match:
            return match.group(1)
        match = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', resp.text)
        if match:
            return match.group(1)
    except Exception:
        pass
    return ""


def buscar_rss(max_results: int = 40) -> list[dict]:
    artigos = []
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

            for item in items[:20]:
                title       = item.findtext("title", "").strip()
                description = item.findtext("description", "").strip()
                url         = item.findtext("link", "").strip()
                pub_date    = item.findtext("pubDate", "")
                image_url   = _extract_image(item, ns)

                description = re.sub(r"<[^>]+>", "", description).strip()
                full_text   = f"{title} {description}"

                if not _is_geopolitical(full_text):
                    continue

                cat_key, cat_label = _classify(full_text)
                published_at       = _parse_rss_date(pub_date)

                artigos.append({
                    "title":         title,
                    "description":   description[:300] if description else "",
                    "url":           url,
                    "source":        feed["source"],
                    "published_at":  published_at,
                    "relative_time": _relative_time(published_at),
                    "category":      cat_label,
                    "categoryKey":   cat_key,
                    "region":        _get_region(full_text),
                    "imageUrl":      image_url,
                    "origem":        "rss",
                })

        except Exception as e:
            logger.warning(f"RSS {feed['source']} falhou: {e}")
            continue

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


def buscar_newsdata(query: str, dias: int = 7, max_results: int = 10) -> list[dict]:
    api_key = os.getenv("NEWSDATA_API_KEY")
    if not api_key:
        return []
    try:
        resp = requests.get("https://newsdata.io/api/1/news", params={
            "apikey": api_key, "q": query,
            "language": "en,pt", "category": "politics,world", "size": max_results,
        }, timeout=10)
        resp.raise_for_status()
        artigos = []
        for a in resp.json().get("results", []):
            full_text          = f"{a.get('title','')} {a.get('description','')}"
            cat_key, cat_label = _classify(full_text)
            published_at       = a.get("pubDate", "")
            artigos.append({
                "title":         a.get("title", ""),
                "description":   (a.get("description") or "")[:300],
                "url":           a.get("link", ""),
                "source":        a.get("source_id", ""),
                "published_at":  published_at,
                "relative_time": _relative_time(published_at),
                "category":      cat_label,
                "categoryKey":   cat_key,
                "region":        _get_region(full_text),
                "imageUrl":      a.get("image_url", ""),
                "origem":        "newsdata",
            })
        return artigos
    except Exception as e:
        logger.warning(f"NewsData falhou: {e}")
        return []


def _deduplicar(artigos: list[dict]) -> list[dict]:
    vistos, unicos = set(), []
    for a in artigos:
        url = a.get("url", "")
        if url and url not in vistos:
            vistos.add(url)
            unicos.append(a)
    return unicos


def buscar_noticias(query: str = "", dias: int = 7, max_results: int = 40) -> list[dict]:
    artigos_rss = buscar_rss(max_results)
    if query and query.strip():
        lower     = query.lower()
        filtrados = [a for a in artigos_rss
                     if lower in a["title"].lower() or lower in a["description"].lower()]
        artigos_rss = filtrados if filtrados else artigos_rss
    if len(artigos_rss) < 5:
        artigos_nd = buscar_newsdata(query or "geopolitics conflict", dias, max_results)
        combinados = _deduplicar(artigos_rss + artigos_nd)
    else:
        combinados = _deduplicar(artigos_rss)
    return combinados[:max_results]


def formatar_para_agente(artigos: list[dict]) -> str:
    if not artigos:
        return "Nenhum artigo encontrado."
    linhas = [f"## Notícias ({len(artigos)} artigos)\n"]
    for i, a in enumerate(artigos, 1):
        linhas.append(f"### [{i}] {a.get('title','')}")
        linhas.append(f"- Fonte: {a.get('source','')} | {a.get('relative_time','')}")
        linhas.append(f"- URL: {a.get('url','')}")
        if a.get("description"):
            linhas.append(f"- {a['description']}")
        linhas.append("")
    return "\n".join(linhas)


def fetch_geopolitical_news(query: str, days: int = 7) -> str:
    artigos = buscar_noticias(query=query, dias=int(days))
    return formatar_para_agente(artigos)