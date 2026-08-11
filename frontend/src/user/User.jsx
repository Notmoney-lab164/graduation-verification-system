/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  verifyStudentGraduation,
  sendCertificateOtp,
  verifyCertificateOtp,
  submitCertificateRequest,
} from '../api/students'
import './User.css'

const DEGREE_TYPE_LABELS = {
  Bachelor: 'Cử nhân',
}

const CLASSIFICATION_LABELS = {
  Excellent: 'Xuất sắc',
  'Very Good': 'Giỏi',
  Good: 'Khá',
  Average: 'Trung bình',
  Weak: 'Yếu',
  Poor: 'Yếu',
}

function formatDegreeType(value) {
  return DEGREE_TYPE_LABELS[value] || value || 'Cử nhân'
}

function formatClassification(value) {
  return CLASSIFICATION_LABELS[value] || value || '---'
}

const TRAINING_MODE_LABELS = {
  'Full-time': 'Chính quy',
  'Part-time': 'Không chính quy',
  Distance: 'Đào tạo từ xa',
}

const INSTITUTION_LABELS = {
  'FPT University': 'Trường Đại học FPT',
}

const MAJOR_LABELS = {
  'Artificial Intelligence': 'Trí tuệ nhân tạo',
  'Software Engineering': 'Kỹ thuật phần mềm',
  'Information Assurance': 'An toàn thông tin',
  'Information Technology': 'Công nghệ thông tin',
  'Digital Art Design': 'Thiết kế mỹ thuật số',
  'Business Administration': 'Quản trị kinh doanh',
}

const FACULTY_LABELS = {
  'Faculty of Information Technology': 'Khoa Công nghệ thông tin',
  'School of Information Technology': 'Khoa Công nghệ thông tin',
  'Faculty of Artificial Intelligence': 'Khoa Trí tuệ nhân tạo',
}

function formatTrainingMode(value) {
  return TRAINING_MODE_LABELS[value] || value || '---'
}

function formatInstitutionName(value) {
  return INSTITUTION_LABELS[value] || value || '---'
}

function formatMajor(value) {
  return MAJOR_LABELS[value] || value || '---'
}

function formatFaculty(value) {
  return FACULTY_LABELS[value] || value || '---'
}

