import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Tabs, Tab, Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import '../styles/TabNavigation.css';

function TabNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  
  // Determine the active tab based on the current path
  const getActiveTab = () => {
    const path = location.pathname;
    if (path === '/' || path === '/agentchat') {
      return 0;
    }
    if (path === '/chat') {
      return 1;
    }
    // Add more tab paths here as they are added
    return 0;
  };

  const [value, setValue] = useState(getActiveTab());

  const handleChange = (event, newValue) => {
    setValue(newValue);
    switch (newValue) {
      case 0:
        navigate('/agentchat');
        break;
      case 1:
        navigate('/chat');
        break;
      // Add more cases here as more tabs are added
      default:
        navigate('/agentchat');
    }
  };

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', width: '100%' }} className="tab-navigation">
      <Tabs 
        value={value} 
        onChange={handleChange} 
        aria-label="application tabs"
        sx={{ 
          '& .MuiTab-root': { 
            fontWeight: 'medium',
            fontSize: '0.95rem',
            textTransform: 'none',
          }
        }}
      >
        <Tab label={t('tabs.menu.AGENT_CHAT')} />
        <Tab label={t('tabs.menu.CHAT')} />
        {/* Add more tabs here as they are needed */}
      </Tabs>
    </Box>
  );
}

export default TabNavigation;
