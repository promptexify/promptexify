import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignUpForm } from "@/components/auth/signup-form";
import { setMetadata } from "@/config/seo";

export const metadata = setMetadata({
  title: "Create Account",
  robots: { index: false, follow: false },
});

export default function SignUpPage() {
  return (
    <div className="flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Create Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SignUpForm />

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">
              Already have an account?{" "}
            </span>
            <Link
              href="/signin"
              className="underline underline-offset-4 hover:text-primary font-medium"
            >
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
