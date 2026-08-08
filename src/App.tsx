import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider.tsx'
import Account from './pages/Account'
import Home from './pages/Home'
import Results from './pages/Results'
import SavedTrips from './pages/SavedTrips'

// Regla 10 de CLAUDE.md: el rewrite de `vercel.json` deja que estas rutas
// funcionen al refrescar. Sin él, `/viajes` daría 404.
//
// `AuthProvider` envuelve al router y no al revés: la sesión se carga una vez
// por visita, y no se pierde ni se vuelve a pedir al cambiar de pantalla.
function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/results" element={<Results />} />
          <Route path="/cuenta" element={<Account />} />
          <Route path="/viajes" element={<SavedTrips />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
