import { useMemo, useState } from 'react'
import { verifyStudentGraduation } from './api/students'
import './App.css'

const STUDENT_ID_PATTERN = /^[A-Z]{2}[0-9]{6}$/

function normalizeStudentId(value) {
  return value.trim().toUpperCase()
}

function getErrorMessage(error) {
  const code = error?.code
  const message = error?.message || ''

  switch (code) {
    case 'INVALID_STUDENT_ID':
      return 'Mã sinh viên không hợp lệ. Vui lòng nhập 2 chữ cái in hoa và 6 chữ số, ví dụ: SE182026.'
    case 'STUDENT_NOT_FOUND':
      return 'Không tìm thấy sinh viên trên hệ thống blockchain.'
    case 'FABRIC_UNAVAILABLE':
      return 'Mạng blockchain hiện chưa sẵn sàng. Vui lòng kiểm tra Fabric test-network.'
    case 'FABRIC_TIMEOUT':
      return 'Quá thời gian kết nối blockchain. Vui lòng thử lại.'
    case 'NETWORK_ERROR':
      return 'Không thể kết nối đến backend. Vui lòng kiểm tra FastAPI đã chạy chưa.'
    case 'INVALID_API_RESPONSE':
      return 'Backend trả về dữ liệu không hợp lệ.'
    default:
      if (message.includes('does not exist')) {
        return 'Không tìm thấy sinh viên trên hệ thống blockchain.'
      }

      return 'Không thể xác minh lúc này. Vui lòng thử lại sau.'
  }
}
function App() {
  const [studentId, setStudentId] = useState('')
  const [verification, setVerification] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const normalizedStudentId = useMemo(() => normalizeStudentId(studentId), [studentId])
  const isValidStudentId = STUDENT_ID_PATTERN.test(normalizedStudentId)

  async function handleSubmit(event) {
    event.preventDefault()

    setVerification(null)
    setErrorMessage('')

    if (!isValidStudentId) {
      setErrorMessage('Mã sinh viên phải gồm 2 chữ cái và 6 chữ số, ví dụ: SE182026.')
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 10000)

    try {
      setIsLoading(true)
      const data = await verifyStudentGraduation(normalizedStudentId, controller.signal)
      setVerification(data)
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

  return (
    <main className="app-shell">
      <section className="verify-panel">
        <div className="panel-header">
          <p className="eyebrow">Graduation Verification</p>
          <h1>Xác minh tốt nghiệp sinh viên</h1>
        </div>

        <form className="verify-form" onSubmit={handleSubmit}>
          <label htmlFor="studentId">Mã sinh viên</label>
          <div className="input-row">
            <input
              id="studentId"
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              placeholder="SE182026"
              autoComplete="off"
              maxLength={8}
            />
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Đang kiểm tra' : 'Kiểm tra'}
            </button>
          </div>
        </form>

        {errorMessage && (
          <div className="result-box error" role="alert">
            <strong>Không thể xác minh</strong>
            <p>{errorMessage}</p>
          </div>
        )}

        {verification && (
          <div className={`result-box ${verification.isGraduated ? 'success' : 'warning'}`}>
            <strong>
              {verification.isGraduated ? 'Đã tốt nghiệp' : 'Chưa xác nhận tốt nghiệp'}
            </strong>

            <dl>
              <div>
                <dt>Mã sinh viên</dt>
                <dd>{verification.studentId}</dd>
              </div>
              <div>
                <dt>Trạng thái</dt>
                <dd>{verification.graduationStatus}</dd>
              </div>
              <div>
                <dt>Dữ liệu nguyên vẹn</dt>
                <dd>{verification.integrityValid ? 'Có' : 'Không'}</dd>
              </div>
            </dl>
          </div>
        )}
      </section>
    </main>
  )
}

export default App