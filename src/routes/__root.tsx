import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { UserMenu } from "@/components/user-menu";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <Link to="/" className="font-medium">
          Kosuke Starter
        </Link>
        <div className="flex items-center gap-2">
          <UserMenu />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 flex-col p-4">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
