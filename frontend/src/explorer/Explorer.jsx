/* FABRIC_EXPLORER_LIFECYCLE_LISTS_V1 */
/* FABRIC_EXPLORER_REFRESH_BUTTON_REMOVED_V1 */
/* FABRIC_EXPLORER_ALL_LINK_FOOTER_V1 */
/* eslint-disable react/prop-types */
/* FABRIC_EXPLORER_NAVIGATION_V1 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getExplorerBlocks,
  getExplorerTransactions,
  searchBlockchainExplorer,
} from '../api/students'
import './Explorer.css'

const shortValue = (value, start = 12, end = 8) => {
  const text = String(value || '')
  if (text.length <= start + end + 3) return text || '---'
  return `${text.slice(0, start)}...${text.slice(-end)}`
}

const formatDateTime = value => {
  if (!value) return 'Chưa có dữ liệu'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date).replace(',', '')
}

const formatDate = value => {
  if (!value) return '---'
  const matched = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return matched ? `${matched[3]}/${matched[2]}/${matched[1]}` : String(value)
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

const statusClass = status => ({
  VALID: 'valid', COMMITTED: 'committed', INVALID: 'invalid',
}[status] || 'invalid')

const statusLabel = status => ({
  VALID: 'Hợp lệ', COMMITTED: 'Đã ghi nhận', INVALID: 'Không hợp lệ',
}[status] || status || 'Chưa rõ')


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

const functionDescription = value => value === 'syncStudentV2' ? '' : ({
  ApproveChaincodeDefinitionForMyOrg: 'Tổ chức đã phê duyệt định nghĩa chaincode trước khi áp dụng trên kênh.',
  CommitChaincodeDefinition: 'Phiên bản chaincode mới đã được áp dụng trên kênh Fabric.',
  syncStudent: 'Hồ sơ đã được duyệt và ghi lên Blockchain.',
  syncStudentV2: 'Hồ sơ v2 đã được duyệt và ghi lên Blockchain.',
  recordStudentRejection: '',
  recordStudentRejectionV2: '',
  recordExternalStudentRejectionV1: '',
  rebuildMetadataHashIndex: 'Bảo trì hệ thống, không thay đổi hồ sơ sinh viên.',
}[value] || 'Giao dịch của smart contract Graduation.')

/* EXPLORER_ACADEMIC_VI_LABELS_V1 */
const DEGREE_TYPE_LABELS = {
  Bachelor: 'Cử nhân',
  Engineer: 'Kỹ sư',
  Master: 'Thạc sĩ',
  Doctor: 'Tiến sĩ',
}

const CLASSIFICATION_LABELS = {
  Excellent: 'Xuất sắc',
  'Very Good': 'Giỏi',
  Good: 'Khá',
  Average: 'Trung bình',
}

function translateDegreeType(value) {
  return DEGREE_TYPE_LABELS[value] || value || '---'
}

function translateClassification(value) {
  return CLASSIFICATION_LABELS[value] || value || '---'
}

/* EXPLORER_CHANGED_DATA_RESULT_V1 */
/* EXPLORER_GPA_ONE_DECIMAL_V1 */
const formatExplorerGpa = value => {
  if (value === null || value === undefined || value === '') return '---'
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue.toFixed(1) : value
}

