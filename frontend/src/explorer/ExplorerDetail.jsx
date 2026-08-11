/* eslint-disable react/prop-types */
/* FABRIC_EXPLORER_NAVIGATION_V1 */
/* EXPLORER_BLOCK_NUMBER_NO_HASH_PREFIX_V2 */
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getExplorerBlock, getExplorerTransaction } from '../api/students'
import './Explorer.css'

const shortValue = (value, start = 14, end = 10) => {
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

const blockTypeLabel = value => BLOCK_TYPE_LABELS[value] || value || 'Chưa xác định'

const formatBytes = value => {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return 'Chưa có dữ liệu'
  if (bytes < 1024) return `${bytes} byte`
  if (bytes < 1024 * 1024) return `${bytes.toLocaleString('vi-VN')} byte (${(bytes / 1024).toFixed(1)} KB)`
  return `${bytes.toLocaleString('vi-VN')} byte (${(bytes / (1024 * 1024)).toFixed(2)} MB)`
}

// FABRIC_LIFECYCLE_LABELS_V1
const chaincodeLabel = value => (
  value === '_lifecycle'
    ? 'Hệ thống quản lý và nâng cấp chaincode'
    : value || '---'
)

// FABRIC_LIFECYCLE_FRIENDLY_ACTIONS_V1
const functionLabel = value => ({
  syncStudent: 'Thêm sinh viên',
  syncStudentV2: 'Thêm sinh viên', createStudent: 'Tạo hồ sơ sinh viên',
  updateStudent: 'Cập nhật hồ sơ sinh viên', rebuildMetadataHashIndex: 'Cập nhật danh mục tra cứu',
  recordStudentRejection: 'Từ chối duyệt hồ sơ sinh viên',
  recordStudentRejectionV2: 'Từ chối duyệt hồ sơ sinh viên',
  recordExternalStudentRejectionV1: 'Từ chối hồ sơ nguồn ngoài',
  ApproveChaincodeDefinitionForMyOrg: 'Phê duyệt nâng cấp chaincode',
  CommitChaincodeDefinition: 'Áp dụng phiên bản chaincode mới',
}[value] || value || 'Giao dịch Fabric')

const statusClass = status => ({ VALID: 'valid', COMMITTED: 'committed', INVALID: 'invalid' }[status] || 'invalid')
const statusLabel = status => ({ VALID: 'Hợp lệ', COMMITTED: 'Đã ghi nhận', INVALID: 'Không hợp lệ' }[status] || status || 'Chưa rõ')

// FABRIC_TRANSACTION_IDENTITY_DETAILS_V1
// FABRIC_TRANSACTION_FRIENDLY_LABELS_V1
const transactionOrderLabel = index => {
  const order = Number(index) + 1
  if (order === 1) return 'Giao dịch thứ nhất trong block'
  if (order === 2) return 'Giao dịch thứ hai trong block'
  if (order === 3) return 'Giao dịch thứ ba trong block'
  return `Giao dịch thứ ${order} trong block`
}

const validationCodeLabel = transaction => {
  if (transaction?.validation_code === 0) return 'Hợp lệ'
  if (transaction?.validation_code === null || transaction?.validation_code === undefined) {
    return 'Chưa đọc được từ peer'
  }
  return 'Không hợp lệ'
}

const executionStatusLabel = status => {
  const numericStatus = Number(status)
  if (numericStatus === 200) return 'Thành công'
  if (!status && status !== 0) return 'Chưa có dữ liệu'
  return `Mã phản hồi ${status}`
}

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
  syncStudent: 'Hồ sơ đã được duyệt và ghi lên Blockchain.',
  syncStudentV2: 'Hồ sơ v2 đã được duyệt và ghi lên Blockchain.',
  recordStudentRejection: '',
  recordStudentRejectionV2: '',
  recordExternalStudentRejectionV1: '',
  ApproveChaincodeDefinitionForMyOrg: 'Tổ chức gửi giao dịch đã đồng ý với phiên bản chaincode trước khi áp dụng trên kênh.',
  CommitChaincodeDefinition: 'Phiên bản chaincode đã được các tổ chức phê duyệt và áp dụng trên kênh.',
  rebuildMetadataHashIndex: 'Bảo trì hệ thống, không thay đổi hồ sơ sinh viên.',
}[value] || 'Giao dịch được ghi nhận trên kênh Hyperledger Fabric.')

