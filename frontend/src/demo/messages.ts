import type { Lang } from '../i18n/core'

/**
 * The demo banner's words. Kept here and not in the app's catalogues so that, like all of src/demo, they are only
 * in the browser-demo build (build.test.ts checks the real build has none of it).
 */
export const DEMO_MESSAGES: Record<Lang, { notice: string; title: string; text: string; reset: string; resetConfirm: string }> = {
  en: {
    notice: 'Demo notice',
    title: 'Browser-only demo.',
    text: 'No real server is used: data stays in this browser on this device. Sign in as {advisor} (service advisor) or {tech} (technician), password {password}. All names and numbers are made up.',
    reset: 'Reset demo',
    resetConfirm: 'Reset the demo? Your changes in this browser are deleted and the sample cars come back.',
  },
  ms: {
    notice: 'Notis demo',
    title: 'Demo dalam pelayar sahaja.',
    text: 'Tiada pelayan sebenar digunakan: data kekal dalam pelayar ini pada peranti ini. Log masuk sebagai {advisor} (penasihat servis) atau {tech} (juruteknik), kata laluan {password}. Semua nama dan nombor adalah rekaan.',
    reset: 'Set semula demo',
    resetConfirm: 'Set semula demo? Perubahan anda dalam pelayar ini dipadam dan kereta contoh dikembalikan.',
  },
  zh: {
    notice: '演示说明',
    title: '仅在浏览器中运行的演示。',
    text: '不使用真实服务器：数据只保存在这台设备的浏览器中。可用 {advisor}（服务顾问）或 {tech}（技师）登录，密码 {password}。所有姓名和号码均为虚构。',
    reset: '重置演示',
    resetConfirm: '重置演示？你在此浏览器中的更改将被删除，示例车辆会恢复。',
  },
}
