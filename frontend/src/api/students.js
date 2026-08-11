const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export class ApiError extends Error {
  constructor(code, message, status) {
    super(typeof message === 'string' ? message : code)
    this.name = 'ApiError'
    this.code = code
    this.status = status

    // Giữ nguyên object/list lỗi từ FastAPI để Admin.jsx dịch được,
    // tránh bị JavaScript ép thành "[object Object]".
    this.message = message
  }
}

const parseResponseBody = async (response) => {
  const text = await response.text()

  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const getResponseErrorMessage = (result, fallbackMessage) => {
  if (!result) return fallbackMessage

  if (typeof result === 'string') return result

  return result.detail || result.message || result
}

const buildQueryString = (params = {}) => {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })

  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

const requestJson = async (url, options = {}, errorCode = 'API_ERROR', fallbackMessage = 'Có lỗi xảy ra') => {
  let response

  try {
    response = await fetch(url, options)
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError('NETWORK_ERROR', 'Không thể kết nối đến backend', 0)
  }

  const result = await parseResponseBody(response)

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('admin_token')
    }

    const message = getResponseErrorMessage(result, fallbackMessage)
    const backendCode = (
      message && typeof message === 'object' && message.code
    ) || errorCode

    throw new ApiError(
      backendCode,
      message,
      response.status
    )
  }

  return result
}

// ============================================================================
// 1. API PUBLIC DÀNH CHO TRANG TRA CỨU BÊN NGOÀI & NGƯỜI DÙNG
// ============================================================================

// Tra cứu thông tin tốt nghiệp
export async function verifyStudentGraduation(studentId, signal) {
  try {
    return await requestJson(
      `${API_BASE_URL}/api/verify/${studentId}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal,
      },
      'API_ERROR',
      'Không thể xác minh sinh viên lúc này.'
    )
  } catch (error) {
    if (!(error instanceof ApiError)) throw error

    if (error.status === 404) error.code = 'STUDENT_NOT_FOUND'
    else if (error.status === 503) error.code = 'FABRIC_UNAVAILABLE'
    else if (error.status === 400) error.code = 'INVALID_STUDENT_ID'

    throw error
  }
}

// Gửi yêu cầu thông tin từ bên ngoài (Doanh nghiệp)
export async function submitExternalRequest(requestData) {
  return requestJson(
    `${API_BASE_URL}/api/external-requests`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestData),
    },
    'SUBMIT_FAILED',
    'Lỗi khi gửi yêu cầu'
  )
}

// Gửi OTP xác nhận email để xin giấy
export async function sendCertificateOtp(studentId, requesterEmail) {
  return requestJson(
    `${API_BASE_URL}/api/certificate-requests/otp/send`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ student_id: studentId, requester_email: requesterEmail }),
    },
    'OTP_SEND_FAILED',
    'Lỗi gửi OTP'
  )
}

// Xác thực OTP
export async function verifyCertificateOtp(studentId, requesterEmail, otpCode) {
  return requestJson(
    `${API_BASE_URL}/api/certificate-requests/otp/verify`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ student_id: studentId, requester_email: requesterEmail, otp_code: otpCode }),
    },
    'OTP_VERIFY_FAILED',
    'OTP không hợp lệ'
  )
}

// Gửi yêu cầu xin giấy xác nhận
export async function submitCertificateRequest(requestData) {
  return requestJson(
    `${API_BASE_URL}/api/certificate-requests`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestData),
    },
    'REQUEST_FAILED',
    'Lỗi gửi yêu cầu cấp giấy'
  )
}



// ============================================================================
// FABRIC_EXPLORER_V1 - API CÔNG KHAI CHO BLOCKCHAIN EXPLORER
// ============================================================================

export async function searchBlockchainExplorer(lookup, signal) {
  return requestJson(
    `${API_BASE_URL}/api/explorer/search/${encodeURIComponent(lookup.trim())}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    },
    'EXPLORER_SEARCH_FAILED',
    'Không tìm thấy dữ liệu blockchain phù hợp.'
  )
}

export async function getExplorerBlocks(limit = 6) {
  return requestJson(
    `${API_BASE_URL}/api/explorer/blocks${buildQueryString({ limit })}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    'EXPLORER_BLOCKS_FAILED',
    'Không thể tải các block mới nhất.'
  )
}

export async function getExplorerTransactions(limit = 8) {
  return requestJson(
    `${API_BASE_URL}/api/explorer/transactions${buildQueryString({ limit })}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    'EXPLORER_TRANSACTIONS_FAILED',
    'Không thể tải các giao dịch mới nhất.'
  )
}


// ============================================================================
// 2. HELPER CHO ADMIN (QUẢN LÝ TOKEN & HEADER)
// ============================================================================

const getAdminHeaders = () => {
  const token = localStorage.getItem('admin_token')
  if (!token) throw new ApiError('UNAUTHORIZED', 'Vui lòng đăng nhập lại', 401)

  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

// ============================================================================
// 3. API ADMIN: AUTH & DASHBOARD
// ============================================================================

export async function loginAdmin(username, password) {
  return requestJson(
    `${API_BASE_URL}/api/auth/login`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ username, password }),
    },
    'LOGIN_FAILED',
    'Sai tài khoản hoặc mật khẩu'
  )
}