function SearchResult({ result }) {
  if (!result) return null

  const valueOrDash = value => (
    value === null || value === undefined || value === '' ? '---' : value
  )
  const isChangedRecord = result.lookup_type === 'current_metadata_hash'
  const currentHash = result.current_metadata_hash || result.record?.metadata_hash

  return (
    <section
      className={`explorer-result ${isChangedRecord ? 'explorer-result-changed' : ''}`}
      aria-live="polite"
    >
      <div className="explorer-section-heading">
        <div>
          <p className="explorer-eyebrow">
            {isChangedRecord ? 'Kết quả tra cứu dữ liệu hiện tại' : 'Kết quả tra cứu mã băm'}
          </p>
          <h2>
            {isChangedRecord
              ? 'Thông tin hiện tại đã thay đổi'
              : 'Bản ghi xác minh tốt nghiệp'}
          </h2>
        </div>
        <span className={`explorer-status ${isChangedRecord ? 'changed' : 'committed'}`}>
          {isChangedRecord ? 'Cần kiểm tra lại' : 'Đã tìm thấy'}
        </span>
      </div>

      {isChangedRecord && (
        <div className="explorer-change-warning" role="alert">
          <strong>Thông tin hiện tại đã thay đổi sau lần xác nhận gần nhất</strong>
          <p>
            {result.message || 'Một hoặc nhiều thông tin của người học hiện không giống với thông tin đã được nhà trường xác nhận trước đó. Kết quả này chưa được xác nhận lại. Vui lòng liên hệ nhà trường để kiểm tra.'}
          </p>
        </div>
      )}

      {result.record && (
        <dl className="explorer-detail-list explorer-record-list">
          <div>
            <dt>{isChangedRecord ? 'Mã băm dữ liệu hiện tại' : 'Mã băm dữ liệu'}</dt>
            <dd className="explorer-mono">{valueOrDash(currentHash)}</dd>
          </div>
          {isChangedRecord && (
            <div>
              <dt>Mã băm đã xác nhận trước đó</dt>
              <dd className="explorer-mono">{valueOrDash(result.confirmed_metadata_hash)}</dd>
            </div>
          )}
          <div><dt>Mã sinh viên</dt><dd>{valueOrDash(result.record.student_id)}</dd></div>
          <div><dt>Họ và tên</dt><dd>{valueOrDash(result.record.full_name)}</dd></div>
          <div><dt>Mã cơ sở đào tạo</dt><dd>{valueOrDash(result.record.institution_code)}</dd></div>
          <div><dt>Cơ sở đào tạo</dt><dd>{valueOrDash(result.record.institution_name)}</dd></div>
          <div><dt>Khoa</dt><dd>{valueOrDash(result.record.faculty_name)}</dd></div>
          <div><dt>Ngành</dt><dd>{valueOrDash(result.record.major)}</dd></div>
          <div><dt>Hình thức đào tạo</dt><dd>{valueOrDash(result.record.training_mode)}</dd></div>
          <div><dt>Loại bằng</dt><dd>{valueOrDash(translateDegreeType(result.record.degree_type))}</dd></div>
          <div><dt>Khóa nhập học</dt><dd>{valueOrDash(result.record.entrance_year)}</dd></div>
          <div><dt>Trạng thái tốt nghiệp</dt><dd>{result.record.graduation_status === 'GRADUATED' ? 'Đã tốt nghiệp' : valueOrDash(result.record.graduation_status)}</dd></div>
          <div><dt>Ngày tốt nghiệp</dt><dd>{formatDate(result.record.graduation_date)}</dd></div>
          <div><dt>Năm tốt nghiệp</dt><dd>{valueOrDash(result.record.graduation_year)}</dd></div>
          <div><dt>Xếp loại</dt><dd>{valueOrDash(translateClassification(result.record.classification))}</dd></div>
          <div><dt>{isChangedRecord ? 'GPA hiện tại' : 'GPA đã xác minh'}</dt><dd>{formatExplorerGpa(result.record.gpa)}</dd></div>
          {result.record.issuer_msp && <div><dt>Tổ chức ghi</dt><dd>{result.record.issuer_msp}</dd></div>}
          <div><dt>{isChangedRecord ? 'Thời điểm cập nhật dữ liệu' : 'Thời điểm cập nhật'}</dt><dd>{formatDateTime(result.record.updated_at)}</dd></div>
          {result.record.transaction_id && (
            <div>
              <dt>{isChangedRecord ? 'Giao dịch xác nhận trước đó' : 'Giao dịch gốc'}</dt>
              <dd>
                <Link
                  className="explorer-inline-link explorer-mono"
                  to={`/explorer/transactions/${result.record.transaction_id}`}
                >
                  {result.record.transaction_id}
                </Link>
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  )
}


/* FABRIC_BLOCK_OVERVIEW_V1 */
const BLOCK_TYPE_LABELS = {
  GENESIS: 'Block khởi tạo kênh',
  GRADUATION: 'Nghiệp vụ Graduation',
  LIFECYCLE: 'Quản lý và nâng cấp chaincode',
  CONFIGURATION: 'Cấu hình kênh Fabric',
  APPLICATION: 'Giao dịch ứng dụng',
  MIXED: 'Nhiều loại giao dịch',
  SYSTEM: 'Giao dịch hệ thống',
}

const blockTypeLabel = value => BLOCK_TYPE_LABELS[value] || value || 'Chưa xác định loại block'

const formatBytes = value => {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return 'Chưa có dung lượng'
  if (bytes < 1024) return `${bytes} byte`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const blockValidationLabel = block => {
  if (!block?.validation_summary_available) return 'Chưa có kết quả xác thực từ peer'
  const valid = Number(block.valid_transaction_count || 0)
  const invalid = Number(block.invalid_transaction_count || 0)
  return invalid
    ? `${valid} hợp lệ · ${invalid} không hợp lệ`
    : `${valid} giao dịch hợp lệ`
}

function BlockFeed({ blocks }) {
  if (!blocks.length) return <p className="explorer-empty">Chưa có block để hiển thị.</p>
  return blocks.map(block => (
    <Link key={block.number} to={`/explorer/blocks/${block.number}`} className="explorer-feed-row">
      <span className="explorer-feed-icon" aria-hidden="true">▣</span>
      <span className="explorer-feed-primary"><strong>{block.number}</strong><small>{formatDateTime(block.first_transaction_at)}</small></span>
      <span className="explorer-feed-description">{blockTypeLabel(block.block_type)}<small>{formatBytes(block.size_bytes)}</small></span>
      <span className="explorer-feed-meta">{block.transaction_count} giao dịch<small>{blockValidationLabel(block)}</small></span>
    </Link>
  ))
}

function TransactionFeed({ transactions }) {
  if (!transactions.length) return <p className="explorer-empty">Chưa có giao dịch Fabric để hiển thị.</p>
  return transactions.map(transaction => (
    <Link key={transaction.transaction_id} to={`/explorer/transactions/${transaction.transaction_id}`} className="explorer-feed-row">
      <span className="explorer-feed-icon explorer-transaction-icon" aria-hidden="true">≡</span>
      <span className="explorer-feed-primary explorer-mono"><strong title={transaction.transaction_id}>{shortValue(transaction.transaction_id)}</strong><small>{formatDateTime(transaction.timestamp)}</small></span>
      <span className="explorer-feed-description">{functionLabel(transaction.function_name)}<small>{functionDescription(transaction.function_name)}</small></span>
      <span className="explorer-feed-meta"><span className={`explorer-status ${decisionStatusClass(transaction)}`}>{decisionStatusLabel(transaction)}</span><small>Block {transaction.block_number}</small></span>
    </Link>
  ))
}

function Explorer() {
  const navigate = useNavigate()
  const [lookup, setLookup] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingRecent, setIsLoadingRecent] = useState(true)
  const [blocks, setBlocks] = useState([])
  const [transactions, setTransactions] = useState([])

  async function loadRecent() {
    try {
      setIsLoadingRecent(true)
      const [blockData, transactionData] = await Promise.all([
        getExplorerBlocks(6), getExplorerTransactions(6),
      ])
      setBlocks(blockData.items || [])
      setTransactions(transactionData.items || [])
    } catch (requestError) {
      setError(requestError?.message || 'Không thể tải dữ liệu blockchain.')
    } finally {
      setIsLoadingRecent(false)
    }
  }

  useEffect(() => { loadRecent() }, [])

  // EXPLORER_SEARCH_VALIDATION_RESET_V1
  function handleLookupChange(event) {
    const nextLookup = event.target.value
    const normalizedLookup = nextLookup.trim()
    setLookup(nextLookup)
    setResult(null)

    // Clear a previous validation message as soon as the value is valid again.
    if (!normalizedLookup || /^[0-9a-fA-F]{64}$/.test(normalizedLookup)) {
      setError('')
    }
  }

  async function handleSearch(event) {
    event.preventDefault()
    const normalizedLookup = lookup.trim()
    if (!normalizedLookup) {
      setResult(null)
      setError('Vui lòng nhập mã gồm đúng 64 ký tự.')
      return
    }
    // EXPLORER_64_HEX_SEARCH_ONLY_V1
    if (!/^[0-9a-fA-F]{64}$/.test(normalizedLookup)) {
      setResult(null)
      setError('Mã tra cứu phải gồm đúng 64 ký tự hex (0-9, a-f).')
      return
    }
    try {
      setIsSearching(true)
      setError('')
      const found = await searchBlockchainExplorer(normalizedLookup)
      if (found.lookup_type === 'transaction_id' && found.transaction?.transaction_id) {
        navigate(`/explorer/transactions/${found.transaction.transaction_id}`)
        return
      }
      // FABRIC_BLOCK_HASH_V1
      if (found.lookup_type === 'block_hash' && found.block?.number !== undefined) {
        navigate(`/explorer/blocks/${found.block.number}`)
        return
      }
      setResult(found)
    } catch (requestError) {
      setResult(null)
      setError(requestError?.message || 'Không tìm thấy dữ liệu blockchain phù hợp.')
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <main className="explorer-page">
      <header className="explorer-header">
        <div><p className="explorer-brand">FPTU · GRADUATION LEDGER</p><h1>Blockchain Explorer</h1><p>Tra cứu công khai dữ liệu xác minh đã ghi nhận trên Hyperledger Fabric.</p></div>
        <Link to="/" className="explorer-home-link">← Tra cứu sinh viên</Link>
      </header>

      <section className="explorer-search-card">
        <p className="explorer-eyebrow">Tra cứu blockchain</p><h2>Tra cứu bằng mã 64 ký tự</h2>
        <form onSubmit={handleSearch} className="explorer-search-form">
          {/* EXPLORER_64_HEX_SEARCH_ONLY_V1 */}
          <input value={lookup} onChange={handleLookupChange} placeholder="Nhập mã gồm 64 ký tự (0-9, a-f)..." maxLength={128} autoComplete="off" spellCheck="false" />
          {/* EXPLORER_ICON_SEARCH_BUTTON_V1 */}
          <button
            type="submit"
            className="explorer-search-button"
            disabled={isSearching}
            aria-label={isSearching ? 'Đang tìm kiếm' : 'Tìm kiếm'}
            title={isSearching ? 'Đang tìm kiếm' : 'Tìm kiếm'}
          >
            {isSearching ? (
              <span className="explorer-search-spinner" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4.25 4.25" />
              </svg>
            )}
          </button>
        </form>
        {error && <p className="explorer-error" role="alert">{error}</p>}
      </section>

      <SearchResult result={result} />

      <div className="explorer-grid">
        <section className="explorer-feed-card">
          <div className="explorer-section-heading"><div><p className="explorer-eyebrow">Fabric channel</p><h2>Khối mới nhất</h2></div></div>
          {isLoadingRecent ? <p className="explorer-empty">Đang tải dữ liệu block...</p> : <BlockFeed blocks={blocks} />}
          {!isLoadingRecent && blocks.length > 0 && <Link to="/explorer/blocks" className="explorer-card-footer">Xem tất cả block →</Link>}
        </section>
        <section className="explorer-feed-card">
          <div className="explorer-section-heading"><div><p className="explorer-eyebrow">Hyperledger Fabric</p><h2>Giao dịch mới nhất</h2></div></div>
          {isLoadingRecent ? <p className="explorer-empty">Đang tải dữ liệu giao dịch...</p> : <TransactionFeed transactions={transactions} />}
          {!isLoadingRecent && transactions.length > 0 && <Link to="/explorer/transactions" className="explorer-card-footer">Xem tất cả giao dịch →</Link>}
        </section>
      </div>
    </main>
  )
}

export default Explorer
