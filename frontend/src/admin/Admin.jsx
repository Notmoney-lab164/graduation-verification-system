import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Routes, Route, Link, useLocation } from 'react-router-dom'
import { 
    getDashboardStats, 
    getStudents, 
    getStudent,
    validateStudentData,
    createStudent, 
    approveStudentBlockchain,
    rejectStudentBlockchain,
    updateStudent,
    deleteStudent,
    restoreStudent,
    getExternalRequests,
    importExternalVerificationFile,
    approveExternalRequest,
    rejectExternalRequest,
    archiveExternalRequest,
    restoreExternalRequest,
    getCertificateRequests,
    approveCertificateRequest,
    rejectCertificateRequest,
    getCertificatePrintData,
    getAuditLogs
} from '../api/students' // Đổi đường dẫn này cho đúng với tên file API của bạn
import './Admin.css'

/* ADMIN_CUSTOM_FEEDBACK_AND_DECISION_STATUS_V1 */
const ADMIN_NOTICE_ROOT_ID = 'admin-notice-region'

function adminNoticeTone(message, requestedTone = '') {
  if (requestedTone) return requestedTone
  const text = String(message || '').toLowerCase()
  return text.includes('không thể') || text.includes('lỗi') || text.includes('thất bại')
    ? 'error'
    : 'success'
}

function showAdminNotice(message, requestedTone = '') {
  const root = document.getElementById(ADMIN_NOTICE_ROOT_ID) || document.body.appendChild(
    Object.assign(document.createElement('div'), { id: ADMIN_NOTICE_ROOT_ID, className: 'admin-notice-region' })
  )
  const notice = document.createElement('section')
  const tone = adminNoticeTone(message, requestedTone)
  notice.className = `admin-notice admin-notice-${tone}`
  notice.setAttribute('role', 'status')
  notice.setAttribute('aria-live', 'polite')

  const title = document.createElement('strong')
  title.textContent = tone === 'error'
    ? 'Không thể thực hiện thao tác'
    : tone === 'rejected'
      ? 'Đã ghi nhận từ chối'
      : 'Thao tác thành công'
  const content = document.createElement('p')
  content.textContent = String(message || '')
  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'admin-notice-close'
  closeButton.setAttribute('aria-label', 'Đóng thông báo')
  closeButton.textContent = '×'
  const remove = () => notice.remove()
  closeButton.addEventListener('click', remove)

  notice.append(title, content, closeButton)
  root.appendChild(notice)
  window.setTimeout(remove, 7000)
}

function requestAdminConfirmation(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'admin-confirm-overlay'
    const dialog = document.createElement('section')
    dialog.className = 'admin-confirm-dialog'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-labelledby', 'admin-confirm-title')

    const title = document.createElement('h2')
    title.id = 'admin-confirm-title'
    title.textContent = 'Xác nhận thao tác'
    const content = document.createElement('p')
    content.textContent = String(message || '')
    const actions = document.createElement('div')
    actions.className = 'admin-confirm-actions'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'admin-confirm-cancel'
    cancel.textContent = 'Hủy'
    const accept = document.createElement('button')
    accept.type = 'button'
    accept.className = 'admin-confirm-accept'
    accept.textContent = 'Xác nhận'

    const finish = value => {
      document.removeEventListener('keydown', onKeyDown)
      overlay.remove()
      resolve(value)
    }
    const onKeyDown = event => {
      if (event.key === 'Escape') finish(false)
    }
    cancel.addEventListener('click', () => finish(false))
    accept.addEventListener('click', () => finish(true))
    overlay.addEventListener('click', event => {
      if (event.target === overlay) finish(false)
    })
    document.addEventListener('keydown', onKeyDown)

    actions.append(cancel, accept)
    dialog.append(title, content, actions)
    overlay.appendChild(dialog)
    document.body.appendChild(overlay)
    accept.focus()
  })
}




function normalizeAuditHistoryDetail(
  value,
  { gpaRestored = false } = {},
) {
  let detail = String(value ?? '').trim()

  const studentIdMatch = detail.match(
    /^Mã số sinh viên:\s*([A-Z0-9]+)\s*-\s*/i,
  )
  const studentId = studentIdMatch?.[1] || ''

  // Một số bản ghi cũ đã chứa MSSV trong nội dung, trong khi giao diện
  // cũng thêm MSSV một lần nữa. Chỉ giữ lại đúng một tiền tố.
  detail = detail.replace(
    /^(?:Mã số sinh viên:\s*[A-Z0-9]+\s*-\s*)+/i,
    '',
  )

  // Sửa cách hiển thị các bản ghi cũ từng lưu nhầm tuple Python, ví dụ:
  // ('GPA: từ "3.0" thành "3.1"', {'gpa'}).
  detail = detail.replace(
    /Đã cập nhật:\s*\(\s*(['"])(.*?)\1\s*,\s*\{[^}]*\}\s*\)\.?/i,
    'Đã cập nhật: $2.',
  )

  detail = detail.replace(
    /Đã cập nhật:\s*Không có giá trị nào thay đổi\.?/i,
    'Đã lưu lại hồ sơ; không có thông tin nào thay đổi.',
  )

  // Admin chỉ cần xem kết quả nghiệp vụ, không cần thuật ngữ kỹ thuật.
  detail = detail.replace(
    /Đối chiếu với Blockchain:/gi,
    'Kết quả đối chiếu dữ liệu:',
  )

  const gpaTransition = detail.match(
    /GPA:\s*từ\s*"([^"]+)"\s*thành\s*"([^"]+)"/i,
  )

  if (gpaTransition) {
    const [, oldGpa, newGpa] = gpaTransition
    const classificationTransition = detail.match(
      /Xếp loại:\s*từ\s*"([^"]+)"\s*thành\s*"([^"]+)"/i,
    )

    if (gpaRestored) {
      detail = (
        `Điểm GPA đã được đưa về "${newGpa}", đúng với thông tin đã xác nhận. ` +
        'Hiện tại điểm GPA không có sự thay đổi so với dữ liệu gốc.'
      )
    } else {
      detail = (
        `Điểm GPA đã bị thay đổi từ "${oldGpa}" thành "${newGpa}". ` +
        'Điểm hiện tại khác với thông tin đã xác nhận.'
      )
    }

    if (classificationTransition) {
      const [, oldClassification, newClassification] = classificationTransition
      detail += gpaRestored
        ? ` Xếp loại hiện tại là "${newClassification}".`
        : (
            ` Xếp loại tự động thay đổi từ "${oldClassification}"` +
            ` thành "${newClassification}".`
          )
    }
  } else {
    // Với thay đổi thông tin cá nhân, chỉ hiển thị trường đã thay đổi.
    detail = detail.replace(
      /\s*\.?\s*Kết quả đối chiếu dữ liệu:\s*(?:Không khớp|Khớp)\.?\s*$/i,
      '',
    )
  }

  detail = detail.replace(/\s+\./g, '.').trim()

  if (!studentId || !detail) {
    return studentId ? `Mã số sinh viên: ${studentId}` : detail
  }

  return `Mã số sinh viên: ${studentId} - ${detail}`
}

const FACULTY_MAJOR_OPTIONS = {
    'Công nghệ thông tin': [
        'Công nghệ thông tin',
        'Kỹ thuật phần mềm',
        'Trí tuệ nhân tạo',
        'Khoa học dữ liệu ứng dụng',
        'An toàn thông tin',
        'Thiết kế vi mạch bán dẫn',
        'Công nghệ ô tô số',
        'Hệ thống thông tin',
        'Thiết kế đồ họa và mỹ thuật số',
        'Robot và Trí tuệ nhân tạo (Định hướng UAV và Humanoid)',
    ],
    'Công nghệ truyền thông': [
        'Truyền thông đa phương tiện',
        'Quan hệ công chúng',
        'Truyền thông Marketing tích hợp',
        'Truyền thông thương hiệu',
    ],
    'Ngôn ngữ': [
        'Ngôn ngữ Anh',
        'Tiếng Anh thương mại',
        'Ngôn ngữ Hàn Quốc',
        'Tiếng Hàn thương mại',
        'Ngôn ngữ Trung Quốc',
        'Tiếng Trung thương mại',
    ],
    'Luật': [
        'Luật',
        'Luật kinh tế',
    ],
    'Quản trị kinh doanh': [
        'Marketing',
        'Kinh doanh quốc tế',
        'Thương mại điện tử',
        'Quản trị kinh doanh',
        'Quản trị giải trí và sự kiện',
        'Quản trị trải nghiệm khách hàng',
        'Quản trị mua hàng',
        'Quản trị khách sạn',
        'Quản trị dịch vụ du lịch và lữ hành',
        'Phân tích kinh doanh (Business Analytics)',
        'Logistics và Quản lý chuỗi cung ứng toàn cầu',
        'Công nghệ tài chính (Fintech)',
        'Tài chính doanh nghiệp',
        'Tài chính thông minh',
        'Tài chính ngân hàng',
    ],
    'Khoa học máy tính': [
        'Trí tuệ nhân tạo và Khoa học dữ liệu',
        'An ninh mạng và an toàn số',
    ],
}

const FACULTY_OPTIONS = Object.keys(FACULTY_MAJOR_OPTIONS)

function getFacultyDisplayName(value) {
    if (value === 'Information Technology') {
        return 'Công nghệ thông tin'
    }

    return value
}

const toDisplayDate = (value) => {
    if (!value) return ''

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-')
        return `${day}/${month}/${year}`
    }

    return value
}

const formatVietnamDateTime = (value) => {
    if (!value) return ''

    const rawValue = String(value)
    const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(rawValue)
    const date = new Date(hasTimezone ? rawValue : `${rawValue}Z`)

    if (Number.isNaN(date.getTime())) return rawValue

    const vietnamTime = new Date(
        date.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })
    )
    const pad = (number) => String(number).padStart(2, '0')

    const hours = pad(vietnamTime.getHours())
    const minutes = pad(vietnamTime.getMinutes())
    const seconds = pad(vietnamTime.getSeconds())
    const day = pad(vietnamTime.getDate())
    const month = pad(vietnamTime.getMonth() + 1)
    const year = vietnamTime.getFullYear()

    return `${hours}:${minutes}:${seconds} ${day}/${month}/${year}`
}

const formatVietnamDateOnly = (value) => {
    if (!value) return ''

    const rawValue = String(value)
    const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(rawValue)
    const date = new Date(hasTimezone ? rawValue : `${rawValue}Z`)

    if (Number.isNaN(date.getTime())) return rawValue

    const vietnamTime = new Date(
        date.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })
    )
    const pad = (number) => String(number).padStart(2, '0')

    const day = pad(vietnamTime.getDate())
    const month = pad(vietnamTime.getMonth() + 1)
    const year = vietnamTime.getFullYear()

    return `${day}/${month}/${year}`
}


const translateErrorMessage = (message) => {
    let text = ''

    if (Array.isArray(message)) {
        text = message
            .map((item) => {
                const field = item.loc?.[item.loc.length - 1] || 'dữ liệu'
                const msg = item.msg
    
            if (
                field === 'citizen_id' &&
                (
                    msg === 'String should have at least 12 characters' ||
                    msg === 'String should have at most 12 characters' ||
                    msg.includes('String should match pattern')
                )
            ) {
                return 'Số CCCD/CMND phải đúng 12 số.'
            }
    
                return `${field}: ${msg}`
            })
            .join('\n')
    }
    else if (message && typeof message === 'object') {
        if (message.detail) {
            return translateErrorMessage(message.detail)
        }

        if (message.message) {
            return translateErrorMessage(message.message)
        }

        text = JSON.stringify(message, null, 2)
    } else {
        text = String(message || '').replace(/^"|"$/g, '')
    }

    const errorMap = {
        'Student already exists': 'Mã số sinh viên đã tồn tại.',
        'Email already exists': 'Email đã tồn tại.',
        'Citizen ID already exists': 'Số CCCD/CMND đã tồn tại.',
        'Degree already exists': 'Mã bằng đã tồn tại.',
        'Student not found': 'Không tìm thấy sinh viên.',
        'Student private data is incomplete. Cannot print confirmation document.':
            'Không thể in giấy xác nhận vì sinh viên còn thiếu Số CCCD/CMND. Vui lòng cập nhật Số CCCD/CMND trước.',
        'Student data is not verified on blockchain. Cannot print confirmation document.':
            'Không thể in giấy xác nhận vì dữ liệu sinh viên chưa khớp với blockchain. Vui lòng kiểm tra và đồng bộ lại dữ liệu sinh viên trước.',
        'Student data is not verified on blockchain. Cannot create certificate request.':
            'Không thể tạo yêu cầu cấp giấy vì dữ liệu sinh viên chưa khớp với blockchain.',
        'Blockchain verification is unavailable. Cannot print confirmation document.':
            'Không thể kiểm tra blockchain lúc này. Vui lòng thử lại sau.',
    }

    return errorMap[text] || text || 'Đã xảy ra lỗi. Vui lòng thử lại.'
}

const isValidCitizenId = (value) => /^\d{12}$/.test(String(value || '').trim())

// GPA_ONE_DECIMAL_VALIDATION_V1
const isValidGpa = (value) => {
    const text = String(value ?? '').trim()
    return /^(?:[0-3](?:\.\d)?|4(?:\.0)?)$/.test(text)
}

const normalizeGpa = (value) => {
    const text = String(value ?? '').trim()
    if (!text) return ''

    const numericValue = Number(text)
    if (Number.isNaN(numericValue)) return text

    return formatGpa(numericValue)
}

const formatGpa = (value) => {
    if (value === null || value === undefined || value === '') return ''

    const numericValue = Number(value)
    if (Number.isNaN(numericValue)) return value

    return Number.isInteger(numericValue)
        ? numericValue.toFixed(1)
        : String(numericValue)
}

const CLASSIFICATION_OPTIONS = [
    { value: 'Excellent', label: 'Xuất sắc (Excellent)' },
    { value: 'Very Good', label: 'Giỏi (Very Good)' },
    { value: 'Good', label: 'Khá (Good)' },
    { value: 'Average', label: 'Trung bình (Average)' },
    { value: 'Weak', label: 'Yếu (Weak)' },
]

const getFieldErrors = (message) => {
    if (message && typeof message === 'object' && message.detail) {
        return getFieldErrors(message.detail)
    }

    if (Array.isArray(message)) {
        return message.reduce((errors, item) => {
            const field = item.loc?.[item.loc.length - 1]
            const msg = item.msg || ''

            if (
                field === 'citizen_id' &&
                (
                    msg === 'String should have at least 12 characters' ||
                    msg === 'String should have at most 12 characters' ||
                    msg.includes('String should match pattern')
                )
            ) {
                return { ...errors, citizen_id: 'Số CCCD/CMND phải đúng 12 số.' }
            }

            if (field === 'student_id' && msg === 'Student already exists') {
                return { ...errors, student_id: 'Mã số sinh viên đã tồn tại.' }
            }

            if (field === 'student_id') {
                return { ...errors, student_id: 'Mã số sinh viên không hợp lệ.' }
            }

            if (field === 'email' && msg === 'Email already exists') {
                return { ...errors, email: 'Email đã tồn tại.' }
            }

            if (field === 'email') {
                return { ...errors, email: 'Email không hợp lệ.' }
            }

            if (field === 'citizen_id' && msg === 'Citizen ID already exists') {
                return { ...errors, citizen_id: 'Số CCCD/CMND đã tồn tại.' }
            }

            if (field === 'gpa') {
                return { ...errors, gpa: 'GPA phải từ 0 đến 4 và tối đa 1 chữ số thập phân.' }
            }

            if (field) {
                return { ...errors, [field]: msg || 'Dữ liệu không hợp lệ.' }
            }

            return errors
        }, {})
    }

    const text = String(message || '').replace(/^"|"$/g, '')

    const errorMap = {
        'Student already exists': {
            student_id: 'Mã số sinh viên đã tồn tại.',
        },
        'Email already exists': {
            email: 'Email đã tồn tại.',
        },
        'Citizen ID already exists': {
            citizen_id: 'Số CCCD/CMND đã tồn tại.',
        },
    }

    return errorMap[text] || {}
}

const getAddFormValidationErrors = (payload) => {
    const errors = {}
    const isGraduated = payload.graduation_status === 'GRADUATED'

    const requiredFields = [
        ['student_id', 'Mã số sinh viên không được để trống.'],
        ['full_name', 'Họ và tên không được để trống.'],
        ['date_of_birth', 'Ngày sinh không được để trống.'],
        ['email', 'Email không được để trống.'],
        ['citizen_id', 'Số CCCD/CMND không được để trống.'],
        ['faculty_name', 'Khoa không được để trống.'],
        ['major', 'Chuyên ngành không được để trống.'],
        ['entrance_year', 'Khóa nhập học không được để trống.'],
        ['graduation_year', 'Năm tốt nghiệp không được để trống.'],
        ['graduation_date', 'Ngày tốt nghiệp không được để trống.'],
    ]

    requiredFields.forEach(([field, message]) => {
        if (payload[field] === null || payload[field] === undefined || String(payload[field]).trim() === '') {
            errors[field] = message
        }
    })

    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email).trim())) {
        errors.email = 'Email không hợp lệ.'
    }

    if (payload.citizen_id && !isValidCitizenId(payload.citizen_id)) {
        errors.citizen_id = 'Số CCCD/CMND phải đúng 12 số.'
    }

    if (isGraduated && (payload.gpa === null || payload.gpa === undefined || String(payload.gpa).trim() === '')) {
        errors.gpa = 'GPA không được để trống khi sinh viên đã tốt nghiệp.'
    } else if (isGraduated && !isValidGpa(payload.gpa)) {
        errors.gpa = 'GPA phải từ 0 đến 4 và tối đa 1 chữ số thập phân.'
    }

    return errors
}

