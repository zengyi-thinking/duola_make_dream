import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createContextCaptureMessage, sendRuntimeMessage } from '@/lib/messaging/bus';
import type { InternalContentMessage } from '@/lib/messaging/types';
import { extractCurrentPageContent, extractCurrentSelection } from '@/lib/page/extractor';
import { readStorage } from '@/lib/storage/local';
import { mountPocketBuddyFab } from './content/pocketbuddy-fab';

const HOST_ID = 'pocketbuddy-content-root';
const MAX_SELECTION_CHARS = 280;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    if (document.getElementById(HOST_ID)) return;

    const host = document.createElement('div');
    host.id = HOST_ID;
    const shadowRoot = host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .pb-fab, .pb-pocket-btn, .pb-toast { font-family: "Avenir Next", "Trebuchet MS", "PingFang SC", sans-serif; box-sizing: border-box; }
      .pb-fab {
        position: fixed; right: 18px; bottom: 18px; width: 64px; height: 64px; border-radius: 22px;
        border: 1px solid rgba(21, 48, 74, 0.18); background: radial-gradient(circle at 28% 26%, rgba(255,255,255,0.96), rgba(223, 238, 255, 0.88));
        box-shadow: 0 16px 34px rgba(18, 89, 139, 0.18), inset 0 0 0 1px rgba(255,255,255,0.4);
        color: #15304a; display: block; cursor: pointer; z-index: 2147483647;
        transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease; overflow: hidden; padding: 0;
      }
      .pb-fab:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 18px 38px rgba(18, 89, 139, 0.22), inset 0 0 0 1px rgba(255,255,255,0.5); }
      .pb-fab:focus-visible { outline: 2px solid #2557da; outline-offset: 3px; }
      .pb-fab__stage {
        position: absolute; inset: 0; display: block; border-radius: inherit; overflow: hidden;
        pointer-events: none;
      }
      .pb-fab__canvas,
      .pb-fab__fallback {
        width: 100% !important; height: 100% !important; display: block; object-fit: cover; pointer-events: none;
      }
      .pb-fab--three { background: radial-gradient(circle at 28% 24%, rgba(255,255,255,0.98), rgba(202, 234, 255, 0.9)); }
      .pb-fab--fallback { background: linear-gradient(180deg, #ffffff, #e7f5ff); }
      .pb-pocket-btn {
        position: fixed; display: none; padding: 8px 12px; border-radius: 999px; border: 2px solid #15304a; background: #ffffff; color: #15304a;
        font-size: 12px; font-weight: 700; cursor: pointer; z-index: 2147483647; box-shadow: 0 10px 24px rgba(18, 89, 139, 0.16);
      }
      .pb-pocket-btn[data-visible="true"] { display: inline-flex; align-items: center; gap: 8px; }
      .pb-pocket-btn::before {
        content: ""; width: 12px; height: 9px; border: 2px solid #15304a; border-top: 0; border-radius: 0 0 9px 9px; background: rgba(167, 216, 255, 0.75);
      }
      .pb-toast {
        position: fixed; right: 20px; bottom: 86px; max-width: 260px; padding: 10px 12px; border-radius: 18px;
        border: 2px solid #15304a; background: rgba(255, 255, 255, 0.98); color: #15304a; font-size: 12px; line-height: 1.45; display: none; z-index: 2147483647;
      }
      .pb-toast[data-visible="true"] { display: block; }
    `;

    const fab = document.createElement('button');
    fab.className = 'pb-fab';
    fab.type = 'button';
    fab.title = 'PocketBuddy';
    fab.setAttribute('aria-label', 'PocketBuddy');

    const fabStage = document.createElement('span');
    fabStage.className = 'pb-fab__stage';
    fab.append(fabStage);

    const pocketButton = document.createElement('button');
    pocketButton.className = 'pb-pocket-btn';
    pocketButton.type = 'button';
    pocketButton.textContent = '放进口袋';

    const toast = document.createElement('div');
    toast.className = 'pb-toast';

    shadowRoot.append(style, fab, pocketButton, toast);

    void mountPocketBuddyFab({
      button: fab,
      stage: fabStage,
      fallbackIconUrl: (browser.runtime as unknown as { getURL: (path: string) => string }).getURL('/avatars/pocketbuddy-lanling-icon.png'),
      preferReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      onActivate: captureSelection,
    });

    let toastTimer: number | undefined;

    const showToast = (message: string) => {
      toast.textContent = message;
      toast.dataset.visible = 'true';
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toast.dataset.visible = 'false';
      }, 2000);
    };

    browser.runtime.onMessage.addListener((message: InternalContentMessage, _sender, sendResponse) => {
      // content.ping 是 background 用于"探测 content script 是否在线"的轻量握手
      if ((message as { type?: string }).type === 'content.ping') {
        sendResponse({ pong: true });
        return false; // 同步响应，不需要异步
      }

      handleInternalContentMessage(message)
        .then((response) => sendResponse(response))
        .catch((error) => {
          sendResponse({
            __error: error instanceof Error ? error.message : String(error),
          });
        });

      return true;
    });

    // 长连 + tab 上报：让 background 知道"我在哪个 tab"
    // 解决 sidepanel 主动发起消息时无法定位活动 tab 的问题
    // （sidepanel 在独立窗口，chrome.tabs.query({active:true, lastFocusedWindow:true})
    //   返回的可能是 sidepanel 自己所在的 panel 窗口）
    try {
      const port = browser.runtime.connect({ name: 'content-tab-registry' });
      const myTabId = browser.runtime?.id ? null : null; // content script 自身没有 tab id
      // 通过 sender 反查不靠谱（content script 不收 runtime.sendMessage 的 sender），
      // 改用 content script 里能拿到的 location 信息
      const portMessage = {
        type: 'content.registerTab',
        url: location.origin,
        pathname: location.pathname,
        title: document.title,
        href: location.href, // privacy-check: allow — 仅上报 URL 给 background，用于跨窗口定位活动 tab
        // content script 不知道自己的 tabId，但 background 收到 connect 时能从 sender.tab 拿到
      };
      port.postMessage(portMessage);
      port.onDisconnect.addListener(() => {
        // SW 重启 / 扩展更新后重连
      });
    } catch {
      // connect 失败也无妨，不影响核心功能
    }

    const updateSelectionButton = () => {
      if (isSensitiveSelection() || isSensitiveActiveElement()) {
        pocketButton.dataset.visible = 'false';
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.getRangeAt(0).collapsed) {
        pocketButton.dataset.visible = 'false';
        return;
      }

      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        pocketButton.dataset.visible = 'false';
        return;
      }

      pocketButton.style.left = `${Math.min(window.innerWidth - 152, Math.max(12, rect.left + rect.width / 2 - 68))}px`;
      pocketButton.style.top = `${Math.max(12, rect.top - 44)}px`;
      pocketButton.dataset.visible = 'true';
    };

    async function captureSelection() {
      if (isSensitiveSelection() || isSensitiveActiveElement()) {
        showToast('PocketBuddy 不会读取表单内容。');
        pocketButton.dataset.visible = 'false';
        return;
      }

      const selection = window.getSelection();
      const selectedText = selection?.toString().replace(/\s+/g, ' ').trim() ?? '';
      if (!selectedText) {
        showToast('先划一段文字，再放进口袋。');
        pocketButton.dataset.visible = 'false';
        return;
      }

      const response = await sendRuntimeMessage(createContextCaptureMessage({
        origin: location.origin,
        pageTitle: document.title,
        selectedText: selectedText.slice(0, MAX_SELECTION_CHARS),
      }));

      showToast(response.success ? '这段灵感已经放进口袋。' : (response.error ?? '这次没有保存成功。'));
      pocketButton.dataset.visible = 'false';
    }

    pocketButton.addEventListener('click', () => {
      void captureSelection();
    });

    const scheduleSelectionUpdate = () => {
      window.setTimeout(updateSelectionButton, 0);
    };

    document.addEventListener('mouseup', scheduleSelectionUpdate, true);
    document.addEventListener('keyup', scheduleSelectionUpdate, true);
    document.addEventListener('scroll', () => {
      if (pocketButton.dataset.visible === 'true') {
        updateSelectionButton();
      }
    }, true);

    async function handleInternalContentMessage(message: InternalContentMessage) {
      const runtimeConfig = await readStorage('runtimeConfig');

      if (message.type === 'content.page.extract-current') {
        return extractCurrentPageContent(document, message.mode, runtimeConfig);
      }

      if (isSensitiveSelection()) {
        throw new Error('当前选区位于敏感输入区域，不能读取。');
      }

      return extractCurrentSelection(document, runtimeConfig);
    }
  },
});

function isSensitiveSelection(): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const node = selection.anchorNode;
  if (!node) return false;

  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return Boolean(element?.closest('input, textarea, select, button, form, [contenteditable], [contenteditable="true"]'));
}

function isSensitiveActiveElement(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  return Boolean(active.closest('input, textarea, select, button, form, [contenteditable], [contenteditable="true"]'));
}
