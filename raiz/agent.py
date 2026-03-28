# =============================================================================
# agent.py — Agente de Curadoria Geopolítica
# =============================================================================
#
# Este script cria um WORKFLOW COMPLETO de IA que atua como uma redação
# especializada em geopolítica mundial. Ele recebe um tema e coordena
# diferentes agentes em etapas distintas:
#
#   TEMA → Pesquisa → Apuração (Loop) → Análise Geo → Mercado → Humano → Relatório
#
# Stack:
#   • Agno      — framework de agentes
#   • Gemini    — LLM (gemini-2.0-flash) — gratuito via Google AI Studio
#   • NewsData  — fonte primária de notícias
#   • GDELT     — fonte secundária (sem chave, 65 idiomas)
#
# Baseado no projeto original da Asimov Academy (agente_de_noticias.py)
# Adaptado e expandido para curadoria geopolítica.
# =============================================================================


# ─────────────────────────────────────────────────────────────────────────────
# 1. IMPORTAÇÕES
# ─────────────────────────────────────────────────────────────────────────────
import os
import re
from typing import List
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from agno.agent import Agent
from agno.team import Team
from agno.models.groq import Groq
from agno.skills import Skills, LocalSkills
from agno.tools.file import FileTools
from agno.workflow import Workflow, Step, Loop
from agno.workflow.types import StepOutput

from tools.news_fetcher import fetch_geopolitical_news


# ─────────────────────────────────────────────────────────────────────────────
# 2. CONSTANTES
# ─────────────────────────────────────────────────────────────────────────────

# Mínimo de fontes que o apurador precisa encontrar antes de seguir
MIN_FONTES = 5

# Máximo de tentativas do loop de apuração antes de desistir
MAX_TENTATIVAS_APURACAO = 3

# Modelo Gemini utilizado em todos os agentes
# gemini-2.0-flash → rápido, gratuito, 1 milhão de tokens/dia
# Chave gratuita em: https://aistudio.google.com
MODELO_PESADO = "llama-3.1-8b-instant"
MODELO_RAPIDO = "llama-3.1-8b-instant"

# ─────────────────────────────────────────────────────────────────────────────
# 3. SKILLS E TOOLS
# ─────────────────────────────────────────────────────────────────────────────

# Carrega todos os arquivos .md da pasta skills/
# Cada agente vai poder chamar get_skill_instructions('nome-da-skill')
skills_dir = Path(__file__).parent / "skills"
shared_skills = Skills(loaders=[LocalSkills(str(skills_dir))])

# Diretório onde os relatórios finais serão salvos
output_dir = Path(__file__).parent / "output"
file_tools = FileTools(
    base_dir=output_dir,
    enable_save_file=True,
    enable_read_file=True,
    enable_list_files=True,
)


# ─────────────────────────────────────────────────────────────────────────────
# 4. AGENTES
# ─────────────────────────────────────────────────────────────────────────────

# ── Agente 1: Pesquisador ────────────────────────────────────────────────────
# Responsável por buscar notícias reais usando NewsData.io + GDELT
# É o único agente com acesso à tool de busca de notícias
pesquisador = Agent(
    name="Pesquisador Geopolítico",
    model=Groq(id=MODELO_PESADO),
    skills=shared_skills,
    instructions=[
        "Você é um pesquisador especializado em geopolítica mundial.",
        "Use a tool fetch_geopolitical_news para buscar notícias sobre o tema recebido.",
        "Organize as notícias encontradas identificando: conflito principal, países envolvidos, eventos recentes e fontes.",
        "Retorne um relatório estruturado com todas as informações encontradas.",
        "Inclua sempre o nome do veículo em negrito e a URL completa de cada fonte.",
        "Use o formato: - **Nome do Veículo**: Título da matéria (URL)",
    ],
    tools=[fetch_geopolitical_news, file_tools],
    add_datetime_to_context=True,
    markdown=True,
)

# ── Team de Pesquisa ─────────────────────────────────────────────────────────
# Coordena o pesquisador e garante que o resultado foi salvo corretamente
time_pesquisa = Team(
    name="Time de Pesquisa",
    model=Groq(id=MODELO_PESADO),
    members=[pesquisador],
    instructions=[
        "Você é o líder do time de pesquisa geopolítica.",
        "Coordene o pesquisador para buscar notícias relevantes e recentes sobre o tema.",
        "O objetivo é fornecer um conjunto rico de informações para as etapas seguintes.",
    ],
    add_datetime_to_context=True,
    markdown=True,
)

