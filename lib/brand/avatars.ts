export type PocketAvatarId =
  | 'yunyu-main'
  | 'yunyun-chibi'
  | 'lanling-icon'
  | 'xingche-3d'

export const pocketAvatars = {
  'yunyu-main': {
    name: '云屿 PocketBuddy',
    path: '/avatars/pocketbuddy-yunyu-main.png',
    usage: 'Agent 默认主头像',
  },
  'yunyun-chibi': {
    name: '小口袋云云',
    path: '/avatars/pocketbuddy-yunyun-chibi.png',
    usage: 'popup 小助手、悬浮按钮、加载动画',
  },
  'lanling-icon': {
    name: '蓝白口袋精灵',
    path: '/avatars/pocketbuddy-lanling-icon.png',
    usage: '插件图标、App icon、工具栏图标参考',
  },
  'xingche-3d': {
    name: '星澈 PocketAgent',
    path: '/avatars/pocketagent-xingche-3d.png',
    usage: '高级版形象、宣传图、封面图',
  },
} as const