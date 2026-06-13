/**
 * IndexedDB 存储层
 *
 * 基于 idb 库封装，提供本地持久化存储
 * 用于存储对话历史、用户画像、工具使用记录等
 */

import type { ChatMessage, UserProfile } from '../agent/types';

/** 数据库名称 */
const DB_NAME = 'dora-make-dream';

/** 数据库版本 */
const DB_VERSION = 1;

/** Store 名称 */
const STORES = {
  messages: 'messages',
  profile: 'profile',
  feedback: 'feedback',
} as const;

/**
 * 初始化 IndexedDB
 * TODO: Phase 3 使用 idb 库替换手写实现
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 对话消息 store
      if (!db.objectStoreNames.contains(STORES.messages)) {
        const messageStore = db.createObjectStore(STORES.messages, {
          keyPath: 'id',
        });
        messageStore.createIndex('timestamp', 'timestamp', { unique: false });
        messageStore.createIndex('role', 'role', { unique: false });
      }

      // 用户画像 store
      if (!db.objectStoreNames.contains(STORES.profile)) {
        db.createObjectStore(STORES.profile, { keyPath: 'id' });
      }

      // 反馈记录 store
      if (!db.objectStoreNames.contains(STORES.feedback)) {
        const feedbackStore = db.createObjectStore(STORES.feedback, {
          keyPath: 'id',
          autoIncrement: true,
        });
        feedbackStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 保存一条聊天消息
 */
export async function saveMessage(message: ChatMessage): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORES.messages, 'readwrite');
  tx.objectStore(STORES.messages).put(message);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 获取最近的聊天消息
 */
export async function getRecentMessages(limit = 50): Promise<ChatMessage[]> {
  const db = await openDB();
  const tx = db.transaction(STORES.messages, 'readonly');
  const store = tx.objectStore(STORES.messages);
  const index = store.index('timestamp');

  return new Promise((resolve, reject) => {
    const results: ChatMessage[] = [];
    const request = index.openCursor(null, 'prev');
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 保存用户画像
 */
export async function saveProfile(profile: UserProfile & { id: string }): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORES.profile, 'readwrite');
  tx.objectStore(STORES.profile).put(profile);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 获取用户画像
 */
export async function getProfile(id = 'default'): Promise<UserProfile | undefined> {
  const db = await openDB();
  const tx = db.transaction(STORES.profile, 'readonly');
  const request = tx.objectStore(STORES.profile).get(id);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 记录用户反馈
 */
export async function recordFeedback(
  messageId: string,
  type: 'like' | 'dislike' | 'skip',
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORES.feedback, 'readwrite');
  tx.objectStore(STORES.feedback).add({
    messageId,
    type,
    timestamp: Date.now(),
  });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
