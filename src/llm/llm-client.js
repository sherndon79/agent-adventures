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
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error('ANTHROPIC_API_KEY environment variable not set.');
        }
        return {
          apiKey: process.env.ANTHROPIC_API_KEY,
          baseURL: 'https://api.anthropic.com/v1/messages',
          model: config.llm.anthropic.model,
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          }
        };
      case 'gpt':
        if (!process.env.OPENAI_API_KEY) {
          throw new Error('OPENAI_API_KEY environment variable not set.');
        }
        return {
          apiKey: process.env.OPENAI_API_KEY,
          baseURL: 'https://api.openai.com/v1/chat/completions',
          model: config.llm.openai.model,
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        };
      case 'gemini':
        if (!process.env.GOOGLE_API_KEY) {
          throw new Error('GOOGLE_API_KEY environment variable not set.');
        }
        return {
          apiKey: process.env.GOOGLE_API_KEY,
          baseURL: `https://generativelanguage.googleapis.com/v1beta/models/${config.llm.google.model}:generateContent?key=${process.env.GOOGLE_API_KEY}`,
          model: config.llm.google.model,
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
    const responseFormat = this._normaliseResponseFormat(options.responseFormat);

    try {
      const requestBody = this._buildRequestBody(systemPrompt, userPrompt, maxTokens, responseFormat);
      const startTime = Date.now();

      const response = await fetch(this.config.baseURL, {
        method: 'POST',
        headers: this.config.headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.text();

        // Check for rate limit / quota errors
        if (response.status === 429 || response.status === 529) {
          const error = new Error(`${this.provider} rate limit exceeded`);
          error.code = 'RATE_LIMIT_EXCEEDED';
          error.provider = this.provider;
          error.status = response.status;
          throw error;
        }

        // Check for overloaded errors (common with Claude/Anthropic)
        if (errorData.includes('overloaded') || errorData.includes('Overloaded')) {
          const error = new Error(`${this.provider} API overloaded`);
          error.code = 'API_OVERLOADED';
          error.provider = this.provider;
          error.status = response.status;
          throw error;
        }

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

  _buildRequestBody(systemPrompt, userPrompt, maxTokens, responseFormat) {
    switch (this.provider) {
      case 'claude': {
        const finalUserPrompt = this.config.supportsResponseFormat
          ? userPrompt
          : this._appendExampleToPrompt(userPrompt, responseFormat);

        return {
          model: this.config.model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [
            { role: 'user', content: finalUserPrompt }
          ],
          ...(this._mapAnthropicResponseFormat(responseFormat) || {})
        };
      }

      case 'gpt': {
        const finalUserPrompt = this._appendExampleToPrompt(userPrompt, responseFormat);

        return {
          model: this.config.model,
          max_completion_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: finalUserPrompt }
          ],
          response_format: this._mapOpenAIResponseFormat(responseFormat)
        };
      }

      case 'gemini': {
        const finalUserPrompt = this._appendExampleToPrompt(userPrompt, responseFormat);
        const combinedPrompt = `${systemPrompt}\n\nUser: ${finalUserPrompt}`;
        const baseConfig = {
          maxOutputTokens: maxTokens,
          temperature: 0.7
        };

        const geminiConfig = this._mapGeminiResponseFormat(responseFormat, baseConfig);

        return {
          contents: [
            {
              role: 'user',
              parts: [{ text: combinedPrompt }]
            }
          ],
          generationConfig: geminiConfig
        };
      }

      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }

  _normaliseResponseFormat(format) {
    if (!format) {
      return null;
    }

    if (typeof format === 'string') {
      const value = format.trim().toLowerCase();
      if (!value) {
        return null;
      }

      if (value === 'json' || value === 'json_object') {
        return { type: 'json' };
      }

      if (value === 'json_schema' || value === 'schema') {
        return { type: 'json_schema' };
      }

      return null;
    }

    if (Array.isArray(format) || typeof format !== 'object') {
      return null;
    }

    const normalised = { ...format };
    if (normalised.type) {
      normalised.type = String(normalised.type).toLowerCase();
    }

    if (!normalised.type) {
      if (normalised.schema || normalised.jsonSchema || normalised.json_schema) {
        normalised.type = 'json_schema';
      }
    }

    if (normalised.schema === undefined) {
      normalised.schema = normalised.schema
        || normalised.jsonSchema
        || normalised.json_schema;
    }

    if (!normalised.mimeType && (normalised.mime_type || normalised.mimetype)) {
      normalised.mimeType = normalised.mime_type || normalised.mimetype;
    }

    if (!normalised.name && (normalised.schemaName || normalised.schema_name)) {
      normalised.name = normalised.schemaName || normalised.schema_name;
    }

    if (!normalised.schemaId && (normalised.schema_id)) {
      normalised.schemaId = normalised.schema_id;
    }

    if (!normalised.schemaVersion && (normalised.schema_version)) {
      normalised.schemaVersion = normalised.schema_version;
    }

    return normalised.type ? normalised : null;
  }

  _mapAnthropicResponseFormat(format) {
    if (!format) {
      return null;
    }

    if (!this.config.supportsResponseFormat) {
      console.warn('[claude] Structured response requested but ANTHROPIC_RESPONSE_FORMAT_BETA not set. Falling back to raw text output.');
      return null;
    }

    if (format.type === 'json') {
      return {
        response_format: {
          type: 'json'
        }
      };
    }

    if (format.type === 'json_schema' && format.schema && typeof format.schema === 'object') {
      const schemaName = format.name || 'StructuredResponse';
      const strict = format.strict !== false;
      const examples = this._prepareAnthropicExamples(format);

      return {
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: schemaName,
            strict,
            schema: format.schema,
            ...(examples.length > 0 ? { examples } : {})
          }
        }
      };
    }

    return null;
  }

  _mapOpenAIResponseFormat(format) {
    if (!format) {
      return undefined;
    }

    if (format.type === 'json') {
      return { type: 'json_object' };
    }

    if (format.type === 'json_schema' && format.schema && typeof format.schema === 'object') {
      const schemaName = format.name || 'StructuredResponse';
      const strict = format.strict !== false;

      // FIX 2: Add additionalProperties: false for OpenAI strict mode
      const enhancedSchema = strict ? this._addAdditionalPropertiesFalse(format.schema) : format.schema;

      return {
        type: 'json_schema',
        json_schema: {
          name: schemaName,
          schema: enhancedSchema,
          strict
        }
      };
    }

    return undefined;
  }

  /**
   * Add additionalProperties: false to schema for OpenAI strict mode (FIX 2)
   * OpenAI requires this for all object types when using strict mode
   */
  _addAdditionalPropertiesFalse(schema) {
    if (typeof schema !== 'object' || schema === null) {
      return schema;
    }

    const enhanced = { ...schema };

    // Add to root object
    if (enhanced.type === 'object' && !('additionalProperties' in enhanced)) {
      enhanced.additionalProperties = false;
    }

    // Recursively add to nested objects in properties
    if (enhanced.properties) {
      enhanced.properties = Object.fromEntries(
        Object.entries(enhanced.properties).map(([key, value]) => [
          key,
          this._addAdditionalPropertiesFalse(value)
        ])
      );
    }

    // Handle arrays
    if (enhanced.items) {
      enhanced.items = this._addAdditionalPropertiesFalse(enhanced.items);
    }

    return enhanced;
  }

  _mapGeminiResponseFormat(format, baseConfig) {
    const config = { ...baseConfig };

    if (!format) {
      return config;
    }

    config.responseMimeType = format.mimeType || 'application/json';

    if (format.schema && typeof format.schema === 'object') {
      const converted = this._convertJsonSchemaToGemini(format.schema);
      if (converted) {
        config.responseSchema = converted;
      }
    }

    return config;
  }

  _convertJsonSchemaToGemini(schema) {
    if (!schema || typeof schema !== 'object') {
      return null;
    }

    const typeValue = typeof schema.type === 'string' ? schema.type.toLowerCase() : null;

    switch (typeValue) {
      case 'object': {
        const properties = {};
        const inputProps = schema.properties || {};
        for (const [key, value] of Object.entries(inputProps)) {
          const convertedChild = this._convertJsonSchemaToGemini(value);
          if (convertedChild) {
            properties[key] = convertedChild;
          }
        }

        const result = {
          type: 'OBJECT',
          properties
        };

        if (Array.isArray(schema.required) && schema.required.length > 0) {
          result.required = [...schema.required];
        }

        if (schema.description) {
          result.description = schema.description;
        }

        return result;
      }
      case 'array': {
        const itemSchema = this._convertJsonSchemaToGemini(schema.items);
        const result = {
          type: 'ARRAY'
        };

        if (itemSchema) {
          result.items = itemSchema;
        }

        if (schema.description) {
          result.description = schema.description;
        }

        return result;
      }
      case 'string': {
        const result = { type: 'STRING' };
        if (schema.enum) {
          result.enum = schema.enum;
        }
        if (schema.description) {
          result.description = schema.description;
        }
        return result;
      }
      case 'integer': {
        const result = { type: 'INTEGER' };
        if (schema.description) {
          result.description = schema.description;
        }
        return result;
      }
      case 'number': {
        const result = { type: 'NUMBER' };
        if (schema.description) {
          result.description = schema.description;
        }
        return result;
      }
      case 'boolean': {
        const result = { type: 'BOOLEAN' };
        if (schema.description) {
          result.description = schema.description;
        }
        return result;
      }
      default:
        return null;
    }
  }

  _collectRawExamples(format) {
    if (!format) {
      return [];
    }

    const raw = [];

    if (Array.isArray(format.examples) && format.examples.length > 0) {
      raw.push(...format.examples);
    } else if (format.examples !== undefined) {
      raw.push(format.examples);
    }

    if (format.example !== undefined) {
      raw.push(format.example);
    }

    return raw;
  }

  _prepareAnthropicExamples(format) {
    const raw = this._collectRawExamples(format);
    const parsed = [];

    for (const entry of raw) {
      if (entry && typeof entry === 'object') {
        parsed.push(entry);
        continue;
      }

      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            parsed.push(JSON.parse(trimmed));
          } catch (error) {
            console.warn('[claude] Unable to parse example JSON string for structured output:', error.message);
          }
        }
      }
    }

    return parsed;
  }

  _formatExampleForPrompt(format) {
    const raw = this._collectRawExamples(format);
    if (raw.length === 0) {
      return null;
    }

    const first = raw[0];
    if (typeof first === 'string') {
      return first.trim();
    }

    try {
      return JSON.stringify(first, null, 2);
    } catch (error) {
      return null;
    }
  }

  _appendExampleToPrompt(prompt, format) {
    if (!format || (format.type !== 'json' && format.type !== 'json_schema')) {
      return prompt;
    }

    const safePrompt = typeof prompt === 'string' ? prompt : '';
    const joiner = safePrompt.length > 0 ? '\n\n' : '';
    const exampleSnippet = this._formatExampleForPrompt(format);
    const instruction = 'Return only valid JSON that matches the requested structure.';

    if (exampleSnippet) {
      return `${safePrompt}${joiner}Example response:\n${exampleSnippet}\n\n${instruction}`;
    }

    return `${safePrompt}${joiner}${instruction}`;
  }

  _extractContent(responseData) {
    switch (this.provider) {
      case 'claude':
        if (!responseData?.content || responseData.content.length === 0) {
          return '';
        }

        // Check for native JSON response first (when beta header is available)
        for (const item of responseData.content) {
          if (item?.json !== undefined) {
            return item.json;
          }
          if (item?.type === 'output_json' && item?.output_json !== undefined) {
            return item.output_json;
          }
          if (item?.type === 'output_text' && typeof item?.text === 'string') {
            return item.text;
          }
        }

        // Fall back to text content with markdown stripping (FIX 1)
        let textContent = responseData.content?.[0]?.text || '';

        // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
        if (textContent.includes('```')) {
          textContent = textContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
        }

        return textContent;

      case 'gpt':
        if (!responseData?.choices || responseData.choices.length === 0) {
          return '';
        }

        const message = responseData.choices[0]?.message;
        if (!message) {
          return '';
        }

        const content = message.content;
        if (Array.isArray(content)) {
          for (const part of content) {
            if (part?.type === 'json_schema' && part?.json) {
              return part.json;
            }
            if (part?.type === 'json_object' && part?.json) {
              return part.json;
            }
            if (typeof part?.text === 'string') {
              return part.text;
            }
          }
          return '';
        }

        return content || '';

      case 'gemini':
        if (!responseData?.candidates || responseData.candidates.length === 0) {
          return '';
        }

        const parts = responseData.candidates[0]?.content?.parts;
        if (Array.isArray(parts) && parts.length > 0) {
          const first = parts[0];

          // Check for function call format
          if (first?.functionCall?.args) {
            return first.functionCall.args;
          }

          // Check for native JSON field (rare)
          if (first?.json) {
            return first.json;
          }

          // FIX 3: Most common - text field contains JSON string (gemini-2.5-flash-lite)
          if (typeof first?.text === 'string') {
            return first.text;
          }
        }

        return '';

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
