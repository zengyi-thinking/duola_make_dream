/**
 * Content Script — 哆啦A梦的眼睛
 *
 * 职责：
 * 1. 感知当前页面内容（标题、关键文本、图片等）
 * 2. 注入浮动哆啦A梦入口按钮
 * 3. 采集用户行为数据（浏览偏好）
 * 4. 与 Background Agent 通信
 */

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main(_ctx) {
    console.log('[DoraContent] 👁️ 哆啦造梦 Content Script 已加载');

    // 1. 提取页面基本信息
    const pageInfo = extractPageInfo();
    console.log('[DoraContent] 页面信息:', pageInfo);

    // 2. 注入浮动入口按钮
    injectFloatingButton();

    // 3. 通知 Background 当前页面上下文
    notifyBackground(pageInfo);
  },
});

/**
 * 提取当前页面的关键信息
 */
function extractPageInfo() {
  return {
    title: document.title,
    url: location.href,
    description: getMetaContent('description'),
    keywords: getMetaContent('keywords'),
    mainText: getMainText(),
    imageCount: document.images.length,
    timestamp: Date.now(),
  };
}

function getMetaContent(name: string): string {
  const meta = document.querySelector(`meta[name="${name}"]`) ||
    document.querySelector(`meta[property="og:${name}"]`);
  return meta?.getAttribute('content') || '';
}

function getMainText(): string {
  const body = document.body?.innerText || '';
  return body.slice(0, 500);
}

/**
 * 注入页面右下角的浮动哆啦A梦入口
 */
function injectFloatingButton() {
  // 避免重复注入
  if (document.getElementById('dora-fab')) return;

  const fab = document.createElement('div');
  fab.id = 'dora-fab';
  fab.innerHTML = '🔵';
  fab.title = '哆啦造梦';
  Object.assign(fab.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    background: '#FFFFFF',
    border: '2px solid #2C3E50',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '22px',
    cursor: 'pointer',
    zIndex: '999999',
    boxShadow: '0 2px 12px rgba(0,153,221,0.25)',
    transition: 'transform 0.15s ease',
    userSelect: 'none',
  });

  fab.addEventListener('mouseenter', () => {
    fab.style.transform = 'scale(1.1)';
  });
  fab.addEventListener('mouseleave', () => {
    fab.style.transform = 'scale(1)';
  });
  fab.addEventListener('click', () => {
    // TODO: 点击后打开 sidepanel 或发送消息给 popup
    console.log('[DoraContent] 浮动按钮被点击');
  });

  document.body.appendChild(fab);
}

/**
 * 通知 Background 当前页面上下文
 */
function notifyBackground(pageInfo: ReturnType<typeof extractPageInfo>) {
  try {
    browser.runtime.sendMessage({
      type: 'page_context',
      payload: pageInfo,
    });
  } catch {
    // 扩展上下文可能已失效（如页面刷新时）
  }
}
