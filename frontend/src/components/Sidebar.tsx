import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { TabType } from '../types'

interface HistoryItem {
  id: string
  question: string
  timestamp: Date
}

interface SidebarProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  apiConnected: boolean
  chatHistory?: HistoryItem[]
  onHistorySelect?: (item: HistoryItem) => void
  onHistoryClear?: () => void
}

const REGIONS = [
  { id: 'ukraine',   label: 'Ucrânia',        level: 'critical', lat: 49,   lon: 31   },
  { id: 'gaza',      label: 'Gaza',            level: 'critical', lat: 31.5, lon: 34.5 },
  { id: 'taiwan',    label: 'Taiwan',          level: 'high',     lat: 23.5, lon: 121  },
  { id: 'sahel',     label: 'Sahel',           level: 'high',     lat: 15,   lon: 0    },
  { id: 'korea',     label: 'Coreia do Norte', level: 'medium',   lat: 40,   lon: 127  },
  { id: 'iran',      label: 'Irã',             level: 'medium',   lat: 32,   lon: 53   },
  { id: 'myanmar',   label: 'Myanmar',         level: 'medium',   lat: 21,   lon: 96   },
  { id: 'venezuela', label: 'Venezuela',       level: 'low',      lat: 8,    lon: -66  },
]

const LEVEL_COLOR: Record<string, string> = {
  critical: '#E24B4A',
  high:     '#EF9F27',
  medium:   '#378ADD',
  low:      '#1D9E75',
}

function getTensionScore() {
  const weights: Record<string, number> = { critical: 1, high: 0.66, medium: 0.33, low: 0.1 }
  const sum = REGIONS.reduce((acc, r) => acc + (weights[r.level] || 0), 0)
  return Math.min(1, sum / (REGIONS.length * 0.8))
}

function getTensionLabel(score: number) {
  if (score > 0.75) return { label: 'CRÍTICA',  color: '#E24B4A' }
  if (score > 0.5)  return { label: 'ELEVADA',  color: '#EF9F27' }
  if (score > 0.25) return { label: 'MODERADA', color: '#EF9F27' }
  return                   { label: 'BAIXA',    color: '#1D9E75' }
}

function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi   = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  )
}

function relativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diff < 1)  return 'agora'
  if (diff < 60) return `há ${diff} min`
  const h = Math.floor(diff / 60)
  if (h < 24)    return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

