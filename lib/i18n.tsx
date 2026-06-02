'use client'
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

// ═══════════════════════════════════════════════════════════════
// SUPPORTED LOCALES
// ═══════════════════════════════════════════════════════════════
export type Locale = 'id' | 'en' | 'zh-TW'

export const LOCALES: Record<Locale, { label: string; flag: string; short: string }> = {
  'id':    { label: 'Bahasa Indonesia', flag: '🇮🇩', short: 'ID' },
  'en':    { label: 'English',          flag: '🇬🇧', short: 'EN' },
  'zh-TW': { label: '繁體中文',          flag: '🇹🇼', short: '中' },
}

// ═══════════════════════════════════════════════════════════════
// TRANSLATIONS
// ═══════════════════════════════════════════════════════════════
const translations: Record<Locale, Record<string, string>> = {
  // ─── BAHASA INDONESIA ────────────────────────────────────
  'id': {
    // Common
    'app.title':              'IE Line Balance System',
    'app.subtitle':           'Sistem Monitoring Produksi Real-time',
    'app.by':                 'Developed by',
    'common.save':            'Simpan',
    'common.saving':          'Menyimpan...',
    'common.cancel':          'Batal',
    'common.delete':          'Hapus',
    'common.edit':            'Edit',
    'common.close':           'Tutup',
    'common.search':          'Cari',
    'common.loading':         'Memuat...',
    'common.noData':          'Belum ada data',
    'common.back':            'Kembali',
    'common.confirm':         'Konfirmasi',
    'common.success':         'Berhasil',
    'common.error':           'Terjadi kesalahan',
    'common.logout':          'Keluar',
    'common.login':           'Masuk',
    'common.pairs':           'pairs',
    'common.minutes':         'mnt',
    'common.persons':         'orang',
    'common.hours':           'jam',
    'common.today':           'Hari ini',
    'common.all':             'Semua',
    'common.active':          'Aktif',
    'common.inactive':        'Nonaktif',

    // Login
    'login.title':            'Line Balance',
    'login.subtitle':         'Masuk ke akun Anda',
    'login.email':            'Email',
    'login.password':         'Password',
    'login.button':           'Masuk',
    'login.signingIn':        'Memproses...',
    'login.error':            'Email atau password salah',
    'login.forgotPassword':   'Hubungi IT Admin jika lupa password',

    // Sidebar / Navigation
    'nav.dashboard':          'Dashboard',
    'nav.modelLibrary':       'Model library',
    'nav.inputActual':        'Input aktual',
    'nav.monitor':            'Monitor',
    'nav.analytics':          'Analitik',
    'nav.users':              'Pengguna',
    'nav.allBuildings':       'Semua gedung',

    // Leader tabs
    'leader.tabStatus':       'Status',
    'leader.tabInput':        'Input',
    'leader.tabStandard':     'Standar',
    'leader.tabAI':           'AI',
    'leader.shift':           'Shift',
    'leader.overtime':        'Lembur',
    'leader.overtimeActive':  'Lembur aktif',
    'leader.selectHour':      'Pilih jam',
    'leader.output':          'Output jam',
    'leader.outputTarget':    'dari target',
    'leader.mpPresent':       'MP hadir',
    'leader.mpStd':           'std',
    'leader.downtime':        'Downtime',
    'leader.downtimeReason':  'Alasan downtime',
    'leader.defect':          'Defect',
    'leader.saveShift':       'Simpan',
    'leader.saved':           'Tersimpan ✓',
    'leader.noModel':         'Belum ada model yang di-assign ke line ini.',
    'leader.shiftInfo1':      'Shift 1: 07:00 – 16:00',
    'leader.shiftInfo1OT':    '+ Lembur 17:00 – 19:00',
    'leader.shiftInfo2':      'Shift 2: 20:00 – 05:00',
    'leader.shiftInfo2OT':    '+ Lembur 06:00 – 08:00',
    'leader.locked':          'Data dikunci — shift sudah ditutup',

    // Status tab
    'status.title':           'Status hari ini',
    'status.totalOutput':     'Total output',
    'status.avgMP':           'Rata-rata MP',
    'status.totalDT':         'Total downtime',
    'status.totalDefect':     'Total defect',
    'status.perHour':         'Per jam',
    'status.noDataYet':       'Belum ada data hari ini',

    // Standard tab
    'std.title':              'Standar IE',
    'std.operations':         'Daftar operasi',
    'std.taktTime':           'Takt Time',
    'std.stdMP':              'Standard MP',
    'std.theorMP':            'Theoretical MP',
    'std.lbr':                'LBR',
    'std.effCT':              'Eff CT',
    'std.multiMP':            'Multi-MP',
    'std.standard':           'Standard',

    // AI tab
    'ai.title':               'AI Rekomendasi',
    'ai.subtitle':            'Analisis berdasarkan data hari ini',
    'ai.analyze':             'Analisis Section Ini',
    'ai.analyzing':           'Menganalisis...',
    'ai.noData':              'Belum ada data hari ini',
    'ai.error':               'Koneksi gagal. Coba lagi nanti.',

    // TV Display
    'tv.title':               'Digital Andon Board',
    'tv.subtitle':            'Real-time Production Monitoring',
    'tv.avgLler':             'Avg LLER',
    'tv.totalOutput':         'Total Output',
    'tv.dailyTarget':         'Target Harian',
    'tv.downtime':            'Downtime',
    'tv.alert':               'Alert',
    'tv.progressTitle':       'Progress target harian gedung',
    'tv.trendTitle':          'Tren output per jam',
    'tv.avgMP':               'Avg MP',
    'tv.defect':              'Defect',
    'tv.outputPairs':         'output pairs',
    'tv.targetToday':         'Target hari ini',
    'tv.waitingInput':        'Menunggu input',
    'tv.autoInsight':         'Auto Insight',
    'tv.collecting':          'Mengumpulkan data...',
    'tv.autoRefresh':         'Auto-refresh 60 detik',
    'tv.lineActive':          'line aktif',

    // Insights
    'insight.noData':         'Belum ada data — menunggu input dari Team Leader.',
    'insight.alert':          'Tindakan segera diperlukan.',
    'insight.targetReached':  'Target harian tercapai!',
    'insight.targetLow':      'Perlu akselerasi output segera.',
    'insight.trendDown':      'Tren output turun',
    'insight.trendUp':        'Tren output naik',
    'insight.lastHours':      '3 jam terakhir',
    'insight.maintain':       'Pertahankan momentum!',
    'insight.investigate':    'Investigasi penyebab penurunan.',
    'insight.dtHigh':         'Downtime kumulatif',
    'insight.dtInvestigate':  'Identifikasi root cause segera.',
    'insight.sectionLow':     'LLER di bawah 75%. Fokus perbaikan di section tersebut.',
    'insight.defectHigh':     'Lakukan quality check.',
    'insight.efficient':      'lini berjalan efisien.',
    'insight.monitorPerf':    'Pantau terus performa section.',

    // Dashboard
    'dash.welcome':           'Selamat datang',
    'dash.overview':          'Ringkasan hari ini',
    'dash.totalLines':        'Total line',
    'dash.activeLines':       'Line aktif',
    'dash.avgLler':           'Rata-rata LLER',
    'dash.totalAlerts':       'Alert aktif',

    // Models
    'model.library':          'Model Library',
    'model.upload':           'Upload NB Standard',
    'model.name':             'Nama model',
    'model.article':          'Artikel',
    'model.sections':         'Sections',
    'model.assignedTo':       'Dipasang di',
    'model.noAssignment':     'Belum dipasang',

    // Shift close
    'shift.close':            'Tutup Shift',
    'shift.closed':           'Shift ditutup dan data diarsipkan.',
    'shift.emailSent':        'Laporan dikirim ke',
    'shift.emailFailed':      'Email gagal terkirim.',

    // Users
    'user.management':        'Manajemen Pengguna',
    'user.addNew':            'Tambah pengguna',
    'user.name':              'Nama',
    'user.email':             'Email',
    'user.role':              'Role',
    'user.building':          'Gedung',
    'user.lineAccess':        'Akses line',
  },

  // ─── ENGLISH ─────────────────────────────────────────────
  'en': {
    // Common
    'app.title':              'IE Line Balance System',
    'app.subtitle':           'Real-time Production Monitoring System',
    'app.by':                 'Developed by',
    'common.save':            'Save',
    'common.saving':          'Saving...',
    'common.cancel':          'Cancel',
    'common.delete':          'Delete',
    'common.edit':            'Edit',
    'common.close':           'Close',
    'common.search':          'Search',
    'common.loading':         'Loading...',
    'common.noData':          'No data yet',
    'common.back':            'Back',
    'common.confirm':         'Confirm',
    'common.success':         'Success',
    'common.error':           'An error occurred',
    'common.logout':          'Logout',
    'common.login':           'Login',
    'common.pairs':           'pairs',
    'common.minutes':         'min',
    'common.persons':         'persons',
    'common.hours':           'hrs',
    'common.today':           'Today',
    'common.all':             'All',
    'common.active':          'Active',
    'common.inactive':        'Inactive',

    // Login
    'login.title':            'Line Balance',
    'login.subtitle':         'Sign in to your account',
    'login.email':            'Email',
    'login.password':         'Password',
    'login.button':           'Sign In',
    'login.signingIn':        'Signing in...',
    'login.error':            'Invalid email or password',
    'login.forgotPassword':   'Contact IT Admin if you forgot your password',

    // Sidebar / Navigation
    'nav.dashboard':          'Dashboard',
    'nav.modelLibrary':       'Model Library',
    'nav.inputActual':        'Input Actual',
    'nav.monitor':            'Monitor',
    'nav.analytics':          'Analytics',
    'nav.users':              'Users',
    'nav.allBuildings':       'All buildings',

    // Leader tabs
    'leader.tabStatus':       'Status',
    'leader.tabInput':        'Input',
    'leader.tabStandard':     'Standard',
    'leader.tabAI':           'AI',
    'leader.shift':           'Shift',
    'leader.overtime':        'Overtime',
    'leader.overtimeActive':  'OT active',
    'leader.selectHour':      'Select hour',
    'leader.output':          'Output at',
    'leader.outputTarget':    'of target',
    'leader.mpPresent':       'MP present',
    'leader.mpStd':           'std',
    'leader.downtime':        'Downtime',
    'leader.downtimeReason':  'Downtime reason',
    'leader.defect':          'Defect',
    'leader.saveShift':       'Save',
    'leader.saved':           'Saved ✓',
    'leader.noModel':         'No model assigned to this line yet.',
    'leader.shiftInfo1':      'Shift 1: 07:00 – 16:00',
    'leader.shiftInfo1OT':    '+ OT 17:00 – 19:00',
    'leader.shiftInfo2':      'Shift 2: 20:00 – 05:00',
    'leader.shiftInfo2OT':    '+ OT 06:00 – 08:00',
    'leader.locked':          'Data locked — shift has been closed',

    // Status tab
    'status.title':           'Today\'s status',
    'status.totalOutput':     'Total output',
    'status.avgMP':           'Average MP',
    'status.totalDT':         'Total downtime',
    'status.totalDefect':     'Total defect',
    'status.perHour':         'Per hour',
    'status.noDataYet':       'No data for today yet',

    // Standard tab
    'std.title':              'IE Standard',
    'std.operations':         'Operation list',
    'std.taktTime':           'Takt Time',
    'std.stdMP':              'Standard MP',
    'std.theorMP':            'Theoretical MP',
    'std.lbr':                'LBR',
    'std.effCT':              'Eff CT',
    'std.multiMP':            'Multi-MP',
    'std.standard':           'Standard',

    // AI tab
    'ai.title':               'AI Recommendation',
    'ai.subtitle':            'Analysis based on today\'s data',
    'ai.analyze':             'Analyze This Section',
    'ai.analyzing':           'Analyzing...',
    'ai.noData':              'No data available today',
    'ai.error':               'Connection failed. Try again later.',

    // TV Display
    'tv.title':               'Digital Andon Board',
    'tv.subtitle':            'Real-time Production Monitoring',
    'tv.avgLler':             'Avg LLER',
    'tv.totalOutput':         'Total Output',
    'tv.dailyTarget':         'Daily Target',
    'tv.downtime':            'Downtime',
    'tv.alert':               'Alert',
    'tv.progressTitle':       'Building daily target progress',
    'tv.trendTitle':          'Hourly output trend',
    'tv.avgMP':               'Avg MP',
    'tv.defect':              'Defect',
    'tv.outputPairs':         'output pairs',
    'tv.targetToday':         'Today\'s target',
    'tv.waitingInput':        'Awaiting input',
    'tv.autoInsight':         'Auto Insight',
    'tv.collecting':          'Collecting data...',
    'tv.autoRefresh':         'Auto-refresh 60s',
    'tv.lineActive':          'lines active',

    // Insights
    'insight.noData':         'No data yet — awaiting Team Leader input.',
    'insight.alert':          'Immediate action required.',
    'insight.targetReached':  'Daily target achieved!',
    'insight.targetLow':      'Output acceleration needed.',
    'insight.trendDown':      'Output trend declining',
    'insight.trendUp':        'Output trend rising',
    'insight.lastHours':      'last 3 hours',
    'insight.maintain':       'Keep up the momentum!',
    'insight.investigate':    'Investigate the cause of decline.',
    'insight.dtHigh':         'Cumulative downtime',
    'insight.dtInvestigate':  'Identify root cause immediately.',
    'insight.sectionLow':     'LLER below 75%. Focus improvement on this section.',
    'insight.defectHigh':     'Perform quality check.',
    'insight.efficient':      'line running efficiently.',
    'insight.monitorPerf':    'Continue monitoring section performance.',

    // Dashboard
    'dash.welcome':           'Welcome',
    'dash.overview':          'Today\'s overview',
    'dash.totalLines':        'Total lines',
    'dash.activeLines':       'Active lines',
    'dash.avgLler':           'Average LLER',
    'dash.totalAlerts':       'Active alerts',

    // Models
    'model.library':          'Model Library',
    'model.upload':           'Upload NB Standard',
    'model.name':             'Model name',
    'model.article':          'Article',
    'model.sections':         'Sections',
    'model.assignedTo':       'Assigned to',
    'model.noAssignment':     'Not assigned',

    // Shift close
    'shift.close':            'Close Shift',
    'shift.closed':           'Shift closed and data archived.',
    'shift.emailSent':        'Report sent to',
    'shift.emailFailed':      'Email delivery failed.',

    // Users
    'user.management':        'User Management',
    'user.addNew':            'Add user',
    'user.name':              'Name',
    'user.email':             'Email',
    'user.role':              'Role',
    'user.building':          'Building',
    'user.lineAccess':        'Line access',
  },

  // ─── 繁體中文 (TRADITIONAL CHINESE) ──────────────────────
  'zh-TW': {
    // Common
    'app.title':              'IE 產線平衡系統',
    'app.subtitle':           '即時生產監控系統',
    'app.by':                 '開發者',
    'common.save':            '儲存',
    'common.saving':          '儲存中...',
    'common.cancel':          '取消',
    'common.delete':          '刪除',
    'common.edit':            '編輯',
    'common.close':           '關閉',
    'common.search':          '搜尋',
    'common.loading':         '載入中...',
    'common.noData':          '尚無數據',
    'common.back':            '返回',
    'common.confirm':         '確認',
    'common.success':         '成功',
    'common.error':           '發生錯誤',
    'common.logout':          '登出',
    'common.login':           '登入',
    'common.pairs':           '雙',
    'common.minutes':         '分鐘',
    'common.persons':         '人',
    'common.hours':           '小時',
    'common.today':           '今日',
    'common.all':             '全部',
    'common.active':          '啟用',
    'common.inactive':        '停用',

    // Login
    'login.title':            '產線平衡',
    'login.subtitle':         '登入您的帳號',
    'login.email':            '電子信箱',
    'login.password':         '密碼',
    'login.button':           '登入',
    'login.signingIn':        '登入中...',
    'login.error':            '信箱或密碼錯誤',
    'login.forgotPassword':   '忘記密碼請聯繫 IT 管理員',

    // Sidebar / Navigation
    'nav.dashboard':          '儀表板',
    'nav.modelLibrary':       '鞋型資料庫',
    'nav.inputActual':        '實際數據輸入',
    'nav.monitor':            '監控中心',
    'nav.analytics':          '數據分析',
    'nav.users':              '使用者管理',
    'nav.allBuildings':       '所有廠房',

    // Leader tabs
    'leader.tabStatus':       '狀態',
    'leader.tabInput':        '輸入',
    'leader.tabStandard':     '標準',
    'leader.tabAI':           'AI',
    'leader.shift':           '班次',
    'leader.overtime':        '加班',
    'leader.overtimeActive':  '加班啟用',
    'leader.selectHour':      '選擇時段',
    'leader.output':          '產出 於',
    'leader.outputTarget':    '目標',
    'leader.mpPresent':       '出勤人數',
    'leader.mpStd':           '標準',
    'leader.downtime':        '停機時間',
    'leader.downtimeReason':  '停機原因',
    'leader.defect':          '不良品',
    'leader.saveShift':       '儲存',
    'leader.saved':           '已儲存 ✓',
    'leader.noModel':         '此產線尚未分配鞋型。',
    'leader.shiftInfo1':      '日班：07:00 – 16:00',
    'leader.shiftInfo1OT':    '+ 加班 17:00 – 19:00',
    'leader.shiftInfo2':      '夜班：20:00 – 05:00',
    'leader.shiftInfo2OT':    '+ 加班 06:00 – 08:00',
    'leader.locked':          '數據已鎖定 — 班次已結束',

    // Status tab
    'status.title':           '今日狀態',
    'status.totalOutput':     '總產出',
    'status.avgMP':           '平均人數',
    'status.totalDT':         '總停機',
    'status.totalDefect':     '總不良品',
    'status.perHour':         '每小時',
    'status.noDataYet':       '今日尚無數據',

    // Standard tab
    'std.title':              'IE 標準',
    'std.operations':         '工序清單',
    'std.taktTime':           '節拍時間',
    'std.stdMP':              '標準人數',
    'std.theorMP':            '理論人數',
    'std.lbr':                '平衡率',
    'std.effCT':              '有效週期',
    'std.multiMP':            '多人工序',
    'std.standard':           '標準',

    // AI tab
    'ai.title':               'AI 建議',
    'ai.subtitle':            '基於今日數據的分析',
    'ai.analyze':             '分析此工段',
    'ai.analyzing':           '分析中...',
    'ai.noData':              '今日尚無數據',
    'ai.error':               '連線失敗，請稍後再試。',

    // TV Display
    'tv.title':               '數位安燈板',
    'tv.subtitle':            '即時生產監控',
    'tv.avgLler':             '平均 LLER',
    'tv.totalOutput':         '總產出',
    'tv.dailyTarget':         '每日目標',
    'tv.downtime':            '停機',
    'tv.alert':               '警報',
    'tv.progressTitle':       '廠房每日目標進度',
    'tv.trendTitle':          '每小時產出趨勢',
    'tv.avgMP':               '平均人數',
    'tv.defect':              '不良品',
    'tv.outputPairs':         '產出雙數',
    'tv.targetToday':         '今日目標',
    'tv.waitingInput':        '等待輸入',
    'tv.autoInsight':         '智慧分析',
    'tv.collecting':          '收集數據中...',
    'tv.autoRefresh':         '每60秒自動更新',
    'tv.lineActive':          '條產線運作中',

    // Insights
    'insight.noData':         '尚無數據 — 等待組長輸入。',
    'insight.alert':          '需要立即處理。',
    'insight.targetReached':  '每日目標已達成！',
    'insight.targetLow':      '需要立即加速產出。',
    'insight.trendDown':      '產出趨勢下降',
    'insight.trendUp':        '產出趨勢上升',
    'insight.lastHours':      '最近3小時',
    'insight.maintain':       '保持良好勢頭！',
    'insight.investigate':    '調查下降原因。',
    'insight.dtHigh':         '累計停機時間',
    'insight.dtInvestigate':  '立即確認根本原因。',
    'insight.sectionLow':     'LLER 低於 75%。專注改善此工段。',
    'insight.defectHigh':     '執行品質檢查。',
    'insight.efficient':      '產線運作效率良好。',
    'insight.monitorPerf':    '持續監控各工段表現。',

    // Dashboard
    'dash.welcome':           '歡迎',
    'dash.overview':          '今日概覽',
    'dash.totalLines':        '總產線數',
    'dash.activeLines':       '運作中產線',
    'dash.avgLler':           '平均 LLER',
    'dash.totalAlerts':       '啟用中警報',

    // Models
    'model.library':          '鞋型資料庫',
    'model.upload':           '上傳 NB 標準',
    'model.name':             '鞋型名稱',
    'model.article':          '品號',
    'model.sections':         '工段',
    'model.assignedTo':       '分配至',
    'model.noAssignment':     '尚未分配',

    // Shift close
    'shift.close':            '結束班次',
    'shift.closed':           '班次已結束，數據已歸檔。',
    'shift.emailSent':        '報告已發送至',
    'shift.emailFailed':      '郵件發送失敗。',

    // Users
    'user.management':        '使用者管理',
    'user.addNew':            '新增使用者',
    'user.name':              '姓名',
    'user.email':             '電子信箱',
    'user.role':              '角色',
    'user.building':          '廠房',
    'user.lineAccess':        '產線權限',
  },
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT + HOOK
// ═══════════════════════════════════════════════════════════════
interface I18nContextType {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextType>({
  locale: 'id',
  setLocale: () => {},
  t: (key: string) => key,
})

const STORAGE_KEY = 'ie-lb-locale'

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('id')

  // Load saved preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
      if (saved && translations[saved]) setLocaleState(saved)
    } catch {}
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch {}
  }, [])

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    let text = translations[locale]?.[key] ?? translations['id']?.[key] ?? key
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v))
      })
    }
    return text
  }, [locale])

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}

export { translations }
