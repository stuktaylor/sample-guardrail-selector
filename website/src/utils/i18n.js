import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Translation resources
const resources = {
  en: {
    translation: {
      // Common
      'common.app.TITLE': 'CRWD Interview Demo',
      'common.buttons.SEND': 'Send',
      'common.buttons.CLEAR': 'Clear',
      'common.buttons.CLOSE': 'Close',
      'common.buttons.REFRESH': 'Refresh',
      'common.labels.LOADING': 'Loading...',
      'common.labels.NONE': 'None',
      'common.labels.LANGUAGE': 'Language',
      'common.languages.ENGLISH': 'English',
      'common.languages.SPANISH': 'Español',
      
      // Layout
      'layout.header.TITLE': 'CRWD Interview Demo',
      'layout.footer.WELCOME': 'Welcome to the sample',
      
      // Chat
      'chat.interface.NEW_CHAT': 'New',
      'chat.interface.TITLE': 'Chat',
      'chat.interface.CHAT': 'Chat',
      'chat.interface.MESSAGE_PLACEHOLDER': 'Ask a question...',
      'chat.interface.THINKING': 'Thinking...',
      'chat.interface.WELCOME': 'Welcome! Ask me questions.',
      'chat.interface.NEW_SESSION': 'Started a new conversation. Previous context has been cleared.',
      'chat.interface.ERROR': 'An error occurred while processing your request.',
      'chat.interface.CONFIRM_MODE_CHANGE': 'Changing the chat mode will clear your current conversation history. Are you sure you want to continue?',
      'chat.interface.CONFIRM_NEW_CHAT': 'Are you sure you want to start a new chat? This will clear all current conversation history.',
      'chat.interface.CHAT_HISTORY': 'Chat History',
      'chat.interface.GENERATED_ON': 'Generated on',
      'chat.interface.GUARDRAILS': 'Guardrails',
      'chat.interface.SELECT_GUARDRAIL': 'Select Guardrail',
      'chat.interface.NONE': 'None',
      'chat.interface.NO_GUARDRAIL': 'None (No guardrail)',
      'chat.interface.VIEW': 'View',
      'chat.interface.DETAILS': 'Details',
      'chat.interface.SOURCES': 'Sources',
      'chat.interface.KNOWLEDGE_BASE': 'Knowledge Base',
      'chat.interface.LLM': 'LLM',
      'chat.interface.SOURCE': 'Source',
      'chat.interface.ID': 'ID',
      'chat.interface.NEW_CHAT_TITLE': 'Start a new conversation',
      'chat.interface.DOWNLOAD_CHAT_HISTORY': 'Download chat history',
      'chat.interface.SHOW_LESS': 'Show Less',
      'chat.interface.SHOW_MORE': 'Show More',

      
      // Agent Chat
      'agent.chat.TITLE': 'Agent Chat',
      'agent.chat.WELCOME': 'Welcome! Ask me questions and I\'ll respond using the Amazon Bedrock Agent.',
      'agent.chat.NEW_SESSION': 'Started a new conversation. Previous context has been cleared.',
      'agent.chat.MESSAGE_PLACEHOLDER': 'Ask a question to the Bedrock Agent...',
      'agent.chat.GUARDRAIL_SELECTOR': 'Select Guardrail',
      'agent.chat.NO_GUARDRAIL': 'None (Remove guardrail)',
      'agent.chat.CONFIRM_NEW_CHAT': 'Are you sure you want to start a new chat? This will clear all current conversation history.',
      'agent.chat.CHAT_HISTORY': 'Agent Chat History',
      'agent.chat.GUARDRAIL_FOR_AGENT': 'Guardrail for Agent',
      'agent.chat.THROTTLING_ERROR': 'Throttling Error: Your request rate is too high. Please wait a moment before sending another request.',
      
      // Guardrail Details
      'guardrail.details.TITLE': 'Guardrail Details',
      'guardrail.details.DESCRIPTION': 'Description',
      'guardrail.details.NO_DESCRIPTION': 'No description provided',
      'guardrail.details.TOPICS': 'Topic Policies',
      'guardrail.details.NO_TOPICS': 'No topics configured',
      'guardrail.details.FILTERS': 'Content Filters',
      'guardrail.details.NO_FILTERS': 'No content filters configured',
      'guardrail.details.DEFINITION': 'Definition',
      'guardrail.details.EXAMPLES': 'Examples',
      'guardrail.details.CURRENT_VERSION': 'Current Version',
      'guardrail.details.PII_ENTITY_TYPES': 'PII Entity Types',
      'guardrail.details.DRAFT': 'DRAFT',
      'guardrail.details.INPUT_STRENGTH': 'Input Strength',
      'guardrail.details.OUTPUT_STRENGTH': 'Output Strength',
      'guardrail.details.INPUT': 'Input',
      'guardrail.details.OUTPUT': 'Output',
      'guardrail.details.ACTION': 'Action',
      'guardrail.details.ENABLED': 'Enabled',
      'guardrail.details.DISABLED': 'Disabled',
      'guardrail.details.NO_PII_ENTITIES': 'No PII entity types configured',
      'guardrail.details.CUSTOM_REGEX': 'Custom Regex Patterns',
      'guardrail.details.CUSTOM_REGEX_DEFAULT': 'Custom Regex {{index}}',
      'guardrail.details.PATTERN': 'Pattern',
      'guardrail.details.NO_REGEX': 'No custom regex patterns configured',
      'guardrail.details.MESSAGING': 'Messaging',
      'guardrail.details.BLOCKED_INPUT_MESSAGE': 'Blocked Input Message',
      'guardrail.details.BLOCKED_OUTPUT_MESSAGE': 'Blocked Output Message',
      'guardrail.details.DEFAULT_MESSAGE': 'Default message',
      
      // Navigation
      'nav.menu.AGENT_CHAT': 'Agent Chat',
      'nav.menu.CHAT': 'Chat',
      
      // Tabs
      'tabs.menu.AGENT_CHAT': 'Agent Chat',
      'tabs.menu.CHAT': 'Chat',
      
      // Common
      'common.labels.NA': 'N/A',
      'common.buttons.APPLY': 'Apply',
      'common.buttons.VIEW_DETAILS': 'View Details',

      // Errors
      'error.messages.GENERIC': 'Something went wrong',
      'error.messages.API_ERROR': 'Error connecting to the API',
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
