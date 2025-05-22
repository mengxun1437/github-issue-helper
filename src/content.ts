import { marked } from 'marked';

type Message = { type: 'show-error'; message: string } | { type: 'show-summary'; summary: string };

// 创建或获取总结容器
const getOrCreateSummaryContainer = () => {
  let container = document.getElementById('github-issue-helper-summary');
  let content: HTMLDivElement;

  if (container) {
    content = container.querySelector('.gh-issue-summary-content') as HTMLDivElement;
    content.innerHTML = '';
  } else {
    container = document.createElement('div');
    container.id = 'github-issue-helper-summary';
    container.className = 'gh-issue-summary';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.width = '350px';
    container.style.maxHeight = '60vh';
    container.style.overflow = 'auto';
    container.style.padding = '16px';
    container.style.backgroundColor = '#1a1a1a';
    container.style.borderRadius = '6px';
    container.style.border = '1px solid #333';
    container.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';
    container.style.zIndex = '9999';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '8px';

    const title = document.createElement('h3');
    title.textContent = 'AI Summary';
    title.style.margin = '0';
    title.style.fontSize = '16px';
    title.style.fontWeight = '600';
    title.style.color = 'white';

    const copyBtn = document.createElement('button');
    copyBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    `;
    copyBtn.style.padding = '6px';
    copyBtn.style.borderRadius = '4px';
    copyBtn.style.border = 'none';
    copyBtn.style.backgroundColor = 'transparent';
    copyBtn.style.color = '#c9d1d9';
    copyBtn.style.cursor = 'pointer';
    copyBtn.style.display = 'flex';
    copyBtn.style.alignItems = 'center';
    copyBtn.style.justifyContent = 'center';
    copyBtn.style.transition = 'all 0.2s ease';

    copyBtn.addEventListener('mouseenter', () => {
      copyBtn.style.color = '#ffffff';
      copyBtn.style.backgroundColor = '#30363d';
    });

    copyBtn.addEventListener('mouseleave', () => {
      copyBtn.style.color = '#c9d1d9';
      copyBtn.style.backgroundColor = 'transparent';
    });

    copyBtn.onclick = () => {
      // 创建临时div获取纯文本内容
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content.innerHTML;
      tempDiv.querySelectorAll('style').forEach((el) => el.remove());
      const plainText = tempDiv.textContent || '';

      navigator.clipboard.writeText(plainText).then(() => {
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
        }, 2000);
      });
    };

    header.appendChild(title);
    header.appendChild(copyBtn);

    content = document.createElement('div');
    content.className = 'gh-issue-summary-content';
    content.style.overflow = 'auto';
    content.style.maxHeight = 'calc(60vh - 60px)';
    content.style.padding = '8px';
    content.style.whiteSpace = 'normal';
    content.style.wordBreak = 'break-word';
    content.style.color = 'white';
    content.style.scrollbarWidth = 'none'; /* Firefox */
    content.style.setProperty('ms-overflow-style', 'none', 'important'); /* IE/Edge */

    container.appendChild(header);
    container.appendChild(content);
    document.body.appendChild(container);
  }

  return { container, content };
};

// 处理来自background的消息
chrome.runtime.onMessage.addListener(async (message: Message) => {
  const { content } = getOrCreateSummaryContainer();

  if (message.type === 'show-summary') {
    console.log('Displaying summary content');
    content.innerHTML = await marked(message.summary, {
      gfm: true,
      breaks: true
    });

    // 自动滚动到底部（添加延迟确保DOM更新完成）
    setTimeout(() => {
      content.scrollTop = content.scrollHeight;
    }, 50);

    // 添加markdown内容样式
    const style = document.createElement('style');
    style.textContent = `
      .gh-issue-summary-content h1,
      .gh-issue-summary-content h2,
      .gh-issue-summary-content h3 {
        color: #ffffff;
        margin: 1em 0 0.5em 0;
        border-bottom: 1px solid #444;
      }
      .gh-issue-summary-content p {
        margin: 0.8em 0;
        line-height: 1.5;
      }
      .gh-issue-summary-content ul,
      .gh-issue-summary-content ol {
        padding-left: 2em;
        margin: 0.8em 0;
      }
      .gh-issue-summary-content code {
        background-color: #333;
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-family: monospace;
      }
      .gh-issue-summary-content pre {
        background-color: #333;
        padding: 1em;
        border-radius: 4px;
        overflow: auto;
      }
      .gh-issue-summary-content a {
        color: #58a6ff;
        text-decoration: none;
      }
      .gh-issue-summary-content a:hover {
        text-decoration: underline;
      }
    `;
    content.appendChild(style);
  } else if (message.type === 'show-error') {
    console.log('Displaying error:', message.message);
    content.textContent = message.message;
    content.style.color = '#cb2431';
    // 自动滚动到底部
    content.scrollTop = content.scrollHeight;
  }
});