# ── Agente 2: Apurador ───────────────────────────────────────────────────────
# Verifica e expande as fontes encontradas pelo pesquisador
# Fica em loop até encontrar MIN_FONTES fontes distintas
apurador = Agent(
    name="Apurador de Fontes",
    model=Groq(id=MODELO_PESADO),
    skills=shared_skills,
    instructions=[
        "Você é um apurador de fontes jornalísticas especializado em geopolítica.",
        "Receba o relatório do pesquisador e verifique a qualidade das fontes.",
        f"IMPORTANTE: Você DEVE encontrar no mínimo {MIN_FONTES} fontes distintas.",
        "Para cada fonte, SEMPRE inclua o nome do veículo em negrito e a URL completa.",
        "Use o formato: - **Nome do Veículo**: Título da matéria (URL)",
        "Se não atingiu o mínimo, use fetch_geopolitical_news para buscar mais fontes.",
        "Tente Reuters, AP, AFP, BBC, Al Jazeera, France24, DW, e portais em português.",
    ],
    tools=[fetch_geopolitical_news, file_tools],
    add_datetime_to_context=True,
    markdown=True,
)

# ── Agente 3: Analista Geopolítico ───────────────────────────────────────────
# Extrai entidades, classifica o conflito, avalia risco e detecta viés
analista_geo = Agent(
    name="Analista Geopolítico",
    model=Groq(id=MODELO_PESADO),
    skills=shared_skills,
    instructions=[
        "Você é um analista geopolítico sênior.",
        "Receba o dossiê do apurador e produza uma análise geopolítica completa.",
        "Extraia todas as entidades (países, líderes, grupos armados, organizações) com seus papéis no conflito.",
        "Classifique o tipo de conflito e o nível de risco (baixo/médio/alto/crítico) com justificativa.",
        "Identifique indicadores de escalada e desescalada.",
        "Analise o viés na cobertura comparando diferentes fontes.",
    ],
    tools=[file_tools],
    add_datetime_to_context=True,
    markdown=True,
)

# ── Agente 4: Analista de Mercado ────────────────────────────────────────────
# Avalia o impacto do conflito nos mercados financeiros globais
analista_mercado = Agent(
    name="Analista de Mercado",
    model=Groq(id=MODELO_PESADO),
    skills=shared_skills,
    instructions=[
        "Você é um analista de mercados financeiros especializado em riscos geopolíticos.",
        "Receba os relatórios anteriores e produza uma análise de impacto nos mercados.",
        "Identifique impactos em commodities (petróleo, gás, trigo, metais) e ativos financeiros.",
        "Sempre inclua o impacto específico para o Brasil (exportações, câmbio, commodities).",
        "Produza um alerta claro e objetivo para investidores.",
        "Não faça recomendações de compra ou venda — apenas analise os impactos.",
    ],
    tools=[file_tools],
    add_datetime_to_context=True,
    markdown=True,
)

# ── Agente 5: Analista Humanitário ───────────────────────────────────────────
# Avalia o impacto do conflito na população civil
analista_humano = Agent(
    name="Analista Humanitário",
    model=Groq(id=MODELO_RAPIDO),
    skills=shared_skills,
    instructions=[
        "Você é um analista humanitário especializado em zonas de conflito.",
        "Receba os relatórios anteriores e produza uma análise do impacto humanitário.",
        "Levante dados sobre vítimas civis, deslocados e refugiados quando disponíveis.",
        "Identifique crises humanitárias em curso (fome, saúde, água, moradia).",
        "Identifique os grupos mais vulneráveis (crianças, mulheres, minorias).",
        "Verifique a resposta de organizações internacionais (ONU, Cruz Vermelha, MSF).",
    ],
    tools=[file_tools],
    add_datetime_to_context=True,
    markdown=True,
)

# ── Agente 6: Redator ────────────────────────────────────────────────────────
# Consolida tudo e gera o relatório final em .md e .json
redator = Agent(
    name="Redator Geopolítico",
    model=Groq(id=MODELO_PESADO),
    skills=shared_skills,
    instructions=[
        "Você é um redator jornalístico sênior especializado em geopolítica.",
        "Receba todos os relatórios anteriores e consolide em uma matéria completa.",
        "Estruture a matéria em seções: O que está acontecendo, Impacto no mercado, Impacto humanitário.",
        "Cite todas as fontes com referências numéricas [1], [2], [3] no corpo do texto.",
        "Inclua uma seção de Referências no final com todas as URLs.",
        f"Se houver menos de {MIN_FONTES} fontes, inclua: '⚠️ NOTA: matéria produzida com número limitado de fontes.'",
        "Linguagem clara e acessível — o leitor não precisa ser especialista.",
        "Nunca tome partido — apresente os fatos com equilíbrio.",
    ],
    tools=[file_tools],
    markdown=True,
)


