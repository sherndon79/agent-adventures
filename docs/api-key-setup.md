# API Key Setup Guide

## Required API Keys for Agent Adventures

To run the complete multi-LLM workflow, you'll need API keys from the following providers:

### 1. Anthropic Claude API
- **What**: Access to Claude models for thoughtful spatial reasoning
- **Where**: https://console.anthropic.com/
- **Steps**:
  1. Create an Anthropic account
  2. Go to API Keys section
  3. Generate a new API key
  4. Copy the key (starts with `sk-ant-`)

### 2. OpenAI GPT API
- **What**: Access to GPT models for balanced optimization
- **Where**: https://platform.openai.com/api-keys
- **Steps**:
  1. Create an OpenAI account
  2. Navigate to API Keys
  3. Create new secret key
  4. Copy the key (starts with `sk-`)

### 3. Google Gemini API
- **What**: Access to Gemini models for bold visual composition
- **Where**: https://aistudio.google.com/app/apikey
- **Steps**:
  1. Create a Google account if needed
  2. Go to Google AI Studio
  3. Get API key
  4. Copy the key

## Configuration Steps

### Step 1: Update .env File
Open `/home/sherndon/agent-adventures/.env` and replace the placeholder values:

```bash
# Replace these placeholder values with your actual API keys
ANTHROPIC_API_KEY=sk-ant-your_actual_claude_key_here
OPENAI_API_KEY=sk-your_actual_openai_key_here
GOOGLE_API_KEY=your_actual_gemini_key_here
```

### Step 2: Verify Configuration
Run the configuration test script:
```bash
npm run test:config
```

### Step 3: Test API Connections
Run the API connection test:
```bash
npm run test:apis
```

## Cost Considerations

### Estimated Costs Per Multi-LLM Competition
- **Claude**: ~$0.05-0.10 per proposal (100 tokens)
- **GPT**: ~$0.03-0.06 per proposal (100 tokens)
- **Gemini**: ~$0.01-0.02 per proposal (100 tokens)

**Total per competition**: ~$0.09-0.18

### Cost Optimization Settings
To minimize costs during development:

```bash
# In .env file
MOCK_LLM_MODE=true          # Use mock responses for testing
MAX_TOKENS_PER_PROPOSAL=50  # Reduce token limits
ENABLE_TOKEN_TRACKING=true  # Monitor usage
```

## Development vs Production

### Development Mode (Default)
```bash
NODE_ENV=development
MOCK_LLM_MODE=true  # Uses mock responses, no API calls
MOCK_MCP_MODE=true  # Simulates Isaac Sim without connection
```

### Production Mode
```bash
NODE_ENV=production
MOCK_LLM_MODE=false  # Real API calls
MOCK_MCP_MODE=false  # Real Isaac Sim connection
```

## API Rate Limits

### Anthropic Claude
- Rate limit: 50 requests/minute (varies by tier)
- Token limit: 25K tokens/minute
- Daily limit: Varies by plan

### OpenAI GPT
- Rate limit: 60 requests/minute (tier dependent)
- Token limit: 40K tokens/minute
- Monthly quota: Based on billing plan

### Google Gemini
- Rate limit: 60 requests/minute
- Token limit: 32K tokens/minute
- Free tier: 15 requests/minute

## Security Best Practices

1. **Never commit API keys to git**:
   ```bash
   # .env is already in .gitignore
   git status  # Verify .env is not tracked
   ```

2. **Use environment variables only**:
   ```javascript
   // ✅ Correct
   const apiKey = process.env.ANTHROPIC_API_KEY;

   // ❌ Never do this
   const apiKey = "sk-ant-hardcoded-key";
   ```

3. **Rotate keys periodically**:
   - Set calendar reminders to rotate API keys monthly
   - Deactivate old keys after updating

4. **Monitor usage**:
   - Check API dashboards regularly
   - Set up billing alerts
   - Use token tracking in the application

## Troubleshooting

### Common Issues

#### "Invalid API Key" Errors
- Verify key is copied correctly (no extra spaces)
- Check key hasn't expired or been deactivated
- Ensure key has correct permissions

#### Rate Limit Errors
```javascript
// Error: Rate limit exceeded
// Solution: Add retry logic or reduce request frequency
```

#### Token Limit Errors
```javascript
// Error: Token limit exceeded
// Solution: Reduce MAX_TOKENS_PER_PROPOSAL in .env
```

### Debug Commands

```bash
# Test configuration loading
node -e "import('./src/config/environment.js').then(c => console.log(c.config.llm))"

# Test API key format
node -e "console.log('Claude:', process.env.ANTHROPIC_API_KEY?.slice(0, 10) + '...')"

# Check mock modes
node -e "import('./src/config/environment.js').then(c => console.log('Mock modes:', c.isMockMode()))"
```

## Getting Help

If you encounter issues:

1. **Check logs**: Look for API error messages in console output
2. **Verify network**: Ensure internet connection and firewall settings
3. **Test individually**: Test each API key separately
4. **Check documentation**: Refer to provider API documentation
5. **Use mock mode**: Fall back to mock mode for development if needed

## Next Steps

Once API keys are configured:

1. Run the multi-LLM workflow test
2. Monitor token usage and costs
3. Adjust configuration as needed
4. Begin scene agent competitions!