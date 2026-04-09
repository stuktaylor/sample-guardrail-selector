import { useEffect } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import TabNavigation from './TabNavigation';
import '../styles/Layout.css';

function Layout({ children }) {
  const { t } = useTranslation();
  
  return (
    <div className="layout">
      <header className="header">
        <div className="logo">
          <h1 className="LogoHeader">{t('layout.header.TITLE')}</h1>
        </div>
      </header>
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        width: '100%',
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '0 16px'
      }}>
        <TabNavigation />
        <main className="main-content">
          {children}
        </main>
      </Box>
      <footer className="footer">
        <p>{t('layout.footer.WELCOME')}</p>
      </footer>
    </div>
  );
}

export default Layout;
