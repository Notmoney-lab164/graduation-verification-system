import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Login.css'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Đăng nhập thất bại. Vui lòng kiểm tra lại.')
      }

      // Lưu JWT token vào bộ nhớ trình duyệt
      localStorage.setItem('admin_token', data.access_token)
      
      // Chuyển hướng thẳng vào trang Admin
      navigate('/admin')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="login-shell">
      <div className="login-panel">
        <div className="login-header">
          <p className="eyebrow">Hệ thống Quản trị</p>
          <h1>Đăng nhập</h1>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="input-group">
            <label htmlFor="username">Tên đăng nhập</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập username"
              autoComplete="off"
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Mật khẩu</label>
            {/* Bọc input và nút con mắt vào một div chung */}
            <div className="password-wrapper">
              <input
                id="password"
                // Nếu showPassword là true thì biến thành 'text', false thì là 'password'
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="toggle-eye-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex="-1" // Không focus vào nút này khi người dùng bấm Tab
              >
                {showPassword ? (
                  // Icon Mắt mở (nhìn thấy mật khẩu)
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="eye-icon">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ) : (
                  // Icon Mắt nhắm (có dấu gạch chéo)
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="eye-icon">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <button type="submit" disabled={isLoading} className="login-btn">
            {isLoading ? 'Đang xác thực...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </main>
  )
}

export default Login