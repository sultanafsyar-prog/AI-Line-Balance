'use client'
import { useState, useEffect } from 'react'
import { BUILDINGS, ROLE_LABELS } from '@/lib/utils'

type User = { id: string; name: string; email: string; role: string; building: string | null; active: boolean; createdAt: string }

const ROLES = [
  { value: 'IE_ADMIN',              label: 'IE Admin',      desc: 'Full access + user management' },
  { value: 'IE_OPERATOR',           label: 'IE Operator',   desc: 'Upload model, monitor semua line' },
  { value: 'PRODUCTION_SUPERVISOR', label: 'Supervisor',    desc: 'Input aktual, lihat standar' },
  { value: 'PRODUCTION_OPERATOR',   label: 'Operator',      desc: 'Input aktual per jam' },
  { value: 'MANAGEMENT',            label: 'Management',    desc: 'View dashboard & laporan' },
  { value: 'IT_ADMIN',              label: 'IT Admin',      desc: 'User management, sistem config' },
]

const ROLE_COLOR: Record<string, string> = {
  IE_ADMIN: 'badge-bad', IE_OPERATOR: 'badge-warn',
  PRODUCTION_SUPERVISOR: 'badge-info', PRODUCTION_OPERATOR: 'badge-ok',
  MANAGEMENT: 'badge-ok', IT_ADMIN: 'badge-warn',
}

type FormData = { name: string; email: string; password: string; role: string; building: string }
const emptyForm = (): FormData => ({ name: '', email: '', password: '', role: 'PRODUCTION_OPERATOR', building: '' })

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'create' | { user: User } | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => { setUsers(d); setLoading(false) })
  }, [])

  function openCreate() { setForm(emptyForm()); setError(''); setModal('create') }
  function openEdit(u: User) {
    setForm({ name: u.name, email: u.email, password: '', role: u.role, building: u.building ?? '' })
    setError(''); setModal({ user: u })
  }

  async function handleSave() {
    if (!form.name || !form.email || !form.role) { setError('Nama, email, dan role wajib diisi'); return }
    if (modal === 'create' && !form.password) { setError('Password wajib diisi untuk user baru'); return }
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
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, active: !user.active }),
    })
    if (res.ok) {
      const updated = await res.json()
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
    }
  }

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.building ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const byRole = ROLES.map(r => ({
    ...r,
    users: filtered.filter(u => u.role === r.value),
  })).filter(r => r.users.length > 0)

  const requiresBuilding = (role: string) =>
    role === 'PRODUCTION_SUPERVISOR' || role === 'PRODUCTION_OPERATOR'

  if (loading) return <div className="text-gray-400 text-sm p-8">Memuat...</div>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">User management</h1>
          <p className="text-sm text-gray-500 mt-1">{users.length} user terdaftar · {users.filter(u => u.active).length} aktif</p>
        </div>
        <button onClick={openCreate} className="btn btn-primary">+ Tambah user</button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input className="input max-w-xs text-sm" placeholder="Cari nama, email, gedung..." value={search} onChange={e => setSearch(e.target.value)} />
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
                    {['Nama', 'Email', 'Gedung', 'Status', 'Bergabung', 'Aksi'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.users.map(u => (
                    <tr key={u.id} className={`border-b border-gray-50 ${!u.active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-teal flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                            {u.name[0].toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{u.email}</td>
                      <td className="px-4 py-2.5">
                        {u.building
                          ? <span className="badge badge-info">Gedung {u.building}</span>
                          : <span className="text-xs text-gray-400">Semua gedung</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`badge ${u.active ? 'badge-ok' : 'badge-bad'}`}>
                          {u.active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">
                        {new Date(u.createdAt).toLocaleDateString('id-ID')}
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-lg mb-4">{modal === 'create' ? 'Tambah user baru' : `Edit — ${(modal as any).user.name}`}</h2>

            <div className="space-y-3 mb-4">
              <div>
                <label className="label">Nama lengkap *</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nama operator / supervisor" />
              </div>
              <div>
                <label className="label">Email *</label>
                <input type="email" className="input" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@factory.com"
                  disabled={modal !== 'create'} />
              </div>
              <div>
                <label className="label">{modal === 'create' ? 'Password *' : 'Password baru (kosongkan jika tidak diganti)'}</label>
                <input type="password" className="input" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder={modal === 'create' ? 'Min. 8 karakter' : '(tidak diubah)'} />
              </div>
              <div>
                <label className="label">Role *</label>
                <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value, building: requiresBuilding(e.target.value) ? f.building : '' }))}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
                </select>
              </div>
              <div>
                <label className="label">
                  Gedung {requiresBuilding(form.role) ? '*' : '(opsional, kosong = semua gedung)'}
                </label>
                <select className="input" value={form.building} onChange={e => setForm(f => ({ ...f, building: e.target.value }))}>
                  <option value="">— Semua gedung —</option>
                  {Object.keys(BUILDINGS).map(b => <option key={b} value={b}>Gedung {b}</option>)}
                </select>
              </div>
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
