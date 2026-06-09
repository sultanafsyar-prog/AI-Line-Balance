'use client'
import { useState, useEffect } from 'react'
import { BUILDINGS, ROLE_LABELS, ROLE_COLORS } from '@/lib/utils'

type LineRef = { id: string; building: string; lineNo: number }
type User = {
  id: string; name: string; email: string; role: string
  building: string | null; active: boolean; createdAt: string
  lineAccess: { line: LineRef }[]
}

const ROLES = [
  { value: 'IE_ADMIN',    label: 'IE Admin',    desc: 'Full access + user management' },
  { value: 'IE_OPERATOR', label: 'IE Operator', desc: 'Upload model, monitor semua line' },
  { value: 'TEAM_LEADER', label: 'Team Leader', desc: 'Input aktual, assign per line' },
  { value: 'MANAGEMENT',  label: 'Manager',     desc: 'View dashboard & laporan' },
  { value: 'IT_ADMIN',    label: 'IT Admin',    desc: 'User management, sistem config' },
]

type FormData = {
  name: string; email: string; password: string; role: string
  building: string; lineIds: string[]
}
const emptyForm = (): FormData => ({
  name: '', email: '', password: '', role: 'TEAM_LEADER', building: '', lineIds: []
})

export default function UsersPage() {
  const [users, setUsers]   = useState<User[]>([])
  const [lines, setLines]   = useState<LineRef[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]   = useState<'create' | { user: User } | null>(null)
  const [form, setForm]     = useState<FormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [search, setSearch] = useState('')
  const [filterBuilding, setFilterBuilding] = useState('ALL')

  useEffect(() => {
    Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch('/api/lines').then(r => r.json()),
    ]).then(([u, l]) => {
      setUsers(u)
      setLines(l.map((line: any) => ({ id: line.id, building: line.building, lineNo: line.lineNo })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  function openCreate() { setForm(emptyForm()); setError(''); setModal('create') }
  function openEdit(u: User) {
    setForm({
      name: u.name, email: u.email, password: '',
      role: u.role, building: u.building ?? '',
      lineIds: u.lineAccess.map(la => la.line.id),
    })
    setError(''); setModal({ user: u })
  }

  async function handleSave() {
    if (!form.name || !form.email || !form.role) { setError('Nama, email, dan role wajib diisi'); return }
    if (modal === 'create' && !form.password) { setError('Password wajib untuk user baru'); return }
    if (form.role === 'TEAM_LEADER' && form.lineIds.length === 0) {
      setError('Team Leader harus di-assign minimal 1 line'); return
    }
    setSaving(true); setError('')

    const isEdit = modal !== 'create'
    const body = isEdit
      ? { id: (modal as any).user.id, ...form, password: form.password || undefined }
      : form

    const res = await fetch('/api/users', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Gagal menyimpan'); setSaving(false); return }

    setUsers(prev => isEdit
      ? prev.map(u => u.id === data.id ? data : u)
      : [data, ...prev]
    )
    setModal(null); setSaving(false)
  }

  async function toggleActive(user: User) {
    const res = await fetch('/api/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, active: !user.active }),
    })
    if (res.ok) {
      const updated = await res.json()
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
    }
  }

  function toggleLine(lineId: string) {
    setForm(f => ({
      ...f,
      lineIds: f.lineIds.includes(lineId)
        ? f.lineIds.filter(id => id !== lineId)
        : [...f.lineIds, lineId]
    }))
  }

  function selectAllBuilding(building: string) {
    const bldgLines = lines.filter(l => l.building === building).map(l => l.id)
    const allSelected = bldgLines.every(id => form.lineIds.includes(id))
    setForm(f => ({
      ...f,
      lineIds: allSelected
        ? f.lineIds.filter(id => !bldgLines.includes(id))
        : [...new Set([...f.lineIds, ...bldgLines])]
    }))
  }

  const filtered = users
    .filter(u => filterBuilding === 'ALL' || u.building === filterBuilding ||
      u.lineAccess.some(la => la.line.building === filterBuilding))
    .filter(u =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    )

  const byRole = ROLES.map(r => ({
    ...r, users: filtered.filter(u => u.role === r.value)
  })).filter(r => r.users.length > 0)

  if (loading) return <div className="text-gray-400 text-sm p-8">Memuat...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">User management</h1>
          <p className="text-sm text-gray-500 mt-1">
            {users.length} user · {users.filter(u => u.active).length} aktif
          </p>
        </div>
        <button onClick={openCreate} className="btn btn-primary">+ Tambah user</button>
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input className="input max-w-xs text-sm" placeholder="Cari nama / email..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input w-40 text-sm" value={filterBuilding} onChange={e => setFilterBuilding(e.target.value)}>
          <option value="ALL">Semua gedung</option>
          {Object.keys(BUILDINGS).map(b => <option key={b} value={b}>Gedung {b}</option>)}
        </select>
      </div>

      {/* Users by role */}
      <div className="space-y-5">
        {byRole.map(r => (
          <div key={r.value}>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-sm font-semibold text-gray-700">{r.label}</h2>
              <span className="text-xs text-gray-400">— {r.desc}</span>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{r.users.length}</span>
            </div>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Nama', 'Email', 'Line / Gedung', 'Status', 'Aksi'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.users.map(u => (
                    <tr key={u.id} className={`border-b border-gray-50 ${!u.active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-teal flex items-center justify-center text-white text-xs font-medium">
                            {u.name[0].toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{u.email}</td>
                      <td className="px-4 py-2.5">
                        {u.role === 'TEAM_LEADER' ? (
                          <div className="flex flex-wrap gap-1">
                            {u.lineAccess.length > 0
                              ? u.lineAccess.map(la => (
                                  <span key={la.line.id} className="badge badge-info text-xs">
                                    Gdg {la.line.building} L{la.line.lineNo}
                                  </span>
                                ))
                              : <span className="text-xs text-red-500">Belum ada line!</span>
                            }
                          </div>
                        ) : (
                          u.building
                            ? <span className="badge badge-info">Gedung {u.building}</span>
                            : <span className="text-xs text-gray-400">Semua gedung</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`badge ${u.active ? 'badge-ok' : 'badge-bad'}`}>
                          {u.active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(u)} className="text-xs text-teal hover:underline">Edit</button>
                          <button onClick={() => toggleActive(u)} className={`text-xs hover:underline ${u.active ? 'text-red-500' : 'text-teal'}`}>
                            {u.active ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-auto"
          onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg my-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-lg mb-4">
              {modal === 'create' ? 'Tambah user baru' : `Edit — ${(modal as any).user.name}`}
            </h2>

            <div className="space-y-3 mb-4">
              <div>
                <label className="label">Nama lengkap *</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email *</label>
                <input type="email" className="input" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  disabled={modal !== 'create'} />
              </div>
              <div>
                <label className="label">{modal === 'create' ? 'Password *' : 'Password baru (kosongkan jika tidak diubah)'}</label>
                <input type="password" className="input" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder={modal === 'create' ? 'Min. 8 karakter' : '(tidak diubah)'} />
              </div>
              <div>
                <label className="label">Role *</label>
                <select className="input" value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value, lineIds: [], building: '' }))}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
                </select>
              </div>

              {/* Team Leader: pilih line */}
              {form.role === 'TEAM_LEADER' && (
                <div>
                  <label className="label">Line yang di-assign * <span className="text-gray-400">(pilih satu atau lebih)</span></label>
                  <div className="border border-gray-200 rounded-lg p-3 max-h-64 overflow-y-auto space-y-3">
                    {Object.entries(BUILDINGS).map(([building, lineCount]) => {
                      const bLines = lines.filter(l => l.building === building)
                      const allSel = bLines.every(l => form.lineIds.includes(l.id))
                      return (
                        <div key={building}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-gray-600">Gedung {building}</span>
                            <button onClick={() => selectAllBuilding(building)}
                              className="text-xs text-teal hover:underline">
                              {allSel ? 'Hapus semua' : 'Pilih semua'}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {bLines.map(l => (
                              <button key={l.id} onClick={() => toggleLine(l.id)}
                                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                                  form.lineIds.includes(l.id)
                                    ? 'bg-teal text-white border-teal'
                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-teal'
                                }`}>
                                L{l.lineNo}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {form.lineIds.length > 0 && (
                    <p className="text-xs text-teal mt-1">{form.lineIds.length} line dipilih</p>
                  )}
                </div>
              )}

              {/* Manager: pilih gedung */}
              {form.role === 'MANAGEMENT' && (
                <div>
                  <label className="label">Gedung <span className="text-gray-400">(kosong = lihat semua)</span></label>
                  <select className="input" value={form.building} onChange={e => setForm(f => ({ ...f, building: e.target.value }))}>
                    <option value="">— Semua gedung —</option>
                    {Object.keys(BUILDINGS).map(b => <option key={b} value={b}>Gedung {b}</option>)}
                  </select>
                </div>
              )}
            </div>

            {error && <div className="mb-3 px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg">⚠ {error}</div>}

            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="btn btn-primary flex-1 justify-center">
                {saving ? 'Menyimpan...' : '✓ Simpan'}
              </button>
              <button onClick={() => setModal(null)} className="btn btn-secondary">Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
