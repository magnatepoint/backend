import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/ThemeContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Console from './pages/Console'
import SpendSense from './pages/SpendSense'
import BudgetPilot from './pages/BudgetPilot'
import GoalCompass from './pages/GoalCompass'
import MoneyMoments from './pages/MoneyMoments'
import Settings from './pages/Settings'
import Callback from './pages/Callback'
import GmailCallback from './pages/GmailCallback'
import './App.css'

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/callback" element={<Callback />} />
            <Route path="/gmail/callback" element={<GmailCallback />} />
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<Console />} />
              <Route path="spendsense" element={<SpendSense />} />
              <Route path="budgetpilot" element={<BudgetPilot />} />
              <Route path="goalcompass" element={<GoalCompass />} />
              <Route path="moneymoments" element={<MoneyMoments />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App

