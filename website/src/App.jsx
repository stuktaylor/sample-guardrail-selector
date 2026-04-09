
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Chat from './components/Chat';
import AgentChat from './components/AgentChat';
import './styles/App.css';

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/agentchat"
        element={
            <AgentChat />
        }
      />
      <Route
        path="/chat"
        element={
            <Chat />
        }
      />
      <Route path="/" element={<Navigate to="/agentchat" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router future={{ 
      v7_startTransition: true,
      v7_relativeSplatPath: true 
    }}>
      <Layout>
        <AppRoutes />
      </Layout>
    </Router>
  );
}

export default App;