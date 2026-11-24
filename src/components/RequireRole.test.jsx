// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const getJson = vi.fn()
vi.mock('../api/client', async (orig) => ({
  ...(await orig()),
  getJson: (...a) => getJson(...a),
}))

import { setToken, setUser } from '../api/client'
import RequireRole from './RequireRole'
import AccessDeniedNotice from './AccessDeniedNotice'
import Navbar from './Navbar'
import { ThemeProvider } from '../context/ThemeContext'

const ADMIN = { id: 'a1', fullName: 'Ada Admin', userType: 'ADMIN' }
const MODERATOR = { id: 'm1', fullName: 'Mo Mod', userType: 'MODERATOR' }
const NORMAL = { id: 'u1', fullName: 'Nora Normal', userType: 'ATHLETE' }

const pageRendered = vi.fn()
function AdminPage() {
  pageRendered()
  return <h1>Secret admin page</h1>
}

function renderAt(path, allow = 'admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AccessDeniedNotice />
      <Routes>
        <Route path="/" element={<h1>Home</h1>} />
        <Route
          path="/admin/dashboard"
          element={
            <RequireRole allow={allow}>
              <AdminPage />
            </RequireRole>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

// The server's answer for GET /v1/user/find/logged-in.
function serverSays(user) {
  getJson.mockResolvedValue(user)
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
  setToken('t0ken')
})

describe('RequireRole: admin routes', () => {
  it('lets a server-confirmed ADMIN in', async () => {
    serverSays(ADMIN)
    renderAt('/admin/dashboard')
    expect(await screen.findByText('Secret admin page')).toBeInTheDocument()
  })

  it('blocks a normal user on a direct URL: home + friendly notice, page never rendered', async () => {
    serverSays(NORMAL)
    renderAt('/admin/dashboard')
    expect(await screen.findByText('Home')).toBeInTheDocument()
    expect(
      screen.getByText(/don.t have access to that page/i)
    ).toBeInTheDocument()
    expect(pageRendered).not.toHaveBeenCalled()
  })

  it('ignores a role edited into localStorage: the server says ATHLETE', async () => {
    setUser({ ...NORMAL, userType: 'ADMIN' }) // tampered cache
    serverSays(NORMAL)
    renderAt('/admin/dashboard')
    expect(await screen.findByText('Home')).toBeInTheDocument()
    expect(pageRendered).not.toHaveBeenCalled()
  })

  it('fails closed when the server cannot be asked, even with ADMIN in localStorage', async () => {
    setUser(ADMIN) // cached / tampered
    getJson.mockRejectedValue(new Error('offline'))
    renderAt('/admin/dashboard')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn.t verify your access/i
    )
    expect(pageRendered).not.toHaveBeenCalled()

    // ...and Try again lets a confirmed admin in once the server answers.
    serverSays(ADMIN)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Secret admin page')).toBeInTheDocument()
  })

  it('a MODERATOR is blocked from admin-only but allowed on staff pages', async () => {
    serverSays(MODERATOR)
    renderAt('/admin/dashboard', 'admin')
    expect(await screen.findByText('Home')).toBeInTheDocument()
    cleanup()
    renderAt('/admin/dashboard', 'staff')
    expect(await screen.findByText('Secret admin page')).toBeInTheDocument()
  })

  it('the notice goes away when dismissed', async () => {
    serverSays(NORMAL)
    renderAt('/admin/dashboard')
    await screen.findByText(/don.t have access/i)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() =>
      expect(screen.queryByText(/don.t have access/i)).toBeNull()
    )
  })
})

describe('Navbar: Admin menu', () => {
  function renderNavbar() {
    return render(
      <ThemeProvider>
        <MemoryRouter>
          <Navbar />
        </MemoryRouter>
      </ThemeProvider>
    )
  }

  it('shows Admin for a server-confirmed admin', async () => {
    serverSays(ADMIN)
    renderNavbar()
    expect(await screen.findByRole('button', { name: /^Admin/ })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeVisible()
  })

  it('shows no Admin menu, Dashboard or Athletes for a normal user', async () => {
    serverSays(NORMAL)
    renderNavbar()
    await screen.findByRole('link', { name: 'Events' })
    await waitFor(() => expect(getJson).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /^Admin/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Athletes' })).toBeNull()
  })

  it('a role edited into localStorage does not show Admin (not even before the server answers, or if it fails)', async () => {
    setUser({ ...NORMAL, userType: 'ADMIN' })
    getJson.mockRejectedValue(new Error('offline'))
    renderNavbar()
    await screen.findByRole('link', { name: 'Events' })
    expect(screen.queryByRole('button', { name: /^Admin/ })).toBeNull()
    await waitFor(() => expect(getJson).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /^Admin/ })).toBeNull()
  })
})
