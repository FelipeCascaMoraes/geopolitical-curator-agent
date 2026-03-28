# =============================================================================
# models/schemas.py — Schemas Pydantic do Agente de Curadoria Geopolítica
# =============================================================================
#
# Define a estrutura de dados que o agente vai produzir ao final do pipeline.
# Esses schemas garantem que o output JSON seja sempre consistente e tipado.
#
# Hierarquia:
#   GeopoliticalReport
#     ├── ConflictProfile       → o que está acontecendo
#     ├── MarketImpact          → como afeta o mercado financeiro
#     ├── HumanitarianImpact    → como afeta a população
#     ├── List[NewsSource]      → fontes utilizadas
#     └── metadata              → data, tema, risco geral
# =============================================================================

from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────────────────
# ENUMS — Definindo os valores validos
# ─────────────────────────────────────────────────────────────────────────────

class ConflictType(str, Enum):
    """Tipo do evento geopolítico."""
    WAR              = "guerra"
    ARMED_CONFLICT   = "conflito_armado"
    TENSION          = "tensão"
    SANCTIONS        = "sanções"
    DIPLOMACY        = "diplomacia"
    CEASEFIRE        = "cessar_fogo"
    COUP             = "golpe"
    PROTEST          = "protesto"
    TERRORISM        = "terrorismo"
    OTHER            = "outro"


class RiskLevel(str, Enum):
    """Nível de risco/escalada do conflito."""
    LOW      = "baixo"
    MEDIUM   = "médio"
    HIGH     = "alto"
    CRITICAL = "crítico"


class MarketTrend(str, Enum):
    """Tendência esperada no mercado."""
    UP       = "alta"
    DOWN     = "queda"
    VOLATILE = "volátil"
    STABLE   = "estável"
    UNKNOWN  = "incerto"


class BiasLevel(str, Enum):
    """Nível de viés detectado na cobertura."""
    LOW      = "baixo"
    MODERATE = "moderado"
    HIGH     = "alto"


# ─────────────────────────────────────────────────────────────────────────────
# SUB-SCHEMAS para representar as entidades do conflito
# ─────────────────────────────────────────────────────────────────────────────

# Entity representa alguma entidade do conflito
class Entity(BaseModel):
    """Entidade geopolítica identificada no conflito."""
    name: str = Field(..., description="Nome da entidade (país, líder, grupo, organização)")
    role: str = Field(..., description="Papel no conflito (ex: agressor, mediador, vítima, aliado)")
    type: str = Field(..., description="Tipo da entidade: país, líder, grupo_armado, organização")



class ConflictProfile(BaseModel):
    """Perfil completo do conflito identificado."""
    title: str = Field(..., description="Título curto e descritivo do conflito")
    summary: str = Field(..., description="Resumo do que está acontecendo (3-5 parágrafos)")
    conflict_type: ConflictType = Field(..., description="Tipo do evento geopolítico")
    risk_level: RiskLevel = Field(..., description="Nível atual de risco/escalada")
    region: str = Field(..., description="Região geográfica principal (ex: Oriente Médio, Europa Oriental)")
    countries_involved: List[str] = Field(..., description="Lista de países diretamente envolvidos")
    entities: List[Entity] = Field(default_factory=list, description="Entidades-chave identificadas")
    key_events: List[str] = Field(default_factory=list, description="Linha do tempo dos eventos recentes")
    escalation_indicators: List[str] = Field(
        default_factory=list,
        description="Indicadores que sugerem escalada do conflito"
    )
    de_escalation_indicators: List[str] = Field(
        default_factory=list,
        description="Indicadores que sugerem desescalada ou resolução"
    )


# AssetImpact indica o impacto em algum ativo do mercado financeiro
class AssetImpact(BaseModel):
    """Impacto em um ativo ou setor financeiro específico."""
    asset: str = Field(..., description="Nome do ativo ou setor (ex: Petróleo Brent, S&P 500, BRL/USD)")
    trend: MarketTrend = Field(..., description="Tendência esperada")
    reason: str = Field(..., description="Razão do impacto em uma frase")