export default function Sidebar({
  activeTab, onTabChange, apiConnected,
  chatHistory = [], onHistorySelect, onHistoryClear,
}: SidebarProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ label: string; x: number; y: number } | null>(null)

  const tensionScore  = getTensionScore()
  const tension       = getTensionLabel(tensionScore)
  const criticalCount = REGIONS.filter(r => r.level === 'critical').length
  const highCount     = REGIONS.filter(r => r.level === 'high').length

  useEffect(() => {
    if (!mountRef.current) return
    const el = mountRef.current
    const W  = el.clientWidth  || 240
    const H  = el.clientHeight || 260

    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000)
    camera.position.z = 2.4

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(window.devicePixelRatio)
    el.appendChild(renderer.domElement)

    // Globe
    const geo     = new THREE.SphereGeometry(1, 64, 64)
    const texture = new THREE.TextureLoader().load(
      'https://unpkg.com/three-globe/example/img/earth-day.jpg'
    )
    const mat   = new THREE.MeshPhongMaterial({ map: texture, specular: new THREE.Color(0x111111) })
    const globe = new THREE.Mesh(geo, mat)
    scene.add(globe)

    // Atmosphere
    const atmMat = new THREE.MeshPhongMaterial({
      color: 0x3399ff, transparent: true, opacity: 0.07, side: THREE.FrontSide,
    })
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.02, 64, 64), atmMat))

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(5, 3, 5)
    scene.add(sun)

    // Markers + rings
    const markerMeshes: { mesh: THREE.Mesh; region: typeof REGIONS[0] }[] = []
    REGIONS.forEach(r => {
      const pos  = latLonToVec3(r.lat, r.lon, 1.02)
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 12, 12),
        new THREE.MeshBasicMaterial({ color: LEVEL_COLOR[r.level] })
      )
      mesh.position.copy(pos)
      scene.add(mesh)
      markerMeshes.push({ mesh, region: r })

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.035, 0.048, 24),
        new THREE.MeshBasicMaterial({ color: LEVEL_COLOR[r.level], transparent: true, opacity: 0.5, side: THREE.DoubleSide })
      )
      ring.position.copy(pos)
      ring.lookAt(pos.clone().multiplyScalar(2))
      scene.add(ring)
    })

    // Drag
    let isDragging = false, prevX = 0, rotY = 0
    const onDown = (e: MouseEvent) => { isDragging = true; prevX = e.clientX }
    const onUp   = () => { isDragging = false }
    const onMove = (e: MouseEvent) => {
      if (!isDragging) return
      rotY += (e.clientX - prevX) * 0.005
      globe.rotation.y = rotY
      markerMeshes.forEach(({ mesh, region }) => {
        mesh.position.copy(latLonToVec3(region.lat, region.lon + rotY * (180 / Math.PI), 1.02))
      })
      prevX = e.clientX
    }

    // Tooltip
    const raycaster = new THREE.Raycaster()
    const mouse     = new THREE.Vector2()
    const onHover   = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObjects(markerMeshes.map(m => m.mesh))
      if (hits.length > 0) {
        const hit   = markerMeshes.find(m => m.mesh === hits[0].object)
        const rect2 = el.getBoundingClientRect()
        setTooltip({ label: hit!.region.label, x: e.clientX - rect2.left, y: e.clientY - rect2.top - 28 })
      } else {
        setTooltip(null)
      }
    }

    renderer.domElement.addEventListener('mousedown', onDown)
    renderer.domElement.addEventListener('mousemove', onMove)
    renderer.domElement.addEventListener('mousemove', onHover)
    window.addEventListener('mouseup', onUp)

    // Animate
    let animId = 0, t = 0
    const animate = () => {
      animId = requestAnimationFrame(animate)
      t += 0.016
      if (!isDragging) {
        rotY += 0.003
        globe.rotation.y = rotY
        markerMeshes.forEach(({ mesh, region }) => {
          mesh.position.copy(latLonToVec3(region.lat, region.lon + rotY * (180 / Math.PI), 1.02))
        })
      }
      scene.children.forEach(child => {
        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.RingGeometry) {
          ;(child.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.25 * Math.sin(t * 2)
        }
      })
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animId)
      renderer.domElement.removeEventListener('mousedown', onDown)
      renderer.domElement.removeEventListener('mousemove', onMove)
      renderer.domElement.removeEventListener('mousemove', onHover)
      window.removeEventListener('mouseup', onUp)
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <aside className="sidebar">

      {/* Logo */}
      <div className="sidebar-logo">
        <span className="sidebar-logo-globe">🌐</span>
        <div>
          <h1>Geopolitical</h1>
          <span>Intelligence Agent</span>
        </div>
      </div>

      {/* Globe */}
      <div className="sidebar-globe-wrap">
        <div ref={mountRef} className="sidebar-globe-canvas" style={{ position: 'relative' }}>
          {tooltip && (
            <div className="globe-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
              {tooltip.label}
            </div>
          )}
        </div>
        <div className="globe-status">
          <span className="globe-status-dot critical" />
          {criticalCount} crítico{criticalCount !== 1 ? 's' : ''}
          <span style={{ margin: '0 6px', opacity: 0.3 }}>·</span>
          <span className="globe-status-dot high" />
          {highCount} elevado{highCount !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Tension bar */}
      <div className="tension-bar-wrap">
        <div className="tension-bar-header">
          <span className="tension-bar-label">Tensão global</span>
          <span className="tension-bar-value" style={{ color: tension.color }}>{tension.label}</span>
        </div>
        <div className="tension-bar-track">
          <div className="tension-bar-pointer" style={{ left: `${tensionScore * 100}%` }} />
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {(['news', 'chat'] as const).map(tab => (
          <button
            key={tab}
            className={`sidebar-nav-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {tab === 'news' ? <NewsIcon /> : <ChatIcon />}
            {tab === 'news' ? 'Notícias' : 'Chat'}
          </button>
        ))}
      </nav>

      {/* Chat history */}
      <div className="history-panel">
        <div className="history-panel-header">
          <span className="history-panel-title">Histórico</span>
          {chatHistory.length > 0 && (
            <button className="history-clear-btn" onClick={onHistoryClear}>limpar</button>
          )}
        </div>

        {chatHistory.length === 0 ? (
          <div className="history-empty">Nenhuma conversa ainda</div>
        ) : (
          <div className="history-list">
            {chatHistory.map(item => (
              <button
                key={item.id}
                className="history-item"
                onClick={() => onHistorySelect?.(item)}
              >
                <ChatIcon />
                <div className="history-item-body">
                  <div className="history-item-question">{item.question}</div>
                  <div className="history-item-time">{relativeTime(item.timestamp)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className={`api-status ${apiConnected ? 'online' : 'offline'}`}>
          <span className="api-status-dot" />
          {apiConnected ? 'API Conectada' : 'API Offline'}
        </div>
      </div>

    </aside>
  )
}

function NewsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="1" width="13" height="2.8" rx="0.6" fill="currentColor"/>
      <rect x="1" y="5.8" width="9" height="1.6" rx="0.5" fill="currentColor" opacity="0.6"/>
      <rect x="1" y="9" width="11" height="1.6" rx="0.5" fill="currentColor" opacity="0.6"/>
      <rect x="1" y="12" width="7" height="1.6" rx="0.5" fill="currentColor" opacity="0.35"/>
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <path d="M1.5 2C1.5 1.72 1.72 1.5 2 1.5H13C13.28 1.5 13.5 1.72 13.5 2V10C13.5 10.28 13.28 10.5 13 10.5H4.5L1.5 13.5V2Z" fill="currentColor" opacity="0.85"/>
    </svg>
  )
}
