import { useState, useEffect, useCallback } from 'react'
import { getNews } from '../api'
import { NewsArticle } from '../types'

// Proxy de imagem no backend — resolve CORS das imagens dos feeds
const proxyImg = (url: string) =>
  url ? `http://localhost:8000/api/image-proxy?url=${encodeURIComponent(url)}` : ''

// =============================================================================
// CONFIGURAÇÃO DAS CATEGORIAS
// Esses valores têm que bater exatamente com os categoryKey do news_fetcher.py
// =============================================================================

const FILTERS = [
  { key: 'all',          label: 'Todos'         },
  { key: 'middle-east',  label: 'Oriente Médio' },
  { key: 'europe',       label: 'Europa'        },
  { key: 'brazil',       label: 'Brasil'        },
]

// Cor do badge e do chip de cada categoria
const CATEGORY_COLOR: Record<string, string> = {
  'middle-east': '#E24B4A', // vermelho — região de alta tensão
  'europe':      '#378ADD', // azul
  'brazil':      '#1D9E75', // verde
}

// Imagem exibida quando o artigo não tem imagem própria
const FALLBACK_IMAGES: Record<string, string> = {
  'middle-east': 'https://images.unsplash.com/photo-1548943487-a2e4e43b4853?w=600&h=300&fit=crop',
  'europe':      'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=600&h=300&fit=crop',
  'brazil':      'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=600&h=300&fit=crop',
}

// Fallback genérico caso a categoria não seja reconhecida
const FALLBACK_DEFAULT = 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=600&h=300&fit=crop'

