import OpenAI from 'openai';
import { getConfig } from '../storage';

export interface LLMResponse {
  content: string;
  tokensUsed: number;
}

export async function generateWithOpenAI(
  systemPrompt: string,
  prompt: string,
  onStream?: (chunk: string) => void
): Promise<LLMResponse> {
  try {
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

    if (onStream) {
      let fullContent = '';
      const stream = await openai.chat.completions
        .create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          stream: true
        })
        .catch((e) => {
          throw e;
        });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        fullContent += content;
        onStream(content);
      }

      return {
        content: fullContent,
        tokensUsed: 0
      };
    } else {
      const response = await openai.chat.completions
        .create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7
        })
        .catch((e) => {
          throw e;
        });

      return {
        content: response.choices[0]?.message?.content || '',
        tokensUsed: response.usage?.total_tokens || 0
      };
    }
  } catch (error) {
    console.error('Error generating response:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const suggestion =
      'Narrow the search scope and reduce the amount of data to analyze to prevent exceeding the maximum tokens tree of large models';

    const content = `## Error\n${errorMessage}\n\n## Suggestion\n${suggestion}`;
    onStream?.(content);
    return {
      content,
      tokensUsed: 0
    };
  }
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

export async function analyzeIssue(
  userQuestion: string,
  userData: string,
  onStream?: (chunk: string) => void
) {
  const userPrompt = `My Question Is: ${userQuestion}`;
  return await generateWithOpenAI(getIssueSystemPrompt(userData), userPrompt, onStream);
}

export function getSummarySystemPrompt() {
  return `You are a skilled summarizer. Based on the provided GitHub Issue data, summarize the key points discussed in the Issue. Indicate whether there is a conclusion, and if so, state what it is. For bug-related issues, list the proposed solutions and identify which ones are effective. Consider the reactions, such as thumbs up or other emojis, as valuable reference points.

## Requirements
- Summarize key points from the GitHub Issue.
- State if there is a conclusion and what it is.
- For bug issues, list proposed solutions and their effectiveness.
- Use reactions (like emojis) as reference.

## Output Format
- A clear summary with sections for key points, conclusion, and bug solutions.

## Examples
1. **Input**: GitHub Issue data discussing a feature request.
   **Output**: 
   - **Key Points**: Users want feature X for better usability.
   - **Conclusion**: The team will consider implementing feature X.
    
2. **Input**: GitHub Issue data about a bug.
   **Output**: 
   - **Key Points**: Users report bug Y affecting functionality.
   - **Conclusion**: No final conclusion yet.
   - **Proposed Solutions**: 
     - Solution A: Effective
     - Solution B: Not effective
     - Solution C: Needs further testing`;
}

export async function summaryIssue(issueData: string, onStream?: (chunk: string) => void) {
  const userLanguage = (await getConfig())?.language || 'en';
  const userPrompt = `## GitHub Issue Data
  ${issueData}

  ## Language
  Response me by: ${userLanguage}
  `;
  return await generateWithOpenAI(getSummarySystemPrompt(), userPrompt, onStream);
}