export async function getDashboardStats() {
  return requestJson(
    `${API_BASE_URL}/api/admin/stats`,
    {
      method: 'GET',
      headers: getAdminHeaders(),
    },
    'FETCH_FAILED',
    'Lỗi khi lấy thống kê'
  )
}

// ============================================================================
// 4. API ADMIN: QUẢN LÝ SINH VIÊN
// ============================================================================

export async function getStudents(page = 1, pageSize = 20, filters = {}) {
  const query = buildQueryString({
    page,
    page_size: pageSize,
    ...filters,
  })

  return requestJson(
    `${API_BASE_URL}/api/admin/students${query}`,
    {
      method: 'GET',
      headers: getAdminHeaders(),
    },
    'FETCH_FAILED',
    'Lỗi khi lấy danh sách'
  )
}


// ADMIN_STUDENT_PRIVATE_DETAIL_V1
export async function getStudent(studentId) {
  return requestJson(
    `${API_BASE_URL}/api/admin/students/${encodeURIComponent(studentId)}`,
    {
      method: 'GET',
      headers: getAdminHeaders(),
    },
    'FETCH_STUDENT_FAILED',
    'Không thể lấy thông tin chi tiết sinh viên'
  )
}

export async function validateStudentData(studentData) {
  return requestJson(
    `${API_BASE_URL}/api/admin/students/validate`,
    {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify(studentData),
    },
    'VALIDATE_FAILED',
    'Lỗi khi kiểm tra dữ liệu sinh viên'
  )
}

export async function createStudent(studentData) {
  return requestJson(
    `${API_BASE_URL}/api/admin/students`,
    {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify(studentData),
    },
    'CREATE_FAILED',
    'Lỗi khi thêm sinh viên'
  )
}

export async function approveStudentBlockchain(studentId) {
  return requestJson(
    `${API_BASE_URL}/api/admin/students/${encodeURIComponent(studentId)}/approve-blockchain`,
    {
      method: 'POST',
      headers: getAdminHeaders(),
    },
    'APPROVE_BLOCKCHAIN_FAILED',
    'Không thể duyệt ghi Blockchain cho sinh viên'
  )
}

export async function rejectStudentBlockchain(studentId) {
  return requestJson(
    `${API_BASE_URL}/api/admin/students/${encodeURIComponent(studentId)}/reject-blockchain`,
    {
      method: 'POST',
      headers: getAdminHeaders(),
    },
    'REJECT_BLOCKCHAIN_FAILED',
    'Không thể lưu quyết định không duyệt Blockchain'
  )
}

export async function getStudentById(studentId) {
  return requestJson(
    `${API_BASE_URL}/api/admin/students/${studentId}`,
    {
      method: 'GET',
      headers: getAdminHeaders(),
    },
    'NOT_FOUND',
    'Không tìm thấy sinh viên'
  )
}

export async function updateStudent(studentId, updateData) {
  return requestJson(
    `${API_BASE_URL}/api/admin/students/${studentId}`,
    {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify(updateData),
    },
    'UPDATE_FAILED',
    'Lỗi khi cập nhật sinh viên'
  )
}

export async function deleteStudent(studentId) {
  await requestJson(
    `${API_BASE_URL}/api/admin/students/${studentId}`,
    {
      method: 'DELETE',
      headers: getAdminHeaders(),
    },
    'DELETE_FAILED',
    'Lỗi khi xóa sinh viên'
  )

  return true
}

export async function restoreStudent(studentId) {
  return requestJson(
    `${API_BASE_URL}/api/admin/students/${studentId}/restore`,
    {
      method: 'POST',
      headers: getAdminHeaders(),
    },
    'RESTORE_FAILED',
    'Lỗi khi khôi phục sinh viên'
  )
}

// ============================================================================
// 5. API ADMIN: YÊU CẦU TỪ BÊN NGOÀI (EXTERNAL REQUESTS)
// ============================================================================

export async function getExternalRequests(options = {}) {
  const normalizedOptions = typeof options === 'string'
    ? { status: options }
    : (options || {})

  const {
    status = '',
    search = '',
    page = 1,
    pageSize = 20,
    isDeleted = false,
  } = normalizedOptions

  const query = buildQueryString({
    status,
    search,
    page,
    page_size: pageSize,
    is_deleted: isDeleted,
  })

  return requestJson(
    `${API_BASE_URL}/api/admin/external-requests${query}`,
    {
      method: 'GET',
      headers: getAdminHeaders(),
    },
    'FETCH_FAILED',
    'Lỗi khi lấy yêu cầu'
  )
}

export async function importExternalVerificationFile({
  companyName,
  file,
}) {
  const token = localStorage.getItem('admin_token')
  if (!token) throw new ApiError('UNAUTHORIZED', 'Vui lòng đăng nhập lại', 401)

  const formData = new FormData()
  formData.append('company_name', companyName.trim())
  formData.append('file', file)

  return requestJson(
    `${API_BASE_URL}/api/admin/external-requests/import-file`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    },
    'IMPORT_FAILED',
    'Không thể nhập tệp đối chiếu từ doanh nghiệp'
  )
}

