import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "@/lib/auth-client";

export function UserMenu() {
  const { data, isPending } = useSession();
  const router = useRouter();
  if (isPending) return null;
  if (!data) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/sign-in">Sign in</Link>
        </Button>
        <Button size="sm" asChild>
          <Link to="/sign-up">Sign up</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{data.user.email}</span>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await signOut();
          await router.navigate({ to: "/" });
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
