# Structured Output Test Script

## Purpose

This script verifies that the LLM client implementation correctly handles structured output (JSON) responses across all three providers: Claude (Anthropic), GPT (OpenAI), and Gemini (Google).

## The Problem

Our current implementation has an issue where `supportsResponseFormat` is checked but never set in the provider configuration. This causes:

1. **Claude**: Falls back to prompt-based JSON instructions instead of using native `response_format` API parameter (when beta header is set)
2. **GPT**: Should work with native `response_format` support
3. **Gemini**: Should work with `responseMimeType` and `responseSchema` support

## What the Test Does

The script runs three test cases for each provider:

1. **Simple JSON** - Tests basic JSON response with `{ type: 'json' }`
2. **JSON Schema** - Tests structured response with a defined schema
3. **JSON Schema with Example** - Tests schema + example data

For each test, it checks:
- ✅ Can the client make the request?
- ✅ Does the response parse correctly?
- ✅ Is the response native JSON or a string that needs parsing?
- ✅ Does the response match the expected schema?

## Usage

### Basic Test (All Providers)

```bash
node scripts/test-structured-output.js
```

### With Raw Response Output (Debugging)

```bash
node scripts/test-structured-output.js --raw
```

This will show the raw API response structure, useful for debugging how each provider returns structured data.

## Expected Results

### Ideal Outcome ✅
- **Claude**: Native JSON response (requires `ANTHROPIC_RESPONSE_FORMAT_BETA` header)
- **GPT**: Native JSON response
- **Gemini**: Native JSON response

### Current Issue ⚠️
- **Claude**: String response (needs parsing) because `supportsResponseFormat` is never set
- **GPT**: May work but needs verification
- **Gemini**: May work but needs verification

## Environment Setup

### Required Environment Variables

```bash
# Claude
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_RESPONSE_FORMAT_BETA=2024-10-01  # Optional but recommended

# OpenAI
OPENAI_API_KEY=sk-...

# Google
GOOGLE_API_KEY=...
```

### Setting the Response Format Beta Header

For Claude to use native structured output, you need to set the beta header:

```bash
export ANTHROPIC_RESPONSE_FORMAT_BETA="2024-10-01"
```

Add this to your `.env` file for persistence.

## Understanding the Output

### Test Output Legend

- ✅ - Test passed successfully
- ❌ - Test failed
- ⚠️  - Partial success (works but not ideal)
- 📦 - Native JSON response (ideal - no parsing needed)
- 📝 - String response (requires JSON.parse)

### Example Output

```
Testing CLAUDE Structured Output
================================================================================

Configuration Check
--------------------------------------------------------------------------------
  Model: claude-sonnet-4-5-20250929
  API Key Set: ✅ Yes
  Max Tokens: Not set
  Supports Response Format: ❌ No (will use prompt-based fallback)

Test 1: Simple JSON (type: "json")
--------------------------------------------------------------------------------
Request configuration:
  Response Format:
    {
      "type": "json"
    }

⏳ Making API call...

✅ Response received (1234ms)

Content Analysis:
  Content Type: string
  ⚠️  Content is a string, attempting to parse...
  ✅ Successfully parsed JSON from string

Parsed Content:
  {
    "message": "Hello! This is a test greeting.",
    "timestamp": "2025-10-08T12:00:00Z",
    "status": "success"
  }

Schema Validation:
  Has "message" field: ✅ Yes
  Has valid "status" field: ✅ Yes
  ✅ Response matches expected schema
```

## Fixing the Issue

The root cause is in `src/llm/llm-client.js` at line ~23-32 in `_getProviderConfig`:

```javascript
case 'claude':
  return {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: 'https://api.anthropic.com/v1/messages',
    model: config.llm.anthropic.model,
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
      // MISSING: 'anthropic-beta' header if ANTHROPIC_RESPONSE_FORMAT_BETA is set
    }
    // MISSING: supportsResponseFormat flag
  };
```

**Needs to be:**

```javascript
case 'claude':
  const responseFormatBeta = process.env.ANTHROPIC_RESPONSE_FORMAT_BETA || config.llm.anthropic.responseFormatBeta;
  const headers = {
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  };

  if (responseFormatBeta) {
    headers['anthropic-beta'] = `response-format=${responseFormatBeta}`;
  }

  return {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: 'https://api.anthropic.com/v1/messages',
    model: config.llm.anthropic.model,
    supportsResponseFormat: !!responseFormatBeta,  // ADD THIS
    headers
  };
```

## Integration with CI/CD

This test can be added to your test suite:

```json
// package.json
{
  "scripts": {
    "test:structured-output": "node scripts/test-structured-output.js"
  }
}
```

Then run: `npm run test:structured-output`

## Debugging Tips

1. **Check API Keys**: The script will skip providers without API keys
2. **View Raw Responses**: Use `--raw` flag to see actual API response structure
3. **Check Rate Limits**: If tests fail, you may have hit rate limits
4. **Token Usage**: Script shows token usage for each test to help monitor costs

## Related Files

- `src/llm/llm-client.js` - Main LLM client implementation
- `src/config/environment.js` - Configuration and environment variables
- `docs/OPTIMIZATION_REVIEW.md` - Full codebase optimization review

## Questions?

If you see unexpected results:

1. Run with `--raw` flag to see actual API responses
2. Check that API keys are set correctly
3. Verify the beta header is set for Claude (if using native structured output)
4. Check the model names in `src/config/environment.js` are correct
