import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import ProfileForm from './profile-form'

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId: user.id },
    select: {
      introSummary: true,
      yearsOfExp: true,
      techStack: true,
      targetRoles: true,
    },
  })

  return (
    <div className="mx-auto max-w-2xl">
      <ProfileForm
        initialProfile={{
          introSummary: profile?.introSummary ?? '',
          yearsOfExp: profile?.yearsOfExp ?? null,
          techStack: profile?.techStack ?? '',
          targetRoles: profile?.targetRoles ?? '',
        }}
      />
    </div>
  )
}
