import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId: user.id },
    select: { onboardingCompleted: true },
  })

  if (profile?.onboardingCompleted) {
    redirect('/dashboard')
  }

  return <>{children}</>
}
