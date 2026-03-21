import Link from "next/link";
import { LogoSymbol } from "@/components/ui/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-center mx-auto relative min-h-screen">
      <div className="flex flex-col items-center justify-center">
        <div className="mb-3">
          <LogoSymbol />
        </div>
        <main>{children}</main>
        <div className="flex items-center justify-center mt-5 max-w-lg px-4 text-[12px] text-center">
          <p className="text-center text-muted-foreground">
            By continuing, you agree to our{" "}
            <Link href="/terms" className="text-primary">
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-primary">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