const toApiDate = (value) => {
    if (!value) return ''

    const trimmedValue = String(value).trim()
    const match = trimmedValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)

    if (!match) return trimmedValue

    const [, day, month, year] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

const normalizeDisplayDate = (value) => {
    if (!value) return ''

    const apiDate = toApiDate(value)
    return toDisplayDate(apiDate)
}

const formatVietnamDateInput = (value) => {
    const text = String(value ?? '')
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return toDisplayDate(text)

    const digits = text.replace(/\D/g, '').slice(0, 8)
    if (digits.length <= 2) return digits
    if (digits.length <= 4) {
        return `${digits.slice(0, 2)}/${digits.slice(2)}`
    }

    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

const getSuggestedGraduationYear = (entranceYear) => {
    const text = String(entranceYear ?? '').trim()

    if (!/^\d{4}$/.test(text)) return ''

    return Number(text) + 4
}

const shouldAutoUpdateGraduationYear = (currentGraduationYear, previousEntranceYear) => {
    if (currentGraduationYear === '' || currentGraduationYear === null || currentGraduationYear === undefined) {
        return true
    }

    const previousSuggestion = getSuggestedGraduationYear(previousEntranceYear)

    return previousSuggestion !== '' && Number(currentGraduationYear) === previousSuggestion
}
// ============================================================================
// 1. MODULE: DASHBOARD THỐNG KÊ
// ============================================================================
const DashboardModule = () => {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const navigate = useNavigate()

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await getDashboardStats()
                setStats(data)
            } catch (err) {
                if (err.status === 401) {
                    localStorage.removeItem('admin_token')
                    navigate('/login')
                } else {
                    setError(translateErrorMessage(err.message))
                }
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [navigate])

    if (loading) return <div className="dashboard-message loading">Đang kết nối hệ thống...</div>
    if (error) return <div className="dashboard-message error">{error}</div>
    if (!stats) return null

    return (
        <div className="dashboard-container dashboard-overview">
            <div className="dashboard-header dashboard-overview-header">
                <div>
                    <span className="dashboard-eyebrow">Tổng quan quản trị</span>
                    <h1>Tổng quan Hệ thống</h1>
                    <p>Theo dõi nhanh số lượng sinh viên và tình trạng dữ liệu.</p>
                </div>
                <div className="dashboard-live-status">
                    <i aria-hidden="true" />
                    Dữ liệu được cập nhật tự động
                </div>
            </div>

            <div className="stats-grid dashboard-stats-grid">
                <article className="stat-card stat-total">
                    <div className="dashboard-stat-heading">
                        <span className="dashboard-stat-icon">
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                        </span>
                        <span className="stat-title">Tổng sinh viên</span>
                    </div>
                    <div className="stat-value">{stats.total_students}<small>hồ sơ</small></div>
                    <p>Toàn bộ sinh viên đang được quản lý.</p>
                </article>

                <article className="stat-card stat-graduated">
                    <div className="dashboard-stat-heading">
                        <span className="dashboard-stat-icon">
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="m3 10 9-5 9 5-9 5-9-5Z" />
                                <path d="M7 12.5V17c3 2 7 2 10 0v-4.5M21 10v6" />
                            </svg>
                        </span>
                        <span className="stat-title">Đã tốt nghiệp</span>
                    </div>
                    <div className="stat-value">{stats.graduated_students}<small>hồ sơ</small></div>
                    <p>Sinh viên đã được xác nhận tốt nghiệp.</p>
                </article>

                <article className="stat-card stat-pending">
                    <div className="dashboard-stat-heading">
                        <span className="dashboard-stat-icon">
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 7v5l3 2" />
                            </svg>
                        </span>
                        <span className="stat-title">Chưa tốt nghiệp / Chờ</span>
                    </div>
                    <div className="stat-value">{stats.not_graduated_students + stats.pending_students}<small>hồ sơ</small></div>
                    <p>Hồ sơ chưa hoàn tất hoặc đang chờ xử lý.</p>
                </article>

                <article className="stat-card stat-synced">
                    <div className="dashboard-stat-heading">
                        <span className="dashboard-stat-icon">
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M20 7h-9M14 3l-4 4 4 4M4 17h9M10 13l4 4-4 4" />
                            </svg>
                        </span>
                        <span className="stat-title">Đã đồng bộ dữ liệu</span>
                    </div>
                    <div className="stat-value">{stats.synced_blockchain}<small>hồ sơ</small></div>
                    <p>Dữ liệu đã được hệ thống ghi nhận an toàn.</p>
                </article>

                <article className="stat-card stat-review">
                    <div className="dashboard-stat-heading">
                        <span className="dashboard-stat-icon">
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M12 3 2.5 20h19L12 3Z" />
                                <path d="M12 9v5m0 3h.01" />
                            </svg>
                        </span>
                        <span className="stat-title">Cần kiểm tra</span>
                    </div>
                    <div className="stat-value">{stats.mismatch_count}<small>hồ sơ</small></div>
                    <p>Thông tin hiện tại chưa khớp dữ liệu đã xác nhận.</p>
                </article>
            </div>
        </div>
    )
}

// ============================================================================
// 2. MODULE: QUẢN LÝ SINH VIÊN
// ============================================================================

// ADMIN_STUDENT_LIVE_SEARCH_V2
const normalizeStudentSearch = value =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()


// ADMIN_STUDENT_READ_ONLY_VIEW_V1
// ADMIN_STUDENT_PRIVATE_DETAIL_V1
const ADMIN_CLASSIFICATION_LABELS = {
    Excellent: 'Xuất sắc',
    'Very Good': 'Giỏi',
    Good: 'Khá',
    Average: 'Trung bình',
    Weak: 'Yếu',
}

const getAdminClassificationLabel = value => ADMIN_CLASSIFICATION_LABELS[value] || value

const AdminStudentDetailItem = ({ label, value, wide = false, mono = false }) => {
    const displayValue = value === null || value === undefined || value === '' ? '—' : value

    return (
        <div className={`student-view-item${wide ? ' student-view-item--wide' : ''}`}>
            <span>{label}</span>
            <strong className={mono ? 'student-view-mono' : ''}>{displayValue}</strong>
        </div>
    )
}

