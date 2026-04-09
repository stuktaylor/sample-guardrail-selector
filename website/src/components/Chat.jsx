import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  CircularProgress,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  ToggleButtonGroup,
  ToggleButton
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import apiClient from '../utils/api';
import GuardrailDetailsDialog from './GuardrailDetailsDialog';
import '../styles/Chat.css';

function Chat() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [chatMessages, setChatMessages] = useState([{
    type: 'system',
    content: t('chat.interface.WELCOME'),
    timestamp: new Date().toISOString()
  }]);
  const [isQuerying, setIsQuerying] = useState(false);
  const chatEndRef = useRef(null);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [sessionId, setSessionId] = useState(null);
  const [chatMode, setChatMode] = useState('knowledge-base'); // Default to knowledge base

  // Guardrails state
  const [guardrails, setGuardrails] = useState([]);
  const [selectedGuardrailId, setSelectedGuardrailId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedGuardrailDetails, setSelectedGuardrailDetails] = useState(null);

  // Scroll to bottom of chat when new messages are added
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  // Update window height on resize
  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // Open guardrail details dialog
  const openGuardrailDetails = (guardrail) => {
    // Get the selected version
    let selectedVersion = 'DRAFT';
    if (selectedGuardrailId.includes(':')) {
      selectedVersion = selectedGuardrailId.split(':')[1];
    }
    
    // Make sure we have the full guardrail object with all details
    const fullGuardrail = guardrails.find(g => g.guardrailId === guardrail.guardrailId);
    
    // Add the selected version to the guardrail object
    setSelectedGuardrailDetails({
      ...(fullGuardrail || guardrail),
      selectedVersion: selectedVersion
    });
    
    setDetailsOpen(true);
  };

  // Close guardrail details dialog
  const closeGuardrailDetails = () => {
    setDetailsOpen(false);
  };

  // Render guardrail details dialog
  const renderGuardrailDetailsDialog = () => {
    return (
      <GuardrailDetailsDialog
        open={detailsOpen}
        onClose={closeGuardrailDetails}
        guardrail={selectedGuardrailDetails}
      />
    );
  };

  // Fetch guardrails on component mount
  useEffect(() => {
    fetchGuardrails();
  }, []);

  // Fetch guardrails from API
  const fetchGuardrails = async () => {
    setLoading(true);
    setError(null);
    try {
      const guardrailsResponse = await apiClient.getGuardrails();
      setGuardrails(guardrailsResponse.guardrails || []);
    } catch (err) {
      console.error('Error fetching guardrails:', err);
      setError('Failed to load guardrails. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Handle guardrail selection change
  const handleGuardrailChange = (event) => {
    setSelectedGuardrailId(event.target.value);
  };

  // Handle chat mode change
  const handleChatModeChange = (event, newMode) => {
    // Only proceed if a new mode is selected (prevents deselection)
    if (newMode !== null) {
      // If there's an active session, confirm before switching
      if (sessionId) {
        const isConfirmed = window.confirm(
          t('chat.interface.CONFIRM_MODE_CHANGE')
        );
        
        if (isConfirmed) {
          setChatMode(newMode);
          startNewChatSession();
        }
      } else {
        // No active session, just switch the mode
        setChatMode(newMode);
      }
    }
  };

  // Handle chat query submission
  const handleQuerySubmit = async (e) => {
    e.preventDefault();

    if (!query.trim()) return;

    // Add user message to chat
    const userMessage = {
      type: 'user',
      content: query,
      timestamp: new Date().toISOString()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setIsQuerying(true);

    try {
      // Use apiClient to query the llm or knowledge base with selected guardrail
      const queryData = {
        query: query
      };

      // Parse the guardrail ID and version if one is selected
      if (selectedGuardrailId) {
        // Check if the selected value contains a version
        if (selectedGuardrailId.includes(':')) {
          const parts = selectedGuardrailId.split(':');
          queryData.guardrailId = parts[0];
          queryData.guardrailVersion = parts[1];
        } else {
          queryData.guardrailId = selectedGuardrailId;
          queryData.guardrailVersion = 'DRAFT';
        }
      }

      // Add sessionId if available
      if (sessionId) {
        queryData.sessionId = sessionId;
      }
      
      // If chatmode is set to "llm", include the current messages in the format required
      if (chatMode === 'llm') {
        // Format messages for the LLM API
        const formattedMessages = [];
        
        // Add all user and AI messages, skipping system messages
        chatMessages.forEach(message => {
          if (message.type === 'user') {
            formattedMessages.push({
              role: "user",
              content: [{ text: message.content }]
            });
          } else if (message.type === 'ai') {
            formattedMessages.push({
              role: "assistant",
              content: [{ text: message.content }]
            });
          }
        });
        
        // Add the current user query as the last message
        formattedMessages.push({
          role: "user",
          content: [{ text: query }]
        });
        
        // Add formatted messages to queryData
        queryData.messages = formattedMessages;
      }

      // Use the appropriate API method based on the selected chat mode
      const data = chatMode === 'knowledge-base' 
        ? await apiClient.queryKnowledgeBase(queryData)
        : await apiClient.query(queryData);

      // Store the session ID from the response
      if (data?.sessionId) {
        setSessionId(data.sessionId);
        console.log(`Session ID set/updated: ${data.sessionId}`);
      }

      // Extract sources from citations if available
      let sources = [];
      if (data?.results?.citations) {
        sources = data.results.citations.flatMap(citation =>
          citation.retrievedReferences.map(reference => ({
            content: reference.content?.text?.substring(0, 150) + '...',
            fullContent: reference.content?.text,
            expanded: false
          }))
        );
      }

      // Add AI response to chat
      const aiMessage = {
        type: 'ai',
        content: (data?.results?.output?.text) || 'No response',
        timestamp: new Date().toISOString(),
        sources: sources,
        showSources: false // Default to collapsed sources
      };

      setChatMessages(prev => [...prev, aiMessage]);
      setQuery('');
    } catch (error) {
      console.error('Error querying:', error);

      // Add error message to chat
      const errorMessage = {
        type: 'error',
        content: `Error: ${error.message}`,
        timestamp: new Date().toISOString()
      };

      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsQuerying(false);
    }
  };

  // Function to start a new chat session
  const startNewChatSession = () => {
    // Reset chat messages with just the welcome message
    setChatMessages([{
      type: 'system',
      content: t('chat.interface.NEW_SESSION'),
      timestamp: new Date().toISOString()
    }]);
    
    // Clear the session ID
    setSessionId(null);
    console.log('Session ID cleared');
  };

  // Function to handle starting a new chat session with confirmation
  const handleNewChatClick = () => {
    // Show confirmation dialog
    const isConfirmed = window.confirm(
      t('chat.interface.CONFIRM_NEW_CHAT')
    );

    // If user confirms, start new chat session
    if (isConfirmed) {
      startNewChatSession();
    }
  };

  // Function to download chat history as markdown
  const handleDownloadChat = () => {
    try {
      // Generate markdown content
      let markdownContent = `# ${t('chat.interface.CHAT_HISTORY')}\n\n`;
      markdownContent += `${t('chat.interface.GENERATED_ON')} ${new Date().toLocaleString()}\n\n`;

      // Add each message to the markdown
      chatMessages.forEach((message) => {
        // Skip system messages in the download
        if (message.type === 'system') return;

        const timestamp = new Date(message.timestamp).toLocaleString();

        if (message.type === 'user') {
          markdownContent += `## User (${timestamp})\n\n${message.content}\n\n`;
        } else if (message.type === 'ai') {
          markdownContent += `## Assistant (${timestamp})\n\n${message.content}\n\n`;

          // Add sources if available
          if (message.sources && message.sources.length > 0) {
            markdownContent += `### Sources\n\n`;
            message.sources.forEach((source, idx) => {
              markdownContent += `${idx + 1}. **Content**: ${source.fullContent || source.content}\n\n`;
            });
          }
        } else if (message.type === 'error') {
          markdownContent += `## Error (${timestamp})\n\n${message.content}\n\n`;
        }
      });

      // Create a blob and download
      const blob = new Blob([markdownContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'knowledge-base-chat.txt';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading chat history:', error);
      // Use a notification system instead of alert
      setSnackbarMessage({
        message: t('chat.errors.DOWNLOAD_FAILED'),
        severity: 'error'
      });
      setSnackbarOpen(true);
    }
  };

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: `calc(${windowHeight}px - 180px)`, // Subtract header, tabs, and footer height
      width: '100%',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      borderRadius: '8px',
      mt: 2
    }}>
      {/* Guardrails Selection */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && (
        <Paper sx={{ p: 2, mb: 1 }} elevation={1}>
          <Typography sx={{ mb: 2 }}>
            {t('chat.interface.GUARDRAILS')}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <FormControl sx={{ flexGrow: 1 }} size="small">
              <InputLabel id="guardrail-select-label" shrink={selectedGuardrailId !== ""}>
                {selectedGuardrailId === "" ? "" : t('chat.interface.SELECT_GUARDRAIL')}
              </InputLabel>
              <Select
                labelId="guardrail-select-label"
                id="guardrail-select"
                value={selectedGuardrailId}
                label={selectedGuardrailId === "" ? "" : t('chat.interface.SELECT_GUARDRAIL')}
                onChange={handleGuardrailChange}
                displayEmpty
                renderValue={(value) => {
                  if (value === "") {
                    return <em>{t('chat.interface.NONE')}</em>;
                  }
                  
                  // Parse the guardrail ID and version
                  let guardrailId = value;
                  let version = 'DRAFT';
                  
                  if (value.includes(':')) {
                    const parts = value.split(':');
                    guardrailId = parts[0];
                    version = parts[1];
                  }
                  
                  // Find the guardrail by ID
                  const selected = guardrails.find(g => g.guardrailId === guardrailId);
                  if (!selected) return value;
                  
                  return `${selected.name || selected.guardrailId} ${version === 'DRAFT' ? '(DRAFT)' : `(Version ${version})`}`;
                }}
              >
                <MenuItem value="">
                  <em>{t('chat.interface.NO_GUARDRAIL')}</em>
                </MenuItem>
                {guardrails.map((guardrail) => {
                  const items = [];
                  // Add all non-DRAFT versions if available
                  if (guardrail.versions && guardrail.versions.length > 0) {
                    guardrail.versions.forEach((versionInfo) => {
                      items.push(
                        <MenuItem 
                          key={`${guardrail.guardrailId}-${versionInfo.version}`} 
                          value={`${guardrail.guardrailId}:${versionInfo.version}`}
                        >
                          {(guardrail.name || guardrail.guardrailId)} {versionInfo.version === 'DRAFT' ? '(DRAFT)' : `(Version ${versionInfo.version})`}
                        </MenuItem>
                      );
                    });
                  }
                  
                  return items;
                })}
              </Select>
            </FormControl>

            <Button
              variant="outlined"
              size="small"
              onClick={fetchGuardrails}
              disabled={loading}
              startIcon={<span>↻</span>}
            >
              {t('common.buttons.REFRESH')}
            </Button>

            {selectedGuardrailId && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  // Parse the guardrail ID and version
                  let guardrailId = selectedGuardrailId;
                  let selectedVersion = 'DRAFT';
                  
                  if (selectedGuardrailId.includes(':')) {
                    const parts = selectedGuardrailId.split(':');
                    guardrailId = parts[0];
                    selectedVersion = parts[1];
                  }
                  
                  // Find the full guardrail object with all details
                  const selectedGuardrail = guardrails.find(g => g.guardrailId === guardrailId);
                  if (selectedGuardrail) {
                    console.log("Opening guardrail details for:", selectedGuardrail, "with version:", selectedVersion);
                    openGuardrailDetails({
                      ...selectedGuardrail,
                      selectedVersion: selectedVersion
                    });
                  } else {
                    console.error("Could not find guardrail with ID:", guardrailId);
                  }
                }}
                disabled={!selectedGuardrailId}
                startIcon={<span>🔍</span>}
              >
                {t('chat.interface.VIEW')} {t('chat.interface.DETAILS')}
              </Button>
            )}
          </Box>
        </Paper>
      )}

      {renderGuardrailDetailsDialog()}

      {/* Chat Header */}
      {chatMessages.length > 1 && (
        <Box sx={{
          p: 2,
          pb: 1,
          pt: 1,
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          bgcolor: '#f5f5f5',
          borderRadius: '4px 4px 0 0'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {sessionId && (
              <Typography variant="caption" sx={{ color: 'text.secondary', mr: 2 }}>
                {t('chat.interface.SESSION')} {t('chat.interface.ID')}: {sessionId}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto' }}>
            <IconButton
              color="primary"
              onClick={handleDownloadChat}
              title={t('chat.interface.DOWNLOAD_CHAT_HISTORY')}
              size="small"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 16L7 11H17L12 16Z" fill="#0066cc" />
                <path d="M12 4V12" stroke="#0066cc" strokeWidth="2" strokeLinecap="round" />
                <path d="M4 20H20" stroke="#0066cc" strokeWidth="2" strokeLinecap="round" />
                <path d="M4 20V16" stroke="#0066cc" strokeWidth="2" strokeLinecap="round" />
                <path d="M20 20V16" stroke="#0066cc" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </IconButton>

            {chatMessages.length > 1 && (
              <Button
                size="small"
                variant="outlined"
                onClick={handleNewChatClick}
                title={t('chat.interface.NEW_CHAT_TITLE')}
              >
                {t('chat.interface.NEW_CHAT')} {t('chat.interface.CHAT')}
              </Button>
            )}
          </Box>
        </Box>
      )}

      {/* Chat Messages */}
      <Box sx={{
        flexGrow: 1,
        p: 2,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        bgcolor: '#ffffff',
        borderLeft: '1px solid #e0e0e0',
        borderRight: '1px solid #e0e0e0',
        height: 'calc(100% - 130px)', // Subtract header and input area height
      }}>
        {chatMessages.map((message, index) => (
          <Paper
            key={index}
            elevation={0}
            sx={{
              p: 2,
              maxWidth: '90%',
              marginLeft: message.type === 'user' ? 'auto' : '0',
              marginRight: message.type === 'user' ? '0' : 'auto',
              marginBottom: 2,
              bgcolor: message.type === 'user' ? '#e3f2fd' :
                message.type === 'error' ? '#ffebee' :
                  message.type === 'system' ? '#f0f4c3' : '#f5f5f5',
              borderRadius: 2,
              wordBreak: 'break-word'
            }}
          >
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
              {message.content}
            </Typography>

            {/* Show sources if available */}
            {message.sources && message.sources.length > 0 && (
              <Box sx={{ mt: 1, fontSize: '0.85rem', color: 'text.secondary' }}>
                <Box
                  onClick={() => {
                    const updatedMessages = [...chatMessages];
                    const messageToUpdate = updatedMessages[index];
                    messageToUpdate.showSources = !messageToUpdate.showSources;
                    setChatMessages(updatedMessages);
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                    '&:hover': { color: 'primary.main' }
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 'bold', mr: 0.5 }}>
                    {t('chat.interface.SOURCES')} ({message.sources.length})
                  </Typography>
                  {message.showSources ? '▼' : '►'}
                </Box>

                {message.showSources && (
                  <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px' }}>
                    {message.sources.map((source, idx) => (
                      <li key={idx}>
                        <Typography variant="caption" sx={{ display: 'block' }}>
                          {/* Show preview of content if available */}
                          {source.content && (
                            <Box component="span" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic', color: 'text.disabled' }}>
                              {source.expanded ? source.fullContent : source.content}
                              {source.fullContent && source.fullContent.length > 150 && (
                                <Button
                                  size="small"
                                  sx={{ ml: 1, minWidth: 'auto', p: '2px 5px', fontSize: '0.7rem' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const updatedMessages = [...chatMessages];
                                    const messageToUpdate = updatedMessages[index];
                                    const sourceToUpdate = messageToUpdate.sources[idx];
                                    sourceToUpdate.expanded = !sourceToUpdate.expanded;
                                    setChatMessages(updatedMessages);
                                  }}
                                >
                                  {source.expanded ? t('chat.interface.SHOW_LESS') : t('chat.interface.SHOW_MORE')}
                                </Button>
                              )}
                            </Box>
                          )}
                        </Typography>
                      </li>
                    ))}
                  </ul>
                )}
              </Box>
            )}
          </Paper>
        ))}
        <div ref={chatEndRef} />
      </Box>


      {/* Chat Input */}
      <Box sx={{
        p: 2,
        borderTop: '1px solid #e0e0e0',
        bgcolor: '#f5f5f5',
        borderRadius: '0 0 8px 8px',
        borderLeft: '1px solid #e0e0e0',
        borderRight: '1px solid #e0e0e0',
        borderBottom: '1px solid #e0e0e0',
      }}>
                  {/* Chat Mode Toggle */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb:1 }}>
            <ToggleButtonGroup
              value={chatMode}
              exclusive
              onChange={handleChatModeChange}
              aria-label="chat mode"
              size="small"
              sx={{ 
                '& .MuiToggleButton-root': {
                  py: 0.5,
                  px: 3,
                  fontSize: '0.75rem',
                  '&.Mui-selected': {
                    backgroundColor: 'var(--secondary-color)',
                    color: '#ffffff',
                    '&:hover': {
                      backgroundColor: 'var(--secondary-color)',
                      opacity: 0.9
                    }
                  }
                }
              }}
            >
              <ToggleButton value="knowledge-base" aria-label="knowledge base mode">
                {t('chat.interface.KNOWLEDGE_BASE')}
              </ToggleButton>
              <ToggleButton value="llm" aria-label="llm mode">
                {t('chat.interface.LLM')}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        <form onSubmit={handleQuerySubmit} style={{ display: 'flex', gap: '8px' }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder={t('chat.interface.MESSAGE_PLACEHOLDER')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isQuerying}
            size="small"
            sx={{ bgcolor: '#ffffff' }}
          />
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={isQuerying || !query.trim()}
            endIcon={isQuerying ? <CircularProgress size={20} color="inherit" /> : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z" fill="white" />
              </svg>
            )}
          >
            {isQuerying ? t('chat.interface.THINKING') : t('common.buttons.SEND')}
          </Button>
        </form>
      </Box>
    </Box>
  );
}

export default Chat;
