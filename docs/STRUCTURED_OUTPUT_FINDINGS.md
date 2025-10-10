# Structured Output Test Findings

**Date:** 2025-10-08
**Test Script:** `scripts/test-structured-output.js`

## Executive Summary

✅ **Test script successfully created and executed**
❌ **All three LLM providers failing structured output tests**
🔧 **Multiple fixes required in `src/llm/llm-client.js`**

---

## Test Results

### Claude (Anthropic)
**Status:** ❌ All tests failed
**Issue:** Returns JSON wrapped in markdown code blocks

```
Response: ```json\n{\n  "message": "...",\n  "status": "success"\n}\n```
```

**Root Cause:**
1. `supportsResponseFormat` never set in provider config
2. Missing `anthropic-beta` header for response format
3. Falls back to prompt-based instruction, which causes Claude to wrap response in markdown

**Fix Required:**
```javascript
// In _getProviderConfig for 'claude' case:
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

**Fallback Fix (If Beta Not Available):**
Add markdown stripping to `_extractContent` for Claude:
```javascript
case 'claude':
  // ... existing logic ...
  let textContent = responseData.content?.[0]?.text || '';

  // Strip markdown code blocks if present
  textContent = textContent.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  return textContent;
```

---

### GPT (OpenAI)
**Status:** ❌ All schema tests failed
**Issue:** Schema validation error

```
Invalid schema for response_format 'GreetingResponse': In context=(),
'additionalProperties' is required to be supplied and to be false.
```

**Root Cause:**
OpenAI requires `additionalProperties: false` in JSON schemas when using strict mode.

**Fix Required:**
```javascript
// In _mapOpenAIResponseFormat:
if (format.type === 'json_schema' && format.schema && typeof format.schema === 'object') {
  const schemaName = format.name || 'StructuredResponse';
  const strict = format.strict !== false;

  // OpenAI requires additionalProperties: false for strict mode
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

// New helper method:
_addAdditionalPropertiesFalse(schema) {
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  const enhanced = { ...schema };

  // Add to root object
  if (enhanced.type === 'object' && !('additionalProperties' in enhanced)) {
    enhanced.additionalProperties = false;
  }

  // Recursively add to nested objects
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
```

---

### Gemini (Google)
**Status:** ❌ All tests failed
**Issue:** Returns empty/incomplete JSON responses

```
Token Usage:
  Prompt Tokens: 36
  Completion Tokens: 0  <-- No output generated
  Total Tokens: 235

Content: "" (empty string)
```

**Root Causes:**
1. Schema conversion might be too strict/incorrect
2. Gemini may have issues with the test prompt format
3. Response extraction may not be handling Gemini's format correctly

**Investigation Needed:**
Run test with `--raw` flag to see actual API response structure:
```bash
node scripts/test-structured-output.js --raw
```

**Potential Fixes:**

1. **Check response extraction** in `_extractContent` for 'gemini':
```javascript
case 'gemini':
  if (!responseData?.candidates || responseData.candidates.length === 0) {
    console.warn('[gemini] No candidates in response');
    return '';
  }

  const candidate = responseData.candidates[0];
  const parts = candidate?.content?.parts;

  if (!Array.isArray(parts) || parts.length === 0) {
    console.warn('[gemini] No parts in candidate');
    return '';
  }

  const first = parts[0];

  // Try JSON field first (for structured responses)
  if (first?.json !== undefined) {
    return first.json;
  }

  // Try text field
  if (typeof first?.text === 'string') {
    return first.text;
  }

  console.warn('[gemini] Unexpected part structure:', first);
  return '';
```

2. **Verify schema conversion** - Gemini requires uppercase type names:
```javascript
_convertJsonSchemaToGemini(schema) {
  // Check if already converted
  if (schema.type && schema.type === schema.type.toUpperCase()) {
    return schema;
  }

  // ... rest of existing logic
}
```

---

## Priority Fixes

### High Priority (Blocks Production)
1. ✅ **Create test script** - COMPLETED
2. 🔧 **Fix Claude markdown wrapping** - Either add beta header support OR strip markdown
3. 🔧 **Fix GPT schema validation** - Add `additionalProperties: false` automatically

### Medium Priority
4. 🔧 **Fix Gemini empty responses** - Debug response extraction
5. 🔧 **Add `supportsResponseFormat` flag** - Enable native structured output

### Low Priority
6. 📝 Document workarounds for providers without API keys
7. 📝 Add CI/CD integration

---

## Recommended Next Steps

1. **Immediate:** Fix Claude markdown stripping (quick win, no env changes needed)
   ```javascript
   // In _extractContent, add this for Claude:
   textContent = textContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
   ```

2. **Short-term:** Fix GPT schema validation (enable OpenAI structured output)
   - Add `_addAdditionalPropertiesFalse` helper method
   - Update `_mapOpenAIResponseFormat` to use it

3. **Short-term:** Debug Gemini with `--raw` flag
   - Run: `node scripts/test-structured-output.js --raw`
   - Check actual response structure
   - Fix extraction logic based on findings

4. **Long-term:** Add proper beta header support for Claude
   - Set `ANTHROPIC_RESPONSE_FORMAT_BETA=2024-10-01` in `.env`
   - Update `_getProviderConfig` to add header and flag

---

## Testing After Fixes

Run the test script again:
```bash
node scripts/test-structured-output.js
```

Expected outcome after fixes:
```
CLAUDE:
  Total Tests: 3
  Successful: 3/3 ✅
  Native JSON Response: 0/3 (📝 with markdown stripping) OR 3/3 (📦 with beta header)
  Schema Valid: 3/3 ✅

GPT:
  Total Tests: 3
  Successful: 3/3 ✅
  Native JSON Response: 3/3 ✅ (native structured output)
  Schema Valid: 3/3 ✅

GEMINI:
  Total Tests: 3
  Successful: 3/3 ✅
  Native JSON Response: 3/3 ✅ (native structured output)
  Schema Valid: 3/3 ✅
```

---

## Impact on Production

**Current State:** Agents are working because Claude's markdown-wrapped JSON happens to be parseable after the fact in agent code, but this is fragile.

**Risk:** If agent code expects native JSON objects instead of strings, it may break.

**Recommendation:** Apply fixes before adding new agents that rely on structured output.

---

## Files Modified

- ✅ `scripts/test-structured-output.js` - New test script (CREATED)
- ✅ `scripts/README_STRUCTURED_OUTPUT_TEST.md` - Test documentation (CREATED)
- ✅ `docs/STRUCTURED_OUTPUT_FINDINGS.md` - This findings report (CREATED)
- 🔧 `src/llm/llm-client.js` - Needs fixes (PENDING)

---

## Conclusion

The test script successfully identified that **only Claude is working** (confirmed by user), but it's working through a fragile workaround where markdown-wrapped JSON is parsed somewhere downstream. The other providers (GPT and Gemini) are completely failing structured output.

**Action Items:**
1. Apply Claude markdown stripping fix (immediate)
2. Fix GPT schema validation (high priority)
3. Debug Gemini response extraction (high priority)
4. Consider adding beta header support for Claude (optional, long-term)
