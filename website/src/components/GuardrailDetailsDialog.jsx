import React, { useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Divider,
  Chip,
  Paper
} from '@mui/material';
import { useTranslation } from 'react-i18next';

/**
 * A reusable component for displaying guardrail details in a dialog
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onClose - Function to call when dialog is closed
 * @param {Object} props.guardrail - The guardrail object to display details for
 */
function GuardrailDetailsDialog({ open, onClose, guardrail }) {
  const { t } = useTranslation();
  
  // Find the active version based on selectedVersion
  const activeVersion = useMemo(() => {
    if (!guardrail || !guardrail.versions || guardrail.versions.length === 0) {
      return null;
    }
    
    const selectedVersion = guardrail.selectedVersion || 'DRAFT';
    return guardrail.versions.find(v => v.version === selectedVersion) || guardrail.versions[0];
  }, [guardrail]);

  // Early return after all hooks have been called
  if (!guardrail) return null;

  // Display version information if available
  const versionInfo = () => {
    if (!guardrail.versions || guardrail.versions.length === 0) {
      return (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
          <Typography variant="subtitle2">{t('guardrail.details.CURRENT_VERSION')}:</Typography>
          <Chip 
            label="DRAFT" 
            size="small" 
            color="primary" 
            variant={guardrail.selectedVersion === 'DRAFT' ? "filled" : "outlined"} 
          />
        </Box>
      );
    }
    
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
        <Typography variant="subtitle2">{t('guardrail.details.CURRENT_VERSION')}: {guardrail.selectedVersion || 'DRAFT'}</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
          <Chip 
            label="DRAFT" 
            size="small" 
            color="primary" 
            variant={guardrail.selectedVersion === 'DRAFT' ? "filled" : "outlined"} 
          />
          {guardrail.versions.map((version, idx) => (
            version.version !== 'DRAFT' && 
            <Chip 
              key={idx} 
              label={`Version ${version.version}`} 
              size="small" 
              color="primary" 
              variant={guardrail.selectedVersion === version.version ? "filled" : "outlined"} 
            />
          ))}
        </Box>
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        {t('guardrail.details.TITLE')}: {activeVersion?.name || guardrail.name || guardrail.guardrailId}
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle1" gutterBottom>
          {t('chat.interface.ID')}: {guardrail.guardrailId}
        </Typography>

        <Typography variant="subtitle1" gutterBottom>
          {t('guardrail.details.DESCRIPTION')}: {activeVersion?.description || t('guardrail.details.NO_DESCRIPTION')}
        </Typography>

        {/* Display version information */}
        {versionInfo()}

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" gutterBottom>
          {t('guardrail.details.FILTERS')}
        </Typography>

        {activeVersion?.contentPolicy?.filters?.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
            {activeVersion.contentPolicy.filters.map((filter, idx) => (
              <Paper key={idx} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="primary">
                  {filter.type}
                </Typography>
                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {t('guardrail.details.INPUT_STRENGTH')}:
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {filter.inputStrength || t('common.labels.NONE')}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {t('guardrail.details.INPUT_STRENGTH')}:
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {filter.inputStrength || t('common.labels.NONE')}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {t('guardrail.details.OUTPUT_STRENGTH')}:
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {filter.outputStrength || t('common.labels.NONE')}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t('guardrail.details.NO_FILTERS')}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" gutterBottom>
          {t('guardrail.details.TOPICS')}
        </Typography>

        {activeVersion?.topicPolicy?.topics?.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
            {activeVersion.topicPolicy.topics.map((topic, idx) => (
              <Paper key={idx} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="primary">
                  {topic.name} ({topic.type})
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {t('guardrail.details.DEFINITION')}:
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                    {topic.definition}
                  </Typography>
                </Box>
                {topic.examples && topic.examples.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {t('guardrail.details.EXAMPLES')}:
                    </Typography>
                    <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                      {topic.examples.map((example, i) => (
                        <li key={i}>
                          <Typography variant="body2" color="text.secondary">
                            {example}
                          </Typography>
                        </li>
                      ))}
                    </ul>
                  </Box>
                )}
              </Paper>
            ))}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t('guardrails.messages.NO_TOPIC_POLICIES')}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" gutterBottom>
          {t('guardrail.details.PII_ENTITY_TYPES')}
        </Typography>

        {activeVersion?.sensitiveInformationPolicy?.piiEntities?.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
            {activeVersion.sensitiveInformationPolicy.piiEntities.map((entity, idx) => (
              <Paper key={idx} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="secondary">
                  {entity.type}
                </Typography>
                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {t('guardrail.details.INPUT')}: {entity.inputEnabled ? t('guardrail.details.ENABLED') : t('guardrail.details.DISABLED')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('guardrail.details.ACTION')}: {entity.inputAction || entity.action || t('common.labels.NONE')}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {t('guardrail.details.OUTPUT')}: {entity.outputEnabled ? t('guardrail.details.ENABLED') : t('guardrail.details.DISABLED')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('guardrail.details.ACTION')}: {entity.outputAction || entity.action || t('common.labels.NONE')}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t('guardrail.details.NO_PII_ENTITIES')}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" gutterBottom>
          {t('guardrail.details.CUSTOM_REGEX')}
        </Typography>

        {activeVersion?.sensitiveInformationPolicy?.regexes?.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
            {activeVersion.sensitiveInformationPolicy.regexes.map((regex, idx) => (
              <Paper key={idx} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="secondary">
                  {regex.name || t('guardrail.details.CUSTOM_REGEX_DEFAULT', { index: idx + 1 })}
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {t('guardrail.details.PATTERN')}:
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ 
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    bgcolor: '#f5f5f5',
                    p: 1,
                    borderRadius: 1
                  }}>
                    {regex.pattern}
                  </Typography>
                </Box>
                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {t('guardrail.details.INPUT')}: {regex.inputEnabled ? t('guardrail.details.ENABLED') : t('guardrail.details.DISABLED')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('guardrail.details.ACTION')}: {regex.inputAction || t('common.labels.NONE')}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {t('guardrail.details.OUTPUT')}: {regex.outputEnabled ? t('guardrail.details.ENABLED') : t('guardrail.details.DISABLED')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('guardrail.details.ACTION')}: {regex.outputAction || t('common.labels.NONE')}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t('guardrail.details.NO_REGEX')}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" gutterBottom>
          {t('guardrail.details.MESSAGING')}
        </Typography>

        <Typography variant="subtitle2" gutterBottom>
          {t('guardrail.details.BLOCKED_INPUT_MESSAGE')}:
        </Typography>
        <Typography variant="body2" paragraph>
          {activeVersion?.blockedInputMessaging || t('guardrail.details.DEFAULT_MESSAGE')}
        </Typography>

        <Typography variant="subtitle2" gutterBottom>
          {t('guardrail.details.BLOCKED_OUTPUT_MESSAGE')}:
        </Typography>
        <Typography variant="body2">
          {activeVersion?.blockedOutputsMessaging || t('guardrail.details.DEFAULT_MESSAGE')}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.buttons.CLOSE')}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default GuardrailDetailsDialog;
