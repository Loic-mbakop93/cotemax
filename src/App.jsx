import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Topbar from './components/Topbar'
import Home from './pages/Home'
import MatchDetail from './pages/MatchDetail'

export default function App() {
  return (
    <BrowserRouter>
      <Topbar />
      <Routes>
        <Route path="/"          element={<Home />} />
        <Route path="/match/:id" element={<MatchDetail />} />
      </Routes>
    </BrowserRouter>
  )
}
