/**
 * Multi-LLM Client for Agent Adventures
 * Handles API calls to Claude, GPT, and Gemini APIs with unified interface
 */

import { config } from '../config/environment.js';

export class LLMClient {
  constructor(provider, options = {}) {
    this.provider = provider; // 'claude', 'gpt', 'gemini'
    this.options = options;

    // Set up provider-specific configuration
    this.config = this._getProviderConfig(provider);
  }

  _getProviderConfig(provider) {
    switch (provider) {
      case 'claude':
        return {
          apiKey: config.llm.anthropic.apiKey,
          baseURL: 'https://api.anthropic.com/v1/messages',
          model: config.llm.anthropic.model,
          maxTokens: config.llm.anthropic.maxTokens,
          headers: {
            'x-api-key': config.llm.anthropic.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          }
        };

      case 'gpt':
        return {
          apiKey: config.llm.openai.apiKey,
          baseURL: 'https://api.openai.com/v1/chat/completions',
          model: config.llm.openai.model,
          maxTokens: config.llm.openai.maxTokens,
          headers: {
            'Authorization': `Bearer ${config.llm.openai.apiKey}`,
            'Content-Type': 'application/json'
          }
        };

      case 'gemini':
        return {
          apiKey: config.llm.google.apiKey,
          baseURL: `https://generativelanguage.googleapis.com/v1beta/models/${config.llm.google.model}:generateContent?key=${config.llm.google.apiKey}`,
          model: config.llm.google.model,
          maxTokens: config.llm.google.maxTokens,
          headers: {
            'Content-Type': 'application/json'
          }
        };

      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }

  /**
   * Generate completion with unified interface
   */
  async generateCompletion(systemPrompt, userPrompt, options = {}) {
    const maxTokens = options.maxTokens || this.config.maxTokens;

    try {
      const requestBody = this._buildRequestBody(systemPrompt, userPrompt, maxTokens);
      const startTime = Date.now();

      const response = await fetch(this.config.baseURL, {
        method: 'POST',
        headers: this.config.headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`${this.provider} API error (${response.status}): ${errorData}`);
      }

      const responseData = await response.json();
      const endTime = Date.now();

      return {
        content: this._extractContent(responseData),
        usage: this._extractUsage(responseData),
        model: this.config.model,
        provider: this.provider,
        responseTime: endTime - startTime,
        raw: responseData
      };

    } catch (error) {
      console.error(`[${this.provider}] API call failed:`, error.message);
      throw new Error(`${this.provider} completion failed: ${error.message}`);
    }
  }

  _buildRequestBody(systemPrompt, userPrompt, maxTokens) {
    switch (this.provider) {
      case 'claude':
        return {
          model: this.config.model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt }
          ]
        };

      case 'gpt':
        return {
          model: this.config.model,
          max_completion_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        };

      case 'gemini':
        // Combine system and user prompts for Gemini
        const combinedPrompt = `${systemPrompt}\n\nUser: ${userPrompt}`;
        return {
          contents: [
            {
              role: 'user',
              parts: [{ text: combinedPrompt }]
            }
          ],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.7
          }
        };

      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }

  _extractContent(responseData) {
    switch (this.provider) {
      case 'claude':
        return responseData.content?.[0]?.text || '';

      case 'gpt':
        return responseData.choices?.[0]?.message?.content || '';

      case 'gemini':
        return responseData.candidates?.[0]?.content?.parts?.[0]?.text || '';

      default:
        return '';
    }
  }

  _extractUsage(responseData) {
    switch (this.provider) {
      case 'claude':
        return {
          promptTokens: responseData.usage?.input_tokens || 0,
          completionTokens: responseData.usage?.output_tokens || 0,
          totalTokens: (responseData.usage?.input_tokens || 0) + (responseData.usage?.output_tokens || 0)
        };

      case 'gpt':
        return {
          promptTokens: responseData.usage?.prompt_tokens || 0,
          completionTokens: responseData.usage?.completion_tokens || 0,
          totalTokens: responseData.usage?.total_tokens || 0
        };

      case 'gemini':
        // Gemini doesn't always provide usage stats in the same format
        const usage = responseData.usageMetadata || {};
        return {
          promptTokens: usage.promptTokenCount || 0,
          completionTokens: usage.candidatesTokenCount || 0,
          totalTokens: usage.totalTokenCount || 0
        };

      default:
        return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }
  }

  /**
   * Test API connectivity
   */
  async testConnection() {
    try {
      const response = await this.generateCompletion(
        'You are a test assistant.',
        'Say "Connection successful" if you can read this message.',
        { maxTokens: 50 }
      );

      return {
        success: true,
        provider: this.provider,
        model: this.config.model,
        response: response.content,
        usage: response.usage,
        responseTime: response.responseTime
      };
    } catch (error) {
      return {
        success: false,
        provider: this.provider,
        error: error.message
      };
    }
  }

  /**
   * Get provider-specific model information
   */
  getModelInfo() {
    return {
      provider: this.provider,
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      apiKeySet: !!this.config.apiKey
    };
  }
}

/**
 * Factory function to create LLM clients
 */
export function createLLMClient(provider, options = {}) {
  return new LLMClient(provider, options);
}

/**
 * Test all configured LLM providers
 */
export async function testAllProviders() {
  const providers = ['claude', 'gpt', 'gemini'];
  const results = {};

  for (const provider of providers) {
    try {
      const client = new LLMClient(provider);
      results[provider] = await client.testConnection();
    } catch (error) {
      results[provider] = {
        success: false,
        provider,
        error: error.message
      };
    }
  }

  return results;
}