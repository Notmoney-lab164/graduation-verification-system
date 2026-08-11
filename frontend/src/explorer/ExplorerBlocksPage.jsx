/* FABRIC_EXPLORER_BLOCKS_PAGE_V1 */
import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { getExplorerBlocksPage } from '../api/students'
import './Explorer.css'

const formatDateTime = value => {
  if (!value) return 'Chưa có dữ liệu'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date).replace(',', '')
}

const shortHash = value => {
  const text = String(value || '')
  if (!text) return '---'
  return text.length > 20 ? `${text.slice(0, 10)}...${text.slice(-8)}` : text
}


/* FABRIC_BLOCK_OVERVIEW_V1 */
const BLOCK_TYPE_LABELS = {
  GENESIS: 'Khởi tạo kênh',
  GRADUATION: 'Graduation',
  LIFECYCLE: 'Nâng cấp chaincode',
  CONFIGURATION: 'Cấu hình kênh',
  APPLICATION: 'Ứng dụng',
  MIXED: 'Hỗn hợp',
  SYSTEM: 'Hệ thống',
}

const blockTypeLabel = value => BLOCK_TYPE_LABELS[value] || value || 'Chưa xác định'

const formatBytes = value => {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '---'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const validationSummary = block => (
  block?.validation_summary_available
    ? `${block.valid_transaction_count} hợp lệ / ${block.invalid_transaction_count} không hợp lệ`
    : 'Chưa có dữ liệu'
)


/* EXPLORER_PAGINATION_MEMORY_V1 */
const EXPLORER_PAGE_CACHE_TTL = 60 * 1000
const EXPLORER_PAGE_SIZES = new Set([5, 10, 25])

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const readPageCache = (cache, key) => {
  const cached = cache.get(key)
  if (!cached) return null
  if (Date.now() - cached.savedAt > EXPLORER_PAGE_CACHE_TTL) {
    cache.delete(key)
    return null
  }
  return cached.data
}


const blockPageCache = new Map()
const blockPageRequests = new Map()

const loadBlockPage = (page, pageSize) => {
  const key = `${page}:${pageSize}`
  const cached = readPageCache(blockPageCache, key)
  if (cached) return Promise.resolve(cached)
  if (blockPageRequests.has(key)) return blockPageRequests.get(key)

  const request = getExplorerBlocksPage(page, pageSize)
    .then(response => {
      blockPageCache.set(key, { data: response, savedAt: Date.now() })
      return response
    })
    .finally(() => blockPageRequests.delete(key))
  blockPageRequests.set(key, request)
  return request
}

function ExplorerBlocksPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = positiveInteger(searchParams.get('page'), 1)
  const requestedPageSize = positiveInteger(searchParams.get('size'), 10)
  const pageSize = EXPLORER_PAGE_SIZES.has(requestedPageSize) ? requestedPageSize : 10
  const cacheKey = `${page}:${pageSize}`
  const [data, setData] = useState(() => readPageCache(blockPageCache, cacheKey))
  const [error, setError] = useState('')

  useEffect(() => {
    const cached = readPageCache(blockPageCache, cacheKey)
    if (cached) {
      setData(cached)
      setError('')
      return undefined
    }

    let active = true
    setData(null)
    setError('')
    loadBlockPage(page, pageSize)
      .then(response => { if (active) setData(response) })
      .catch(requestError => {
        if (active) setError(requestError?.message || 'Không thể tải danh sách block.')
      })
    return () => { active = false }
  }, [cacheKey, page, pageSize])

  const totalPages = data?.total_pages || 1
  const items = data?.items || []

  function updatePagination(nextPage, nextPageSize = pageSize) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('page', String(nextPage))
    nextParams.set('size', String(nextPageSize))
    setSearchParams(nextParams)
  }

  function changePage(nextPage) {
    updatePagination(Math.max(1, Math.min(totalPages, nextPage)))
  }

  function changePageSize(event) {
    updatePagination(1, Number(event.target.value))
  }

  return (
    <main className="explorer-page explorer-blocks-page">
      <Link to="/explorer" className="explorer-back-link">← Quay lại Explorer</Link>
      <header className="explorer-detail-header">
        <p className="explorer-eyebrow">Fabric channel · Sổ cái công khai</p>
        <h1>Tất cả block</h1>
        <p className="explorer-page-description">Các block được liên kết bằng mã băm. Mọi thay đổi dữ liệu đã ghi sẽ làm chuỗi mã băm không còn khớp.</p>
      </header>

      <section className="explorer-blocks-card">
        <div className="explorer-page-toolbar">
          <div><h2>Danh sách block</h2><p>{data ? `${data.total_blocks} block trên channel` : 'Đang tải số block...'}</p></div>
          <label>Hiển thị
            <select value={pageSize} onChange={changePageSize}>
              <option value="5">5</option><option value="10">10</option><option value="25">25</option>
            </select>
            dòng
          </label>
        </div>

        {error && <p className="explorer-error" role="alert">{error}</p>}
        {!data && !error && <p className="explorer-empty explorer-loading-row">Đang tải các block từ Hyperledger Fabric...</p>}
        {data && <>
          <div className="explorer-blocks-table-wrap">
            <table className="explorer-blocks-table">
              <thead><tr><th>Block</th><th>Thời điểm</th><th>Loại block</th><th>Giao dịch</th><th>Graduation</th><th>Xác thực</th><th>Dung lượng</th><th>Mã băm block</th><th>Mã băm block trước</th></tr></thead>
              <tbody>
                {items.map(block => <tr key={block.number}>
                  <td><Link className="explorer-inline-link" to={`/explorer/blocks/${block.number}`} state={{ explorerReturnTo: `${location.pathname}${location.search}` }}>{block.number}</Link></td>
                  <td>{formatDateTime(block.first_transaction_at)}</td>
                  <td><span className="explorer-block-type-badge">{blockTypeLabel(block.block_type)}</span></td>
                  <td>{block.transaction_count}</td>
                  <td>{block.graduation_transaction_count}</td>
                  <td>{validationSummary(block)}</td>
                  <td>{formatBytes(block.size_bytes)}</td>
                  {/* FABRIC_BLOCK_HASH_V1 */}
                  <td className="explorer-mono" title={block.block_hash || ''}>{shortHash(block.block_hash)}</td>
                  <td className="explorer-mono" title={block.previous_block_hash || ''}>{shortHash(block.previous_block_hash)}</td>
                </tr>)}
                {!items.length && <tr><td colSpan="9" className="explorer-empty">Không có block tại trang này.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="explorer-pagination explorer-pagination-bsc">
            <div className="explorer-pagination-controls">
              <button type="button" onClick={() => changePage(1)} disabled={page === 1}>Đầu</button>
              <button type="button" aria-label="Trang trước" onClick={() => changePage(page - 1)} disabled={page === 1}>‹</button>
              <span>Trang {data.page} / {totalPages}</span>
              <button type="button" aria-label="Trang sau" onClick={() => changePage(page + 1)} disabled={page === totalPages}>›</button>
              <button type="button" onClick={() => changePage(totalPages)} disabled={page === totalPages}>Cuối</button>
            </div>
          </div>
        </>}
      </section>
    </main>
  )
}

export default ExplorerBlocksPage
