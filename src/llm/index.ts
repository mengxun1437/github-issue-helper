import OpenAI from 'openai';
import { getConfig } from '../storage';

export interface LLMResponse {
  content: string;
  tokensUsed: number;
}

export async function generateWithOpenAI(systemPrompt: string, prompt: string): Promise<LLMResponse> {
  const llmConfig = (await getConfig())?.llmConfig;
  if (!llmConfig?.apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const openai = new OpenAI({
    baseURL: llmConfig?.apiUrl || 'https://api.openai.com/v1',
    apiKey: llmConfig.apiKey,
    dangerouslyAllowBrowser: true
  });

  const model = llmConfig?.model || 'gpt-4';

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7
  });

  return {
    content: response.choices[0]?.message?.content || '',
    tokensUsed: response.usage?.total_tokens || 0
  };
}

export function getIssueSystemPrompt(userData: string) {
  return `You are an experienced Q&A bot that provides answers based on user-provided data and questions. 

1. Only respond based on the user's input; do not fabricate information.
2. If your answer includes relevant knowledge sources, please format it appropriately (provide links if available).
3. Ensure your response is in the same language as the user's input.

## User Data
${userData}

## Examples
- **Input:** "What is the capital of France?"
- **Output:** "The capital of France is Paris. [Source](https://en.wikipedia.org/wiki/Paris)"
  
- **Input:** "¿Cuál es la capital de España?"
- **Output:** "La capital de España es Madrid. [Fuente](https://es.wikipedia.org/wiki/Madrid)"`;
}

export async function analyzeIssue(userQuestion: string, userData: string) {
  const userPrompt = `My Question Is: ${userQuestion}`;
  return await generateWithOpenAI(getIssueSystemPrompt(userData), userPrompt);
}