export async function approveExternalRequest(requestId) {
  return requestJson(
    `${API_BASE_URL}/api/admin/external-requests/${requestId}/approve`,
    {
      method: 'POST',
      headers: getAdminHeaders(),
    },
    'APPROVE_FAILED',
    'Lỗi khi duyệt yêu cầu'
  )
}

export async function rejectExternalRequest(requestId, rejectReason) {
  return requestJson(
    `${API_BASE_URL}/api/admin/external-requests/${requestId}/reject`,
    {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ reject_reason: rejectReason.trim() }),
    },
    'REJECT_FAILED',
    'Lỗi khi từ chối yêu cầu'
  )
}

export async function archiveExternalRequest(requestId) {
  return requestJson(
    `${API_BASE_URL}/api/admin/external-requests/${requestId}`,
    {
      method: 'DELETE',
      headers: getAdminHeaders(),
    },
    'ARCHIVE_FAILED',
    'Không thể đưa hồ sơ vào danh sách lưu trữ'
  )
}

export async function restoreExternalRequest(requestId) {
  return requestJson(
    `${API_BASE_URL}/api/admin/external-requests/${requestId}/restore`,
    {
      method: 'POST',
      headers: getAdminHeaders(),
    },
    'RESTORE_FAILED',
    'Không thể khôi phục hồ sơ đã lưu trữ'
  )
}

// ============================================================================
// 6. API ADMIN: YÊU CẦU CẤP GIẤY XÁC NHẬN (CERTIFICATE REQUESTS)
// ============================================================================

export async function getCertificateRequests(status = null) {
  const query = buildQueryString({ status })

  return requestJson(
    `${API_BASE_URL}/api/admin/certificate-requests${query}`,
    {
      method: 'GET',
      headers: getAdminHeaders(),
    },
    'FETCH_FAILED',
    'Lỗi khi lấy yêu cầu cấp giấy'
  )
}

export async function approveCertificateRequest(requestId, adminNote = '') {
  return requestJson(
    `${API_BASE_URL}/api/admin/certificate-requests/${requestId}/approve`,
    {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ admin_note: adminNote }),
    },
    'APPROVE_FAILED',
    'Lỗi khi duyệt cấp giấy'
  )
}

export async function rejectCertificateRequest(requestId, rejectReason) {
  return requestJson(
    `${API_BASE_URL}/api/admin/certificate-requests/${requestId}/reject`,
    {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ reject_reason: rejectReason }),
    },
    'REJECT_FAILED',
    'Lỗi khi từ chối cấp giấy'
  )
}

export async function getCertificatePrintData(requestId) {
  return requestJson(
    `${API_BASE_URL}/api/admin/certificate-requests/${requestId}/print-data`,
    {
      method: 'GET',
      headers: getAdminHeaders(),
    },
    'PRINT_DATA_FAILED',
    'Lỗi khi lấy dữ liệu in'
  )
}

// ============================================================================
// 7. API ADMIN: LỊCH SỬ THAO TÁC (AUDIT LOGS)
// ============================================================================

export async function getAuditLogs(page = 1, pageSize = 20, filters = {}) {
  const query = buildQueryString({
    page,
    page_size: pageSize,
    ...filters,
  })

  return requestJson(
    `${API_BASE_URL}/api/admin/audit-logs${query}`,
    {
      method: 'GET',
      headers: getAdminHeaders(),
    },
    'FETCH_FAILED',
    'Lỗi khi lấy lịch sử thao tác'
  )
}


// FABRIC_EXPLORER_NAVIGATION_V1
export async function getExplorerBlock(blockNumber) {
  return requestJson(
    `${API_BASE_URL}/api/explorer/blocks/${encodeURIComponent(blockNumber)}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    'EXPLORER_BLOCK_DETAIL_FAILED',
    'Không thể tải chi tiết block.'
  )
}

export async function getExplorerTransaction(transactionId) {
  return requestJson(
    `${API_BASE_URL}/api/explorer/transactions/${encodeURIComponent(transactionId)}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    'EXPLORER_TRANSACTION_DETAIL_FAILED',
    'Không thể tải chi tiết giao dịch.'
  )
}


// FABRIC_EXPLORER_BLOCKS_PAGE_V1
export async function getExplorerBlocksPage(page = 1, pageSize = 10) {
  return requestJson(
    `${API_BASE_URL}/api/explorer/blocks/page${buildQueryString({ page, page_size: pageSize })}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    'EXPLORER_BLOCKS_PAGE_FAILED',
    'Không thể tải danh sách block.'
  )
}


// FABRIC_EXPLORER_TRANSACTIONS_PAGE_V1
export async function getExplorerTransactionsPage(page = 1, pageSize = 10) {
  return requestJson(
    `${API_BASE_URL}/api/explorer/transactions/page${buildQueryString({ page, page_size: pageSize })}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    'EXPLORER_TRANSACTIONS_PAGE_FAILED',
    'Không thể tải danh sách giao dịch.'
  )
}