const StudentsModule = () => {
    const [studentSearch, setStudentSearch] = useState('')
    const [students, setStudents] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [editingStudent, setEditingStudent] = useState(null)
    const [formErrors, setFormErrors] = useState({})
    const [editFormErrors, setEditFormErrors] = useState({})
    const [approvingStudentId, setApprovingStudentId] = useState('')
    const [rejectingStudentId, setRejectingStudentId] = useState('')

    const [viewingStudent, setViewingStudent] = useState(null)
    const [viewStudentLoadingId, setViewStudentLoadingId] = useState('')
    const initialFormState = {
        student_id: '',
        full_name: '',
        date_of_birth: '',
        citizen_id: '',
        email: '',
        institution_code: 'FPTU',
        institution_name: 'FPT University',
        faculty_name: '',
        major: '',
        training_mode: 'Full-time',
        degree_type: 'Bachelor',
        graduation_status: 'GRADUATED',
        graduation_date: '',
        graduation_year: '',
        classification: 'Good',
        gpa: '',
        entrance_year: ''
    }
    const [formData, setFormData] = useState(initialFormState)
    const [editFormData, setEditFormData] = useState({
        full_name: '',
        date_of_birth: '',
        citizen_id: '',
        email: '',
        faculty_name: '',
        major: '',
        training_mode: '',
        degree_type: '',
        graduation_status: 'GRADUATED',
        graduation_date: '',
        graduation_year: '',
        classification: 'Good',
        gpa: '',
    })
    const isAddGraduated = formData.graduation_status === 'GRADUATED'
    const isEditGraduated = editFormData.graduation_status === 'GRADUATED'
    const isEditingAlreadyGraduated = editingStudent?.graduation_status === 'GRADUATED'
    const addMajorOptions = FACULTY_MAJOR_OPTIONS[formData.faculty_name] || []
    const editMajorOptions = FACULTY_MAJOR_OPTIONS[editFormData.faculty_name] || []
    const [isDeletedModalOpen, setIsDeletedModalOpen] = useState(false)
const [deletedStudents, setDeletedStudents] = useState([])
const [deletedLoading, setDeletedLoading] = useState(false)
const [deletedSearch, setDeletedSearch] = useState('')

    // Props chung cho mọi input text — tắt auto capitalize/correct
    const inputProps = {
        autoCapitalize: 'none',
        autoCorrect: 'off',
        spellCheck: false,
        style: { textTransform: 'none' },
    }

    const fieldErrorStyle = {
        color: '#dc2626',
        fontSize: '13px',
        fontWeight: 600,
        marginTop: '6px',
        marginBottom: '8px',
    }

    const getInputStyle = (hasError) => ({
        ...inputProps.style,
        borderColor: hasError ? '#dc2626' : undefined,
        boxShadow: hasError ? '0 0 0 3px rgba(220, 38, 38, 0.12)' : undefined,
    })

    const renderFieldError = (errors, field) => (
        errors[field] ? <div style={fieldErrorStyle}>{errors[field]}</div> : null
    )

    const clearFormError = (field) => {
        setFormErrors((currentErrors) => {
            if (!currentErrors[field]) return currentErrors

            const nextErrors = { ...currentErrors }
            delete nextErrors[field]
            return nextErrors
        })
    }

    const clearEditFormError = (field) => {
        setEditFormErrors((currentErrors) => {
            if (!currentErrors[field]) return currentErrors

            const nextErrors = { ...currentErrors }
            delete nextErrors[field]
            return nextErrors
        })
    }

    const loadStudents = async () => {
        setLoading(true)
        try {
            const data = await getStudents(1, 50)
            setStudents(data.items || data)
        } catch (err) {
            setError(translateErrorMessage(err.message))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadStudents() }, [])

    const handleOpenEdit = (student) => {
        setEditingStudent(student)
        setEditFormErrors({})
        setEditFormData({
            full_name: student.full_name || '',
            date_of_birth: student.date_of_birth || '',
            citizen_id: '',
            email: student.email || '',
            faculty_name: student.faculty_name || '',
            major: student.major || '',
            training_mode: student.training_mode || '',
            degree_type: student.degree_type || 'Bachelor',
            graduation_status: student.graduation_status || 'GRADUATED',
            graduation_date: student.graduation_date || '',
            graduation_year: student.graduation_year || '',
            classification: student.classification || 'Good',
            gpa: formatGpa(student.gpa),
        })
        setIsEditModalOpen(true)
    }

    const handleAdd = async (e) => {
        e.preventDefault()
        setFormErrors({})
        try {
            const payload = {
                ...formData,
                date_of_birth: toApiDate(formData.date_of_birth),
                citizen_id: String(formData.citizen_id || '').trim(),
                gpa: normalizeGpa(formData.gpa),
            }

            if (payload.graduation_status !== 'GRADUATED') {
                payload.gpa = null
                payload.classification = null
            }

            const validationErrors = getAddFormValidationErrors(payload)
            const duplicateCheck = await validateStudentData(payload)
            const duplicateErrors = getFieldErrors(duplicateCheck.errors || [])
            const combinedErrors = {
                ...duplicateErrors,
                ...validationErrors,
            }

            if (Object.keys(combinedErrors).length > 0) {
                setFormErrors(combinedErrors)
                return
            }

            const createdStudent = await createStudent(payload)
            if (createdStudent.approval_status === 'PENDING_BLOCKCHAIN') {
                showAdminNotice('Hồ sơ đã được lưu và đang chờ bạn duyệt ghi Blockchain.')
            }
            setIsAddModalOpen(false)
            setFormData(initialFormState)
            loadStudents()
        } catch (err) {
            const fieldErrors = getFieldErrors(err.message)

            if (Object.keys(fieldErrors).length > 0) {
                setFormErrors(fieldErrors)
                return
            }

            showAdminNotice(`Lỗi hệ thống:\n${translateErrorMessage(err.message)}`)
        }
    }

    const handleEdit = async (e) => {
        e.preventDefault()
        setEditFormErrors({})
        try {
            const payload = {
                ...editFormData,
                date_of_birth: toApiDate(editFormData.date_of_birth),
                gpa: normalizeGpa(editFormData.gpa),
            }

            if (payload.graduation_status !== 'GRADUATED') {
                payload.gpa = null
                payload.classification = null
            }

            if (
                editingStudent.graduation_status === 'GRADUATED'
                && payload.graduation_status !== 'GRADUATED'
            ) {
                setEditFormErrors({
                    graduation_status: 'Sinh viên đã tốt nghiệp không thể chuyển về chưa tốt nghiệp.',
                })
                return
            }

            if (!payload.citizen_id) {
                delete payload.citizen_id
            }

            if (
                payload.email
                && editingStudent.email
                && payload.email.trim().toLowerCase()
                    === editingStudent.email.trim().toLowerCase()
            ) {
                delete payload.email
            }

            if (payload.citizen_id && !isValidCitizenId(payload.citizen_id)) {
                setEditFormErrors({ citizen_id: 'Số CCCD/CMND phải đúng 12 số.' })
                return
            }

            if (
                payload.graduation_status === 'GRADUATED'
                && (payload.gpa === null || payload.gpa === undefined || String(payload.gpa).trim() === '')
            ) {
                setEditFormErrors({ gpa: 'GPA không được để trống khi sinh viên đã tốt nghiệp.' })
                return
            }

            if (payload.graduation_status === 'GRADUATED' && payload.gpa && !isValidGpa(payload.gpa)) {
                setEditFormErrors({ gpa: 'GPA phải từ 0 đến 4 và tối đa 1 chữ số thập phân.' })
                return
            }

            const duplicateCheck = await validateStudentData({
                ...payload,
                current_student_id: editingStudent.student_id,
                original_student_id: editingStudent.student_id,
            })
            const duplicateErrors = getFieldErrors(duplicateCheck.errors || [])

            if (Object.keys(duplicateErrors).length > 0) {
                setEditFormErrors(duplicateErrors)
                return
            }

            await updateStudent(editingStudent.student_id, payload)
            setIsEditModalOpen(false)
            setEditingStudent(null)
            loadStudents()
        } catch (err) {
            const fieldErrors = getFieldErrors(err.message)

            if (Object.keys(fieldErrors).length > 0) {
                setEditFormErrors(fieldErrors)
                return
            }

            showAdminNotice(`Lỗi cập nhật:\n${translateErrorMessage(err.message)}`)
        }
    }

    const handleRejectBlockchain = async (student) => {
        if (approvingStudentId === student.student_id || rejectingStudentId === student.student_id) return

        const confirmed = await requestAdminConfirmation(
            `Từ chối duyệt hồ sơ ${student.student_id}? Quyết định này sẽ được ghi thành giao dịch Fabric mới, nhưng không tạo hồ sơ tốt nghiệp chính thức.`
        )

        if (!confirmed) return

        try {
            setRejectingStudentId(student.student_id)
            const result = await rejectStudentBlockchain(student.student_id)
            // ADMIN_REJECTION_NOTICE_TONE_V1
            showAdminNotice(
                `Đã ghi nhận quyết định từ chối trên Blockchain. Mã giao dịch: ${result.blockchain_tx_id || 'đã tạo'}`,
                'rejected'
            )
            await loadStudents()
        } catch (err) {
            showAdminNotice(`Không thể lưu quyết định: ${translateErrorMessage(err.message)}`)
        } finally {
            setRejectingStudentId('')
        }
    }

    const handleApproveBlockchain = async (student) => {
        if (approvingStudentId === student.student_id || rejectingStudentId === student.student_id) return

        const confirmed = window.confirm(
            `Duyệt hồ sơ ${student.student_id} và ghi dữ liệu xác minh lên Blockchain? Hành động này sẽ tạo giao dịch Fabric mới.`
        )

        if (!confirmed) return

        try {
            setApprovingStudentId(student.student_id)
            const result = await approveStudentBlockchain(student.student_id)
            showAdminNotice(
                `Đã duyệt và ghi Blockchain. Mã giao dịch: ${result.blockchain_tx_id || 'đã tạo'}`
            )
            await loadStudents()
        } catch (err) {
            showAdminNotice(`Không thể duyệt: ${translateErrorMessage(err.message)}`)
        } finally {
            setApprovingStudentId('')
        }
    }

    const handleDelete = async (studentId) => {
        if (window.confirm('Bạn có chắc chắn muốn xóa sinh viên này?')) {
            try {
                await deleteStudent(studentId)
                loadStudents()
            } catch (err) {
                showAdminNotice(`Lỗi xóa: ${translateErrorMessage(err.message)}`)
            }
        }
    }

    const loadDeletedStudents = async () => {
    setDeletedLoading(true)
    try {
        const data = await getStudents(1, 100, { is_deleted: true })
        setDeletedStudents(data.items || data)
    } catch (err) {
        showAdminNotice(`Lỗi: ${translateErrorMessage(err.message)}`)
    } finally {
        setDeletedLoading(false)
    }
}

const handleOpenDeletedModal = () => {
    setIsDeletedModalOpen(true)
    setDeletedSearch('')
    loadDeletedStudents()
}

const handleRestore = async (studentId) => {
    try {
        await restoreStudent(studentId)
        loadDeletedStudents() // reload danh sách đã xóa
        loadStudents()        // reload bảng chính
    } catch (err) {
        showAdminNotice(`Lỗi khôi phục: ${translateErrorMessage(err.message)}`)
    }
}

    const handleOpenStudentView = async (student) => {
        try {
            setViewStudentLoadingId(student.student_id)
            const detail = await getStudent(student.student_id)
            setViewingStudent({ ...student, ...detail })
        } catch (err) {
            showAdminNotice(`Không thể xem hồ sơ: ${translateErrorMessage(err.message)}`, 'error')
        } finally {
            setViewStudentLoadingId('')
        }
    }

    const filteredStudents = students.filter((student) => {
        const query = normalizeStudentSearch(studentSearch)
        if (!query) return true
        return [student.student_id, student.full_name].some((value) =>
            normalizeStudentSearch(value).includes(query)
        )
    })

    return (
    <div className="module-container">
        <div className="module-header">
            <h1>Quản lý Sinh viên</h1>
            <div style={{ display: 'flex', gap: '10px' }}>
                <button className="deleted-btn" onClick={handleOpenDeletedModal}>
                    🗑 Sinh viên đã xóa
                </button>
                <button className="add-btn" onClick={() => {
                    setFormErrors({})
                    setIsAddModalOpen(true)
                }}>
                    + Thêm sinh viên
                </button>
            </div>
        </div>

        {/* ── MODAL THÊM ── */}
        {isAddModalOpen && (
            <div className="modal-overlay">
                <form className="modal-content modal-lg student-form-modal" onSubmit={handleAdd} noValidate>
                    <div className="student-form-header">
                        <div>
                            <h2>Thêm sinh viên mới</h2>
                            <p>Nhập thông tin hồ sơ để thêm sinh viên vào hệ thống quản lý.</p>
                        </div>
                        <button
                            type="button"
                            className="student-form-close"
                            aria-label="Đóng biểu mẫu"
                            onClick={() => setIsAddModalOpen(false)}
                        >
                            ×
                        </button>
                    </div>
                    <div className="form-grid">
                        <div className="form-column">
                            <label>Mã số sinh viên</label>
                            <input
                                value={formData.student_id}
                                onChange={e => {
                                    clearFormError('student_id')
                                    setFormData({ ...formData, student_id: e.target.value })
                                }}
                                required
                                {...inputProps}
                                style={getInputStyle(formErrors.student_id)}
                            />
                            {renderFieldError(formErrors, 'student_id')}

                            <label>Họ và tên</label>
                            <input
                                value={formData.full_name}
                                onChange={e => {
                                    clearFormError('full_name')
                                    setFormData({ ...formData, full_name: e.target.value })
                                }}
                                required
                                {...inputProps}
                                style={getInputStyle(formErrors.full_name)}
                            />
                            {renderFieldError(formErrors, 'full_name')}

                            <label>Ngày sinh</label>
                            <div className="student-date-input">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="bday"
                                    maxLength="10"
                                    aria-label="Ngày sinh, định dạng ngày tháng năm"
                                    value={toDisplayDate(formData.date_of_birth)}
                                    onChange={e => {
                                        clearFormError('date_of_birth')
                                        setFormData({
                                            ...formData,
                                            date_of_birth: formatVietnamDateInput(e.target.value),
                                        })
                                    }}
                                    onBlur={e => {
                                        setFormData({ ...formData, date_of_birth: normalizeDisplayDate(e.target.value) })
                                    }}
                                    required
                                    {...inputProps}
                                    style={getInputStyle(formErrors.date_of_birth)}
                                />
                                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <rect x="3" y="5" width="18" height="16" rx="2" />
                                    <path d="M8 3v4m8-4v4M3 10h18" />
                                </svg>
                            </div>
                            {renderFieldError(formErrors, 'date_of_birth')}

                            <label>Email</label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={e => {
                                    clearFormError('email')
                                    setFormData({ ...formData, email: e.target.value })
                                }}
                                required
                                {...inputProps}
                                style={getInputStyle(formErrors.email)}
                            />
                            {renderFieldError(formErrors, 'email')}

                            <label>Số CCCD/CMND</label>
                            <input
                                value={formData.citizen_id}
                                onChange={e => {
                                    clearFormError('citizen_id')
                                    setFormData({ ...formData, citizen_id: e.target.value })
                                }}
                                required
                                {...inputProps}
                                style={getInputStyle(formErrors.citizen_id)}
                            />
                            {renderFieldError(formErrors, 'citizen_id')}

                            <label>GPA</label>
                            <input
                                type="text"
                                inputMode="decimal"
                                maxLength={3}
                                pattern="(?:[0-3](?:[.][0-9])?|4(?:[.]0)?)"
                                title="GPA từ 0 đến 4 và tối đa 1 chữ số thập phân"
                                placeholder={isAddGraduated ? '0 - 4' : 'Chưa áp dụng'}
                                value={isAddGraduated ? formData.gpa : ''}
                                disabled={!isAddGraduated}
                                onChange={e => {
                                    clearFormError('gpa')
                                    const nextGpa = e.target.value
                                    setFormData({
                                        ...formData,
                                        gpa: nextGpa,
                                    })
                                }}
                                onBlur={e => {
                                    const normalizedGpa = normalizeGpa(e.target.value)
                                    setFormData({
                                        ...formData,
                                        gpa: normalizedGpa,
                                    })
                                }}
                                required={isAddGraduated}
                                style={getInputStyle(formErrors.gpa)}
                            />
                            {renderFieldError(formErrors, 'gpa')}

                            <label>Xếp loại</label>
                            <select
                                value={isAddGraduated ? formData.classification : ''}
                                disabled={!isAddGraduated}
                                onChange={e => setFormData({ ...formData, classification: e.target.value })}
                            >
                                {!isAddGraduated && <option value="">Chưa áp dụng</option>}
                                {CLASSIFICATION_OPTIONS.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-column">

                            <label>Khoa</label>
                            <select
                                value={formData.faculty_name}
                                onChange={e => {
                                    clearFormError('faculty_name')
                                    clearFormError('major')
                                    setFormData({
                                        ...formData,
                                        faculty_name: e.target.value,
                                        major: '',
                                    })
                                }}
                                required
                                style={getInputStyle(formErrors.faculty_name)}
                            >
                                <option value="">Chọn khoa</option>
                                {FACULTY_OPTIONS.map(faculty => (
                                    <option key={faculty} value={faculty}>{faculty}</option>
                                ))}
                            </select>
                            {renderFieldError(formErrors, 'faculty_name')}

                            <label>Chuyên ngành</label>
                            <select
                                value={formData.major}
                                disabled={!formData.faculty_name}
                                onChange={e => {
                                    clearFormError('major')
                                    setFormData({ ...formData, major: e.target.value })
                                }}
                                required
                                style={getInputStyle(formErrors.major)}
                            >
                                <option value="">
                                    {formData.faculty_name ? 'Chọn chuyên ngành' : 'Chọn khoa trước'}
                                </option>
                                {addMajorOptions.map(major => (
                                    <option key={major} value={major}>{major}</option>
                                ))}
                            </select>
                            {renderFieldError(formErrors, 'major')}

                            <label>Khóa nhập học</label>
                            <input
                                type="number"
                                value={formData.entrance_year}
                                onChange={e => {
                                    clearFormError('entrance_year')
                                    const nextEntranceYear = e.target.value === '' ? '' : parseInt(e.target.value)
                                    const nextGraduationYear = getSuggestedGraduationYear(nextEntranceYear)
                                    const shouldSuggestGraduationYear = shouldAutoUpdateGraduationYear(
                                        formData.graduation_year,
                                        formData.entrance_year
                                    )

                                    if (shouldSuggestGraduationYear && nextGraduationYear !== '') {
                                        clearFormError('graduation_year')
                                    }

                                    setFormData({
                                        ...formData,
                                        entrance_year: nextEntranceYear,
                                        graduation_year: shouldSuggestGraduationYear
                                            ? nextGraduationYear
                                            : formData.graduation_year,
                                    })
                                }}
                                required
                                style={getInputStyle(formErrors.entrance_year)}
                            />
                            {renderFieldError(formErrors, 'entrance_year')}

                            <label>Năm tốt nghiệp</label>
                            <input
                                type="number"
                                value={formData.graduation_year}
                                onChange={e => {
                                    clearFormError('graduation_year')
                                    setFormData({
                                        ...formData,
                                        graduation_year: e.target.value === '' ? '' : parseInt(e.target.value),
                                    })
                                }}
                                required
                                style={getInputStyle(formErrors.graduation_year)}
                            />
                            {renderFieldError(formErrors, 'graduation_year')}

                            <label>Ngày tốt nghiệp</label>
                            <input
                                type="date"
                                value={formData.graduation_date}
                                onChange={e => {
                                    clearFormError('graduation_date')
                                    setFormData({ ...formData, graduation_date: e.target.value })
                                }}
                                required
                                style={getInputStyle(formErrors.graduation_date)}
                            />
                            {renderFieldError(formErrors, 'graduation_date')}

                            <label>Trạng thái</label>
                            <select
                                value={formData.graduation_status}
                                onChange={e => {
                                    const nextStatus = e.target.value
                                    setFormData({
                                        ...formData,
                                        graduation_status: nextStatus,
                                        gpa: nextStatus === 'GRADUATED' ? formData.gpa : '',
                                        classification: nextStatus === 'GRADUATED'
                                            ? (formData.classification || 'Good')
                                            : '',
                                    })
                                    clearFormError('gpa')
                                }}
                            >
                                <option value="GRADUATED">Đã tốt nghiệp</option>
                                <option value="NOT_GRADUATED">Chưa tốt nghiệp</option>
                            </select>
                        </div>
                    </div>
                    <div className="modal-actions">
                        <button type="button" onClick={() => setIsAddModalOpen(false)}>Hủy</button>
                        <button type="submit" className="save-btn">Thêm sinh viên</button>
                    </div>
                </form>
            </div>
        )}

        {/* ── MODAL SỬA ── */}
        {isEditModalOpen && editingStudent && (
            <div className="modal-overlay">
                <form className="modal-content modal-lg student-form-modal" onSubmit={handleEdit}>
                    <div className="student-form-header">
                        <div>
                            <h2>Cập nhật sinh viên</h2>
                            <p>Mã số sinh viên: <strong>{editingStudent.student_id}</strong></p>
                        </div>
                        <button
                            type="button"
                            className="student-form-close"
                            aria-label="Đóng biểu mẫu"
                            onClick={() => setIsEditModalOpen(false)}
                        >
                            ×
                        </button>
                    </div>
                    <div className="form-grid">
                        <div className="form-column">
                            <label>Họ và tên</label>
                            <input value={editFormData.full_name} onChange={e => setEditFormData({ ...editFormData, full_name: e.target.value })} required {...inputProps} />

                            <label>Ngày sinh</label>
                            <div className="student-date-input">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="bday"
                                    maxLength="10"
                                    aria-label="Ngày sinh, định dạng ngày tháng năm"
                                    value={toDisplayDate(editFormData.date_of_birth)}
                                    onChange={e => setEditFormData({
                                        ...editFormData,
                                        date_of_birth: formatVietnamDateInput(e.target.value),
                                    })}
                                    onBlur={e => setEditFormData({
                                        ...editFormData,
                                        date_of_birth: normalizeDisplayDate(e.target.value),
                                    })}
                                    {...inputProps}
                                />
                                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <rect x="3" y="5" width="18" height="16" rx="2" />
                                    <path d="M8 3v4m8-4v4M3 10h18" />
                                </svg>
                            </div>

                            <label>Số CCCD/CMND</label>
                            <input
                                value={editFormData.citizen_id}
                                onChange={e => {
                                    clearEditFormError('citizen_id')
                                    setEditFormData({ ...editFormData, citizen_id: e.target.value })
                                }}
                                placeholder="Để trống nếu không đổi"
                                {...inputProps}
                                style={getInputStyle(editFormErrors.citizen_id)}
                            />
                            {renderFieldError(editFormErrors, 'citizen_id')}

                            <label>Email</label>
                            <input
                                type="email"
                                value={editFormData.email}
                                onChange={e => {
                                    clearEditFormError('email')
                                    setEditFormData({ ...editFormData, email: e.target.value })
                                }}
                                {...inputProps}
                                style={getInputStyle(editFormErrors.email)}
                            />
                            {renderFieldError(editFormErrors, 'email')}

                            <label>Khoa</label>
                            <select
                                value={editFormData.faculty_name}
                                onChange={e => setEditFormData({
                                    ...editFormData,
                                    faculty_name: e.target.value,
                                    major: '',
                                })}
                            >
                                <option value="">Chọn khoa</option>
                                {editFormData.faculty_name && !FACULTY_MAJOR_OPTIONS[editFormData.faculty_name] && (
                                    <option value={editFormData.faculty_name}>
                                        {getFacultyDisplayName(editFormData.faculty_name)} (dữ liệu hiện tại)
                                    </option>
                                )}
                                {FACULTY_OPTIONS.map(faculty => (
                                    <option key={faculty} value={faculty}>{faculty}</option>
                                ))}
                            </select>

                            <label>Chuyên ngành</label>
                            <select
                                value={editFormData.major}
                                disabled={!editFormData.faculty_name}
                                onChange={e => setEditFormData({ ...editFormData, major: e.target.value })}
                            >
                                <option value="">Chọn chuyên ngành</option>
                                {editFormData.major && !editMajorOptions.includes(editFormData.major) && (
                                    <option value={editFormData.major}>
                                        {editFormData.major} (dữ liệu hiện tại)
                                    </option>
                                )}
                                {editMajorOptions.map(major => (
                                    <option key={major} value={major}>{major}</option>
                                ))}
                            </select>

                            <label>Hình thức đào tạo</label>
                            <input value={editFormData.training_mode} onChange={e => setEditFormData({ ...editFormData, training_mode: e.target.value })} {...inputProps} />
                        </div>

                        <div className="form-column">

                            <label>Loại bằng</label>
                            <input
                                value={isEditGraduated ? 'Cử nhân' : 'Chưa áp dụng'}
                                disabled
                                readOnly
                            />

                            <label>GPA</label>
                            <input
                                type="text"
                                inputMode="decimal"
                                maxLength={3}
                                pattern="(?:[0-3](?:[.][0-9])?|4(?:[.]0)?)"
                                title="GPA từ 0 đến 4 và tối đa 1 chữ số thập phân"
                                placeholder={isEditGraduated ? '0 - 4' : 'Chưa áp dụng'}
                                value={isEditGraduated ? editFormData.gpa : ''}
                                disabled={!isEditGraduated}
                                onChange={e => {
                                    clearEditFormError('gpa')
                                    const nextGpa = e.target.value
                                    setEditFormData({
                                        ...editFormData,
                                        gpa: nextGpa,
                                    })
                                }}
                                onBlur={e => {
                                    const normalizedGpa = normalizeGpa(e.target.value)
                                    setEditFormData({
                                        ...editFormData,
                                        gpa: normalizedGpa,
                                    })
                                }}
                                style={getInputStyle(editFormErrors.gpa)}
                            />
                            {renderFieldError(editFormErrors, 'gpa')}

                            <label>Xếp loại</label>
                            <select
                                value={isEditGraduated ? editFormData.classification : ''}
                                disabled={!isEditGraduated}
                                onChange={e => setEditFormData({ ...editFormData, classification: e.target.value })}
                            >
                                {!isEditGraduated && <option value="">Chưa áp dụng</option>}
                                {CLASSIFICATION_OPTIONS.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>

                            <label>Ngày tốt nghiệp</label>
                            <input type="date" value={editFormData.graduation_date} onChange={e => setEditFormData({ ...editFormData, graduation_date: e.target.value })} style={{ textTransform: 'none' }} />

                            <label>Trạng thái</label>
                            <select
                                value={editFormData.graduation_status}
                                onChange={e => {
                                    const nextStatus = e.target.value

                                    if (isEditingAlreadyGraduated && nextStatus !== 'GRADUATED') {
                                        setEditFormErrors({
                                            ...editFormErrors,
                                            graduation_status: 'Sinh viên đã tốt nghiệp không thể chuyển về chưa tốt nghiệp.',
                                        })
                                        return
                                    }

                                    setEditFormData({
                                        ...editFormData,
                                        graduation_status: nextStatus,
                                        gpa: nextStatus === 'GRADUATED' ? editFormData.gpa : '',
                                        classification: nextStatus === 'GRADUATED'
                                            ? (editFormData.classification || 'Good')
                                            : '',
                                    })
                                    clearEditFormError('graduation_status')
                                    clearEditFormError('gpa')
                                }}
                                style={getInputStyle(editFormErrors.graduation_status)}
                            >
                                <option value="GRADUATED">Đã tốt nghiệp</option>
                                {!isEditingAlreadyGraduated && (
                                    <option value="NOT_GRADUATED">Chưa tốt nghiệp</option>
                                )}
                            </select>
                            {renderFieldError(editFormErrors, 'graduation_status')}
                        </div>
                    </div>
                    <div className="modal-actions">
                        <button type="button" onClick={() => setIsEditModalOpen(false)}>Hủy</button>
                        <button type="submit" className="save-btn">Lưu thay đổi</button>
                    </div>
                </form>
            </div>
        )}

        {/* ── MODAL SINH VIÊN ĐÃ XÓA ── */}
        {isDeletedModalOpen && (
            <div className="modal-overlay">
                <div className="modal-content modal-lg deleted-students-modal">
                    <div className="deleted-modal-header">
                        <div className="deleted-modal-title-group">
                            <div className="deleted-modal-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none">
                                    <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
                                </svg>
                            </div>
                            <div>
                                <h2>Sinh viên đã xóa</h2>
                                <p>Xem và khôi phục hồ sơ đã được đưa ra khỏi danh sách chính.</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="deleted-modal-close"
                            aria-label="Đóng cửa sổ"
                            onClick={() => setIsDeletedModalOpen(false)}
                        >
                            ×
                        </button>
                    </div>

                    {/* Thanh tìm kiếm */}
                    <div className="deleted-modal-search">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m16.5 16.5 4 4" />
                        </svg>
                        <input
                            placeholder="Tìm theo mã số sinh viên..."
                            value={deletedSearch}
                            onChange={e => setDeletedSearch(e.target.value)}
                            {...inputProps}
                        />
                    </div>

                    {/* Danh sách */}
                    <div className="deleted-students-table-wrap">
                        {deletedLoading ? (
                            <p style={{ textAlign: 'center', color: '#64748b' }}>Đang tải...</p>
                        ) : (
                            <table className="data-table deleted-students-table">
                                <thead>
                                    <tr>
                                        <th>Mã số sinh viên</th>
                                        <th>Họ tên</th>
                                        <th>GPA</th>
                                        <th>Trạng thái</th>
                                        <th>Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {deletedStudents
                                        .filter(s =>
                                            deletedSearch.trim() === '' ||
                                            s.student_id.toLowerCase().includes(deletedSearch.toLowerCase())
                                        )
                                        .length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="deleted-modal-empty">
                                                {deletedSearch ? 'Không tìm thấy sinh viên' : 'Không có sinh viên đã xóa'}
                                            </td>
                                        </tr>
                                    ) : (
                                        deletedStudents
                                            .filter(s =>
                                                deletedSearch.trim() === '' ||
                                                s.student_id.toLowerCase().includes(deletedSearch.toLowerCase())
                                            )
                                            .map(s => (
                                                <tr key={s.student_id}>
                                                    <td>{s.student_id}</td>
                                                    <td>{s.full_name}</td>
                                                    <td>{formatGpa(s.gpa)}</td>
                                                    <td>
                                                        <span className={`status-badge ${s.graduation_status === 'GRADUATED' ? 'graduated' : 'pending'}`}>
                                                            {s.graduation_status === 'GRADUATED'
                                                                ? 'Đã tốt nghiệp'
                                                                : s.graduation_status === 'NOT_GRADUATED'
                                                                    ? 'Chưa tốt nghiệp'
                                                                    : 'Chưa xác định'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <button className="restore-btn" onClick={() => handleRestore(s.student_id)}>
                                                            Khôi phục
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <div className="deleted-modal-footer">
                        <span>{deletedStudents.length} hồ sơ đã xóa</span>
                        <button
                            type="button"
                            className="deleted-modal-done"
                            onClick={() => setIsDeletedModalOpen(false)}
                        >
                            Đóng
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* ── BẢNG DỮ LIỆU CHÍNH ── */}
        {/* ADMIN_STUDENT_LIVE_SEARCH_V2 */}
        <form className="admin-student-search" onSubmit={event => event.preventDefault()}>
          <label htmlFor="admin-student-search-input">Tìm sinh viên</label>
          <div className="admin-student-search__bar">
            <input
              id="admin-student-search-input"
              type="search"
              value={studentSearch}
              onChange={event => setStudentSearch(event.target.value)}
              placeholder="Nhập mã số sinh viên hoặc họ và tên"
              autoComplete="off"
            />
            <button type="submit" aria-label="Tìm kiếm sinh viên" title="Tìm kiếm sinh viên">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4.25 4.25" />
              </svg>
            </button>
          </div>
        </form>

        {/* ADMIN_STUDENT_READ_ONLY_VIEW_V1 */}
        {viewingStudent && (
            <div
                className="modal-overlay"
                role="presentation"
                onMouseDown={() => setViewingStudent(null)}
            >
                <div
                    className="modal-content student-view-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="student-view-title"
                    onMouseDown={event => event.stopPropagation()}
                >
                    <div className="student-view-header">
                        <div>
                            <p className="student-view-eyebrow">Hồ sơ chỉ đọc</p>
                            <h2 id="student-view-title">Thông tin sinh viên</h2>
                            <p>Thông tin đã ghi nhận trong hệ thống, không thể sửa hoặc xóa tại trang này.</p>
                        </div>
                        <button
                            type="button"
                            className="student-view-close"
                            aria-label="Đóng cửa sổ thông tin"
                            onClick={() => setViewingStudent(null)}
                        >
                            ×
                        </button>
                    </div>

                    <div className="student-view-section">
                        <h3>Thông tin cá nhân</h3>
                        <div className="student-view-grid">
                            <AdminStudentDetailItem label="Mã số sinh viên" value={viewingStudent.student_id} mono />
                            <AdminStudentDetailItem label="Họ và tên" value={viewingStudent.full_name} />
                            <AdminStudentDetailItem label="Ngày sinh" value={toDisplayDate(viewingStudent.date_of_birth)} />
                            <AdminStudentDetailItem label="CCCD/CMND" value={viewingStudent.citizen_id} mono />
                            <AdminStudentDetailItem label="Email" value={viewingStudent.email} wide />
                        </div>
                    </div>

                    <div className="student-view-section">
                        <h3>Thông tin đào tạo</h3>
                        <div className="student-view-grid">
                            <AdminStudentDetailItem label="Mã trường" value={viewingStudent.institution_code} />
                            <AdminStudentDetailItem label="Tên trường" value={viewingStudent.institution_name} />
                            <AdminStudentDetailItem label="Khoa" value={getFacultyDisplayName(viewingStudent.faculty_name)} />
                            <AdminStudentDetailItem label="Chuyên ngành" value={viewingStudent.major} />
                            <AdminStudentDetailItem label="Hình thức đào tạo" value={viewingStudent.training_mode} />
                            <AdminStudentDetailItem label="Loại bằng" value={viewingStudent.degree_type} />
                            <AdminStudentDetailItem label="Khóa nhập học" value={viewingStudent.entrance_year} />
                            <AdminStudentDetailItem label="Năm tốt nghiệp" value={viewingStudent.graduation_year} />
                        </div>
                    </div>

                    <div className="student-view-section">
                        <h3>Kết quả tốt nghiệp</h3>
                        <div className="student-view-grid">
                            <AdminStudentDetailItem label="Ngày tốt nghiệp" value={toDisplayDate(viewingStudent.graduation_date)} />
                            <AdminStudentDetailItem label="GPA" value={formatGpa(viewingStudent.gpa)} />
                            <AdminStudentDetailItem label="Xếp loại" value={getAdminClassificationLabel(viewingStudent.classification)} />
                            <AdminStudentDetailItem
                                label="Trạng thái tốt nghiệp"
                                value={viewingStudent.graduation_status === 'GRADUATED' ? 'Đã tốt nghiệp' : 'Chưa tốt nghiệp'}
                            />
                            <AdminStudentDetailItem
                                label="Trạng thái Blockchain"
                                value={
                                    viewingStudent.approval_status === 'PENDING_BLOCKCHAIN'
                                        ? 'Chờ duyệt'
                                        : viewingStudent.approval_status === 'REJECTED_BLOCKCHAIN'
                                            ? 'Không duyệt'
                                            : viewingStudent.blockchain_tx_id
                                                ? 'Đã ghi Blockchain'
                                                : 'Chưa cần ghi'
                                }
                            />
                        </div>
                    </div>

                    <div className="modal-actions student-view-actions">
                        <button type="button" className="student-view-done" onClick={() => setViewingStudent(null)}>
                            Đóng
                        </button>
                    </div>
                </div>
            </div>
        )}

        {loading ? <p>Đang tải dữ liệu...</p> : error ? <p className="error-text">{error}</p> : (
            <table className="data-table student-main-table" data-admin-student-table-card="ADMIN_STUDENT_TABLE_CARD_V1">
                <thead>
                    <tr>
                        <th>Mã số sinh viên</th>
                        <th>Họ tên</th>
                        <th>GPA</th>
                        <th>Trạng thái</th>
                        <th>Blockchain</th>
                        {/* ADMIN_STUDENT_CREATED_TIME_COLUMN_V1 */}
                        <th>Thời gian tạo</th>
                    <th>Thao tác</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredStudents.length === 0 ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center' }}>Chưa có dữ liệu</td></tr>
                    ) : (
                        filteredStudents.map(s => (
                            <tr key={s.student_id}>
                                <td>{s.student_id}</td>
                                <td>{s.full_name}</td>
                                <td>{formatGpa(s.gpa)}</td>
                                <td>
                                    <span className={`status-badge ${s.graduation_status === 'GRADUATED' ? 'graduated' : 'pending'}`}>
                                        {s.graduation_status}
                                    </span>
                                </td>
                                <td>
                                    {s.approval_status === 'PENDING_BLOCKCHAIN' ? (
                                        <span className="blockchain-status pending-blockchain">Chờ duyệt</span>
                                    ) : s.approval_status === 'REJECTED_BLOCKCHAIN' ? (
              <span className="blockchain-status rejected-blockchain">Không duyệt</span>
          ) : s.blockchain_tx_id ? (
                                        <span className="blockchain-status recorded-blockchain">Đã ghi Blockchain</span>
                                    ) : (
                                        <span className="blockchain-status not-required-blockchain">Chưa cần ghi</span>
                                    )}
                                </td>
                                <td className="student-created-time">
                                    {formatVietnamDateTime(s.created_at) || '—'}
                                </td>
                                <td className="student-actions">
                                    {/* ADMIN_STUDENT_ACTION_GROUP_V1 */}
                                    {/* ADMIN_STUDENT_ACTION_COLUMN_BALANCE_V1: keep read-only View and one-row actions. */}
<div className="student-action-group">
                                    {s.approval_status === 'PENDING_BLOCKCHAIN' && s.graduation_status === 'GRADUATED' && (
                                        <button
                                            className="approve-blockchain-btn"
                                            title="Duyệt và ghi Blockchain"
                                            aria-label="Duyệt và ghi Blockchain"
                                            onClick={() => handleApproveBlockchain(s)}
                                            disabled={approvingStudentId === s.student_id || rejectingStudentId === s.student_id}
                                        >
                                            {approvingStudentId === s.student_id ? 'Đang ghi...' : 'Duyệt'}
                                        </button>
                                    )}
                                    {s.approval_status === 'PENDING_BLOCKCHAIN' && s.graduation_status === 'GRADUATED' && (
              <button
                  className="reject-blockchain-btn"
                  onClick={() => handleRejectBlockchain(s)}
                  disabled={rejectingStudentId === s.student_id || approvingStudentId === s.student_id}
              >
                  {rejectingStudentId === s.student_id ? 'Đang ghi...' : 'Không duyệt'}
              </button>
          )}
          <button
              type="button"
              className="view-student-btn"
              onClick={() => handleOpenStudentView(s)}
              disabled={viewStudentLoadingId === s.student_id}
          >
              {viewStudentLoadingId === s.student_id ? 'Đang tải...' : 'Xem'}
          </button>
                                                                    </div>
</td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        )}
    </div>
)
}

// ============================================================================
// 3. MODULE: YÊU CẦU TỪ DOANH NGHIỆP
// ============================================================================
// Legacy table kept only to preserve the old component while the new file-import
// workflow below is active.
// eslint-disable-next-line no-unused-vars
const ExternalRequestsLegacyModule = () => {
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(true)

    const loadRequests = async () => {
        setLoading(true)
        try {
            const data = await getExternalRequests('PENDING_REVIEW')
            setRequests(data.items || data)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadRequests() }, [])

    const handleAction = async (id, type) => {
        try {
            if (type === 'approve') await approveExternalRequest(id)
            else await rejectExternalRequest(id, 'Không đủ điều kiện')
            loadRequests()
        } catch (err) {
            showAdminNotice(`Lỗi: ${translateErrorMessage(err.message)}`)
        }
    }

    return (
        <div className="module-container">
            <div className="module-header">
                <h1>Yêu cầu từ Doanh nghiệp</h1>
            </div>
            {loading ? <p>Đang tải...</p> : (
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Mã YC</th>
                            <th>Doanh nghiệp</th>
                            <th>Mã số sinh viên cần tra</th>
                            <th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        {requests.length === 0 ? <tr><td colSpan="4">Không có yêu cầu chờ duyệt</td></tr> : requests.map(r => (
                            <tr key={r.id}>
                                <td>{r.id}</td>
                                <td>{r.requester_name}</td>
                                <td>{r.student_id}</td>
                                <td>
                                    <button className="edit-btn" onClick={() => handleAction(r.id, 'approve')}>Duyệt</button>
                                    <button className="delete-btn" onClick={() => handleAction(r.id, 'reject')}>Từ chối</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    )
}

const EXTERNAL_VERIFICATION_LABELS = {
    VERIFIED: 'Hợp lệ trên Blockchain',
    MISMATCH: 'Dữ liệu không khớp Blockchain',
    NAME_MISMATCH: 'Họ tên không khớp',
    NOT_FOUND: 'Không tìm thấy sinh viên',
    BLOCKCHAIN_UNAVAILABLE: 'Không thể kết nối Blockchain',
    PENDING: 'Chưa đối chiếu',
}

const EXTERNAL_VERIFICATION_LABELS_V2 = {
    VERIFIED: 'Khớp MySQL và Blockchain',
    MYSQL_MISMATCH: 'Không khớp MySQL',
    BLOCKCHAIN_MISMATCH: 'MySQL không khớp Blockchain',
    NOT_FOUND: 'Không tìm thấy sinh viên',
    BLOCKCHAIN_UNAVAILABLE: 'Không thể kết nối Blockchain',
    PENDING: 'Chưa đối chiếu',
}

const EXTERNAL_IMPORT_FIELD_LABELS = {
    student_id: 'Mã số sinh viên',
    full_name: 'Họ và tên',
    date_of_birth: 'Ngày sinh',
    citizen_id: 'Số CCCD/CMND',
    email: 'Email',
    institution_code: 'Mã trường',
    institution_name: 'Tên trường',
    faculty_name: 'Khoa',
    major: 'Chuyên ngành',
    training_mode: 'Hình thức đào tạo',
    degree_type: 'Loại bằng',
    entrance_year: 'Khóa nhập học',
    graduation_status: 'Trạng thái tốt nghiệp',
    graduation_date: 'Ngày tốt nghiệp',
    graduation_year: 'Năm tốt nghiệp',
    gpa: 'GPA',
    classification: 'Xếp loại',
    total_credits: 'Tổng tín chỉ',
    expected_graduation_date: 'Ngày tốt nghiệp dự kiến',
    academic_status: 'Tình trạng học tập',
}

// eslint-disable-next-line no-unused-vars
const ExternalRequestsComparisonModule = () => {
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('')
    const [showImportForm, setShowImportForm] = useState(false)
    const [selectedFile, setSelectedFile] = useState(null)
    const [importing, setImporting] = useState(false)
    const [summary, setSummary] = useState(null)
    const [companyForm, setCompanyForm] = useState({
        companyName: '',
        companyEmail: '',
        message: '',
    })

    const loadRequests = useCallback(async (selectedStatus = filter) => {
        setLoading(true)
        try {
            const data = await getExternalRequests(selectedStatus)
            setRequests(data.items || [])
        } catch (err) {
            showAdminNotice(`Lỗi: ${translateErrorMessage(err.message)}`)
        } finally {
            setLoading(false)
        }
  }, [filter])

    useEffect(() => {
        loadRequests()
    }, [loadRequests])

    const handleImport = async (event) => {
        event.preventDefault()

        if (!selectedFile) {
            showAdminNotice('Vui lòng chọn tệp CSV hoặc Excel (.xlsx).')
            return
        }

        setImporting(true)
        setSummary(null)
        try {
            const result = await importExternalVerificationFile({
                companyName: companyForm.companyName.trim(),
                companyEmail: companyForm.companyEmail.trim(),
                message: companyForm.message.trim(),
                file: selectedFile,
            })
            setSummary(result)
            setSelectedFile(null)
            setCompanyForm({ companyName: '', companyEmail: '', message: '' })
            setShowImportForm(false)
            setFilter('PENDING_REVIEW')
            await loadRequests('PENDING_REVIEW')
        } catch (err) {
            showAdminNotice(`Không thể nhập tệp: ${translateErrorMessage(err.message)}`)
        } finally {
            setImporting(false)
        }
    }

    const handleApprove = async (requestId) => {
        try {
            await approveExternalRequest(requestId)
            await loadRequests()
        } catch (err) {
            showAdminNotice(`Không thể duyệt: ${translateErrorMessage(err.message)}`)
        }
    }

    const handleReject = async (requestId) => {
        const reason = window.prompt('Nhập lý do từ chối yêu cầu này:')
        if (!reason || !reason.trim()) return

        try {
            await rejectExternalRequest(requestId, reason.trim())
            await loadRequests()
        } catch (err) {
            showAdminNotice(`Không thể từ chối: ${translateErrorMessage(err.message)}`)
        }
    }

    const getVerificationLabel = (request) =>
        EXTERNAL_VERIFICATION_LABELS_V2[request.verification_status]
        || EXTERNAL_VERIFICATION_LABELS[request.verification_status]
        || 'Chưa đối chiếu'

    const getImportedData = (request) => {
        try {
            const importedData = JSON.parse(request.import_data || '{}')
            return importedData && typeof importedData === 'object' ? importedData : {}
        } catch {
            return {}
        }
    }

    return (
        <div className="module-container">
            <div className="module-header external-request-header">
                <div>
                    <h1>Yêu cầu từ Doanh nghiệp</h1>
                    <p className="external-request-subtitle">
                        Nhập tệp CSV hoặc Excel để đối chiếu MSSV với MySQL và Blockchain.
                    </p>
                </div>
                <button
                    type="button"
                    className="add-btn"
                    onClick={() => setShowImportForm((visible) => !visible)}
                >
                    {showImportForm ? 'Đóng biểu mẫu' : '+ Nhập tệp doanh nghiệp'}
                </button>
            </div>

            {showImportForm && (
                <form className="external-import-panel" onSubmit={handleImport}>
                    <div className="external-import-grid">
                        <label>
                            Tên doanh nghiệp
                            <input
                                required
                                value={companyForm.companyName}
                                onChange={(event) => setCompanyForm((current) => ({
                                    ...current,
                                    companyName: event.target.value,
                                }))}
                                placeholder="Ví dụ: Công ty ABC"
                            />
                        </label>
                        <label>
                            Email doanh nghiệp (không bắt buộc)
                            <input
                                type="email"
                                value={companyForm.companyEmail}
                                onChange={(event) => setCompanyForm((current) => ({
                                    ...current,
                                    companyEmail: event.target.value,
                                }))}
                                placeholder="hr@congty.vn"
                            />
                        </label>
                        <label className="external-file-input">
                            Tệp đối chiếu
                            <input
                                required
                                type="file"
                                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                            />
                        </label>
                        <label>
                            Mục đích đối chiếu (không bắt buộc)
                            <input
                                value={companyForm.message}
                                onChange={(event) => setCompanyForm((current) => ({
                                    ...current,
                                    message: event.target.value,
                                }))}
                                placeholder="Ví dụ: Xác minh thông tin ứng viên"
                            />
                        </label>
                    </div>
                    <div className="external-import-hint">
                        <strong>Tệp bắt buộc có cột MSSV.</strong> Các cột đối chiếu tùy chọn gồm: Họ và tên, Ngày sinh, Email, Khoa, Chuyên ngành, GPA, Xếp loại, Năm tốt nghiệp và Trạng thái tốt nghiệp.<br />
                        Hệ thống chỉ xác thực Blockchain khi tất cả dữ liệu mà doanh nghiệp đã điền khớp với MySQL.
                    </div>
                    <div className="external-import-actions">
                        <span>{selectedFile ? `Đã chọn: ${selectedFile.name}` : 'Chưa chọn tệp'}</span>
                        <button className="add-btn" type="submit" disabled={importing}>
                            {importing ? 'Đang đối chiếu...' : 'Nhập và đối chiếu'}
                        </button>
                    </div>
                </form>
            )}

            {summary && (
                <div className="external-import-summary" role="status">
                    <strong>Đã xử lý tệp {summary.file_name}.</strong>{' '}
                    {summary.imported_rows}/{summary.total_rows} dòng được lưu; hợp lệ: {summary.verified_count}, không khớp: {summary.mismatch_count}, không tìm thấy: {summary.not_found_count}, chưa kết nối Blockchain: {summary.unavailable_count}.
                    {summary.invalid_rows?.length > 0 && (
                        <span> Có {summary.invalid_rows.length} dòng MSSV không đúng định dạng.</span>
                    )}
                </div>
            )}

            <div className="external-filter-bar">
                <label>
                    Trạng thái xử lý
                    <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                        <option value="">Tất cả</option>
                        <option value="PENDING_REVIEW">Chờ duyệt</option>
                        <option value="APPROVED">Đã duyệt</option>
                        <option value="REJECTED">Đã từ chối</option>
                    </select>
                </label>
                <button type="button" className="secondary-btn" onClick={() => loadRequests()}>
                    Tải lại
                </button>
            </div>

            {loading ? <p>Đang tải...</p> : (
                <div className="table-wrapper">
                    <table className="data-table external-request-table">
                        <thead>
                            <tr>
                                <th>Mã YC</th>
                                <th>Doanh nghiệp</th>
                                <th>Tệp</th>
                                <th>MSSV</th>
                                <th>Họ tên trong tệp</th>
                                <th>Kết quả đối chiếu</th>
                                <th>Trạng thái</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.length === 0 ? (
                                <tr><td colSpan="8">Không có yêu cầu phù hợp.</td></tr>
                            ) : requests.map((request) => {
                                const canApprove = (
                                    request.status === 'PENDING_REVIEW'
                                    && request.verification_status === 'VERIFIED'
                                )
                                const isPending = request.status === 'PENDING_REVIEW'
                                const importedData = getImportedData(request)

                                return (
                                    <tr key={request.id}>
                                        <td>#{request.id}</td>
                                        <td>
                                            <strong>{request.requester_name || 'Không rõ'}</strong>
                                            {request.requester_email && <small>{request.requester_email}</small>}
                                        </td>
                                        <td title={request.source_file_name || ''} className="external-file-name">
                                            {request.source_file_name || 'Nhập thủ công'}
                                        </td>
                                        <td>{request.student_id}</td>
                                        <td>{request.full_name || '---'}</td>
                                        <td>
                                            <span
                                                className={`external-verification-status ${String(request.verification_status || 'PENDING').toLowerCase()}`}
                                                title={request.verification_message || ''}
                                            >
                                                {getVerificationLabel(request)}
                                            </span>
                                            {request.verification_message && (
                                                <small className="external-verification-message">
                                                    {request.verification_message}
                                                </small>
                                            )}
                                            {Object.keys(importedData).length > 0 && (
                                                <details className="external-imported-data">
                                                    <summary>Xem dữ liệu trong tệp</summary>
                                                    <dl>
                                                        {Object.entries(EXTERNAL_IMPORT_FIELD_LABELS).map(([field, label]) => (
                                                            importedData[field] ? (
                                                                <div key={field}>
                                                                    <dt>{label}</dt>
                                                                    <dd>{String(importedData[field])}</dd>
                                                                </div>
                                                            ) : null
                                                        ))}
                                                    </dl>
                                                </details>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`status-badge ${request.status.toLowerCase()}`}>
                                                {request.status === 'PENDING_REVIEW'
                                                    ? 'Chờ duyệt'
                                                    : request.status === 'APPROVED'
                                                        ? 'Đã duyệt'
                                                        : 'Đã từ chối'}
                                            </span>
                                        </td>
                                        <td className="external-action-cell">
                                            {isPending ? (
                                                <>
                                                    <button
                                                        className="edit-btn"
                                                        type="button"
                                                        disabled={!canApprove}
                                                        title={canApprove ? 'Duyệt kết quả hợp lệ' : getVerificationLabel(request)}
                                                        onClick={() => handleApprove(request.id)}
                                                    >
                                                        Duyệt
                                                    </button>
                                                    <button
                                                        className="delete-btn"
                                                        type="button"
                                                        onClick={() => handleReject(request.id)}
                                                    >
                                                        Từ chối
                                                    </button>
                                                </>
                                            ) : (
                                                <span className="processed-request">Đã xử lý</span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

const EXTERNAL_REVIEW_STATUS_LABELS = {
    READY_FOR_REVIEW: 'Đủ dữ liệu - chờ duyệt',
    STUDENT_NOT_GRADUATED: 'Chưa tốt nghiệp - có thể tiếp nhận',
    GPA_REQUIRED: 'Thiếu điểm GPA',
    INVALID_SOURCE_DATA: 'Dữ liệu nguồn không hợp lệ',
    NOT_FPT_INSTITUTION: 'Không thuộc Trường Đại học FPT',
    DUPLICATE_STUDENT_ID: 'Mã số sinh viên đã tồn tại',
    DUPLICATE_EMAIL: 'Email đã tồn tại',
    DUPLICATE_CITIZEN_ID: 'CCCD/CMND đã tồn tại',
    DUPLICATE_IN_FILE: 'Trùng trong cùng tệp',
    IMPORTED_TO_SCHOOL: 'Đã chuyển vào Quản lý sinh viên',
    PENDING: 'Dữ liệu cũ - chưa phân loại',
    VERIFIED: 'Dữ liệu cũ đã đối chiếu',
}

const EXTERNAL_REQUEST_STATUS_LABELS = {
    PENDING_REVIEW: 'Chờ xử lý',
    APPROVED: 'Đã tiếp nhận',
    REJECTED: 'Đã từ chối',
}

const EXTERNAL_CLASSIFICATION_LABELS = {
    Excellent: 'Xuất sắc',
    'Very Good': 'Giỏi',
    Good: 'Khá',
    Average: 'Trung bình',
    Weak: 'Yếu',
}

const parseExternalImportData = (request) => {
    try {
        const data = JSON.parse(request?.import_data || '{}')
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
    } catch {
        return {}
    }
}

const formatExternalImportValue = (field, value) => {
    if (value === null || value === undefined || value === '') return '---'

    if (['date_of_birth', 'graduation_date', 'expected_graduation_date'].includes(field)) {
        return toDisplayDate(String(value))
    }

    if (field === 'gpa') return formatGpa(value)
    if (field === 'classification') {
        return EXTERNAL_CLASSIFICATION_LABELS[value] || String(value)
    }
    if (field === 'graduation_status') {
        return value === 'GRADUATED' ? 'Đã tốt nghiệp' : 'Chưa tốt nghiệp'
    }

    return String(value)
}

const getExternalGraduationStatus = (request) => String(
  request?.graduation_status ??
    request?.graduationStatus ??
    '',
).toUpperCase()

const isExternalStudentGraduated = (request) => (
  getExternalGraduationStatus(request) === 'GRADUATED'
)

const getExternalApprovalBlockReason = (request) => {
  const graduationStatus = getExternalGraduationStatus(request)
  const rawGpa = request?.gpa
  const hasGpa =
    rawGpa !== null &&
    rawGpa !== undefined &&
    String(rawGpa).trim() !== ''

  if (graduationStatus === 'GRADUATED' && !hasGpa) {
    return (
      'Chưa thể duyệt: Sinh viên đã tốt nghiệp nhưng hồ sơ chưa có điểm GPA. ' +
      'Vui lòng bổ sung GPA rồi kiểm tra lại.'
    )
  }

  if (graduationStatus === 'NOT_GRADUATED' && hasGpa) {
    return (
      'Chưa thể duyệt: Hồ sơ ghi sinh viên chưa tốt nghiệp nhưng lại có điểm GPA. ' +
      'Vui lòng kiểm tra lại dữ liệu trong tệp.'
    )
  }

  return ''
}

// EXTERNAL_STUDENT_INTAKE_UI_V1
const getExternalReviewMessage = (request) => {
  const blockReason = getExternalApprovalBlockReason(request)
  if (blockReason) return blockReason

  const reviewStatus = request?.verification_status
  const isReady = [
    'READY_FOR_REVIEW',
    'STUDENT_NOT_GRADUATED',
  ].includes(reviewStatus)

  if (isReady && isExternalStudentGraduated(request)) {
    return (
      'Sinh viên đã tốt nghiệp và có điểm GPA. Hồ sơ chưa được tiếp nhận. ' +
      'Bấm Tiếp nhận để chuyển sinh viên vào Quản lý sinh viên và chờ duyệt ghi Blockchain.'
    )
  }

  if (isReady) {
    return (
      'Sinh viên chưa tốt nghiệp và chưa có điểm GPA. Hồ sơ chưa được tiếp nhận. ' +
      'Bấm Tiếp nhận để chuyển sinh viên vào Quản lý sinh viên với trạng thái ' +
      'Chưa tốt nghiệp; chưa tạo giao dịch Fabric.'
    )
  }

  return request?.verification_message || ''
}

const ExternalRequestsModule = () => {
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState('PENDING_REVIEW')
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [totalPages, setTotalPages] = useState(1)

    const [showImportForm, setShowImportForm] = useState(false)
    const [selectedFile, setSelectedFile] = useState(null)
    const [fileInputKey, setFileInputKey] = useState(0)
    const [importing, setImporting] = useState(false)
    const [importSummary, setImportSummary] = useState(null)
    const [notice, setNotice] = useState('')
    const [sourceName, setSourceName] = useState('')

    const [detailRequest, setDetailRequest] = useState(null)
    const [approveRequest, setApproveRequest] = useState(null)
    const [rejectRequest, setRejectRequest] = useState(null)
    const [archiveRequest, setArchiveRequest] = useState(null)
    const [restoreRequest, setRestoreRequest] = useState(null)
    const [rejectReason, setRejectReason] = useState('')
    const [actionLoadingId, setActionLoadingId] = useState(null)

    const pageSize = 20

    const loadRequests = async (overrides = {}) => {
        const nextStatus = overrides.status ?? statusFilter
        const nextSearch = overrides.search ?? search
        const nextPage = overrides.page ?? page
        const isArchiveView = nextStatus === 'ARCHIVED'

        setLoading(true)
        try {
            const data = await getExternalRequests({
                status: isArchiveView ? '' : nextStatus,
                search: nextSearch,
                page: nextPage,
                pageSize,
                isDeleted: isArchiveView,
            })
            setRequests(data.items || [])
            setTotal(data.total || 0)
            setTotalPages(Math.max(data.total_pages || 1, 1))
        } catch (err) {
            showAdminNotice(`Không thể tải hồ sơ nguồn: ${translateErrorMessage(err.message)}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadRequests()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter, search, page])

    const handleSearch = (event) => {
        event.preventDefault()
        setPage(1)
        setSearch(searchInput.trim())
    }

    const handleStatusFilter = (event) => {
        setPage(1)
        setStatusFilter(event.target.value)
        setDetailRequest(null)
    }

    const handleImport = async (event) => {
        event.preventDefault()
        setNotice('')
        setImportSummary(null)

        if (!sourceName.trim()) {
            showAdminNotice('Vui lòng nhập nguồn dữ liệu.')
            return
        }
        if (!selectedFile) {
            showAdminNotice('Vui lòng chọn tệp CSV hoặc Excel (.xlsx).')
            return
        }

        setImporting(true)
        try {
            const result = await importExternalVerificationFile({
                companyName: sourceName.trim(),
                companyEmail: '',
                message: '',
                file: selectedFile,
            })

            setImportSummary(result)
            setSelectedFile(null)
            setFileInputKey((current) => current + 1)
            setSourceName('')
            setShowImportForm(false)
            setStatusFilter('PENDING_REVIEW')
            setSearchInput('')
            setSearch('')
            setPage(1)
            await loadRequests({ status: 'PENDING_REVIEW', search: '', page: 1 })
        } catch (err) {
            showAdminNotice(`Không thể nhập tệp: ${translateErrorMessage(err.message)}`)
        } finally {
            setImporting(false)
        }
    }

    const handleApprove = async () => {
        if (!approveRequest) return

        const blockReason = getExternalApprovalBlockReason(approveRequest)
        if (blockReason) {
            showAdminNotice(blockReason)
            setApproveRequest(null)
            return
        }

        setActionLoadingId(approveRequest.id)
        setNotice('')
        try {
            await approveExternalRequest(approveRequest.id)
            const intakeMessage = isExternalStudentGraduated(approveRequest)
                ? ' Hồ sơ tốt nghiệp đang chờ duyệt ghi Blockchain.'
                : ' Sinh viên chưa tốt nghiệp nên chưa cần ghi Blockchain.'
            setNotice(
                `Đã tiếp nhận sinh viên ${approveRequest.student_id} vào Quản lý sinh viên.${intakeMessage}`
            )
            setApproveRequest(null)
            setDetailRequest(null)
            await loadRequests()
        } catch (err) {
            showAdminNotice(`Không thể tiếp nhận hồ sơ: ${translateErrorMessage(err.message)}`)
        } finally {
            setActionLoadingId(null)
        }
    }

    const handleReject = async (event) => {
        event.preventDefault()
        if (!rejectRequest || rejectReason.trim().length < 2) {
            showAdminNotice('Vui lòng nhập lý do từ chối.')
            return
        }

        setActionLoadingId(rejectRequest.id)
        setNotice('')
        try {
            const result = await rejectExternalRequest(rejectRequest.id, rejectReason)
            setNotice(
                `Đã từ chối hồ sơ sinh viên ${rejectRequest.student_id}. Mã giao dịch Fabric: ${result.blockchain_tx_id || 'đã tạo'}.`
            )
            setRejectRequest(null)
            setRejectReason('')
            setDetailRequest(null)
            await loadRequests()
        } catch (err) {
            showAdminNotice(`Không thể từ chối hồ sơ: ${translateErrorMessage(err.message)}`)
        } finally {
            setActionLoadingId(null)
        }
    }

    const openRejectModal = (request) => {
        setRejectRequest(request)
        setRejectReason('')
    }

    const openApproveModal = (request) => {
        const blockReason = getExternalApprovalBlockReason(request)
        if (blockReason) {
            showAdminNotice(blockReason)
            return
        }

        setApproveRequest(request)
    }

    const handleArchive = async () => {
        if (!archiveRequest) return

        setActionLoadingId(archiveRequest.id)
        setNotice('')
        try {
            await archiveExternalRequest(archiveRequest.id)
            setNotice(`Đã đưa hồ sơ ${archiveRequest.student_id} vào danh sách lưu trữ.`)
            setArchiveRequest(null)
            setDetailRequest(null)
            await loadRequests()
        } catch (err) {
            showAdminNotice(`Không thể lưu trữ hồ sơ: ${translateErrorMessage(err.message)}`)
        } finally {
            setActionLoadingId(null)
        }
    }

    const handleRestore = async () => {
        if (!restoreRequest) return

        setActionLoadingId(restoreRequest.id)
        setNotice('')
        try {
            await restoreExternalRequest(restoreRequest.id)
            setNotice(`Đã khôi phục hồ sơ ${restoreRequest.student_id}.`)
            setRestoreRequest(null)
            setDetailRequest(null)
            await loadRequests()
        } catch (err) {
            showAdminNotice(`Không thể khôi phục hồ sơ: ${translateErrorMessage(err.message)}`)
        } finally {
            setActionLoadingId(null)
        }
    }

    const getReviewLabel = (request) => {
        const blockReason = getExternalApprovalBlockReason(request)
        if (blockReason) return 'Cần kiểm tra lại hồ sơ'

        const isReady = [
            'READY_FOR_REVIEW',
            'STUDENT_NOT_GRADUATED',
        ].includes(request.verification_status)

        if (isReady && isExternalStudentGraduated(request)) {
            return 'Đã tốt nghiệp, có GPA - chờ duyệt'
        }

        if (isReady) {
            return 'Chưa tốt nghiệp, chưa có GPA - chờ duyệt'
        }

        return (
            EXTERNAL_REVIEW_STATUS_LABELS[request.verification_status]
            || request.verification_status
            || 'Chưa phân loại'
        )
    }

    const canApprove = (request) => (
        request.status === 'PENDING_REVIEW'
        && ['READY_FOR_REVIEW', 'STUDENT_NOT_GRADUATED'].includes(
            request.verification_status
        )
        && !getExternalApprovalBlockReason(request)
    )

    const canReject = (request) => request.status === 'PENDING_REVIEW'

    const isArchiveView = statusFilter === 'ARCHIVED'
    const canArchive = (request) => (
        !isArchiveView
        && (request.status === 'APPROVED' || request.status === 'REJECTED')
    )

    const detailData = detailRequest ? parseExternalImportData(detailRequest) : {}
    const approveData = approveRequest ? parseExternalImportData(approveRequest) : {}
    const detailReviewMessage = detailRequest
        ? getExternalReviewMessage(detailRequest)
        : ''

    return (
        <div className="module-container external-intake-page">
            <div className="module-header external-request-header">
                <div>
                    <h1>Yêu cầu từ Doanh nghiệp</h1>
                    <p className="external-request-subtitle">
                        Hồ sơ sinh viên từ nguồn bên ngoài chờ nhà trường xác nhận.
                    </p>
                </div>
                <button
                    type="button"
                    className="add-btn"
                    onClick={() => setShowImportForm((visible) => !visible)}
                >
                    {showImportForm ? 'Đóng biểu mẫu' : '+ Nhập tệp dữ liệu'}
                </button>
            </div>

            {showImportForm && (
                <form className="external-import-panel" onSubmit={handleImport}>
                    <div className="external-import-grid">
                        <label>
                            Nguồn dữ liệu
                            <input
                                required
                                maxLength="100"
                                value={sourceName}
                                onChange={(event) => setSourceName(event.target.value)}
                                placeholder="Ví dụ: Công ty ABC hoặc hệ thống tuyển dụng"
                            />
                        </label>
                        <label className="external-file-input">
                            Tệp dữ liệu CSV hoặc Excel
                            <input
                                key={fileInputKey}
                                required
                                type="file"
                                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                            />
                        </label>
                    </div>
                    <div className="external-import-actions">
                        <span title={selectedFile?.name || ''}>
                            {selectedFile ? selectedFile.name : 'Chưa chọn tệp'}
                        </span>
                        <button className="add-btn" type="submit" disabled={importing}>
                            {importing ? 'Đang nhập dữ liệu...' : 'Nhập hồ sơ'}
                        </button>
                    </div>
                </form>
            )}

            {importSummary && (
                <div className="external-import-summary" role="status">
                    <strong>{importSummary.file_name}</strong>
                    <span>Tổng số dòng: {importSummary.total_rows}</span>
                    <span>Đã ghi nhận: {importSummary.imported_rows}</span>
                    <span>Có thể duyệt: {importSummary.ready_for_review_count}</span>
                    <span>Không hợp lệ: {importSummary.invalid_count}</span>
                    <span>Trùng dữ liệu: {importSummary.duplicate_count}</span>
                    <span>Không thuộc FPT: {importSummary.non_fpt_count}</span>
                    {importSummary.invalid_rows?.length > 0 && (
                        <details>
                            <summary>Xem các dòng cần kiểm tra</summary>
                            <ul>
                                {importSummary.invalid_rows.map((row) => (
                                    <li key={`${row.row_number}-${row.student_id || ''}`}>
                                        Dòng {row.row_number}{row.student_id ? ` - ${row.student_id}` : ''}: {row.message}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            )}

            {notice && <div className="external-action-notice" role="status">{notice}</div>}

            <div className="external-filter-bar external-intake-toolbar">
                <label>
                    Trạng thái
                    <select value={statusFilter} onChange={handleStatusFilter}>
                        <option value="PENDING_REVIEW">Chờ xử lý</option>
                        <option value="APPROVED">Đã duyệt</option>
                        <option value="REJECTED">Đã từ chối</option>
                        <option value="ARCHIVED">Đã lưu trữ</option>
                        <option value="">Tất cả</option>
                    </select>
                </label>
                <form className="external-search-form" onSubmit={handleSearch}>
                    <label>
                        Tìm hồ sơ
                        <input
                            value={searchInput}
                            onChange={(event) => setSearchInput(event.target.value)}
                            placeholder="MSSV, họ tên hoặc tên đơn vị"
                        />
                    </label>
                    <button type="submit" className="secondary-btn external-search-submit">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m16.5 16.5 4 4" />
                        </svg>
                        <span>Tìm</span>
                    </button>
                    {(search || searchInput) && (
                        <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => {
                                setSearchInput('')
                                setSearch('')
                                setPage(1)
                            }}
                        >
                            Xóa tìm kiếm
                        </button>
                    )}
                </form>
                <button type="button" className="secondary-btn" onClick={() => loadRequests()}>
                    Tải lại
                </button>
            </div>

            {loading ? <p>Đang tải hồ sơ...</p> : (
                <div className="table-wrapper">
                    <table className="data-table external-intake-table">
                        <thead>
                            <tr>
                                <th>Nguồn dữ liệu</th>
                                <th>Sinh viên</th>
                                <th>Trường trong tệp</th>
                                <th>Kiểm tra hồ sơ</th>
                                <th>Trạng thái</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.length === 0 ? (
                                <tr><td colSpan="6">Không có hồ sơ phù hợp.</td></tr>
                            ) : requests.map((request) => {
                                const importedData = parseExternalImportData(request)
                                const busy = actionLoadingId === request.id
                                const approvalBlockReason = getExternalApprovalBlockReason(request)
                                const reviewMessage = getExternalReviewMessage(request)

                                return (
                                    <tr key={request.id}>
                                        <td>
                                            <strong>{request.requester_name || 'Nguồn ngoài'}</strong>
                                            <small>{request.source_file_name || 'Dữ liệu cũ'}</small>
                                            {request.source_row_number && (
                                                <small>Dòng {request.source_row_number}</small>
                                            )}
                                        </td>
                                        <td>
                                            <strong>{request.student_id || '---'}</strong>
                                            <small>{request.full_name || importedData.full_name || 'Chưa có họ tên'}</small>
                                        </td>
                                        <td>
                                            {importedData.institution_name || '---'}
                                            {importedData.institution_code && (
                                                <small>{importedData.institution_code}</small>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`external-review-status ${String(request.verification_status || 'PENDING').toLowerCase()}`}>
                                                {getReviewLabel(request)}
                                            </span>
                                            {reviewMessage && (
                                                <small className="external-verification-message">
                                                    {reviewMessage}
                                                </small>
                                            )}
                                            {approvalBlockReason
                                                && approvalBlockReason !== reviewMessage && (
                                                <small className="external-approval-block-reason" role="alert">
                                                    {approvalBlockReason}
                                                </small>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`status-badge ${String(request.status || '').toLowerCase()}`}>
                                                {EXTERNAL_REQUEST_STATUS_LABELS[request.status] || request.status}
                                            </span>
                                            {request.blockchain_tx_id && (
                                                <small className="external-ledger-recorded">Đã ghi Blockchain</small>
                                            )}
                                        </td>
                                        <td className="external-action-cell">
                                            <button
                                                type="button"
                                                className="secondary-btn"
                                                onClick={() => setDetailRequest(request)}
                                            >
                                                Chi tiết
                                            </button>
                                            {!isArchiveView && canApprove(request) && (
                                                <button
                                                    type="button"
                                                    className="edit-btn"
                                                    disabled={busy}
                                                    onClick={() => openApproveModal(request)}
                                                >
                                                    Tiếp nhận
                                                </button>
                                            )}
                                            {!isArchiveView && !canApprove(request) && canReject(request) && (
                                                <button
                                                    type="button"
                                                    className="edit-btn external-approve-disabled"
                                                    disabled
                                                    title={approvalBlockReason || 'Hồ sơ chưa đủ điều kiện duyệt'}
                                                >
                                                    Tiếp nhận
                                                </button>
                                            )}
                                            {!isArchiveView && canReject(request) && (
                                                <button
                                                    type="button"
                                                    className="delete-btn"
                                                    disabled={busy}
                                                    onClick={() => openRejectModal(request)}
                                                >
                                                    Từ chối
                                                </button>
                                            )}
                                            {canArchive(request) && (
                                                <button
                                                    type="button"
                                                    className="secondary-btn external-archive-btn"
                                                    disabled={busy}
                                                    onClick={() => setArchiveRequest(request)}
                                                >
                                                    Lưu trữ
                                                </button>
                                            )}
                                            {isArchiveView && (
                                                <button
                                                    type="button"
                                                    className="edit-btn external-restore-btn"
                                                    disabled={busy}
                                                    onClick={() => setRestoreRequest(request)}
                                                >
                                                    Khôi phục
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="external-pagination" aria-label="Phân trang hồ sơ nguồn">
                <span>{total} hồ sơ · Trang {page}/{Math.max(totalPages, 1)}</span>
                <button
                    type="button"
                    className="secondary-btn"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                    Trang trước
                </button>
                <button
                    type="button"
                    className="secondary-btn"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((current) => current + 1)}
                >
                    Trang sau
                </button>
            </div>

            {detailRequest && (
                <div className="modal-overlay" role="presentation">
                    <div className="modal-content modal-lg external-detail-modal" role="dialog" aria-modal="true" aria-labelledby="external-detail-title">
                        {/* EXTERNAL_REQUEST_DETAIL_VISUAL_POLISH_V1 */}
                        <div className="external-detail-header">
                            <div>
                                <span className="external-detail-eyebrow">Hồ sơ nguồn</span>
                                <h2 id="external-detail-title">Chi tiết hồ sơ #{detailRequest.id}</h2>
                            </div>
                            <button
                                type="button"
                                className="external-detail-close"
                                aria-label="Đóng chi tiết hồ sơ"
                                onClick={() => setDetailRequest(null)}
                            >
                                ×
                            </button>
                        </div>
                        <div className="external-detail-summary">
                            <div><span>Nguồn dữ liệu</span><strong>{detailRequest.requester_name || '---'}</strong></div>
                            <div><span>Tệp nguồn</span><strong>{detailRequest.source_file_name || 'Dữ liệu cũ'}</strong></div>
                            <div><span>Dòng trong tệp</span><strong>{detailRequest.source_row_number || '---'}</strong></div>
                        </div>
                        <div className="external-detail-result">
                            <strong>{getReviewLabel(detailRequest)}</strong>
                            <p>{detailReviewMessage || 'Không có ghi chú kiểm tra.'}</p>
                            {getExternalApprovalBlockReason(detailRequest)
                                && getExternalApprovalBlockReason(detailRequest) !== detailReviewMessage && (
                                <p className="external-approval-block-reason" role="alert">
                                    {getExternalApprovalBlockReason(detailRequest)}
                                </p>
                            )}
                            {detailRequest.reject_reason && <p>Lý do từ chối: {detailRequest.reject_reason}</p>}
                        </div>
                        {/* EXTERNAL_REQUEST_FABRIC_DECISION_V1 */}
                        {detailRequest.blockchain_tx_id && (
                            <section className="external-blockchain-proof">
                                <div className="external-blockchain-proof-heading">
                                    <div>
                                        <span>Bằng chứng xử lý</span>
                                        <h3>Giao dịch Hyperledger Fabric</h3>
                                    </div>
                                    <span className="external-ledger-badge">Đã ghi Blockchain</span>
                                </div>
                                <dl>
                                    <div>
                                        <dt>Hành động</dt>
                                        <dd>{detailRequest.blockchain_action === 'EXTERNAL_REQUEST_REJECTED' ? 'Từ chối hồ sơ nguồn ngoài' : 'Duyệt và ghi hồ sơ sinh viên'}</dd>
                                    </div>
                                    <div>
                                        <dt>Mã giao dịch</dt>
                                        <dd className="external-ledger-hash">{detailRequest.blockchain_tx_id}</dd>
                                    </div>
                                    {detailRequest.source_data_hash && (
                                        <div>
                                            <dt>Mã băm dữ liệu nguồn</dt>
                                            <dd className="external-ledger-hash">{detailRequest.source_data_hash}</dd>
                                        </div>
                                    )}
                                </dl>
                                <a
                                    className="external-explorer-link"
                                    href={`/explorer/transactions/${detailRequest.blockchain_tx_id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Xem giao dịch trên Explorer →
                                </a>
                            </section>
                        )}
                        <dl className="external-detail-grid">
                            {Object.entries(EXTERNAL_IMPORT_FIELD_LABELS).map(([field, label]) => (
                                <div key={field}>
                                    <dt>{label}</dt>
                                    <dd>{formatExternalImportValue(field, detailData[field])}</dd>
                                </div>
                            ))}
                        </dl>
                        <div className="modal-actions">
                            <button type="button" className="secondary-btn" onClick={() => setDetailRequest(null)}>
                                Đóng
                            </button>
                            {canReject(detailRequest) && (
                                <button
                                    type="button"
                                    className={`edit-btn ${canApprove(detailRequest) ? '' : 'external-approve-disabled'}`}
                                    disabled={!canApprove(detailRequest)}
                                    title={getExternalApprovalBlockReason(detailRequest) || undefined}
                                    onClick={() => openApproveModal(detailRequest)}
                                >
                                    Tiếp nhận hồ sơ
                                </button>
                            )}
                            {canReject(detailRequest) && (
                                <button type="button" className="delete-btn" onClick={() => openRejectModal(detailRequest)}>
                                    Từ chối
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {approveRequest && (
                <div className="modal-overlay" role="presentation">
                    <div className="modal-content external-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="approve-external-title">
                        <h2 id="approve-external-title">Tiếp nhận hồ sơ sinh viên</h2>
                        <p>
                            Xác nhận đưa <strong>{approveData.full_name || approveRequest.full_name}</strong>
                            {' '}({approveRequest.student_id}) vào Quản lý sinh viên.
                            {' '}
                            {isExternalStudentGraduated(approveRequest)
                                ? 'Hồ sơ tốt nghiệp sẽ chờ duyệt ghi Blockchain; chưa tạo giao dịch Fabric ở bước này.'
                                : 'Sinh viên sẽ được tiếp nhận với trạng thái Chưa tốt nghiệp; chưa tạo giao dịch Fabric.'}
                        </p>
                        <div className="modal-actions">
                            <button type="button" className="secondary-btn" onClick={() => setApproveRequest(null)} disabled={actionLoadingId === approveRequest.id}>
                                Hủy
                            </button>
                            <button type="button" className="edit-btn" onClick={handleApprove} disabled={actionLoadingId === approveRequest.id}>
                                {actionLoadingId === approveRequest.id ? 'Đang tiếp nhận...' : 'Xác nhận tiếp nhận'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {rejectRequest && (
                <div className="modal-overlay" role="presentation">
                    <form className="modal-content external-confirm-modal" onSubmit={handleReject} role="dialog" aria-modal="true" aria-labelledby="reject-external-title">
                        <h2 id="reject-external-title">Từ chối hồ sơ sinh viên</h2>
                        <p>{rejectRequest.student_id} · {rejectRequest.full_name || 'Chưa có họ tên'}</p>
                        <p className="external-chaincode-privacy-note">
                            Quyết định và mã băm dữ liệu nguồn sẽ được ghi lên Blockchain. Lý do chi tiết chỉ lưu trong hệ thống quản trị.
                        </p>
                        <label>
                            Lý do từ chối
                            <textarea
                                required
                                autoFocus
                                minLength="2"
                                maxLength="1000"
                                rows="4"
                                value={rejectReason}
                                onChange={(event) => setRejectReason(event.target.value)}
                                placeholder="Nhập lý do để lưu vào lịch sử xử lý"
                            />
                        </label>
                        <div className="modal-actions">
                            <button type="button" className="secondary-btn" onClick={() => setRejectRequest(null)} disabled={actionLoadingId === rejectRequest.id}>
                                Hủy
                            </button>
                            <button type="submit" className="delete-btn" disabled={actionLoadingId === rejectRequest.id}>
                                {actionLoadingId === rejectRequest.id ? 'Đang xử lý...' : 'Xác nhận từ chối'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {archiveRequest && (
                <div className="modal-overlay" role="presentation">
                    <div className="modal-content external-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="archive-external-title">
                        <h2 id="archive-external-title">Lưu trữ hồ sơ đã xử lý</h2>
                        <p>
                            Hồ sơ <strong>{archiveRequest.student_id}</strong> sẽ được ẩn khỏi danh sách làm việc thông thường.
                        </p>
                        <p className="external-storage-note">
                            Thao tác này không xóa sinh viên trong MySQL và không thay đổi dữ liệu trên Blockchain.
                        </p>
                        <div className="modal-actions">
                            <button type="button" className="secondary-btn" onClick={() => setArchiveRequest(null)} disabled={actionLoadingId === archiveRequest.id}>
                                Hủy
                            </button>
                            <button type="button" className="delete-btn" onClick={handleArchive} disabled={actionLoadingId === archiveRequest.id}>
                                {actionLoadingId === archiveRequest.id ? 'Đang lưu trữ...' : 'Xác nhận lưu trữ'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {restoreRequest && (
                <div className="modal-overlay" role="presentation">
                    <div className="modal-content external-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="restore-external-title">
                        <h2 id="restore-external-title">Khôi phục hồ sơ</h2>
                        <p>
                            Đưa hồ sơ <strong>{restoreRequest.student_id}</strong> trở lại danh sách đã xử lý?
                        </p>
                        <div className="modal-actions">
                            <button type="button" className="secondary-btn" onClick={() => setRestoreRequest(null)} disabled={actionLoadingId === restoreRequest.id}>
                                Hủy
                            </button>
                            <button type="button" className="edit-btn" onClick={handleRestore} disabled={actionLoadingId === restoreRequest.id}>
                                {actionLoadingId === restoreRequest.id ? 'Đang khôi phục...' : 'Xác nhận khôi phục'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ============================================================================
// 4. MODULE: CẤP CHỨNG NHẬN
// ============================================================================
const DEFAULT_CERTIFICATE_WORKING_HOURS =
    'Thứ Hai - Thứ Sáu: 08:00 - 12:00 và 13:00 - 17:30. Thứ Bảy: 08:00 - 12:00. Chủ Nhật nghỉ.'

const CERTIFICATE_STATUS_LABELS = {
    CERTIFICATE_PENDING: 'Chờ xử lý',
    CERTIFICATE_APPROVED: 'Đã duyệt',
    CERTIFICATE_REJECTED: 'Đã từ chối',
}

const CERTIFICATE_MAJOR_LABELS = {
    'Artificial Intelligence': 'Trí tuệ nhân tạo',
    'Software Engineering': 'Kỹ thuật phần mềm',
    'Information Technology': 'Công nghệ thông tin',
    'Information Systems': 'Hệ thống thông tin',
    'Information Assurance': 'An toàn thông tin',
    'Information Security': 'An toàn thông tin',
    'Data Science': 'Khoa học dữ liệu',
    'Digital Art and Design': 'Thiết kế đồ họa và mỹ thuật số',
    'Digital Art & Design': 'Thiết kế đồ họa và mỹ thuật số',
    'Business Administration': 'Quản trị kinh doanh',
    'International Business': 'Kinh doanh quốc tế',
    'Digital Marketing': 'Tiếp thị số',
    Finance: 'Tài chính',
    Banking: 'Ngân hàng',
    'Multimedia Communication': 'Truyền thông đa phương tiện',
    'English Language': 'Ngôn ngữ Anh',
    'Japanese Language': 'Ngôn ngữ Nhật',
    'Korean Language': 'Ngôn ngữ Hàn Quốc',
    'Chinese Language': 'Ngôn ngữ Trung Quốc',
}

const CERTIFICATE_FACULTY_LABELS = {
    'Information Technology': 'Công nghệ thông tin',
    'Business Administration': 'Quản trị kinh doanh',
    'Communication Technology': 'Công nghệ truyền thông',
    Language: 'Ngôn ngữ',
    Law: 'Luật',
}

const CERTIFICATE_CLASSIFICATION_LABELS = {
    Excellent: 'Xuất sắc',
    'Very Good': 'Giỏi',
    Good: 'Khá',
    Average: 'Trung bình',
    Weak: 'Yếu',
}

const getCertificateVietnameseValue = (value, labels) => {
    const normalizedValue = String(value ?? '').trim()
    return labels[normalizedValue] || value
}

const getCertificateStatusLabel = (status) =>
    CERTIFICATE_STATUS_LABELS[status] || status || ''

const escapePrintText = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')

const printValue = (value) => {
    if (value === null || value === undefined || value === '') return '---'
    return escapePrintText(value)
}

const printDate = (value) => {
    if (!value) return '---'
    return escapePrintText(toDisplayDate(value))
}

const openCertificatePrintWindow = (data) => {
    const printWindow = window.open('', '_blank', 'width=900,height=1000')

    if (!printWindow) {
        showAdminNotice('Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép pop-up rồi bấm In giấy lại.')
        return
    }

    const issuedDate = formatVietnamDateOnly(new Date().toISOString())

    const html = `<!doctype html>
<html lang="vi">
<head>
    <meta charset="utf-8" />
    <title>Giấy xác nhận tốt nghiệp - ${printValue(data.student_id)}</title>
    <style>
        @page {
            size: A4;
            margin: 0;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 0;
            color: #111;
            font-family: "Times New Roman", Times, serif;
            background: #e5e7eb;
        }
        .paper {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 24mm 24mm 18mm;
            background: #fff;
        }
        .header {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 22mm;
            text-align: center;
            font-size: 15px;
            line-height: 1.35;
            margin-bottom: 20mm;
        }
        .header strong {
            display: block;
            text-transform: uppercase;
            font-weight: 700;
            letter-spacing: .2px;
        }
        .header .subline {
            display: inline-block;
            border-bottom: 1px solid #111;
            padding-bottom: 2px;
            margin-top: 2px;
        }
        .title {
            text-align: center;
            text-transform: uppercase;
            font-size: 26px;
            font-weight: 700;
            letter-spacing: .8px;
            margin: 0 0 10mm;
        }
        .intro,
        .paragraph {
            font-size: 17px;
            line-height: 1.65;
            margin: 0 0 5mm;
            text-align: justify;
        }
        .info-list {
            width: 100%;
            margin-top: 4mm;
            font-size: 17px;
            line-height: 1.55;
        }
        .info-row {
            display: grid;
            grid-template-columns: 44mm 1fr;
            gap: 4mm;
            margin: 2mm 0;
        }
        .info-row.two-cols {
            grid-template-columns: 44mm 52mm 28mm 1fr;
            column-gap: 4mm;
        }
        .label {
            white-space: nowrap;
        }
        .signature {
            width: 78mm;
            margin: 16mm 0 0 auto;
            text-align: center;
            font-size: 16px;
            line-height: 1.45;
        }
        .signature-date { font-style: italic; }
        .signature-title {
            margin-top: 2mm;
            font-weight: 700;
            text-transform: uppercase;
        }
        .signature-space { height: 30mm; }
        .actions {
            width: 210mm;
            margin: 16px auto 0;
            text-align: right;
        }
        .actions button {
            border: 0;
            border-radius: 8px;
            background: #2563eb;
            color: #fff;
            font-size: 15px;
            font-weight: 700;
            padding: 10px 18px;
            cursor: pointer;
        }
        @media print {
            html, body { width: 210mm; min-height: 297mm; background: #fff; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .paper { width: 210mm; min-height: 297mm; margin: 0; }
            .actions { display: none; }
        }
    </style>
</head>
<body>
    <main class="paper">
        <section class="header">
            <div>
                <strong>Phân hiệu Trường Đại học FPT</strong>
                <strong>tại TP. Hồ Chí Minh</strong>
            </div>
            <div>
                <strong>Cộng hòa xã hội chủ nghĩa Việt Nam</strong>
                <span class="subline">Độc lập - Tự do - Hạnh phúc</span>
            </div>
        </section>

        <h1 class="title">Giấy xác nhận</h1>

        <p class="intro">
            Phân hiệu Trường Đại học FPT tại TP. Hồ Chí Minh xác nhận thông tin như sau:
        </p>

        <section class="info-list">
            <div class="info-row two-cols">
                <span class="label">Sinh viên:</span>
                <span>${printValue(data.full_name)}</span>
                <span class="label">Sinh ngày:</span>
                <span>${printDate(data.date_of_birth)}</span>
            </div>
            <div class="info-row">
                <span class="label">Số CMND/CCCD:</span>
                <span>${printValue(data.citizen_id)}</span>
            </div>
            <div class="info-row">
                <span class="label">Mã số sinh viên:</span>
                <span>${printValue(data.student_id)}</span>
            </div>
            <div class="info-row">
                <span class="label">Ngành học:</span>
                <span>${printValue(getCertificateVietnameseValue(
                    data.major,
                    CERTIFICATE_MAJOR_LABELS,
                ))}</span>
            </div>
            <div class="info-row">
                <span class="label">Khoa:</span>
                <span>${printValue(getCertificateVietnameseValue(
                    data.faculty_name,
                    CERTIFICATE_FACULTY_LABELS,
                ))}</span>
            </div>
            <div class="info-row">
                <span class="label">Năm nhập học:</span>
                <span>${printValue(data.entrance_year)}</span>
            </div>
            <div class="info-row">
                <span class="label">Ngày tốt nghiệp:</span>
                <span>${printDate(data.graduation_date)}</span>
            </div>
            <div class="info-row">
                <span class="label">Tình trạng học tập:</span>
                <span>Đã tốt nghiệp</span>
            </div>
            <div class="info-row">
                <span class="label">Điểm GPA:</span>
                <span>${printValue(formatGpa(data.gpa))}</span>
            </div>
            <div class="info-row">
                <span class="label">Xếp loại:</span>
                <span>${printValue(getCertificateVietnameseValue(
                    data.classification,
                    CERTIFICATE_CLASSIFICATION_LABELS,
                ))}</span>
            </div>
        </section>

        <p class="paragraph">
            Là sinh viên của Phân hiệu Trường Đại học FPT tại TP. Hồ Chí Minh,
            học theo chương trình đại học chính quy.
        </p>

        <section class="signature">
            <div class="signature-date">TP. Hồ Chí Minh, ${printValue(issuedDate)}</div>
            <div class="signature-title">Giám đốc</div>
            <div class="signature-space"></div>
        </section>
    </main>
    <div class="actions">
        <button onclick="window.print()">In hoặc lưu PDF</button>
    </div>
    <script>
        window.addEventListener('load', () => {
            setTimeout(() => window.print(), 300)
        })
    </script>
</body>
</html>`

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
}

// CERTIFICATE_REQUEST_REVIEW_FLOW_V1
const CertificatesModule = () => {
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(true)
    const [processingId, setProcessingId] = useState(null)
    const [activeDialog, setActiveDialog] = useState(null)
    const [reasonDialog, setReasonDialog] = useState(null)
    const [approveForm, setApproveForm] = useState({
        pickupLocation: 'Phòng 202 - Tầng 2',
        workingHours: DEFAULT_CERTIFICATE_WORKING_HOURS,
        extraNote: '',
    })
    const [rejectReason, setRejectReason] = useState('')

    const loadRequests = async () => {
        setLoading(true)
        try {
            const data = await getCertificateRequests()
            setRequests(data.items || data)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadRequests() }, [])

    const openApproveDialog = (request) => {
        setActiveDialog({ type: 'approve', request })
        setApproveForm({
            pickupLocation: 'Phòng 202 - Tầng 2',
            workingHours: DEFAULT_CERTIFICATE_WORKING_HOURS,
            extraNote: '',
        })
    }

    const openRejectDialog = (request) => {
        setActiveDialog({ type: 'reject', request })
        setRejectReason('')
    }

    const closeDialog = () => {
        if (processingId) return
        setActiveDialog(null)
    }

    const handleApproveSubmit = async () => {
        if (!activeDialog?.request) return

        const pickupLocation = approveForm.pickupLocation.trim()
        const workingHours = approveForm.workingHours.trim()
        const extraNote = approveForm.extraNote.trim()

        if (!pickupLocation || !workingHours) {
            showAdminNotice('Vui lòng nhập nơi nhận giấy và giờ làm việc.')
            return
        }

        try {
            const request = activeDialog.request
            setProcessingId(request.id)

            const approvalNote = [
                `Nơi nhận giấy: ${pickupLocation}`,
                `Giờ làm việc: ${workingHours}`,
                extraNote ? `Ghi chú thêm: ${extraNote}` : '',
            ].filter(Boolean).join('\n')

            await approveCertificateRequest(request.id, approvalNote)
            showAdminNotice('Đã duyệt yêu cầu và gửi email thông báo cho người yêu cầu.')
            setActiveDialog(null)
            await loadRequests()
        } catch (err) {
            showAdminNotice(`Lỗi: ${translateErrorMessage(err.message)}`)
        } finally {
            setProcessingId(null)
        }
    }

    const handleRejectSubmit = async () => {
        if (!activeDialog?.request) return

        const reason = rejectReason.trim()

        if (!reason) {
            showAdminNotice('Vui lòng nhập lý do từ chối.')
            return
        }

        try {
            const request = activeDialog.request
            setProcessingId(request.id)
            await rejectCertificateRequest(request.id, reason)
            showAdminNotice('Đã từ chối yêu cầu và gửi email lý do từ chối cho người yêu cầu.')
            setActiveDialog(null)
            await loadRequests()
        } catch (err) {
            showAdminNotice(`Lỗi: ${translateErrorMessage(err.message)}`)
        } finally {
            setProcessingId(null)
        }
    }

    const handlePrintCertificate = async (request) => {
        try {
            setProcessingId(request.id)
            const printData = await getCertificatePrintData(request.id)
            openCertificatePrintWindow(printData)
        } catch (err) {
            showAdminNotice(`Lỗi in giấy: ${translateErrorMessage(err.message)}`)
        } finally {
            setProcessingId(null)
        }
    }

    const activeRequest = activeDialog?.request

    return (
        <div className="module-container">
            <div className="module-header">
                <h1>Cấp Chứng nhận</h1>
            </div>
            {loading ? <p>Đang tải...</p> : (
                <div className="certificate-table-card">
                    <div className="certificate-table-scroll">
                        <table className="data-table certificate-request-table">
                    <thead>
                        <tr>
                            <th>Mã số sinh viên</th>
                            <th>Người yêu cầu</th>
                            <th>Email</th>
                            {/* CERTIFICATE_REQUEST_TIME_COLUMN_V1 */}
                            <th>Thời gian yêu cầu</th>
                            <th>Nội dung yêu cầu</th>
                            <th>Trạng thái</th>
                            <th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        {requests.length === 0 ? <tr><td colSpan="7">Không có yêu cầu cấp giấy</td></tr> : requests.map(r => (
                            <tr key={r.id}>
                                <td>{r.student_id}</td>
                                <td>{r.requester_name}</td>
                                <td>{r.requester_email}</td>
                                <td className="certificate-time-cell">
                                    {formatVietnamDateTime(r.created_at) || '—'}
                                </td>
                                <td>
                                    {r.reason ? (
                                        <button
                                            type="button"
                                            className="edit-btn"
                                            onClick={() => setReasonDialog(r)}
                                            style={{
                                                padding: '8px 14px',
                                                minWidth: '96px',
                                                fontWeight: 700,
                                            }}
                                        >
                                            Xem yêu cầu
                                        </button>
                                    ) : (
                                        <span className="muted-action">Không có</span>
                                    )}
                                </td>
                                <td>
                                    <span className={`status-badge ${r.status === 'CERTIFICATE_APPROVED' ? 'graduated' : 'pending'}`}>
                                        {getCertificateStatusLabel(r.status)}
                                    </span>
                                </td>
                                <td className="certificate-actions-cell">
                                    <div className="certificate-action-group">
                                    {r.status === 'CERTIFICATE_PENDING' && (
                                        <>
                                            <button
                                                className="edit-btn"
                                                onClick={() => openApproveDialog(r)}
                                                disabled={processingId === r.id}
                                            >
                                                Duyệt
                                            </button>
                                            <button
                                                className="delete-btn"
                                                onClick={() => openRejectDialog(r)}
                                                disabled={processingId === r.id}
                                            >
                                                Từ chối
                                            </button>
                                        </>
                                    )}

                                    {r.status === 'CERTIFICATE_APPROVED' && (
                                        <button
                                            className="edit-btn"
                                            onClick={() => handlePrintCertificate(r)}
                                            disabled={processingId === r.id}
                                        >
                                            {processingId === r.id ? 'Đang mở...' : 'In giấy'}
                                        </button>
                                    )}

                                    {r.status === 'CERTIFICATE_REJECTED' && (
                                        <span className="muted-action">Đã xử lý</span>
                                    )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                        </table>
                    </div>
                </div>
            )}

            {reasonDialog && (
                <div className="certificate-dialog-overlay" role="dialog" aria-modal="true">
                    <div className="certificate-dialog">
                        <div className="certificate-dialog-header">
                            <span className="certificate-dialog-icon">i</span>
                            <div>
                                <h2>Chi tiết yêu cầu cấp giấy</h2>
                                <p>{reasonDialog.student_id} · {reasonDialog.requester_name}</p>
                            </div>
                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gap: '10px',
                                marginBottom: '16px',
                                color: '#334155',
                                fontSize: '15px',
                            }}
                        >
                            <div><strong>Email người yêu cầu:</strong> {reasonDialog.requester_email}</div>
                            <div><strong>Trạng thái xử lý:</strong> {getCertificateStatusLabel(reasonDialog.status)}</div>
                        </div>

                        <p className="certificate-dialog-section-label">
                            Mục đích sử dụng giấy xác nhận
                        </p>
                        <div className="certificate-dialog-reason-box">
                            {reasonDialog.reason}
                        </div>

                        {reasonDialog.status === 'CERTIFICATE_PENDING' && (
                            <p className="certificate-dialog-review-note">
                                Kiểm tra tình trạng tốt nghiệp và nội dung yêu cầu trước khi quyết định.
                            </p>
                        )}

                        <div className="certificate-dialog-actions">
                            <button
                                type="button"
                                className="dialog-cancel-btn"
                                onClick={() => setReasonDialog(null)}
                            >
                                Đóng
                            </button>
                            {reasonDialog.status === 'CERTIFICATE_PENDING' && (
                                <>
                                    <button
                                        type="button"
                                        className="dialog-confirm-btn reject"
                                        onClick={() => {
                                            const request = reasonDialog
                                            setReasonDialog(null)
                                            openRejectDialog(request)
                                        }}
                                    >
                                        Từ chối
                                    </button>
                                    <button
                                        type="button"
                                        className="dialog-confirm-btn approve"
                                        onClick={() => {
                                            const request = reasonDialog
                                            setReasonDialog(null)
                                            openApproveDialog(request)
                                        }}
                                    >
                                        Duyệt yêu cầu
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeDialog && activeRequest && (
                <div className="certificate-dialog-overlay" role="dialog" aria-modal="true">
                    <div className={`certificate-dialog ${activeDialog.type === 'reject' ? 'reject' : 'approve'}`}>
                        <div className="certificate-dialog-header">
                            <span className="certificate-dialog-icon">
                                {activeDialog.type === 'reject' ? '×' : '✓'}
                            </span>
                            <div>
                                <h2>
                                    {activeDialog.type === 'reject'
                                        ? 'Từ chối yêu cầu giấy xác nhận'
                                        : 'Duyệt yêu cầu giấy xác nhận'}
                                </h2>
                                <p>{activeRequest.student_id} · {activeRequest.requester_name}</p>
                            </div>
                        </div>

                        {activeDialog.type === 'approve' ? (
                            <>
                                <label className="certificate-dialog-field">
                                    <span>Nơi nhận giấy</span>
                                    <input
                                        value={approveForm.pickupLocation}
                                        onChange={e => setApproveForm(prev => ({
                                            ...prev,
                                            pickupLocation: e.target.value,
                                        }))}
                                    />
                                </label>

                                <label className="certificate-dialog-field">
                                    <span>Giờ làm việc</span>
                                    <textarea
                                        className="certificate-hours-input"
                                        value={approveForm.workingHours}
                                        onChange={e => setApproveForm(prev => ({
                                            ...prev,
                                            workingHours: e.target.value,
                                        }))}
                                        rows={2}
                                    />
                                </label>

                                <label className="certificate-dialog-field">
                                    <span>Ghi chú thêm (không bắt buộc)</span>
                                    <input
                                        value={approveForm.extraNote}
                                        onChange={e => setApproveForm(prev => ({
                                            ...prev,
                                            extraNote: e.target.value,
                                        }))}
                                        placeholder="Ví dụ: Mang theo CCCD/CMND gốc"
                                    />
                                </label>

                                <div className="certificate-dialog-notice approve">
                                    Hệ thống sẽ tự động gửi email thông báo đến {activeRequest.requester_email} sau khi xác nhận.
                                </div>

                                <div className="certificate-dialog-actions">
                                    <button className="dialog-cancel-btn" onClick={closeDialog} disabled={!!processingId}>
                                        Hủy
                                    </button>
                                    <button className="dialog-confirm-btn approve" onClick={handleApproveSubmit} disabled={!!processingId}>
                                        {processingId ? 'Đang xử lý...' : 'Xác nhận duyệt'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <label className="certificate-dialog-field">
                                    <span>Lý do từ chối *</span>
                                    <textarea
                                        value={rejectReason}
                                        onChange={e => setRejectReason(e.target.value)}
                                        placeholder="Nhập lý do từ chối để thông báo cho người yêu cầu..."
                                        rows={4}
                                    />
                                </label>

                                <p className="certificate-dialog-help">
                                    Lý do này sẽ được gửi kèm trong email thông báo.
                                </p>

                                <div className="certificate-dialog-notice reject">
                                    Hệ thống sẽ tự động gửi email thông báo từ chối đến {activeRequest.requester_email} kèm theo lý do.
                                </div>

                                <div className="certificate-dialog-actions">
                                    <button className="dialog-cancel-btn" onClick={closeDialog} disabled={!!processingId}>
                                        Hủy
                                    </button>
                                    <button className="dialog-confirm-btn reject" onClick={handleRejectSubmit} disabled={!!processingId}>
                                        {processingId ? 'Đang xử lý...' : 'Xác nhận từ chối'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ============================================================================
// 5. MODULE: LỊCH SỬ HỆ THỐNG (AUDIT LOGS)
// ============================================================================
const AuditLogsModule = () => {
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(true)

    const getActionLabel = (action) => {
        const actionMap = {
            CREATE_STUDENT: 'Tạo sinh viên',
            REJECT_STUDENT_BLOCKCHAIN: 'Từ chối duyệt và ghi Blockchain',
            APPROVE_STUDENT_BLOCKCHAIN: 'Duyệt ghi Blockchain',
            UPDATE_STUDENT: 'Cập nhật sinh viên',
            DELETE_STUDENT: 'Xóa sinh viên',
            RESTORE_STUDENT: 'Khôi phục sinh viên',
            APPROVE_CERTIFICATE_REQUEST: 'Duyệt cấp giấy',
            REJECT_CERTIFICATE_REQUEST: 'Từ chối cấp giấy',
            VIEW_CERTIFICATE_PRINT_DATA: 'Xem dữ liệu in',
            APPROVE_EXTERNAL_REQUEST: 'Duyệt yêu cầu doanh nghiệp',
            REJECT_EXTERNAL_REQUEST: 'Từ chối yêu cầu doanh nghiệp',
            IMPORT_EXTERNAL_STUDENT_FILE: 'Nhập tệp hồ sơ ngoài',
            APPROVE_EXTERNAL_STUDENT_IMPORT: 'Duyệt hồ sơ ngoài',
            ACCEPT_EXTERNAL_STUDENT_IMPORT: 'Tiếp nhận hồ sơ ngoài',
            REJECT_EXTERNAL_STUDENT_IMPORT: 'Từ chối hồ sơ ngoài',
            ARCHIVE_EXTERNAL_REQUEST: 'Lưu trữ hồ sơ',
            RESTORE_EXTERNAL_REQUEST: 'Khôi phục hồ sơ',
        }

        return actionMap[action] || action
    }

    const getActionTone = (action) => {
        if (action?.startsWith('UPDATE_')) return 'audit-action-update'
        if (action?.startsWith('VIEW_')) return 'audit-action-view'
        if (
            action?.startsWith('CREATE_')
            || action?.startsWith('APPROVE_')
        ) return 'audit-action-success'
        if (
            action?.startsWith('DELETE_')
            || action?.startsWith('REJECT_')
        ) return 'audit-action-danger'
        if (action?.startsWith('RESTORE_')) return 'audit-action-restore'
        if (
            action?.startsWith('IMPORT_')
            || action?.startsWith('ARCHIVE_')
        ) return 'audit-action-neutral'

        return 'audit-action-default'
    }

    const getEntityLabel = (entityType) => {
        const entityMap = {
            Student: 'Sinh viên',
            CertificateRequest: 'Yêu cầu cấp giấy xác nhận',
            ExternalRequest: 'Yêu cầu doanh nghiệp',
        }

        return entityMap[entityType] || entityType || 'Thực thể'
    }

    const translateLogDetail = (details) => {
        if (!details) return ''

        return String(details)
            .replace('Student soft-deleted.', 'Đã xóa mềm sinh viên.')
            .replace('Student restored from soft delete.', 'Đã khôi phục sinh viên đã xóa mềm.')
            .replace('Student created and synchronized with blockchain.', 'Đã tạo sinh viên và đồng bộ blockchain.')
            .replace(
                'Student updated in MySQL and verified against blockchain. Verification status: Mismatch.',
                'Đã cập nhật sinh viên trong MySQL và đối chiếu với blockchain. Trạng thái xác minh: Không khớp.'
            )
            .replace(
                'Student updated in MySQL and verified against blockchain. Verification status: Verified.',
                'Đã cập nhật sinh viên trong MySQL và đối chiếu với blockchain. Trạng thái xác minh: Hợp lệ.'
            )
            .replace('Certificate request approved for student', 'Đã duyệt yêu cầu cấp giấy cho sinh viên')
            .replace('Certificate request rejected for student', 'Đã từ chối yêu cầu cấp giấy cho sinh viên')
            .replace('Viewed print data for student', 'Đã xem dữ liệu in giấy xác nhận của sinh viên')
            .replace('External request approved and student', 'Đã duyệt yêu cầu doanh nghiệp và sinh viên')
            .replace('synchronized with blockchain.', 'đã được đồng bộ blockchain.')
            .replace('External request rejected for student', 'Đã từ chối yêu cầu doanh nghiệp cho sinh viên')
    }

    const getLogDetail = (log) => {
        const translatedDetails = translateLogDetail(log.details)

        if (log.entity_type === 'Student' && log.entity_id) {
            return translatedDetails
                ? `Mã số sinh viên: ${log.entity_id} - ${translatedDetails}`
                : `Mã số sinh viên: ${log.entity_id}`
        }

        if (translatedDetails) return translatedDetails
        if (log.entity_id) return `${getEntityLabel(log.entity_type)} #${log.entity_id}`

        return 'Không có chi tiết'
    }

    const isGpaRestored = (log) => {
        const details = translateLogDetail(log?.details)

        // Dùng kết quả được lưu trong chính lần cập nhật này.
        // Không suy đoán từ các dòng lịch sử trước/sau vì Admin có thể sửa GPA
        // qua lại nhiều lần.
        return /(?:Đối chiếu với Blockchain|Kết quả đối chiếu dữ liệu):\s*(?:Khớp|Hợp lệ|Verified)\.?/i.test(
            details,
        )
    }

    useEffect(() => {
        const loadLogs = async () => {
            try {
                const data = await getAuditLogs(1, 50)
                setLogs(data.items || data)
            } catch (err) {
                console.error(err)
            } finally {
                setLoading(false)
            }
        }
        loadLogs()
    }, [])

    return (
        <div className="module-container">
            <div className="module-header audit-log-header">
                <div>
                    <h1>Lịch sử Hệ thống</h1>
                    <p>Theo dõi các thao tác quản trị đã thực hiện.</p>
                </div>
                <div className="audit-color-legend" aria-label="Ý nghĩa màu hành động">
                    <span><i className="legend-blue" />Xem dữ liệu in / Cập nhật</span>
                    <span><i className="legend-green" />Tạo hoặc duyệt</span>
                    <span><i className="legend-red" />Xóa hoặc từ chối</span>
                    <span><i className="legend-purple" />Khôi phục</span>
                    <span><i className="legend-orange" />Nhập tệp dữ liệu</span>
                </div>
            </div>
            {loading ? <p>Đang tải...</p> : (
                <table className="data-table audit-log-table">
                    <thead>
                        <tr>
                            <th>Thời gian</th>
                            <th>Hành động</th>
                            <th>Admin</th>
                            <th>Thực thể</th>
                            <th>Chi tiết</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 ? <tr><td colSpan="5">Không có lịch sử</td></tr> : logs.map((log) => {
                            const gpaRestored = isGpaRestored(log)

                            return (
                                <tr key={log.id}>
                                    <td>{formatVietnamDateTime(log.created_at)}</td>
                                    <td className="audit-action-cell">
                                        <span
                                            className={`audit-action-label ${getActionTone(log.action)}`}
                                        >
                                            {getActionLabel(log.action)}
                                        </span>
                                    </td>
                                    <td className="audit-admin-cell">{log.username}</td>
                                    <td>{getEntityLabel(log.entity_type)}</td>
                                    <td>
                                        {normalizeAuditHistoryDetail(
                                            getLogDetail(log),
                                            { gpaRestored },
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            )}
        </div>
    )
}

// ============================================================================
// BỘ KHUNG CHÍNH: ADMIN LAYOUT (SIDEBAR & ROUTING)
// ============================================================================
function Admin() {
    const navigate = useNavigate()
    const location = useLocation()

    useEffect(() => {
        const token = localStorage.getItem('admin_token')
        if (!token) {
            navigate('/login')
        }
    }, [navigate])

    const handleLogout = () => {
        localStorage.removeItem('admin_token')
        navigate('/login')
    }

    return (
        <div className="admin-layout">
            <aside className="admin-sidebar">
                <Link
                    to="/admin"
                    className="sidebar-header sidebar-home-link"
                    aria-label="Về Dashboard"
                    title="Về Dashboard"
                >
                    <p className="eyebrow">Hệ thống Quản trị</p>
                    <h2>FPTU Blockchain</h2>
                </Link>

                <nav className="sidebar-nav">
                    <Link to="/admin" className={location.pathname === '/admin' ? 'active' : ''}>Dashboard</Link>
                    <Link to="/admin/students" className={location.pathname.includes('/students') ? 'active' : ''}>Quản lý Sinh viên</Link>
                    <Link to="/admin/external-requests" className={location.pathname.includes('/external') ? 'active' : ''}>Yêu cầu từ Doanh nghiệp</Link>
                    <Link to="/admin/certificates" className={location.pathname.includes('/certificates') ? 'active' : ''}>Cấp Chứng nhận</Link>
                    <Link to="/admin/audit-logs" className={location.pathname.includes('/audit') ? 'active' : ''}>Lịch sử Hệ thống</Link>
                </nav>

                <div className="sidebar-footer">
                    <button onClick={handleLogout} className="logout-btn">Đăng xuất</button>
                </div>
            </aside>

            <main className="admin-main-content">
                <div className="content-wrapper">
                    <Routes>
                        <Route path="/" element={<DashboardModule />} />
                        <Route path="/students/*" element={<StudentsModule />} />
                        <Route path="/external-requests/*" element={<ExternalRequestsModule />} />
                        <Route path="/certificates/*" element={<CertificatesModule />} />
                        <Route path="/audit-logs/*" element={<AuditLogsModule />} />
                    </Routes>
                </div>
            </main>
        </div>
    )
}

export default Admin


