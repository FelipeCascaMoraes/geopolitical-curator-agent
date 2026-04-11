import { useState, useEffect, useCallback } from 'react'
import { getNews } from '../api'
import { NewsArticle } from '../types'

const CATEGORIES = [
  { key: 'all', label: 'Todos' },
  { key: 'conflict', label: 'Conflitos' },
  { key: 'diplomacy', label: 'Diplomacia' },
  { key: 'economy', label: 'Economia' },
  { key: 'latin-america', label: 'América Latina' },
]

const MOCK_ARTICLES: NewsArticle[] = [
  {
    title: 'Rússia intensifica operações militares no leste da Ucrânia',
    description: 'Forças russas avançam sobre posições estratégicas na região de Donetsk enquanto diplomatas tentam novas negociações de paz. O conflito já causou milhares de deslocados civis desde o início do ano.',
    url: 'https://example.com/russia-ukraine',
    source: 'Reuters',
    published_at: '2025-04-05',
    category: 'CONFLITO',
    categoryKey: 'conflict',
    imageUrl: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800&h=400&fit=crop',
  },
  {
    title: 'G20 aprova novo pacote de sanções contra regime militar',
    description: 'Líderes mundiais convergem em nova resolução que limita exportações de tecnologia sensível. Medidas entram em vigor a partir do próximo trimestre com o objetivo de pressionar negociações.',
    url: 'https://example.com/g20-sanctions',
    source: 'BBC',
    published_at: '2025-04-04',
    category: 'DIPLOMACIA',
    categoryKey: 'diplomacy',
    imageUrl: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&h=400&fit=crop',
  },
  {
    title: 'Preço do petróleo dispara após tensões no Estreito de Ormuz',
    description: 'O barril do Brent superou a marca de US$ 95 após incidentes navais na região que controla 20% do suprimento global de petróleo. Mercados reagem com forte volatilidade.',
    url: 'https://example.com/oil-prices',
    source: 'Financial Times',
    published_at: '2025-04-03',
    category: 'ECONOMIA',
    categoryKey: 'economy',
    imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&h=400&fit=crop',
  },
  {
    title: 'Taiwan reporta incursões aéreas chinesas recorde em 24 horas',
    description: 'Mais de 40 aeronaves militares chinesas cruzaram a zona de identificação taiwanesa na maior escalada do ano. EUA enviam navio de patrulha para o Estreito.',
    url: 'https://example.com/taiwan-china',
    source: 'Associated Press',
    published_at: '2025-04-03',
    category: 'CONFLITO',
    categoryKey: 'conflict',
    imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=400&fit=crop',
  },
  {
    title: 'Brasil lidera nova iniciativa de mediação na América Latina',
    description: 'Governo brasileiro propõe cúpula regional para discutir segurança energética e cooperação diplomática. País busca papel de liderança nas negociações continentais.',
    url: 'https://example.com/brazil-latam',
    source: 'Folha de S.Paulo',
    published_at: '2025-04-02',
    category: 'AMÉRICA LATINA',
    categoryKey: 'latin-america',
    imageUrl: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=800&h=400&fit=crop',
  },
  {
    title: 'OTAN reforça presença militar na Europa Oriental',
    description: 'Aliança envia 15 mil soldados adicionais para a Polônia e os países bálticos em resposta a exercícios russos na fronteira. Maior despliegue desde o fim da Guerra Fria.',
    url: 'https://example.com/nato-east',
    source: 'CNN',
    published_at: '2025-04-02',
    category: 'DIPLOMACIA',
    categoryKey: 'diplomacy',
    imageUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&h=400&fit=crop',
  },
  {
    title: 'Crise humanitária se agrava no Sudão com bloqueio de ajuda',
    description: 'Agências da ONU alertam para risco de fome generalizada enquanto combates impedem distribuição de alimentos. Mais de 1 milhão de deslocados internos sem acesso a serviços básicos.',
    url: 'https://example.com/sudan-crisis',
    source: 'Al Jazeera',
    published_at: '2025-04-01',
    category: 'CONFLITO',
    categoryKey: 'conflict',
    imageUrl: 'https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?w=800&h=400&fit=crop',
  },
  {
    title: 'Dólar atinge máxima histórica frente ao real em cenário de aversão a risco',
    description: 'Com a escalada de tensões geopolíticas, investidores migram para ativos seguros e moedas de países emergentes sofrem desvalorização forte.',
    url: 'https://example.com/dollar-real',
    source: 'Valor Econômico',
    published_at: '2025-04-01',
    category: 'ECONOMIA',
    categoryKey: 'economy',
    imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&h=400&fit=crop',
  },
]

