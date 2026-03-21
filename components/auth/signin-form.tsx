"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Mail } from "@/components/ui/icons";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { InputForm } from "@/components/ui/input-form";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { signInWithOAuth } from "@/lib/auth";
import { magicLinkAction } from "@/actions/auth";
import { magicLinkSchema, type MagicLinkData } from "@/lib/schemas";
import { useCSRFForm } from "@/hooks/use-csrf";
import { TurnstileWidget } from "@/components/turnstile-widget";

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export function SignInForm() {
  const [isMagicLinkPending, startMagicLinkTransition] = useTransition();
  const [isGooglePending, startGoogleTransition] = useTransition();
  const [emailSent, setEmailSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const router = useRouter();
  const { createFormDataWithCSRF, isReady } = useCSRFForm();

  const form = useForm<MagicLinkData>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: {
      email: "",
    },
  });

  async function handleMagicLinkSignIn(data: MagicLinkData) {
    if (!isReady) {
      toast.error("Security verification in progress. Please wait.");
      return;
    }

    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken) {
      toast.error("Please complete the CAPTCHA verification.");
      return;
    }

    startMagicLinkTransition(async () => {
      try {
        // Create form data with CSRF protection
        const formData = createFormDataWithCSRF();
        formData.set("email", data.email);
        if (turnstileToken) formData.set("cf-turnstile-response", turnstileToken);

        // Call server action
        const result = await magicLinkAction(formData);

        if (result.error) {
          toast.error(result.error);
        } else {
          setEmailSent(true);
          const successMessage =
            "message" in result
              ? result.message
              : "Check your email for the magic link!";
          toast.success(
            successMessage || "Check your email for the magic link!"
          );
        }
      } catch (error) {
        console.error("Magic link error:", error);
        toast.error("An unexpected error occurred. Please try again.");
      }
    });
  }

  async function handleGoogleSignIn() {
    startGoogleTransition(async () => {
      const result = await signInWithOAuth("google");

      if (result.error) {
        toast.error(result.error);
      }
      // Note: If successful, the page will redirect automatically
    });
  }

  if (emailSent) {
    return (
      <div className="space-y-4">
        <Alert>
          <Mail className="h-4 w-4" />
          <AlertDescription className="ml-2">
            <strong>Magic link sent!</strong>
            <br />
            Check your email and click the link to sign in. The link will expire
            in 1 hour.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Button
            variant="outline"
            onClick={() => setEmailSent(false)}
            className="w-full"
          >
            Send Another Link
          </Button>

          <Button
            variant="ghost"
            onClick={() => router.push("/")}
            className="w-full"
          >
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-sm max-w-sm">
      {/* OAuth Section */}
      <Button
        variant="outline"
        onClick={handleGoogleSignIn}
        disabled={isGooglePending || isMagicLinkPending || !isReady || !turnstileToken}
        className="w-full"
      >
        {isGooglePending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Redirecting...
          </>
        ) : (
          <>
            <GoogleIcon className="mr-2 h-4 w-4" />
            Continue with Google
          </>
        )}
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Separator className="w-full" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-5 text-muted-foreground">
            Or 
          </span>
        </div>
      </div>

      <TurnstileWidget
        onToken={setTurnstileToken}
        onExpire={() => setTurnstileToken(null)}
      />

      {/* Magic Link Form */}
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleMagicLinkSignIn)}
          className="space-y-4"
        >
          <InputForm
            control={form.control}
            name="email"
            label="Email"
            type="email"
            placeholder="you@example.com"
            required
            disabled={isMagicLinkPending || isGooglePending || !isReady}
          />

          <Button
            type="submit"
            disabled={isMagicLinkPending || isGooglePending || !isReady}
            className="w-full"
          >
            {isMagicLinkPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Continue with Email
              </>
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
