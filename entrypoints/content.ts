import { defineContentScript } from 'wxt/utils/define-content-script';
import { createContextCaptureMessage, sendRuntimeMessage } from '@/lib/messaging/bus';

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
      .pb-fab,
      .pb-pocket-btn,
      .pb-toast {
        font-family: "Avenir Next", "Trebuchet MS", "PingFang SC", sans-serif;
        box-sizing: border-box;
      }
      .pb-fab {
        position: fixed;
        right: 20px;
        bottom: 20px;
        width: 54px;
        height: 54px;
        border-radius: 20px;
        border: 2px solid #15304a;
        background: linear-gradient(180deg, #ffffff, #e7f5ff);
        box-shadow: 0 12px 30px rgba(18, 89, 139, 0.18);
        color: #15304a;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2147483647;
        transition: transform 120ms ease;
      }
      .pb-fab:hover { transform: translateY(-2px); }
      .pb-pocket-glyph {
        width: 26px;
        height: 18px;
        border: 2px solid #15304a;
        border-top: 0;
        border-radius: 0 0 14px 14px;
        position: relative;
        background: rgba(167, 216, 255, 0.6);
      }
      .pb-pocket-glyph::before {
        content: "";
        position: absolute;
        left: 50%;
        top: -10px;
        width: 22px;
        height: 10px;
        transform: translateX(-50%);
        border: 2px solid #15304a;
        border-bottom: 0;
        border-radius: 12px 12px 0 0;
        background: #fff;
      }
      .pb-pocket-btn {
        position: fixed;
        display: none;
        padding: 8px 12px;
        border-radius: 999px;
        border: 2px solid #15304a;
        background: #ffffff;
        color: #15304a;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        z-index: 2147483647;
        box-shadow: 0 10px 24px rgba(18, 89, 139, 0.16);
      }
      .pb-pocket-btn[data-visible="true"] {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .pb-pocket-btn::before {
        content: "";
        width: 12px;
        height: 9px;
        border: 2px solid #15304a;
        border-top: 0;
        border-radius: 0 0 9px 9px;
        background: rgba(167, 216, 255, 0.75);
      }
      .pb-toast {
        position: fixed;
        right: 20px;
        bottom: 86px;
        max-width: 240px;
        padding: 10px 12px;
        border-radius: 18px;
        border: 2px solid #15304a;
        background: rgba(255, 255, 255, 0.98);
        color: #15304a;
        font-size: 12px;
        line-height: 1.45;
        display: none;
        z-index: 2147483647;
      }
      .pb-toast[data-visible="true"] { display: block; }
    `;

    const fab = document.createElement('button');
    fab.className = 'pb-fab';
    fab.type = 'button';
    fab.title = 'PocketBuddy';
    fab.innerHTML = '<span class="pb-pocket-glyph"></span>';

    const pocketButton = document.createElement('button');
    pocketButton.className = 'pb-pocket-btn';
    pocketButton.type = 'button';
    pocketButton.textContent = '放进口袋';

    const toast = document.createElement('div');
    toast.className = 'pb-toast';

    shadowRoot.append(style, fab, pocketButton, toast);

    let toastTimer: number | undefined;

    const showToast = (message: string) => {
      toast.textContent = message;
      toast.dataset.visible = 'true';
      if (toastTimer) {
        window.clearTimeout(toastTimer);
      }
      toastTimer = window.setTimeout(() => {
        toast.dataset.visible = 'false';
      }, 1800);
    };

    const updateSelectionButton = () => {
      if (isSensitiveSelection()) {
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

    const captureSelection = async () => {
      if (isSensitiveSelection()) {
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

      if (response.success) {
        showToast('这段灵感已经放进口袋。');
      } else {
        showToast(response.error ?? '这次没有保存成功。');
      }

      pocketButton.dataset.visible = 'false';
    };

    fab.addEventListener('click', () => {
      void captureSelection();
    });

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
  },
});

function isSensitiveSelection(): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const node = selection.anchorNode;
  if (!node) return false;

  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return Boolean(element?.closest('input, textarea, [contenteditable=""], [contenteditable="true"]'));
}