type ArticleWithImage = NewsArticle & { relative_time?: string; imageUrl?: string }

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export default function NewsTab() {
  const [articles, setArticles]       = useState<ArticleWithImage[]>([])
  const [filter, setFilter]           = useState('all')
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState<ArticleWithImage | null>(null)
  const [loading, setLoading]         = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchNews = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getNews({ max_results: 40 })
      if (result.articles?.length > 0) {
        setArticles(result.articles)
        setLastUpdated(new Date())
      }
    } catch (e) {
      console.warn('Falha ao buscar notícias:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Busca ao montar e refresca a cada 15 minutos
  useEffect(() => {
    fetchNews()
    const interval = setInterval(fetchNews, 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchNews])

  // Filtragem local — não faz nova requisição ao trocar categoria
  const filtered = articles.filter(a => {
    const matchFilter = filter === 'all' || a.categoryKey === filter
    const matchSearch = !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.description || '').toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  // Primeiro artigo vira hero card só quando não há filtro nem busca ativos
  const hero = filter === 'all' && !search ? filtered[0] : null
  const rest = hero ? filtered.slice(1) : filtered

  return (
    <div className="news-page">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="news-header">
        <div className="news-header-top">
          <div>
            <h2>Notícias</h2>
            {lastUpdated && (
              <span className="news-updated">
                atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <button
            className="news-refresh-btn"
            onClick={fetchNews}
            disabled={loading}
            title="Atualizar"
          >
            <svg
              width="14" height="14" viewBox="0 0 15 15" fill="none"
              style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}
            >
              <path d="M1.5 7.5A6 6 0 0 1 12 3M13.5 7.5A6 6 0 0 1 3 12"
                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M12 3V6.5H8.5" stroke="currentColor" strokeWidth="1.3"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* Busca */}
        <div className="news-search-wrap">
          <svg width="13" height="13" viewBox="0 0 15 15" fill="none"
            style={{ flexShrink: 0, opacity: 0.4 }}>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M10 10L13.5 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            className="news-search-input"
            type="text"
            placeholder="Buscar notícias..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="news-search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {/* Filtros de região */}
        <div className="news-filters">
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`news-filter-chip ${filter === f.key ? 'active' : ''}`}
              style={
                filter === f.key && f.key !== 'all'
                  ? {
                      borderColor: CATEGORY_COLOR[f.key],
                      color:       CATEGORY_COLOR[f.key],
                      background:  `${CATEGORY_COLOR[f.key]}18`,
                    }
                  : {}
              }
              onClick={() => setFilter(f.key)}
            >
              {f.key !== 'all' && (
                <span className="chip-dot" style={{ background: CATEGORY_COLOR[f.key] }} />
              )}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Conteúdo ─────────────────────────────────────────────────────── */}
      {loading && articles.length === 0 ? (
        <div className="news-loading">
          <div className="news-loading-dots"><span /><span /><span /></div>
          <span>Buscando notícias em tempo real...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="news-empty">Nenhuma notícia encontrada.</div>
      ) : (
        <div className="news-grid-wrap">
          {hero && <HeroCard article={hero} onClick={() => setSelected(hero)} />}
          <div className="news-cards-grid">
            {rest.map((article, i) => (
              <NewsCard key={i} article={article} onClick={() => setSelected(article)} />
            ))}
          </div>
        </div>
      )}

      {selected && (
        <ArticleModal article={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

// =============================================================================
// HELPERS INTERNOS
// =============================================================================

/** Resolve a cor e a imagem de fallback de um artigo. */
function resolveArticle(article: ArticleWithImage) {
  const color    = CATEGORY_COLOR[article.categoryKey || ''] || '#8B949E'
  const fallback = FALLBACK_IMAGES[article.categoryKey || ''] || FALLBACK_DEFAULT
  const imgSrc   = article.imageUrl || fallback
  return { color, fallback, imgSrc }
}

// =============================================================================
// SUB-COMPONENTES
// =============================================================================

/* ── Hero Card ────────────────────────────────────────────────────────────── */

function HeroCard({ article, onClick }: { article: ArticleWithImage; onClick: () => void }) {
  const { color, fallback, imgSrc } = resolveArticle(article)
  const [imgErr, setImgErr] = useState(false)

  return (
    <div className="news-hero-card" onClick={onClick}>
      <div className="news-hero-img">
        <img
          src={imgErr ? fallback : proxyImg(imgSrc)}
          alt={article.title}
          onError={() => setImgErr(true)}
        />
        {article.category && (
          <span className="news-card-badge" style={{ background: color }}>
            {article.category}
          </span>
        )}
      </div>
      <div className="news-hero-body">
        <div className="article-row-meta">
          <span className="article-source">{article.source}</span>
          {article.relative_time && (
            <>
              <span className="meta-sep">·</span>
              <span className="article-time">{article.relative_time}</span>
            </>
          )}
        </div>
        <div className="news-hero-title">{article.title}</div>
        {article.description && (
          <div className="news-hero-desc">{article.description}</div>
        )}
        <span className="news-read-more" style={{ color }}>Ler mais →</span>
      </div>
    </div>
  )
}

/* ── News Card ────────────────────────────────────────────────────────────── */

function NewsCard({ article, onClick }: { article: ArticleWithImage; onClick: () => void }) {
  const { color, fallback, imgSrc } = resolveArticle(article)
  const [imgErr, setImgErr] = useState(false)

  return (
    <div className="news-card" onClick={onClick}>
      <div className="news-card-img">
        <img
          src={imgErr ? fallback : proxyImg(imgSrc)}
          alt={article.title}
          onError={() => setImgErr(true)}
        />
        {article.category && (
          <span className="news-card-badge" style={{ background: color }}>
            {article.category}
          </span>
        )}
      </div>
      <div className="news-card-body">
        <div className="article-row-meta">
          <span className="article-source">{article.source}</span>
          {article.relative_time && (
            <>
              <span className="meta-sep">·</span>
              <span className="article-time">{article.relative_time}</span>
            </>
          )}
        </div>
        <div className="news-card-title">{article.title}</div>
        {article.description && (
          <div className="news-card-desc">{article.description}</div>
        )}
      </div>
    </div>
  )
}

/* ── Modal ────────────────────────────────────────────────────────────────── */

function ArticleModal({ article, onClose }: { article: ArticleWithImage; onClose: () => void }) {
  const { color, fallback, imgSrc } = resolveArticle(article)
  const [imgErr, setImgErr] = useState(false)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-img-wrap">
          <img
            src={imgErr ? fallback : proxyImg(imgSrc)}
            alt={article.title}
            onError={() => setImgErr(true)}
          />
          {article.category && (
            <span className="news-card-badge" style={{ background: color }}>
              {article.category}
            </span>
          )}
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="article-row-meta" style={{ marginBottom: 8 }}>
            <span className="article-source">{article.source}</span>
            {article.relative_time && (
              <>
                <span className="meta-sep">·</span>
                <span className="article-time">{article.relative_time}</span>
              </>
            )}
          </div>
          <h3>{article.title}</h3>
          {article.description && <p>{article.description}</p>}
          {article.url && (
            <a
              className="modal-link"
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver artigo original →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}