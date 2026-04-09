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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Alert,
  Divider,
  Tooltip
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import apiClient from '../utils/api';
import { getConfig } from '../utils/config';
import GuardrailDetailsDialog from './GuardrailDetailsDialog';
import '../styles/AgentChat.css';

function AgentChat() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [chatMessages, setChatMessages] = useState([{
    type: 'system',
    content: t('agent.chat.WELCOME'),
    timestamp: new Date().toISOString()
  }]);
  const [isQuerying, setIsQuerying] = useState(false);
  const chatEndRef = useRef(null);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [sessionId, setSessionId] = useState(null);

  const [guardrails, setGuardrails] = useState([]);
  const [currentGuardrail, setCurrentGuardrail] = useState(null);
  const [selectedGuardrailId, setSelectedGuardrailId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedGuardrailDetails, setSelectedGuardrailDetails] = useState(null);
  const [agentId, setAgentId] = useState(null);

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

  // Get the AgentID from config on component mount
  useEffect(() => {
    try {
      const config = getConfig();
      setAgentId(config.AgentID);
    } catch (err) {
      console.error('Error getting AgentID from config:', err);
      setError('Failed to load configuration. Please refresh the page.');
    }
  }, []);

  // Fetch guardrails when agentId is available
  useEffect(() => {
    if (agentId) {
      fetchGuardrails();
    }
  }, [agentId]);

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
      // Prepare query data with session ID if available
      const queryData = {
        query: query
      };

      // Add session ID if available
      if (sessionId) {
        queryData.sessionId = sessionId;
      }

      // Use apiClient to invoke the Bedrock Agent
      const data = await apiClient.invokeAgent(queryData);

      // Store the session ID from the response
      if (data?.sessionId) {
        setSessionId(data.sessionId);
        console.log(`Session ID set/updated: ${data.sessionId}`);
      }

      // Check if there's an error in the response
      if (data?.results?.error) {
        console.error('Error in agent response:', data.results.error);
        
        // Check if it's a throttling error
        const isThrottlingError = data.results.error.includes('throttlingException') || 
                                 data.results.error.includes('request rate is too high');
        
        // Add appropriate error message to chat
        const errorMessage = {
          type: 'error',
          content: isThrottlingError ? 
            t('agent.chat.THROTTLING_ERROR') :
            `${t('error.messages.GENERIC')}: ${data.results.error}`,
          timestamp: new Date().toISOString()
        };

        setChatMessages(prev => [...prev, errorMessage]);
        setQuery('');
        return;
      }

      // Extract sources from citations if available
      let sources = [];
      if (data?.results?.citations) {
        sources = data.results.citations.map(citation => {
          // Extract reference information from the citation
          const references = citation.references || [];
          return {
            content: citation.text?.substring(0, 150) + '...',
            fullContent: citation.text,
            span: citation.span,
            references: references.map(ref => ({
              content: ref.content,
              location: ref.location,
              metadata: ref.metadata
            })),
            expanded: false
          };
        });
      }

      // Add AI response to chat
      const aiMessage = {
        type: 'ai',
        content: (data?.results?.text) || 'No response from agent',
        timestamp: new Date().toISOString(),
        sources: sources,
        showSources: false // Default to collapsed sources
      };

      setChatMessages(prev => [...prev, aiMessage]);
      setQuery('');
    } catch (error) {
      console.error('Error invoking agent:', error);

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
      content: t('agent.chat.NEW_SESSION'),
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
      t('agent.chat.CONFIRM_NEW_CHAT')
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
      let markdownContent = `# ${t('agent.chat.CHAT_HISTORY')}\n\n`;
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
              
              // Add reference information if available
              if (source.references && source.references.length > 0) {
                source.references.forEach((ref, refIdx) => {
                  if (ref.location?.s3Location?.uri) {
                    markdownContent += `   - Source: ${ref.location.s3Location.uri}\n`;
                  }
                  if (ref.metadata) {
                    markdownContent += `   - ID: ${ref.metadata['x-amz-bedrock-kb-chunk-id'] || 'N/A'}\n`;
                  }
                });
                markdownContent += `\n`;
              }
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
      link.download = 'agent-chat.txt';
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



  // Fetch guardrails from API
  const fetchGuardrails = async () => {
    if (!agentId) return;

    setLoading(true);
    setError(null);
    try {
      // First get all available guardrails
      const allGuardrailsResponse = await apiClient.getGuardrails();
      setGuardrails(allGuardrailsResponse.guardrails || []);

      // Then get the specific guardrail details for this agent
      const agentGuardrailResponse = await apiClient.getGuardrailDetails(agentId);

      // Handle the updated response format
      if (agentGuardrailResponse.guardrail) {
        // Extract the guardrail details from the response
        const guardrailDetails = agentGuardrailResponse.guardrail;
        
        // Create a currentGuardrail object in the format expected by the UI
        setCurrentGuardrail({
          id: guardrailDetails.guardrailId,
          version: guardrailDetails.version || 'DRAFT',
          name: guardrailDetails.name,
          description: guardrailDetails.description
        });

        // Set the selected guardrail to the current one with version
        // Always include the version suffix to match MenuItem values
        const version = guardrailDetails.version || 'DRAFT';
        setSelectedGuardrailId(`${guardrailDetails.guardrailId}:${version}`);
      } else {
        // No guardrail is applied
        setCurrentGuardrail(null);
      }
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

  // Handle guardrail update
  const handleUpdateGuardrail = async () => {
    if (!agentId) {
      setError('Agent ID not available. Cannot update guardrail.');
      return;
    }

    setLoading(true);
    setError(null);
    setUpdateSuccess(false);

    try {
      // Parse the selected guardrail ID and version
      let guardrailId = selectedGuardrailId;
      let guardrailVersion = 'DRAFT';
      
      // Check if the selected value contains a version
      if (selectedGuardrailId.includes(':')) {
        const parts = selectedGuardrailId.split(':');
        guardrailId = parts[0];
        guardrailVersion = parts[1];
      }
      
      const guardrailData = {
        agentId: agentId,
        guardrailId: guardrailId,
        guardrailVersion: guardrailVersion
      };

      await apiClient.updateGuardrail(guardrailData);
      setUpdateSuccess(true);

      // Refresh guardrails list to get updated current guardrail
      await fetchGuardrails();
    } catch (err) {
      console.error('Error updating guardrail:', err);
      setError('Failed to update guardrail. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Open guardrail details dialog
  const openGuardrailDetails = (guardrail) => {
    // Get the selected version
    let selectedVersion = 'DRAFT';
    if (selectedGuardrailId.includes(':')) {
      selectedVersion = selectedGuardrailId.split(':')[1];
    }
    
    // If the guardrail is from the current guardrail response format
    if (guardrail && !guardrail.guardrailId && currentGuardrail) {
      // Find the full guardrail details from the guardrails list
      const fullGuardrail = guardrails.find(g => g.guardrailId === currentGuardrail.id);
      if (fullGuardrail) {
        setSelectedGuardrailDetails({
          ...fullGuardrail,
          selectedVersion: currentGuardrail.version || 'DRAFT'
        });
      } else {
        // If not found in the list, use the current guardrail data
        setSelectedGuardrailDetails({
          guardrailId: currentGuardrail.id,
          name: currentGuardrail.name,
          description: currentGuardrail.description,
          version: currentGuardrail.version,
          selectedVersion: currentGuardrail.version || 'DRAFT'
        });
      }
    } else {
      // Use the provided guardrail details with the selected version
      setSelectedGuardrailDetails({
        ...guardrail,
        selectedVersion: selectedVersion
      });
    }
    setDetailsOpen(true);
  };

  // Close guardrail details dialog
  const closeGuardrailDetails = () => {
    setDetailsOpen(false);
  };


  // Check if the selected guardrail is the same as the current one (including version)
  const isCurrentGuardrailSelected = () => {
    if (!currentGuardrail) return false;
    
    // Parse the selected guardrail ID and version
    let selectedId = selectedGuardrailId;
    let selectedVersion = 'DRAFT';
    
    if (selectedGuardrailId.includes(':')) {
      const parts = selectedGuardrailId.split(':');
      selectedId = parts[0];
      selectedVersion = parts[1];
    }
    
    // Check if both ID and version match
    return selectedId === currentGuardrail.id && selectedVersion === currentGuardrail.version;
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

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && (
        <>
          <Paper sx={{ p: 2, mb: 1 }} elevation={1}>
            {updateSuccess && (
              <Alert severity="success" sx={{ mb: 3 }}>
                {t('guardrails.messages.UPDATE_SUCCESS')}
              </Alert>
            )}
            <Typography gutterBottom>
              {t('agent.chat.GUARDRAIL_FOR_AGENT')}: {agentId || t('common.labels.LOADING')}
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <FormControl sx={{ flexGrow: 1 }} size="small">
                <InputLabel id="guardrail-select-label" shrink={selectedGuardrailId !== ""}>
                  {selectedGuardrailId === "" ? "" : t('agent.chat.GUARDRAIL_SELECTOR')}
                </InputLabel>
                <Select
                  labelId="guardrail-select-label"
                  id="guardrail-select"
                  value={selectedGuardrailId}
                  label={selectedGuardrailId === "" ? "" : "Select Guardrail"}
                  onChange={handleGuardrailChange}
                  displayEmpty
                  renderValue={(value) => {
                    if (value === "") {
                      return <em>{t('common.labels.NONE')}</em>;
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
                    <em>{t('agent.chat.NO_GUARDRAIL')}</em>
                  </MenuItem>
                  {guardrails.map((guardrail) => {
                    const items = [];

                    // Add all versions (including DRAFT) if available
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

              <Button
                variant="outlined"
                size="small"
                onClick={handleUpdateGuardrail}
                disabled={loading || isCurrentGuardrailSelected()}
                startIcon={<span>✓</span>}
              >
                {t('common.buttons.APPLY', 'Apply')}
              </Button>

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
                {t('common.buttons.VIEW_DETAILS')}
              </Button>
            </Box>
          </Paper>
        </>
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
                {t('chat.interface.SESSION_ID', 'Session ID')}: {sessionId}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto' }}>
            <IconButton
              color="primary"
              onClick={handleDownloadChat}
              title="Download chat history"
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
        </Box>)}


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
                    {t('chat.interface.SOURCES', 'Sources')} ({message.sources.length})
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
                                  {source.expanded ? 'Show Less' : 'Show More'}
                                </Button>
                              )}
                            </Box>
                          )}
                          
                          {/* Show reference metadata if available */}
                          {source.references && source.references.length > 0 && (
                            <Box component="span" sx={{ display: 'block', mt: 1, fontSize: '0.75rem', color: 'text.secondary' }}>
                              <Typography variant="caption" sx={{ fontWeight: 'bold' }}>{t('chat.interface.REFERENCE', 'Reference')}:</Typography>
                              {source.references.map((ref, refIdx) => (
                                <Box key={refIdx} sx={{ ml: 1, mt: 0.5 }}>
                                  {ref.location?.s3Location?.uri && (
                                    <Typography variant="caption" display="block">
                                      {t('chat.interface.SOURCE')}: {ref.location.s3Location.uri.split('/').pop()}
                                    </Typography>
                                  )}
                                  {ref.metadata && Object.keys(ref.metadata).length > 0 && (
                                    <Typography variant="caption" display="block" sx={{ color: 'text.disabled' }}>
                                      {t('chat.interface.ID')}: {ref.metadata['x-amz-bedrock-kb-chunk-id'] || t('common.labels.NA', 'N/A')}
                                    </Typography>
                                  )}
                                </Box>
                              ))}
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
        <form onSubmit={handleQuerySubmit} style={{ display: 'flex', gap: '8px' }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder={t('agent.chat.MESSAGE_PLACEHOLDER')}
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

export default AgentChat;
