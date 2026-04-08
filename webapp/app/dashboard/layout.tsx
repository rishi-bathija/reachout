import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId: user.id },
    select: { onboardingCompleted: true },
  })

  if (!profile?.onboardingCompleted) {
    redirect('/onboarding')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">ReachOutFlow</h1>
              <span className="text-sm text-gray-500">by {user.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard/profile">
                <Button variant="ghost" type="button">
                  Profile
                </Button>
              </Link>
              <Link href="/dashboard/extension">
                <Button variant="ghost" type="button">
                  Extension
                </Button>
              </Link>
              <form action="/auth/signout" method="post">
                <Button variant="ghost" type="submit">
                  Sign Out
                </Button>
              </form>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
