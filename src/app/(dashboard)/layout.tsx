import { Sidebar } from '@/components/layout/sidebar'
import { AuthGuard } from '@/components/auth-guard'
import { PortalGuard } from '@/components/portal-guard'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <PortalGuard>
        <div className="flex h-screen overflow-hidden bg-background">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </PortalGuard>
    </AuthGuard>
  )
}