const DEFAULT_IMAGES: Record<string, string> = {
  conflict: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800&h=400&fit=crop',
  diplomacy: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&h=400&fit=crop',
  economy: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&h=400&fit=crop',
  'latin-america': 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=800&h=400&fit=crop',
}

export default function NewsTab() {
  const [articles, setArticles] = useState<NewsArticle[]>(MOCK_ARTICLES)
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchNews = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getNews({ max_results: 20 })
      if (result.articles && result.articles.length > 0) {
        const enriched = result.articles.map((a: any, i: number) => ({
          title: a.title || 'Sem título',
          description: a.description || '',
          url: a.url || '',
          source: a.source || '',
          published_at: a.published_at || '',
          category: '',
          categoryKey: '',
          imageUrl: DEFAULT_IMAGES['conflict'],
        }))
        setArticles(prev => enriched.length > 0 ? enriched : prev)
      }
    } catch (e) {
      // Se API falhar, mantém os mocks
      console.warn('API de noticias indisponível, usando dados locais')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNews() }, [fetchNews])

  const filtered = articles.filter(a => {
    const matchesCategory = activeFilter === 'all' || a.categoryKey === activeFilter
    const matchesSearch = !searchTerm ||
      a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.description.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const heroArticle = activeFilter === 'all' && !searchTerm ? filtered[0] : null
  const restArticles = heroArticle ? filtered.slice(1) : filtered

  return (
    <div className="news-page">
      <div className="news-header">
        <h2>Notícias & Análises</h2>
        <div className="news-search-bar">
          <input
            type="text"
            placeholder="Buscar por palavra-chave..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <button className="news-search-btn" onClick={() => setSearchTerm(searchTerm.trim())}>Buscar</button>
        </div>
        <div className="news-filters">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              className={`news-filter-chip ${activeFilter === cat.key ? 'active' : ''}`}
              onClick={() => setActiveFilter(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="no-results">Carregando notícias...</div>
      ) : filtered.length === 0 ? (
        <div className="no-results">Nenhuma notícia encontrada.</div>
      ) : (
        <div className="news-grid">
          {heroArticle && (
            <NewsCard article={heroArticle} onSelect={setSelectedArticle} hero />
          )}
          {restArticles.map((article, i) => (
            <NewsCard key={i} article={article} onSelect={setSelectedArticle} />
          ))}
        </div>
      )}

      {selectedArticle && <ArticleModal article={selectedArticle} onClose={() => setSelectedArticle(null)} />}
    </div>
  )
}

/* ==================== CARD ==================== */

function NewsCard({ article, onSelect, hero }: { article: NewsArticle; onSelect: (a: NewsArticle) => void; hero?: boolean }) {
  const catClass = article.categoryKey ? `category-${article.categoryKey}` : 'category-default'

  return (
    <div className={`news-card ${hero ? 'hero' : ''}`} onClick={() => onSelect(article)}>
      <div className="news-card-hero" style={{ backgroundImage: `url(${article.imageUrl || DEFAULT_IMAGES[article.categoryKey || 'conflict']})` }}>
        {article.category && (
          <span className={`category-badge ${catClass}`}>{article.category}</span>
        )}
      </div>
      <div className="news-card-body">
        <div className="news-card-title">{article.title}</div>
        <div className="news-card-summary">{article.description}</div>
        <div className="news-card-footer">
          <span>{article.source}</span>
          <span>{article.published_at ? formatDate(article.published_at) : ''}</span>
        </div>
      </div>
    </div>
  )
}

/* ==================== MODAL ==================== */

function ArticleModal({ article, onClose }: { article: NewsArticle; onClose: () => void }) {
  const catClass = article.categoryKey ? `category-${article.categoryKey}` : 'category-default'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-hero" style={{ backgroundImage: `url(${article.imageUrl || DEFAULT_IMAGES[article.categoryKey || 'conflict']})` }}>
          {article.category && (
            <span className={`category-badge ${catClass}`}>{article.category}</span>
          )}
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <h3>{article.title}</h3>
          <div className="modal-meta">
            {article.source && <span>Fonte: {article.source}</span>}
            {article.published_at && <span>{formatDate(article.published_at)}</span>}
            {article.url && <a href={article.url} target="_blank" rel="noopener noreferrer">Ver artigo original →</a>}
          </div>
          <p>{article.description}</p>
        </div>
      </div>
    </div>
  )
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return dateStr }
}
