import { TabType } from '../types'

interface SidebarProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  apiConnected: boolean
}

export default function Sidebar({ activeTab, onTabChange, apiConnected }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-globe">🌐</span>
        <div>
          <h1>Geopolitical</h1>
          <span>Intelligence Agent</span>
        </div>
      </div>

      <nav style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <button
          onClick={() => onTabChange('news')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            background: activeTab === 'news' ? 'rgba(59,130,246,0.1)' : 'none',
            border: activeTab === 'news' ? '1px solid rgba(59,130,246,0.35)' : '1px solid transparent',
            borderRadius: '8px',
            color: activeTab === 'news' ? '#3B82F6' : '#8B949E',
            fontFamily: 'inherit',
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            if (activeTab !== 'news') {
              const el = e.currentTarget
              el.style.background = 'rgba(255,255,255,0.04)'
              el.style.color = '#F0F6FF'
            }
          }}
          onMouseLeave={e => {
            if (activeTab !== 'news') {
              const el = e.currentTarget
              el.style.background = 'none'
              el.style.color = '#8B949E'
            }
          }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <rect x="1" y="1" width="13" height="2.8" rx="0.6" fill="currentColor"/>
            <rect x="1" y="5.8" width="9" height="1.6" rx="0.5" fill="currentColor" opacity="0.6"/>
            <rect x="1" y="9" width="11" height="1.6" rx="0.5" fill="currentColor" opacity="0.6"/>
            <rect x="1" y="12" width="7" height="1.6" rx="0.5" fill="currentColor" opacity="0.35"/>
          </svg>
          News Feed
          <span style={{
            marginLeft: 'auto',
            width: '6px', height: '6px',
            borderRadius: '50%',
            background: activeTab === 'news' ? '#3B82F6' : 'transparent',
            border: activeTab === 'news' ? '1px solid #3B82F6' : '1px solid #4B5563',
            transition: 'all 0.15s',
            flexShrink: 0,
          }} />
        </button>

        <button
          onClick={() => onTabChange('chat')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            background: activeTab === 'chat' ? 'rgba(59,130,246,0.1)' : 'none',
            border: activeTab === 'chat' ? '1px solid rgba(59,130,246,0.35)' : '1px solid transparent',
            borderRadius: '8px',
            color: activeTab === 'chat' ? '#3B82F6' : '#8B949E',
            fontFamily: 'inherit',
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            if (activeTab !== 'chat') {
              const el = e.currentTarget
              el.style.background = 'rgba(255,255,255,0.04)'
              el.style.color = '#F0F6FF'
            }
          }}
          onMouseLeave={e => {
            if (activeTab !== 'chat') {
              const el = e.currentTarget
              el.style.background = 'none'
              el.style.color = '#8B949E'
            }
          }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M1.5 2C1.5 1.72 1.72 1.5 2 1.5H13C13.28 1.5 13.5 1.72 13.5 2V10C13.5 10.28 13.28 10.5 13 10.5H4.5L1.5 13.5V2Z" fill="currentColor" opacity="0.85"/>
            <rect x="3.5" y="4.5" width="8" height="1" rx="0.5" fill="var(--bg-primary)"/>
            <rect x="3.5" y="7" width="5.5" height="1" rx="0.5" fill="var(--bg-primary)" opacity="0.7"/>
          </svg>
          Chat
          <span style={{
            marginLeft: 'auto',
            width: '6px', height: '6px',
            borderRadius: '50%',
            background: activeTab === 'chat' ? '#3B82F6' : 'transparent',
            border: activeTab === 'chat' ? '1px solid #3B82F6' : '1px solid #4B5563',
            transition: 'all 0.15s',
            flexShrink: 0,
          }} />
        </button>
      </nav>

      <div className="sidebar-footer">
        <div className={`api-status ${apiConnected ? 'online' : 'offline'}`}>
          <span className="api-status-dot" />
          {apiConnected ? 'API Connected' : 'API Offline'}
        </div>
      </div>
    </aside>
  )
}