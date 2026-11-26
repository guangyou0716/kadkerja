import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { errorText } from '../errors'
import { fakeApi, job, publicJob, renderAt } from '../test/render'
import { LANG_STORAGE_KEY, translate } from './core'

const TOKEN = 'TestTokenTestTokenTest01'

describe('languages in the app', () => {
  it('switches the sign-in page to Bahasa Melayu, remembers it, and marks the page as Malay', async () => {
    const user = userEvent.setup()
    fakeApi(() => ({ body: {} }), { me: null })
    const first = renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Staff sign-in' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'ms')
    expect(screen.getByRole('heading', { name: 'Log masuk kakitangan' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nama pengguna')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log masuk' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('ms')
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('ms')

    // Opening the app again starts in Malay.
    first.unmount()
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Log masuk kakitangan' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Bahasa' })).toHaveValue('ms')
  })

  it('a wrong sign-in is explained in the chosen language', async () => {
    const user = userEvent.setup()
    localStorage.setItem(LANG_STORAGE_KEY, 'zh')
    fakeApi((url) => (url === '/api/auth/login' ? { status: 401, body: { detail: 'Wrong username or password.' } } : { body: {} }), { me: null })
    renderAt('/')
    await user.type(await screen.findByLabelText('用户名'), 'advisor')
    await user.type(screen.getByLabelText('密码'), 'nope')
    await user.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('用户名或密码错误。')
  })

  it('starts in the device language when nothing was chosen, and ignores a damaged saved value', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN', 'en'])
    localStorage.setItem(LANG_STORAGE_KEY, '"ms"')
    fakeApi(() => ({ body: {} }), { me: null })
    renderAt('/')
    expect(await screen.findByRole('heading', { name: '员工登录' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('zh-Hans')
  })

  it('shows the staff app in Chinese: menu, board columns, status badges, roles', async () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'zh')
    fakeApi(() => ({
      body: [{ id: 7, number: 'KK-2026-0007', status: 'QUOTED', plate: 'PKR 1234', vehicle: 'Perodua Myvi', customer: 'Test Customer', complaint: 'Brakes squeak', assignedTo: null }],
    }))
    renderAt('/')
    expect(await screen.findByRole('heading', { name: '工单看板' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: '主菜单' })
    for (const name of ['工单看板', '车辆登记', '员工', '零件']) expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    expect(screen.getByText(/服务顾问/)).toBeInTheDocument()
    const column = screen.getByRole('region', { name: '等待客户确认' })
    expect(within(column).getByText('PKR 1234')).toBeInTheDocument()
    expect(within(column).getByText('尚未指派技师')).toBeInTheDocument()
    expect(screen.getByText('1 张进行中 · 0 张已取车或已取消')).toBeInTheDocument()
  })

  it('labels every check-in field in Chinese with its own id (ids no longer come from the label text)', async () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'zh')
    fakeApi(() => ({ body: {} }))
    renderAt('/check-in')
    expect(await screen.findByRole('heading', { name: '车辆登记' })).toBeInTheDocument()
    const labels = ['姓名', '电话', '车牌', '品牌', '型号', '年份', '里程（公里）', '故障描述']
    const ids = labels.map((l) => screen.getByLabelText(l).id)
    expect(new Set(ids).size).toBe(labels.length)
    expect(screen.getByLabelText('电话')).toHaveAccessibleDescription('例如 012-3456789')
  })

  it('shows the job card in Malay with Malaysian number format and a Malay timeline', async () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'ms')
    fakeApi(() => ({ body: job() }))
    renderAt('/jobs/7')
    expect(await screen.findByRole('heading', { name: 'PKR 1234' })).toBeInTheDocument()
    expect(screen.getByText('84,210 km')).toBeInTheDocument()
    expect(screen.getByText('Sedang diperiksa', { selector: 'span.rounded-full' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sebut harga' })).toBeInTheDocument()
    expect(screen.getByText('Jumlah keseluruhan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hantar sebut harga' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Batalkan kerja' })).toBeInTheDocument()
    const timeline = screen.getByRole('region', { name: 'Garis masa' })
    expect(within(timeline).getByText('Diterima')).toBeInTheDocument()
    expect(within(timeline).getByText('26 Nov, 10:00')).toBeInTheDocument()
  })

  it('writes the WhatsApp message in the language picked for the customer, with a link that opens in it', async () => {
    const user = userEvent.setup()
    fakeApi(() => ({ body: job({ status: 'QUOTED', next: ['APPROVED', 'DECLINED', 'INSPECTING', 'CANCELLED'] }) }))
    renderAt('/jobs/7')
    const wa = await screen.findByRole('link', { name: 'Send on WhatsApp' })
    const message = () => decodeURIComponent(wa.getAttribute('href')!.split('?text=')[1])
    expect(message()).toBe(
      `Hi Test, the quote for PKR 1234 (KK-2026-0007) is ready: RM 203.58 incl. SST. Please check it and tap Approve or Decline here: ${window.location.origin}/t/${TOKEN}?lang=en`,
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'Message in' }), 'zh')
    expect(message()).toBe(
      `Test 您好，PKR 1234 (KK-2026-0007) 的报价已准备好：RM 203.58（含 SST）。请查看并点击“批准”或“拒绝”：${window.location.origin}/t/${TOKEN}?lang=zh`,
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'Message in' }), 'ms')
    expect(message()).toContain('sebut harga untuk PKR 1234 (KK-2026-0007) sudah siap: RM 203.58 termasuk SST')
    expect(message().endsWith(`?lang=ms`)).toBe(true)
    // The staff page itself stays English; the plain link (Copy) has no language in it.
    expect(screen.getByRole('textbox', { name: 'Customer link' })).toHaveValue(`${window.location.origin}/t/${TOKEN}`)
  })

  it("opens the customer's page in the link's language, with Chinese dates and the approve confirmation", async () => {
    const user = userEvent.setup()
    fakeApi(() => ({ body: publicJob() }))
    renderAt(`/t/${TOKEN}?lang=zh`)
    expect(await screen.findByRole('heading', { name: '您的报价已准备好' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '进度' }).querySelector('[aria-current="step"]')).toHaveTextContent('报价')
    expect(screen.getByText('（第 2 版）')).toBeInTheDocument()
    expect(screen.getByText('11月26日 11:00')).toBeInTheDocument()
    expect(screen.getByText('零件 · 2 × RM 64.25')).toBeInTheDocument()
    expect(screen.getByTestId('public-total')).toHaveTextContent('RM 203.58')
    await user.click(screen.getByRole('button', { name: '批准' }))
    expect(screen.getByText('批准以上 2 个项目，共 RM 203.58？车行将开始维修。')).toBeInTheDocument()
    // The customer can switch, and the page is marked as Malay for screen readers.
    await user.selectOptions(screen.getByRole('combobox', { name: '语言' }), 'ms')
    expect(screen.getByRole('heading', { name: 'Sebut harga anda sudah siap' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('ms')
  })

  it('uses one item in the English confirmation for a one-line quote', async () => {
    const user = userEvent.setup()
    const one = publicJob()
    fakeApi(() => ({ body: { ...one, lines: one.lines.slice(0, 1) } }))
    renderAt(`/t/${TOKEN}`)
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(screen.getByText(/for the 1 item above\?/)).toBeInTheDocument()
  })

  it('an unknown link says so in Malay', async () => {
    fakeApi(() => ({ status: 404, body: { detail: 'Not found' } }))
    renderAt(`/t/${TOKEN}?lang=ms`)
    expect(await screen.findByRole('alert')).toHaveTextContent('Pautan ini tidak sah atau telah tamat tempoh.')
  })

  it("translates the app's own errors and keeps the server's explanation as it is", () => {
    const t = (k: Parameters<typeof translate>[1]) => translate('ms', k)
    expect(errorText(new ApiError(0, 'Cannot reach the server. Check that it is running.'), t)).toBe(
      'Pelayan tidak dapat dihubungi. Pastikan ia sedang berjalan.',
    )
    expect(errorText(new ApiError(429, 'Too many requests'), t)).toBe('Terlalu banyak cubaan. Tunggu sebentar dan cuba lagi.')
    expect(errorText(new ApiError(404, 'This photo is no longer there.'), t)).toBe('Foto ini sudah tiada.')
    expect(errorText(new ApiError(409, 'A job can only go from Quoted to Approved.'), t)).toBe('A job can only go from Quoted to Approved.')
    expect(errorText(new Error('boom'), t)).toBe('boom')
  })

  it('keeps showing the page when a catalogue misses a key (falls back to English)', async () => {
    const { CATALOGUES } = await import('./core')
    const saved = CATALOGUES.ms['board.empty']
    delete (CATALOGUES.ms as Partial<Record<string, string>>)['board.empty']
    try {
      expect(translate('ms', 'board.empty')).toBe('Nothing here.')
    } finally {
      CATALOGUES.ms['board.empty'] = saved
    }
    await waitFor(() => expect(translate('ms', 'board.empty')).toBe('Tiada apa-apa di sini.'))
  })
})