function formatDate(value) {
  if (!value) return 'Chưa có'

  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dateOnly) {
    return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`
  }

  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime())
    ? String(value)
    : parsedDate.toLocaleDateString('vi-VN')
}

function formatDateTime(value) {
  if (!value) return 'Chưa có'

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return String(value)

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(parsedDate)
    .replace(',', '')
}

const STUDENT_ID_PATTERN = /^[A-Za-z]{2}[0-9]{6}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_PATTERN = /^[0-9]{6}$/

const emptyCertificateForm = {
  requester_name: '',
  requester_email: '',
  reason: '',
  otp_code: '',
}

function getDefaultCertificateForm(student) {
  return {
    requester_name: student?.full_name || '',
    requester_email: '',
    reason: '',
    otp_code: '',
  }
}

// PUBLIC_STUDENT_ID_PASTE_NORMALIZATION_V1
function normalizeStudentId(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase()
}

function formatGpa(value) {
  if (value === null || value === undefined || value === '') return ''

  const numericValue = Number(value)
  if (Number.isNaN(numericValue)) return value

  return Number.isInteger(numericValue)
    ? numericValue.toFixed(1)
    : String(numericValue)
}

function hasGpaValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function getDetailVerificationState(data) {
  if (!data.is_graduated && !hasGpaValue(data.gpa)) {
    return {
      className: 'banner-warning',
      message: 'Sinh viên hiện chưa tốt nghiệp và chưa có điểm GPA. Hồ sơ đang chờ nhà trường cập nhật kết quả học tập.',
    }
  }

  if (!data.is_graduated && hasGpaValue(data.gpa)) {
    return {
      className: 'banner-error',
      message: 'Hồ sơ đang ghi nhận sinh viên chưa tốt nghiệp nhưng đã có điểm GPA. Vui lòng liên hệ nhà trường để kiểm tra.',
    }
  }

  if (data.verification_status === 'Mismatch') {
    return {
      className: 'banner-error',
      message: 'Một hoặc nhiều thông tin hiện tại không khớp với bản ghi đã được nhà trường xác nhận. Vui lòng liên hệ nhà trường trước khi sử dụng kết quả.',
    }
  }

  if (data.verification_status === 'Verified') {
    return {
      className: 'banner-success',
      message: 'Thông tin hiện tại khớp với bản ghi được chia sẻ trong mạng lưới blockchain được cấp quyền. Lịch sử xác nhận được lưu trên nhiều nút mạng và không thể bị một cá nhân tự ý sửa đổi.',
    }
  }

  return {
    className: 'banner-warning',
    message: 'Hệ thống chưa có đủ thông tin để kết luận kết quả xác minh.',
  }
}

function getApiMessage(error) {
  const message = error?.message

  if (typeof message === 'string') return message
  if (Array.isArray(message)) {
    return message
      .map(item => item?.msg || item?.message || item?.detail)
      .filter(Boolean)
      .join('\n')
  }
  if (message && typeof message === 'object') {
    return message.detail || message.message || JSON.stringify(message)
  }

  return ''
}

function getErrorMessage(error) {
  switch (error?.code) {
    case 'INVALID_STUDENT_ID':
      return 'Mã sinh viên không hợp lệ. Vui lòng nhập 2 chữ cái và 6 chữ số, ví dụ: SE123456.'
    case 'STUDENT_NOT_FOUND':
      // PUBLIC_STUDENT_NOT_FOUND_MESSAGE_V1
      return 'Không tìm thấy mã sinh viên này trong hệ thống quản lý của nhà trường. Vui lòng kiểm tra lại mã đã nhập hoặc liên hệ nhà trường.'
    case 'FABRIC_UNAVAILABLE':
      return 'Hệ thống xác minh đang tạm thời gián đoạn. Vui lòng thử lại sau.'
    case 'NETWORK_ERROR':
      return 'Không thể kết nối đến hệ thống xác minh. Vui lòng thử lại sau.'
    default:
      if (getApiMessage(error).includes('does not exist')) {
        return 'Không tìm thấy thông tin xác nhận của sinh viên trên hệ thống.'
      }
      return 'Không thể xác minh lúc này. Vui lòng thử lại sau.'
  }
}

function getCertificateErrorMessage(error) {
  const message = getApiMessage(error)

  if (error?.code === 'NETWORK_ERROR') {
    return 'Không thể kết nối đến hệ thống. Vui lòng thử lại sau.'
  }
  if (error?.status === 503 || message.toLowerCase().includes('email')) {
    return 'Chưa gửi được mã xác thực qua email. Vui lòng thử lại sau hoặc liên hệ nhà trường.'
  }
  if (error?.status === 400 || message.toLowerCase().includes('otp')) {
    return 'Mã xác thực (OTP) không đúng hoặc đã hết hạn.'
  }
  if (error?.status === 409 || message.toLowerCase().includes('already')) {
    return 'Yêu cầu này đã tồn tại hoặc thông tin đã bị trùng.'
  }

  return message || 'Không thể gửi yêu cầu lúc này. Vui lòng thử lại.'
}

function getVerificationBadge(status, data = null) {
  if (data && !data.is_graduated) {
    if (!hasGpaValue(data.gpa)) {
      return {
        label: 'Chưa tốt nghiệp • Chưa có GPA',
        className: 'badge-pending',
      }
    }

    return {
      label: 'Cần kiểm tra lại',
      className: 'badge-mismatch',
    }
  }

  switch (status) {
    case 'Verified':
      return { label: 'Thông tin hợp lệ', className: 'badge-verified' }
    case 'Mismatch':
      return { label: 'Cần kiểm tra lại', className: 'badge-mismatch' }
    case 'Not Registered':
    case 'Not Found':
      return { label: 'Chưa có dữ liệu xác nhận', className: 'badge-notfound' }
    default:
      return { label: status || 'Chưa xác định', className: 'badge-notfound' }
  }
}

function DegreeCertificate({ data }) {
  return (
    <div className="degree-card">
      <div className="degree-corner degree-corner-top-left" aria-hidden="true" />
      <div className="degree-corner degree-corner-top-right" aria-hidden="true" />

      <div className="degree-header">
        <div className="degree-seal" aria-hidden="true">🎓</div>
        <p className="degree-university">{formatInstitutionName(data.institution_name)}</p>
        <p className="degree-title">BẰNG TỐT NGHIỆP</p>
        <p className="degree-type">{formatDegreeType(data.degree_type)}</p>
      </div>

      <div className="degree-body">
        <p className="degree-label">Chứng nhận</p>
        <p className="degree-name">{data.full_name}</p>
        <p className="degree-student-id">Mã số sinh viên: {data.student_id}</p>
        <div className="degree-program">
          <p className="degree-label">Đã hoàn thành chương trình</p>
          <p className="degree-major">{formatMajor(data.major)}</p>
          <p className="degree-faculty">Khoa: {formatFaculty(data.faculty_name)}</p>
        </div>
      </div>

      <div className="degree-footer">
        <div className="degree-footer-item">
          <span className="degree-footer-label">Điểm trung bình (GPA)</span>
          <span className="degree-footer-value">{formatGpa(data.gpa)}</span>
        </div>
        <div className="degree-footer-divider" />
        <div className="degree-footer-item">
          <span className="degree-footer-label">Xếp loại</span>
          <span className="degree-footer-value">{formatClassification(data.classification)}</span>
        </div>
        <div className="degree-footer-divider" />
        <div className="degree-footer-item">
          <span className="degree-footer-label">Năm tốt nghiệp</span>
          <span className="degree-footer-value">{data.graduation_year}</span>
        </div>
      </div>

      <div className="degree-verified-stamp">
        <span aria-hidden="true">✓</span>
        <span>Thông tin hợp lệ và không bị thay đổi</span>
      </div>
    </div>
  )
}

function DetailModal({ data, onClose }) {
  const badge = getVerificationBadge(data.verification_status, data)
  const detailState = getDetailVerificationState(data)
  const showVerificationDetails =
    data.is_graduated &&
    ['Verified', 'Mismatch'].includes(data.verification_status)
  const transactionId =
    data.blockchain_tx_id || data.transaction_id || data.tx_id || ''
  const metadataHash =
    data.metadata_hash_blockchain ||
    data.blockchain_hash ||
    data.metadata_hash ||
    ''
  const currentMetadataHash =
    data.metadata_hash_mysql || data.current_metadata_hash || ''
  const blockNumber = data.block_number ?? data.blockNumber ?? null
  const recordedAt =
    data.blockchain_recorded_at ||
    data.recorded_at ||
    data.blockchain_timestamp ||
    ''
  const channelName =
    data.blockchain_channel || data.channel_name || data.channel || ''
  const chaincodeName =
    data.chaincode_name || data.chaincode || data.smart_contract || ''

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail-modal" onClick={e => e.stopPropagation()}>
        <div className="detail-modal-header">
          <h2>Thông tin chi tiết sinh viên</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Đóng cửa sổ chi tiết"
          >
            ×
          </button>
        </div>

        <div className="detail-modal-body">
          <div className={`detail-verify-banner ${detailState.className}`}>
            <span className={`verify-badge ${badge.className}`}>{badge.label}</span>
            <p>{detailState.message}</p>
          </div>

          <div className="detail-section">
            <h3>Thông tin cá nhân</h3>
            <div className="detail-grid">
              <div className="detail-row">
                <span className="detail-label">Mã sinh viên</span>
                <span className="detail-value">{data.student_id}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Họ và tên</span>
                <span className="detail-value">{data.full_name}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h3>Thông tin học vấn</h3>
            <div className="detail-grid">
              <div className="detail-row">
                <span className="detail-label">Trường</span>
                <span className="detail-value">{formatInstitutionName(data.institution_name)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Khoa</span>
                <span className="detail-value">{formatFaculty(data.faculty_name)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Chuyên ngành</span>
                <span className="detail-value">{formatMajor(data.major)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Hệ đào tạo</span>
                <span className="detail-value">{formatTrainingMode(data.training_mode)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Loại bằng</span>
                <span className="detail-value">{formatDegreeType(data.degree_type)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Khóa nhập học</span>
                <span className="detail-value">{data.entrance_year}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h3>Kết quả tốt nghiệp</h3>
            <div className="detail-grid">
              <div className="detail-row">
                <span className="detail-label">Trạng thái</span>
                <span className="detail-value">
                  {data.graduation_status === 'GRADUATED' ? 'Đã tốt nghiệp' : 'Chưa tốt nghiệp'}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Ngày tốt nghiệp</span>
                <span className="detail-value">
                  {data.is_graduated ? formatDate(data.graduation_date) : 'Chưa có'}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Năm tốt nghiệp</span>
                <span className="detail-value">{data.is_graduated ? data.graduation_year : 'Chưa có'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Điểm trung bình (GPA)</span>
                <span className="detail-value">
                  {hasGpaValue(data.gpa) ? formatGpa(data.gpa) : 'Chưa có'}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Xếp loại</span>
                <span className="detail-value">
                  {data.is_graduated
                    ? formatClassification(data.classification)
                    : 'Chưa có'}
                </span>
              </div>
            </div>
          </div>

          {showVerificationDetails && (
            <div className={`detail-section detail-section-blockchain ${
              data.verification_status === 'Mismatch'
                ? 'detail-section-blockchain-mismatch'
                : ''
            }`}>
              <h3>Thông tin xác minh trên blockchain</h3>
              <div className="detail-grid">
                <div className="detail-row">
                  <span className="detail-label">Kết quả đối chiếu</span>
                  <span className="detail-value">
                    <span className={`verify-badge ${badge.className}`}>{badge.label}</span>
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Thời điểm kiểm tra</span>
                  <span className="detail-value">
                    {formatDateTime(data.verified_at)}
                  </span>
                </div>
                {transactionId && (
                  <div className="detail-row">
                    <span className="detail-label">Mã giao dịch</span>
                    <span className="detail-value detail-ledger-value">
                      {transactionId}
                    </span>
                  </div>
                )}
                {data.verification_status === 'Mismatch' && currentMetadataHash && (
                  <div className="detail-row">
                    <span className="detail-label">Mã băm dữ liệu hiện tại</span>
                    <span className="detail-value detail-ledger-value">
                      {currentMetadataHash}
                    </span>
                  </div>
                )}
                {metadataHash && (
                  <div className="detail-row">
                    <span className="detail-label">{data.verification_status === 'Mismatch' ? 'Mã băm đã xác nhận' : 'Mã băm dữ liệu'}</span>
                    <span className="detail-value detail-ledger-value">
                      {metadataHash}
                    </span>
                  </div>
                )}
                {blockNumber !== null && blockNumber !== undefined && (
                  <div className="detail-row">
                    <span className="detail-label">Số khối</span>
                    <span className="detail-value">{blockNumber}</span>
                  </div>
                )}
                {recordedAt && (
                  <div className="detail-row">
                    <span className="detail-label">Thời điểm ghi nhận</span>
                    <span className="detail-value">{formatDateTime(recordedAt)}</span>
                  </div>
                )}
                {channelName && (
                  <div className="detail-row">
                    <span className="detail-label">Kênh blockchain</span>
                    <span className="detail-value detail-ledger-value">
                      {channelName}
                    </span>
                  </div>
                )}
                {chaincodeName && (
                  <div className="detail-row">
                    <span className="detail-label">Hợp đồng thông minh</span>
                    <span className="detail-value detail-ledger-value">
                      {chaincodeName}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {!data.is_graduated && (
            <div className="detail-note">
              Yêu cầu giấy xác nhận tốt nghiệp: <strong>Không khả dụng</strong> vì sinh viên chưa tốt nghiệp.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// CERTIFICATE_REQUEST_REVIEW_FLOW_V1
function CertificateRequestForm({
  certificateForm,
  certificateStep,
  certificateLoading,
  certificateToken,
  certificateError,
  certificateMessage,
  updateCertificateField,
  handleSendCertificateOtp,
  handleVerifyCertificateOtp,
  handleSubmitCertificateRequest,
  resetCertificateRequest,
}) {
  if (certificateStep === 'submitted') {
    return (
      <section className="certificate-request-card certificate-request-wide certificate-request-done">
        <div className="certificate-request-heading">
          <div>
            <p className="certificate-request-eyebrow">Xác thực email</p>
            <h2>Yêu cầu đã được gửi đến nhà trường</h2>
          </div>
          <span className="certificate-step-badge">Đã gửi yêu cầu</span>
        </div>

        <div className="certificate-done-box">
          <strong>Nhà trường đã nhận yêu cầu cấp giấy xác nhận tốt nghiệp.</strong>
          <p>
            Kết quả xử lý sẽ được gửi đến địa chỉ email bạn đã xác thực.
          </p>
        </div>

        <div className="certificate-actions">
          <button
            type="button"
            className="reset-request-btn"
            onClick={resetCertificateRequest}
          >
            Làm mới biểu mẫu
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="certificate-request-card certificate-request-wide">
      <div className="certificate-request-heading">
        <div>
          <p className="certificate-request-eyebrow">Xác thực email</p>
          <h2>Gửi yêu cầu giấy xác nhận tốt nghiệp</h2>
        </div>
        <span className="certificate-step-badge">
          {certificateStep === 'submitted'
            ? 'Đã gửi yêu cầu'
            : certificateToken
              ? 'Đã xác thực email'
              : certificateStep === 'otp_sent'
                ? 'Chờ nhập OTP'
                : 'Bước 1: Nhận OTP'}
        </span>
      </div>

      <div className="certificate-request-copy">
        Sinh viên nhập email trường để nhận OTP. Sau khi xác thực, hệ thống gửi yêu cầu cho nhà trường xử lý cấp giấy xác nhận.
      </div>

      <div className="certificate-request-grid">
        <label className="certificate-request-field">
          <span>Họ tên người yêu cầu</span>
          <input
            value={certificateForm.requester_name}
            onChange={e => updateCertificateField('requester_name', e.target.value)}
            placeholder="Họ và tên đầy đủ"
            disabled={certificateStep === 'submitted'}
          />
        </label>

        <label className="certificate-request-field">
          <span>Email trường nhận OTP</span>
          <input
            type="email"
            value={certificateForm.requester_email}
            onChange={e => updateCertificateField('requester_email', e.target.value)}
            placeholder="Email trường do hệ thống cung cấp"
            disabled={certificateStep === 'submitted'}
          />
        </label>

        <label className="certificate-request-field certificate-request-full">
          <span>Mục đích sử dụng giấy xác nhận</span>
          <textarea
            value={certificateForm.reason}
            onChange={e => updateCertificateField('reason', e.target.value)}
            placeholder="Ví dụ: Bổ sung hồ sơ xin việc tại Công ty ABC."
            disabled={certificateStep === 'submitted'}
          />
        </label>

        {certificateStep !== 'idle' && (
          <label className="certificate-request-field">
            <span>Mã xác thực (OTP)</span>
            <input
              value={certificateForm.otp_code}
              onChange={e => updateCertificateField('otp_code', e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Nhập 6 chữ số"
              inputMode="numeric"
              maxLength={6}
              disabled={certificateStep === 'submitted' || Boolean(certificateToken)}
            />
          </label>
        )}
      </div>

      {certificateError && (
        <p className="certificate-message error">{certificateError}</p>
      )}
      {certificateMessage && (
        <p className="certificate-message success">{certificateMessage}</p>
      )}

      {certificateStep !== 'submitted' && (
        <div className="certificate-actions">
          <button
            type="button"
            className="otp-btn"
            onClick={handleSendCertificateOtp}
            disabled={certificateLoading}
          >
            {certificateStep === 'idle' ? 'Gửi mã xác thực' : 'Gửi lại mã xác thực'}
          </button>

          {certificateStep === 'otp_sent' && !certificateToken && (
            <button
              type="button"
              className="verify-otp-btn"
              onClick={handleVerifyCertificateOtp}
              disabled={certificateLoading}
            >
              Xác thực mã
            </button>
          )}

          {certificateToken && (
            <button
              type="button"
              className="submit-certificate-btn"
              onClick={handleSubmitCertificateRequest}
              disabled={certificateLoading}
            >
              Gửi yêu cầu cho nhà trường
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function User() {
  const [studentId, setStudentId] = useState('')
  const [verification, setVerification] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [certificateForm, setCertificateForm] = useState(emptyCertificateForm)
  const [certificateToken, setCertificateToken] = useState('')
  const [certificateStep, setCertificateStep] = useState('idle')
  const [certificateLoading, setCertificateLoading] = useState(false)
  const [certificateMessage, setCertificateMessage] = useState('')
  const [certificateError, setCertificateError] = useState('')

  const normalizedId = useMemo(() => normalizeStudentId(studentId), [studentId])
  const isValidId = STUDENT_ID_PATTERN.test(normalizedId)

  function resetCertificateRequest(student = verification) {
    setCertificateForm(getDefaultCertificateForm(student))
    setCertificateToken('')
    setCertificateStep('idle')
    setCertificateMessage('')
    setCertificateError('')
  }

  function updateCertificateField(field, value) {
    setCertificateForm(prev => ({ ...prev, [field]: value }))
    setCertificateError('')
    setCertificateMessage('')

    if (field === 'requester_email' || field === 'otp_code') {
      setCertificateToken('')
      setCertificateStep(field === 'requester_email' ? 'idle' : certificateStep)
    }
  }

  function validateCertificateBase() {
    if (!verification?.student_id) {
      return 'Vui lòng tra cứu sinh viên trước khi gửi yêu cầu.'
    }
    if (!certificateForm.requester_name.trim()) {
      return 'Vui lòng nhập họ tên người yêu cầu.'
    }
    if (!EMAIL_PATTERN.test(certificateForm.requester_email.trim())) {
      return 'Vui lòng nhập email trường hợp lệ.'
    }
    if (!certificateForm.reason.trim()) {
      return 'Vui lòng nhập mục đích sử dụng giấy xác nhận.'
    }
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setVerification(null)
    setErrorMessage('')
    setShowDetail(false)
    resetCertificateRequest()

    if (!isValidId) {
      setErrorMessage('Mã sinh viên phải gồm 2 chữ cái và 6 chữ số, ví dụ: SE123456.')
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 10000)

    try {
      setIsLoading(true)
      const data = await verifyStudentGraduation(normalizedId, controller.signal)
      setVerification(data)
      setCertificateForm(getDefaultCertificateForm(data))
    } catch (error) {
      if (error.name === 'AbortError') {
        setErrorMessage('Yêu cầu quá lâu. Vui lòng thử lại.')
      } else {
        setErrorMessage(getErrorMessage(error))
      }
    } finally {
      window.clearTimeout(timeoutId)
      setIsLoading(false)
    }
  }

  async function handleSendCertificateOtp() {
    const validationError = validateCertificateBase()
    if (validationError) {
      setCertificateError(validationError)
      return
    }

    try {
      setCertificateLoading(true)
      setCertificateError('')
      setCertificateMessage('')
      await sendCertificateOtp(
        verification.student_id,
        certificateForm.requester_email.trim()
      )
      setCertificateStep('otp_sent')
      setCertificateToken('')
      setCertificateMessage('Đã gửi mã OTP đến email trường. Vui lòng kiểm tra hộp thư.')
    } catch (error) {
      setCertificateError(getCertificateErrorMessage(error))
    } finally {
      setCertificateLoading(false)
    }
  }

  async function handleVerifyCertificateOtp() {
    if (certificateToken) {
      setCertificateError('')
      setCertificateMessage('Email trường đã được xác thực rồi. Bạn có thể gửi yêu cầu cho admin.')
      return
    }

    const validationError = validateCertificateBase()
    if (validationError) {
      setCertificateError(validationError)
      return
    }
    if (!OTP_PATTERN.test(certificateForm.otp_code.trim())) {
      setCertificateError('Mã xác thực (OTP) phải gồm 6 chữ số.')
      return
    }

    try {
      setCertificateLoading(true)
      setCertificateError('')
      setCertificateMessage('')
      const result = await verifyCertificateOtp(
        verification.student_id,
        certificateForm.requester_email.trim(),
        certificateForm.otp_code.trim()
      )
      setCertificateToken(result.email_verification_token)
      setCertificateStep('otp_verified')
      setCertificateMessage('Email trường đã được xác thực. Bạn có thể gửi yêu cầu cho admin.')
    } catch (error) {
      setCertificateError(getCertificateErrorMessage(error))
    } finally {
      setCertificateLoading(false)
    }
  }

  async function handleSubmitCertificateRequest() {
    const validationError = validateCertificateBase()
    if (validationError) {
      setCertificateError(validationError)
      return
    }
    if (!certificateToken) {
      setCertificateError('Vui lòng xác thực OTP trước khi gửi yêu cầu.')
      return
    }

    try {
      setCertificateLoading(true)
      setCertificateError('')
      setCertificateMessage('')
      await submitCertificateRequest({
        student_id: verification.student_id,
        requester_name: certificateForm.requester_name.trim(),
        requester_email: certificateForm.requester_email.trim(),
        reason: certificateForm.reason.trim(),
        email_verification_token: certificateToken,
      })
      setCertificateStep('submitted')
      setCertificateMessage('Đã gửi yêu cầu cho nhà trường. Vui lòng chờ nhà trường xử lý.')
    } catch (error) {
      setCertificateError(getCertificateErrorMessage(error))
    } finally {
      setCertificateLoading(false)
    }
  }

  const badge = verification ? getVerificationBadge(verification.verification_status, verification) : null
  const canShowDetail = verification &&
    !['Not Found', 'Not Registered'].includes(verification.verification_status)
  const canRequestCertificate = canShowDetail &&
    verification?.is_graduated &&
    verification?.verification_status === 'Verified'

  return (
    <main className="app-shell">
      <div className={`page-layout ${
          verification?.is_graduated && verification?.verification_status === 'Verified'
            ? 'has-degree'
            : ''
        }`}>
        <section className="verify-panel">
          <div className="panel-header panel-header-with-explorer">
            <div>
              <p className="eyebrow">Xác minh tốt nghiệp</p>
              <h1>Xác minh tốt nghiệp sinh viên</h1>
            </div>
            {/* FABRIC_EXPLORER_V1 */}
            <Link to="/explorer" className="user-explorer-link">
              Tra cứu blockchain →
            </Link>
          </div>

          <form className="verify-form" onSubmit={handleSubmit}>
            <label htmlFor="studentId">Mã sinh viên</label>
            <div className="input-row">
              <input
                id="studentId"
                value={studentId}
                onChange={e => setStudentId(
                  normalizeStudentId(e.target.value).slice(0, 8)
                )}
                placeholder="Nhập mã số sinh viên"
                autoComplete="off"
                autoCapitalize="characters"
              />
              {/* USER_ICON_SEARCH_BUTTON_V1 */}
              <button
                type="submit"
                className="user-search-button"
                disabled={isLoading}
                aria-label={isLoading ? 'Đang kiểm tra' : 'Tìm kiếm sinh viên'}
                title={isLoading ? 'Đang kiểm tra' : 'Tìm kiếm sinh viên'}
              >
                {isLoading ? (
                  <span className="user-search-spinner" aria-hidden="true" />
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="11" cy="11" r="6.5" />
                    <path d="m16 16 4.25 4.25" />
                  </svg>
                )}
              </button>
            </div>
          </form>

          {errorMessage && (
            <div className="result-box result-error" role="alert">
              <strong>
                {errorMessage.includes('Không tìm thấy mã sinh viên')
                  ? 'Không tìm thấy sinh viên'
                  : 'Không thể xác minh'}
              </strong>
              <p>{errorMessage}</p>
            </div>
          )}

          {verification && (
            <div className={`result-box ${
              !verification.is_graduated && !hasGpaValue(verification.gpa)
                ? 'result-warning'
                : verification.verification_status === 'Verified'
                  ? (verification.is_graduated ? 'result-success' : 'result-warning')
                  : verification.verification_status === 'Mismatch'
                    ? 'result-error'
                    : 'result-warning'
            }`}>
              <div className="result-top">
                <strong>
                  {!verification.is_graduated && !hasGpaValue(verification.gpa)
                    ? '○ Chưa có kết quả tốt nghiệp'
                    : verification.verification_status === 'Mismatch'
                      ? '⚠ Thông tin chưa khớp với dữ liệu xác nhận'
                      : verification.is_graduated
                        ? '✓ Đã tốt nghiệp'
                        : '○ Chưa tốt nghiệp'}
                </strong>
                <span className={`verify-badge ${badge.className}`}>{badge.label}</span>
              </div>

              {!verification.is_graduated && !hasGpaValue(verification.gpa) ? (
                <p className="pending-result-message">
                  Sinh viên hiện chưa được xác nhận tốt nghiệp và chưa có điểm GPA.
                  Đây là trạng thái đang chờ nhà trường cập nhật, không phải cảnh báo
                  dữ liệu bị thay đổi.
                </p>
              ) : verification.verification_status === 'Mismatch' ? (
                <p role="alert">
                  Một hoặc nhiều thông tin hiện tại đã bị thay đổi so với dữ liệu
                  được nhà trường xác nhận. Vui lòng liên hệ nhà trường để kiểm tra
                  trước khi sử dụng kết quả này.
                </p>
              ) : null}

              <dl>
                <div>
                  <dt>Mã sinh viên</dt>
                  <dd>{verification.student_id}</dd>
                </div>
                <div>
                  <dt>Họ và tên</dt>
                  <dd>{verification.full_name}</dd>
                </div>
                <div>
                  <dt>Trường</dt>
                  <dd>{formatInstitutionName(verification.institution_name)}</dd>
                </div>
                <div>
                  <dt>Chuyên ngành</dt>
                  <dd>{formatMajor(verification.major)}</dd>
                </div>
                {verification.is_graduated && (
                  <>
                    <div>
                      <dt>Năm tốt nghiệp</dt>
                      <dd>{verification.graduation_year}</dd>
                    </div>
                    <div>
                      <dt>Điểm trung bình (GPA)</dt>
                      <dd>{formatGpa(verification.gpa)}</dd>
                    </div>
                    <div>
                      <dt>Xếp loại</dt>
                      <dd>{formatClassification(verification.classification)}</dd>
                    </div>
                  </>
                )}
              </dl>

              {canShowDetail && (
                <button
                  type="button"
                  className="detail-btn"
                  onClick={() => setShowDetail(true)}
                >
                  Xem chi tiết →
                </button>
              )}
            </div>
          )}
        </section>

        {verification?.is_graduated &&
          verification?.verification_status === 'Verified' && (
          <section className="degree-panel">
            <DegreeCertificate data={verification} />
          </section>
        )}

        {canRequestCertificate && (
          <CertificateRequestForm
            certificateForm={certificateForm}
            certificateStep={certificateStep}
            certificateLoading={certificateLoading}
            certificateToken={certificateToken}
            certificateError={certificateError}
            certificateMessage={certificateMessage}
            updateCertificateField={updateCertificateField}
            handleSendCertificateOtp={handleSendCertificateOtp}
            handleVerifyCertificateOtp={handleVerifyCertificateOtp}
            handleSubmitCertificateRequest={handleSubmitCertificateRequest}
            resetCertificateRequest={resetCertificateRequest}
          />
        )}
      </div>

      {showDetail && verification && (
        <DetailModal data={verification} onClose={() => setShowDetail(false)} />
      )}
    </main>
  )
}

export default User
