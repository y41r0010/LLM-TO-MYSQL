import { UserButton } from "@/components/ui/user-button";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { Button } from "@/components/ui/button";
import { Menu, Github } from "lucide-react";

interface HeaderProps {
  toggleSidebar: () => void;
}

export function Header({ toggleSidebar }: HeaderProps) {
  return (
    <div className="sticky top-0 z-40 border-b bg-background/75 backdrop-blur-md">
      <div className="flex h-16 items-center px-4">
        <Button
          variant="ghost"
          className="mr-2 px-2 md:hidden"
          onClick={toggleSidebar}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menú</span>
        </Button>
        <div className="ml-auto flex items-center space-x-4">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <a
              href="https://github.com/imzodev/nextjs-llm-mysql"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Star this project on GitHub"
            >
              <Github className="h-4 w-4" />
              <span>Star</span>
            </a>
          </Button>
          <ModeToggle />
          <UserButton />
        </div>
      </div>
    </div>
  );
}
