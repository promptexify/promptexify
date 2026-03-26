import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "@/components/auth/signin-form";
import { setMetadata } from "@/config/seo";

export const metadata = setMetadata({
  title: "Sign In",
  robots: { index: false, follow: false },
});

export default function SignInPage() {
  return (
    <div className="flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Sign In
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SignInForm />

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">
              Don&apos;t have an account?{" "}
            </span>
            <Link
              href="/signup"
              className="underline underline-offset-4 hover:text-primary font-medium"
            >
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