function DetailShell({ eyebrow, title, children, error, loading }) {
  const location = useLocation()
  const returnTo = location.state?.explorerReturnTo || '/explorer'
  const returnLabel = returnTo.startsWith('/explorer/blocks')
    ? '← Quay lại tất cả block'
    : returnTo.startsWith('/explorer/transactions')
      ? '← Quay lại tất cả giao dịch'
      : '← Quay lại Explorer'

  return (
    <main className="explorer-page explorer-detail-page">
      {/* EXPLORER_PAGINATION_MEMORY_V1 */}
      <Link to={returnTo} className="explorer-back-link">{returnLabel}</Link>
      <header className="explorer-detail-header"><p className="explorer-eyebrow">{eyebrow}</p><h1>{title}</h1></header>
      {loading && <section className="explorer-result"><p className="explorer-empty">Đang tải dữ liệu blockchain...</p></section>}
      {error && <section className="explorer-result explorer-detail-error"><p className="explorer-error" role="alert">{error}</p></section>}
      {!loading && !error && children}
    </main>
  )
}

export function ExplorerBlockDetail() {
  const { blockNumber } = useParams()
  const location = useLocation()
  const [block, setBlock] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setBlock(null)
    setError('')
    getExplorerBlock(blockNumber)
      .then(data => { if (active) setBlock(data) })
      .catch(requestError => { if (active) setError(requestError?.message || 'Không thể tải block này.') })
    return () => { active = false }
  }, [blockNumber])

  return (
    <DetailShell eyebrow="Fabric channel · Chi tiết block" title={block ? `Block ${block.number}` : `Block ${blockNumber}`} loading={!block && !error} error={error}>
      {block && <section className="explorer-result">
        <nav className="explorer-block-navigation" aria-label="Điều hướng block">
          {block.previous_block_number !== null && block.previous_block_number !== undefined
            ? <Link to={`/explorer/blocks/${block.previous_block_number}`} state={location.state}>← Block {block.previous_block_number}</Link>
            : <span />}
          {block.next_block_number !== null && block.next_block_number !== undefined
            ? <Link to={`/explorer/blocks/${block.next_block_number}`} state={location.state}>Block {block.next_block_number} →</Link>
            : <span className="explorer-latest-block-label">Block mới nhất</span>}
        </nav>
        <dl className="explorer-detail-list">
          <div><dt>Số block</dt><dd>{block.number}</dd></div>
          <div><dt>Kênh Fabric</dt><dd>{block.channel || 'mychannel'}</dd></div>
          <div><dt>Loại block</dt><dd><span className="explorer-block-type-badge">{blockTypeLabel(block.block_type)}</span></dd></div>
          <div><dt>Thời điểm giao dịch đầu</dt><dd>{formatDateTime(block.first_transaction_at)}</dd></div>
          <div><dt>Tổng số giao dịch</dt><dd>{block.transaction_count}</dd></div>
          <div>
            <dt>Kết quả xác thực giao dịch</dt>
            <dd>
              {block.validation_summary_available ? (
                <span className="explorer-validation-counts">
                  <span className="explorer-status valid">{block.valid_transaction_count} hợp lệ</span>
                  <span className={`explorer-status ${block.invalid_transaction_count ? 'invalid' : 'muted'}`}>{block.invalid_transaction_count} không hợp lệ</span>
                </span>
              ) : 'Chưa có kết quả xác thực từ peer'}
            </dd>
          </div>
          <div><dt>Giao dịch Graduation</dt><dd>{block.graduation_transaction_count}</dd></div>
          <div><dt>Dung lượng block</dt><dd>{formatBytes(block.size_bytes)}</dd></div>
          {block.creator_msp && <div><dt>Đơn vị tạo block</dt><dd>{block.creator_msp}{block.block_signature_count ? <small className="explorer-action-help">{block.block_signature_count} chữ ký block</small> : null}</dd></div>}
          {/* FABRIC_BLOCK_HASH_V1 */}
          <div><dt>Mã băm block hiện tại</dt><dd className="explorer-mono">{block.block_hash || '---'}</dd></div>
          <div><dt>Mã băm block trước</dt><dd className="explorer-mono">{block.previous_block_hash || 'Block khởi tạo không có block trước'}</dd></div>
        </dl>
        <h2 className="explorer-subheading">Giao dịch trong block</h2>
        {block.transactions?.length ? <div className="explorer-transaction-list">
          {block.transactions.map(transaction => <Link key={transaction.transaction_id} to={`/explorer/transactions/${transaction.transaction_id}`} state={location.state} className="explorer-contained-transaction">
            <span className="explorer-contained-cell"><strong>{transactionOrderLabel(transaction.transaction_index)}</strong><small className="explorer-mono" title={transaction.transaction_id}>{shortValue(transaction.transaction_id)}</small></span>
            <span className="explorer-contained-cell"><strong>{functionLabel(transaction.function_name)}</strong><small>{chaincodeLabel(transaction.chaincode_name)}</small></span>
            <span className="explorer-contained-cell"><strong>{transaction.creator_msp || '---'}</strong><small>Đơn vị gửi</small></span>
            <span className={`explorer-status ${decisionStatusClass(transaction)}`}>{decisionStatusLabel(transaction)}</span>
          </Link>)}
        </div> : <p className="explorer-empty">Block này không có giao dịch để hiển thị.</p>}
      </section>}
    </DetailShell>
  )
}

