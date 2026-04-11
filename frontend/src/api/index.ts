const API_BASE = 'http://localhost:8000/api'

export async function* chatStream(
  message: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Erro na API: ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('Stream nao disponivel')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(5).trim()
        if (data === '[DONE]') return
        if (data) yield data
      }
    }
  }
}

export async function getNews(options?: {
  category?: string; region?: string; days?: number; max_results?: number
}): Promise<{ articles: any[] }> {
  const params = new URLSearchParams()
  if (options?.category) params.set('category', options.category)
  if (options?.region) params.set('region', options.region)
  if (options?.days) params.set('days', String(options.days))
  if (options?.max_results) params.set('max_results', String(options.max_results))

  const response = await fetch(`${API_BASE}/news?${params.toString()}`)
  if (!response.ok) throw new Error(`Erro na API: ${response.status}`)
  return response.json()
}

export async function getTrendingTopics(): Promise<{ topics: any[] }> {
  const response = await fetch(`${API_BASE}/news/trending`)
  if (!response.ok) throw new Error(`Erro na API: ${response.status}`)
  return response.json()
}

export async function analyzeArticle(params: { title: string; content?: string; url: string }): Promise<any> {
  const response = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!response.ok) throw new Error(`Erro na API: ${response.status}`)
  return response.json()
}
