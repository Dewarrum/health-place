import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouteContext,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import {
  ClerkProvider,
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
} from '@clerk/tanstack-react-start'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { createServerFn } from '@tanstack/react-start'
import * as React from 'react'
import { convexQuery } from '@convex-dev/react-query'
import { auth } from '@clerk/tanstack-react-start/server'
import { useQuery } from '@tanstack/react-query'
import { ChevronDownIcon } from 'lucide-react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import type { ConvexQueryClient } from '@convex-dev/react-query'
import type { ConvexReactClient } from 'convex/react'
import type { QueryClient } from '@tanstack/react-query'
import { api } from 'convex/_generated/api'
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from '~/components/ui/menu'
import appCss from '~/styles/app.css?url'

const fetchClerkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const { getToken, userId } = await auth()
  const token = await getToken({ template: 'convex' })

  return {
    userId,
    token,
  }
})

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
  convexClient: ConvexReactClient
  convexQueryClient: ConvexQueryClient
}>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Health Place',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon-16x16.png',
      },
      { rel: 'manifest', href: '/site.webmanifest', color: '#f8f5ee' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  beforeLoad: async (ctx) => {
    const clerkAuth = await fetchClerkAuth()
    const { userId, token } = clerkAuth
    if (token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token)
    }

    return {
      userId,
      token,
    }
  },
  component: RootComponent,
})

function RootComponent() {
  const context = useRouteContext({ from: Route.id })

  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={context.convexClient} useAuth={useAuth}>
        <RootDocument>
          <Outlet />
        </RootDocument>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const context = useRouteContext({ from: Route.id })
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const showShellNav = pathname !== '/'

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="relative min-h-screen overflow-x-clip">
          <div className="pointer-events-none fixed inset-0 -z-10">
            <div
              className="hp-drift absolute -left-20 top-10 h-80 w-80 rounded-full blur-3xl"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--signal) 15%, transparent)',
              }}
            />
            <div
              className="hp-drift absolute -right-20 top-40 h-72 w-72 rounded-full blur-3xl [animation-delay:900ms]"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--chart-2) 15%, transparent)',
              }}
            />
          </div>

          {showShellNav ? (
            <header className="sticky top-0 z-40 px-4 pt-4 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-6xl hp-reveal">
                <div className="hp-panel flex items-center gap-3 px-3 py-2 sm:px-4 sm:py-3">
                  <Link
                    to="/"
                    className="inline-flex items-center gap-2 rounded-full border border-foreground/12 bg-card px-3 py-1.5 text-sm font-bold uppercase tracking-[0.1em] text-foreground"
                  >
                    <span className="h-2 w-2 rounded-full bg-[var(--signal)]" />
                    Health Place
                  </Link>

                  <nav className="ml-auto flex items-center gap-1">
                    <Link
                      to="/"
                      activeOptions={{ exact: true }}
                      className="hp-nav-link"
                      activeProps={{ className: 'hp-nav-link hp-nav-link-active' }}
                      inactiveProps={{ className: 'hp-nav-link' }}
                    >
                      Home
                    </Link>
                    <MyStudiosMenu pathname={pathname} userId={context.userId} />
                    <Link
                      to="/user"
                      search={{ redirectTo: undefined }}
                      className="hp-nav-link"
                      activeProps={{ className: 'hp-nav-link hp-nav-link-active' }}
                      inactiveProps={{ className: 'hp-nav-link' }}
                    >
                      Account
                    </Link>
                  </nav>

                  <SignedIn>
                    <div className="rounded-full border border-foreground/12 bg-card p-1">
                      <UserButton />
                    </div>
                  </SignedIn>
                  <SignedOut>
                    <SignInButton mode="modal" forceRedirectUrl="/user">
                      <button type="button" className="hp-secondary-btn px-4 py-2">
                        Sign in
                      </button>
                    </SignInButton>
                  </SignedOut>
                </div>
              </div>
            </header>
          ) : null}

          {showShellNav ? (
            <main className="px-4 pb-12 pt-6 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-6xl hp-reveal">{children}</div>
            </main>
          ) : (
            children
          )}

          <TanStackRouterDevtools position="bottom-right" />
          <Scripts />
        </div>
      </body>
    </html>
  )
}

function MyStudiosMenu({
  pathname,
  userId,
}: {
  pathname: string
  userId: string | null | undefined
}) {
  const navigate = useNavigate()
  const { data: studios, isLoading } = useQuery({
    ...convexQuery(api.studios.listMine, {}),
    enabled: userId !== null && userId !== undefined,
  })

  const isActive = pathname === '/studios' || pathname.startsWith('/studios/')

  return (
    <Menu>
      <MenuTrigger
        className={`hp-nav-link inline-flex items-center gap-1.5 ${isActive ? 'hp-nav-link-active' : ''}`}
      >
        My studios
        <ChevronDownIcon className="h-4 w-4" />
      </MenuTrigger>
      <MenuPopup align="end" className="w-64 border-foreground/12 bg-card">
        <MenuGroup>
          <MenuGroupLabel>My studios</MenuGroupLabel>
          {userId === null || userId === undefined ? (
            <MenuItem
              onClick={() =>
                navigate({
                  to: '/user',
                  search: { redirectTo: undefined },
                })
              }
            >
              Sign in to view your studios
            </MenuItem>
          ) : isLoading ? (
            <MenuItem disabled>Loading studios...</MenuItem>
          ) : studios === undefined || studios.length === 0 ? (
            <MenuItem disabled>No studios yet</MenuItem>
          ) : (
            studios.map((studio) => (
              <MenuItem
                key={studio._id}
                className={pathname === `/studios/${studio._id}` ? 'bg-accent text-accent-foreground' : undefined}
                onClick={() =>
                  navigate({
                    to: '/studios/$studioId',
                    params: { studioId: studio._id },
                  })
                }
              >
                {studio.name}
              </MenuItem>
            ))
          )}
        </MenuGroup>

        <MenuSeparator />
        <MenuItem onClick={() => navigate({ to: '/studios' })}>Manage studios</MenuItem>
      </MenuPopup>
    </Menu>
  )
}
