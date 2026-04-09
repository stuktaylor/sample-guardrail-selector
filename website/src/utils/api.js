/**
 * API client for the Sample Just-in-Time Amazon Bedrock Knowledge Base application
 * This file contains all the REST API calls used in the application
 */

class ApiClient {
  constructor() {
    // Get the API URL from the config
    this.apiUrl = window.config?.API;
    if (!this.apiUrl) {
      console.error('API URL not found in config');
    }
    
    // Remove trailing slash if present
    if (this.apiUrl && this.apiUrl.endsWith('/')) {
      this.apiUrl = this.apiUrl.slice(0, -1);
    }
  }

  /**
   * Make an API request
   * @param {string} endpoint - API endpoint path
   * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
   * @param {Object} [body] - Request body for POST/PUT requests
   * @returns {Promise<Object>} Response data
   * @private
   */
  async _apiRequest(endpoint, method, body = null) {
    const url = `${this.apiUrl}${endpoint}`;
    
    const options = {
      method
    };
    
    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }
    
    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      // Check if response is empty
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      console.error("Error in request:", { method, endpoint, error });
      throw error;
    }
  }

  // ===== Knowledge Base API =====

  /**
   * Query the knowledge base
   * @param {Object} queryData - Query parameters
   * @returns {Promise<Object>} Query results
   */
  async queryKnowledgeBase(queryData) {
    return this._apiRequest('/knowledge-base/query', 'POST', queryData);
  }
  
  // ===== LLM API =====

  /**
   * Query the LLM
   * @param {Object} queryData - Query parameters
   * @returns {Promise<Object>} Query results
   */
  async query(queryData) {
    return this._apiRequest('/llm/query', 'POST', queryData);
  }

  // ===== Agent API =====
  
  /**
   * Invoke the Bedrock Agent
   * @param {Object} queryData - Query parameters
   * @returns {Promise<Object>} Agent response
   */
  async invokeAgent(queryData) {
    return this._apiRequest('/agent/invoke', 'POST', queryData);
  }

  // ===== Guardrails API =====
  
  /**
   * Get all guardrails
   * @returns {Promise<Object>} List of guardrails and current guardrail
   */
  async getGuardrails() {
    return this._apiRequest('/guardrails', 'GET');
  }
  
  /**
   * Get guardrail details for a specific agent ID
   * @param {string} agentId - The ID of the agent to get guardrail details for
   * @returns {Promise<Object>} Guardrail details for the specified agent
   */
  async getGuardrailDetails(agentId) {
    return this._apiRequest(`/guardrails/${encodeURIComponent(agentId)}`, 'GET');
  }
  
  /**
   * Update the agent's guardrail
   * @param {Object} guardrailData - Guardrail data to update
   * @returns {Promise<Object>} Update result
   */
  async updateGuardrail(guardrailData) {
    return this._apiRequest('/guardrails', 'PUT', guardrailData);
  }
}

// Create a singleton instance
const apiClient = new ApiClient();

// Export the singleton
export default apiClient;
