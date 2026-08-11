/* FABRIC_EXPLORER_LIFECYCLE_LISTS_V1 */
/* eslint-disable react/prop-types */
/* FABRIC_EXPLORER_TRANSACTIONS_PAGE_V1 */
import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { getExplorerTransactionsPage } from '../api/students'
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

const shortValue = value => {
  const text = String(value || '')
  return text.length > 24 ? `${text.slice(0, 12)}...${text.slice(-8)}` : text || '---'
}

const functionLabel = value => ({
  ApproveChaincodeDefinitionForMyOrg: 'Phê duyệt nâng cấp chaincode',
  CommitChaincodeDefinition: 'Áp dụng phiên bản chaincode mới',
  syncStudent: 'Thêm sinh viên',
  syncStudentV2: 'Thêm sinh viên',
  createStudent: 'Tạo hồ sơ sinh viên',
  updateStudent: 'Cập nhật hồ sơ sinh viên',
  rebuildMetadataHashIndex: 'Cập nhật danh mục tra cứu',
  recordStudentRejection: 'Từ chối duyệt hồ sơ sinh viên',
  recordStudentRejectionV2: 'Từ chối duyệt hồ sơ sinh viên',
  recordExternalStudentRejectionV1: 'Từ chối hồ sơ nguồn ngoài',
}[value] || value || 'Giao dịch Fabric')

const statusClass = status => ({ VALID: 'valid', COMMITTED: 'committed', INVALID: 'invalid' }[status] || 'invalid')
const statusLabel = status => ({ VALID: 'Hợp lệ', COMMITTED: 'Đã ghi nhận', INVALID: 'Không hợp lệ' }[status] || status || 'Chưa rõ')


const decisionStatusClass = transaction => {
  const recorded = ['COMMITTED', 'VALID'].includes(transaction?.status)
  if (recorded && ['recordStudentRejection', 'recordStudentRejectionV2', 'recordExternalStudentRejectionV1'].includes(transaction?.function_name)) {
    return 'decision-rejected'
  }
  if (recorded && ['syncStudent', 'syncStudentV2'].includes(transaction?.function_name)) {
    return 'decision-approved'
  }
  return statusClass(transaction?.status)
}

const decisionStatusLabel = transaction => {
  const recorded = ['COMMITTED', 'VALID'].includes(transaction?.status)
  if (recorded && ['recordStudentRejection', 'recordStudentRejectionV2', 'recordExternalStudentRejectionV1'].includes(transaction?.function_name)) {
    return 'Đã từ chối'
  }
  if (recorded && ['syncStudent', 'syncStudentV2'].includes(transaction?.function_name)) {
    return 'Đã duyệt'
  }
  return statusLabel(transaction?.status)
}


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


const transactionPageCache = new Map()
const transactionPageRequests = new Map()

const loadTransactionPage = (page, pageSize) => {
  const key = `${page}:${pageSize}`
  const cached = readPageCache(transactionPageCache, key)
  if (cached) return Promise.resolve(cached)
  if (transactionPageRequests.has(key)) return transactionPageRequests.get(key)

  const request = getExplorerTransactionsPage(page, pageSize)
    .then(response => {
      transactionPageCache.set(key, { data: response, savedAt: Date.now() })
      return response
    })
    .finally(() => transactionPageRequests.delete(key))
  transactionPageRequests.set(key, request)
  return request
}

function ExplorerTransactionsPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = positiveInteger(searchParams.get('page'), 1)
  const requestedPageSize = positiveInteger(searchParams.get('size'), 10)
  const pageSize = EXPLORER_PAGE_SIZES.has(requestedPageSize) ? requestedPageSize : 10
  const cacheKey = `${page}:${pageSize}`
  const [data, setData] = useState(() => readPageCache(transactionPageCache, cacheKey))
  const [error, setError] = useState('')

  useEffect(() => {
    const cached = readPageCache(transactionPageCache, cacheKey)
    if (cached) {
      setData(cached)
      setError('')
      return undefined
    }

    let active = true
    setData(null)
    setError('')
    loadTransactionPage(page, pageSize)
      .then(response => { if (active) setData(response) })
      .catch(requestError => {
        if (active) setError(requestError?.message || 'Không thể tải danh sách giao dịch.')
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

  const changePage = nextPage => (
    updatePagination(Math.max(1, Math.min(totalPages, nextPage)))
  )

  function changePageSize(event) {
    updatePagination(1, Number(event.target.value))
  }

  return (
    <main className="explorer-page explorer-blocks-page">
      <Link to="/explorer" className="explorer-back-link">← Quay lại Explorer</Link>
      <header className="explorer-detail-header">
        <p className="explorer-eyebrow">Hyperledger Fabric · Sổ cái công khai</p>
        <h1>Tất cả giao dịch</h1>
        <p className="explorer-page-description">Danh sách gồm giao dịch nghiệp vụ Graduation và giao dịch triển khai, nâng cấp chaincode trên Hyperledger Fabric.</p>
      </header>

      <section className="explorer-blocks-card">
        <div className="explorer-page-toolbar">
          <div><h2>Danh sách giao dịch</h2><p>{data ? `${data.total_transactions} giao dịch Fabric đã quét` : 'Đang tải số giao dịch...'}</p></div>
          <label>Hiển thị
            <select value={pageSize} onChange={changePageSize}>
              <option value="5">5</option><option value="10">10</option><option value="25">25</option>
            </select>
            dòng
          </label>
        </div>

        {error && <p className="explorer-error" role="alert">{error}</p>}
        {!data && !error && <p className="explorer-empty explorer-loading-row">Đang tải giao dịch từ Hyperledger Fabric...</p>}
        {data && <>
          <div className="explorer-blocks-table-wrap">
            <table className="explorer-blocks-table explorer-transactions-table">
              <thead><tr><th>Mã giao dịch</th><th>Thời điểm</th><th>Hành động</th><th>Block</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {items.map(transaction => <tr key={transaction.transaction_id}>
                  <td className="explorer-mono" title={transaction.transaction_id}><Link className="explorer-inline-link" to={`/explorer/transactions/${transaction.transaction_id}`} state={{ explorerReturnTo: `${location.pathname}${location.search}` }}>{shortValue(transaction.transaction_id)}</Link></td>
                  <td>{formatDateTime(transaction.timestamp)}</td>
                  <td>{functionLabel(transaction.function_name)}</td>
                  <td><Link className="explorer-inline-link" to={`/explorer/blocks/${transaction.block_number}`} state={{ explorerReturnTo: `${location.pathname}${location.search}` }}>{transaction.block_number}</Link></td>
                  <td><span className={`explorer-status ${decisionStatusClass(transaction)}`}>{decisionStatusLabel(transaction)}</span></td>
                </tr>)}
                {!items.length && <tr><td colSpan="5" className="explorer-empty">Không có giao dịch tại trang này.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={totalPages} onChange={changePage} />
        </>}
      </section>
    </main>
  )
}

function Pagination({ page, totalPages, onChange }) {
  return (
    <div className="explorer-pagination explorer-pagination-bsc">
      <div className="explorer-pagination-controls">
        <button type="button" onClick={() => onChange(1)} disabled={page === 1}>Đầu</button>
        <button type="button" aria-label="Trang trước" onClick={() => onChange(page - 1)} disabled={page === 1}>‹</button>
        <span>Trang {page} / {totalPages}</span>
        <button type="button" aria-label="Trang sau" onClick={() => onChange(page + 1)} disabled={page === totalPages}>›</button>
        <button type="button" onClick={() => onChange(totalPages)} disabled={page === totalPages}>Cuối</button>
      </div>
    </div>
  )
}

export default ExplorerTransactionsPage