export function ExplorerTransactionDetail() {
  const { transactionId } = useParams()
  const location = useLocation()
  const [transaction, setTransaction] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getExplorerTransaction(transactionId)
      .then(data => { if (active) setTransaction(data) })
      .catch(requestError => { if (active) setError(requestError?.message || 'Không thể tải giao dịch này.') })
    return () => { active = false }
  }, [transactionId])

  return (
    <DetailShell eyebrow="Hyperledger Fabric · Chi tiết giao dịch" title="Giao dịch Fabric" loading={!transaction && !error} error={error}>
      {transaction && <section className="explorer-result">
        {/* EXPLORER_TRANSACTION_NAVIGATION_V1: transaction labels only, never block labels. */}
        <nav className="explorer-block-navigation" aria-label="Điều hướng giao dịch">
          {transaction.previous_transaction_id
            ? <Link to={`/explorer/transactions/${transaction.previous_transaction_id}`} state={location.state}>← Giao dịch trước</Link>
            : <span />}
          {transaction.next_transaction_id
            ? <Link to={`/explorer/transactions/${transaction.next_transaction_id}`} state={location.state}>Giao dịch sau →</Link>
            : <span className="explorer-latest-block-label">Giao dịch mới nhất</span>}
        </nav>
        <dl className="explorer-detail-list">
          <div><dt>Mã giao dịch</dt><dd className="explorer-mono">{transaction.transaction_id}</dd></div>
          <div><dt>Trạng thái ghi nhận</dt><dd><span className={`explorer-status ${decisionStatusClass(transaction)}`}>{decisionStatusLabel(transaction)}</span></dd></div>
          <div><dt>Block</dt><dd><Link className="explorer-inline-link" to={`/explorer/blocks/${transaction.block_number}`} state={location.state}>{/* EXPLORER_TRANSACTION_BLOCK_NUMBER_NO_HASH_V1 */}{transaction.block_number}</Link></dd></div>
          {/* FABRIC_TRANSACTION_POSITION_FRIENDLY_V1 */}
          <div>
            <dt>Thứ tự giao dịch trong block</dt>
            <dd>{transactionOrderLabel(transaction.transaction_index)}</dd>
          </div>
          <div><dt>Thời điểm giao dịch</dt><dd>{formatDateTime(transaction.timestamp)}</dd></div>
          <div><dt>Kênh Fabric</dt><dd>{transaction.channel}</dd></div>
          <div><dt>Smart contract</dt><dd>{chaincodeLabel(transaction.chaincode_name)}</dd></div>
          {/* FABRIC_TRANSACTION_API_PEER_VALIDATION_V1 */}
          <div><dt>Đơn vị gửi giao dịch</dt><dd>{transaction.creator_msp || 'Chưa đọc được'}</dd></div>
          <div>
            <dt>Tổ chức xác thực</dt>
            <dd>
              {transaction.endorser_msps?.length ? (
                <span className="explorer-endorser-list">
                  {transaction.endorser_msps.map(msp => <span key={msp}>{msp}</span>)}
                  <small>{transaction.endorsement_count} chữ ký xác thực</small>
                </span>
              ) : 'Chưa đọc được'}
            </dd>
          </div>
          {/* FABRIC_VALIDATION_BADGE_V1 */}
          <div>
            <dt>Kết quả xác thực Fabric</dt>
            <dd>
              <span className={`explorer-status ${
                transaction.validation_code === 0
                  ? 'valid'
                  : transaction.validation_code === null || transaction.validation_code === undefined
                    ? 'committed'
                    : 'invalid'
              }`}>
                {validationCodeLabel(transaction)}
              </span>
            </dd>
          </div>
          <div><dt>Kết quả thực thi</dt><dd>{executionStatusLabel(transaction.chaincode_response_status)}</dd></div>
          <div><dt>Hành động</dt><dd>{functionLabel(transaction.function_name)}<small className="explorer-action-help">{functionDescription(transaction.function_name)}</small></dd></div>
          {transaction.student_id && <div><dt>Mã sinh viên</dt><dd>{transaction.student_id}</dd></div>}
          {transaction.source_data_hash && <div><dt>Mã băm dữ liệu nguồn</dt><dd className="explorer-mono">{transaction.source_data_hash}</dd></div>}
        </dl>
      </section>}
    </DetailShell>
  )
}
