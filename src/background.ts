import { getConfig } from './storage';
import { summaryIssue } from './llm';
import { getIssue } from './github-utils/issues';

// 注册右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'summarize-issue',
    title: 'GitHub Issue Helper >>> Summarize',
    contexts: ['page'],
    documentUrlPatterns: ['*://github.com/*/*/issues/*']
  });
});

type Message =
  | { type: 'show-error'; message: string }
  | { type: 'show-summary'; summary: string }
  | { type: 'content-script-ready' }
  | { type: 'ping'; message: string };

// 监听content script准备消息
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  if (message.type === 'content-script-ready') {
    console.log('Content script ready in tab:', sender.tab?.id);
    sendResponse({ status: 'acknowledged' });
    return true;
  }
  return false;
});

// 处理菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'summarize-issue' && tab?.id && tab.url) {
    const url = new URL(tab.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const [owner, repo, , issueNumber] = pathParts;

    try {
      const config = await getConfig();

      // 检查必要配置
      if (!config?.githubToken || !config?.llmConfig?.apiKey || !config?.llmConfig?.apiUrl) {
        // 发送错误消息
        await chrome.tabs.sendMessage<Message>(tab.id, {
          type: 'show-error',
          message: 'Please configure GitHub token and LLM settings in the popup window'
        });
        return;
      }

      // 使用getIssue获取issue详情
      const issue = await getIssue(config.githubToken, owner, repo, Number(issueNumber));
      let fullContent = '';

      // 先检查content script是否准备好
      try {
        await chrome.tabs.sendMessage<Message>(tab.id!, {
          type: 'ping',
          message: 'Checking connection...'
        });

        await summaryIssue(JSON.stringify(issue || {}), (chunk) => {
          fullContent += chunk;
          try {
            if (tab?.id) {
              chrome.tabs
                .sendMessage<Message>(tab.id, {
                  type: 'show-summary',
                  summary: fullContent
                })
                .catch((err) => {
                  console.error('Failed to send update:', err);
                });
            }
          } catch (err) {
            console.error('Error sending update:', err);
          }
        });
      } catch (err) {
        console.error('Content script not ready:', err);
        throw err;
      }
    } catch (error) {
      await chrome.tabs.sendMessage<Message>(tab.id, {
        type: 'show-error',
        message: error instanceof Error ? error.message : 'Failed to summarize issue'
      });
    }
  }
});
