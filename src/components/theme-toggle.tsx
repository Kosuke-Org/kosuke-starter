import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle() {
  const { setTheme } = useTheme();
  const toggle = () =>
    setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  );
}
