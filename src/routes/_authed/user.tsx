import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { api } from 'convex/_generated/api'
import { convexQuery } from '@convex-dev/react-query'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useMutation } from 'convex/react'
import { type FormEvent, useState } from 'react'

export const Route = createFileRoute('/_authed/user')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirectTo:
      typeof search.redirectTo === 'string' && search.redirectTo.startsWith('/')
        ? search.redirectTo
        : undefined,
  }),
  component: RouteComponent,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      convexQuery(api.user.profileDraft, {}),
    )
  },
})

function RouteComponent() {
  const { redirectTo } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const upsertProfile = useMutation(api.user.upsertProfile)
  const { data: profileDraft } = useSuspenseQuery(
    convexQuery(api.user.profileDraft, {}),
  )
  const [name, setName] = useState(profileDraft?.name ?? '')
  const [email, setEmail] = useState(profileDraft?.email ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const profileQuery = convexQuery(api.user.profile, {})
  const profileDraftQuery = convexQuery(api.user.profileDraft, {})

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError(null)
    setIsSaving(true)
    try {
      await upsertProfile({ name, email })
      await queryClient.invalidateQueries({ queryKey: profileQuery.queryKey })
      await queryClient.invalidateQueries({ queryKey: profileDraftQuery.queryKey })
      await navigate({ to: redirectTo ?? '/' })
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to save profile.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="p-2 flex gap-2 flex-col">
      {profileDraft?.hasProfile === false ? (
        <form onSubmit={onSubmit} className="max-w-md flex flex-col gap-3">
          <h1 className="text-xl font-semibold">Create your profile</h1>
          <p className="text-sm text-neutral-600">
            Add your name and email to continue and make reservations.
          </p>
          <label className="text-sm font-medium" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
            placeholder="Your name"
            autoComplete="name"
            required
          />
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-md bg-teal-600 px-4 py-2 text-white disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save profile'}
          </button>
        </form>
      ) : (
        <>
          <p>Welcome, {profileDraft?.name}.</p>
          <p>Your email address is {profileDraft?.email}.</p>
        </>
      )}
    </div>
  )
}