class MarketImpact(BaseModel):
    """Análise do impacto no mercado financeiro global."""
    summary: str = Field(..., description="Resumo geral do impacto nos mercados")
    affected_assets: List[AssetImpact] = Field(
        default_factory=list,
        description="Lista de ativos e setores afetados"
    )
    commodities: List[str] = Field(
        default_factory=list,
        description="Commodities diretamente impactadas (petróleo, gás, trigo, etc.)"
    )
    sanctions_active: bool = Field(False, description="Há sanções econômicas ativas?")
    sanctions_details: Optional[str] = Field(None, description="Detalhes das sanções, se houver")
    investor_alert: str = Field(..., description="Alerta resumido para investidores em 1-2 frases")
    brazil_impact: Optional[str] = Field(
        None,
        description="Impacto específico para o Brasil (exportações, câmbio, commodities)"
    )

# HumanitarianImpact Representa o impacto que a situação vai gerar para a humanidade como um todo
class HumanitarianImpact(BaseModel):
    """Análise do impacto humanitário na população."""
    summary: str = Field(..., description="Resumo do impacto humanitário")
    civilian_casualties: Optional[str] = Field(None, description="Estimativa de baixas civis, se disponível")
    displaced_people: Optional[str] = Field(None, description="Número estimado de deslocados/refugiados")
    affected_population: Optional[str] = Field(None, description="População total afetada")
    humanitarian_crises: List[str] = Field(
        default_factory=list,
        description="Crises humanitárias identificadas (fome, falta de água, hospitais, etc.)"
    )
    inflation_effects: Optional[str] = Field(
        None,
        description="Efeitos inflacionários sentidos pela população local"
    )
    international_response: Optional[str] = Field(
        None,
        description="Resposta de organizações internacionais (ONU, Cruz Vermelha, etc.)"
    )
    vulnerable_groups: List[str] = Field(
        default_factory=list,
        description="Grupos mais vulneráveis identificados (crianças, mulheres, minorias)"
    )


# Indica as fontes jornalísticas usadas
class NewsSource(BaseModel):
    """Fonte jornalística utilizada na análise."""
    index: int = Field(..., description="Número da referência [1], [2], etc.")
    outlet: str = Field(..., description="Nome do veículo (ex: Reuters, BBC, Al Jazeera)")
    title: str = Field(..., description="Título da matéria")
    url: str = Field(..., description="URL completa da matéria")
    language: str = Field("pt", description="Idioma da fonte: pt, en, es, fr, ar")
    bias_notes: Optional[str] = Field(None, description="Notas sobre viés editorial detectado")



class BiasAnalysis(BaseModel):
    """Análise de viés na cobertura do conflito."""
    overall_bias: BiasLevel = Field(..., description="Nível geral de viés detectado")
    dominant_narrative: str = Field(..., description="Narrativa dominante nas fontes consultadas")
    counter_narrative: Optional[str] = Field(None, description="Narrativa alternativa ou divergente")
    notes: str = Field(..., description="Observações sobre pluralidade das fontes")


# ─────────────────────────────────────────────────────────────────────────────
# SCHEMA PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

class GeopoliticalReport(BaseModel):
    """
    Relatório geopolítico completo gerado pelo pipeline.
    
    Este é o schema raiz que será serializado como JSON estruturado
    ao final do workflow.
    """
    # Metadados
    topic: str = Field(..., description="Tema/consulta original do usuário")
    generated_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Data e hora de geração do relatório (UTC)"
    )
    report_version: str = Field("1.0", description="Versão do schema do relatório")

    # Conteúdo principal
    conflict: ConflictProfile = Field(..., description="Perfil do conflito")
    market_impact: MarketImpact = Field(..., description="Impacto no mercado financeiro")
    humanitarian_impact: HumanitarianImpact = Field(..., description="Impacto humanitário")

    # Fontes e viés
    sources: List[NewsSource] = Field(default_factory=list, description="Fontes utilizadas")
    bias_analysis: BiasAnalysis = Field(..., description="Análise de viés editorial")

    # Sumário executivo
    executive_summary: str = Field(
        ...,
        description="Resumo executivo de 2-3 parágrafos cobrindo conflito, mercado e impacto humano"
    )

    class Config:
        use_enum_values = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }