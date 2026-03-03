import { api } from 'convex/_generated/api'
import { convexQuery } from '@convex-dev/react-query'
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { useAction } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'

export const Route = createFileRoute('/posts')({
  loader: async ({ context }) => {
    if (context.userId) {
      const profile = await context.queryClient.ensureQueryData(
        convexQuery(api.user.profile, {}),
      )
      if (profile === null) {
        throw redirect({
          to: '/user',
          search: { redirectTo: '/posts' },
        })
      }
    }

    await context.queryClient.ensureQueryData({
      ...convexQuery(api.posts.list, {}),
      gcTime: 10000,
    })
  },
  component: PostsComponent,
})

function PostsComponent() {
  const { data: posts } = useSuspenseQuery(convexQuery(api.posts.list, {}))

  const populatePosts = useAction(api.posts.populate)

  return (
    <div className="p-2 flex gap-2 flex-col">
      {posts.length === 0 && (
        <button
          onClick={() => populatePosts()}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Populate Posts
        </button>
      )}

      <ul className="list-disc pl-4">
        {posts.map((post) => {
          return (
            <li key={post.id} className="whitespace-nowrap">
              {post.title.substring(0, 20)}
            </li>
          )
        })}
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}
