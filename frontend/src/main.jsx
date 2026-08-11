import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom' // Import bộ định tuyến
import './index.css'

// Import các component giao diện của bạn vào đây
import User from './user/User.jsx'
import Login from './login/Login.jsx'  // Lát nữa làm xong form Login thì mở comment dòng này ra
import Admin from './admin/Admin.jsx'  // Lát nữa làm xong trang Admin thì mở comment dòng này ra
import Explorer from './explorer/Explorer.jsx'
import ExplorerTransactionsPage from './explorer/ExplorerTransactionsPage.jsx'
import ExplorerBlocksPage from './explorer/ExplorerBlocksPage.jsx'
import { ExplorerBlockDetail, ExplorerTransactionDetail } from './explorer/ExplorerDetail.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Trang chủ mặc định là trang tra cứu của sinh viên */}
        <Route path="/" element={<User />} />
        {/* FABRIC_EXPLORER_V1 */}
        <Route path="/explorer" element={<Explorer />} />
        {/* FABRIC_EXPLORER_TRANSACTIONS_PAGE_V1 */}
        <Route path="/explorer/transactions" element={<ExplorerTransactionsPage />} />
        {/* FABRIC_EXPLORER_BLOCKS_PAGE_V1 */}
        <Route path="/explorer/blocks" element={<ExplorerBlocksPage />} />
        {/* FABRIC_EXPLORER_NAVIGATION_V1 */}
        <Route path="/explorer/blocks/:blockNumber" element={<ExplorerBlockDetail />} />
        <Route path="/explorer/transactions/:transactionId" element={<ExplorerTransactionDetail />} />

        {/* Lát nữa bạn làm xong thì mở comment 2 dòng dưới này ra nha */}
        <Route path="/login" element={<Login />} />
        <Route path="/admin/*" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)