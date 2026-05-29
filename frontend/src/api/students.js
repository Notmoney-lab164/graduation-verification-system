const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export async function verifyStudentGraduation(studentId, signal) {
  let response

  try {
    response = await fetch(`${API_BASE_URL}/api/students/${studentId}/verify`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    })
  } catch (error) {
    throw new ApiError('NETWORK_ERROR', 'Không thể kết nối đến backend', 0)
  }

  let result

  try {
    result = await response.json()
  } catch (error) {
    throw new ApiError('INVALID_API_RESPONSE', 'Backend trả về dữ liệu không hợp lệ', response.status)
  }

  if (!response.ok || result.success === false) {
    const apiError = result.error || {}

    throw new ApiError(
      apiError.code || 'API_ERROR',
      apiError.message || 'Không thể xác minh sinh viên',
      response.status,
    )
  }

  return result.data
}

