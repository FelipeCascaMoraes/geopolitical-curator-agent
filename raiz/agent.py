# =============================================================================
# agent.py — Geopolitical Curator Agent (v2)
# =============================================================================
#
# Pipeline simplificado: Pesquisa → Análise → Relatório
#
# =============================================================================

import os
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from agno.agent import Agent
from agno.models.groq import Groq
from agno.workflow import Workflow, Step
from agno.tools.file import FileTools

from tools.news_fetcher import fetch_geopolitical_news

# ─────────────────────────────────────────────────────────────────────────────
# 2. CONSTANTES
# ─────────────────────────────────────────────────────────────────────────────

MODELO_TOOLS = "llama-3.3-70b-versatile"
MODELO_TEXTO = "llama-3.3-70b-versatile"

output_dir = Path(__file__).parent / "output"
output_dir.mkdir(exist_ok=True)

file_tools = FileTools(
    base_dir=output_dir,
    enable_save_file=True,
    enable_read_file=True,
    enable_list_files=True,
)

pesquisador = Agent(
    name="Pesquisador",
    model=Groq(id=MODELO_TOOLS),
    instructions=[
        "Você é um pesquisador especializado em geopolítica mundial.",
        "Use a tool fetch_geopolitical_news para buscar notícias sobre o tema recebido.",
        "Retorne APENAS uma lista de fatos e fontes encontradas, sem análise.",
        "Formato de cada fonte: - **Veículo**: Título (URL)",
        "Seja conciso — máximo 20 linhas no total.",
    ],
    tools=[fetch_geopolitical_news],
    add_datetime_to_context=True,
    markdown=True,
    
)

# ── Agente 2: Analista ───────────────────────────────────────────────────────
analista = Agent(
    name="Analista Geopolítico",
    model=Groq(id=MODELO_TOOLS),
    instructions=[
        "Você é um analista sênior especializado em geopolítica e mercados.",
        "Receba os fatos do pesquisador e produza uma análise em 3 seções CURTAS:",
        "",
        "## 1. Geopolítica",
        "- Países/grupos envolvidos e seus papéis",
        "- Tipo de conflito e nível de risco (baixo/médio/alto/crítico)",
        "- Indicadores de escalada ou desescalada",
        "",
        "## 2. Mercado",
        "- Impacto em commodities (petróleo, gás, trigo, metais)",
        "- Impacto específico para o Brasil (exportações, câmbio)",
        "- Nível de alerta para investidores",
        "",
        "## 3. Humanitário",
        "- Impacto na população civil",
        "- Grupos vulneráveis afetados",
        "- Resposta de organizações internacionais se houver",
        "",
        "IMPORTANTE: Cada seção deve ter no máximo 5 linhas. Seja direto.",
    ],
    add_datetime_to_context=True,
    markdown=True,
)

# ── Agente 3: Relator ────────────────────────────────────────────────────────
relator = Agent(
    name="Relator Geopolítico",
    model=Groq(id=MODELO_TEXTO),
    instructions=[
        "Você é um jornalista especializado em geopolítica.",
        "Receba a análise e gere o relatório no modo indicado no início da mensagem.",
        "",
       "Se o modo for RESUMO:",
        "- Escreva 3 parágrafos curtos separados por linha em branco",
        "- Parágrafo 1: o que está acontecendo, o tipo de conflito, as entidades e o nível de risco",
        "- Parágrafo 2: impacto no mercado financeiro mundial e no Brasil(B3), após isso de uma recomendação para os investidores",
        "- Parágrafo 3: impacto humanitário em uma frase",
        "- Termine com uma linha em branco e: 'Digite *mais detalhes* para o relatório completo.'",
        "Se o modo for COMPLETO:",
        "- Escreva o relatório completo com todas as seções da análise",
        "- Cite as fontes no formato [1], [2], [3]",
        "- Inclua seção de Referências no final",
        "- Linguagem clara, sem jargão técnico",
        "",
        "Nunca tome partido. Apresente os fatos com equilíbrio.",
    ],
    tools=[],
    add_datetime_to_context=True,
    markdown=True,
)

# ─────────────────────────────────────────────────────────────────────────────
# 4. STEPS E WORKFLOW
# ─────────────────────────────────────────────────────────────────────────────

pesquisa_step = Step(
    name="pesquisa",
    description="Busca notícias geopolíticas recentes sobre o tema",
    agent=pesquisador,
)

analise_step = Step(
    name="analise",
    description="Análise geopolítica, de mercado e humanitária",
    agent=analista,
)

relatorio_step = Step(
    name="relatorio",
    description="Geração do relatório final resumido ou completo",
    agent=relator,
)


geopolitical_workflow = Workflow(
    name="Geopolitical Curator Pipeline",
    description="Pipeline simplificado: Pesquisa → Análise → Relatório",
    steps=[
        pesquisa_step,
        analise_step,
        relatorio_step,
    ],
)


# ─────────────────────────────────────────────────────────────────────────────
# 5. EXECUÇÃO DIRETA (testes rápidos)
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    geopolitical_workflow.print_response(
        "RESUMO: conflito Russia Ucrania",
        stream=True,
        markdown=True,
    )