# ─────────────────────────────────────────────────────────────────────────────
# 5. FUNÇÕES DO LOOP
#    Mesma lógica do projeto original — conta fontes e decide se o loop para
# ─────────────────────────────────────────────────────────────────────────────

def contar_fontes(texto: str) -> int:
    """
    Analisa o texto do apurador e conta quantas fontes distintas ele encontrou.

    Usa duas estratégias de contagem via regex:
    1. Itens em formato markdown: - **Nome do Veículo**
    2. URLs únicas: https://...

    Retorna o maior número entre as duas contagens.
    """
    secao = texto

    # Tenta isolar a seção de fontes do texto
    match = re.search(
        r"##\s*FONTES COLETADAS(.*?)(##|$)", texto, re.DOTALL | re.IGNORECASE
    )
    if match:
        secao = match.group(1)

    # Conta itens em formato markdown de lista com negrito
    fontes_por_marcador = re.findall(r"^-\s+\*\*", secao, re.MULTILINE)

    # Conta URLs únicas
    urls = set(re.findall(r"https?://[^\s\)]+", secao))

    return max(len(fontes_por_marcador), len(urls))


def fontes_suficientes(outputs: List[StepOutput]) -> bool:
    """
    Condição de parada do Loop de apuração.

    Avalia se o apurador encontrou fontes suficientes (MIN_FONTES).
    Retorna True para parar o loop, False para repetir.

    Args:
        outputs: histórico de respostas do workflow

    Returns:
        True se atingiu MIN_FONTES, False caso contrário
    """
    if not outputs:
        return False

    latest = outputs[-1]
    content = str(latest.content or "")
    return contar_fontes(content) >= MIN_FONTES


# ─────────────────────────────────────────────────────────────────────────────
# 6. STEPS DO WORKFLOW
# ─────────────────────────────────────────────────────────────────────────────

# Step 1 — Pesquisa inicial usando o Team
pesquisa_step = Step(
    name="pesquisa",
    description="Busca notícias geopolíticas recentes sobre o tema",
    team=time_pesquisa,
)

# Step 2 (base) — Apuração de fontes
apuracao_step = Step(
    name="apuracao",
    description="Apuração e verificação de fontes jornalísticas",
    agent=apurador,
)

# Step 2 (loop) — Repete a apuração até ter fontes suficientes
apuracao_loop = Loop(
    name="apuracao_loop",
    description=f"Repete a apuração até encontrar {MIN_FONTES} fontes distintas",
    steps=[apuracao_step],
    max_iterations=MAX_TENTATIVAS_APURACAO,
    end_condition=fontes_suficientes,
)

# Step 3 — Análise geopolítica
analise_geo_step = Step(
    name="analise_geopolitica",
    description="Extração de entidades, classificação e análise de risco",
    agent=analista_geo,
)

# Step 4 — Análise de mercado
analise_mercado_step = Step(
    name="analise_mercado",
    description="Impacto nos mercados financeiros e commodities",
    agent=analista_mercado,
)

# Step 5 — Análise humanitária
analise_humano_step = Step(
    name="analise_humanitaria",
    description="Impacto na população civil e crises humanitárias",
    agent=analista_humano,
)

# Step 6 — Redação final
redacao_step = Step(
    name="redacao",
    description="Consolidação em relatório .md e .json estruturado",
    agent=redator,
)


# ─────────────────────────────────────────────────────────────────────────────
# 7. WORKFLOW
# ─────────────────────────────────────────────────────────────────────────────

geopolitical_workflow = Workflow(
    name="Geopolitical Curator Pipeline",
    description=(
        "Pipeline completo de curadoria geopolítica:\n"
        "Pesquisa → Apuração (loop) → Análise Geo → Mercado → Humanitário → Relatório"
    ),
    steps=[
        pesquisa_step,
        apuracao_loop,
        analise_geo_step,
        analise_mercado_step,
        analise_humano_step,
        redacao_step,
    ],
)


# ─────────────────────────────────────────────────────────────────────────────
# 8. EXECUÇÃO DIRETA
#    Usado para testes rápidos sem passar pelo main.py
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    geopolitical_workflow.print_response(
        "conflito Russia Ucrania",
        stream=True,
        markdown=True,
    )